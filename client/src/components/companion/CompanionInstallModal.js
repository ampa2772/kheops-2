// client/src/components/companion/CompanionInstallModal.js
//
// Boîte affichable uniquement après une action explicite de l'utilisateur.

import React from 'react';
import {
  getCompanionInstallerInfo,
  triggerCompanionInstall,
} from '../../services/companion/companionClient';
import './companion.css';

const CompanionInstallModal = ({ open, onClose }) => {
  if (!open) return null;
  const installer = getCompanionInstallerInfo();

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
          {installer.available
            ? <> Lancez l’installeur pour <strong>{installer.platformLabel}</strong> une seule fois. Il fonctionnera ensuite automatiquement en arrière-plan.</>
            : <> {installer.unavailableReason}</>}
        </p>
        <div className="k-companion-actions">
          {installer.available && (
            <button type="button" className="k-companion-btn k-companion-btn--primary" onClick={handleInstall}>
              Installer pour {installer.platformLabel}
            </button>
          )}
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
