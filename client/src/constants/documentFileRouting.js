/**
 * Routage client par famille de fichiers.
 *
 * Cette classification ne constitue jamais une validation de securite : le
 * serveur verifie encore les droits, le type et la signature des fichiers
 * servis inline. Le client reste volontairement conservateur et ne deduit pas
 * une previsualisation a partir du seul MIME declare par l'utilisateur.
 */
export const DOCUMENT_FILE_OPENING_ACTIONS = Object.freeze({
  DOCUMENT_CHOOSER: 'document_chooser',
  BROWSER_PREVIEW: 'browser_preview',
  DOWNLOAD: 'download',
});

export const DOCUMENT_BROWSER_PREVIEW_KINDS = Object.freeze({
  PDF: 'pdf',
  IMAGE: 'image',
});

const CHOOSER_EXTENSIONS = new Set(['doc', 'docx', 'txt']);
const SAFE_RASTER_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

export function getDocumentFileName(documentOrName) {
  if (typeof documentOrName === 'string') return documentOrName.trim();
  return String(
    documentOrName?.nomDocument
      || documentOrName?.fileName
      || documentOrName?.name
      || documentOrName?.nom
      || ''
  ).trim();
}

export function getDocumentFileExtension(documentOrName) {
  const match = getDocumentFileName(documentOrName).match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

export function classifyDocumentFileOpening(documentOrName) {
  const extension = getDocumentFileExtension(documentOrName);

  if (CHOOSER_EXTENSIONS.has(extension)) {
    return {
      action: DOCUMENT_FILE_OPENING_ACTIONS.DOCUMENT_CHOOSER,
      extension,
      previewKind: null,
    };
  }

  if (extension === 'pdf') {
    return {
      action: DOCUMENT_FILE_OPENING_ACTIONS.BROWSER_PREVIEW,
      extension,
      previewKind: DOCUMENT_BROWSER_PREVIEW_KINDS.PDF,
    };
  }

  if (SAFE_RASTER_IMAGE_EXTENSIONS.has(extension)) {
    return {
      action: DOCUMENT_FILE_OPENING_ACTIONS.BROWSER_PREVIEW,
      extension,
      previewKind: DOCUMENT_BROWSER_PREVIEW_KINDS.IMAGE,
    };
  }

  return {
    action: DOCUMENT_FILE_OPENING_ACTIONS.DOWNLOAD,
    extension,
    previewKind: null,
  };
}

export function isSafeRasterImageExtension(extension) {
  return SAFE_RASTER_IMAGE_EXTENSIONS.has(String(extension || '').toLowerCase());
}
