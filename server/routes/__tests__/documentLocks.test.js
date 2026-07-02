// documentLocks.test.js — Tests d'intégration des routes /api/document-locks
//
// On mocke uniquement le middleware auth (pour bypass JWT) et le modèle User
// (pour ne pas dépendre de Mongo). Le service de verrou est utilisé tel quel
// — c'est délibéré : on teste le couple route + service ensemble.

// On capture l'userId courant via une variable mutable, pour pouvoir simuler
// des appels venant d'utilisateurs différents au sein d'un même test.
let mockCurrentUserId = 'userA';

jest.mock('../../middlewares/middleware-auth', () => (req, res, next) => {
    req.user = mockCurrentUserId;
    next();
});

jest.mock('../../models/App_Users/User', () => ({
    findById: jest.fn().mockImplementation((id) => ({
        select: () => Promise.resolve({
            firstName: id === 'userA' ? 'Alice' : 'Bob',
            lastName: id === 'userA' ? 'Avocate' : 'Bobson',
            email: `${id}@example.com`,
        }),
    })),
}));

// rc38 (A1) : le contrôle d'appartenance des documents est désormais central.
// Pour les tests d'intégration route+service (sans Mongo) on simule un cabinet
// dont les documents "possédés" sont DOC_A et DOC_B (voir plus bas). DOC_C
// représente un document d'un AUTRE cabinet (jamais dans l'ensemble possédé).
const DOC_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const DOC_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const DOC_C = 'cccccccccccccccccccccccc';

// ensureDocOwnership (utilisé par /acquire) : happy path — le doc appartient au
// cabinet. Les tests d'isolation dédiés vivent dans les tests unitaires ciblés.
jest.mock('../../utils/ownershipHelpers', () => ({
    ensureDocOwnership: jest.fn().mockResolvedValue({ ok: true }),
    ensureDossierOwnership: jest.fn(),
    ensureContactOwnership: jest.fn(),
    ensureOfficeUserOwnership: jest.fn(),
}));

jest.mock('../../services/cabinetAccess', () => ({
    getAccessibleUserIds: jest.fn().mockResolvedValue(['userA']),
}));
jest.mock('../../models/Folder/modelsLiaisons/UserDossier', () => ({
    find: () => ({ select: () => ({ lean: async () => [{ dossier: 'DOSSIER1' }] }) }),
}));
// Le cabinet possède DOC_A et DOC_B (embarqués dans DOSSIER1). DOC_C n'y est pas.
jest.mock('../../models/Folder/Dossier', () => ({
    find: () => ({
        select: () => ({
            lean: async () => [{
                dossier: {
                    documents: [
                        { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa' },
                        { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb' },
                    ],
                },
            }],
        }),
    }),
}));

const express = require('express');
const http = require('http');
const router = require('../documentLocks');
const lockService = require('../../services/documentLockService');

const app = express();
app.use(express.json());
app.use('/api/document-locks', router);

let server;
let baseUrl;

beforeAll((done) => {
    server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://localhost:${port}`;
        done();
    });
});

afterAll((done) => {
    lockService.stopCleanup();
    server.close(done);
});

beforeEach(() => {
    lockService._resetForTesting();
    mockCurrentUserId = 'userA';
});

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, baseUrl);
        const opts = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        };
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

describe('POST /api/document-locks/:docId/acquire', () => {
    it('renvoie 200 + granted:true si pas de verrou', async () => {
        const r = await request('POST', '/api/document-locks/doc1/acquire');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ granted: true });
    });

    it('renvoie 409 + lockedBy si déjà verrouillé par un autre user', async () => {
        await request('POST', '/api/document-locks/doc1/acquire');
        mockCurrentUserId = 'userB';
        const r = await request('POST', '/api/document-locks/doc1/acquire');
        expect(r.status).toBe(409);
        expect(r.body.granted).toBe(false);
        expect(r.body.lockedBy.userId).toBe('userA');
        expect(r.body.lockedBy.displayName).toMatch(/Alice/);
    });

    it('renvoie 200 si même user (idempotent)', async () => {
        await request('POST', '/api/document-locks/doc1/acquire');
        const r = await request('POST', '/api/document-locks/doc1/acquire');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ granted: true });
    });
});

describe('POST /api/document-locks/:docId/heartbeat', () => {
    it('renvoie 200 + ok:true si propriétaire', async () => {
        await request('POST', '/api/document-locks/doc1/acquire');
        const r = await request('POST', '/api/document-locks/doc1/heartbeat');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ ok: true });
    });

    it('renvoie 410 si pas de verrou', async () => {
        const r = await request('POST', '/api/document-locks/doc1/heartbeat');
        expect(r.status).toBe(410);
        expect(r.body.reason).toBe('no-lock');
    });

    it('renvoie 403 si pas le propriétaire', async () => {
        await request('POST', '/api/document-locks/doc1/acquire');
        mockCurrentUserId = 'userB';
        const r = await request('POST', '/api/document-locks/doc1/heartbeat');
        expect(r.status).toBe(403);
        expect(r.body.reason).toBe('wrong-owner');
    });
});

describe('POST /api/document-locks/:docId/release', () => {
    it('libère le verrou si propriétaire', async () => {
        await request('POST', '/api/document-locks/doc1/acquire');
        const r = await request('POST', '/api/document-locks/doc1/release');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ released: true });
    });

    it('refuse de libérer le verrou d\'un autre user', async () => {
        await request('POST', '/api/document-locks/doc1/acquire');
        mockCurrentUserId = 'userB';
        const r = await request('POST', '/api/document-locks/doc1/release');
        expect(r.body.released).toBe(false);
        expect(r.body.reason).toBe('wrong-owner');
    });
});

describe('GET /api/document-locks', () => {
    // rc38 (A1) : la liste sans docIds NE DOIT PLUS énumérer tous les verrous
    // (l'ancien comportement fuitait displayName/email des détenteurs de tous
    // les cabinets). On renvoie désormais une liste vide.
    it('🔒 sans paramètre docIds → liste vide (pas d\'énumération globale)', async () => {
        await request('POST', `/api/document-locks/${DOC_A}/acquire`);
        mockCurrentUserId = 'userB';
        await request('POST', `/api/document-locks/${DOC_B}/acquire`);

        const r = await request('GET', '/api/document-locks');
        expect(r.status).toBe(200);
        expect(r.body.locks).toEqual([]);
        expect(r.body.currentUserId).toBe('userB');
    });

    it('filtre sur les docIds du cabinet passés en query string', async () => {
        await request('POST', `/api/document-locks/${DOC_A}/acquire`);
        await request('POST', `/api/document-locks/${DOC_B}/acquire`);

        const r = await request('GET', `/api/document-locks?docIds=${DOC_A},${DOC_B}`);
        expect(r.status).toBe(200);
        expect(r.body.locks).toHaveLength(2);
        const ids = r.body.locks.map(l => l.docId).sort();
        expect(ids).toEqual([DOC_A, DOC_B]);
    });

    it('🔒 filtre les docIds d\'un AUTRE cabinet (isolation)', async () => {
        // On verrouille un doc possédé (DOC_A) et un doc d'un autre cabinet (DOC_C).
        await request('POST', `/api/document-locks/${DOC_A}/acquire`);
        await request('POST', `/api/document-locks/${DOC_C}/acquire`);

        const r = await request('GET', `/api/document-locks?docIds=${DOC_A},${DOC_C}`);
        expect(r.status).toBe(200);
        // Seul DOC_A (du cabinet) remonte ; DOC_C est filtré → pas de fuite d'identité.
        expect(r.body.locks.map(l => l.docId)).toEqual([DOC_A]);
    });

    it('renvoie une liste vide si aucun docId possédé ne matche', async () => {
        const r = await request('GET', `/api/document-locks?docIds=${DOC_C}`);
        expect(r.body.locks).toEqual([]);
    });
});

describe('Scénario end-to-end : Maître A et Maître B sur même doc', () => {
    it('A verrouille → B refusé → A libère → B verrouille avec succès', async () => {
        // Maître A acquiert
        mockCurrentUserId = 'userA';
        let r = await request('POST', '/api/document-locks/conclusions.docx/acquire');
        expect(r.status).toBe(200);
        expect(r.body.granted).toBe(true);

        // Maître B tente, refusé avec info sur qui détient le verrou
        mockCurrentUserId = 'userB';
        r = await request('POST', '/api/document-locks/conclusions.docx/acquire');
        expect(r.status).toBe(409);
        expect(r.body.lockedBy.userId).toBe('userA');
        expect(r.body.lockedBy.displayName).toMatch(/Alice/);

        // Maître A libère
        mockCurrentUserId = 'userA';
        r = await request('POST', '/api/document-locks/conclusions.docx/release');
        expect(r.body.released).toBe(true);

        // Maître B retente, accepté
        mockCurrentUserId = 'userB';
        r = await request('POST', '/api/document-locks/conclusions.docx/acquire');
        expect(r.status).toBe(200);
        expect(r.body.granted).toBe(true);
    });
});
