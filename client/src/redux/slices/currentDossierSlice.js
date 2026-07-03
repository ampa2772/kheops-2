// currentDossierSlice.js — fusionné depuis CurrentDossierReducer.js + part1.js + part2.js
// Persistance conditionnelle via wrapper pattern (strip loading/error avant save)
import { createSlice } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { initSocket } from '../../services/socketService';
import { showToast } from './notificationsSlice';
// Compagnon Word (mode web) : génération serveur + ouverture dans Microsoft Word.
import { openDocumentInWord } from '../../services/companion/companionClient';

// ========================================================================
// Action type constants (migrated from dossierActions.js — Phase 9D)
// ========================================================================
export const MOVE_DOSSIER_TO_TOP = 'MOVE_DOSSIER_TO_TOP';
export const UPDATE_DOCUMENT_COLOR_REQUEST = 'UPDATE_DOCUMENT_COLOR_REQUEST';
export const UPDATE_DOCUMENT_COLOR_SUCCESS = 'UPDATE_DOCUMENT_COLOR_SUCCESS';
export const UPDATE_DOCUMENT_COLOR_FAIL = 'UPDATE_DOCUMENT_COLOR_FAIL';
export const ADD_PAYMENT_REQUEST = 'ADD_PAYMENT_REQUEST';
export const ADD_PAYMENT_SUCCESS = 'ADD_PAYMENT_SUCCESS';
export const ADD_PAYMENT_FAIL = 'ADD_PAYMENT_FAIL';
export const ARCHIVE_INVOICE_REQUEST = 'ARCHIVE_INVOICE_REQUEST';
export const ARCHIVE_INVOICE_SUCCESS = 'ARCHIVE_INVOICE_SUCCESS';
export const ARCHIVE_INVOICE_FAIL = 'ARCHIVE_INVOICE_FAIL';
export const UPDATE_CURRENT_DOSSIER_SUCCESS = 'UPDATE_CURRENT_DOSSIER_SUCCESS';
export const FETCH_ARCHIVED_INVOICE_DETAILS_REQUEST = 'FETCH_ARCHIVED_INVOICE_DETAILS_REQUEST';
export const FETCH_ARCHIVED_INVOICE_DETAILS_SUCCESS = 'FETCH_ARCHIVED_INVOICE_DETAILS_SUCCESS';
export const FETCH_ARCHIVED_INVOICE_DETAILS_FAIL = 'FETCH_ARCHIVED_INVOICE_DETAILS_FAIL';
export const SUBFOLDER_ACTION_REQUEST = 'SUBFOLDER_ACTION_REQUEST';
export const SUBFOLDER_ACTION_SUCCESS = 'SUBFOLDER_ACTION_SUCCESS';
export const SUBFOLDER_ACTION_FAIL = 'SUBFOLDER_ACTION_FAIL';
export const MOVE_DOCUMENT_OPTIMISTIC = 'MOVE_DOCUMENT_OPTIMISTIC';
export const MOVE_DOCUMENT_REVERT = 'MOVE_DOCUMENT_REVERT';
export const DELETE_DOCUMENT_SUCCESS = 'DELETE_DOCUMENT_SUCCESS';
export const RENAME_DOCUMENT_SUCCESS = 'RENAME_DOCUMENT_SUCCESS';
export const UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS = 'UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS';
export const DELETE_DOSSIER_SUCCESS = 'DELETE_DOSSIER_SUCCESS';
export const SET_PENDING_EMAIL_ACTION_FOR_DOSSIER_CREATION = 'SET_PENDING_EMAIL_ACTION_FOR_DOSSIER_CREATION';
export const CLEAR_PENDING_EMAIL_ACTION = 'CLEAR_PENDING_EMAIL_ACTION';

// Génération de document : barre de progression visuelle
export const DOC_GEN_START = 'DOC_GEN_START';
export const DOC_GEN_UPDATE = 'DOC_GEN_UPDATE';
export const DOC_GEN_END = 'DOC_GEN_END';

// --- Fonction Utilitaire ---
const updateDossierName = (parties) => {
  if (!parties || (!parties.pour && !parties.contre)) return "Dossier sans nom";
  const pourParties = Array.isArray(parties.pour) ? parties.pour : [];
  const contreParties = Array.isArray(parties.contre) ? parties.contre : [];
  const pourNames = pourParties.length > 0
    ? pourParties.map(p => p.nomPartie || p.partieData?.nom || p.partieData?.raisonSociale || p.partieData?.denomination || '?').join(' et ')
    : '';
  const contreNames = contreParties.length > 0
    ? contreParties.map(p => p.nomPartie || p.partieData?.nom || p.partieData?.raisonSociale || p.partieData?.denomination || '?').join(' et ')
    : '';
  let newName = '';
  if (pourNames && contreNames) {
    newName = `${pourNames} ${pourParties.length > 1 ? 'et autres… ' : ''}c/ ${contreNames} ${contreParties.length > 1 ? 'et autres…' : ''}`;
  } else if (pourNames) {
    newName = `${pourNames} ${pourParties.length > 1 ? 'et autres… ' : ''}`;
  } else if (contreNames) {
    newName = `c/ ${contreNames} ${contreParties.length > 1 ? 'et autres…' : ''}`;
  } else {
    newName = "Dossier sans parties";
  }
  return newName;
};

// --- État Initial ---
const currentDossierStateFromStorage = localStorage.getItem('currentDossierState');
const defaultInitialState = {
  loading: false,
  loadingEdit: false,
  dossier: null,
  previousDossier: null,
  error: null,
  errorEdit: null,
  documentTemplates: [],
  selectedDestinataires: [],
  selectedEntity: null,
  archivedInvoiceDetails: { loading: false, data: null, error: null },
  documentGeneration: { isGenerating: false, documentName: null, step: '', progress: 0 },
};

const initialState = currentDossierStateFromStorage
  ? { ...JSON.parse(currentDossierStateFromStorage), documentGeneration: { isGenerating: false, documentName: null, step: '', progress: 0 } }
  : defaultInitialState;

// --- Slice ---
const currentDossierSlice = createSlice({
  name: 'currentDossier',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // === DELETE_DOSSIER_SUCCESS : Nettoyer le currentDossier si c'est celui supprimé ===
      .addCase(DELETE_DOSSIER_SUCCESS, (state, action) => {
        const { dossierId } = action.payload;
        if (state.dossier && state.dossier._id === dossierId) {
          state.dossier = null;
          state.selectedEntity = null;
        }
      })

      // === DELETE_DOCUMENT_SUCCESS (traitement prioritaire dans l'ancien code) ===
      .addCase(DELETE_DOCUMENT_SUCCESS, (state, action) => {
        const { docId } = action.payload;
        if (state.dossier?.dossier && Array.isArray(state.dossier.dossier.documents)) {
          state.dossier.dossier.documents = state.dossier.dossier.documents.filter(
            doc => doc._id !== docId
          );
        }
      })

      .addCase(RENAME_DOCUMENT_SUCCESS, (state, action) => {
        const { docId, newNomDocument } = action.payload;
        if (state.dossier?.dossier && Array.isArray(state.dossier.dossier.documents)) {
          const doc = state.dossier.dossier.documents.find(d => d._id === docId);
          if (doc) {
            doc.nomDocument = newNomDocument;
          }
        }
      })

      // === PART 1 : Loading requests ===
      .addCase('FETCH_CURRENT_DOSSIER_REQUEST', (state) => {
        state.loading = true; state.error = null;
      })
      .addCase('UPDATE_DOSSIER_REQUEST', (state) => {
        state.loading = true; state.error = null;
      })
      .addCase('UPDATE_ENTITY_IN_DOSSIER_REQUEST', (state) => {
        state.loading = true; state.error = null;
      })
      .addCase(UPDATE_DOCUMENT_COLOR_REQUEST, (state) => {
        state.loading = true; state.error = null;
      })
      .addCase(SUBFOLDER_ACTION_REQUEST, (state) => {
        state.loading = true; state.error = null;
      })

      // === PART 1 : Success (dossier updates with entity sync) ===
      .addCase(UPDATE_CURRENT_DOSSIER_SUCCESS, (state, action) => {
        const updatedDossier = action.payload;
        let syncedEntity = state.selectedEntity;
        if (syncedEntity?._id && updatedDossier?.dossier?.parties) {
          const { pour = [], contre = [] } = updatedDossier.dossier.parties;
          const syncId = String(syncedEntity._id);
          const lookup = (blocks = []) => blocks.flatMap(b => [b.partieData, ...(b.avocats || []), ...(b.contacts || [])]).find(e => e?._id && String(e._id) === syncId);
          syncedEntity = lookup(pour) || lookup(contre) || syncedEntity;
        }
        state.loading = false;
        state.loadingEdit = false;
        state.dossier = updatedDossier;
        state.error = null;
        state.errorEdit = null;
        state.selectedEntity = syncedEntity;
      })
      .addCase('FETCH_CURRENT_DOSSIER_SUCCESS', (state, action) => {
        const updatedDossier = action.payload;
        let syncedEntity = state.selectedEntity;
        if (syncedEntity?._id && updatedDossier?.dossier?.parties) {
          const { pour = [], contre = [] } = updatedDossier.dossier.parties;
          const syncId = String(syncedEntity._id);
          const lookup = (blocks = []) => blocks.flatMap(b => [b.partieData, ...(b.avocats || []), ...(b.contacts || [])]).find(e => e?._id && String(e._id) === syncId);
          syncedEntity = lookup(pour) || lookup(contre) || syncedEntity;
        }
        state.loading = false;
        state.loadingEdit = false;
        state.dossier = updatedDossier;
        state.error = null;
        state.errorEdit = null;
        state.selectedEntity = syncedEntity;
      })
      .addCase('UPDATE_DOSSIER_SUCCESS', (state, action) => {
        const updatedDossier = action.payload;
        let syncedEntity = state.selectedEntity;
        if (syncedEntity?._id && updatedDossier?.dossier?.parties) {
          const { pour = [], contre = [] } = updatedDossier.dossier.parties;
          const syncId = String(syncedEntity._id);
          const lookup = (blocks = []) => blocks.flatMap(b => [b.partieData, ...(b.avocats || []), ...(b.contacts || [])]).find(e => e?._id && String(e._id) === syncId);
          syncedEntity = lookup(pour) || lookup(contre) || syncedEntity;
        }
        state.loading = false;
        state.loadingEdit = false;
        state.dossier = updatedDossier;
        state.error = null;
        state.errorEdit = null;
        state.selectedEntity = syncedEntity;
      })
      .addCase(SUBFOLDER_ACTION_SUCCESS, (state, action) => {
        const updatedDossier = action.payload;
        let syncedEntity = state.selectedEntity;
        if (syncedEntity?._id && updatedDossier?.dossier?.parties) {
          const { pour = [], contre = [] } = updatedDossier.dossier.parties;
          const syncId = String(syncedEntity._id);
          const lookup = (blocks = []) => blocks.flatMap(b => [b.partieData, ...(b.avocats || []), ...(b.contacts || [])]).find(e => e?._id && String(e._id) === syncId);
          syncedEntity = lookup(pour) || lookup(contre) || syncedEntity;
        }
        state.loading = false;
        state.loadingEdit = false;
        state.dossier = updatedDossier;
        state.error = null;
        state.errorEdit = null;
        state.selectedEntity = syncedEntity;
      })

      // === PART 1 : MOVE_DOCUMENT (optimistic + revert) ===
      .addCase(MOVE_DOCUMENT_OPTIMISTIC, (state, action) => {
        const { docId, subfolderId } = action.payload;
        if (state.dossier?.dossier && Array.isArray(state.dossier.dossier.documents)) {
          const doc = state.dossier.dossier.documents.find(d => d._id.toString() === docId);
          if (doc) doc.subfolderId = subfolderId;
        }
      })
      .addCase(MOVE_DOCUMENT_REVERT, (state, action) => {
        const { docId, subfolderId } = action.payload;
        if (state.dossier?.dossier && Array.isArray(state.dossier.dossier.documents)) {
          const doc = state.dossier.dossier.documents.find(d => d._id.toString() === docId);
          if (doc) doc.subfolderId = subfolderId;
        }
      })

      // === PART 1 : Failures ===
      .addCase('FETCH_CURRENT_DOSSIER_ERROR', (state, action) => {
        state.loading = false; state.loadingEdit = false;
        state.error = action.payload; state.errorEdit = action.payload;
      })
      .addCase('UPDATE_DOSSIER_FAIL', (state, action) => {
        state.loading = false; state.loadingEdit = false;
        state.error = action.payload; state.errorEdit = action.payload;
      })
      .addCase('UPDATE_ENTITY_IN_DOSSIER_FAIL', (state, action) => {
        state.loading = false; state.loadingEdit = false;
        state.error = action.payload; state.errorEdit = action.payload;
      })
      .addCase(UPDATE_DOCUMENT_COLOR_FAIL, (state, action) => {
        state.loading = false; state.loadingEdit = false;
        state.error = action.payload; state.errorEdit = action.payload;
      })
      .addCase(SUBFOLDER_ACTION_FAIL, (state, action) => {
        state.loading = false; state.loadingEdit = false;
        state.error = action.payload; state.errorEdit = action.payload;
      })

      // === PART 1 : Document Templates ===
      .addCase('FETCH_DOCUMENT_TEMPLATES_REQUEST', (state) => {
        state.loading = true; state.error = null;
      })
      .addCase('FETCH_DOCUMENT_TEMPLATES_SUCCESS', (state, action) => {
        state.loading = false;
        state.documentTemplates = action.payload;
        state.error = null;
      })
      .addCase('FETCH_DOCUMENT_TEMPLATES_ERROR', (state, action) => {
        state.loading = false; state.error = action.payload;
      })

      // === PART 1 : Documents Dossier ===
      .addCase('FETCH_DOCUMENTS_DOSSIER_REQUEST', (state) => {
        state.loading = true; state.error = null;
      })
      .addCase('FETCH_DOCUMENTS_DOSSIER_SUCCESS', (state, action) => {
        state.loading = false;
        state.error = null;
        if (!state.dossier) state.dossier = {};
        if (!state.dossier.dossier) state.dossier.dossier = {};
        state.dossier.dossier.documents = action.payload;
      })
      .addCase('FETCH_DOCUMENTS_DOSSIER_FAIL', (state, action) => {
        state.loading = false; state.error = action.payload;
      })

      // === PART 1 : Destinataires & direct updates ===
      .addCase('SELECT_DESTINATAIRES', (state, action) => {
        state.selectedDestinataires = action.payload;
      })
      .addCase('UPDATE_CURRENT_DOSSIER', (state, action) => {
        state.dossier = action.payload;
      })
      .addCase('ADD_PAYMENT_SUCCESS', (state, action) => {
        state.dossier = action.payload;
      })
      .addCase('ARCHIVE_INVOICE_SUCCESS', (state, action) => {
        state.dossier = action.payload;
      })

      // === PART 2 : Entity edit ===
      .addCase('UPDATE_ENTITY_IN_DOSSIER_SUCCESS', (state) => {
        state.loadingEdit = false;
        state.errorEdit = null;
      })

      // === PART 2 : Archived invoice ===
      .addCase('FETCH_ARCHIVED_INVOICE_DETAILS_REQUEST', (state) => {
        state.archivedInvoiceDetails = { loading: true, data: null, error: null };
      })
      .addCase('FETCH_ARCHIVED_INVOICE_DETAILS_SUCCESS', (state, action) => {
        state.archivedInvoiceDetails = { loading: false, data: action.payload, error: null };
      })
      .addCase('FETCH_ARCHIVED_INVOICE_DETAILS_FAIL', (state, action) => {
        state.archivedInvoiceDetails = { loading: false, data: null, error: action.payload };
      })

      // === PART 2 : Update document color ===
      .addCase(UPDATE_DOCUMENT_COLOR_SUCCESS, (state, action) => {
        if (!state.dossier?.dossier?.documents) return;
        const { docId, color } = action.payload;
        const doc = state.dossier.dossier.documents.find(d => d._id.toString() === docId);
        if (doc) {
          doc.color = color;
        }
        state.loading = false;
      })

      // === PART 2 : SET_SELECTED_ENTITY ===
      // CORRECTION : Utilisation de String() pour les comparaisons d'ID afin de gerer
      // les cas ou les _id sont des ObjectId MongoDB vs des strings dans les champs Mixed.
      // On verifie aussi idPartie comme fallback pour les parties dont partieData._id est absent.
      .addCase('SET_SELECTED_ENTITY', (state, action) => {
        if (!action.payload) {
          state.selectedEntity = null;
          return;
        }
        const entityId = String(action.payload._id);
        const entity = action.payload;
        state.selectedEntity = entity;

        const safeParties = state.dossier?.dossier?.parties || { pour: [], contre: [] };
        const idMatch = (id) => id && String(id) === entityId;
        const updatePartyList = (list) => {
          if (!Array.isArray(list)) return [];
          return list.map(p => ({
            ...p,
            partieData: (idMatch(p.partieData?._id) || idMatch(p.idPartie)) ? { ...p.partieData, ...entity } : p.partieData,
            avocats: Array.isArray(p.avocats) ? p.avocats.map(av => idMatch(av._id) ? entity : av) : [],
            contacts: Array.isArray(p.contacts) ? p.contacts.map(c => idMatch(c._id) ? entity : c) : [],
          }));
        };

        const updatedParties = {
          pour: updatePartyList(safeParties.pour),
          contre: updatePartyList(safeParties.contre),
        };

        if (state.dossier?.dossier) {
          state.dossier.dossier.nom = updateDossierName(updatedParties);
          state.dossier.dossier.parties = updatedParties;
        }
      })

      .addCase('CLEAR_SELECTED_ENTITY_IN_DOSSIER', (state) => {
        state.selectedEntity = null;
      })

      .addCase('SET_DOSSIER_NAME', (state, action) => {
        if (state.dossier?.dossier) {
          state.dossier.dossier.nom = action.payload;
        }
      })

      .addCase('ADD_DROPPED_DOCUMENT_SUCCESS', (state, action) => {
        if (!state.dossier) state.dossier = {};
        if (!state.dossier.dossier) state.dossier.dossier = {};
        if (!Array.isArray(state.dossier.dossier.documents)) state.dossier.dossier.documents = [];
        state.dossier.dossier.documents.unshift(action.payload);
      })

      // CORRECTIF : Nettoyer le state currentDossier lors du logout/auth_error
      // pour éviter que les données du compte A persistent dans le Redux store.
      .addCase('LOGOUT', (state) => {
        state.dossier = null;
        state.selectedEntity = null;
        state.loading = false;
        state.error = null;
        state.documentTemplates = [];
      })
      .addCase('AUTH_ERROR', (state) => {
        state.dossier = null;
        state.selectedEntity = null;
        state.loading = false;
        state.error = null;
        state.documentTemplates = [];
      })

      // === Génération de document : barre de progression ===
      .addCase(DOC_GEN_START, (state, action) => {
        state.documentGeneration = {
          isGenerating: true,
          documentName: action.payload?.documentName || 'Document',
          step: action.payload?.step || 'Préparation...',
          progress: action.payload?.progress || 0,
        };
      })
      .addCase(DOC_GEN_UPDATE, (state, action) => {
        if (!state.documentGeneration) {
          state.documentGeneration = { isGenerating: true, documentName: null, step: '', progress: 0 };
        }
        if (typeof action.payload?.progress === 'number') state.documentGeneration.progress = action.payload.progress;
        if (action.payload?.step) state.documentGeneration.step = action.payload.step;
      })
      .addCase(DOC_GEN_END, (state) => {
        state.documentGeneration = { isGenerating: false, documentName: null, step: '', progress: 0 };
      });
  },
});

// --- Wrapper pour persistance conditionnelle (strip loading/error) ---
const PERSIST_ACTIONS = new Set([
  'FETCH_CURRENT_DOSSIER_SUCCESS',
  UPDATE_CURRENT_DOSSIER_SUCCESS,
  SUBFOLDER_ACTION_SUCCESS,
  'FETCH_DOCUMENT_TEMPLATES_SUCCESS',
  'FETCH_DOCUMENTS_DOSSIER_SUCCESS',
  'SELECT_DESTINATAIRES',
  'UPDATE_CURRENT_DOSSIER',
  'UPDATE_DOSSIER_SUCCESS',
  'SET_SELECTED_ENTITY',
  'SET_DOSSIER_NAME',
  'ADD_DROPPED_DOCUMENT_SUCCESS',
  UPDATE_DOCUMENT_COLOR_SUCCESS,
  DELETE_DOSSIER_SUCCESS,
  DELETE_DOCUMENT_SUCCESS,
  RENAME_DOCUMENT_SUCCESS,
  MOVE_DOCUMENT_OPTIMISTIC,
  MOVE_DOCUMENT_REVERT,
  'FETCH_ARCHIVED_INVOICE_DETAILS_SUCCESS',
  'LOGOUT',
  'AUTH_ERROR',
]);

const wrappedReducer = (state, action) => {
  const nextState = currentDossierSlice.reducer(state, action);

  if (PERSIST_ACTIONS.has(action.type)) {
    try {
      const stateToSave = { ...nextState, loading: undefined, error: undefined };
      localStorage.setItem('currentDossierState', JSON.stringify(stateToSave));
    } catch (e) {
      console.error("Erreur lors de la sauvegarde de l'état dans localStorage:", e);
    }
  }

  // Persistance défensive de l'ID du dernier dossier consulté.
  // Sert de fallback si le state currentDossierState complet devient stale ou
  // mal désérialisé : on peut toujours re-fetcher le dernier dossier au boot.
  // Effacé au logout et à la suppression du dossier courant.
  try {
    if (action.type === 'FETCH_CURRENT_DOSSIER_SUCCESS' || action.type === UPDATE_CURRENT_DOSSIER_SUCCESS || action.type === 'UPDATE_DOSSIER_SUCCESS') {
      const id = nextState?.dossier?._id;
      if (id) localStorage.setItem('kheopsLastOpenedDossierId', String(id));
    } else if (action.type === 'LOGOUT' || action.type === 'AUTH_ERROR') {
      localStorage.removeItem('kheopsLastOpenedDossierId');
    } else if (action.type === DELETE_DOSSIER_SUCCESS) {
      const deletedId = action.payload?.dossierId;
      const lastId = localStorage.getItem('kheopsLastOpenedDossierId');
      if (deletedId && lastId === String(deletedId)) {
        localStorage.removeItem('kheopsLastOpenedDossierId');
      }
    }
  } catch (_e) { /* localStorage indispo : silencieux */ }

  return nextState;
};


// ========================================================================
// Thunks migres depuis dossierActions.js — Phase 9D
// ========================================================================

export const updateCurrentDossierFromSocket = (dossier) => ({
  type: UPDATE_CURRENT_DOSSIER_SUCCESS,
  payload: dossier,
});

export const fetchCurrentDossier = (dossierId, token) => async (dispatch) => {
  dispatch({ type: 'FETCH_CURRENT_DOSSIER_REQUEST' });
  try {
    const response = await apiClient.get(`/api/folder/dossier/${dossierId}`);
    if (!response.data || !response.data.dossier) {
      console.warn('[fetchCurrentDossier] Attention: La structure du dossier retourné semble incomplète.');
    }
    // === DEBUG : Logger les emails des contacts dans les parties reçues ===
    const dossierData = response.data?.dossier;
    if (dossierData?.parties) {
      const logContacts = (parties, side) => {
        (parties || []).forEach((p, i) => {
          (p.contacts || []).forEach((c, j) => {
            console.log(`[fetchCurrentDossier] ${side}[${i}].contacts[${j}]: _id=${c._id} nom=${c.nom} email=${c.email}`);
          });
        });
      };
      logContacts(dossierData.parties.pour, 'pour');
      logContacts(dossierData.parties.contre, 'contre');
    }
    // === FIN DEBUG ===
    dispatch({ type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: response.data });
  } catch (error) {
    console.error('[fetchCurrentDossier] Erreur:', error);
    dispatch({ type: 'FETCH_CURRENT_DOSSIER_ERROR', payload: error.response?.data?.error || error.message });
  }
};

export const setCurrentDossier = (dossier) => (dispatch, getState) => {
  if (!dossier || !dossier._id) {
    console.error('setCurrentDossier a été appelé avec un dossier invalide.', dossier);
    return;
  }
  dispatch({ type: MOVE_DOSSIER_TO_TOP, payload: dossier });
  const { token } = getState().login;
  if (!token) {
    console.error('Token non disponible pour fetchCurrentDossier.');
    dispatch({ type: 'FETCH_CURRENT_DOSSIER_ERROR', payload: 'Non authentifié' });
    return;
  }
  dispatch(fetchCurrentDossier(dossier._id, token));
};

export const fetchDocumentTemplates = (searchTerm = '') => async (dispatch) => {
  dispatch({ type: 'FETCH_DOCUMENT_TEMPLATES_REQUEST' });
  try {
    const response = await apiClient.post('/api/fusion/getTemplates', { name: searchTerm });
    dispatch({ type: 'FETCH_DOCUMENT_TEMPLATES_SUCCESS', payload: response.data });
  } catch (error) {
    dispatch({ type: 'FETCH_DOCUMENT_TEMPLATES_ERROR', payload: error.response?.data?.error || error.message });
  }
};

export const createDocumentInDossier = (dossierId, templateFileName, token, user, recipients = [], templateCategory = '', finalDocumentName, subfolderId = null) => async (dispatch) => {
  // Démarre la barre de progression visuelle. Les paliers reflètent les étapes
  // réelles (POST métadonnées → IPC génération → upload cloud), animés en CSS.
  dispatch({ type: DOC_GEN_START, payload: { documentName: finalDocumentName || 'Document', step: 'Création des métadonnées...', progress: 8 } });
  try {
    const response = await apiClient.post('/api/fusion/createDocument',
      { dossierId, templateFileName, recipients, templateCategory, finalDocumentName, subfolderId }
    );
    const newDocMetadata = response.data?.doc;
    const dossierComplet = response.data?.dossier;
    if (newDocMetadata && dossierComplet) {
      dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 30, step: 'Préparation du modèle...' } });
      // Mettre à jour le state Redux immédiatement pour que le document apparaisse dans la liste
      dispatch({ type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: dossierComplet });

      if (window.electron?.handleDocumentCreation) {
        dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 50, step: 'Génération du document...' } });
        // Mode Electron — IPC
        // rc36 : on transmet le JWT pour que docGenerator puisse appeler les
        // routes serveur authentifiées (notamment /user/profile/:userId qui
        // est désormais protégée par middleware auth + ownership strict).
        const result = await window.electron.handleDocumentCreation({
          folderName: newDocMetadata._id,
          clientData: { dossier: dossierComplet, user, recipients, jwtToken: token },
          templateFileName: templateFileName,
          localFileName: newDocMetadata.nomDocument,
          templateCategory: templateCategory,
        });
        if (!result.success) {
          console.error('[createDocumentInDossier] Erreur IPC:', result.error);
          // Rollback : supprimer le document fantôme (métadonnées sans fichier Word)
          try {
            await apiClient.post('/api/fusion/deleteDocument', { dossierId, docId: newDocMetadata._id });
            dispatch({ type: DELETE_DOCUMENT_SUCCESS, payload: { docId: newDocMetadata._id } });
          } catch (rollbackErr) {
            console.error('[createDocumentInDossier] Erreur rollback:', rollbackErr);
          }
          dispatch({ type: DOC_GEN_END });
          throw new Error(result.error || 'La génération du document Word a échoué.');
        }
        dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 95, step: 'Finalisation...' } });
      } else {
        // Mode Web — génération CÔTÉ SERVEUR puis ouverture via le COMPAGNON Word.
        // (Remplace l'ancien Socket.IO vers l'app desktop complète.)
        // 1) Le serveur fabrique le .docx (modèle + données du dossier) et l'enregistre
        //    sous documents/<docId>.docx.
        dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 60, step: 'Génération du document...' } });
        try {
          await apiClient.post(`/api/word/${newDocMetadata._id}/generate`, {
            templateName: templateFileName,
            clientData: { dossier: dossierComplet, recipients, userProfile: user },
          });
        } catch (genErr) {
          // Rollback (miroir de la branche Electron) : sans fichier généré, la
          // fiche créée à l'étape 1 serait un document fantôme — on la retire.
          console.error('[createDocumentInDossier] Échec génération serveur:', genErr.response?.data || genErr.message);
          try {
            await apiClient.post('/api/fusion/deleteDocument', { dossierId, docId: newDocMetadata._id });
            dispatch({ type: DELETE_DOCUMENT_SUCCESS, payload: { docId: newDocMetadata._id } });
          } catch (rollbackErr) {
            console.error('[createDocumentInDossier] Erreur rollback web:', rollbackErr);
          }
          dispatch({ type: DOC_GEN_END });
          const serverMsg = genErr.response?.data?.message;
          throw new Error(serverMsg || 'La génération du document a échoué (le document a été retiré du dossier).');
        }
        // 2) On demande au compagnon local d'ouvrir le document dans Microsoft Word.
        //    Si le compagnon est absent, le document reste généré et stocké ; seule
        //    l'ouverture automatique échoue (l'utilisateur sera invité à l'installer).
        dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 90, step: 'Ouverture dans Word...' } });
        try {
          await openDocumentInWord(newDocMetadata._id, { fileName: newDocMetadata.nomDocument });
        } catch (companionErr) {
          console.warn('[createDocumentInDossier] Ouverture compagnon impossible (document généré et stocké):', companionErr.message);
        }
      }
    } else {
      dispatch({ type: DOC_GEN_END });
      throw new Error('Réponse invalide du serveur lors de la création des métadonnées.');
    }
    dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 100, step: 'Terminé' } });
    setTimeout(() => dispatch({ type: DOC_GEN_END }), 700);
    return response.data;
  } catch (error) {
    console.error('[dossierActions] Erreur lors de la création du document (API):', error.response?.data || error.message);
    dispatch({ type: DOC_GEN_END });
    throw error;
  }
};

// === Création d'un document vierge (flux simplifié) ===
export const createBlankDocument = (dossierId, subfolderId = null) => async (dispatch) => {
  dispatch({ type: DOC_GEN_START, payload: { documentName: 'Document.docx', step: 'Création des métadonnées...', progress: 12 } });
  try {
    // 1. Créer les métadonnées sur le serveur (réutilise la route existante)
    const response = await apiClient.post('/api/fusion/createDocument', {
      dossierId,
      templateFileName: 'blank.docx',
      recipients: [],
      templateCategory: 'generated',
      finalDocumentName: 'Document.docx',
      subfolderId,
    });

    const newDocMetadata = response.data?.doc;
    const updatedDossier = response.data?.dossier;

    if (!newDocMetadata || !updatedDossier) {
      dispatch({ type: DOC_GEN_END });
      throw new Error('Réponse serveur invalide lors de la création du document.');
    }

    dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 45, step: 'Préparation du document vierge...' } });
    // 2. Mettre à jour le state Redux → le document apparaît dans la liste
    dispatch({ type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: updatedDossier });

    // 3. Fabriquer le fichier vierge
    if (window.electron?.handleBlankDocumentCreation) {
      // Mode Electron historique : copie d'un blank.docx local via IPC.
      dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 70, step: 'Création du fichier local...' } });
      const result = await window.electron.handleBlankDocumentCreation({
        docId: newDocMetadata._id,
        fileName: newDocMetadata.nomDocument,
      });
      if (!result.success) {
        console.error('[createBlankDocument] Erreur IPC Electron:', result.error);
      }
      dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 95, step: 'Finalisation...' } });
    } else {
      // Mode WEB : le serveur fabrique un .docx vierge sous documents/<docId>.docx
      // (téléchargeable et ouvrable ensuite comme n'importe quel document).
      dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 70, step: 'Fabrication du document vierge...' } });
      try {
        await apiClient.post(`/api/word/${newDocMetadata._id}/create-blank`);
      } catch (blankErr) {
        // Marche arrière : sans fichier, la fiche serait un document fantôme.
        console.error('[createBlankDocument] Échec fabrication serveur:', blankErr.response?.data || blankErr.message);
        try {
          await apiClient.post('/api/fusion/deleteDocument', { dossierId, docId: newDocMetadata._id });
          dispatch({ type: DELETE_DOCUMENT_SUCCESS, payload: { docId: newDocMetadata._id } });
        } catch (rollbackErr) {
          console.error('[createBlankDocument] Erreur rollback web:', rollbackErr);
        }
        dispatch({ type: DOC_GEN_END });
        throw new Error(blankErr.response?.data?.message || 'La création du document vierge a échoué (le document a été retiré du dossier).');
      }
      dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 95, step: 'Finalisation...' } });
    }

    dispatch({ type: DOC_GEN_UPDATE, payload: { progress: 100, step: 'Terminé' } });
    setTimeout(() => dispatch({ type: DOC_GEN_END }), 700);
    return response.data;
  } catch (error) {
    dispatch({ type: DOC_GEN_END });
    console.error('[createBlankDocument] Erreur:', error.response?.data || error.message);
    throw error;
  }
};

export const updateDocumentColor = (dossierId, docId, color, token) => async (dispatch) => {
  dispatch({ type: UPDATE_DOCUMENT_COLOR_REQUEST, payload: { docId } });
  try {
    const body = { dossierId, docId, color };
    const res = await apiClient.put('/api/fusion/document/color', body);
    dispatch({ type: UPDATE_DOCUMENT_COLOR_SUCCESS, payload: { docId, color: res.data.updatedDocument.color } });
  } catch (error) {
    dispatch({ type: UPDATE_DOCUMENT_COLOR_FAIL, payload: { docId, error: error.response?.data?.message || error.message } });
  }
};

export const fetchAllDocumentsInDossier = (dossierId, token) => async (dispatch) => {
  dispatch({ type: 'FETCH_DOCUMENTS_DOSSIER_REQUEST' });
  try {
    const response = await apiClient.get(`/api/fusion/user-documents/${dossierId}`);
    const documents = Array.isArray(response.data?.documents) ? response.data.documents : [];
    dispatch({ type: 'FETCH_DOCUMENTS_DOSSIER_SUCCESS', payload: documents });
  } catch (error) {
    dispatch({ type: 'FETCH_DOCUMENTS_DOSSIER_FAIL', payload: error.response?.data?.error || error.message });
  }
};

export const selectDestinatairesAction = (destObj, multi = false) => (dispatch, getState) => {
  const { selectedDestinataires } = getState().currentDossier;
  let newDestList;
  if (multi) {
    const alreadyIn = selectedDestinataires.findIndex((d) => d.id === destObj.id);
    newDestList = (alreadyIn > -1) ? selectedDestinataires.filter((d) => d.id !== destObj.id) : [...selectedDestinataires, destObj];
  } else {
    newDestList = [destObj];
  }
  dispatch({ type: 'SELECT_DESTINATAIRES', payload: newDestList });
};
export const deleteDocumentInDossier = (dossierId, doc, token) => async (dispatch) => {
  try {
    // 1. Supprimer la métadonnée en BDD
    await apiClient.post('/api/fusion/deleteDocument', { dossierId, docId: doc._id });
    dispatch({ type: DELETE_DOCUMENT_SUCCESS, payload: { docId: doc._id } });
    dispatch({ type: UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS, payload: { dossierId: dossierId, docId: doc._id } });

    // 2. Supprimer les fichiers physiques (local + Google Drive)
    if (window.electron?.handleDocumentDeletion) {
      // Mode Electron : utiliser IPC (preload.js → main.js)
      try {
        const result = await window.electron.handleDocumentDeletion(doc);
        if (!result.success) {
          console.warn('[deleteDocument] IPC deletion warning:', result.error);
        }
      } catch (ipcErr) {
        console.warn('[deleteDocument] IPC deletion error:', ipcErr.message);
      }
    } else {
      // Mode navigateur : utiliser WebSocket
      const socket = initSocket();
      if (socket && socket.connected) {
        socket.emit('message', JSON.stringify({ type: 'delete-file', data: doc }));
      } else {
        console.warn('[deleteDocument] Socket non connecté, fichiers physiques non supprimés.');
      }
    }
    return true;
  } catch (error) {
    const errorMessage = error.response?.data?.error || error.message;
    console.error('[deleteDocument] Erreur API:', errorMessage);
    dispatch(showToast({ type: 'error', message: `La suppression a échoué : ${errorMessage}` }));
    throw error;
  }
};

export const duplicateDocumentInDossier = (dossierId, doc, token) => async (dispatch) => {
  try {
    const response = await apiClient.post('/api/fusion/duplicateDocument', { dossierId, docId: doc._id });
    const newDoc = response.data.doc;
    const dossierComplet = response.data.dossier;
    if (!newDoc?._id || !dossierComplet) throw new Error('Infos manquantes pour le nouveau document après duplication API.');

    dispatch({ type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: dossierComplet });

    // Dupliquer les fichiers physiques (local + Google Drive)
    if (window.electron?.handleDocumentDuplication) {
      // Mode Electron : utiliser IPC (preload.js → main.js)
      try {
        await window.electron.handleDocumentDuplication({ oldDoc: doc, newDoc });
      } catch (ipcErr) {
        console.warn('[duplicateDocument] IPC duplication error:', ipcErr.message);
      }
    } else {
      // Mode navigateur : utiliser WebSocket
      const socket = initSocket();
      if (socket && socket.connected) {
        socket.emit('message', JSON.stringify({ type: 'duplicate-file', data: { oldDoc: doc, newDoc } }));
      }
    }
    return newDoc;
  } catch (error) {
    console.error('Erreur lors de la duplication du document (API):', error.response?.data || error.message);
    throw error;
  }
};

export const renameDocumentInDossier = (dossierId, doc, newName, newRecipient, token) => async (dispatch) => {
  try {
    const oldNomDocument = doc.nomDocument;
    const response = await apiClient.post('/api/fusion/renameDocument', { dossierId, docId: doc._id, newName, newRecipient });
    const renamedDoc = response.data?.doc;
    const newNomDocument = renamedDoc?.nomDocument || newName;

    // 1. Mettre a jour le state Redux immediatement avec le nouveau nom
    dispatch({
      type: RENAME_DOCUMENT_SUCCESS,
      payload: { docId: doc._id, newNomDocument },
    });

    // 2. Renommer le fichier local via IPC Electron (si disponible)
    if (window.electron?.handleDocumentRename) {
      try {
        const result = await window.electron.handleDocumentRename({
          docId: doc._id,
          oldFileName: oldNomDocument,
          newFileName: newNomDocument,
        });
        if (!result.success) {
          console.warn('[renameDocumentInDossier] Renommage local echoue:', result.error);
        }
      } catch (ipcErr) {
        console.warn('[renameDocumentInDossier] Erreur IPC renommage local:', ipcErr);
      }
    }

    const socket = initSocket();
    socket.emit('message', JSON.stringify({ type: 'rename-file', data: { docId: doc._id, oldName: oldNomDocument, newName } }));
    return true;
  } catch (err) {
    console.error('renameDocumentInDossier:', err.response?.data || err);
    throw err;
  }
};

export const updateSelectedEntityInDossier = (entityId, entityType, updatedData, token, dossierId) => async (dispatch) => {
  dispatch({ type: 'UPDATE_ENTITY_IN_DOSSIER_REQUEST' });
  try {
    const config = { headers: { 'Content-Type': 'application/json' } };
    const body = { entityType, data: updatedData, dossierId };
    const res = await apiClient.put(`/api/folder/updateEntityInDossier/${entityId}`, body, config);
    const { updatedEntity, updatedDossier } = res.data;
    dispatch({ type: 'UPDATE_ENTITY_IN_DOSSIER_SUCCESS', payload: { updatedEntity, dossierId } });
    if (updatedDossier) {
      dispatch({ type: UPDATE_CURRENT_DOSSIER_SUCCESS, payload: updatedDossier });
      dispatch({ type: MOVE_DOSSIER_TO_TOP, payload: updatedDossier });
    }
    dispatch({ type: 'SET_SELECTED_ENTITY', payload: updatedEntity });
    return updatedEntity;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message || "Erreur lors de la mise à jour de l\'entité.";
    dispatch({ type: 'UPDATE_ENTITY_IN_DOSSIER_FAIL', payload: errorMessage });
    throw error;
  }
};

export const clearSelectedEntityInDossier = () => (dispatch) => {
  dispatch({ type: 'CLEAR_SELECTED_ENTITY_IN_DOSSIER' });
};

export const addLinkedContactToParty = (dossierId, partyId, linkedContactData, token) => async (dispatch) => {
  try {
    const config = { headers: { 'Content-Type': 'application/json' } };
    const response = await apiClient.post('/api/folder/addLinkedContactToParty', { dossierId, partyId, linkedContactData }, config);
    dispatch(fetchCurrentDossier(dossierId, token));
    return response.data;
  } catch (error) {
    console.error("Erreur lors de l\'ajout du contact lié:", error.response?.data || error.message);
    throw error;
  }
};

export const removeLinkedContactFromParty = (dossierId, partyId, contactId, isAvocat) => async (dispatch) => {
  try {
    const config = { headers: { 'Content-Type': 'application/json' } };
    const response = await apiClient.post('/api/folder/removeLinkedContactFromParty', { dossierId, partyId, contactId, isAvocat }, config);
    dispatch(fetchCurrentDossier(dossierId));
    return response.data;
  } catch (error) {
    console.error("Erreur lors de la suppression du contact lié:", error.response?.data || error.message);
    throw error;
  }
};

export const refreshCurrentAndLastDossier = (dossierId, token, userId) => async (dispatch) => {
  await dispatch(fetchCurrentDossier(dossierId, token));
};

export const addDroppedDocumentToList = (docMetadata) => ({
  type: 'ADD_DROPPED_DOCUMENT_SUCCESS',
  payload: docMetadata,
});

export const deleteDossier = (dossierId) => async (dispatch) => {
  try {
    const res = await apiClient.delete(`/api/folder/dossier/${dossierId}`);
    const { deletedDossierId, deletedEventIds } = res.data;

    dispatch({
      type: DELETE_DOSSIER_SUCCESS,
      payload: { dossierId: deletedDossierId, deletedEventIds: deletedEventIds || [] },
    });

    return res.data;
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    console.error('[deleteDossier] Erreur:', errorMessage);
    dispatch(showToast({ type: 'error', message: `La suppression du dossier a échoué : ${errorMessage}` }));
    throw error;
  }
};

export const updateDossier = (dossierId, dossierPayload, token, saveSnapshot = false) => async (dispatch) => {
  dispatch({ type: 'UPDATE_DOSSIER_REQUEST' });
  try {
    const res = await apiClient.put(`/api/folder/dossier/${dossierId}`, { ...dossierPayload, saveSnapshot }, { headers: { 'Content-Type': 'application/json' } });
    if (res.data) dispatch({ type: MOVE_DOSSIER_TO_TOP, payload: res.data });
    dispatch({ type: 'UPDATE_DOSSIER_SUCCESS', payload: res.data });
    dispatch({ type: 'SET_CURRENT_DOSSIER', payload: res.data });
    return Promise.resolve(res.data);
  } catch (err) {
    const message = err.response?.data?.message || err.response?.data?.error || err.message;
    dispatch({ type: 'UPDATE_DOSSIER_FAIL', payload: message });
    return Promise.reject(message);
  }
};

export const updatePartie = (dossierId, partieId, data, token) => updateSelectedEntityInDossier(partieId, 'Partie', data, token, dossierId);

export const addPaymentToInvoice = (dossierId, invoiceId, amount, token) => async (dispatch) => {
  dispatch({ type: ADD_PAYMENT_REQUEST });
  try {
    const res = await apiClient.post(`/api/folder/dossier/${dossierId}/invoice/${invoiceId}/payment`, { amount });
    const updatedDossier = res.data;
    dispatch({ type: ADD_PAYMENT_SUCCESS, payload: updatedDossier });
    dispatch({ type: 'UPDATE_CURRENT_DOSSIER_SUCCESS', payload: updatedDossier });
  } catch (error) {
    dispatch({ type: ADD_PAYMENT_FAIL, payload: error.response?.data?.message || error.message });
  }
};

export const archiveInvoice = (dossierId, invoiceId, token) => async (dispatch) => {
  dispatch({ type: ARCHIVE_INVOICE_REQUEST });
  try {
    const res = await apiClient.put(`/api/folder/dossier/${dossierId}/invoice/${invoiceId}/archive`, {});
    dispatch({ type: ARCHIVE_INVOICE_SUCCESS, payload: res.data });
    dispatch({ type: 'UPDATE_CURRENT_DOSSIER', payload: res.data });
  } catch (error) {
    dispatch({ type: ARCHIVE_INVOICE_FAIL, payload: error.response?.data?.message || error.message });
  }
};

export const fetchArchivedInvoiceDetails = (invoiceId) => async (dispatch, getState) => {
  dispatch({ type: FETCH_ARCHIVED_INVOICE_DETAILS_REQUEST });
  try {
    const res = await apiClient.get(`/api/folder/invoice-details/${invoiceId}`);
    dispatch({ type: FETCH_ARCHIVED_INVOICE_DETAILS_SUCCESS, payload: res.data });
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message;
    dispatch({ type: FETCH_ARCHIVED_INVOICE_DETAILS_FAIL, payload: errorMessage });
  }
};

export const createSubfolder = (dossierId, name, token) => async (dispatch) => {
  dispatch({ type: SUBFOLDER_ACTION_REQUEST });
  try {
    const res = await apiClient.post(`/api/folder/dossier/${dossierId}/subfolder`, { name });
    dispatch({ type: SUBFOLDER_ACTION_SUCCESS, payload: res.data });
  } catch (err) {
    dispatch({ type: SUBFOLDER_ACTION_FAIL, payload: err.response?.data?.message || err.message });
  }
};

export const updateSubfolder = (dossierId, subfolderId, updates, token) => async (dispatch) => {
  dispatch({ type: SUBFOLDER_ACTION_REQUEST });
  try {
    const res = await apiClient.put(`/api/folder/dossier/${dossierId}/subfolder/${subfolderId}`, updates);
    dispatch({ type: SUBFOLDER_ACTION_SUCCESS, payload: res.data });
  } catch (err) {
    dispatch({ type: SUBFOLDER_ACTION_FAIL, payload: err.response?.data?.message || err.message });
  }
};

export const deleteSubfolder = (dossierId, subfolderId, token) => async (dispatch) => {
  dispatch({ type: SUBFOLDER_ACTION_REQUEST });
  try {
    const res = await apiClient.delete(`/api/folder/dossier/${dossierId}/subfolder/${subfolderId}`);
    const socket = initSocket();
    if (socket && socket.connected) {
      const subfolderToDelete = res.data.deletedSubfolder;
      if (subfolderToDelete) {
        socket.emit('message', JSON.stringify({
          type: 'delete-item',
          data: { item: subfolderToDelete, type: 'subfolder', dossierId: dossierId }
        }));
      }
    }
    dispatch({ type: SUBFOLDER_ACTION_SUCCESS, payload: res.data.updatedDossier });
  } catch (err) {
    dispatch({ type: SUBFOLDER_ACTION_FAIL, payload: err.response?.data?.message || err.message });
  }
};

export const moveDocumentToSubfolder = (dossierId, docId, subfolderId, token) => async (dispatch, getState) => {
  const originalDoc = getState().currentDossier.dossier?.dossier?.documents.find(d => d._id === docId);
  if (!originalDoc) {
    console.error('Document à déplacer non trouvé dans l\'état Redux.');
    return;
  }
  const originalSubfolderId = originalDoc.subfolderId;
  dispatch({ type: MOVE_DOCUMENT_OPTIMISTIC, payload: { docId, subfolderId } });
  try {
    const res = await apiClient.put(`/api/folder/dossier/${dossierId}/document/${docId}/movetosubfolder`, { subfolderId });
    dispatch({ type: SUBFOLDER_ACTION_SUCCESS, payload: res.data });
  } catch (err) {
    console.error('Échec du déplacement du document côté serveur. Annulation.', err.response?.data?.message || err.message);
    dispatch({ type: MOVE_DOCUMENT_REVERT, payload: { docId, subfolderId: originalSubfolderId } });
    dispatch({ type: SUBFOLDER_ACTION_FAIL, payload: 'Le déplacement du document a échoué.' });
  }
};

export default wrappedReducer;
