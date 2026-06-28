// client/src/components/encryption/EncryptionReminderBanner.js
//
// Banniere de rappel persistante affichee en haut de l'application quand
// l'utilisateur a clique "Plus tard" sur la modale d'enrolement.
//
// Cliquer sur "Configurer" relance la modale d'enrolement. Cliquer sur
// "×" masque la banniere uniquement pour la session courante (le state
// Redux la repassera a "reminded_later", elle reapparaitra au prochain
// chargement de la page ou redemarrage de Kheops).
//
// Voir DESIGN_CHIFFREMENT_E2E.md section 6.1 et la notice utilisateur
// section 2 ("Si vous choisissez Plus tard").

import React from 'react';
import './_encryption-banner.css';

const EncryptionReminderBanner = ({ onConfigure, onDismiss }) => {
  return (
    <div
      className="k-encryption-banner"
      role="status"
      aria-live="polite"
    >
      <div className="k-encryption-banner__content">
        <span className="k-encryption-banner__icon" aria-hidden="true">!</span>
        <span className="k-encryption-banner__text">
          Vos documents ne sont pas encore proteges.
        </span>
        <button
          type="button"
          className="k-encryption-banner__cta"
          onClick={onConfigure}
        >
          Configurer
        </button>
      </div>
      <button
        type="button"
        className="k-encryption-banner__dismiss"
        onClick={onDismiss}
        aria-label="Masquer le rappel jusqu'au prochain redemarrage"
        title="Masquer jusqu'au prochain demarrage"
      >
        &times;
      </button>
    </div>
  );
};

export default EncryptionReminderBanner;
