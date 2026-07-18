// mariageDetailsSlice.js — migré depuis dossierReducers/PP/DetailMariage/DetailMariage.js
// localStorage.removeItem seulement sur RESET_MARIAGE_DETAILS
// ATTENTION: l'ancien reducer override la validity en fin de CHAQUE dispatch (errors={}, nbErrors=0, etc.)
// Ce comportement est reproduit via le wrapper.
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { isValidEmail, buildErrorObject, notaryInit, formatDateForInput } from '../utils/FonctionsDetailMariage';

const errors = buildErrorObject(notaryInit);

const initialState = {
  detailsMariage: {
    marriageLocation: '',
    marriageDate: '',
    regime_matrimonial: '',
    contractDate: '',
    notaryName: '',
  },
  notary: notaryInit,
  currentNotary: {},
  affichagesComposants: {
    modaleMariage: false,
    formMariage: false,
    listeNotairesAffich: false,
    confirmationAjout: false,
    formAjoutNotaire: false,
    contratMariageForm: false,
    addingText: false,
  },
  listeNotaires: {
    notaires: [],
    currentPage: 1,
    totalPages: Infinity,
  },
  validity: {
    errors: errors,
    nbErrors: Object.keys(errors).length,
    validEmail: false,
    submitAttempted: false,
  },
};

// ========================================================================
// Async Thunks
// ========================================================================

export const fetchNotaires = createAsyncThunk(
  'mariageDetails/fetchNotaires',
  async ({ query, page = 1, limit = 10 }) => {
    const res = await apiClient.get('/api/folder/notaires', {
      params: { nom: query, page, limit },
    });
    return res.data; // { notaires, totalPages, currentPage, emptyQuery }
  }
);

// ========================================================================
// Slice
// ========================================================================

const mariageDetailsSlice = createSlice({
  name: 'mariageDetailsReducer',
  initialState,
  reducers: {
    updateRegime_matrimonial(state, action) {
      state.detailsMariage.regime_matrimonial = action.payload;
    },
    updateMarriageLocation(state, action) {
      state.detailsMariage.marriageLocation = action.payload;
    },
    updateMarriageDate(state, action) {
      state.detailsMariage.marriageDate = action.payload;
    },
    toggleFormContratMariage(state) {
      state.affichagesComposants.contratMariageForm = !state.affichagesComposants.contratMariageForm;
    },
    updateContractDate(state, action) {
      state.detailsMariage.contractDate = action.payload;
    },
    updateNotaryName(state, action) {
      state.detailsMariage.notaryName = action.payload;
    },
    resetMariageDetails() {
      localStorage.removeItem('mariageDetailsState');
      return initialState;
    },
    updateNotary(state, action) {
      Object.assign(state.notary, action.payload);
    },
    setConfirmation(state, action) {
      state.affichagesComposants.confirmationAjout = action.payload;
    },
    setDetailsMariageField: {
      // Fix 2026-07-04 : TOUS les appels du code passent 2 arguments positionnels
      // (`setDetailsMariageField('modaleMariage', true)`), mais sans `prepare`
      // Redux Toolkit ne garde que le 1er en payload — le reducer destructurait
      // { field, value } sur une string => no-op silencieux : la modale mariage
      // ne s'ouvrait plus depuis la migration RTK. Le prepare rétablit le contrat
      // (et accepte aussi un objet { field, value }).
      prepare(fieldOrObj, value) {
        if (fieldOrObj && typeof fieldOrObj === 'object') {
          return { payload: fieldOrObj };
        }
        return { payload: { field: fieldOrObj, value } };
      },
      reducer(state, action) {
        const { field, value } = action.payload;

        if (field in state.affichagesComposants) {
          state.affichagesComposants[field] = value;
        } else if (field in state.detailsMariage) {
          state.detailsMariage[field] = value;
        } else if (field in state.notary) {
          state.notary[field] = value;
          if (field === 'email') {
            state.validity.validEmail = isValidEmail(value);
            state.validity.errors[field] = !value;
          } else {
            state.validity.errors[field] = !value;
          }
          state.validity.nbErrors = Object.values(state.validity.errors).filter(Boolean).length;
        } else if (field in state.currentNotary) {
          state.currentNotary[field] = value;
        } else if (field in state.listeNotaires) {
          state.listeNotaires[field] = value;
        } else if (field in state.validity) {
          state.validity[field] = value;
        }
      },
    },
    selectNotaire(state, action) {
      const notaire = action.payload;
      state.currentNotary = notaire;
      state.detailsMariage.notaryName = `${notaire.nom} ${notaire.prenoms}`;
      state.listeNotaires.notaires = [];
      state.affichagesComposants.listeNotairesAffich = false;
    },
    setAddingText(state, action) {
      state.affichagesComposants.addingText = action.payload;
    },
    setListeAffich(state, action) {
      state.affichagesComposants.listeNotairesAffich = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase('SET_DETAIL_MARIAGE_FOR_MODIFICATION', (state, action) => {
        const data = action.payload;
        const formattedMarriageDate = formatDateForInput(data.marriageDate);
        const formattedContractDate = formatDateForInput(data.contractDate);

        Object.assign(state.detailsMariage, data, {
          marriageDate: formattedMarriageDate,
          contractDate: formattedContractDate,
        });
        if (data._id) state.detailsMariage._id = data._id;

        if (data.notary) {
          Object.assign(state.notary, data.notary);
          if (data.notary._id) state.notary._id = data.notary._id;
        }
      })

      // --- fetchNotaires lifecycle ---
      .addCase(fetchNotaires.fulfilled, (state, action) => {
        const { notaires, totalPages, currentPage, emptyQuery } = action.payload;

        if (emptyQuery) {
          state.listeNotaires.notaires = [];
          state.listeNotaires.currentPage = 1;
          state.affichagesComposants.listeNotairesAffich = false;
          state.affichagesComposants.confirmationAjout = false;
        } else if (!emptyQuery && Array.isArray(notaires) && notaires.length === 0) {
          state.listeNotaires.notaires = [];
          state.affichagesComposants.listeNotairesAffich = false;
          state.affichagesComposants.confirmationAjout = true;
        } else if (Array.isArray(notaires) && notaires.length === 1) {
          if (state.affichagesComposants.addingText) {
            state.currentNotary = notaires[0];
            state.detailsMariage.notaryName = `${notaires[0].nom} ${notaires[0].prenoms}`;
            state.listeNotaires.notaires = [notaires[0]];
            state.affichagesComposants.confirmationAjout = false;
            state.affichagesComposants.listeNotairesAffich = false;
          }
        } else if (Array.isArray(notaires) && notaires.length > 1) {
          state.listeNotaires.notaires = notaires;
          state.listeNotaires.currentPage = 1;
          state.affichagesComposants.listeNotairesAffich = true;
          state.affichagesComposants.confirmationAjout = false;
        }

        state.listeNotaires.totalPages = totalPages;
        state.listeNotaires.currentPage = currentPage;
      })

      .addCase('RESET_NOTAIRES', (state, action) => {
        const notaryFullName = action.payload
          ? `${action.payload.nom} ${action.payload.prenoms}`
          : `${state.currentNotary.nom} ${state.currentNotary.prenoms}`;

        state.listeNotaires.notaires = [];
        state.listeNotaires.currentPage = 1;
        state.listeNotaires.totalPages = Infinity;
        state.currentNotary = action.payload || state.currentNotary;
        Object.assign(state.notary, notaryInit);
        const freshErrors = buildErrorObject(notaryInit);
        state.validity.errors = freshErrors;
        state.validity.nbErrors = Object.keys(freshErrors).length;
        state.validity.validEmail = false;
        state.validity.submitAttempted = false;
        state.affichagesComposants.formAjoutNotaire = false;
        state.affichagesComposants.formMariage = true;
        state.detailsMariage.notaryName = notaryFullName;
      })

      .addCase('RESET_MARIAGE_DETAILS', () => {
        localStorage.removeItem('mariageDetailsState');
        return initialState;
      })

      .addCase('SET_CONTACT_FIELD_NOTAIRE_MARIAGE', (state, action) => {
        const { field, value } = action.payload;
        if (field in state.notary) {
          state.notary[field] = value;
        } else if (field in state.detailsMariage) {
          state.detailsMariage[field] = value;
        }
      });
  },
});

export const {
  updateRegime_matrimonial,
  updateMarriageLocation,
  updateMarriageDate,
  toggleFormContratMariage,
  updateContractDate,
  updateNotaryName,
  resetMariageDetails,
  updateNotary,
  setConfirmation,
  setDetailsMariageField,
  selectNotaire,
  setAddingText,
  setListeAffich,
} = mariageDetailsSlice.actions;

// ========================================================================
// Action creators migres depuis contactSharedActions.js
// ========================================================================

export const setDetailMariageForModification = (data) => ({ type: 'SET_DETAIL_MARIAGE_FOR_MODIFICATION', payload: data });
export const resetMariageDetailsShared = () => ({ type: 'RESET_MARIAGE_DETAILS' });
export const setContactFieldNotaireMariage = (field, value) => ({ type: 'SET_CONTACT_FIELD_NOTAIRE_MARIAGE', payload: { field, value } });



// --- Wrapper : force NO ERRORS après chaque dispatch (comme l'ancien reducer) ---
// NOTE : Immer finalise (freeze) le state retourné par createSlice.reducer,
// il faut donc créer une copie avant de le modifier.
const wrappedReducer = (state, action) => {
  const nextState = mariageDetailsSlice.reducer(state, action);

  // OVERRIDE: FORCE NO ERRORS (reproduit le comportement exact de l'ancien reducer)
  if (nextState.validity) {
    return {
      ...nextState,
      validity: {
        ...nextState.validity,
        errors: {},
        nbErrors: 0,
        validEmail: true,
        submitAttempted: false,
      },
    };
  }

  return nextState;
};

export default wrappedReducer;
