// allSearchSlice.js — migre depuis shearchReducer/allSearchReducer.js
// Phase 9B : thunks migres depuis searchActions.js
// Contient 3 slices independants : allSearch, globalContactsSearch, linkedSearch
import { createSlice } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';

// ========================================================================
// Thunks classiques (dispatching multiple string types vers sub-slices)
// ========================================================================

export const searchContacts = (searchTerm, user, token, selectedContactIds = []) => async (dispatch) => {
  try {
    dispatch({ type: 'SEARCH_CONTACTS_REQUEST' });
    if (!searchTerm.trim()) {
      dispatch({ type: 'SEARCH_CONTACTS_SUCCESS', payload: [] });
      return;
    }
    const res = await apiClient.post('/api/folder/rechercherContacts', {
      searchTerm, user, selectedContactIds,
    });
    dispatch({ type: 'SEARCH_CONTACTS_SUCCESS', payload: res.data });
  } catch (error) {
    dispatch({
      type: 'SEARCH_CONTACTS_FAIL',
      payload: error.response?.data?.message || error.message,
    });
  }
};

export const searchContactsLinkPartie = (searchTerm, user, token) => async (dispatch) => {
  try {
    dispatch({ type: 'SEARCH_CONTACTS_LINK_PARTIE_REQUEST' });
    if (!searchTerm.trim()) {
      dispatch({ type: 'SEARCH_CONTACTS_LINK_PARTIE_SUCCESS', payload: [] });
      return;
    }
    const res = await apiClient.post('/api/folder/rechercherContactsLink', {
      searchTerm, user,
    });
    dispatch({ type: 'SEARCH_CONTACTS_LINK_PARTIE_SUCCESS', payload: res.data });
  } catch (error) {
    dispatch({
      type: 'SEARCH_CONTACTS_LINK_PARTIE_FAIL',
      payload: error.response?.data?.message || error.message,
    });
  }
};

export const searchContactsForDossier = (searchTerm, token, selectedContactIds = []) => async (dispatch) => {
  try {
    dispatch({ type: 'SEARCH_CONTACTS_DOSSIER_REQUEST' });
    if (!searchTerm.trim()) {
      dispatch({ type: 'SEARCH_CONTACTS_DOSSIER_SUCCESS', payload: [] });
      return;
    }
    const res = await apiClient.post('/api/folder/rechercherContactsDossier', {
      searchTerm, selectedContactIds,
    });
    dispatch({ type: 'SEARCH_CONTACTS_DOSSIER_SUCCESS', payload: res.data });
  } catch (error) {
    dispatch({
      type: 'SEARCH_CONTACTS_DOSSIER_FAIL',
      payload: error.response?.data?.message || error.message,
    });
  }
};

export const searchAllUserContacts = (searchTerm, token) => async (dispatch) => {
  dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_REQUEST' });
  try {
    if (!searchTerm.trim()) {
      dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_SUCCESS', payload: [] });
      return;
    }
    const res = await apiClient.post('/api/folder/searchAllUserContacts', { searchTerm });
    dispatch({ type: 'SEARCH_ALL_USER_CONTACTS_SUCCESS', payload: res.data });
  } catch (error) {
    dispatch({
      type: 'SEARCH_ALL_USER_CONTACTS_FAIL',
      payload: error.response?.data?.message || error.message,
    });
  }
};

export const searchDossiersByParties = (searchTerm, token) => async (dispatch) => {
  try {
    dispatch({ type: 'SEARCH_DOSSIERS_BY_PARTIES_REQUEST' });
    if (!searchTerm.trim()) {
      dispatch({ type: 'SEARCH_DOSSIERS_BY_PARTIES_SUCCESS', payload: [] });
      return;
    }
    const res = await apiClient.post('/api/folder/searchDossiersByParties', { searchTerm });
    dispatch({ type: 'SEARCH_DOSSIERS_BY_PARTIES_SUCCESS', payload: res.data });
  } catch (error) {
    dispatch({
      type: 'SEARCH_DOSSIERS_BY_PARTIES_FAIL',
      payload: error.response?.data?.message || error.message,
    });
  }
};

// Action simple
export const resetContactsLinkPartie = () => ({ type: 'RESET_CONTACTS_LINK_PARTIE' });

// ======================================================================
// 1) allSearchReducer — recherche de contacts (contexte "partie")
// ======================================================================
const allSearchInitialState = {
  loading: false,
  all: [],
  error: null,
  loadingDossiers: false,
  dossierResults: [],
  dossierError: null,
};

const allSearchSlice = createSlice({
  name: 'allSearch',
  initialState: allSearchInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase('SEARCH_CONTACTS_REQUEST', (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase('SEARCH_CONTACTS_SUCCESS', (state, action) => {
        state.loading = false;
        state.all = action.payload;
        state.error = null;
      })
      .addCase('SEARCH_CONTACTS_FAIL', (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Dossiers
      .addCase('SEARCH_DOSSIERS_BY_PARTIES_REQUEST', (state) => {
        state.loadingDossiers = true;
        state.dossierError = null;
      })
      .addCase('SEARCH_DOSSIERS_BY_PARTIES_SUCCESS', (state, action) => {
        state.loadingDossiers = false;
        state.dossierResults = action.payload;
        state.dossierError = null;
      })
      .addCase('SEARCH_DOSSIERS_BY_PARTIES_FAIL', (state, action) => {
        state.loadingDossiers = false;
        state.dossierError = action.payload;
      });
  },
});

export const allSearchReducer = allSearchSlice.reducer;

// ======================================================================
// 2) globalContactsSearchReducer — recherche globale type Gmail
// ======================================================================
const globalContactsInitialState = {
  loadingAllUserContacts: false,
  allUserContactsResults: [],
  errorAllUserContacts: null,
};

const globalContactsSearchSlice = createSlice({
  name: 'globalContactsSearch',
  initialState: globalContactsInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase('SEARCH_ALL_USER_CONTACTS_REQUEST', (state) => {
        state.loadingAllUserContacts = true;
        state.errorAllUserContacts = null;
      })
      .addCase('SEARCH_ALL_USER_CONTACTS_SUCCESS', (state, action) => {
        state.loadingAllUserContacts = false;
        state.allUserContactsResults = action.payload;
      })
      .addCase('SEARCH_ALL_USER_CONTACTS_FAIL', (state, action) => {
        state.loadingAllUserContacts = false;
        state.errorAllUserContacts = action.payload;
        state.allUserContactsResults = [];
      })
      .addCase('SEARCH_ALL_USER_CONTACTS_RESET', () => ({ ...globalContactsInitialState }));
  },
});

export const globalContactsSearchReducer = globalContactsSearchSlice.reducer;

// ======================================================================
// 3) linkedSearchReducer — recherche contacts lies a une partie
// ======================================================================
const linkedSearchInitialState = {
  loading: false,
  all: [],
  error: null,
};

const linkedSearchSlice = createSlice({
  name: 'linkedSearch',
  initialState: linkedSearchInitialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase('SEARCH_CONTACTS_LINK_PARTIE_REQUEST', (state) => {
        state.loading = true;
      })
      .addCase('SEARCH_CONTACTS_LINK_PARTIE_SUCCESS', (state, action) => {
        state.loading = false;
        state.all = action.payload;
        state.error = null;
      })
      .addCase('SEARCH_CONTACTS_LINK_PARTIE_FAIL', (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase('RESET_CONTACTS_LINK_PARTIE', (state) => {
        state.loading = false;
        state.all = [];
        state.error = null;
      });
  },
});

export const linkedSearchReducer = linkedSearchSlice.reducer;
