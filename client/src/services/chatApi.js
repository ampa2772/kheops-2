// client/src/services/chatApi.js
//
// Wrapper REST autour de /api/chat/*. Toutes les fonctions utilisent
// apiClient (axios pré-configuré avec le JWT depuis Redux).
//
// === CHIFFREMENT E2E (S26 chantier #12) ===
// - sendMessage : chiffre automatiquement via window.electron.crypto si dispo
//   ET cabinet déverrouillé. Sinon fallback mode clair (browser preview, ou
//   cabinet pas protégé).
// - fetchMessages : déchiffre les messages reçus avant de les retourner.
// - decryptMessage / decryptMessages : helpers exposés pour useChatSocket
//   (déchiffrement des messages reçus en temps réel via socket).

import apiClient from './apiClient';

const BASE = '/api/chat';

/**
 * Tente de chiffrer un message via IPC Electron. Retourne null si :
 *   - window.electron.crypto absent (browser preview)
 *   - cabinet pas configuré ou verrouillé
 *   - erreur de chiffrement
 * Le caller doit fallback sur le mode clair.
 */
async function tryEncryptPayload({ text, attachment }) {
    if (typeof window === 'undefined' || !window.electron || !window.electron.crypto) {
        return null;
    }
    try {
        const status = await window.electron.crypto.getStatus();
        if (!status || !status.isUnlocked) return null;
        const plaintext = JSON.stringify({
            text: text || '',
            attachment: attachment || null,
        });
        const ciphertext = await window.electron.crypto.encryptString(plaintext);
        if (!ciphertext || typeof ciphertext !== 'string') return null;
        return { v: 2, data: ciphertext };
    } catch (e) {
        console.warn('[chatApi] Chiffrement échoué, fallback mode clair :', e.message);
        return null;
    }
}

/**
 * Déchiffre un message reçu si nécessaire. Retourne le message tel quel
 * si déjà en clair (legacy). Retourne un objet avec text/attachment
 * remplis depuis le payload si chiffré.
 *
 * En cas d'échec déchiffrement (cabinet verrouillé, mauvaise clé), le
 * message reçoit `_decryptError: true` et text = "[Message chiffré illisible]".
 */
export async function decryptMessage(msg) {
    if (!msg) return msg;
    // Mode clair (legacy ou cabinet non protégé) : rien à faire
    if (!msg.payload || !msg.payload.v || msg.payload.v < 2 || !msg.payload.data) {
        return msg;
    }
    // Mode chiffré : tenter le déchiffrement
    if (typeof window === 'undefined' || !window.electron || !window.electron.crypto || !window.electron.crypto.decryptString) {
        // Browser preview : on ne peut pas déchiffrer, marquer comme illisible
        return {
            ...msg,
            text: '[Message chiffré — déverrouillez votre cabinet dans l\'app Kheops]',
            _decryptError: true,
        };
    }
    try {
        const plaintext = await window.electron.crypto.decryptString(msg.payload.data);
        const obj = JSON.parse(plaintext);
        const attachment = obj.attachment || null;
        // ★ S27 P1 (2.0.12-rc1) : reconstitution de `kind` à partir du mimeType
        // de l'attachment déchiffré. Le serveur ne peut pas déduire `kind` quand
        // le payload est chiffré, donc il met `kind = 'encrypted'`. Côté UI,
        // MessageList rend un <audio> uniquement si `kind === 'voice'` ; sans
        // cette reconstitution, les messages vocaux chiffrés s'affichaient
        // comme un simple lien fichier → pas de lecteur audio visible.
        let reconstructedKind = msg.kind;
        if (msg.kind === 'encrypted' && attachment && attachment.mimeType) {
            const mt = String(attachment.mimeType).toLowerCase();
            if (mt.startsWith('audio/')) reconstructedKind = 'voice';
            else if (mt.startsWith('image/')) reconstructedKind = 'image';
            else if (mt.startsWith('video/')) reconstructedKind = 'video';
            else reconstructedKind = 'file';
        }
        return {
            ...msg,
            text: obj.text || '',
            attachment,
            kind: reconstructedKind,
            _decrypted: true,
        };
    } catch (e) {
        console.warn('[chatApi] Déchiffrement échoué msg', msg._id, ':', e.message);
        return {
            ...msg,
            text: '[Message chiffré illisible]',
            _decryptError: true,
        };
    }
}

/**
 * Déchiffre un tableau de messages en parallèle.
 */
export async function decryptMessages(messages) {
    if (!Array.isArray(messages)) return messages;
    return Promise.all(messages.map(decryptMessage));
}

export async function fetchContacts() {
    const r = await apiClient.get(`${BASE}/contacts`);
    return r.data; // { contacts: [{ _id, firstName, lastName, email }] }
}

export async function fetchConversations() {
    const r = await apiClient.get(`${BASE}/conversations`);
    // S26 chantier #12 : déchiffrer le lastMessage de chaque conversation pour l'aperçu sidebar
    const data = r.data || {};
    if (Array.isArray(data.conversations)) {
        data.conversations = await Promise.all(data.conversations.map(async (conv) => {
            if (conv && conv.lastMessage) {
                return { ...conv, lastMessage: await decryptMessage(conv.lastMessage) };
            }
            return conv;
        }));
    }
    return data; // { conversations, currentUserId }
}

export async function fetchMessages({ contactId, before, limit = 30 }) {
    const params = { limit };
    if (before) params.before = before;
    const r = await apiClient.get(`${BASE}/messages`, {
        params: { contactId, ...params },
    });
    // S26 chantier #12 : déchiffrer les messages chiffrés avant retour
    const data = r.data || {};
    if (Array.isArray(data.messages)) {
        data.messages = await decryptMessages(data.messages);
    }
    return data; // { messages, currentUserId }
}

export async function sendMessage({ recipientId, text, attachment }) {
    // S26 chantier #12 : tentative chiffrement E2E
    const encryptedPayload = await tryEncryptPayload({ text, attachment });
    let r;
    if (encryptedPayload) {
        // Mode chiffré : on n'envoie ni text ni attachment en clair
        r = await apiClient.post(`${BASE}/messages`, { recipientId, encryptedPayload });
    } else {
        // Fallback mode clair (browser preview ou cabinet pas protégé/verrouillé)
        r = await apiClient.post(`${BASE}/messages`, { recipientId, text, attachment });
    }
    // Le serveur renvoie le msg créé. Si chiffré, on déchiffre pour l'UI immédiate.
    const data = r.data || {};
    if (data.message) {
        data.message = await decryptMessage(data.message);
    }
    return data; // { message }
}

export async function markConversationAsRead(contactId) {
    const r = await apiClient.post(`${BASE}/conversations/${encodeURIComponent(contactId)}/read`);
    return r.data; // { updated }
}

export async function fetchUnreadCount() {
    const r = await apiClient.get(`${BASE}/unread-count`);
    return r.data; // { count }
}

/**
 * Upload un fichier ou un message vocal. Retourne le storageKey + metadata
 * que le client doit ensuite passer à sendMessage(attachment).
 *
 * @param {File|Blob} file
 * @param {{ durationSec?: number, fileName?: string }} options
 */
export async function uploadAttachment(file, options = {}) {
    const formData = new FormData();
    const fileName = options.fileName || file.name || 'attachment';
    formData.append('file', file, fileName);
    if (options.durationSec != null) {
        formData.append('durationSec', String(options.durationSec));
    }
    const r = await apiClient.post(`${BASE}/attachments/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return r.data; // { storageKey, fileName, mimeType, sizeBytes, durationSec }
}

/**
 * Construit l'URL absolue (ou data: URL) pour lire un attachement.
 * - Si l'attachement contient `dataBase64`, on retourne un data: URL inline
 *   (le contenu est stocké dans le document Mongo, donc accessible depuis
 *   n'importe quelle machine).
 * - Sinon, fallback sur l'URL serveur authentifiée /api/chat/attachments/*
 *   (utilisé pour les anciens messages avec fichier local).
 *
 * @param {object|string} attachmentOrKey  l'objet attachment complet, OU le storageKey legacy
 */
export function buildAttachmentUrl(attachmentOrKey) {
    if (!attachmentOrKey) return null;
    if (typeof attachmentOrKey === 'object' && attachmentOrKey.dataBase64) {
        const mime = attachmentOrKey.mimeType || 'application/octet-stream';
        return `data:${mime};base64,${attachmentOrKey.dataBase64}`;
    }
    const storageKey = typeof attachmentOrKey === 'string'
        ? attachmentOrKey
        : attachmentOrKey.storageKey;
    if (!storageKey) return null;
    const base = (apiClient.defaults && apiClient.defaults.baseURL) || '';
    const sk = String(storageKey).split('/').map(encodeURIComponent).join('/');
    return `${base}${BASE}/attachments/${sk}`;
}

/**
 * Encode un Blob en base64 pour transit inline (sans upload séparé).
 * Le payload est envoyé dans le body de POST /api/chat/messages, et stocké
 * dans le document Mongo → accessible depuis n'importe quelle machine du
 * cabinet (les attachements ne dépendent plus du filesystem local).
 *
 * @param {Blob|File} blob
 * @param {{ durationSec?: number, fileName?: string }} options
 * @returns {Promise<{dataBase64, fileName, mimeType, sizeBytes, durationSec}>}
 */
export async function prepareInlineAttachment(blob, options = {}) {
    const fileName = options.fileName || blob.name || 'attachment';
    const mimeType = blob.type || 'application/octet-stream';
    const buf = await blob.arrayBuffer();
    // Encodage base64 par chunks pour éviter "Maximum call stack size exceeded"
    const bytes = new Uint8Array(buf);
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    const dataBase64 = btoa(binary);
    return {
        dataBase64,
        fileName,
        mimeType,
        sizeBytes: blob.size,
        durationSec: Number.isFinite(options.durationSec) ? options.durationSec : null,
    };
}
