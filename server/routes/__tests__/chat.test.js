// chat.test.js — Tests d'intégration des routes /api/chat
//
// Mocks : auth (bypass JWT), chatService (capture des appels), modèle User
// (autocomplete des contacts). Le but est de valider la couche HTTP : codes
// de retour, formes de payload, validation des entrées. La logique est testée
// dans chatService.test.js.

let mockCurrentUserId = 'userA';

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
// On mocke l'OfficeUser principal avec le MÊME _id que l'utilisateur courant :
// ainsi le service reçoit userId = 'userA' et les assertions existantes tiennent.
jest.mock('../../models/App_Users/modelsLiaisons/UserOfficeUser', () => ({
    find: (query) => {
        const uid = query && query.user;
        const links = [
            { officeUser: { _id: uid, mainOfficeUser: true, prenomOfficeUser: 'Alice', nomOfficeUser: 'Avocate', roleOfficeUser: 'avocat', isAvocat: true } },
            { officeUser: { _id: 'userB', mainOfficeUser: false, prenomOfficeUser: 'Bob', nomOfficeUser: 'Bobson', roleOfficeUser: 'secretaire', isAvocat: false } },
        ];
        return { populate: () => ({ lean: async () => links }) };
    },
    findOne: () => ({ lean: async () => null }),
}));
jest.mock('../../models/App_Users/OfficeUser', () => ({
    find: () => ({ select: () => Promise.resolve([
        { _id: 'userB', prenomOfficeUser: 'Bob', nomOfficeUser: 'Bobson', roleOfficeUser: 'secretaire', isAvocat: false, mainOfficeUser: false },
        { _id: 'userC', prenomOfficeUser: 'Carol', nomOfficeUser: 'Carolson', roleOfficeUser: 'avocat', isAvocat: true, mainOfficeUser: false },
    ]) }),
    findOne: () => ({ lean: async () => null }),
}));
jest.mock('../../utils/ownershipHelpers', () => ({
    ensureOfficeUserOwnership: jest.fn().mockResolvedValue(true),
    ensureDossierOwnership: jest.fn().mockResolvedValue(true),
    ensureContactOwnership: jest.fn().mockResolvedValue(true),
    ensureDocOwnership: jest.fn().mockResolvedValue({ ok: true }),
}));

const express = require('express');
const http = require('http');
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
    mockCurrentUserId = 'userA';
});

function request(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, baseUrl);
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

describe('GET /api/chat/contacts', () => {
    it('renvoie la liste des utilisateurs hors soi-même', async () => {
        const r = await request('GET', '/api/chat/contacts');
        expect(r.status).toBe(200);
        expect(Array.isArray(r.body.contacts)).toBe(true);
        expect(r.body.contacts).toHaveLength(2);
        expect(r.body.contacts[0]).toHaveProperty('email');
    });
});

describe('GET /api/chat/conversations', () => {
    it('renvoie la liste hydratée avec contact + lastMessage + unreadCount', async () => {
        mockGetInbox.mockResolvedValue([
            { _id: 'userB', lastMessage: { text: 'hi', createdAt: new Date() }, unreadCount: 2 },
            { _id: 'userC', lastMessage: { text: 'yo', createdAt: new Date() }, unreadCount: 0 },
        ]);
        const r = await request('GET', '/api/chat/conversations');
        expect(r.status).toBe(200);
        expect(r.body.conversations).toHaveLength(2);
        expect(r.body.conversations[0].contact.firstName).toBe('Bob');
        expect(r.body.conversations[0].unreadCount).toBe(2);
        expect(r.body.currentUserId).toBe('userA');
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
        const r = await request('GET', '/api/chat/messages?contactId=userB');
        expect(r.status).toBe(200);
        expect(r.body.messages).toHaveLength(1);
        expect(mockGetConversation).toHaveBeenCalledWith({
            userId: 'userA', contactId: 'userB', before: undefined, limit: undefined,
        });
    });

    it('passe le cursor before et le limit au service', async () => {
        mockGetConversation.mockResolvedValue([]);
        await request('GET', '/api/chat/messages?contactId=userB&before=2026-01-01&limit=50');
        expect(mockGetConversation).toHaveBeenCalledWith(expect.objectContaining({
            before: '2026-01-01', limit: '50',
        }));
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
            recipientId: 'userB', text: 'hello',
        });
        expect(r.status).toBe(201);
        expect(r.body.message._id).toBe('m99');
        expect(mockSendMessage).toHaveBeenCalledWith({
            senderId: 'userA', recipientId: 'userB', text: 'hello', attachment: undefined, encryptedPayload: undefined,
        });
    });

    it('400 si le service signale un message vide', async () => {
        mockSendMessage.mockRejectedValue(new Error('Message vide : texte ou attachement requis.'));
        const r = await request('POST', '/api/chat/messages', { recipientId: 'userB' });
        expect(r.status).toBe(400);
    });

    it('appelle le hook onMessageCreated si défini', async () => {
        const broadcast = jest.fn();
        router.setOnMessageCreated(broadcast);
        mockSendMessage.mockResolvedValue({ _id: 'm-broadcast', text: 'hi' });
        await request('POST', '/api/chat/messages', { recipientId: 'userB', text: 'hi' });
        expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ _id: 'm-broadcast' }));
        router.setOnMessageCreated(null);
    });
});

describe('POST /api/chat/conversations/:contactId/read', () => {
    it('marque comme lu et renvoie le nombre', async () => {
        mockMarkConversationAsRead.mockResolvedValue(3);
        const r = await request('POST', '/api/chat/conversations/userB/read');
        expect(r.status).toBe(200);
        expect(r.body).toEqual({ updated: 3 });
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
});
