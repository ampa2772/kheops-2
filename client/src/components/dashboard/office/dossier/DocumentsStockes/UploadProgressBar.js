import React from 'react';
import './UploadProgressBar.css'; // Nous allons aussi créer ce fichier CSS

const UploadProgressBar = ({ progress, error }) => {
  if (!progress) return null;

  const { currentFile, totalFiles, currentFileName } = progress;
  const percentage = totalFiles > 0 ? Math.round(((currentFile -1) / totalFiles) * 100) : 0;

  return (
    <div className="upload-progress-overlay">
      <div className="upload-progress-container">
        {error ? (
          <>
            <h3 className="upload-progress-title error">Erreur d'envoi</h3>
            <p className="upload-progress-details error-details">{error}</p>
            <p className="upload-progress-info">Veuillez réessayer.</p>
          </>
        ) : (
          <>
            <h3 className="upload-progress-title">Ajout des pièces en cours...</h3>
            <div className="upload-progress-bar-wrapper">
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