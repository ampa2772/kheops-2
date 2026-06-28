const jwt = require('jsonwebtoken');
const { log: secLog, EVT } = require('../utils/securityLogger');
require('dotenv').config();

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

module.exports = function (req, res, next) {
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
        req.user = decoded.user || decoded.id;
        secLog(EVT.AUTH_TOKEN_VERIFY_OK, { userId: req.user, source: 'bypass-with-real-jwt' }, req);
        return next();
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
    // Le payload JWT est { id: ... } (voir auth.js) ou parfois { user: { id: ... } }
    req.user = decoded.user || decoded.id;
    // Note : on ne loggue PAS chaque AUTH_TOKEN_VERIFY_OK en prod (volume trop élevé).
    // Seuls les échecs sont loggés. Pour activer les logs de succès, décommenter :
    // secLog(EVT.AUTH_TOKEN_VERIFY_OK, { userId: req.user }, req);
    next();
  } catch (err) {
    secLog(EVT.AUTH_TOKEN_VERIFY_FAIL, {
      reason: `${err.name}: ${err.message}`,
    }, req);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};
