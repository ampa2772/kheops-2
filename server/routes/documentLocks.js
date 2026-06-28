// server/routes/documentLocks.js
//
// Routes REST pour le verrouillage collaboratif de documents.
// Toutes protégées par le middleware JWT auth — req.user contient l'userId.

const express = require('express');
const router = express.Router();
const auth = require('../middlewares/middleware-auth');
const lockService = require('../services/documentLockService');
const User = require('../models/App_Users/User');
const { ensureDocOwnership } = require('../utils/ownershipHelpers');

// Cache léger du displayName par userId pour éviter un find() Mongo à chaque
// appel /lock (les cabinets font potentiellement beaucoup de heartbeats).
const displayNameCache = new Map(); // userId → { displayName, cachedAt }
const DISPLAY_NAME_CACHE_TTL = 5 * 60 * 1000; // 5 min

async function getDisplayName(userId) {
    const cached = displayNameCache.get(String(userId));
    if (cached && (Date.now() - cached.cachedAt) < DISPLAY_NAME_CACHE_TTL) {
        return cached.displayName;
    }
    try {
        const user = await User.findById(userId).select('firstName lastName email');
        if (!user) return '';
        const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || '';
        displayNameCache.set(String(userId), { displayName, cachedAt: Date.now() });
        return displayName;
    } catch (_) {
        return '';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/document-locks/:docId/acquire
// Tente de prendre le verrou. Renvoie 200 si accordé, 409 si déjà détenu.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:docId/acquire', auth, async (req, res) => {
    try {
        const { docId } = req.params;
        if (!docId) return res.status(400).json({ error: 'docId requis' });

        // SECURITE rc37 (M-09) : check ownership du doc (via dossier user)
        // pour eviter qu'un user puisse spammer des locks sur les docs d'un
        // autre cabinet (DoS) ou enumerer des displayNames.
        const own = await ensureDocOwnership(req, res, docId);
        if (!own.ok) return;

        const displayName = await getDisplayName(req.user);
        const result = lockService.acquire(docId, { userId: req.user, displayName });

        if (result.granted) {
            return res.json({ granted: true });
        }
        return res.status(409).json({
            granted: false,
            lockedBy: result.lockedBy,
        });
    } catch (err) {
        console.error('[document-locks/acquire] Erreur:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/document-locks/:docId/heartbeat
// Rafraîchit le verrou. 200 si OK, 410 (Gone) si verrou expiré ou perdu,
// 403 si pas le propriétaire.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:docId/heartbeat', auth, async (req, res) => {
    try {
        const { docId } = req.params;
        const result = lockService.heartbeat(docId, req.user);
        if (result.ok) return res.json({ ok: true });
        if (result.reason === 'wrong-owner') return res.status(403).json(result);
        return res.status(410).json(result); // no-lock ou expired
    } catch (err) {
        console.error('[document-locks/heartbeat] Erreur:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/document-locks/:docId/release
// Libère le verrou (uniquement si propriétaire, sauf force=true côté admin).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:docId/release', auth, async (req, res) => {
    try {
        const { docId } = req.params;
        const result = lockService.release(docId, req.user);
        return res.json(result);
    } catch (err) {
        console.error('[document-locks/release] Erreur:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/document-locks?docIds=a,b,c
// Liste les verrous actifs (filtré sur les docIds passés en query, ou tous
// si omis). Utilisé par le client pour afficher l'état "grisé" sur les listes.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
    try {
        let docIds;
        if (req.query.docIds) {
            docIds = String(req.query.docIds).split(',').map(s => s.trim()).filter(Boolean);
        }
        const locks = lockService.list(docIds);
        return res.json({ locks, currentUserId: String(req.user) });
    } catch (err) {
        console.error('[document-locks/list] Erreur:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
