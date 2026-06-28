// client/src/components/carpa/carpaPrintHelpers.js
//
// Petits utilitaires partages cote client pour CARPA :
// - masquage IBAN affichable
// - declenchement d'une impression d'une zone identifiee

export const masquerRibClient = (input) => {
  if (!input) return null;
  const cleaned = String(input).replace(/\s+/g, '');
  if (cleaned.length < 4) return null;
  const last4 = cleaned.slice(-4);
  return `**** **** **** ${last4}`;
};

// Declenche une impression de la fenetre apres avoir ajoute la classe
// `preparing` sur la zone d'impression. Utilise par CarpaClientReport.
export const printArea = (printAreaSelector = '.k-carpa-print-area') => {
  const el = document.querySelector(printAreaSelector);
  if (!el) return;
  el.classList.add('preparing');
  // Attendre un tick pour que le DOM soit a jour
  setTimeout(() => {
    window.print();
    setTimeout(() => el.classList.remove('preparing'), 500);
  }, 50);
};
