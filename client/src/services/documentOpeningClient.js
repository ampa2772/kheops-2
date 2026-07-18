import apiClient from './apiClient';
import { detectCompanion, detectDesktopPlatform } from './companion/companionClient';
import { isElectron } from './electronBridge';
import {
  DOCUMENT_OPENING_MODES,
  chooseRecommendedDocumentEditor,
  isDocumentPreferenceMode,
  normalizeDocumentOpeningAvailability,
  normalizeDocumentOpeningPreference,
} from '../constants/documentOpening';

const BASE_PATH = '/api/document-opening';

export async function getDocumentOpeningPreferences() {
  const { data } = await apiClient.get(`${BASE_PATH}/preferences`);
  return normalizeDocumentOpeningPreference(data);
}

export async function updateDocumentOpeningPreferences(patch = {}) {
  if (patch.mode !== undefined && !isDocumentPreferenceMode(patch.mode)) {
    throw new Error("Méthode d'ouverture inconnue.");
  }
  const { data } = await apiClient.put(`${BASE_PATH}/preferences`, patch);
  return normalizeDocumentOpeningPreference(data);
}

export async function resetDocumentOpeningPreferences() {
  const { data } = await apiClient.delete(`${BASE_PATH}/preferences`);
  return normalizeDocumentOpeningPreference(data);
}

function documentPreferencePath(documentId) {
  if (!documentId) throw new Error('Identifiant du document manquant.');
  return `${BASE_PATH}/documents/${encodeURIComponent(documentId)}`;
}

/** Lit la préférence propre au document sans la confondre avec le défaut utilisateur. */
export async function getDocumentOpeningPreference(documentId) {
  const { data } = await apiClient.get(documentPreferencePath(documentId));
  return data;
}

/** Mémorise un mode uniquement pour ce document. Le défaut global reste inchangé. */
export async function updateDocumentOpeningPreference(documentId, mode) {
  if (!isDocumentPreferenceMode(mode)) {
    throw new Error("Méthode d'ouverture inconnue.");
  }
  const { data } = await apiClient.put(documentPreferencePath(documentId), {
    openingMode: mode,
  });
  return data;
}

export async function resetDocumentOpeningPreference(documentId) {
  const { data } = await apiClient.delete(documentPreferencePath(documentId));
  return data;
}

/** Télécharge le contenu TXT authentifié sous forme de Blob, sans URL publique. */
export async function getTextDocumentPreview(documentId, { signal } = {}) {
  const { data, headers = {} } = await apiClient.get(
    `${documentPreferencePath(documentId)}/text-preview`,
    { responseType: 'blob', signal },
  );
  return {
    blob: data,
    contentType: headers['content-type'] || 'text/plain; charset=utf-8',
    readOnly: headers['x-document-read-only'] !== 'false',
  };
}

const BROWSER_PREVIEW_CONFIG = Object.freeze({
  pdf: {
    suffix: 'pdf-preview',
    fallbackContentType: 'application/pdf',
  },
  image: {
    suffix: 'image-preview',
    fallbackContentType: 'application/octet-stream',
  },
});

/**
 * Recupere un PDF ou un raster valide par le serveur sous forme de Blob
 * authentifie. Aucune URL de stockage publique ou signee n'est exposee au
 * navigateur ; le serveur conserve les controles de tenant et de dossier.
 */
export async function getBrowserDocumentPreview(documentId, previewKind, { signal } = {}) {
  const config = BROWSER_PREVIEW_CONFIG[previewKind];
  if (!config) throw new Error("Type d'aperçu navigateur inconnu.");

  const { data, headers = {} } = await apiClient.get(
    `${documentPreferencePath(documentId)}/${config.suffix}`,
    { responseType: 'blob', signal },
  );
  return {
    blob: data,
    contentType: headers['content-type'] || config.fallbackContentType,
    contentDisposition: headers['content-disposition'] || null,
  };
}

export async function getDocumentOpeningPolicy() {
  const { data } = await apiClient.get(`${BASE_PATH}/policy`);
  return data;
}

export async function updateDocumentOpeningPolicy(patch) {
  const { data } = await apiClient.put(`${BASE_PATH}/policy`, patch);
  return data;
}

function buildAvailabilityParams({ documentId, mimeType, fileName, storageProvider } = {}) {
  const params = {};
  if (documentId) params.documentId = documentId;
  if (mimeType) params.mimeType = mimeType;
  if (fileName) params.fileName = fileName;
  if (storageProvider) params.storageProvider = storageProvider;
  return params;
}

/**
 * Le serveur connait les connexions cloud mais ne peut pas sonder localhost.
 * Cette fonction complète donc word_desktop avec l'état Electron/compagnon.
 */
export async function resolveClientOpeningChecks(payload) {
  const availability = normalizeDocumentOpeningAvailability(payload);
  const desktop = availability.methods[DOCUMENT_OPENING_MODES.WORD_DESKTOP];
  // `false` peut être une interdiction du cabinet : un compagnon présent ne
  // doit surtout pas la transformer en `true`. Seul l'état indéterminé `null`
  // autorise le contrôle local.
  if (desktop.available !== null || !desktop.requiresClientCheck) return availability;

  let available = false;
  let unavailableReason = null;
  if (isElectron()) {
    available = typeof window.electron?.openDocument === 'function';
  } else if (detectDesktopPlatform() !== 'windows') {
    // Le compagnon publié aujourd'hui est Windows uniquement. Ne pas sonder
    // localhost sur macOS/Linux : même une réponse locale inattendue ne doit
    // pas annoncer Word Desktop comme une méthode Kheops prise en charge.
    unavailableReason = 'Microsoft Word sur cet ordinateur nécessite le compagnon Kheops 2 pour Windows.';
  } else {
    available = await detectCompanion();
  }

  const checked = {
    ...availability,
    methods: {
      ...availability.methods,
      [DOCUMENT_OPENING_MODES.WORD_DESKTOP]: {
        ...desktop,
        available,
        clientChecked: true,
        reason: available
          ? null
          : (unavailableReason
            || "Le compagnon Kheops 2 n'est pas actuellement accessible. Lancez-le ou installez-le, puis réessayez."),
      },
    },
  };
  return {
    ...checked,
    recommendedMode: chooseRecommendedDocumentEditor(checked, checked.preference),
  };
}

export async function getDocumentOpeningAvailability(context = {}) {
  const { data } = await apiClient.get(`${BASE_PATH}/availability`, {
    params: buildAvailabilityParams(context),
  });
  return resolveClientOpeningChecks(data);
}

/** Enregistre le dernier éditeur sans changer la méthode par défaut. */
export async function recordLastDocumentOpeningMode(mode) {
  return updateDocumentOpeningPreferences({ lastUsedMode: mode });
}
