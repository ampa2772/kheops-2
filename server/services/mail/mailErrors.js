// server/services/mail/mailErrors.js
//
// A18 — Classement des erreurs de messagerie (IMAP/SMTP) en réponses CLAIRES et
// STABLES pour le front. Sans ça, une panne réseau (serveur IMAP injoignable,
// DNS, timeout) remontait en 500 avec un message technique brut
// ("getaddrinfo ENOTFOUND imap...") que l'interface affichait tel quel.

// Codes système Node/réseau typiques d'une connexion impossible.
const NETWORK_CODES = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET',
  'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'ECONNABORTED',
]);

/**
 * Traduit une erreur (bas-niveau ou déjà structurée) en { statusCode, code, message }.
 * @param {Error} err
 * @returns {{statusCode:number, code:string, message:string}}
 */
function classifyMailError(err) {
  if (!err) return { statusCode: 500, code: 'MAIL_ERROR', message: 'Erreur de messagerie.' };

  // 1. Erreur déjà qualifiée par le code métier (validation, 404, quota...) → on respecte.
  if (err.statusCode && err.statusCode !== 500 && err.code) {
    return { statusCode: err.statusCode, code: err.code, message: err.message };
  }

  const raw = String(err.message || '');
  const sysCode = err.code || '';

  // 2. Timeout (distinct : le serveur existe mais ne répond pas).
  if (sysCode === 'ETIMEDOUT' || /\b(timed?\s?out|timeout)\b/i.test(raw)) {
    return {
      statusCode: 504,
      code: 'IMAP_TIMEOUT',
      message: "Votre serveur de messagerie met trop de temps à répondre. Réessayez dans un instant.",
    };
  }

  // 3. Connexion réseau impossible (DNS, refus, hôte injoignable).
  if (NETWORK_CODES.has(sysCode) || /ENOTFOUND|ECONNREFUSED|getaddrinfo|EAI_AGAIN|socket\s+hang\s?up|network/i.test(raw)) {
    return {
      statusCode: 502,
      code: 'IMAP_CONNECTION_FAILED',
      message: "Impossible de joindre votre serveur de messagerie. Vérifiez votre connexion Internet et les réglages du compte (serveur, port).",
    };
  }

  // 4. Authentification refusée par le serveur mail.
  if (/AUTHENTICATIONFAILED|auth(entication)?\s*fail|invalid\s*credential|login\s*fail|password|\[AUTH\]/i.test(raw)) {
    return {
      statusCode: 401,
      code: 'IMAP_AUTH_FAILED',
      message: "Identifiants de messagerie refusés. Vérifiez votre adresse et votre mot de passe (ou mot de passe d'application).",
    };
  }

  // 5. Défaut : on conserve ce qu'on a.
  return {
    statusCode: err.statusCode || 500,
    code: err.code || 'MAIL_ERROR',
    message: err.message || 'Erreur de messagerie.',
  };
}

module.exports = { classifyMailError, NETWORK_CODES };
