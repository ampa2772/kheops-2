import React from 'react';

// Icone SVG inline pour le module Bilan : balance / graphique en barres,
// symbolisant le bilan comptable (recettes / depenses).
const BilanLinkIcon = () => (
  <div>
    <svg
      className="boutonSideBar"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="boutonBilan"
    >
      {/* Encadrement / cadre */}
      <rect x="3" y="3" width="18" height="18" rx="2" />
      {/* Barre 1 (basse, depenses) */}
      <line x1="7" y1="17" x2="7" y2="13" />
      {/* Barre 2 (moyenne) */}
      <line x1="12" y1="17" x2="12" y2="9" />
      {/* Barre 3 (haute, recettes) */}
      <line x1="17" y1="17" x2="17" y2="6" />
    </svg>
  </div>
);

export default BilanLinkIcon;
