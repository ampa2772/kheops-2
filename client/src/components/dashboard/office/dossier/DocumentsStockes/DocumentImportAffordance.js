import React, { useRef } from 'react';

const DocumentImportAffordance = ({ onImportFiles, disabled = false }) => {
  const inputRef = useRef(null);

  const handleInputChange = (event) => {
    const files = Array.from(event.currentTarget.files || []).filter(Boolean);
    if (files.length > 0) onImportFiles(files);
    // Autorise une nouvelle sélection du même fichier après la fin de l'envoi.
    event.currentTarget.value = '';
  };

  return (
    <div className="document-import-affordance" aria-label="Importer des documents dans le dossier">
      <span className="document-import-affordance__icon" aria-hidden="true">&#8595;</span>
      <span className="document-import-affordance__copy">
        <strong>Glissez-déposez vos fichiers ici</strong>
        <span id="document-import-help">100 Mo maximum par fichier · exécutables et scripts refusés</span>
      </span>
      <button
        type="button"
        className="document-import-affordance__button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        aria-describedby="document-import-help"
      >
        Importer des fichiers
      </button>
      <input
        ref={inputRef}
        className="document-import-affordance__input"
        type="file"
        multiple
        aria-label="Sélectionner des fichiers à importer"
        onChange={handleInputChange}
        disabled={disabled}
      />
    </div>
  );
};

export default DocumentImportAffordance;
