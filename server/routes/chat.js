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
const mongoose = require('mongoose');
const auth = require('../middlewares/middleware-auth');
const chatService = require('../services/chatService');
const OfficeUser = require('../models/App_Users/OfficeUser');
const UserOfficeUser = require('../models/App_Users/modelsLiaisons/UserOfficeUser');
const Message = require('../models/Chat/Message');
const { ensureOfficeUserOwnership } = require('../utils/ownershipHelpers');
const { log: chatLog } = require('../services/chatLogger');
const { log: secLog, EVT } = require('../utils/securityLogger');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Résout l'OfficeUser actif pour le User connecté.
// Lit le header `X-Office-User-Id` (l'OfficeUser actif côté client) et vérifie
// qu'il appartient bien au User authentifié via UserOfficeUser.
// Un identifiant explicitement fourni mais invalide est toujours refuse : il
// ne doit jamais provoquer un envoi silencieux au nom du profil principal.
// Sans header, le fallback historique reste toléré uniquement lorsqu'un seul
// OfficeUser est disponible. Avec plusieurs profils, le client doit choisir
// explicitement celui de cette fenêtre.
// ─────────────────────────────────────────────────────────────────────────────
function activeOfficeUserError(status, code, message) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function isActiveOfficeUserError(error) {
    return error && typeof error.code === 'string'
        && error.code.startsWith('ACTIVE_OFFICE_USER_');
}

function sendActiveOfficeUserError(res, error) {
    if (!isActiveOfficeUserError(error)) return false;
    res.status(error.status || 400).json({ error: error.code, message: error.message });
    return true;
}

async function resolveActiveOfficeUserId(req) {
    const userId = String(req.user || '');
    if (!userId) return null;
    const fromHeader = req.headers['x-office-user-id'];
    if (fromHeader != null && String(fromHeader).trim() !== '') {
        const candidate = String(fromHeader).trim();
        if (!mongoose.Types.ObjectId.isValid(candidate)) {
            throw activeOfficeUserError(
                403,
                'ACTIVE_OFFICE_USER_INVALID',
                "Le profil interne demandé n'est pas autorisé pour ce compte.",
            );
        }
        // Vérifier que c'est bien un OfficeUser rattaché à ce User
        const link = await UserOfficeUser.findOne({ user: userId, officeUser: candidate }).lean();
        if (link) return candidate;
        throw activeOfficeUserError(
            403,
            'ACTIVE_OFFICE_USER_FORBIDDEN',
            "Le profil interne demandé n'appartient pas à ce compte.",
        );
    }

    // Compatibilité : un compte ne possédant qu'un seul profil n'a pas besoin
    // de transmettre le header. Avec plusieurs profils, choisir le main serait
    // ambigu et pourrait attribuer le message au mauvais auteur.
    const links = await UserOfficeUser.find({ user: userId }).populate('officeUser').lean();
    const officeUsers = links.map(l => l.officeUser).filter(Boolean);
    if (officeUsers.length > 1) {
        throw activeOfficeUserError(
            409,
            'ACTIVE_OFFICE_USER_REQUIRED',
            'Sélectionnez le profil interne actif pour cette fenêtre.',
        );
    }
    if (officeUsers.length === 1) return String(officeUsers[0]._id);
    return null;
}

// Les uploads multipart doivent etre scopes AVANT que multer ne commence a
// consommer/ecrire le flux. Une verification effectuee dans le handler final
// serait trop tardive : un profil usurpe pourrait deja avoir laisse un objet
// orphelin sur disque ou dans le bucket.
async function requireActiveOfficeUser(req, res, next) {
    try {
        const officeUserId = await resolveActiveOfficeUserId(req);
        if (!officeUserId) {
            return res.status(400).json({
                error: 'ACTIVE_OFFICE_USER_REQUIRED',
                message: 'Selectionnez le profil interne actif pour cette fenetre.',
            });
        }
        req.activeOfficeUserId = String(officeUserId);
        return next();
    } catch (error) {
        if (sendActiveOfficeUserError(res, error)) return undefined;
        console.error('[chat/upload/profile]', error.message);
        return res.status(500).json({ error: error.message });
    }
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

// Stockage des attachements via la couche fileStorage AGNOSTIQUE (Phase 4).
// En mode LOCAL (defaut), on force la racine sur UPLOADS_ROOT : les fichiers
// sont ecrits EXACTEMENT au meme endroit qu'avant (yyyy/mm/<stamp>__<nom>) et
// les storageKey deja en base restent valides — comportement Electron inchange.
// En mode GCS (GCS_BUCKET defini), les memes cles sont ecrites dans le bucket.
const { buildFileStorage } = require('../services/fileStorage');
const { createStorageEngine } = require('../services/multerStorageEngine');

const chatStorage = buildFileStorage({ ...process.env, FILE_STORAGE_LOCAL_ROOT: UPLOADS_ROOT });

// A15 : politique commune des PJ (taille + types dangereux), partagée avec le mail.
const { assertAttachmentAllowed, maxAttachmentBytes } = require('../services/attachmentPolicy');

const upload = multer({
    storage: createStorageEngine({
        storage: chatStorage,
        keyFn: (_req, file) => {
            const now = new Date();
            const yyyy = String(now.getUTCFullYear());
            const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
            const safeBase = (file.originalname || 'file')
                .replace(/[^\w.\-]/g, '_').slice(0, 80);
            const stamp = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
            return `${yyyy}/${mm}/${stamp}__${safeBase}`;
        },
    }),
    // A15 : plafond de taille aligné sur la politique commune (source unique).
    limits: { fileSize: maxAttachmentBytes() },
    // A15 : refuse les types dangereux AVANT stockage (le fichier n'est pas écrit).
    fileFilter: (req, file, cb) => {
        try {
            assertAttachmentAllowed({ filename: file.originalname, mime: file.mimetype });
            cb(null, true);
        } catch (e) {
            req._attachmentRejected = e; // relayé en 415 par le handler
            cb(null, false);
        }
    },
});

// Wrapper multer : mappe les erreurs (dépassement de taille → 413) au lieu de 500.
function chatUpload(req, res, next) {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'ATTACHMENT_TOO_LARGE', message: 'Fichier trop volumineux.' });
            }
            return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
        }
        return next();
    });
}

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
        // Une conversation individuelle avec soi-même est interdite : le profil
        // actif n'est donc jamais proposé, même si le client oublie de filtrer.
        const officeUsers = links
            .map(l => l.officeUser)
            .filter(Boolean)
            .filter(ou => String(ou._id) !== String(meOfficeUserId || ''))
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
        if (sendActiveOfficeUserError(res, err)) return;
        console.error('[chat/contacts]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/chat/conversations  — liste des conversations + non lus + last message
// Les conversations sont entre OfficeUsers. Le profil actif est résolu via le
// header X-Office-User-Id ; la compatibilité sans header n'est admise que pour
// un compte qui ne possède exactement qu'un seul profil interne.
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
        if (sendActiveOfficeUserError(res, err)) return;
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
        if (String(contactId) === String(meOfficeUserId)) {
            return res.status(400).json({ error: 'SELF_CONVERSATION_NOT_ALLOWED' });
        }
        if (!(await ensureOfficeUserOwnership(req, res, contactId))) return;
        const messages = await chatService.getConversation({
            userId: meOfficeUserId,
            contactId,
            before,
            limit,
        });
        res.json({ messages, currentUserId: String(meOfficeUserId) });
    } catch (err) {
        if (sendActiveOfficeUserError(res, err)) return;
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
        if (String(recipientId) === String(meOfficeUserId)) {
            return res.status(400).json({
                error: 'SELF_CONVERSATION_NOT_ALLOWED',
                message: 'Une conversation individuelle avec soi-même est interdite.',
            });
        }

        // SECURITE rc38 (A1) : le destinataire doit être un OfficeUser du même
        // cabinet. Sans ce contrôle, un user pouvait envoyer un message (spam /
        // phishing interne) dans la boîte d'un membre d'un AUTRE cabinet en
        // connaissant simplement son OfficeUser._id. ensureOfficeUserOwnership
        // écrit lui-même la réponse 403 en cas de refus.
        if (!(await ensureOfficeUserOwnership(req, res, recipientId))) return;

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
        if (sendActiveOfficeUserError(res, err)) return;
        console.error('[chat/send]', err.message);
        const isClientError = err.code === 'SELF_CONVERSATION_NOT_ALLOWED'
            || /vide|required|sender|recipient/i.test(err.message);
        res.status(isClientError ? 400 : 500).json({ error: err.code || err.message, message: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat/conversations/:contactId/read   — marque tout comme lu
// ─────────────────────────────────────────────────────────────────────────────
router.post('/conversations/:contactId/read', auth, async (req, res) => {
    try {
        const meOfficeUserId = await resolveActiveOfficeUserId(req);
        if (!meOfficeUserId) return res.status(400).json({ error: 'OfficeUser actif introuvable' });
        if (String(req.params.contactId) === String(meOfficeUserId)) {
            return res.status(400).json({ error: 'SELF_CONVERSATION_NOT_ALLOWED' });
        }
        if (!(await ensureOfficeUserOwnership(req, res, req.params.contactId))) return;
        const updated = await chatService.markConversationAsRead({
            userId: meOfficeUserId,
            contactId: req.params.contactId,
        });
        res.json({ updated });
    } catch (err) {
        if (sendActiveOfficeUserError(res, err)) return;
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
        if (sendActiveOfficeUserError(res, err)) return;
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/chat/attachments/upload   — multipart, retourne { storageKey, ... }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/attachments/upload', auth, requireActiveOfficeUser, chatUpload, async (req, res) => {
    try {
        // A15 : type refusé par le fileFilter → 415 (le fichier n'a pas été stocké).
        if (req._attachmentRejected) {
            const e = req._attachmentRejected;
            return res.status(e.statusCode || 415).json({
                error: e.code || 'ATTACHMENT_TYPE_BLOCKED',
                message: e.message,
            });
        }
        if (!req.file) return res.status(400).json({ error: 'Aucun fichier' });
        // La cle est posee par le moteur de stockage (identique a l'ancien
        // chemin relatif en mode local : yyyy/mm/<stamp>__<nom>).
        const relPath = req.file.storageKey;
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
        const meOfficeUserId = await resolveActiveOfficeUserId(req);
        if (!meOfficeUserId) return res.status(400).json({ error: 'OfficeUser actif introuvable' });

        // Sécurité 1 : interdire toute traversée
        const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, '');
        // En mode LOCAL (defaut), on verifie l'existence sur disque comme avant.
        // En mode GCS, l'objet est servi par redirection (existence implicite +
        // controle de propriete ci-dessous).
        let absPath = null;
        if (chatStorage.kind === 'local') {
            absPath = path.join(UPLOADS_ROOT, normalized);
            if (!absPath.startsWith(UPLOADS_ROOT)) {
                return res.status(400).json({ error: 'Chemin invalide' });
            }
            if (!fs.existsSync(absPath)) {
                return res.status(404).json({ error: 'Fichier introuvable' });
            }
        }

        // SECURITE rc37 (C-15) : verifier que le storageKey appartient a un
        // message dont l'utilisateur est sender ou recipient (via OfficeUser).
        // Sans cela n'importe quel user authentifie pouvait telecharger les
        // attachements (vocaux, fichiers) des conversations d'autres cabinets.
        const message = await Message.findOne({ 'attachment.storageKey': normalized })
            .select('sender recipient')
            .lean();
        if (!message) {
            // Fichier orphelin ou storageKey inconnu cote DB
            console.warn(`[chat/attachments/get] storageKey "${normalized}" sans message en DB (user ${req.user})`);
            return res.status(404).json({ error: 'Fichier introuvable' });
        }
        const isParticipant =
            String(meOfficeUserId) === String(message.sender) ||
            String(meOfficeUserId) === String(message.recipient);
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

        // Servir selon le backend
        if (chatStorage.kind === 'local') {
            return res.sendFile(absPath);
        }
        // GCS : redirection vers une URL signee temporaire (1h)
        const signedUrl = await chatStorage.getSignedUrl(normalized, { expiresInSec: 3600 });
        return res.redirect(302, signedUrl);
    } catch (err) {
        if (sendActiveOfficeUserError(res, err)) return;
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
