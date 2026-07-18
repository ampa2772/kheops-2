// server/routes/documentLocks.js
//
// Routes REST pour le verrouillage collaboratif de documents.
// Toutes protégées par le middleware JWT auth — req.user contient l'userId.

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middlewares/middleware-auth');
const lockService = require('../services/documentLockService');
const User = require('../models/App_Users/User');
const Dossier = require('../models/Folder/Dossier');
const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
const { ensureDocOwnership } = require('../utils/ownershipHelpers');
const { getAccessibleUserIds } = require('../services/cabinetAccess');

// Restreint une liste de docIds demandée à ceux qui appartiennent réellement au
// cabinet de l'utilisateur (documents embarqués dans un Dossier accessible).
// Empêche l'énumération des verrous (et donc des displayName/email des
// détenteurs) sur les documents d'un autre cabinet.
async function filterOwnedDocIds(userId, docIds) {
  const valid = (docIds || []).filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (valid.length === 0) return [];
  const accessible = await getAccessibleUserIds(userId);
  const links = await UserDossier.find({ user: { $in: accessible } }).select('dossier').lean();
  const dossierIds = links.map((l) => l.dossier);
  if (dossierIds.length === 0) return [];
  const objIds = valid.map((id) => new mongoose.Types.ObjectId(String(id)));
  const dossiers = await Dossier.find({
    _id: { $in: dossierIds },
    'dossier.documents._id': { $in: objIds },
  }).select('dossier.documents._id').lean();
  const owned = new Set();
  for (const d of dossiers) {
    for (const doc of (d.dossier?.documents || [])) {
      if (doc && doc._id) owned.add(String(doc._id));
    }
  }
  return valid.filter((id) => owned.has(String(id)));
}

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
            // userId/displayName renvoyes pour le marquage OPTIMISTE cote client :
            // sans eux, le client marquait le verrou sans proprietaire et la liste
            // affichait a tort « verrouille par un autre utilisateur » a son propre
            // detenteur (pendant ~5s, jusqu'au poll suivant).
            return res.json({ granted: true, userId: String(req.user), displayName });
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
        // SECURITE rc38 (A1) : docIds est désormais OBLIGATOIRE et filtré aux
        // documents du cabinet. L'ancien comportement (docIds omis → lockService
        // .list() renvoyait TOUS les verrous de toutes les instances, avec le
        // displayName/email du détenteur) fuitait l'identité inter-cabinet.
        if (!req.query.docIds) {
            return res.json({ locks: [], currentUserId: String(req.user) });
        }
        const requested = String(req.query.docIds).split(',').map(s => s.trim()).filter(Boolean);
        const ownedDocIds = await filterOwnedDocIds(req.user, requested);
        const locks = ownedDocIds.length ? lockService.list(ownedDocIds) : [];
        return res.json({ locks, currentUserId: String(req.user) });
    } catch (err) {
        console.error('[document-locks/list] Erreur:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

module.exports = router;
