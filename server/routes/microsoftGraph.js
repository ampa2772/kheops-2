// server/routes/microsoftGraph.js
//
// Routes de LECTURE de l'agenda (calendrier) et des contacts Outlook via
// Microsoft Graph. Monté sur /api/microsoft. Réutilise le refresh token
// Microsoft déjà stocké (auth OAuth existante) — aucune nouvelle connexion,
// à ceci près que les nouveaux scopes Calendars.Read/Contacts.Read imposent
// UNE reconnexion aux comptes Microsoft connectés AVANT leur ajout.
//
// Codes d'erreur renvoyés au client (toujours un JSON { error, message }) :
//   401 MICROSOFT_NOT_CONNECTED  — pas de compte Microsoft relié
//   401 MICROSOFT_REAUTH_REQUIRED — jeton expiré/révoqué → reconnexion
//   403 MICROSOFT_SCOPE_MISSING   — agenda/contacts non autorisés → reconnexion
//                                   (l'utilisateur s'est connecté avant l'ajout des scopes)
//   502 MICROSOFT_GRAPH_ERROR     — erreur transverse côté Microsoft

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/middleware-auth');
const User = require('../models/App_Users/User');
const graphExt = require('../utils/microsoftGraphExtended');

// Garde commune : l'utilisateur a-t-il un compte Microsoft relié ?
async function requireMicrosoft(req, res) {
  const user = await User.findById(req.user).select('microsoftRefreshToken').lean();
  if (!user || !user.microsoftRefreshToken) {
    res.status(401).json({
      error: 'MICROSOFT_NOT_CONNECTED',
      message: 'Aucun compte Microsoft connecté. Connectez-vous avec Microsoft pour accéder à votre agenda et vos contacts.',
    });
    return false;
  }
  return true;
}

// Traduit les erreurs internes (Graph/auth) en réponses HTTP stables.
function handleGraphError(res, err) {
  const msg = err && err.message;
  if (msg === 'AUTH_REQUIRED') {
    return res.status(401).json({
      error: 'MICROSOFT_NOT_CONNECTED',
      message: 'Compte Microsoft non connecté.',
    });
  }
  if (msg === 'AUTH_REFRESH_FAILED') {
    return res.status(401).json({
      error: 'MICROSOFT_REAUTH_REQUIRED',
      message: 'Votre connexion Microsoft a expiré. Reconnectez-vous pour continuer.',
    });
  }
  if (msg === 'AUTH_SCOPE_MISSING') {
    return res.status(403).json({
      error: 'MICROSOFT_SCOPE_MISSING',
      message: "L'accès à l'agenda et aux contacts n'a pas encore été autorisé. Reconnectez-vous à Microsoft pour l'accorder.",
    });
  }
  if (msg === 'CALENDAR_RANGE_REQUIRED') {
    return res.status(400).json({
      error: 'CALENDAR_RANGE_REQUIRED',
      message: 'Les paramètres from et to (dates) sont requis.',
    });
  }
  console.error('[microsoftGraph] erreur Graph:', msg);
  return res.status(502).json({
    error: 'MICROSOFT_GRAPH_ERROR',
    message: 'Microsoft a renvoyé une erreur. Réessayez dans un instant.',
  });
}

// GET /api/microsoft/calendar/events?from=ISO&to=ISO&pageToken=
// Fenêtre par défaut : de maintenant à +30 jours si from/to absents.
router.get('/calendar/events', auth, async (req, res) => {
  try {
    if (!(await requireMicrosoft(req, res))) return;

    let { from, to } = req.query;
    if (!from || !to) {
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      from = from || now.toISOString();
      to = to || in30.toISOString();
    }
    const result = await graphExt.listCalendarEvents(req.user, {
      from, to, pageToken: req.query.pageToken,
    });
    return res.json(result);
  } catch (err) {
    return handleGraphError(res, err);
  }
});

// GET /api/microsoft/contacts?pageToken=
router.get('/contacts', auth, async (req, res) => {
  try {
    if (!(await requireMicrosoft(req, res))) return;
    const result = await graphExt.listContacts(req.user, { pageToken: req.query.pageToken });
    return res.json(result);
  } catch (err) {
    return handleGraphError(res, err);
  }
});

module.exports = router;
