// server/services/chatService.js
//
// Logique métier pure du chat. Pas de Express, pas de Socket.io, pas de
// req/res ici — uniquement Mongoose. Permet des tests unitaires propres.

const Message = require('../models/Chat/Message');

/**
 * Crée et persiste un message.
 *
 * Deux modes mutuellement exclusifs :
 *   - Mode CHIFFRE (S26 chantier #12) : { senderId, recipientId, encryptedPayload }
 *     où encryptedPayload = { v: 2, data: "enc:v2:..." }. Le serveur ne voit
 *     PAS le contenu. text et attachment ne sont PAS persistes (mode E2E).
 *   - Mode CLAIR (legacy, retrocompat) : { senderId, recipientId, text, attachment }
 *     persistes en clair dans Mongo. À conserver tant que l'UI client n'a pas
 *     bascule entierement en mode chiffre.
 *
 * @param {object} payload
 * @param {string} payload.senderId
 * @param {string} payload.recipientId
 * @param {string?} payload.text                 (mode clair)
 * @param {object?} payload.attachment           (mode clair) { storageKey, fileName, ... }
 * @param {object?} payload.encryptedPayload     (mode chiffre) { v: number, data: string }
 * @returns {Promise<Message>}
 */
async function sendMessage({ senderId, recipientId, text, attachment, encryptedPayload }) {
    if (!senderId) throw new Error('senderId required');
    if (!recipientId) throw new Error('recipientId required');

    // === Mode CHIFFRE (S26 chantier #12) ===
    if (encryptedPayload && typeof encryptedPayload === 'object' &&
        typeof encryptedPayload.data === 'string' && encryptedPayload.data.length > 0) {
        const v = Number(encryptedPayload.v) || 2;
        if (v < 2) {
            throw new Error('encryptedPayload.v doit etre >= 2 (S26 chantier #12).');
        }
        const msg = await Message.create({
            sender: senderId,
            recipient: recipientId,
            kind: 'encrypted',
            text: '',
            attachment: null,
            payload: { v, data: encryptedPayload.data },
        });
        return msg;
    }

    // === Mode CLAIR (legacy) ===
    const cleanText = (text || '').trim();
    const hasText = cleanText.length > 0;
    const hasAttachment = !!(attachment && (attachment.storageKey || attachment.dataBase64));

    if (!hasText && !hasAttachment) {
        throw new Error('Message vide : texte, attachement ou encryptedPayload requis.');
    }

    let kind;
    if (hasText && hasAttachment) {
        kind = 'mixed';
    } else if (hasAttachment) {
        kind = (attachment.mimeType && attachment.mimeType.startsWith('audio/'))
            ? 'voice' : 'file';
    } else {
        kind = 'text';
    }

    const msg = await Message.create({
        sender: senderId,
        recipient: recipientId,
        kind,
        text: cleanText,
        attachment: hasAttachment ? attachment : null,
    });
    return msg;
}

/**
 * Récupère les messages d'une conversation entre 2 utilisateurs, paginés
 * par cursor (createdAt). Ordre : du plus récent au plus ancien.
 *
 * @param {object} args
 * @param {string} args.userId      l'utilisateur courant
 * @param {string} args.contactId   l'autre utilisateur de la conversation
 * @param {Date?} args.before       cursor (renvoyer les messages strictement antérieurs)
 * @param {number?} args.limit      max 100, défaut 30
 */
async function getConversation({ userId, contactId, before, limit }) {
    const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
    const query = {
        deletedAt: null,
        $or: [
            { sender: userId, recipient: contactId },
            { sender: contactId, recipient: userId },
        ],
    };
    if (before) {
        query.createdAt = { $lt: new Date(before) };
    }
    return Message.find(query).sort({ createdAt: -1 }).limit(lim).lean();
}

/**
 * Récupère la liste des conversations de l'utilisateur courant (= un dernier
 * message par contact, avec compteur des non lus). Une seule requête agrégée.
 */
async function getInbox({ userId }) {
    const uid = toObjectId(userId);
    if (!uid) return [];

    const pipeline = [
        // Tous les messages où je suis impliqué et non supprimés
        { $match: {
            deletedAt: null,
            $or: [{ sender: uid }, { recipient: uid }],
        } },
        // Calculer l'autre user (= le contact)
        { $addFields: {
            contactId: {
                $cond: [{ $eq: ['$sender', uid] }, '$recipient', '$sender'],
            },
        } },
        // Tri pour que $first soit bien le dernier
        { $sort: { createdAt: -1 } },
        // Group par contact : last message + unread count
        { $group: {
            _id: '$contactId',
            lastMessage: { $first: '$$ROOT' },
            unreadCount: {
                $sum: {
                    $cond: [
                        { $and: [
                            { $eq: ['$recipient', uid] },
                            { $eq: ['$readAt', null] },
                        ] },
                        1, 0,
                    ],
                },
            },
        } },
        { $sort: { 'lastMessage.createdAt': -1 } },
    ];

    return Message.aggregate(pipeline);
}

/**
 * Marque tous les messages reçus de `contactId` par `userId` comme lus.
 * Retourne le nombre mis à jour.
 */
async function markConversationAsRead({ userId, contactId }) {
    const res = await Message.updateMany(
        {
            sender: contactId,
            recipient: userId,
            readAt: null,
            deletedAt: null,
        },
        { $set: { readAt: new Date() } }
    );
    return res.modifiedCount || res.nModified || 0;
}

/**
 * Compte le total de messages non lus pour cet utilisateur (badge global).
 */
async function getTotalUnreadCount({ userId }) {
    return Message.countDocuments({
        recipient: userId,
        readAt: null,
        deletedAt: null,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function toObjectId(id) {
    if (!id) return null;
    try {
        const mongoose = require('mongoose');
        return new mongoose.Types.ObjectId(String(id));
    } catch (_) {
        return null;
    }
}

module.exports = {
    sendMessage,
    getConversation,
    getInbox,
    markConversationAsRead,
    getTotalUnreadCount,
};
