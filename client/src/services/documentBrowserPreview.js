import { getBrowserDocumentPreview } from './documentOpeningClient';

const PREVIEW_URL_LIFETIME_MS = 60 * 1000;

function previewError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Reserve immediatement un onglet pendant le geste utilisateur. La lecture du
 * Blob etant asynchrone, attendre la reponse API avant window.open serait
 * souvent bloque par les protections anti-pop-up du navigateur.
 */
export function reserveDocumentPreviewWindow(fileName = 'Document') {
  const previewWindow = window.open('about:blank', '_blank');
  if (!previewWindow) {
    throw previewError(
      "Le navigateur a bloqué l'ouverture du document. Autorisez les fenêtres contextuelles pour Kheops 2 puis réessayez.",
      'DOCUMENT_PREVIEW_POPUP_BLOCKED',
    );
  }
  try {
    previewWindow.opener = null;
    previewWindow.document.title = `Ouverture de ${fileName || 'document'}…`;
  } catch (_error) {
    // Certains navigateurs isolent immediatement le nouvel onglet. Ce titre
    // d'attente est purement cosmetique et ne doit jamais bloquer la lecture.
  }
  return previewWindow;
}

function closePreviewWindow(previewWindow) {
  try {
    if (previewWindow && !previewWindow.closed) previewWindow.close();
  } catch (_error) {
    // Rien a nettoyer de plus si le navigateur a deja isole l'onglet.
  }
}

function blobWithContentType(blob, contentType) {
  if (!blob || typeof blob !== 'object') {
    throw previewError("Le serveur n'a pas renvoyé de document lisible.", 'DOCUMENT_PREVIEW_EMPTY');
  }
  if (blob.type || typeof blob.slice !== 'function' || !contentType) return blob;
  return blob.slice(0, blob.size, contentType);
}

/** Charge le Blob authentifie dans l'onglet deja reserve. */
export async function loadDocumentPreviewInWindow(
  documentId,
  previewKind,
  previewWindow,
  { signal } = {},
) {
  if (!previewWindow || previewWindow.closed) {
    throw previewError("La fenêtre d'aperçu a été fermée.", 'DOCUMENT_PREVIEW_WINDOW_CLOSED');
  }

  let objectUrl = null;
  try {
    const preview = await getBrowserDocumentPreview(documentId, previewKind, { signal });
    const typedBlob = blobWithContentType(preview.blob, preview.contentType);
    objectUrl = window.URL.createObjectURL(typedBlob);

    if (typeof previewWindow.location?.replace === 'function') {
      previewWindow.location.replace(objectUrl);
    } else {
      previewWindow.location.href = objectUrl;
    }

    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), PREVIEW_URL_LIFETIME_MS);
    return {
      ...preview,
      objectUrl,
    };
  } catch (error) {
    if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    closePreviewWindow(previewWindow);
    throw error;
  }
}
