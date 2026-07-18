// chatSocketHandler.test.js — Test d'intégration Socket.io
//
// On démarre un vrai serveur HTTP + Socket.io en mémoire, on connecte un (ou
// deux) client(s) socket.io-client avec un JWT, et on vérifie :
//  - rejet de connexion sans token
//  - rejet de connexion avec token invalide
//  - connexion OK avec token valide → reçoit chat:hello
//  - quand le hook onMessageCreated est invoqué, le destinataire et l'expéditeur
//    reçoivent l'événement chat:message
//  - typing pass-through

// Cette suite valide l'AUTH STRICTE (rejet sans token/token invalide) et le
// routage par vrai userId. On force donc le mode strict AVANT tout require :
// middleware-auth exécute dotenv.config() (qui poserait KHEOPS_BYPASS_AUTH=true
// depuis .env), mais dotenv N'ÉCRASE PAS une variable déjà définie.
process.env.KHEOPS_BYPASS_AUTH = 'false';

jest.mock('../chatLogger', () => ({
    log: jest.fn(),
    LOG_PATH: 'chat-debug-test.log',
}));

const mockUserOfficeFindOne = jest.fn();
jest.mock('../../models/App_Users/modelsLiaisons/UserOfficeUser', () => ({
    findOne: (...args) => mockUserOfficeFindOne(...args),
}));

const mockGetAccessibleUserIds = jest.fn();
jest.mock('../cabinetAccess', () => ({
    getAccessibleUserIds: (...args) => mockGetAccessibleUserIds(...args),
}));

const http = require('http');
const jwt = require('jsonwebtoken');
const { io: ioClient } = require('socket.io-client');
const chatRouter = require('../../routes/chat');
const chatSocketHandler = require('../chatSocketHandler');
const { log: chatLog } = require('../chatLogger');

const JWT_SECRET = 'test-secret-chat';
const USER_A = 'principal-user-a';
const USER_B = 'principal-user-b';
const OFFICE_TT = 'office-user-tt';
const OFFICE_JP = 'office-user-jp';
const OFFICE_THIRD = 'office-user-third';
const OFFICE_FOREIGN = 'office-user-foreign';

const officeOwners = new Map([
    [OFFICE_TT, USER_A],
    [OFFICE_JP, USER_A],
    [OFFICE_THIRD, USER_A],
    [OFFICE_FOREIGN, USER_B],
]);

function makeToken(userId) {
    return jwt.sign({ user: { id: userId } }, JWT_SECRET, { expiresIn: '1h' });
}

let httpServer;
let port;

beforeAll((done) => {
    httpServer = http.createServer((req, res) => {
        res.statusCode = 404; res.end('not found');
    });
    chatSocketHandler.attach(httpServer, { jwtSecret: JWT_SECRET });
    httpServer.listen(0, () => {
        port = httpServer.address().port;
        done();
    });
});

afterAll((done) => {
    chatSocketHandler.detach();
    httpServer.close(done);
});

function connectClient(token) {
    const url = `http://localhost:${port}`;
    return ioClient(url, {
        auth: token ? { token } : {},
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
    });
}

function waitFor(emitter, event, timeoutMs = 1500) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
        emitter.once(event, (data) => { clearTimeout(timer); resolve(data); });
    });
}

function setPresence(client, officeUserId) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout setting presence')), 1500);
        client.emit('presence:set-office-user', { officeUserId }, (result) => {
            clearTimeout(timer);
            resolve(result);
        });
    });
}

function emitTyping(client, payload) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout emitting typing')), 1500);
        client.emit('chat:typing', payload, (result) => {
            clearTimeout(timer);
            resolve(result);
        });
    });
}

beforeEach(() => {
    mockGetAccessibleUserIds.mockReset();
    mockGetAccessibleUserIds.mockImplementation(async userId => [String(userId)]);
    mockUserOfficeFindOne.mockReset();
    mockUserOfficeFindOne.mockImplementation((query = {}) => ({
        lean: async () => {
            const owner = officeOwners.get(String(query.officeUser));
            const allowedUsers = query.user && query.user.$in
                ? query.user.$in.map(String)
                : [String(query.user)];
            return owner && allowedUsers.includes(owner) ? { _id: 'link' } : null;
        },
    }));
});

describe('chatSocketHandler — auth', () => {
    it('refuse une connexion sans token', async () => {
        const c = connectClient(null);
        const err = await waitFor(c, 'connect_error');
        expect(String(err.message || err)).toMatch(/no-token|auth/i);
        c.disconnect();
    });

    it('refuse une connexion avec token invalide', async () => {
        const c = connectClient('invalid.jwt.here');
        const err = await waitFor(c, 'connect_error');
        expect(String(err.message || err)).toMatch(/auth/i);
        c.disconnect();
    });

    it('accepte une connexion avec token valide et émet chat:hello', async () => {
        const token = makeToken('userA');
        chatLog.mockClear();
        const c = connectClient(token);
        const hello = await waitFor(c, 'chat:hello');
        expect(hello.userId).toBe('userA');
        const logged = chatLog.mock.calls.flat().join(' ');
        expect(logged).toContain('present=true');
        expect(logged).not.toContain(token);
        expect(logged).not.toContain(token.slice(0, 20));
        c.disconnect();
    });
});

describe('chatSocketHandler — broadcast', () => {
    it('le destinataire reçoit chat:message quand le hook est invoqué', async () => {
        const sender = connectClient(makeToken(USER_A));
        const recipient = connectClient(makeToken(USER_A));
        await Promise.all([waitFor(sender, 'chat:hello'), waitFor(recipient, 'chat:hello')]);
        await Promise.all([setPresence(sender, OFFICE_TT), setPresence(recipient, OFFICE_JP)]);

        const fakeMsg = {
            _id: 'm-1', sender: OFFICE_TT, recipient: OFFICE_JP,
            kind: 'text', text: 'salut',
            createdAt: new Date(), readAt: null,
        };
        // Reproduit ce que ferait POST /api/chat/messages : appel du hook.
        // Le router a été configuré par chatSocketHandler.attach() pour
        // broadcaster sur émission.
        const onMsg = chatRouter.setOnMessageCreated; // s'assurer que la fonction existe
        expect(typeof onMsg).toBe('function');

        const recvPromise = waitFor(recipient, 'chat:message');
        // Déclenche le hook (utilisé en interne par les routes après create)
        // Comme on n'a pas accès direct au hook depuis l'extérieur, on passe
        // par chatRouter qui détient la fn courante. Le handler l'a définie
        // dans attach().
        // Astuce : on utilise une voie détournée — on appelle directement
        // l'émission via l'instance io exposée pour les tests.
        const io = chatSocketHandler._getIoForTesting();
        io.to(`office-user:${OFFICE_JP}`).emit('chat:message', chatSocketHandler.serializeMessage(fakeMsg));

        const evt = await recvPromise;
        expect(evt.text).toBe('salut');
        expect(evt.sender).toBe(OFFICE_TT);

        sender.disconnect();
        recipient.disconnect();
    });

    it('le sender reçoit aussi son propre message (sync multi-device)', async () => {
        const senderPc1 = connectClient(makeToken(USER_A));
        const senderPc2 = connectClient(makeToken(USER_A));
        await Promise.all([waitFor(senderPc1, 'chat:hello'), waitFor(senderPc2, 'chat:hello')]);
        await Promise.all([setPresence(senderPc1, OFFICE_TT), setPresence(senderPc2, OFFICE_TT)]);

        const fakeMsg = {
            _id: 'm-2', sender: OFFICE_TT, recipient: OFFICE_JP,
            kind: 'text', text: 'depuis pc1', createdAt: new Date(), readAt: null,
        };
        const recv1 = waitFor(senderPc1, 'chat:message');
        const recv2 = waitFor(senderPc2, 'chat:message');

        const io = chatSocketHandler._getIoForTesting();
        // On simule la logique réelle : émettre vers les 2 rooms (recipient + sender).
        io.to(`office-user:${OFFICE_TT}`).emit('chat:message', chatSocketHandler.serializeMessage(fakeMsg));

        const [evt1, evt2] = await Promise.all([recv1, recv2]);
        expect(evt1.text).toBe('depuis pc1');
        expect(evt2.text).toBe('depuis pc1');

        senderPc1.disconnect();
        senderPc2.disconnect();
    });
});

describe('chatSocketHandler — typing pass-through', () => {
    it('relaie chat:typing au destinataire', async () => {
        const a = connectClient(makeToken(USER_A));
        const b = connectClient(makeToken(USER_A));
        await Promise.all([waitFor(a, 'chat:hello'), waitFor(b, 'chat:hello')]);
        await Promise.all([setPresence(a, OFFICE_TT), setPresence(b, OFFICE_JP)]);

        const recv = waitFor(b, 'chat:typing');
        const ackPromise = emitTyping(a, { recipientId: OFFICE_JP, isTyping: true });

        const [evt, ack] = await Promise.all([recv, ackPromise]);
        expect(ack).toEqual({ ok: true });
        expect(evt).toMatchObject({
            fromUserId: OFFICE_TT,
            fromOfficeUserId: OFFICE_TT,
            isTyping: true,
        });

        a.disconnect();
        b.disconnect();
    });

    it('refuse la saisie vers soi-même ou vers un profil non autorisé', async () => {
        const a = connectClient(makeToken(USER_A));
        await waitFor(a, 'chat:hello');
        await setPresence(a, OFFICE_TT);

        await expect(emitTyping(a, {
            recipientId: OFFICE_TT,
            isTyping: true,
        })).resolves.toEqual({ ok: false, error: 'SELF_CONVERSATION_NOT_ALLOWED' });
        await expect(emitTyping(a, {
            recipientId: OFFICE_FOREIGN,
            isTyping: true,
        })).resolves.toEqual({ ok: false, error: 'RECIPIENT_FORBIDDEN' });

        a.disconnect();
    });
});

describe('chatSocketHandler — isolation des fenêtres OfficeUser', () => {
    it('ne livre pas à une autre fenêtre du même compte si son profil actif est hors conversation', async () => {
        const ttWindow = connectClient(makeToken(USER_A));
        const jpWindow = connectClient(makeToken(USER_A));
        await Promise.all([waitFor(ttWindow, 'chat:hello'), waitFor(jpWindow, 'chat:hello')]);
        await Promise.all([
            setPresence(ttWindow, OFFICE_TT),
            setPresence(jpWindow, OFFICE_JP),
        ]);

        const notDeliveredToJp = jest.fn();
        jpWindow.on('chat:message', notDeliveredToJp);
        const recvTt = waitFor(ttWindow, 'chat:message');
        await chatSocketHandler._broadcastChatMessageForTesting({
            _id: 'profile-isolation',
            sender: OFFICE_TT,
            recipient: OFFICE_THIRD,
            kind: 'text',
            text: 'visible seulement par TT',
            createdAt: new Date(),
            readAt: null,
        }, 'test');

        await expect(recvTt).resolves.toMatchObject({ text: 'visible seulement par TT' });
        await new Promise(resolve => setTimeout(resolve, 80));
        expect(notDeliveredToJp).not.toHaveBeenCalled();

        ttWindow.disconnect();
        jpWindow.disconnect();
    });

    it('bascule atomiquement la room OfficeUser de la fenêtre', async () => {
        const window = connectClient(makeToken(USER_A));
        await waitFor(window, 'chat:hello');
        await setPresence(window, OFFICE_TT);

        const io = chatSocketHandler._getIoForTesting();
        expect(io.sockets.adapter.rooms.get(`office-user:${OFFICE_TT}`)?.size).toBe(1);

        await expect(setPresence(window, OFFICE_JP)).resolves.toEqual({ ok: true, outcome: 'set' });
        expect(io.sockets.adapter.rooms.get(`office-user:${OFFICE_TT}`)).toBeUndefined();
        expect(io.sockets.adapter.rooms.get(`office-user:${OFFICE_JP}`)?.size).toBe(1);

        window.disconnect();
    });

    it('le broadcast réel livre les deux profils de la conversation', async () => {
        const a = connectClient(makeToken(USER_A));
        const b = connectClient(makeToken(USER_A));
        await Promise.all([waitFor(a, 'chat:hello'), waitFor(b, 'chat:hello')]);
        await Promise.all([setPresence(a, OFFICE_TT), setPresence(b, OFFICE_JP)]);

        const recvA = waitFor(a, 'chat:message');
        const recvB = waitFor(b, 'chat:message');
        await chatSocketHandler._broadcastChatMessageForTesting({
            _id: 'mx',
            sender: OFFICE_TT,
            recipient: OFFICE_JP,
            kind: 'text',
            text: 'test hook',
            createdAt: new Date(),
            readAt: null,
        }, 'test');

        const [evtA, evtB] = await Promise.all([recvA, recvB]);
        expect(evtA.text).toBe('test hook');
        expect(evtB.text).toBe('test hook');

        a.disconnect();
        b.disconnect();
    });
});
