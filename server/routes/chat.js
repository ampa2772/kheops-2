// server/routes/chat.js
//
// Routes REST du chat. Toutes JWT-protégées.
// La diffusion temps réel est gérée séparément par chatSocketHandler — les
// routes appellent simplement le service, et un hook après-création peut être
// branché par index.js pour broadcaster via Socket.io.

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const auth = require('../middlewares/middleware-auth');
const chatService = require('../services/chatService');
const OfficeUser = require('../models/App_Users/OfficeUser');
const UserOfficeUser = require('../models/App_Users/modelsLiaisons/UserOfficeUser');
const Message = require('../models/Chat/Message');
const { log: chatLog } = require('../services/chatLogger');
const { log: secLog, EVT } = require('../utils/securityLogger');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Résout l'OfficeUser actif pour le User connecté.
// Lit le header `X-Office-User-Id` (l'OfficeUser actif côté client) et vérifie
// qu'il appartient bien au User authentifié via UserOfficeUser.
// Si rien n'est fourni ou si la liaison n'existe pas, on fallback sur le
// mainOfficeUser du User. Renvoie une string (OfficeUser._id) ou null.
// ─────────────────────────────────────────────────────────────────────────────
async function resolveActiveOfficeUserId(req) {
    const userId = String(req.user || '');
    if (!userId) return null;
    const fromHeader = req.headers['x-office-user-id'] || req.headers['X-Office-User-Id'];
    if (fromHeader) {
        const candidate = String(fromHeader);
        // Vérifier que c'est bien un OfficeUser rattaché à ce User
        const link = await UserOfficeUser.findOne({ user: userId, officeUser: candidate }).lean();
        if (link) return candidate;
        // Le main OfficeUser n'a pas forcément de lien UserOfficeUser, mais
        // c'est l'OfficeUser principal du User. On le valide en cherchant un
        // OfficeUser ayant cet _id et mainOfficeUser=true.
        const main = await OfficeUser.findOne({ _id: candidate, mainOfficeUser: true }).lean();
        if (main) {
            // Sécurité : le main doit être lié au User via UserOfficeUser
            // (créé à l'inscription dans /register, /google/callback, etc.).
            const linkMain = await UserOfficeUser.findOne({ user: userId, officeUser: candidate }).lean();
            if (linkMain) return candidate;
        }
    }
    // Fallback : trouver le main officeUser du User
    const links = await UserOfficeUser.find({ user: userId }).populate('officeUser').lean();
    const main = links.map(l => l.officeUser).filter(Boolean).find(ou => ou.mainOfficeUser === true);
    if (main) return String(main._id);
    if (links.length > 0 && links[0].officeUser) return String(links[0].officeUser._id);
    return null;
}

// ─── Stockage des attachements ───────────────────────────────────────────────
// IMPORTANT : on n'utilise PAS __dirname comme racine. Quand l'app Electron
// est installée dans "C:\Program Files\Kheops2\", ce dossier est en lecture
// seule pour les utilisateurs standards → mkdirSync échoue avec EPERM.
//
// On utilise donc le dossier de données utilisateur :
//   - Windows : %APPDATA%\Kheops2\chat-attachments
//   - Linux / macOS : ~/.kheops2/chat-attachments
// Ces emplacements sont garantis writables et persistants entre redémarrages.
function resolveUploadsRoot() {
    const userDataDir = process.env.APPDATA
        || (process.env.HOME ? path.join(process.env.HOME, '.kheops2') : null)
        || path.join(os.homedir(), 'Kheops2');
    const root = process.env.APPDATA
        ? path.join(userDataDir, 'Kheops2', 'chat-attachments')
        : path.join(userDataDir, 'chat-attachments');
    return root;
}
const UPLOADS_ROOT = resolveUploadsRoot();
try {
    fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
} catch (e) {
    console.error(`[chat] Impossible de créer le dossier uploads ${UPLOADS_ROOT}:`, e.message);
    // On ne throw pas : le serveur peut démarrer, l'upload échouera juste
    // proprement avec un 500 si l'utilisateur tente d'envoyer un attachement.
}

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const now = new Date();
        const yyyy = String(now.getUTCFullYear());
        const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
        const dir = path.join(UPLOADS_ROOT, yyyy, mm);
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        const safeBase = (file.originalname || 'file')
            .replace(/[^\w.\-]/g, '_').slice(0, 80);
        const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        cb(null, `${stamp}__${safeBase}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 Mo max (audio + fichier joint)
});

// Hook optionnel branché par server/index.js pour diffuser via Socket.io.
// Forme : (message) => void
let onMessageCreated = null;
function setOnMessageCreated(fn) { onMessageCreated = (typeof fn === 'function') ? fn : null; }

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chat/contacts  — liste les OfficeUsers du cabinet (hors moi-même)
// Source : tous les OfficeUsers liés au User connecté via UserOfficeUser.
// Permet une messagerie interne entre membres du même cabinet (avocat,
// assistant juridique, secrétaire, etc.).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/contacts', auth, async (req, res) => {
    try {
        const userId = String(req.user);
        const meOfficeUserId = await resolveActiveOfficeUserId(req);
        const links = await UserOfficeUser.find({ user: userId })
            .populate('officeUser')
            .lean();
        // On retourne TOUS les OfficeUsers du cabinet, y compris celui qui
        // est actif (current). Le frontend l'affiche grisé avec mention
        // "(vous)" pour que l'utilisateur voie clairement la composition
        // complète du cabinet. Le filtre "ne pas chater avec soi-même"
        // est appliqué côté UI uniquement.
        const officeUsers = links
            .map(l => l.officeUser)
            .filter(Boolean)
            .sort((a, b) => {
                const an = (a.nomOfficeUser || '').toLowerCase();
                const bn = (b.nomOfficeUser || '').toLowerCase();
                if (an !== bn) return an < bn ? -1 : 1;
                const ap = (a.prenomOfficeUser || '').toLowerCase();
                const bp = (b.prenomOfficeUser || '').toLowerCase();
                return ap < bp ? -1 : ap > bp ? 1 : 0;
            });
        res.json({
            contacts: officeUsers.map(ou => ({
                _id: String(ou._id),
                firstName: ou.prenomOfficeUser || '',
                lastName: ou.nomOfficeUser || '',
                roleOfficeUser: ou.roleOfficeUser || '',
                isAvocat: !!ou.isAvocat,
                mainOfficeUser: !!ou.mainOfficeUser,
                email: '',
            })),
            currentOfficeUserId: meOfficeUserId,
        });
    } catch (err) {
        console.error('[chat/contacts]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chat/conversations  — liste des conversations + non lus + last message
// Les conversations sont entre OfficeUsers (l'OfficeUser actif côté client est
// résolu via le header X-Office-User-Id, fallback sur le main du User).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/conversations', auth, async (req, res) => {
    try {
        const meOfficeUserId = await resolveActiveOfficeUserId(req);
        if (!meOfficeUserId) {
            return res.json({ conversations: [], currentUserId: null });
        }
        const inbox = await chatService.getInbox({ userId: meOfficeUserId });
        // Hydratation des OfficeUsers (firstName/lastName/role) en une requête
        const contactIds = inbox.map(c => c._id).filter(Boolean);
        const officeUsers = await OfficeUser.find({ _id: { $in: contactIds } })
            .select('prenomOfficeUser nomOfficeUser roleOfficeUser isAvocat mainOfficeUser');
        const ouMap = new Map(officeUsers.map(u => [String(u._id), u]));

        const result = inbox
            .map(c => {
                const ou = ouMap.get(String(c._id));
                if (!ou) return null; // Filtre les conversations zombies (ancien sender/recipient = User._id legacy)
                return {
                    contactId: String(c._id),
                    contact: {
                        _id: String(ou._id),
                        firstName: ou.prenomOfficeUser || '',
                        lastName: ou.nomOfficeUser || '',
                        roleOfficeUser: ou.roleOfficeUser || '',
                        isAvocat: !!ou.isAvocat,
                        mainOfficeUser: !!ou.mainOfficeUser,
                        email: '',
                    },
                    lastMessage: c.lastMessage,
                    unreadCount: c.unreadCount,
                };
            })
            .filter(Boolean);
        res.json({ conversations: result, currentUserId: String(meOfficeUserId) });
    } catch (err) {
        console.error('[chat/conversations]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chat/messages?contactId=X&before=ISO&limit=30
// ─────────────────────────────────────────────────────────────────────────────
router.get('/messages', auth, async (req, res) => {
    try {
        const { contactId, before, limit } = req.query;
        if (!contactId) return res.status(400).json({ error: 'contactId requis' });
        const meOfficeUserId = await resolveActiveOfficeUserId(req);
        if (!meOfficeUserId) return res.status(400).json({ error: 'OfficeUser actif introuvable' });
        const messages = await chatService.getConversation({
            userId: meOfficeUserId,
            contactId,
            before,
            limit,
        });
        res.json({ messages, currentUserId: String(meOfficeUserId) });
    } catch (err) {
        console.error('[chat/messages]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat/messages
//   body : { recipientId, text?, attachment? }
//   Le client doit avoir d'abord uploadé l'attachement via /attachments/upload
//   pour obtenir storageKey + metadata, puis envoyer le message ici.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/messages', auth, async (req, res) => {
    try {
        // S26 chantier #12 : accepter aussi encryptedPayload (mode E2E)
        const { recipientId, text, attachment, encryptedPayload } = req.body || {};
        if (!recipientId) return res.status(400).json({ error: 'recipientId requis' });
        const meOfficeUserId = await resolveActiveOfficeUserId(req);
        if (!meOfficeUserId) return res.status(400).json({ error: 'OfficeUser actif introuvable' });

        const msg = await chatService.sendMessage({
            senderId: meOfficeUserId,
            recipientId,
            text,
            attachment,
            encryptedPayload,
        });

        // Broadcast temps réel (si Socket.io a branché un hook)
        if (onMessageCreated) {
            try { onMessageCreated(msg); } catch (e) {
                console.warn('[chat] onMessageCreated hook a planté:', e.message);
            }
        }

        res.status(201).json({ message: msg });
    } catch (err) {
        console.error('[chat/send]', err.message);
        const status = /vide|required|sender|recipient/i.test(err.message) ? 400 : 500;
        res.status(status).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat/conversations/:contactId/read   — marque tout comme lu
// ─────────────────────────────────────────────────────────────────────────────
router.post('/conversations/:contactId/read', auth, async (req, res) => {
    try {
        const meOfficeUserId = await resolveActiveOfficeUserId(req);
        if (!meOfficeUserId) return res.status(400).json({ error: 'OfficeUser actif introuvable' });
        const updated = await chatService.markConversationAsRead({
            userId: meOfficeUserId,
            contactId: req.params.contactId,
        });
        res.json({ updated });
    } catch (err) {
        console.error('[chat/read]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chat/unread-count   — total des non lus pour l'utilisateur
// ─────────────────────────────────────────────────────────────────────────────
router.get('/unread-count', auth, async (req, res) => {
    try {
        const meOfficeUserId = await resolveActiveOfficeUserId(req);
        if (!meOfficeUserId) return res.json({ count: 0 });
        const count = await chatService.getTotalUnreadCount({ userId: meOfficeUserId });
        res.json({ count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat/attachments/upload   — multipart, retourne { storageKey, ... }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/attachments/upload', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
        const relPath = path.relative(UPLOADS_ROOT, req.file.path).replace(/\\/g, '/');
        const durationSec = req.body && req.body.durationSec
            ? parseFloat(req.body.durationSec) : null;
        res.status(201).json({
            storageKey: relPath,
            fileName: req.file.originalname,
            mimeType: req.file.mimetype || 'application/octet-stream',
            sizeBytes: req.file.size,
            durationSec: Number.isFinite(durationSec) ? durationSec : null,
        });
    } catch (err) {
        console.error('[chat/upload]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chat/attachments/*   — sert le fichier (auth requise)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/attachments/*', auth, async (req, res) => {
    try {
        const requested = req.params[0];
        if (!requested) return res.status(400).json({ error: 'storageKey requis' });

        // Sécurité 1 : interdire toute traversée
        const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, '');
        const absPath = path.join(UPLOADS_ROOT, normalized);
        if (!absPath.startsWith(UPLOADS_ROOT)) {
            return res.status(400).json({ error: 'Chemin invalide' });
        }
        if (!fs.existsSync(absPath)) {
            return res.status(404).json({ error: 'Fichier introuvable' });
        }

        // SECURITE rc37 (C-15) : verifier que le storageKey appartient a un
        // message dont l'utilisateur est sender ou recipient (via OfficeUser).
        // Sans cela n'importe quel user authentifie pouvait telecharger les
        // attachements (vocaux, fichiers) des conversations d'autres cabinets.
        const userOfficeUserLinks = await UserOfficeUser.find({ user: req.user })
            .select('officeUser')
            .lean();
        const officeUserIds = userOfficeUserLinks.map((l) => String(l.officeUser));
        const message = await Message.findOne({ 'attachment.storageKey': normalized })
            .select('sender recipient')
            .lean();
        if (!message) {
            // Fichier orphelin ou storageKey inconnu cote DB
            console.warn(`[chat/attachments/get] storageKey "${normalized}" sans message en DB (user ${req.user})`);
            return res.status(404).json({ error: 'Fichier introuvable' });
        }
        const isParticipant =
            officeUserIds.includes(String(message.sender)) ||
            officeUserIds.includes(String(message.recipient));
        if (!isParticipant) {
            console.warn(`[chat/attachments/get] ACCESS_DENIED storageKey="${normalized}" user=${req.user} sender=${message.sender} recipient=${message.recipient}`);
            secLog(EVT.ACCESS_DENIED, {
                userId: String(req.user),
                resourceType: 'chat-attachment',
                resourceId: normalized,
                reason: 'not-participant-in-conversation',
            }, req);
            return res.status(403).json({ error: 'Acces refuse.' });
        }

        res.sendFile(absPath);
    } catch (err) {
        console.error('[chat/attachments/get]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat/debug/client-log : permet au client d'envoyer ses events de
// connexion socket (connect, disconnect, connect_error) qui sont alors
// consignés dans le même fichier chat-debug.log que les events serveur.
// Tres utile pour diagnostiquer les problemes multi-machines.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/debug/client-log', auth, async (req, res) => {
    try {
        const { event, ...rest } = req.body || {};
        chatLog(`[Client] userId=${req.user} event=${event}`, rest);
        res.status(200).json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.setOnMessageCreated = setOnMessageCreated;

module.exports = router;
