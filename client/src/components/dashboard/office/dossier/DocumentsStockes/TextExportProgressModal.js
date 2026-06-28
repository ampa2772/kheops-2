import React from 'react';
import BaseModal from '../../../../common/BaseModal';
import './TextExportProgressModal.css';

const TextExportProgressModal = ({ isOpen, onClose, progress }) => {
  if (!isOpen || !progress) return null;

  const { current, total, currentDoc, done, error, errorCount, fileName } = progress;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={done || error ? onClose : undefined}
      overlayClassName="text-export-modal-overlay"
      contentClassName="text-export-modal-content"
    >
      <h3>Export texte du dossier</h3>

      {!done && !error && (
        <>
          <p className="text-export-status">
            Extraction en cours... ({current}/{total})
          </p>
          <div className="text-export-progress-bar-container">
            <div
              className="text-export-progress-bar-fill"
              style={{ width: `${percent}%` }}
            />
          </div>
          {currentDoc && (
            <p className="text-export-current-doc" title={currentDoc}>
              {currentDoc}
            </p>
          )}
        </>
      )}

      {done && !error && (
        <>
          <p className="text-export-success">Export termine avec succes !</p>
          {fileName && (
            <p className="text-export-filename">{fileName}</p>
          )}
          {errorCount > 0 && (
            <p className="text-export-warning">
              {errorCount} document(s) n'ont pas pu etre extraits (voir le fichier TXT pour le detail).
            </p>
          )}
        </>
      )}

      {error && (
        <p className="text-export-error">
          Erreur : {error}
        </p>
      )}

      {(done || error) && (
        <div className="text-export-actions">
          <button onClick={onClose} className="text-export-btn">
            Fermer
          </button>
        </div>
      )}
    </BaseModal>
  );
};

export default TextExportProgressModal;
