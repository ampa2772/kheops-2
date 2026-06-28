// src/components/dashboard/office/createDossier/createPartie/fonctions.js
// -------------------------------------------------------------------
//  Fonctions utilitaires DEDIEES au module "createPartie".
//  Les helpers génériques (formatContact, formatProContact, getInitials,
//  arraysAreEqual) se trouvent désormais dans
//  "./utils/partiesHelpers.js" et sont simplement ré-exportés d'ici afin
//  de ne PAS casser les imports existants ailleurs dans l'application.
// -------------------------------------------------------------------

import { useWindowSize } from 'react-use';
import { useEffect } from 'react';

// Helpers mutualisés -----------------------------------------
export {
  formatContact,
  formatProContact,
  getInitials,
  arraysAreEqual,
} from './utils/partiesHelpers';

/* -------------------------------------------------------------
 * HOOK : useOutsideClick
 * Déclenche "callback" lorsque l’utilisateur clique en dehors du/des
 * référent(s) passé(s). "refs" peut être une ref unique ou un tableau
 * de refs.
 * ----------------------------------------------------------- */
export const useOutsideClick = (refs, callback, isActive) => {
  useEffect(() => {
    if (!isActive) return;

    const handle = (e) => {
      e.stopPropagation();
      const refsArray = Array.isArray(refs) ? refs : [refs];
      if (refsArray.every((r) => r?.current && !r.current.contains(e.target))) {
        callback(e);
      }
    };

    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [refs, callback, isActive]);
};

/* -------------------------------------------------------------
 * HOOK : useWindowDimensions
 * Retourne { width, height } en temps réel.
 * ----------------------------------------------------------- */
export const useWindowDimensions = () => {
  const { width, height } = useWindowSize();
  return { width, height };
};

/* -------------------------------------------------------------
 * FONCTION : calculateDynamicBottom
 * Calcule dynamiquement la valeur (vh) de la variable CSS
 * "--dynamic-bottom" qui détermine la position verticale de la liste
 * de suggestions de contacts, en fonction du nombre de parties et de
 * la hauteur de la fenêtre.
 * ----------------------------------------------------------- */
export const calculateDynamicBottom = (
  pourParties = [],
  contreParties = [],
  windowHeight,
  adjustmentValue = 0
) => {
  const total = pourParties.length + contreParties.length;

  const pxToVh = (px) => (px / windowHeight) * 100;

  // Valeur par défaut (1ère ligne + champs + padding)
  let bottom = pxToVh(238) + adjustmentValue;

  /* Cas particuliers (affinés empiriquement) ------------------ */
  if (pourParties.length > 3 && contreParties.length === 0) {
    bottom = pxToVh(236.5) + adjustmentValue;
  } else if (contreParties.length > 3 && pourParties.length === 0) {
    bottom = pxToVh(236.5) + adjustmentValue;
  } else if (total > 3) {
    if (pourParties.length > 3 && contreParties.length > 3) {
      bottom = pxToVh(93) + adjustmentValue;
    } else if (
      (pourParties.length === 1 && contreParties.length === 3) ||
      (pourParties.length === 3 && contreParties.length === 1)
    ) {
      bottom = pxToVh(183) + adjustmentValue;
    } else if (pourParties.length === 2 && contreParties.length === 2) {
      bottom = pxToVh(183) + adjustmentValue;
    } else if (
      (pourParties.length === 2 && contreParties.length === 3) ||
      (pourParties.length === 3 && contreParties.length === 2)
    ) {
      bottom = pxToVh(153) + adjustmentValue;
    } else if (pourParties.length === 3 && contreParties.length === 3) {
      bottom = pxToVh(123) + adjustmentValue;
    } else if (pourParties.length > 3 && contreParties.length <= 3) {
      bottom =
        contreParties.length === 1
          ? pxToVh(168.5) + adjustmentValue
          : contreParties.length === 2
          ? pxToVh(138.5) + adjustmentValue
          : pxToVh(108.5) + adjustmentValue;
    } else if (contreParties.length > 3 && pourParties.length <= 3) {
      bottom =
        pourParties.length === 1
          ? pxToVh(168.5) + adjustmentValue
          : pourParties.length === 2
          ? pxToVh(138.5) + adjustmentValue
          : pxToVh(108.5) + adjustmentValue;
    }
  }

  return bottom;
};
