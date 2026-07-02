// client/src/utils/mailSetupDecision.js
//
// Décision : faut-il proposer à l'utilisateur de connecter sa boîte mail
// (fenêtre IMAP/SMTP) ? Utilisé par la cloche de notifications ET la page
// Courriers, pour une règle unique.
//
// Règle : un compte Google/Microsoft reçoit ses mails automatiquement (OAuth).
// Un compte "générique" (Yahoo, Orange/Wanadoo, OVH...) n'en reçoit que s'il a
// saisi les coordonnées de sa boîte → on le lui propose tant qu'aucune n'existe.

/** @returns {boolean} true si l'utilisateur est connecté via Google ou Microsoft. */
export function userHasOAuthMail(user) {
  return !!(user && (user.googleRefreshToken || user.microsoftRefreshToken));
}

/**
 * @param {object} user            l'utilisateur courant (state.login.user)
 * @param {Array|null} imapAccounts liste des boîtes IMAP (null = pas encore vérifié)
 * @returns {boolean} true si on doit proposer la connexion d'une boîte mail.
 */
export function shouldOfferMailSetup(user, imapAccounts) {
  if (userHasOAuthMail(user)) return false;          // OAuth → rien à faire
  if (!Array.isArray(imapAccounts)) return false;    // vérification pas terminée
  return imapAccounts.length === 0;                  // aucune boîte configurée
}
