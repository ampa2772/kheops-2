// client/src/utils/sanitizeEmailHtml.js
//
// A13 — Sanitisation DURCIE du HTML des e-mails (Gmail/Outlook) avant rendu via
// dangerouslySetInnerHTML. Le HTML d'un e-mail est du contenu 100 % NON FIABLE.
//
// La config par défaut de DOMPurify strippe déjà scripts / handlers / URI
// javascript:, MAIS elle autorise <form>/<input>/<button> (vecteurs de phishing
// : un faux formulaire postant vers un serveur attaquant) et n'ajoute pas de
// protection contre le reverse tabnabbing sur les liens. On applique donc une
// allowlist stricte adaptée à la mise en forme d'e-mails + un hook qui sécurise
// les liens (nouvel onglet, noopener/noreferrer).

import DOMPurify from 'dompurify';

// Hook installé une seule fois : sécurise les liens et neutralise les cibles
// injectées. Isolé dans une fonction pour éviter les doublons de hook.
let hookInstalled = false;
function ensureHook() {
  if (hookInstalled || typeof DOMPurify.addHook !== 'function') return;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      // Liens : toujours nouvel onglet + coupe l'accès à window.opener (anti
      // reverse-tabnabbing) + nofollow.
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    }
    // Ceinture+bretelles : retire tout gestionnaire d'événement résiduel.
    if (node.attributes) {
      for (let i = node.attributes.length - 1; i >= 0; i -= 1) {
        const name = node.attributes[i].name;
        if (/^on/i.test(name)) node.removeAttribute(name);
      }
    }
  });
  hookInstalled = true;
}

const EMAIL_CONFIG = {
  ALLOWED_TAGS: [
    'a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins',
    'p', 'br', 'hr', 'span', 'div', 'blockquote', 'pre', 'code',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup',
    'img', 'figure', 'figcaption', 'sub', 'sup', 'small', 'mark', 'abbr', 'cite', 'q',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'alt', 'src', 'width', 'height', 'align', 'valign',
    'colspan', 'rowspan', 'style', 'dir', 'bgcolor', 'border', 'cellpadding', 'cellspacing',
  ],
  // On interdit EXPLICITEMENT les vecteurs de phishing / d'exfiltration, même
  // si certains ne sont pas dans l'allowlist ci-dessus (défense en profondeur).
  FORBID_TAGS: [
    'form', 'input', 'button', 'textarea', 'select', 'option',
    'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'title', 'svg', 'math',
  ],
  FORBID_ATTR: ['srcset', 'ping', 'formaction', 'form', 'target'],
  ALLOW_DATA_ATTR: false,
  // Schémas d'URI autorisés : http(s), mailto, tel, cid (images inline e-mail).
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

/**
 * Sanitise le corps HTML d'un e-mail avec une politique durcie.
 * @param {string} html
 * @returns {string} HTML sûr à injecter via dangerouslySetInnerHTML.
 */
export function sanitizeEmailHtml(html) {
  ensureHook();
  return DOMPurify.sanitize(html || '', EMAIL_CONFIG);
}

export default sanitizeEmailHtml;
