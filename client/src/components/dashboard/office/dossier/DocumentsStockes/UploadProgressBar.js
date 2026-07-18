import React from 'react';
import './UploadProgressBar.css'; // Nous allons aussi créer ce fichier CSS

const UploadProgressBar = ({ progress, error }) => {
  if (!progress) return null;

  const {
    currentFile = 0,
    completedFiles = Math.max(0, currentFile - 1),
    totalFiles = 0,
    currentFileName,
    status = 'uploading',
  } = progress;
  const percentage = totalFiles > 0
    ? Math.min(100, Math.round((completedFiles / totalFiles) * 100))
    : 0;
  const hasError = Boolean(error || status === 'error');
  const isSuccess = status === 'success';

  return (
    <div className="upload-progress-overlay" role="status" aria-live="polite" aria-atomic="true">
      <div className={`upload-progress-container${isSuccess ? ' is-success' : ''}`}>
        {hasError ? (
          <>
            <h3 className="upload-progress-title error">Erreur d'envoi</h3>
            <p className="upload-progress-details error-details">{error}</p>
            <p className="upload-progress-info">Veuillez réessayer.</p>
          </>
        ) : isSuccess ? (
          <>
            <h3 className="upload-progress-title success">Documents ajoutés</h3>
            <div className="upload-progress-bar-wrapper" aria-hidden="true">
              <div className="upload-progress-bar-fill" style={{ width: '100%' }} />
            </div>
            <p className="upload-progress-details">
              {totalFiles} fichier{totalFiles > 1 ? 's' : ''} disponible{totalFiles > 1 ? 's' : ''} dans le dossier.
            </p>
          </>
        ) : (
          <>
            <h3 className="upload-progress-title">Ajout des pièces en cours...</h3>
            <div
              className="upload-progress-bar-wrapper"
              role="progressbar"
              aria-label="Progression de l'ajout des documents"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={percentage}
            >
              <div
                className="upload-progress-bar-fill"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="upload-progress-stats">
              <span className="upload-progress-percentage">{percentage}%</span>
              <span className="upload-progress-count">
                Fichier {currentFile} / {totalFiles}
              </span>
            </div>
            <p className="upload-progress-details" title={currentFileName}>
              Envoi de : <strong>{currentFileName}</strong>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default UploadProgressBar;
