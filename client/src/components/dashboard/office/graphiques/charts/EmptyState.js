import React from 'react';

/**
 * Etat vide d'un graphique : icone + titre + message + CTA optionnel.
 */
const EmptyState = ({ title = 'Aucune donnee', message, icon = '✨', cta }) => {
  return (
    <div className="chart-empty">
      <div className="chart-empty-icon" aria-hidden="true">{icon}</div>
      <div className="chart-empty-title">{title}</div>
      {message && <div className="chart-empty-message">{message}</div>}
      {cta}
    </div>
  );
};

export default EmptyState;
