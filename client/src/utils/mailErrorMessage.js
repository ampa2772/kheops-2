// client/src/utils/mailErrorMessage.js
//
// A18 — Traduit une erreur de messagerie (erreur axios ou code renvoyé par le
// serveur) en message CLAIR et actionnable pour l'utilisateur, avec deux
// indications utiles à l'interface :
//   - retryable : proposer un bouton « Réessayer » ;
//   - transient : NE PAS vider la liste des mails (panne passagère), contrairement
//                 à une erreur de session/identifiants.

/**
 * @param {object} error  erreur axios (error.response, error.request) ou {code}
 * @returns {{category:string, message:string, retryable:boolean, transient:boolean}}
 */
export function classifyMailError(error) {
  const resp = error && error.response;
  const serverCode = resp && resp.data && resp.data.code;
  const serverMsg = resp && resp.data && resp.data.message;
  const status = resp && resp.status;

  // 1. Aucune réponse du serveur applicatif → hors-ligne / serveur injoignable.
  if (error && error.request && !resp) {
    return {
      category: 'offline',
      message: "Connexion au serveur perdue. Vérifiez votre connexion Internet, puis réessayez.",
      retryable: true,
      transient: true,
    };
  }

  // 2. Codes réseau/IMAP renvoyés par le serveur (voir services/mail/mailErrors.js).
  if (serverCode === 'IMAP_CONNECTION_FAILED' || serverCode === 'IMAP_TIMEOUT') {
    return {
      category: 'mail-network',
      message: serverMsg || "Impossible de joindre votre serveur de messagerie. Réessayez dans un instant.",
      retryable: true,
      transient: true,
    };
  }

  // 3. Identifiants de messagerie refusés → reconfiguration nécessaire (non passager).
  if (serverCode === 'IMAP_AUTH_FAILED') {
    return {
      category: 'mail-auth',
      message: serverMsg || "Identifiants de messagerie refusés. Vérifiez les réglages de votre boîte mail.",
      retryable: false,
      transient: false,
    };
  }

  // 4. Session Kheops expirée / non autorisée.
  if (status === 401 || status === 403) {
    return {
      category: 'session',
      message: "Votre session a expiré. Reconnectez-vous.",
      retryable: false,
      transient: false,
    };
  }

  // 5. Défaut.
  return {
    category: 'generic',
    message: serverMsg || (error && error.message) || 'Une erreur est survenue.',
    retryable: true,
    transient: false,
  };
}

export default classifyMailError;
