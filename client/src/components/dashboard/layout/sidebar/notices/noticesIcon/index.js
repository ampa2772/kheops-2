import React from 'react';

// Icone "livre ouvert avec point d'interrogation" : symbolise la notice
// d'utilisation / l'aide / la documentation.
const NoticesLinkIcon = () => (
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
      aria-label="boutonNotices"
    >
      {/* Livre ouvert : reliure centrale */}
      <path d="M12 4v16" />
      {/* Couverture gauche */}
      <path d="M3 6c4 0 6 1 9 2v12c-3-1-5-2-9-2V6z" />
      {/* Couverture droite */}
      <path d="M21 6c-4 0-6 1-9 2v12c3-1 5-2 9-2V6z" />
      {/* Petit point interrogation */}
      <circle cx="17" cy="11" r="0.5" fill="currentColor" />
    </svg>
  </div>
);

export default NoticesLinkIcon;
