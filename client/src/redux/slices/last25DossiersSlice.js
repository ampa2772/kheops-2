// last25DossiersSlice.js — migré depuis dossierReducers/Dossier/last25DossiersReducer.js
// Persistance conditionnelle via wrapper pattern
import { createSlice } from '@reduxjs/toolkit';
import { UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS, DELETE_DOSSIER_SUCCESS, UPDATE_CURRENT_DOSSIER_SUCCESS } from './currentDossierSlice';

const lastDossiersStateFromStorage = localStorage.getItem('lastDossiersState');

const defaultInitialState = {
  loading: false,
  lastDossiers: [],
  error: null,
  fetchAttempted: false,
};

const initialState = lastDossiersStateFromStorage
  ? JSON.parse(lastDossiersStateFromStorage)
  : defaultInitialState;

const last25DossiersSlice = createSlice({
  name: 'last25Dossiers',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase('FETCH_LAST_25_DOSSIERS_REQUEST', (state) => {
        state.loading = true;
        state.fetchAttempted = true;
        state.error = null;
      })

      .addCase('FETCH_LAST_25_DOSSIERS_SUCCESS', (state, action) => {
        state.loading = false;
        state.lastDossiers = action.payload;
        state.error = null;
        state.fetchAttempted = true;
      })

      .addCase('FETCH_LAST_25_DOSSIERS_ERROR', (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.fetchAttempted = true;
      })

      .addCase('MOVE_DOSSIER_TO_TOP', (state, action) => {
        const dossierToMove = action.payload;
        if (!dossierToMove || !dossierToMove._id) return;

        const filteredList = (state.lastDossiers || []).filter(d => d._id !== dossierToMove._id);
        state.lastDossiers = [dossierToMove, ...filteredList].slice(0, 25);
      })

      .addCase(UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS, (state, action) => {
        const { dossierId, docId } = action.payload;
        const idx = state.lastDossiers.findIndex(d => d._id === dossierId);
        if (idx !== -1) {
          const dossier = state.lastDossiers[idx];
          if (dossier.dossier?.documents) {
            dossier.dossier.documents = dossier.dossier.documents.filter(
              doc => doc._id.toString() !== docId.toString()
            );
          }
        }
      })

      .addCase(DELETE_DOSSIER_SUCCESS, (state, action) => {
        const { dossierId } = action.payload;
        state.lastDossiers = state.lastDossiers.filter(d => d._id !== dossierId);
      })

      .addCase('SUBFOLDER_ACTION_SUCCESS', (state, action) => {
        const updated = action.payload;
        const idx = state.lastDossiers.findIndex(d => d._id === updated._id);
        if (idx !== -1) {
          state.lastDossiers[idx] = updated;
        }
      })

      .addCase('UPDATE_CURRENT_DOSSIER', (state, action) => {
        const idx = state.lastDossiers.findIndex(d => d._id === action.payload._id);
        if (idx !== -1) {
          state.lastDossiers[idx] = action.payload;
        }
      })

      // CORRECTIF FACTURATION : Synchroniser lastDossiers quand le currentDossier est mis
      // à jour (par ex. après génération de facture via socket, ajout de paiement, archivage).
      // Sans cela, la page Facturations utilise des données périmées et classe les dossiers
      // dans la mauvaise colonne.
      .addCase(UPDATE_CURRENT_DOSSIER_SUCCESS, (state, action) => {
        const updated = action.payload;
        if (!updated || !updated._id) return;
        const idx = state.lastDossiers.findIndex(d => d._id === updated._id);
        if (idx !== -1) {
          state.lastDossiers[idx] = updated;
        }
      })

      .addCase('SET_SELECTED_ENTITY', (state, action) => {
        if (!action.payload?._id) return;
        const entityId = action.payload._id;
        const entity = action.payload;

        state.lastDossiers.forEach((dossier) => {
          if (!dossier.dossier?.parties) return;

          const updatePartyList = (list) => {
            if (!list) return;
            list.forEach((p) => {
              if (p.partieData?._id === entityId) p.partieData = entity;
              if (p.avocats) p.avocats = p.avocats.map(av => av._id === entityId ? entity : av);
              if (p.contacts) p.contacts = p.contacts.map(c => c._id === entityId ? entity : c);
            });
          };

          updatePartyList(dossier.dossier.parties.pour);
          updatePartyList(dossier.dossier.parties.contre);
        });
      })

      .addCase('LOGOUT', () => {
        localStorage.removeItem('lastDossiersState');
        return defaultInitialState;
      })
      .addCase('AUTH_ERROR', () => {
        localStorage.removeItem('lastDossiersState');
        return defaultInitialState;
      });
  },
});

// --- Wrapper pour persistance conditionnelle ---
const PERSIST_ACTIONS = new Set([
  'FETCH_LAST_25_DOSSIERS_SUCCESS',
  'UPDATE_CURRENT_DOSSIER',
  UPDATE_CURRENT_DOSSIER_SUCCESS,
  'SET_SELECTED_ENTITY',
  'MOVE_DOSSIER_TO_TOP',
  UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS,
  DELETE_DOSSIER_SUCCESS,
  'SUBFOLDER_ACTION_SUCCESS',
  'AUTH_ERROR',
]);

const wrappedReducer = (state, action) => {
  const nextState = last25DossiersSlice.reducer(state, action);

  if (PERSIST_ACTIONS.has(action.type)) {
    try {
      localStorage.setItem('lastDossiersState', JSON.stringify(nextState));
    } catch (e) {
      console.error('Erreur localStorage last25Dossiers:', e);
    }
  }

  return nextState;
};

export default wrappedReducer;
