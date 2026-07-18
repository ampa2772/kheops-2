import React, { useCallback, useEffect, useMemo, useState } from 'react';
import BaseModal from '../common/BaseModal';
import { getTextDocumentPreview } from '../../services/documentOpeningClient';
import './documentOpening.css';

function readBlobAsText(blob) {
  if (blob && typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Lecture du fichier impossible.'));
    reader.readAsText(blob, 'utf-8');
  });
}

function readableError(error) {
  if (error?.response?.status === 413) {
    return 'Ce fichier dépasse la limite de lecture interne de 5 Mo. Téléchargez-le pour le consulter.';
  }
  return error?.response?.data?.message
    || error?.message
    || 'Le fichier texte ne peut pas être affiché pour le moment.';
}

const TextDocumentPreviewModal = ({ isOpen = false, document: documentToRead, onClose, onDownload }) => {
  const documentId = documentToRead?._id || documentToRead?.id || documentToRead?.documentId;
  const documentName = documentToRead?.nomDocument
    || documentToRead?.fileName
    || documentToRead?.name
    || 'Fichier texte';
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [downloadRecommended, setDownloadRecommended] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!isOpen || !documentId) return undefined;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    setDownloadRecommended(false);
    setContent('');
    getTextDocumentPreview(documentId, { signal: controller.signal })
      .then(({ blob }) => readBlobAsText(blob))
      .then((text) => {
        if (active) setContent(text);
      })
      .catch((requestError) => {
        if (active && requestError?.name !== 'CanceledError' && requestError?.name !== 'AbortError') {
          setDownloadRecommended(requestError?.response?.status === 413);
          setError(readableError(requestError));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, documentId, isOpen]);

  const lineCount = useMemo(
    () => (content ? content.split(/\r\n|\r|\n/).length : 0),
    [content]
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName="document-opening-overlay text-preview-overlay"
      contentClassName="k-modal-box k-modal-box--large text-preview-modal"
    >
      <div role="dialog" aria-modal="true" aria-labelledby="text-preview-title">
        <header className="text-preview-modal__header">
          <div>
            <span className="document-opening-modal__eyebrow">LECTURE SEULE</span>
            <h2 id="text-preview-title">{documentName}</h2>
            <p>Le fichier original reste inchangé.</p>
          </div>
          <button type="button" className="document-opening-modal__close" onClick={onClose} aria-label="Fermer la lecture">×</button>
        </header>
        <div className="text-preview-modal__body">
          {loading && <div className="text-preview-modal__status" role="status">Chargement du fichier texte…</div>}
          {error && (
            <div className="document-opening-error text-preview-modal__error" role="alert">
              <span>{error}</span>
              {downloadRecommended && onDownload && <button type="button" onClick={onDownload}>Télécharger</button>}
              <button type="button" onClick={retry}>Réessayer</button>
            </div>
          )}
          {!loading && !error && (
            <pre className="text-preview-modal__content" tabIndex="0" aria-label={`Contenu de ${documentName}`}>{content}</pre>
          )}
        </div>
        <footer className="text-preview-modal__footer">
          <span>{lineCount ? `${lineCount} ligne${lineCount > 1 ? 's' : ''}` : 'Fichier vide'}</span>
          <button type="button" className="document-opening-button document-opening-button--primary" onClick={onClose}>Fermer</button>
        </footer>
      </div>
    </BaseModal>
  );
};

export default TextDocumentPreviewModal;
