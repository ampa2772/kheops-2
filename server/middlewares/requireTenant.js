// server/middlewares/requireTenant.js
//
// Middleware de résolution du CABINET (AUTH-002). À chaîner APRÈS le middleware
// d'authentification `middleware-auth` (qui pose `req.user = userId`).
//
// Pose `req.tenantId` = ObjectId du cabinet de l'utilisateur (créé à la volée si
// absent). C'est le CONTRAT attendu par les modules tenant-scopés (stockage
// interne, e-mail, etc. — cf. AI_COORDINATION.md). Codex doit chaîner :
//     router.use(auth, requireTenant)  // puis lire req.tenantId
//
// Ne bloque pas l'authentification : en cas d'échec de résolution, renvoie 500
// (l'utilisateur reste connecté ; c'est la fonctionnalité tenant qui est en erreur).

const { resolveTenantId } = require('../services/tenantService');

module.exports = async function requireTenant(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ msg: 'Non authentifié.' });
    }
    req.tenantId = await resolveTenantId(req.user);
    return next();
  } catch (err) {
    console.error('[requireTenant] Résolution du cabinet impossible :', err.message);
    return res.status(500).json({ msg: 'Résolution du cabinet impossible.' });
  }
};
