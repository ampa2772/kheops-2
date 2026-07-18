// chat.test.js — Tests d'intégration des routes /api/chat
//
// Mocks : auth (bypass JWT), chatService (capture des appels), modèle User
// (autocomplete des contacts). Le but est de valider la couche HTTP : codes
// de retour, formes de payload, validation des entrées. La logique est testée
// dans chatService.test.js.

const mockIds = {
    principal: '507f1f77bcf86cd799439001',
    officeA: '507f1f77bcf86cd7994390a1',
    officeB: '507f1f77bcf86cd7994390b2',
    officeC: '507f1f77bcf86cd7994390c3',
    foreignOffice: '507f1f77bcf86cd7994390f4',
};

let mockCurrentUserId = mockIds.principal;
let mockPrincipalOfficeUsers = null;

jest.mock('../../middlewares/middleware-auth', () => (req, res, next) => {
    req.user = mockCurrentUserId;
    next();
});

const mockSendMessage = jest.fn();
const mockGetConversation = jest.fn();
const mockGetInbox = jest.fn();
const mockMarkConversationAsRead = jest.fn();
const mockGetTotalUnreadCount = jest.fn();

jest.mock('../../services/chatService', () => ({
    sendMessage: (...a) => mockSendMessage(...a),
    getConversation: (...a) => mockGetConversation(...a),
    getInbox: (...a) => mockGetInbox(...a),
    markConversationAsRead: (...a) => mockMarkConversationAsRead(...a),
    getTotalUnreadCount: (...a) => mockGetTotalUnreadCount(...a),
}));

jest.mock('../../models/App_Users/User', () => ({
    find: () => {
        const data = [
            { _id: 'userB', firstName: 'Bob', lastName: 'Bobson', email: 'b@x' },
            { _id: 'userC', firstName: 'Carol', lastName: 'Carolson', email: 'c@x' },
        ];
        // Chainable : select() → sort() → lean() OU select() → Promise direct
        const chain = {
            select: () => chain,
            sort: () => chain,
            lean: () => Promise.resolve(data),
            then: (resolve) => resolve(data),
        };
        return chain;
    },
}));

// rc38 : les routes résolvent un OfficeUser actif (resolveActiveOfficeUserId →
// UserOfficeUser/OfficeUser) et vérifient l'appartenance du destinataire
// (ensureOfficeUserOwnership, A14). Le modèle User n'est plus utilisé par la route.
jest.mock('../../models/App_Users/modelsLiaisons/UserOfficeUser', () => ({
    find: (query) => {
        const links = String(query && query.user) === mockIds.principal
            ? mockPrincipalOfficeUsers
            : [];
        return { populate: () => ({ lean: async () => links }) };
    },
    findOne: (query) => ({
        lean: async () => {
            if (String(query && query.user) !== mockIds.principal) return null;
            const candidate = String(query && query.officeUser);
            return mockPrincipalOfficeUsers.find(
                link => String(link.officeUser && link.officeUser._id) === candidate,
            ) || null;
        },
    }),
}));
jest.mock('../../models/App_Users/OfficeUser', () => ({
    find: () => ({ select: () => Promise.resolve([
        { _id: mockIds.officeA, prenomOfficeUser: 'Alice', nomOfficeUser: 'Avocate', roleOfficeUser: 'avocat', isAvocat: true, mainOfficeUser: true },
        { _id: mockIds.officeB, prenomOfficeUser: 'Bob', nomOfficeUser: 'Bobson', roleOfficeUser: 'secretaire', isAvocat: false, mainOfficeUser: false },
        { _id: mockIds.officeC, prenomOfficeUser: 'Carol', nomOfficeUser: 'Carolson', roleOfficeUser: 'avocat', isAvocat: true, mainOfficeUser: false },
    ]) }),
    findOne: () => ({ lean: async () => null }),
}));

const mockEnsureOfficeUserOwnership = jest.fn();
jest.mock('../../utils/ownershipHelpers', () => ({
    ensureOfficeUserOwnership: (...args) => mockEnsureOfficeUserOwnership(...args),
    ensureDossierOwnership: jest.fn().mockResolvedValue(true),
    ensureContactOwnership: jest.fn().mockResolvedValue(true),
    ensureDocOwnership: jest.fn().mockResolvedValue({ ok: true }),
}));

const mockMessageFindOne = jest.fn();
jest.mock('../../models/Chat/Message', () => ({
    findOne: (...args) => mockMessageFindOne(...args),
}));

const express = require('express');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const router = require('../chat');

const app = express();
app.use(express.json());
app.use('/api/chat', router);

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
    server.close(done);
});

beforeEach(() => {
    mockSendMessage.mockReset();
    mockGetConversation.mockReset();
    mockGetInbox.mockReset();
    mockMarkConversationAsRead.mockReset();
    mockGetTotalUnreadCount.mockReset();
    mockEnsureOfficeUserOwnership.mockReset();
    mockEnsureOfficeUserOwnership.mockResolvedValue(true);
    mockMessageFindOne.mockReset();
    mockCurrentUserId = mockIds.principal;
    mockPrincipalOfficeUsers = [
        { officeUser: { _id: mockIds.officeA, mainOfficeUser: true, prenomOfficeUser: 'Alice', nomOfficeUser: 'Avocate', roleOfficeUser: 'avocat', isAvocat: true } },
        { officeUser: { _id: mockIds.officeB, mainOfficeUser: false, prenomOfficeUser: 'Bob', nomOfficeUser: 'Bobson', roleOfficeUser: 'secretaire', isAvocat: false } },
    ];
});

function request(method, urlPath, body = null, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, baseUrl);
        const opts = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
        };
        const officeUserId = Object.prototype.hasOwnProperty.call(options, 'officeUserId')
            ? options.officeUserId
            : mockIds.officeA;
        if (officeUserId) opts.headers['X-Office-User-Id'] = officeUserId;
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

describe('GET /api/chat/contacts', () => {
    it('renvoie la liste des utilisateurs hors soi-même', async () => {
        const r = await request('GET', '/api/chat/contacts');
        expect(r.status).toBe(200);
        expect(Array.isArray(r.body.contacts)).toBe(true);
        expect(r.body.contacts).toHaveLength(1);
        expect(r.body.contacts[0]._id).toBe(mockIds.officeB);
        expect(r.body.contacts[0]).toHaveProperty('email');
    });

    it('refuse un profil explicite non lié au compte sans fallback', async () => {
        const r = await request('GET', '/api/chat/contacts', null, {
            officeUserId: mockIds.foreignOffice,
        });
        expect(r.status).toBe(403);
        expect(r.body.error).toBe('ACTIVE_OFFICE_USER_FORBIDDEN');
    });

    it('refuse un identifiant de profil actif explicite mal formé', async () => {
        const r = await request('GET', '/api/chat/contacts', null, {
            officeUserId: 'profil-invalide',
        });
        expect(r.status).toBe(403);
        expect(r.body.error).toBe('ACTIVE_OFFICE_USER_INVALID');
    });

    it('exige le header quand le compte possède plusieurs profils', async () => {
        const r = await request('GET', '/api/chat/contacts', null, { officeUserId: null });
        expect(r.status).toBe(409);
        expect(r.body.error).toBe('ACTIVE_OFFICE_USER_REQUIRED');
    });

    it("tolère l'absence de header pour un compte mono-profil", async () => {
        mockPrincipalOfficeUsers = [mockPrincipalOfficeUsers[0]];
        const r = await request('GET', '/api/chat/contacts', null, { officeUserId: null });
        expect(r.status).toBe(200);
        expect(r.body.currentOfficeUserId).toBe(mockIds.officeA);
        expect(r.body.contacts).toEqual([]);
    });
});

describe('GET /api/chat/conversations', () => {
    it('renvoie la liste hydratée avec contact + lastMessage + unreadCount', async () => {
        mockGetInbox.mockResolvedValue([
            { _id: mockIds.officeB, lastMessage: { text: 'hi', createdAt: new Date() }, unreadCount: 2 },
            { _id: mockIds.officeC, lastMessage: { text: 'yo', createdAt: new Date() }, unreadCount: 0 },
        ]);
        const r = await request('GET', '/api/chat/conversations');
        expect(r.status).toBe(200);
        expect(r.body.conversations).toHaveLength(2);
        expect(r.body.conversations[0].contact.firstName).toBe('Bob');
        expect(r.body.conversations[0].unreadCount).toBe(2);
        expect(r.body.currentUserId).toBe(mockIds.officeA);
    });

    it('renvoie 500 si le service explose', async () => {
        mockGetInbox.mockRejectedValue(new Error('boom'));
        const r = await request('GET', '/api/chat/conversations');
        expect(r.status).toBe(500);
    });
});

describe('GET /api/chat/messages', () => {
    it('400 si contactId manquant', async () => {
        const r = await request('GET', '/api/chat/messages');
        expect(r.status).toBe(400);
    });

    it('renvoie les messages renvoyés par le service', async () => {
        mockGetConversation.mockResolvedValue([{ _id: 'm1', text: 'salut' }]);
        const r = await request('GET', `/api/chat/messages?contactId=${mockIds.officeB}`);
        expect(r.status).toBe(200);
        expect(r.body.messages).toHaveLength(1);
        expect(mockGetConversation).toHaveBeenCalledWith({
            userId: mockIds.officeA, contactId: mockIds.officeB, before: undefined, limit: undefined,
        });
        expect(mockEnsureOfficeUserOwnership).toHaveBeenCalled();
    });

    it('passe le cursor before et le limit au service', async () => {
        mockGetConversation.mockResolvedValue([]);
        await request('GET', `/api/chat/messages?contactId=${mockIds.officeB}&before=2026-01-01&limit=50`);
        expect(mockGetConversation).toHaveBeenCalledWith(expect.objectContaining({
            before: '2026-01-01', limit: '50',
        }));
    });

    it("refuse la lecture d'un interlocuteur hors cabinet", async () => {
        mockEnsureOfficeUserOwnership.mockImplementationOnce(async (_req, res) => {
            res.status(403).json({ error: 'FORBIDDEN' });
            return false;
        });
        const r = await request('GET', `/api/chat/messages?contactId=${mockIds.foreignOffice}`);
        expect(r.status).toBe(403);
        expect(mockGetConversation).not.toHaveBeenCalled();
    });
});

describe('POST /api/chat/messages', () => {
    it('400 si recipientId manquant', async () => {
        const r = await request('POST', '/api/chat/messages', { text: 'salut' });
        expect(r.status).toBe(400);
    });

    it('crée un message texte et renvoie 201', async () => {
        mockSendMessage.mockResolvedValue({ _id: 'm99', text: 'hello' });
        const r = await request('POST', '/api/chat/messages', {
            recipientId: mockIds.officeB, text: 'hello',
        });
        expect(r.status).toBe(201);
        expect(r.body.message._id).toBe('m99');
        expect(mockSendMessage).toHaveBeenCalledWith({
            senderId: mockIds.officeA, recipientId: mockIds.officeB, text: 'hello', attachment: undefined, encryptedPayload: undefined,
        });
    });

    it('attribue séparément deux envois concurrents du même compte aux profils TT et JP', async () => {
        mockSendMessage.mockImplementation(async payload => ({ _id: payload.senderId, ...payload }));
        const [fromA, fromB] = await Promise.all([
            request('POST', '/api/chat/messages', { recipientId: mockIds.officeB, text: 'A vers B' }, { officeUserId: mockIds.officeA }),
            request('POST', '/api/chat/messages', { recipientId: mockIds.officeA, text: 'B vers A' }, { officeUserId: mockIds.officeB }),
        ]);
        expect(fromA.status).toBe(201);
        expect(fromB.status).toBe(201);
        expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({ senderId: mockIds.officeA }));
        expect(mockSendMessage).toHaveBeenCalledWith(expect.objectContaining({ senderId: mockIds.officeB }));
    });

    it('refuse une conversation avec le profil actif lui-même', async () => {
        const r = await request('POST', '/api/chat/messages', {
            recipientId: mockIds.officeA,
            text: 'self',
        });
        expect(r.status).toBe(400);
        expect(r.body.error).toBe('SELF_CONVERSATION_NOT_ALLOWED');
        expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('400 si le service signale un message vide', async () => {
        mockSendMessage.mockRejectedValue(new Error('Message vide : texte ou attachement requis.'));
        const r = await request('POST', '/api/chat/messages', { recipientId: mockIds.officeB });
        expect(r.status).toBe(400);
    });

    it('appelle le hook onMessageCreated si défini', async () => {
        const broadcast = jest.fn();
        router.setOnMessageCreated(broadcast);
        mockSendMessage.mockResolvedValue({ _id: 'm-broadcast', text: 'hi' });
        await request('POST', '/api/chat/messages', { recipientId: mockIds.officeB, text: 'hi' });
        expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ _id: 'm-broadcast' }));
        router.setOnMessageCreated(null);
    });
});

describe('POST /api/chat/conversations/:contactId/read', () => {
    it('marque comme lu et renvoie le nombre', async () => {
        mockMarkConversationAsRead.mockResolvedValue(3);
        const r = await request('POST', `/api/chat/conversations/${mockIds.officeB}/read`);
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ updated: 3 });
        expect(mockEnsureOfficeUserOwnership).toHaveBeenCalled();
    });

    it("refuse de marquer comme lu un interlocuteur hors cabinet", async () => {
        mockEnsureOfficeUserOwnership.mockImplementationOnce(async (_req, res) => {
            res.status(403).json({ error: 'FORBIDDEN' });
            return false;
        });
        const r = await request('POST', `/api/chat/conversations/${mockIds.foreignOffice}/read`);
        expect(r.status).toBe(403);
        expect(mockMarkConversationAsRead).not.toHaveBeenCalled();
    });
});

describe('GET /api/chat/unread-count', () => {
    it('renvoie { count }', async () => {
        mockGetTotalUnreadCount.mockResolvedValue(5);
        const r = await request('GET', '/api/chat/unread-count');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ count: 5 });
    });
});

describe('GET /api/chat/attachments/*', () => {
    it('400 sur tentative de path traversal', async () => {
        const r = await request('GET', '/api/chat/attachments/..%2F..%2Fetc%2Fpasswd');
        expect([400, 404]).toContain(r.status);
    });

    it('404 si fichier inexistant', async () => {
        const r = await request('GET', '/api/chat/attachments/fake/path/nope.bin');
        expect(r.status).toBe(404);
    });

    it("borne le téléchargement au profil interne actif réellement participant", async () => {
        const userDataDir = process.env.APPDATA
            || (process.env.HOME ? path.join(process.env.HOME, '.kheops2') : null)
            || path.join(os.homedir(), 'Kheops2');
        const uploadsRoot = process.env.APPDATA
            ? path.join(userDataDir, 'Kheops2', 'chat-attachments')
            : path.join(userDataDir, 'chat-attachments');
        const storageKey = `identity-tests/${Date.now()}-attachment.txt`;
        const absolutePath = path.join(uploadsRoot, ...storageKey.split('/'));
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, 'profil A uniquement');

        mockMessageFindOne.mockReturnValue({
            select: () => ({
                lean: async () => ({ sender: mockIds.officeA, recipient: mockIds.officeC }),
            }),
        });

        try {
            const denied = await request(
                'GET',
                `/api/chat/attachments/${storageKey}`,
                null,
                { officeUserId: mockIds.officeB },
            );
            expect(denied.status).toBe(403);

            const allowed = await request(
                'GET',
                `/api/chat/attachments/${storageKey}`,
                null,
                { officeUserId: mockIds.officeA },
            );
            expect(allowed.status).toBe(200);
            expect(allowed.body).toBe('profil A uniquement');
        } finally {
            fs.rmSync(absolutePath, { force: true });
        }
    });
});
