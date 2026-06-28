// chatService.test.js — Tests unitaires du service chat.
//
// On mocke le modèle Message (pas de Mongo réel). L'objectif est de valider
// la logique pure : routage des kinds, validation, queries construites,
// cas d'erreur. Les comportements Mongo eux-mêmes sont assumés OK.

const mockMessageCreate = jest.fn();
const mockMessageFind = jest.fn();
const mockMessageAggregate = jest.fn();
const mockMessageUpdateMany = jest.fn();
const mockMessageCountDocs = jest.fn();

jest.mock('../../models/Chat/Message', () => {
    const mockModel = {
        create: (...args) => mockMessageCreate(...args),
        find: (...args) => mockMessageFind(...args),
        aggregate: (...args) => mockMessageAggregate(...args),
        updateMany: (...args) => mockMessageUpdateMany(...args),
        countDocuments: (...args) => mockMessageCountDocs(...args),
    };
    return mockModel;
});

const chatService = require('../chatService');

beforeEach(() => {
    mockMessageCreate.mockReset();
    mockMessageFind.mockReset();
    mockMessageAggregate.mockReset();
    mockMessageUpdateMany.mockReset();
    mockMessageCountDocs.mockReset();
});

describe('sendMessage', () => {
    it('crée un message texte si seul `text` est fourni', async () => {
        mockMessageCreate.mockResolvedValue({ _id: 'm1', kind: 'text' });
        const r = await chatService.sendMessage({
            senderId: 'u1', recipientId: 'u2', text: 'Salut',
        });
        expect(r).toMatchObject({ kind: 'text' });
        expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'text', text: 'Salut', attachment: null,
        }));
    });

    it('crée un message voice si l\'attachement est de type audio/*', async () => {
        mockMessageCreate.mockResolvedValue({ _id: 'm2', kind: 'voice' });
        await chatService.sendMessage({
            senderId: 'u1', recipientId: 'u2',
            attachment: { storageKey: 'k1', fileName: 'a.webm', mimeType: 'audio/webm', sizeBytes: 1234, durationSec: 5 },
        });
        expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'voice',
        }));
    });

    it('crée un message file si l\'attachement n\'est pas audio', async () => {
        mockMessageCreate.mockResolvedValue({ _id: 'm3', kind: 'file' });
        await chatService.sendMessage({
            senderId: 'u1', recipientId: 'u2',
            attachment: { storageKey: 'k2', fileName: 'doc.pdf', mimeType: 'application/pdf', sizeBytes: 99 },
        });
        expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'file' }));
    });

    it('crée un message mixed si texte ET attachement', async () => {
        mockMessageCreate.mockResolvedValue({ _id: 'm4', kind: 'mixed' });
        await chatService.sendMessage({
            senderId: 'u1', recipientId: 'u2', text: 'Voilà le doc',
            attachment: { storageKey: 'k3', fileName: 'x.pdf', mimeType: 'application/pdf' },
        });
        expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'mixed' }));
    });

    it('rejette si ni texte ni attachement', async () => {
        await expect(chatService.sendMessage({
            senderId: 'u1', recipientId: 'u2',
        })).rejects.toThrow(/vide/i);
    });

    it('rejette si texte vide ET pas d\'attachement', async () => {
        await expect(chatService.sendMessage({
            senderId: 'u1', recipientId: 'u2', text: '   ',
        })).rejects.toThrow(/vide/i);
    });

    it('rejette sans senderId', async () => {
        await expect(chatService.sendMessage({
            recipientId: 'u2', text: 'salut',
        })).rejects.toThrow(/senderId/);
    });

    it('rejette sans recipientId', async () => {
        await expect(chatService.sendMessage({
            senderId: 'u1', text: 'salut',
        })).rejects.toThrow(/recipientId/);
    });

    it('trim le texte avant stockage', async () => {
        mockMessageCreate.mockResolvedValue({});
        await chatService.sendMessage({
            senderId: 'u1', recipientId: 'u2', text: '   bonjour   ',
        });
        expect(mockMessageCreate).toHaveBeenCalledWith(expect.objectContaining({
            text: 'bonjour',
        }));
    });
});

describe('getConversation', () => {
    function chainable(returned) {
        const obj = {
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue(returned),
        };
        return obj;
    }

    it('construit une query bidirectionnelle entre les 2 users', async () => {
        const chain = chainable([{ _id: 'm1' }]);
        mockMessageFind.mockReturnValue(chain);
        await chatService.getConversation({ userId: 'A', contactId: 'B' });
        const call = mockMessageFind.mock.calls[0][0];
        expect(call.$or).toHaveLength(2);
        expect(call.$or).toEqual(expect.arrayContaining([
            { sender: 'A', recipient: 'B' },
            { sender: 'B', recipient: 'A' },
        ]));
        expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
        expect(chain.limit).toHaveBeenCalledWith(30);
    });

    it('limite max 100 même si demandé plus haut', async () => {
        const chain = chainable([]);
        mockMessageFind.mockReturnValue(chain);
        await chatService.getConversation({ userId: 'A', contactId: 'B', limit: 999 });
        expect(chain.limit).toHaveBeenCalledWith(100);
    });

    it('limite par défaut à 30 si 0 ou négatif fourni', async () => {
        const chain = chainable([]);
        mockMessageFind.mockReturnValue(chain);
        await chatService.getConversation({ userId: 'A', contactId: 'B', limit: 0 });
        expect(chain.limit).toHaveBeenCalledWith(30);
    });

    it('applique le cursor `before` si fourni', async () => {
        const chain = chainable([]);
        mockMessageFind.mockReturnValue(chain);
        const cursor = '2026-04-01T00:00:00.000Z';
        await chatService.getConversation({ userId: 'A', contactId: 'B', before: cursor });
        const call = mockMessageFind.mock.calls[0][0];
        expect(call.createdAt).toEqual({ $lt: new Date(cursor) });
    });
});

describe('markConversationAsRead', () => {
    it('met readAt sur tous les messages reçus de `contactId` non lus', async () => {
        mockMessageUpdateMany.mockResolvedValue({ modifiedCount: 3 });
        const n = await chatService.markConversationAsRead({ userId: 'A', contactId: 'B' });
        expect(n).toBe(3);
        const call = mockMessageUpdateMany.mock.calls[0];
        expect(call[0]).toMatchObject({
            sender: 'B', recipient: 'A', readAt: null,
        });
        expect(call[1]).toEqual({ $set: { readAt: expect.any(Date) } });
    });

    it('renvoie 0 si aucun match', async () => {
        mockMessageUpdateMany.mockResolvedValue({ modifiedCount: 0 });
        const n = await chatService.markConversationAsRead({ userId: 'A', contactId: 'B' });
        expect(n).toBe(0);
    });
});

describe('getTotalUnreadCount', () => {
    it('compte les messages reçus non lus', async () => {
        mockMessageCountDocs.mockResolvedValue(7);
        const n = await chatService.getTotalUnreadCount({ userId: 'A' });
        expect(n).toBe(7);
        expect(mockMessageCountDocs).toHaveBeenCalledWith({
            recipient: 'A', readAt: null, deletedAt: null,
        });
    });
});

describe('getInbox', () => {
    it('retourne le résultat de l\'aggrégation Mongo', async () => {
        mockMessageAggregate.mockResolvedValue([
            { _id: 'B', lastMessage: { text: 'hi' }, unreadCount: 2 },
        ]);
        const r = await chatService.getInbox({ userId: '507f1f77bcf86cd799439011' });
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ unreadCount: 2 });
        expect(mockMessageAggregate).toHaveBeenCalled();
    });

    it('renvoie [] si userId invalide (non castable en ObjectId)', async () => {
        const r = await chatService.getInbox({ userId: '' });
        expect(r).toEqual([]);
        expect(mockMessageAggregate).not.toHaveBeenCalled();
    });
});
