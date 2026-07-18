import { loadEditorDocument } from '../components/documentEditor/documentEditorApi';
import { documentToPrintHtml } from '../components/documentEditor/documentModel';

function previewError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * Prépare une représentation A4 et ouvre le dialogue d'impression du
 * navigateur, qui permet notamment « Enregistrer au format PDF ».
 *
 * La fenêtre est créée avant le premier `await` pour conserver l'autorisation
 * issue du clic utilisateur et éviter un blocage abusif par Chrome.
 */
export async function previewDocumentAsPdf(documentId, openWindow = () => window.open('', '_blank')) {
  if (!documentId) throw previewError('DOCUMENT_ID_REQUIRED', 'Identifiant du document manquant.');
  const preview = openWindow();
  if (!preview) {
    throw previewError(
      'PDF_PREVIEW_POPUP_BLOCKED',
      "Chrome a bloqué l'aperçu. Autorisez les fenêtres pop-up pour Kheops 2, puis réessayez."
    );
  }

  try {
    preview.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Préparation de l’aperçu PDF</title></head><body style="font-family:Arial,sans-serif;padding:32px">Préparation de l’aperçu PDF…</body></html>');
    preview.document.close();
    const data = await loadEditorDocument(documentId);
    if (!data?.exists || !data.document) {
      throw previewError('PDF_PREVIEW_UNAVAILABLE', "Ce document ne peut pas encore être prévisualisé en PDF.");
    }
    if (preview.closed) {
      throw previewError('PDF_PREVIEW_CLOSED', "La fenêtre d'aperçu a été fermée avant la fin du chargement.");
    }
    preview.document.open();
    preview.document.write(documentToPrintHtml(data.document));
    preview.document.close();
    try { preview.opener = null; } catch (_) {}
    return { preview, document: data.document, compatibility: data.compatibility || null };
  } catch (error) {
    try { preview.close(); } catch (_) {}
    throw error;
  }
}

