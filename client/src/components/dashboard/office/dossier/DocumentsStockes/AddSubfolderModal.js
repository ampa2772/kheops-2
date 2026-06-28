import React, { useState, useRef } from 'react';
import BaseModal from '../../../../common/BaseModal';
import './AddSubfolderModal.css';

const MAX_LEN = 60;

// Raccourcis de saisie : un clic remplit simplement le champ (rien de plus).
const SUGGESTIONS = [
  'Conclusions',
  'Pièces adverses',
  'Correspondances',
  'Jurisprudence',
  'Notes internes',
];

const DocIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 2h8l4 4v16H6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M14 2v5h5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

const AddSubfolderModal = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
      setName(''); // Reset input after submit
    }
  };

  const applySuggestion = (value) => {
    setName(value);
    // Replace le focus dans le champ, curseur en fin (édition possible ensuite).
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName="subfolder-modal-overlay"
      contentClassName="subfolder-modal-content"
    >
      <div className="sfm-header">
        <div className="sfm-header-id">
          <span className="sfm-header-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="sfm-header-text">
            <span className="sfm-eyebrow">Nouveau sous-dossier</span>
            <span className="sfm-title">Créer un sous-dossier</span>
          </span>
        </div>
        <button type="button" className="sfm-close" onClick={onClose} title="Fermer" aria-label="Fermer">×</button>
      </div>

      <form className="sfm-body" onSubmit={handleSubmit}>
        <label className="sfm-label" htmlFor="sfm-name-input">Nom du sous-dossier</label>
        <div className="sfm-field">
          <span className="sfm-field-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </span>
          <input
            id="sfm-name-input"
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. Conclusions adverses"
            autoFocus
            maxLength={MAX_LEN}
            className="sfm-input"
          />
          <span className="sfm-counter" aria-hidden="true">{name.length} / {MAX_LEN}</span>
        </div>
        <div className="sfm-hint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          60 caractères maximum.
        </div>

        <div className="sfm-suggestions">
          <span className="sfm-suggestions-label">Suggestions</span>
          <div className="sfm-suggestions-chips">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="sfm-chip"
                onClick={() => applySuggestion(s)}
                title={`Utiliser « ${s} » comme nom`}
              >
                <DocIcon />
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="sfm-footer">
          <div className="sfm-footer-hints" aria-hidden="true">
            <span className="sfm-kbd-hint"><kbd>&#9166;</kbd> créer</span>
            <span className="sfm-kbd-hint"><kbd>Esc</kbd> annuler</span>
          </div>
          <div className="sfm-footer-actions">
            <button type="submit" className="sfm-btn-create" disabled={!name.trim()}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              Créer le sous-dossier
            </button>
          </div>
        </div>
      </form>
    </BaseModal>
  );
};

export default AddSubfolderModal;
