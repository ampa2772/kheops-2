// server/utils/escapeHtml.js
//
// Échappement HTML minimal pour insérer du texte utilisateur dans un corps HTML
// (emails sortants notamment). Convertit les 5 caractères qui, laissés bruts,
// seraient interprétés comme du balisage : & < > " '.
//
// Pourquoi : le corps de mail composé par l'utilisateur est du TEXTE BRUT. Les
// routes d'envoi (mails.js Gmail / microsoftGraphMail.js Outlook) le ré-enveloppent
// dans un `<p>…</p>` (partie HTML du message). Sans échappement :
//   1) un message légitime contenant « si A < B & C » s'affiche cassé chez le
//      destinataire (le « <B … > » est avalé comme une balise) ;
//   2) du HTML/script arbitraire passe tel quel dans le mail sortant.
// L'échappement se fait AVANT la conversion des sauts de ligne en <br>, pour ne
// pas échapper les <br> que l'on insère volontairement.

'use strict';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Échappe les caractères HTML spéciaux d'une chaîne.
 * @param {*} value  valeur à échapper (coercée en chaîne ; null/undefined → '')
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

module.exports = { escapeHtml };
