// client/src/services/speechService.js
import { useRef } from 'react';
import store from '../redux/store';

// Vérifie si l'API Web Speech est disponible dans le navigateur
const isSpeechSupported = 'speechSynthesis' in window;
let voicesLoaded = false;

// Suivi de l'état de la touche ET du texte actuellement survolé
let isCtrlPressed = false; // <<< RENOMMÉ pour plus de clarté
let currentlyHoveredElementText = null;

// --- GESTIONNAIRES CLAVIER (MODIFIÉS) ---
const handleKeyDown = (event) => {
  // MODIFICATION : On ne vérifie plus la position, juste la touche "Control"
  if (event.key === 'Control') {
    if (!isCtrlPressed) {
      isCtrlPressed = true;
      // On déclenche la parole avec le texte actuellement survolé (s'il y en a un)
      speak(currentlyHoveredElementText);
    }
  }
};

const handleKeyUp = (event) => {
  // MODIFICATION : On ne vérifie plus la position
  if (event.key === 'Control') {
    isCtrlPressed = false;
    // On arrête toute lecture en cours quand la touche est relâchée
    stopSpeaking();
  }
};

// Attacher les écouteurs d'événements à la fenêtre
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
}


// =====================================================================
// LECTURE AUTOMATIQUE DES CHAMPS DE FORMULAIRES (mode inclusivite + voix)
// ---------------------------------------------------------------------
// Un seul ecouteur global lit tout <input>, <textarea> ou <select> au
// survol — sans qu'il soit necessaire d'envelopper chaque champ avec un
// HoverToSpeak. La voix annonce le libelle (label associe, aria-label,
// placeholder, name) et l'etat courant (contenu / coche / selection).
// =====================================================================

const getSpeechEnabled = () => {
  try {
    return !!store.getState().login.user?.isSpeechEnabled;
  } catch (e) {
    return false;
  }
};

const isFieldNode = (el) => {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const t = (el.type || 'text').toLowerCase();
    return !['hidden', 'submit', 'button', 'reset', 'image'].includes(t);
  }
  return false;
};

const getFieldLabel = (el) => {
  // 1. aria-label / aria-labelledby
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ref = document.getElementById(labelledBy);
    if (ref?.textContent) return ref.textContent.trim();
  }
  // 2. <label for="id">
  if (el.id) {
    const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (lbl?.textContent) return lbl.textContent.trim();
  }
  // 3. <label> englobant
  let parent = el.parentElement;
  let depth = 0;
  while (parent && depth < 6) {
    if (parent.tagName === 'LABEL') {
      // Texte du label sans le contenu de l'input
      const clone = parent.cloneNode(true);
      clone.querySelectorAll('input, textarea, select').forEach(n => n.remove());
      const txt = clone.textContent.trim();
      if (txt) return txt;
      break;
    }
    parent = parent.parentElement;
    depth++;
  }
  // 4. placeholder
  if (el.placeholder) return el.placeholder.trim();
  // 5. title
  if (el.title) return el.title.trim();
  // 6. name
  if (el.name) return el.name.trim();
  return 'champ';
};

const describeFieldState = (el) => {
  const tag = el.tagName;
  if (tag === 'SELECT') {
    const selected = el.options[el.selectedIndex];
    if (!selected || selected.value === '') return 'aucune valeur selectionnee. Choisissez une option.';
    return `selection actuelle: ${selected.text}. Choisissez une option.`;
  }
  if (tag === 'INPUT') {
    const t = (el.type || 'text').toLowerCase();
    if (t === 'checkbox') return el.checked ? 'cochee' : 'decochee';
    if (t === 'radio') return el.checked ? 'selectionne' : 'non selectionne';
    if (t === 'range') return `valeur: ${el.value}`;
    if (t === 'color') return `couleur: ${el.value}`;
    if (t === 'file') {
      const n = el.files?.length || 0;
      return n ? `${n} fichier${n > 1 ? 's' : ''} selectionne${n > 1 ? 's' : ''}` : 'aucun fichier selectionne';
    }
  }
  const val = (el.value || '').toString();
  return val ? `contenu: ${val}` : 'vide, saisissez une valeur';
};

const fieldTypePrefix = (el) => {
  const tag = el.tagName;
  if (tag === 'SELECT') return 'Liste deroulante';
  if (tag === 'TEXTAREA') return 'Zone de texte';
  if (tag === 'INPUT') {
    const t = (el.type || 'text').toLowerCase();
    if (t === 'checkbox') return 'Case a cocher';
    if (t === 'radio') return 'Bouton radio';
    if (t === 'date' || t === 'datetime-local') return 'Champ date';
    if (t === 'time') return 'Champ heure';
    if (t === 'email') return 'Champ email';
    if (t === 'tel') return 'Champ telephone';
    if (t === 'number') return 'Champ numerique';
    if (t === 'password') return 'Champ mot de passe';
    if (t === 'search') return 'Champ de recherche';
    if (t === 'url') return 'Champ URL';
    if (t === 'range') return 'Curseur';
    if (t === 'color') return 'Selecteur de couleur';
    if (t === 'file') return 'Champ fichier';
    return 'Champ';
  }
  return 'Champ';
};

const speakField = (el) => {
  try {
    const prefix = fieldTypePrefix(el);
    const label = getFieldLabel(el);
    const state = describeFieldState(el);
    speak(`${prefix} ${label}, ${state}`);
  } catch (_) { /* silencieux */ }
};

// --- Items de listes/menus deroulants custom (role ARIA) ---
const ROLE_SELECTOR = '[role="option"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="tab"],[role="treeitem"]';

const findInteractiveItem = (el) => {
  if (!el || typeof el.closest !== 'function') return null;
  return el.closest(ROLE_SELECTOR);
};

const speakInteractiveItem = (el) => {
  try {
    const role = el.getAttribute('role');
    const ariaLabel = el.getAttribute('aria-label');
    const text = (ariaLabel || el.textContent || '').trim();
    if (!text) return;
    const selected = el.getAttribute('aria-selected') === 'true';
    const checked = el.getAttribute('aria-checked');
    const disabled = el.getAttribute('aria-disabled') === 'true';
    const prefix = role === 'option' ? 'Option'
      : role === 'menuitem' || role === 'menuitemcheckbox' || role === 'menuitemradio' ? 'Menu'
      : role === 'tab' ? 'Onglet'
      : role === 'treeitem' ? 'Element'
      : 'Element';
    let suffix = '';
    if (selected) suffix += ', selectionne';
    if (checked === 'true') suffix += ', coche';
    else if (checked === 'false') suffix += ', non coche';
    if (disabled) suffix += ', desactive';
    speak(`${prefix}: ${text}${suffix}`);
  } catch (_) { /* silencieux */ }
};

let _lastHoveredField = null;

const handleGlobalMouseOver = (e) => {
  if (!getSpeechEnabled()) {
    _lastHoveredField = null;
    return;
  }
  const target = e.target;
  if (isFieldNode(target)) {
    if (_lastHoveredField === target) return; // deja annonce
    _lastHoveredField = target;
    speakField(target);
    return;
  }
  // Items de liste/menu custom (profession, onglets, options ARIA, etc.)
  const item = findInteractiveItem(target);
  if (item) {
    if (_lastHoveredField === item) return;
    _lastHoveredField = item;
    speakInteractiveItem(item);
    return;
  }
  if (_lastHoveredField) {
    // Souris sortie d'un champ ou item vers un element non-pertinent
    _lastHoveredField = null;
    stopSpeaking();
  }
};

const handleGlobalFocusIn = (e) => {
  if (!getSpeechEnabled()) return;
  const target = e.target;
  if (isFieldNode(target) && _lastHoveredField !== target) {
    _lastHoveredField = target;
    speakField(target);
    return;
  }
  const item = findInteractiveItem(target);
  if (item && _lastHoveredField !== item) {
    _lastHoveredField = item;
    speakInteractiveItem(item);
  }
};

if (typeof window !== 'undefined') {
  // Capture pour intercepter avant les handlers locaux ; passive pour ne pas bloquer
  window.addEventListener('mouseover', handleGlobalMouseOver, true);
  window.addEventListener('focusin', handleGlobalFocusIn, true);
}


/**
 * Initialise le moteur de synthèse vocale. (INCHANGÉ)
 */
export const initializeSpeechSynthesis = () => {
  if (!isSpeechSupported || voicesLoaded) return;

  const getVoices = () => {
    try {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        voicesLoaded = true;
        window.speechSynthesis.removeEventListener('voiceschanged', getVoices);
      }
    } catch (e) {
      console.error("Erreur lors de l'accès aux voix de synthèse:", e);
    }
  };

  window.speechSynthesis.addEventListener('voiceschanged', getVoices);
  getVoices();
};


/**
 * Lit un texte à voix haute en utilisant l'API Web Speech. (MODIFIÉ)
 */
export const speak = (text) => {
  // La lecture se déclenche au simple survol quand le mode accessibilité est actif
  // (le composant HoverToSpeak vérifie déjà isSpeechEnabled avant d'appeler speak())
  if (!isSpeechSupported || !text) {
    return;
  }

  stopSpeaking();
  const processedText = text.replace(/\s+c\/\s+/gi, ' contre ');
  const utterance = new SpeechSynthesisUtterance(processedText);
  utterance.lang = 'fr-FR';
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  window.speechSynthesis.speak(utterance);
};

/**
 * Arrête immédiatement toute lecture en cours. (INCHANGÉ)
 */
export const stopSpeaking = () => {
  if (isSpeechSupported) {
    window.speechSynthesis.cancel();
  }
};

/**
 * === HOOK MODIFIÉ ===
 * Il mémorise le texte survolé et tente de lire si la touche CTRL est déjà enfoncée.
 */
export const useHoverToSpeak = (textToSpeak, isEnabled) => {

  const handleMouseEnter = () => {
    if (isEnabled) {
      // 1. Mémoriser le texte de l'élément survolé
      currentlyHoveredElementText = textToSpeak;
      
      // 2. Tenter de lire immédiatement. La fonction speak() vérifiera si CTRL est déjà enfoncée.
      //    Ceci gère le cas où l'utilisateur maintient CTRL et déplace la souris d'un élément à l'autre.
      speak(textToSpeak);
    }
  };

  const handleMouseLeave = () => {
    if (isEnabled) {
      // Quand la souris quitte, on efface le texte mémorisé et on arrête la parole.
      currentlyHoveredElementText = null;
      stopSpeaking();
    }
  };

  return {
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
  };
};