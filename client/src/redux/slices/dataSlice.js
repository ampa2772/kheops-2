// client/src/redux/slices/dataSlice.js
// Migration RTK Phase 5G — dataReducer (53 lignes -> createSlice)
// Phase 9B : thunks migres depuis dataFetchActions.js

import { createSlice } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';

// ========================================================================
// Thunks classiques (dispatching string types)
// ========================================================================

export const fetchDefaultContact = (defaultId) => async (dispatch) => {
  dispatch({ type: 'FETCH_DEFAULT_CONTACT_REQUEST' });
  try {
    const response = await apiClient.post('/api/folder/contactDefault', { defaultId });
    dispatch({ type: 'FETCH_DEFAULT_CONTACT_SUCCESS', payload: response.data });
  } catch (error) {
    console.error('Erreur lors de la recuperation du contact par defaut:', error);
    dispatch({ type: 'FETCH_DEFAULT_CONTACT_FAILURE', payload: error.message });
  }
};

export const fetchProfessions = (query) => async (dispatch) => {
  if (!query.trim()) {
    dispatch({ type: 'RESET_MATCHING_PROFESSIONS' });
    return;
  }
  try {
    const res = await apiClient.get('/api/folder/professions', {
      params: { nom_profession: query },
    });
    const professionNames = res.data.map(profession => profession.name);
    if (professionNames.length > 0) {
      dispatch({ type: 'SET_MATCHING_PROFESSIONS', payload: professionNames });
    } else {
      dispatch({ type: 'RESET_MATCHING_PROFESSIONS' });
    }
  } catch (err) {
    console.error('Erreur lors de la recuperation des professions:', err);
    dispatch({ type: 'FETCH_PROFESSIONS_ERROR', error: err });
  }
};

export const fetchAllProfessions = () => async (dispatch) => {
  try {
    const res = await apiClient.get('/api/folder/professions');
    dispatch({ type: 'SET_ALL_PROFESSIONS', payload: res.data });
  } catch (err) {
    console.error('Erreur lors de la recuperation de toutes les professions:', err);
  }
};

export const saveNewProfession = (name) => async (dispatch) => {
  try {
    await apiClient.post('/api/folder/profession', { name });
    dispatch(fetchAllProfessions());
  } catch (err) {
    console.error('Erreur lors de la creation de la profession:', err);
  }
};

export const fetchPays = (query) => async (dispatch) => {
  try {
    const res = await apiClient.get('/api/folder/pays', {
      params: { nom_pays: query },
    });
    const pays = res.data;
    if (pays.length > 0) {
      dispatch({ type: 'SET_MATCHING_PAYS', payload: pays });
    } else {
      dispatch({ type: 'RESET_MATCHING_PAYS' });
    }
  } catch (err) {
    console.error('Erreur lors de la recuperation des pays:', err);
    dispatch({ type: 'FETCH_PAYS_ERROR', error: err });
  }
};

export const fetchNationalites = (query) => async (dispatch) => {
  try {
    const res = await apiClient.get('/api/folder/nationalites', {
      params: { nom_nationalite: query },
    });
    const nationalites = res.data;
    if (nationalites.length > 0) {
      dispatch({ type: 'SET_MATCHING_NATIONALITES', payload: nationalites });
    } else {
      dispatch({ type: 'RESET_MATCHING_NATIONALITES' });
    }
  } catch (err) {
    console.error('Erreur lors de la recuperation des nationalites:', err);
    dispatch({ type: 'FETCH_NATIONALITES_ERROR', error: err });
  }
};

// ========================================================================
// Slice
// ========================================================================

const dataSlice = createSlice({
  name: 'data',
  initialState: {
    matchingPaysNaissance: [],
    matchingProfessions: [],
    matchingNationalities: [],
    allProfessions: [],
  },
  reducers: {
    setMatchingProfessions(state, action) {
      state.matchingProfessions = action.payload;
    },
    resetMatchingProfessions(state) {
      state.matchingProfessions = [];
    },
    setMatchingPays(state, action) {
      state.matchingPaysNaissance = action.payload;
    },
    resetMatchingPays(state) {
      state.matchingPaysNaissance = [];
    },
    setMatchingNationalites(state, action) {
      state.matchingNationalities = action.payload;
    },
    resetMatchingNationalites(state) {
      state.matchingNationalities = [];
    },
    setAllProfessions(state, action) {
      state.allProfessions = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Compatibilité avec les dispatches existants utilisant des types string directs
    builder.addCase('SET_MATCHING_PROFESSIONS', (state, action) => {
      state.matchingProfessions = action.payload;
    });
    builder.addCase('RESET_MATCHING_PROFESSIONS', (state) => {
      state.matchingProfessions = [];
    });
    builder.addCase('SET_MATCHING_PAYS', (state, action) => {
      state.matchingPaysNaissance = action.payload;
    });
    builder.addCase('RESET_MATCHING_PAYS', (state) => {
      state.matchingPaysNaissance = [];
    });
    builder.addCase('SET_MATCHING_NATIONALITES', (state, action) => {
      state.matchingNationalities = action.payload;
    });
    builder.addCase('RESET_MATCHING_NATIONALITES', (state) => {
      state.matchingNationalities = [];
    });
    builder.addCase('SET_ALL_PROFESSIONS', (state, action) => {
      state.allProfessions = action.payload;
    });
  },
});

export const {
  setMatchingProfessions,
  resetMatchingProfessions,
  setMatchingPays,
  resetMatchingPays,
  setMatchingNationalites,
  resetMatchingNationalites,
  setAllProfessions,
} = dataSlice.actions;

export default dataSlice.reducer;
