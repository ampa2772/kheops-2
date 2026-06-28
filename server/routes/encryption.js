// Kheops_2/server/routes/encryption.js
//
// Routes REST pour la configuration de chiffrement E2E d'un cabinet.
//
// Le serveur ne fait que stocker le sel public et le verifier HMAC envoyes
// par le client. Il ne genere ni ne manipule aucune cle ni phrase secrete.
//
// Endpoints :
//   POST /api/encryption/setup    — premiere activation
//   GET  /api/encryption/info     — recuperer la config pour deriver localement
//   POST /api/encryption/verify   — verifier qu'une MasterKey derivee correspond
//
// Voir DESIGN_CHIFFREMENT_E2E.md sections 6.1 (creation cabinet), 6.2 (ajout
// avocat) et 7.2 (routes a creer).

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const auth = require('../middlewares/middleware-auth');
const { asyncHandler } = require('../middlewares/folder-middleWare');
const CabinetEncryption = require('../models/Cabinet/CabinetEncryption');

// ============================================================
// Helpers internes
// ============================================================
function getOwnerUserId(req) {
  return req.user ? String(req.user) : null;
}

function jsonValidationErr(res, msg) {
  return res.status(400).json({ message: msg });
}

/**
 * Verifie qu'une chaine est bien hexadecimale d'une longueur exacte (sans
 * tenir compte de la casse).
 */
function isHexOfLength(v, length) {
  return typeof v === 'string' && new RegExp('^[0-9a-f]{' + length + '}$', 'i').test(v);
}

/**
 * Comparaison en temps constant de deux chaines hexadecimales de meme
 * longueur. Necessaire pour eviter les attaques par mesure du temps de
 * reponse cote API.
 */
function safeHexCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch (_) {
    return false;
  }
}

// ============================================================
// POST /api/encryption/setup
// ------------------------------------------------------------
// Active la protection des documents pour le cabinet de l'utilisateur
// connecte. A appeler une seule fois lors de la creation d'un cabinet
// (situation A du design — modale "Configurer maintenant").
//
// Body : { salt: string hex 32 chars, verifier: string hex 64 chars }
// Reponses :
//   201 { encryption: { ... } }       — activation reussie
//   400                              — entrees invalides
//   401                              — non authentifie
//   409                              — protection deja active (utiliser
//                                       /rotate pour changer la phrase)
// ============================================================
router.post('/setup', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const body = req.body || {};
  if (!isHexOfLength(body.salt, 32)) {
    return jsonValidationErr(res, 'salt doit etre une chaine hexadecimale de 32 caracteres.');
  }
  if (!isHexOfLength(body.verifier, 64)) {
    return jsonValidationErr(res, 'verifier doit etre une chaine hexadecimale de 64 caracteres.');
  }

  // Verifier qu'il n'y a pas deja une config active pour ce cabinet
  let existing = await CabinetEncryption.findOne({ ownerUserId });
  if (existing && existing.enabled) {
    return res.status(409).json({
      message: 'La protection est deja active pour ce cabinet. Utiliser une route de rotation pour changer la phrase secrete.',
    });
  }

  // Cas : un document existe deja mais enabled=false (cabinet qui a cliqué
  // sur "Plus tard" puis revient pour "Configurer maintenant"). On met a jour.
  if (existing) {
    existing.salt = body.salt.toLowerCase();
    existing.verifier = body.verifier.toLowerCase();
    existing.enabled = true;
    existing.enabledAt = new Date();
    existing.version = 2;
    await existing.save();
  } else {
    existing = new CabinetEncryption({
      ownerUserId,
      salt: body.salt.toLowerCase(),
      verifier: body.verifier.toLowerCase(),
      enabled: true,
      enabledAt: new Date(),
      version: 2,
    });
    await existing.save();
  }

  res.status(201).json({
    encryption: {
      enabled: existing.enabled,
      salt: existing.salt,
      verifier: existing.verifier,
      enabledAt: existing.enabledAt,
      version: existing.version,
    },
  });
}));

// ============================================================
// GET /api/encryption/info
// ------------------------------------------------------------
// Renvoie l'etat de la protection pour le cabinet de l'utilisateur connecte.
//
// Utilise par le client pour decider quelle modale afficher au login :
//   - enabled=false                 -> modale situation A ("Configurer maintenant"/"Plus tard")
//   - enabled=true, machine enrolee -> rien, demarrage normal
//   - enabled=true, machine vierge  -> modale situation B ("Saisissez la phrase secrete")
//
// Le client utilise `salt` pour deriver la MasterKey, puis `verifier` pour
// auto-controler localement avant d'envoyer une requete /verify au serveur.
//
// Reponses :
//   200 { encryption: { enabled, salt, verifier, enabledAt, version } }
//   401
// ============================================================
router.get('/info', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const config = await CabinetEncryption.findOne({ ownerUserId }).lean();
  if (!config) {
    return res.json({
      encryption: {
        enabled: false,
        salt: null,
        verifier: null,
        enabledAt: null,
        version: null,
      },
    });
  }

  res.json({
    encryption: {
      enabled: config.enabled,
      salt: config.salt,
      verifier: config.verifier,
      enabledAt: config.enabledAt,
      version: config.version,
    },
  });
}));

// ============================================================
// POST /api/encryption/verify
// ------------------------------------------------------------
// Verifie qu'un verifier soumis par le client correspond a celui enregistre
// pour le cabinet. Utilise pour confirmer cote serveur qu'une phrase
// secrete saisie est correcte (situation B du design).
//
// Body : { verifier: string hex 64 chars }
// Reponses :
//   200 { ok: true }   — verifier correspond
//   200 { ok: false }  — verifier ne correspond pas (pas de 401 pour eviter
//                       les fuites d'info supplementaires)
//   400                — entree mal formee
//   401                — non authentifie
//   404                — pas de config encryption pour ce cabinet
// ============================================================
router.post('/verify', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const body = req.body || {};
  if (!isHexOfLength(body.verifier, 64)) {
    return jsonValidationErr(res, 'verifier doit etre une chaine hexadecimale de 64 caracteres.');
  }

  const config = await CabinetEncryption.findOne({ ownerUserId });
  if (!config || !config.enabled) {
    return res.status(404).json({
      ok: false,
      message: 'Aucune protection active pour ce cabinet.',
    });
  }

  const ok = safeHexCompare(config.verifier, body.verifier.toLowerCase());

  // Audit non-bloquant
  config.verifyAttempts = (config.verifyAttempts || 0) + 1;
  if (ok) {
    config.lastVerifiedAt = new Date();
  }
  await config.save();

  res.json({ ok });
}));

module.exports = router;
