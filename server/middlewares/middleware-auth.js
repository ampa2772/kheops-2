const jwt = require('jsonwebtoken');
const { log: secLog, EVT } = require('../utils/securityLogger');
const CompanionSession = require('../models/App_Users/CompanionSession');
const {
  hashCompanionJti,
  companionClaimUserId,
  companionSessionId,
  hasAnyStatefulCompanionClaim,
  hasCompleteStatefulCompanionClaims,
} = require('../utils/companionSessionSecurity');
require('../config/env').loadEnv();

// =====================================================================
// === DEV BYPASS — Authentification fallback en mode dev ============
// Pilote par variable d'environnement KHEOPS_BYPASS_AUTH.
// Bypass actif uniquement si KHEOPS_BYPASS_AUTH='true' explicitement ;
// sinon (absente, autre valeur, build prod) → controle JWT strict
// (sécurité par défaut). Doit rester aligné avec REACT_APP_KHEOPS_BYPASS_AUTH
// côté client (devBypass.js) et chatSocketHandler.js côté serveur.
//
// Comportement BYPASS_AUTH = true :
//   - Si un JWT VALIDE est fourni dans le header Authorization, on l'utilise
//     (permet de tester de vraies connexions Google/Microsoft).
//   - Si aucun JWT, ou si JWT == BYPASS_DEV_TOKEN, ou si JWT invalide,
//     on injecte le user de dev par defaut (Pierre Jalet).
// =====================================================================
const BYPASS_AUTH = process.env.KHEOPS_BYPASS_AUTH === 'true';
const BYPASS_USER_ID = '698941d40c8df05d76c7740e'; // apma2772@gmail.com (Pierre Jalet) — utilisateur de dev par défaut
const BYPASS_DEV_TOKEN = 'dev-bypass-token';        // doit matcher client/src/devBypass.js

function extractToken(req) {
  const authHeader = req.header('Authorization') || req.header('authorization') || req.header('x-auth-token');
  if (!authHeader) return null;
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  return authHeader.trim();
}

function requestPath(req) {
  const raw = req.originalUrl
    || req.url
    || `${req.baseUrl || ''}${req.path || ''}`;
  const path = String(raw || '').split(/[?#]/, 1)[0];
  if (!path) return '';
  const normalized = path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

// Le jeton compagnon est volontairement une capacite tres etroite. Une route
// ajoutee ailleurs dans l'API reste interdite par defaut tant qu'elle n'est pas
// explicitement inscrite ici avec sa methode exacte.
function decodedPathSegment(value) {
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

function isCompanionRequestAllowed(req, claims = null) {
  const method = String(req.method || 'GET').toUpperCase();
  const path = requestPath(req);
  const isSession = method === 'POST' && path === '/api/word/companion/session';
  const isWhoami = method === 'GET' && path === '/api/word/companion/whoami';
  const isRevoke = method === 'POST' && path === '/api/word/companion/revoke';
  const isManifest = method === 'GET' && path === '/api/word/mirror/manifest';
  const downloadMatch = (method === 'GET' || method === 'HEAD')
    ? path.match(/^\/api\/word\/([^/]+)\/download$/)
    : null;
  const syncMatch = method === 'POST' ? path.match(/^\/api\/word\/([^/]+)\/sync$/) : null;
  const lockMatch = method === 'POST'
    ? path.match(/^\/api\/document-locks\/([^/]+)\/(?:acquire|heartbeat|release)$/)
    : null;
  const isGloballyAllowed = isSession || isWhoami || isRevoke || isManifest
    || downloadMatch || syncMatch || lockMatch;
  if (!isGloballyAllowed) return false;

  // Les endpoints de cycle de vie restent accessibles a toute session. Les
  // anciennes sessions sans purpose gardent l'allowlist globale ci-dessus.
  if (isSession || isWhoami || isRevoke) return true;
  const purpose = claims?.companionPurpose;
  if (!purpose || purpose === 'legacy') return true;
  if (purpose === 'mirror') return Boolean(isManifest || downloadMatch || syncMatch);
  if (purpose !== 'word' || !claims?.companionDocId) return false;

  const routeDocId = downloadMatch?.[1] || syncMatch?.[1] || lockMatch?.[1] || null;
  return routeDocId != null
    && decodedPathSegment(routeDocId) === String(claims.companionDocId);
}

function denyCompanion(res, status, error, message) {
  return res.status(status).json({ error, message });
}

async function acceptVerifiedClaims(req, res, next, decoded, source) {
  req.authClaims = decoded;
  req.authTokenType = decoded?.companion === true ? 'companion' : 'user';
  // On conserve la forme historique de req.user pour ne pas modifier les
  // autres routes. Les jetons compagnon emis par Kheops utilisent toujours id.
  req.user = decoded.user || decoded.id;

  if (decoded?.companion !== true) {
    if (source) {
      secLog(EVT.AUTH_TOKEN_VERIFY_OK, { userId: req.user, source }, req);
    }
    return next();
  }

  if (!isCompanionRequestAllowed(req, decoded)) {
    secLog(EVT.AUTH_TOKEN_VERIFY_FAIL, {
      reason: 'companion-scope-forbidden',
      source,
    }, req);
    return denyCompanion(
      res,
      403,
      'COMPANION_TOKEN_SCOPE_FORBIDDEN',
      "Ce jeton compagnon n'est pas autorise sur cette route.",
    );
  }

  // Compatibilite temporaire 1.0.5 : un ancien JWT { companion: true } ne
  // possede aucune claim de session. jwt.verify a deja controle son exp. Toute
  // claim moderne partielle est en revanche refusee (pas de downgrade).
  if (!hasAnyStatefulCompanionClaim(decoded)) {
    req.legacyCompanionToken = true;
    return next();
  }
  if (!hasCompleteStatefulCompanionClaims(decoded)) {
    return denyCompanion(
      res,
      401,
      'COMPANION_SESSION_CLAIMS_INVALID',
      'Le jeton compagnon contient une session incomplete.',
    );
  }

  const userId = companionClaimUserId(decoded);
  const sessionId = companionSessionId(decoded);
  const jtiHash = hashCompanionJti(decoded.jti);
  const now = new Date();
  try {
    const session = await CompanionSession.exists({
      sessionId,
      userId,
      revokedAt: null,
      absoluteExpiresAt: { $gt: now },
      $or: [
        { currentJtiHash: jtiHash },
        {
          previousJtiHash: jtiHash,
          previousValidUntil: { $gt: now },
        },
      ],
    });
    if (!session) {
      return denyCompanion(
        res,
        401,
        'COMPANION_SESSION_INVALID',
        'La session compagnon est expiree, revoquee ou remplacee.',
      );
    }
    req.companionSessionId = sessionId;
    req.companionJtiHash = jtiHash;
    return next();
  } catch (err) {
    secLog(EVT.AUTH_TOKEN_VERIFY_FAIL, {
      reason: `companion-session-store: ${err.name || 'Error'}`,
      source,
    }, req);
    return denyCompanion(
      res,
      503,
      'COMPANION_SESSION_VALIDATION_UNAVAILABLE',
      'La session compagnon ne peut pas etre verifiee pour le moment.',
    );
  }
}

module.exports = async function (req, res, next) {
  const token = extractToken(req);

  if (BYPASS_AUTH) {
    // Mode dev : si un VRAI JWT (pas le token bypass) est fourni, on tente
    // de le verifier. Cela permet de tester de vraies connexions Google ou
    // Microsoft : un user qui se logue avec un autre compte recoit un JWT
    // valide signé avec JWT_SECRET, et le serveur doit le respecter au lieu
    // d'injecter Pierre Jalet.
    if (token && token !== BYPASS_DEV_TOKEN) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return await acceptVerifiedClaims(req, res, next, decoded, 'bypass-with-real-jwt');
      } catch (err) {
        // JWT invalide : on retombe sur le user de dev pour ne pas casser
        // la session bypass (cas typique : token expire en local).
        secLog(EVT.AUTH_TOKEN_VERIFY_FAIL, {
          reason: `bypass-fallback: ${err.name} - ${err.message}`,
          source: 'bypass-with-real-jwt',
        }, req);
      }
    }
    // Pas de token, ou token bypass, ou JWT invalide → user de dev
    req.user = BYPASS_USER_ID;
    secLog(EVT.AUTH_BYPASS_USED, {
      userId: BYPASS_USER_ID,
      source: 'bypass-dev',
      reason: token === BYPASS_DEV_TOKEN ? 'dev-token' : (token ? 'invalid-jwt' : 'no-token'),
    }, req);
    return next();
  }

  // ===== Mode production strict (BYPASS_AUTH = false) =====
  if (!token) {
    secLog(EVT.AUTH_TOKEN_VERIFY_FAIL, { reason: 'no-token' }, req);
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Pas de log de succes pour chaque requete en production (volume).
    return await acceptVerifiedClaims(req, res, next, decoded, null);
  } catch (err) {
    secLog(EVT.AUTH_TOKEN_VERIFY_FAIL, {
      reason: `${err.name}: ${err.message}`,
    }, req);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

module.exports._isCompanionRequestAllowed = isCompanionRequestAllowed;
module.exports._requestPath = requestPath;
