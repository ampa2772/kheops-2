// genericCommunesSlice.js — migre depuis dossierReducers/DATAS/genericCommunesReducer.js
// Phase 9B : thunks migres depuis dataFetchActions.js + contactOutsideFolderActions.js
import { createSlice } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';

// ========================================================================
// Thunks classiques (types dynamiques ${prefix}_*)
// ========================================================================

export const fetchCommunesGeneric = ({ query, page = 1, limit = 20, prefix }) => {
  return async (dispatch) => {
    try {
      let normalizedQuery = query.replace(/\u00e7/g, 'c').replace(/'/g, ' ');
      const res = await apiClient.get('/api/folder/communes', {
        params: { nom_commune: normalizedQuery, page, limit },
      });
      const { communes, totalPages, currentPage } = res.data;
      if (communes.length > 0) {
        dispatch({ type: `${prefix}_SET_COMMUNES`, payload: communes });
      } else {
        dispatch({ type: `${prefix}_RESET_COMMUNES` });
      }
      dispatch({ type: `${prefix}_SET_PAGINATION`, payload: { totalPages, currentPage } });
    } catch (err) {
      console.error(err);
    }
  };
};

export const resetCommunesGeneric = (prefix) => ({ type: `${prefix}_RESET_COMMUNES` });

// ========================================================================
// Slice factory
// ========================================================================

const initialState = {
  communes: [],
  currentPage: 1,
  totalPages: Infinity,
};

/**
 * Factory : cree un slice RTK pour un prefixe donne.
 * Chaque instance ecoute les actions string `${prefix}_SET_COMMUNES`, etc.
 */
const createCommunesSlice = (prefix) =>
  createSlice({
    name: `communes_${prefix}`,
    initialState,
    reducers: {},
    extraReducers: (builder) => {
      builder
        .addCase(`${prefix}_SET_COMMUNES`, (state, action) => {
          state.communes = action.payload;
        })
        .addCase(`${prefix}_SET_PAGINATION`, (state, action) => {
          state.currentPage = action.payload.currentPage;
          state.totalPages = action.payload.totalPages;
        })
        .addCase(`${prefix}_RESET_COMMUNES`, (state) => {
          state.communes = [];
          state.currentPage = 1;
          state.totalPages = Infinity;
        });
    },
  });

// 9 instances
export const communesContactReducer                = createCommunesSlice('CONTACT').reducer;
export const communesNotaireReducer                = createCommunesSlice('NOTAIRE_MARIAGE').reducer;
export const communesNaissanceContactReducer       = createCommunesSlice('NAISSANCE_CONTACT').reducer;
export const communesPersonneChargeReducer         = createCommunesSlice('PERSONNE_CHARGE').reducer;
export const communesNaissancePCReducer            = createCommunesSlice('NAISSANCE_PC').reducer;
export const communesPersonneChargeUPReducer       = createCommunesSlice('PERSONNE_CHARGEUP').reducer;
export const communesNaissancePersonneChargeUPReducer = createCommunesSlice('NAISSANCE_PCUP').reducer;
export const communesPMReducer                     = createCommunesSlice('PM').reducer;
export const communesPMPReducer                    = createCommunesSlice('PMP').reducer;
