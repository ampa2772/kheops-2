/**
 * Contrat frontend unique des methodes d'ouverture documentaires.
 *
 * Les valeurs correspondent exactement a celles acceptees par
 * /api/document-opening/preferences. Les deux premiers modes sont des
 * preferences de comportement ; les quatre suivants sont de vrais editeurs.
 */
export const DOCUMENT_OPENING_MODES = Object.freeze({
  AUTOMATIC: 'automatic',
  ASK: 'ask',
  KHEOPS: 'kheops',
  WORD_DESKTOP: 'word_desktop',
  WORD_WEB: 'word_web',
  GOOGLE_DOCS: 'google_docs',
  BROWSER_PREVIEW: 'browser_preview',
});

export const DOCUMENT_EDITOR_MODES = Object.freeze([
  DOCUMENT_OPENING_MODES.KHEOPS,
  DOCUMENT_OPENING_MODES.WORD_DESKTOP,
  DOCUMENT_OPENING_MODES.WORD_WEB,
  DOCUMENT_OPENING_MODES.GOOGLE_DOCS,
]);

// Action ponctuelle de lecture, volontairement absente des préférences
// persistées : elle ne modifie ni les enums User/Dossier/Tenant ni le dernier
// éditeur choisi.
export const DOCUMENT_VIEWER_MODES = Object.freeze([
  DOCUMENT_OPENING_MODES.BROWSER_PREVIEW,
]);

export const DOCUMENT_OPENING_ACTION_MODES = Object.freeze([
  ...DOCUMENT_VIEWER_MODES,
  ...DOCUMENT_EDITOR_MODES,
]);

export const DOCUMENT_PREFERENCE_MODES = Object.freeze([
  DOCUMENT_OPENING_MODES.AUTOMATIC,
  DOCUMENT_OPENING_MODES.ASK,
  ...DOCUMENT_EDITOR_MODES,
]);

export const DOCUMENT_OPENING_SCOPES = Object.freeze({
  ONCE: 'once',
  DOCUMENT: 'document',
  GLOBAL: 'global',
});

export const DOCUMENT_OPENING_META = Object.freeze({
  automatic: {
    label: 'Automatique — recommandé',
    shortLabel: 'Automatique',
    description: 'Kheops 2 choisit la méthode disponible la plus adaptée au document.',
  },
  ask: {
    label: 'Toujours demander',
    shortLabel: 'Toujours demander',
    description: 'Affiche le choix des méthodes à chaque ouverture.',
  },
  kheops: {
    label: 'Éditeur Kheops',
    shortLabel: 'Éditeur Kheops',
    description: 'Modifiez le document directement dans Kheops 2, sans installation supplémentaire.',
    badge: 'Dans Kheops 2',
  },
  word_desktop: {
    label: 'Microsoft Word sur cet ordinateur',
    shortLabel: 'Microsoft Word',
    description: "Utilisez l'application Word installée sur votre ordinateur avec le compagnon Kheops 2.",
    badge: 'Application locale',
  },
  word_web: {
    label: 'Word pour le web avec OneDrive',
    shortLabel: 'Word pour le web',
    description: 'Modifiez le document dans votre navigateur avec votre compte Microsoft.',
    badge: 'Navigateur',
  },
  google_docs: {
    label: 'Google Docs',
    shortLabel: 'Google Docs',
    description: 'Modifiez le document dans votre navigateur avec votre compte Google.',
    badge: 'Navigateur',
  },
  browser_preview: {
    label: 'Lire dans Kheops 2',
    shortLabel: 'Lecture Kheops 2',
    description: 'Consultez le fichier texte dans le navigateur, en lecture seule.',
    badge: 'Lecture seule',
  },
});

const DEFAULT_UNAVAILABLE_REASONS = Object.freeze({
  kheops: "L'Éditeur Kheops n'est pas disponible pour ce document.",
  word_desktop: "Le compagnon Kheops 2 n'est pas joignable sur cet ordinateur.",
  word_web: 'Connectez un compte Microsoft avec OneDrive pour utiliser Word pour le web.',
  google_docs: 'Connectez un compte Google Drive pour utiliser Google Docs.',
  browser_preview: "La lecture de ce fichier dans le navigateur n'est pas disponible.",
});

export const DOCUMENT_OPENING_REASON_MESSAGES = Object.freeze({
  COMPANION_CHECK_REQUIRED: 'Vérification du compagnon Kheops 2 nécessaire sur cet ordinateur.',
  GOOGLE_ACCOUNT_REQUIRED: 'Connectez votre compte Google Drive pour utiliser Google Docs.',
  GOOGLE_CONNECTION_UNAVAILABLE: 'Votre connexion Google Drive doit être renouvelée.',
  MICROSOFT_ACCOUNT_REQUIRED: 'Connectez votre compte Microsoft et OneDrive pour utiliser Word pour le web.',
  MICROSOFT_CONNECTION_UNAVAILABLE: 'Votre connexion Microsoft doit être renouvelée.',
  METHOD_FORBIDDEN_BY_POLICY: "Cette méthode n'est pas autorisée par la politique de votre cabinet.",
  CABINET_METHOD_ENFORCED: "Votre cabinet impose une autre méthode d'ouverture.",
  PERSONAL_CLOUDS_DISABLED: "Les espaces cloud personnels sont désactivés par votre cabinet.",
  DOCX_REQUIRED: 'Cette méthode accepte uniquement les documents Word au format .docx.',
  WORD_DOCUMENT_REQUIRED: 'Cette méthode accepte uniquement les documents Microsoft Word (.doc ou .docx).',
  TXT_KHEOPS_COPY_REQUIRED: "L'édition texte Kheops n'est pas disponible pour ce fichier .txt.",
  TXT_NATIVE_COMPANION_UNAVAILABLE: "Le compagnon actuel ne sait pas encore ouvrir et resynchroniser les fichiers .txt avec l'application native de l'ordinateur.",
  TXT_WORD_ONLINE_IMPORT_REQUIRED: "Word pour le web nécessite d'abord la création explicite d'une copie Word .docx.",
  TXT_GOOGLE_IMPORT_REQUIRED: "Google Docs nécessite d'abord un import explicite du fichier texte.",
  TXT_GOOGLE_CONVERSION_DISABLED: "L'import des fichiers texte vers Google Docs n'est pas autorisé par la politique documentaire du cabinet.",
  COMPLEX_DOCUMENT_WORD_RECOMMENDED: 'Ce document contient des éléments Word complexes. Microsoft Word est recommandé pour mieux préserver sa mise en page.',
});

export function getDocumentOpeningReasonMessage(reason, mode) {
  if (!reason) return null;
  return DOCUMENT_OPENING_REASON_MESSAGES[reason]
    || (String(reason).includes('_') ? DEFAULT_UNAVAILABLE_REASONS[mode] : reason);
}

export function isDocumentEditorMode(mode) {
  return DOCUMENT_EDITOR_MODES.includes(mode);
}

export function isDocumentOpeningActionMode(mode) {
  return DOCUMENT_OPENING_ACTION_MODES.includes(mode);
}

export function isDocumentPreferenceMode(mode) {
  return DOCUMENT_PREFERENCE_MODES.includes(mode);
}

export function getOpeningModeMeta(mode) {
  return DOCUMENT_OPENING_META[mode] || {
    label: mode || 'Méthode inconnue',
    shortLabel: mode || 'Méthode inconnue',
    description: '',
  };
}

/**
 * Accepte le contrat officiel ({ methods }) et quelques enveloppes anciennes
 * afin qu'un déploiement progressif frontend/backend ne casse pas l'écran.
 */
export function normalizeDocumentOpeningAvailability(payload = {}) {
  const source = payload.methods || payload.modes || payload.availability || {};
  const methods = {};

  DOCUMENT_OPENING_ACTION_MODES.forEach((mode) => {
    const raw = source[mode];
    const entry = typeof raw === 'boolean' ? { available: raw } : (raw || {});
    let available = entry.available;
    if (available !== true && available !== false && available !== null) {
      available = false;
    }
    methods[mode] = {
      ...entry,
      applicable: raw !== undefined && entry.applicable !== false,
      available,
      reasonCode: DOCUMENT_OPENING_REASON_MESSAGES[entry.reason] ? entry.reason : (entry.reasonCode || null),
      reason: getDocumentOpeningReasonMessage(entry.reason, mode)
        || (available === false ? DEFAULT_UNAVAILABLE_REASONS[mode] : null),
    };
  });

  const recommendedCandidate = payload.recommendedMode || payload.recommended || null;
  const recommendedMode = isDocumentOpeningActionMode(recommendedCandidate)
    ? recommendedCandidate
    : null;

  return {
    ...payload,
    methods,
    recommendedMode,
    preference: normalizeDocumentOpeningPreference(payload.preference),
    userPreference: normalizeDocumentOpeningPreference(
      payload.userPreference || payload.preference
    ),
    documentPreference: normalizeDocumentSpecificOpeningPreference(
      payload.documentPreference
    ),
    compatibility: normalizeDocumentCompatibility(payload.compatibility),
    policy: payload.policy || null,
  };
}

export function normalizeDocumentSpecificOpeningPreference(payload = {}) {
  const source = payload && payload.documentPreference
    ? payload.documentPreference
    : payload;
  const mode = isDocumentPreferenceMode(source?.mode || source?.openingMode)
    ? (source.mode || source.openingMode)
    : null;
  return {
    ...(source || {}),
    mode,
    configured: Boolean(source?.configured && mode),
  };
}

export function normalizeDocumentCompatibility(payload) {
  if (!payload || !['complete', 'partial', 'complex'].includes(payload.level)) return null;
  const labels = {
    complete: 'Compatibilité complète',
    partial: 'Compatibilité partielle',
    complex: 'Document complexe',
  };
  return {
    ...payload,
    label: payload.label || labels[payload.level],
    warnings: Array.isArray(payload.warnings) ? payload.warnings.filter(Boolean) : [],
    recommendationReason: payload.recommendationReason
      || (payload.level === 'complex' ? 'COMPLEX_DOCUMENT_WORD_RECOMMENDED' : null),
  };
}

export function normalizeDocumentOpeningPreference(payload = {}) {
  const source = payload && payload.preference ? payload.preference : payload;
  const rawMode = source && (source.mode || source.defaultMode || source.openingMode);
  const mode = isDocumentPreferenceMode(rawMode) ? rawMode : DOCUMENT_OPENING_MODES.ASK;
  const lastUsedMode = isDocumentEditorMode(source && source.lastUsedMode)
    ? source.lastUsedMode
    : null;
  return {
    ...(source || {}),
    mode,
    lastUsedMode,
    rememberChoice: !!(source && source.rememberChoice),
  };
}

export function getAvailableDocumentEditors(availability) {
  const normalized = normalizeDocumentOpeningAvailability(availability);
  return DOCUMENT_EDITOR_MODES.filter((mode) => normalized.methods[mode].available === true);
}

export function getAvailableDocumentOpeningActions(availability) {
  const normalized = normalizeDocumentOpeningAvailability(availability);
  return DOCUMENT_OPENING_ACTION_MODES.filter((mode) => normalized.methods[mode].available === true);
}

export function chooseRecommendedDocumentEditor(availability, preference) {
  const normalized = normalizeDocumentOpeningAvailability(availability);
  const available = getAvailableDocumentOpeningActions(normalized);
  const normalizedPreference = normalizeDocumentOpeningPreference(
    preference || normalized.preference
  );

  // Une méthode explicitement choisie par l'utilisateur reste prioritaire sur
  // toute recommandation automatique, y compris après la détection locale du
  // compagnon. Sans ce garde-fou, un DOCX complexe pouvait être de nouveau
  // présenté comme devant s'ouvrir dans Word alors que « Éditeur Kheops »
  // avait été enregistré comme choix explicite.
  if (
    isDocumentEditorMode(normalizedPreference.mode)
    && available.includes(normalizedPreference.mode)
  ) {
    return normalizedPreference.mode;
  }

  // La disponibilité de Word Desktop n'est connue qu'après le contrôle local.
  // Si le serveur l'avait recommandé puis que ce contrôle échoue, Word pour le
  // web reste le meilleur repli pour un document complexe, devant les éditeurs
  // susceptibles de simplifier sa mise en page.
  if (normalized.compatibility?.level === 'complex') {
    if (available.includes(DOCUMENT_OPENING_MODES.WORD_DESKTOP)) {
      return DOCUMENT_OPENING_MODES.WORD_DESKTOP;
    }
    if (available.includes(DOCUMENT_OPENING_MODES.WORD_WEB)) {
      return DOCUMENT_OPENING_MODES.WORD_WEB;
    }
    if (available.includes(DOCUMENT_OPENING_MODES.KHEOPS)) {
      return DOCUMENT_OPENING_MODES.KHEOPS;
    }
  }

  if (available.includes(normalized.recommendedMode)) return normalized.recommendedMode;

  if (available.includes(normalizedPreference.lastUsedMode)) {
    return normalizedPreference.lastUsedMode;
  }
  return available[0] || null;
}

/**
 * Décision pure, testable, utilisée avant chaque ouverture.
 * Retourne soit { action:'open', mode }, soit { action:'choose', reason }.
 */
export function resolveDocumentOpeningDecision({
  preference,
  availability,
  requestedMode = null,
  forceChooser = false,
} = {}) {
  const normalized = normalizeDocumentOpeningAvailability(availability);
  const normalizedPreference = normalizeDocumentOpeningPreference(
    preference || normalized.preference
  );
  const available = getAvailableDocumentOpeningActions(normalized);

  if (forceChooser) {
    return { action: 'choose', reason: 'explicit', suggestedMode: chooseRecommendedDocumentEditor(normalized, normalizedPreference) };
  }

  if (isDocumentOpeningActionMode(requestedMode)) {
    const requested = normalized.methods[requestedMode];
    if (requested.available === true) return { action: 'open', mode: requestedMode };
    return {
      action: 'choose',
      reason: 'requested_unavailable',
      unavailableMode: requestedMode,
      message: requested.reason,
      suggestedMode: chooseRecommendedDocumentEditor(normalized, normalizedPreference),
    };
  }

  if (normalizedPreference.mode === DOCUMENT_OPENING_MODES.ASK) {
    // Après une réinitialisation, éviter une modale inutile si un seul éditeur
    // existe réellement. Une préférence "Toujours demander" déjà configurée
    // reste, elle, strictement respectée.
    if (normalizedPreference.configured === false && available.length === 1) {
      return { action: 'open', mode: available[0] };
    }
    return {
      action: 'choose',
      reason: 'preference_ask',
      suggestedMode: chooseRecommendedDocumentEditor(normalized, normalizedPreference),
    };
  }

  if (normalizedPreference.mode === DOCUMENT_OPENING_MODES.AUTOMATIC) {
    const automaticMode = chooseRecommendedDocumentEditor(normalized, normalizedPreference);
    if (automaticMode) return { action: 'open', mode: automaticMode };
    return { action: 'choose', reason: 'none_available', suggestedMode: null };
  }

  if (isDocumentEditorMode(normalizedPreference.mode)) {
    const preferred = normalized.methods[normalizedPreference.mode];
    if (preferred.available === true) {
      return { action: 'open', mode: normalizedPreference.mode };
    }
    return {
      action: 'choose',
      reason: 'preferred_unavailable',
      unavailableMode: normalizedPreference.mode,
      message: preferred.reason,
      suggestedMode: chooseRecommendedDocumentEditor(normalized, normalizedPreference),
    };
  }

  // Protection supplémentaire pour une ancienne préférence mal formée.
  if (available.length === 1) return { action: 'open', mode: available[0] };
  return {
    action: 'choose',
    reason: available.length ? 'missing_preference' : 'none_available',
    suggestedMode: chooseRecommendedDocumentEditor(normalized, normalizedPreference),
  };
}
