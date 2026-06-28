// validationHelpers.js — Fonctions de validation centralisées
// Utilisées par createContactSlice, personneMoraleSlice, contactPMPubliqueSlice,
// pchSlice, mariageDetailsSlice, etc.

/**
 * Valide un email avec une regex standard.
 * @param {string} email
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return re.test(String(email).toLowerCase());
};

/**
 * Compte le nombre d'erreurs (valeurs truthy) dans un objet d'erreurs.
 * @param {Object} errorsObject — ex. { nom: true, email: false, ville: true }
 * @returns {number}
 */
export const countErrors = (errorsObject) =>
  Object.values(errorsObject).filter(Boolean).length;
