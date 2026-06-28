import React from 'react';
import Tooltip from '../../../../../common/Tooltip';

/**
 * CreateOptionCard — Carte cliquable pour le menu "Creer un nouveau..."
 *
 * Props :
 *   icon (string)       — Source SVG de l'icone
 *   label (string)      — Texte affiche sous l'icone
 *   alt (string)        — Texte alternatif pour l'accessibilite
 *   onClick (function)  — Handler au clic
 *   speechText (string) — Texte pour la synthese vocale du Tooltip
 */
const CreateOptionCard = ({ icon, label, alt, onClick, speechText }) => {
  return (
    <Tooltip text={speechText} position="bottom">
      <button
        className="create-option-card"
        onClick={onClick}
        type="button"
        aria-label={alt}
      >
        <div className="create-option-card__icon-wrapper">
          <img src={icon} alt={alt} className="create-option-card__icon" />
        </div>
        <span className="create-option-card__label">{label}</span>
      </button>
    </Tooltip>
  );
};

export default CreateOptionCard;
