// agendaSlice.js — migré depuis agendaReducer.js
// Pas de localStorage. Constantes et thunks désormais locaux (Phase 9C-4).
import { createSlice } from '@reduxjs/toolkit';

import apiClient from '../../services/apiClient';
import { DELETE_DOSSIER_SUCCESS } from './currentDossierSlice';

// ========================================================================
// Action type constants (migrated from agendaActions.js — Phase 9C-4)
// ========================================================================
export const CREATE_AGENDA_EVENT_REQUEST = 'CREATE_AGENDA_EVENT_REQUEST';
export const CREATE_AGENDA_EVENT_SUCCESS = 'CREATE_AGENDA_EVENT_SUCCESS';
export const CREATE_AGENDA_EVENT_FAIL = 'CREATE_AGENDA_EVENT_FAIL';
export const DELETE_AGENDA_EVENT_REQUEST = 'DELETE_AGENDA_EVENT_REQUEST';
export const DELETE_AGENDA_EVENT_SUCCESS = 'DELETE_AGENDA_EVENT_SUCCESS';
export const DELETE_AGENDA_EVENT_FAIL = 'DELETE_AGENDA_EVENT_FAIL';
export const FETCH_AGENDA_EVENTS_REQUEST = 'FETCH_AGENDA_EVENTS_REQUEST';
export const FETCH_AGENDA_EVENTS_SUCCESS = 'FETCH_AGENDA_EVENTS_SUCCESS';
export const FETCH_AGENDA_EVENTS_FAIL = 'FETCH_AGENDA_EVENTS_FAIL';
export const UPDATE_AGENDA_EVENT_REQUEST = 'UPDATE_AGENDA_EVENT_REQUEST';
export const UPDATE_AGENDA_EVENT_SUCCESS = 'UPDATE_AGENDA_EVENT_SUCCESS';
export const UPDATE_AGENDA_EVENT_FAIL = 'UPDATE_AGENDA_EVENT_FAIL';
export const OPEN_DELETE_CONFIRM_MODAL = 'OPEN_DELETE_CONFIRM_MODAL';
export const CLOSE_DELETE_CONFIRM_MODAL = 'CLOSE_DELETE_CONFIRM_MODAL';
export const SEARCH_DOSSIERS_FOR_AGENDA_REQUEST = 'SEARCH_DOSSIERS_FOR_AGENDA_REQUEST';
export const SEARCH_DOSSIERS_FOR_AGENDA_SUCCESS = 'SEARCH_DOSSIERS_FOR_AGENDA_SUCCESS';
export const SEARCH_DOSSIERS_FOR_AGENDA_FAIL = 'SEARCH_DOSSIERS_FOR_AGENDA_FAIL';
export const RESET_DOSSIER_SEARCH_FOR_AGENDA = 'RESET_DOSSIER_SEARCH_FOR_AGENDA';
export const FETCH_DOSSIER_EVENTS_REQUEST = 'FETCH_DOSSIER_EVENTS_REQUEST';
export const FETCH_DOSSIER_EVENTS_SUCCESS = 'FETCH_DOSSIER_EVENTS_SUCCESS';
export const FETCH_DOSSIER_EVENTS_FAIL = 'FETCH_DOSSIER_EVENTS_FAIL';
export const FETCH_TOP_TASKS_REQUEST = 'FETCH_TOP_TASKS_REQUEST';
export const FETCH_TOP_TASKS_SUCCESS = 'FETCH_TOP_TASKS_SUCCESS';
export const FETCH_TOP_TASKS_FAIL = 'FETCH_TOP_TASKS_FAIL';

const sortByStartDate = (arr) =>
  [...arr].sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

const initialState = {
  events: [],
  loading: false,
  error: null,
  showConfirmDeleteModal: false,
  eventToDeleteId: null,
  dossierSearchResults: [],
  dossierSearchLoading: false,
  dossierSearchError: null,
  dossierEvents: [],
  loadingDossierEvents: false,
  errorDossierEvents: null,
  topTasks: [],
  loadingTopTasks: false,
  errorTopTasks: null,
};

const agendaSlice = createSlice({
  name: 'agenda',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // --- REQUESTS (loading=true) ---
      .addCase(FETCH_AGENDA_EVENTS_REQUEST, (state) => { state.loading = true; state.error = null; })
      .addCase(CREATE_AGENDA_EVENT_REQUEST, (state) => { state.loading = true; state.error = null; })
      .addCase(DELETE_AGENDA_EVENT_REQUEST, (state) => { state.loading = true; state.error = null; })
      .addCase(UPDATE_AGENDA_EVENT_REQUEST, (state) => { state.loading = true; state.error = null; })

      // --- FETCH SUCCESS ---
      .addCase(FETCH_AGENDA_EVENTS_SUCCESS, (state, action) => {
        state.events = sortByStartDate(action.payload);
        state.loading = false;
      })

      // --- CREATE SUCCESS ---
      .addCase(CREATE_AGENDA_EVENT_SUCCESS, (state, action) => {
        const newEvent = action.payload;
        state.events = sortByStartDate([...state.events, newEvent]);
        if (newEvent.dossier) {
          state.dossierEvents = sortByStartDate([...state.dossierEvents, newEvent]);
        }
        state.loading = false;
      })

      // --- DELETE SUCCESS ---
      .addCase(DELETE_AGENDA_EVENT_SUCCESS, (state, action) => {
        state.events = state.events.filter(e => e._id !== action.payload);
        state.dossierEvents = state.dossierEvents.filter(e => e._id !== action.payload);
        state.topTasks = state.topTasks.filter(t => t._id !== action.payload);
        state.loading = false;
        state.showConfirmDeleteModal = false;
        state.eventToDeleteId = null;
      })

      // --- UPDATE SUCCESS ---
      .addCase(UPDATE_AGENDA_EVENT_SUCCESS, (state, action) => {
        const updated = action.payload;
        state.events = sortByStartDate(state.events.map(e => e._id === updated._id ? updated : e));
        state.dossierEvents = sortByStartDate(state.dossierEvents.map(e => e._id === updated._id ? updated : e));
        state.topTasks = sortByStartDate(state.topTasks.map(t => t._id === updated._id ? updated : t));
        state.loading = false;
      })

      // --- FAILS ---
      .addCase(FETCH_AGENDA_EVENTS_FAIL, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(CREATE_AGENDA_EVENT_FAIL, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(DELETE_AGENDA_EVENT_FAIL, (state, action) => { state.loading = false; state.error = action.payload; })
      .addCase(UPDATE_AGENDA_EVENT_FAIL, (state, action) => { state.loading = false; state.error = action.payload; })

      // --- DELETE CONFIRM MODAL ---
      .addCase(OPEN_DELETE_CONFIRM_MODAL, (state, action) => {
        state.showConfirmDeleteModal = true;
        state.eventToDeleteId = action.payload;
      })
      .addCase(CLOSE_DELETE_CONFIRM_MODAL, (state) => {
        state.showConfirmDeleteModal = false;
        state.eventToDeleteId = null;
      })

      // --- DOSSIER SEARCH ---
      .addCase(SEARCH_DOSSIERS_FOR_AGENDA_REQUEST, (state) => {
        state.dossierSearchLoading = true;
        state.dossierSearchError = null;
      })
      .addCase(SEARCH_DOSSIERS_FOR_AGENDA_SUCCESS, (state, action) => {
        state.dossierSearchLoading = false;
        state.dossierSearchResults = action.payload;
      })
      .addCase(SEARCH_DOSSIERS_FOR_AGENDA_FAIL, (state, action) => {
        state.dossierSearchLoading = false;
        state.dossierSearchError = action.payload;
      })
      .addCase(RESET_DOSSIER_SEARCH_FOR_AGENDA, (state) => {
        state.dossierSearchResults = [];
        state.dossierSearchLoading = false;
        state.dossierSearchError = null;
      })

      // --- DOSSIER EVENTS ---
      .addCase(FETCH_DOSSIER_EVENTS_REQUEST, (state) => {
        state.loadingDossierEvents = true;
        state.errorDossierEvents = null;
      })
      .addCase(FETCH_DOSSIER_EVENTS_SUCCESS, (state, action) => {
        state.loadingDossierEvents = false;
        state.dossierEvents = action.payload;
      })
      .addCase(FETCH_DOSSIER_EVENTS_FAIL, (state, action) => {
        state.loadingDossierEvents = false;
        state.errorDossierEvents = action.payload;
      })

      // --- DELETE DOSSIER CASCADE : retirer événements/tâches liés ---
      .addCase(DELETE_DOSSIER_SUCCESS, (state, action) => {
        const { deletedEventIds } = action.payload;
        if (deletedEventIds && deletedEventIds.length > 0) {
          const idsSet = new Set(deletedEventIds);
          state.events = state.events.filter(e => !idsSet.has(e._id));
          state.dossierEvents = state.dossierEvents.filter(e => !idsSet.has(e._id));
          state.topTasks = state.topTasks.filter(t => !idsSet.has(t._id));
        }
      })

      // --- TOP TASKS ---
      .addCase(FETCH_TOP_TASKS_REQUEST, (state) => {
        state.loadingTopTasks = true;
        state.errorTopTasks = null;
      })
      .addCase(FETCH_TOP_TASKS_SUCCESS, (state, action) => {
        state.loadingTopTasks = false;
        state.topTasks = action.payload;
      })
      .addCase(FETCH_TOP_TASKS_FAIL, (state, action) => {
        state.loadingTopTasks = false;
        state.errorTopTasks = action.payload;
      })

      // CORRECTIF : Nettoyer le state agenda lors du logout/auth_error
      // pour éviter que les événements/tâches du compte A persistent.
      .addCase('LOGOUT', (state) => {
        state.events = [];
        state.dossierEvents = [];
        state.topTasks = [];
        state.loading = false;
        state.error = null;
        state.loadingTopTasks = false;
        state.errorTopTasks = null;
      })
      .addCase('AUTH_ERROR', (state) => {
        state.events = [];
        state.dossierEvents = [];
        state.topTasks = [];
        state.loading = false;
        state.error = null;
        state.loadingTopTasks = false;
        state.errorTopTasks = null;
      });
  },
});

// ========================================================================
// Thunks (migrated from agendaActions.js — Phase 9C-4)
// ========================================================================

export const fetchTop25Tasks = () => async (dispatch) => {
  dispatch({ type: FETCH_TOP_TASKS_REQUEST });
  try {
    const res = await apiClient.get('/api/agenda/tasks');
    dispatch({ type: FETCH_TOP_TASKS_SUCCESS, payload: res.data });
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    dispatch({ type: FETCH_TOP_TASKS_FAIL, payload: errorMessage });
    console.error("Erreur lors de la recuperation des taches urgentes:", errorMessage);
  }
};

export const fetchAgendaEvents = () => async (dispatch) => {
  dispatch({ type: FETCH_AGENDA_EVENTS_REQUEST });
  try {
    const res = await apiClient.get('/api/agenda/events');
    dispatch({ type: FETCH_AGENDA_EVENTS_SUCCESS, payload: res.data });
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    dispatch({ type: FETCH_AGENDA_EVENTS_FAIL, payload: errorMessage });
    console.error("Erreur lors de la recuperation des evenements:", errorMessage);
  }
};

export const createAgendaEvent = (eventData) => async (dispatch) => {
  dispatch({ type: CREATE_AGENDA_EVENT_REQUEST });
  try {
    const config = { headers: { 'Content-Type': 'application/json' } };
    const body = JSON.stringify(eventData);
    const res = await apiClient.post('/api/agenda/events', body, config);
    dispatch({ type: CREATE_AGENDA_EVENT_SUCCESS, payload: res.data });
    return Promise.resolve(res.data);
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    dispatch({ type: CREATE_AGENDA_EVENT_FAIL, payload: errorMessage });
    console.error("Erreur lors de la creation de l'evenement:", errorMessage);
    return Promise.reject(error);
  }
};

export const updateAgendaEvent = (eventId, eventData) => async (dispatch) => {
  dispatch({ type: UPDATE_AGENDA_EVENT_REQUEST });
  try {
    const config = { headers: { 'Content-Type': 'application/json' } };
    const body = JSON.stringify(eventData);
    const res = await apiClient.put(`/api/agenda/events/${eventId}`, body, config);
    dispatch({ type: UPDATE_AGENDA_EVENT_SUCCESS, payload: res.data });
    return Promise.resolve(res.data);
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    dispatch({ type: UPDATE_AGENDA_EVENT_FAIL, payload: errorMessage });
    console.error("Erreur lors de la mise a jour de l'evenement:", errorMessage);
    return Promise.reject(error);
  }
};

export const deleteAgendaEvent = (eventId) => async (dispatch) => {
  dispatch({ type: DELETE_AGENDA_EVENT_REQUEST });
  try {
    await apiClient.delete(`/api/agenda/events/${eventId}`);
    dispatch({ type: DELETE_AGENDA_EVENT_SUCCESS, payload: eventId });
    dispatch({ type: CLOSE_DELETE_CONFIRM_MODAL });
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    dispatch({ type: DELETE_AGENDA_EVENT_FAIL, payload: errorMessage });
    console.error("Erreur lors de la suppression de l'evenement:", errorMessage);
  }
};

export const fetchEventsForDossier = (dossierId) => async (dispatch) => {
  if (!dossierId) {
    dispatch({ type: FETCH_DOSSIER_EVENTS_SUCCESS, payload: [] });
    return;
  }
  dispatch({ type: FETCH_DOSSIER_EVENTS_REQUEST });
  try {
    const res = await apiClient.get(`/api/agenda/dossier/${dossierId}`);
    dispatch({ type: FETCH_DOSSIER_EVENTS_SUCCESS, payload: res.data });
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    dispatch({ type: FETCH_DOSSIER_EVENTS_FAIL, payload: errorMessage });
  }
};

export const searchDossiersForAgenda = (searchTerm) => async (dispatch) => {
  if (!searchTerm.trim()) {
    dispatch({ type: RESET_DOSSIER_SEARCH_FOR_AGENDA });
    return;
  }
  dispatch({ type: SEARCH_DOSSIERS_FOR_AGENDA_REQUEST });
  try {
    const res = await apiClient.post('/api/folder/searchDossiersByName', { searchTerm });
    dispatch({ type: SEARCH_DOSSIERS_FOR_AGENDA_SUCCESS, payload: res.data });
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    dispatch({ type: SEARCH_DOSSIERS_FOR_AGENDA_FAIL, payload: errorMessage });
  }
};

// ========================================================================
// Simple action creators
// ========================================================================

export const openDeleteConfirmModal = (eventId) => ({
  type: OPEN_DELETE_CONFIRM_MODAL,
  payload: eventId,
});

export const closeDeleteConfirmModal = () => ({
  type: CLOSE_DELETE_CONFIRM_MODAL,
});

export const resetDossierSearchForAgenda = () => ({
  type: RESET_DOSSIER_SEARCH_FOR_AGENDA,
});

export default agendaSlice.reducer;

