// createSubEntitySlice.js — Factory pour les sous-entités contact (ReprLeg, ContactDirect)
// Remplace reprLegPMSlice.js et contDirPMSlice.js qui étaient 100% identiques en structure.
import { createSlice } from '@reduxjs/toolkit';

/**
 * Crée un slice pour une sous-entité de contact PM (représentant légal, contact direct, etc.)
 *
 * @param {Object} config
 * @param {string} config.sliceName       — ex. 'ReprLeg', 'contactDirect'
 * @param {string} config.prefix          — préfixe des champs d'état, ex. 'representantLegal', 'contactDirect'
 * @param {string} config.actionPrefix    — préfixe des types d'action, ex. 'REPRESENTANT_LEGAL', 'CONTACT_DIRECT'
 * @param {string} config.localStorageKey — clé localStorage, ex. 'representantLegalData', 'contactDirectData'
 */
export function createSubEntitySlice({ sliceName, prefix, actionPrefix, localStorageKey }) {
  const initialState = {
    [`${prefix}Nom`]: '',
    [`${prefix}Prenom`]: '',
    [`${prefix}Email`]: '',
    [`${prefix}Telephone`]: '',
    [`${prefix}Genre`]: 'Masculin',
    appellationCourrier: 'Cher monsieur',
    nom_Complet: '',
  };

  const slice = createSlice({
    name: sliceName,
    initialState,
    reducers: {},
    extraReducers: (builder) => {
      builder
        .addCase(`UPDATE_${actionPrefix}_NOM`, (state, action) => {
          const newNom = action.payload || '';
          state[`${prefix}Nom`] = newNom;
          state.nom_Complet = newNom && state[`${prefix}Prenom`]
            ? `${newNom} ${state[`${prefix}Prenom`]}`
            : newNom;
        })
        .addCase(`UPDATE_${actionPrefix}_PRENOM`, (state, action) => {
          const newPrenom = action.payload || '';
          state[`${prefix}Prenom`] = newPrenom;
          state.nom_Complet = state[`${prefix}Nom`] && newPrenom
            ? `${state[`${prefix}Nom`]} ${newPrenom}`
            : newPrenom;
        })
        .addCase(`UPDATE_${actionPrefix}_EMAIL`, (state, action) => {
          state[`${prefix}Email`] = action.payload || '';
        })
        .addCase(`UPDATE_${actionPrefix}_TELEPHONE`, (state, action) => {
          state[`${prefix}Telephone`] = action.payload || '';
        })
        .addCase(`UPDATE_${actionPrefix}_GENRE`, (state, action) => {
          state[`${prefix}Genre`] = action.payload || 'Masculin';
          state.appellationCourrier = action.payload === 'Masculin' ? 'Cher monsieur' : 'Chère madame';
        })
        .addCase(`SET_${actionPrefix}_FOR_MODIFICATION`, (state, action) => {
          const data = action.payload || {};
          state[`${prefix}Nom`] = data[`${prefix}Nom`] || '';
          state[`${prefix}Prenom`] = data[`${prefix}Prenom`] || '';
          state[`${prefix}Email`] = data[`${prefix}Email`] || '';
          state[`${prefix}Telephone`] = data[`${prefix}Telephone`] || '';
          state[`${prefix}Genre`] = data[`${prefix}Genre`] || 'Masculin';
          state.appellationCourrier = data[`${prefix}Genre`] === 'Masculin' ? 'Cher monsieur' : 'Chère madame';
          state.nom_Complet = (data[`${prefix}Nom`] || '') && (data[`${prefix}Prenom`] || '')
            ? `${data[`${prefix}Nom`]} ${data[`${prefix}Prenom`]}`
            : data[`${prefix}Nom`] || data[`${prefix}Prenom`] || '';
        })
        .addCase(`RESET_${actionPrefix}`, () => {
          localStorage.removeItem(localStorageKey);
          return initialState;
        });
    },
  });

  return slice;
}

// ========================================================================
// Instances : Représentant Légal PM
// ========================================================================
const reprLegPMSlice = createSubEntitySlice({
  sliceName: 'ReprLeg',
  prefix: 'representantLegal',
  actionPrefix: 'REPRESENTANT_LEGAL',
  localStorageKey: 'representantLegalData',
});

export const reprLegPMReducer = reprLegPMSlice.reducer;

export const setRepresentantLegalForModification = (data) => ({
  type: 'SET_REPRESENTANT_LEGAL_FOR_MODIFICATION',
  payload: data,
});

// ========================================================================
// Instances : Contact Direct PM
// ========================================================================
const contDirPMSlice = createSubEntitySlice({
  sliceName: 'contactDirect',
  prefix: 'contactDirect',
  actionPrefix: 'CONTACT_DIRECT',
  localStorageKey: 'contactDirectData',
});

export const contDirPMReducer = contDirPMSlice.reducer;

export const setContactDirectForModification = (data) => ({
  type: 'SET_CONTACT_DIRECT_FOR_MODIFICATION',
  payload: data,
});
