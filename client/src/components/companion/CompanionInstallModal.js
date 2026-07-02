// client/src/components/companion/CompanionInstallModal.js
//
// Petite boite NON-INTRUSIVE proposee UNIQUEMENT au moment du login si le
// compagnon local est absent. Ce n'est PAS une banniere Dashboard permanente :
// elle est rattachee a la connexion, fermable, et ne reapparait pas dans la
// meme session une fois ecartee.

import React from 'react';
import { triggerCompanionInstall } from '../../services/companion/companionClient';
import './companion.css';

const CompanionInstallModal = ({ open, onClose }) => {
  if (!open) return null;

  const handleInstall = () => {
    triggerCompanionInstall();
    // On laisse la boite ouverte avec une consigne post-telechargement.
  };

  return (
    <div className="k-companion-overlay" role="dialog" aria-modal="true" aria-labelledby="k-companion-title">
      <div className="k-companion-card">
        <div className="k-companion-icon" aria-hidden="true">📄</div>
        <h3 id="k-companion-title" className="k-companion-title">Installation du compagnon Kheops</h3>
        <p className="k-companion-text">
          Pour permettre l’ouverture et la modification des fichiers Word depuis votre
          ordinateur, Kheops doit installer un petit compagnon local sécurisé.
          Lancez l’installeur téléchargé <strong>une seule fois</strong>. Il fonctionnera
          ensuite automatiquement en arrière-plan.
        </p>
        <div className="k-companion-actions">
          <button type="button" className="k-companion-btn k-companion-btn--primary" onClick={handleInstall}>
            Installer le compagnon Kheops
          </button>
          <button type="button" className="k-companion-btn k-companion-btn--ghost" onClick={onClose}>
            Plus tard
          </button>
        </div>
        <p className="k-companion-note">
          Sans le compagnon, vous pouvez utiliser Kheops normalement ; seules les fonctions
          « Ouvrir dans Word » seront indisponibles.
        </p>
      </div>
    </div>
  );
};

export default CompanionInstallModal;
