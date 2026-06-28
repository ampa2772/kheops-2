// findContactSlice.js — migré depuis dossierReducers/DATAS/findContactReducer.js
import { createSlice } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';

// Fonction utilitaire pour nettoyer les données
const cleanData = (data) => {
  if (Array.isArray(data)) {
    return data.map(item => cleanData(item));
  } else if (data !== null && typeof data === 'object') {
    return Object.keys(data).reduce((acc, key) => {
      acc[key] = data[key] === null || data[key] === undefined ? '' : cleanData(data[key]);
      return acc;
    }, {});
  } else {
    return data;
  }
};

// ========================================================================
// Thunk migré depuis contactSharedActions.js
// ========================================================================

export const fetchContactById = (contactId, token) => async (dispatch) => {
  dispatch({ type: 'FETCH_CONTACT_BY_ID_REQUEST' });
  try {
    const res = await apiClient.get(
      `/api/folder/contact/${contactId}`,
    );
    const cleanedData = cleanData(res.data);
    dispatch({ type: 'FETCH_CONTACT_BY_ID_SUCCESS', payload: cleanedData });
  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message;
    dispatch({ type: 'FETCH_CONTACT_BY_ID_FAILURE', payload: errorMessage });
  }
};

const initialState = {
  contact: null,
  loading: false,
  error: null,
};

const findContactSlice = createSlice({
  name: 'findContact',
  initialState,
  reducers: {
    resetFindContact: (state) => {
      state.contact = null;
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase('FETCH_CONTACT_BY_ID_REQUEST', (state) => {
        state.contact = null; // Reset des anciennes données pour éviter d'afficher un contact périmé
        state.loading = true;
        state.error = null;
      })
      .addCase('FETCH_CONTACT_BY_ID_SUCCESS', (state, action) => {
        state.contact = action.payload;
        state.loading = false;
      })
      .addCase('FETCH_CONTACT_BY_ID_FAILURE', (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { resetFindContact } = findContactSlice.actions;

export default findContactSlice.reducer;
