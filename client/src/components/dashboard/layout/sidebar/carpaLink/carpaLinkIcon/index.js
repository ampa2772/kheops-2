import React from 'react';

// Icone SVG inline pour CARPA : un bouclier avec un symbole "coffre / euro"
// (reference au seuestre obligatoire des fonds de tiers).
// Garde la classe `boutonSideBar` utilisee par les autres icones pour
// herite des dimensions de la sidebar.
const CarpaLinkIcon = () => (
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
      aria-label="boutonCarpa"
    >
      {/* Bouclier */}
      <path d="M12 2.5L4 5v6c0 5.2 3.4 9.5 8 11 4.6-1.5 8-5.8 8-11V5l-8-2.5z" />
      {/* Coffre / euro stylise */}
      <rect x="8" y="9.5" width="8" height="6" rx="1" />
      <path d="M14.2 11.5h-1.7a1.5 1.5 0 0 0 0 3h1.7" />
      <path d="M11.2 12.2h2.6M11.2 13.5h2.6" />
    </svg>
  </div>
);

export default CarpaLinkIcon;
