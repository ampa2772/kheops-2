// client/src/redux/slices/rechercheAvanceeSlice.js
// ------------------------------------------------------------------------
// Recherche avancee par criteres croises (Bureau <- loupe du header).
// Appelle POST /api/folder/rechercheAvancee et stocke { results, total }.
// ------------------------------------------------------------------------

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';

// Memes paliers que la home (« Afficher N dossiers »).
export const RA_LIMITS = [25, 50, 100, 200, 500];

// Criteres vides — sert aussi de reset des champs.
export const emptyCriteria = {
  nom: '',
  partie: '',
  contact: '',
  gestionnaire: '',
  type: '',
  reference: '',
  dateDebut: '',
  dateFin: '',
  sortBy: 'dateCreation',
  sortDir: 'desc',
  limit: 25,
};

// Au moins un critere de filtrage est-il renseigne ?
export const hasAnyCriteria = (c) => !!(c && (
  c.nom || c.partie || c.contact || c.gestionnaire || c.type || c.reference || c.dateDebut || c.dateFin
));

export const rechercheAvancee = createAsyncThunk(
  'rechercheAvancee/search',
  async (criteria, { rejectWithValue }) => {
    try {
      const res = await apiClient.post('/api/folder/rechercheAvancee', criteria);
      return res.data; // { results, total }
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

const initialState = {
  loading: false,
  results: [],
  total: 0,
  error: null,
  hasSearched: false,
};

const rechercheAvanceeSlice = createSlice({
  name: 'rechercheAvancee',
  initialState,
  reducers: {
    resetRechercheAvancee(state) {
      state.results = [];
      state.total = 0;
      state.error = null;
      state.hasSearched = false;
      state.loading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(rechercheAvancee.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(rechercheAvancee.fulfilled, (state, action) => {
        state.loading = false;
        state.results = action.payload?.results || [];
        state.total = action.payload?.total || 0;
        state.hasSearched = true;
      })
      .addCase(rechercheAvancee.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Erreur lors de la recherche.';
        state.hasSearched = true;
      });
  },
});

export const { resetRechercheAvancee } = rechercheAvanceeSlice.actions;
export default rechercheAvanceeSlice.reducer;
