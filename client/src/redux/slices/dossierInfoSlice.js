// client/src/redux/slices/dossierInfoSlice.js
// Migration RTK — DossierInfoReducer (425 lignes → createSlice avec wrapper localStorage)

import { createSlice } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { initSocket } from '../../services/socketService';
import { showToast } from './notificationsSlice';

// ========================================================================
// Helpers
// ========================================================================

/**
 * Fusionne les propriétés de mainUser (email, address, city, postalCode)
 * dans chaque responsable marqué isAvocat.
 */
const mergeMainUserProperties = (responsables, mainUser) => {
  if (!mainUser || !responsables) return responsables;

  return responsables.map((responsable) => {
    if (responsable.isAvocat) {
      return {
        ...responsable,
        email: mainUser.email,
        address: mainUser.address,
        city: mainUser.city,
        postalCode: mainUser.postalCode,
      };
    }
    return responsable;
  });
};

// ========================================================================
// Initial state (hydratation depuis localStorage)
// ========================================================================

const initialDossierData = {
  nom_dossier: '',
  type_dossier: '',
  description_dossier: '',
  date_Creation_Dossier: '',
  responsables: [],
  selectedTribunalAffaire: null,
};

const defaultInitialState = {
  dossierData: initialDossierData,
  mainUser: null,
  errors: {},
  searchContactsDossier: {
    loading: false,
    contacts: [],
    error: null,
  },
  selectedContacts: [],
  originalResponsablesInEdit: [],
  addedResponsablesInEdit: [],
  removedOriginalResponsableIdsInEdit: [],
  pendingEmailAction: null,
};

const dossierInfoStateFromStorage = localStorage.getItem('dossierInfoState');

const parsedState =
  dossierInfoStateFromStorage && dossierInfoStateFromStorage !== 'undefined'
    ? JSON.parse(dossierInfoStateFromStorage)
    : {};

const initialState = {
  ...defaultInitialState,
  dossierData: {
    ...defaultInitialState.dossierData,
    ...parsedState.dossierData,
  },
  mainUser: parsedState.mainUser || defaultInitialState.mainUser,
  errors: parsedState.errors || defaultInitialState.errors,
  searchContactsDossier:
    parsedState.searchContactsDossier || defaultInitialState.searchContactsDossier,
  selectedContacts:
    parsedState.selectedContacts || defaultInitialState.selectedContacts,
};

// ========================================================================
// Slice
// ========================================================================

const dossierInfoSlice = createSlice({
  name: 'dossierInfos',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    // === Workflow email ===
    builder.addCase('SET_PENDING_EMAIL_ACTION_FOR_DOSSIER_CREATION', (state, action) => {
      state.pendingEmailAction = action.payload;
    });

    builder.addCase('CLEAR_PENDING_EMAIL_ACTION', (state) => {
      state.pendingEmailAction = null;
    });

    // === Champs dossierData simples ===
    builder.addCase('SET_NOM_DOSSIER', (state, action) => {
      state.dossierData.nom_dossier = action.payload;
    });

    builder.addCase('SET_TYPE_DOSSIER', (state, action) => {
      state.dossierData.type_dossier = action.payload;
    });

    builder.addCase('SET_NOM_DOSSIER_FOR_EDIT', (state, action) => {
      state.dossierData.nom_dossier = action.payload;
    });

    builder.addCase('SET_DESCRIPTION_DOSSIER', (state, action) => {
      state.dossierData.description_dossier = action.payload;
    });

    builder.addCase('SET_DATE_CREATION_DOSSIER', (state, action) => {
      state.dossierData.date_Creation_Dossier = action.payload;
    });

    // === Responsables & mainUser (avec merge) ===
    builder.addCase('SET_RESPONSABLES', (state, action) => {
      const updatedResponsables = mergeMainUserProperties(action.payload, state.mainUser);
      state.dossierData.responsables = updatedResponsables;
    });

    builder.addCase('SET_MAIN_USER', (state, action) => {
      state.mainUser = action.payload;
      state.dossierData.responsables = mergeMainUserProperties(
        state.dossierData.responsables,
        action.payload,
      );
    });

    // === Errors ===
    builder.addCase('SET_ERRORS', (state, action) => {
      state.errors = action.payload;
    });

    // === Resets ===
    builder.addCase('RESET_DOSSIER', (state) => {
      localStorage.removeItem('dossierInfoState');
      const kept = { mainUser: state.mainUser, pendingEmailAction: state.pendingEmailAction };
      Object.assign(state, defaultInitialState, kept);
    });

    builder.addCase('RESET_ALL', (state) => {
      localStorage.removeItem('dossierInfoState');
      const kept = { mainUser: state.mainUser, pendingEmailAction: state.pendingEmailAction };
      Object.assign(state, defaultInitialState, kept);
    });

    // === Initialisation pour édition ===
    builder.addCase('INITIALIZE_DOSSIER_INFOS_FOR_EDIT', (state, action) => {
      const preset = action.payload;
      const mainUserData = state.mainUser;

      const dossierNiveau1 = preset?.dossier || {};
      const dossierNiveau2 = dossierNiveau1?.dossier || {};

      const nomDossier =
        dossierNiveau2.nom_dossier ||
        dossierNiveau2.nom ||
        dossierNiveau1.nom_dossier ||
        dossierNiveau1.nom ||
        preset.nom_dossier ||
        preset.nom ||
        '';
      const descriptionDossier =
        dossierNiveau2.description_dossier ||
        dossierNiveau1.description_dossier ||
        preset.description_dossier ||
        '';
      const selectedTribunal =
        dossierNiveau2.selectedTribunalAffaire ||
        dossierNiveau1.selectedTribunalAffaire ||
        preset.selectedTribunalAffaire ||
        null;
      const dateCreation =
        dossierNiveau2.date_Creation_Dossier ||
        dossierNiveau1.date_Creation_Dossier ||
        preset.dateCreation ||
        preset.date_Creation_Dossier ||
        '';

      const responsablesSource = dossierNiveau2.responsables || [];
      const mergedResponsables = mergeMainUserProperties(responsablesSource, mainUserData);

      const contactsLiesSource =
        dossierNiveau2.contactsDuDossier ||
        dossierNiveau1.contactsDuDossier ||
        preset.contactsDuDossier ||
        [];

      state.dossierData = {
        ...initialDossierData,
        nom_dossier: nomDossier,
        description_dossier: descriptionDossier,
        responsables: [...mergedResponsables],
        selectedTribunalAffaire: selectedTribunal,
        date_Creation_Dossier: dateCreation,
      };
      state.selectedContacts = [...contactsLiesSource];
      state.originalResponsablesInEdit = [...mergedResponsables];
      state.addedResponsablesInEdit = [];
      state.removedOriginalResponsableIdsInEdit = [];
      state.errors = {};
    });

    builder.addCase('INITIALIZE_RESPONSABLES_FOR_EDIT', (state, action) => {
      const initialResponsables = mergeMainUserProperties(action.payload, state.mainUser);
      state.originalResponsablesInEdit = initialResponsables;
      state.addedResponsablesInEdit = [];
      state.removedOriginalResponsableIdsInEdit = [];
      state.dossierData.responsables = [...initialResponsables];
    });

    // === Gestion des responsables en session d'édition ===
    builder.addCase('ADD_RESPONSIBLE_TO_EDIT_SESSION', (state, action) => {
      const responsibleToAdd = mergeMainUserProperties([action.payload], state.mainUser)[0];
      const newAddedResponsables = [...state.addedResponsablesInEdit];
      let newRemovedIds = [...state.removedOriginalResponsableIdsInEdit];

      if (newRemovedIds.includes(responsibleToAdd._id)) {
        newRemovedIds = newRemovedIds.filter((id) => id !== responsibleToAdd._id);
      } else if (
        !state.originalResponsablesInEdit.find((r) => r._id === responsibleToAdd._id) &&
        !newAddedResponsables.find((r) => r._id === responsibleToAdd._id)
      ) {
        newAddedResponsables.push(responsibleToAdd);
      }

      const finalResponsables = [
        ...state.originalResponsablesInEdit.filter((r) => !newRemovedIds.includes(r._id)),
        ...newAddedResponsables,
      ];

      state.addedResponsablesInEdit = newAddedResponsables;
      state.removedOriginalResponsableIdsInEdit = newRemovedIds;
      state.dossierData.responsables = finalResponsables;
    });

    builder.addCase('REMOVE_RESPONSIBLE_FROM_EDIT_SESSION', (state, action) => {
      const responsibleIdToRemove = action.payload;
      let currentAddedResponsables = [...state.addedResponsablesInEdit];
      const currentRemovedIds = [...state.removedOriginalResponsableIdsInEdit];

      const wasInAdded = currentAddedResponsables.find((r) => r._id === responsibleIdToRemove);
      if (wasInAdded) {
        currentAddedResponsables = currentAddedResponsables.filter(
          (r) => r._id !== responsibleIdToRemove,
        );
      } else {
        const isInOriginal = state.originalResponsablesInEdit.find(
          (r) => r._id === responsibleIdToRemove,
        );
        if (isInOriginal && !currentRemovedIds.includes(responsibleIdToRemove)) {
          currentRemovedIds.push(responsibleIdToRemove);
        }
      }

      const finalResponsables = [
        ...state.originalResponsablesInEdit.filter((r) => !currentRemovedIds.includes(r._id)),
        ...currentAddedResponsables,
      ];

      state.addedResponsablesInEdit = currentAddedResponsables;
      state.removedOriginalResponsableIdsInEdit = currentRemovedIds;
      state.dossierData.responsables = finalResponsables;
    });

    // === Recherche de contacts ===
    builder.addCase('SEARCH_CONTACTS_DOSSIER_REQUEST', (state) => {
      state.searchContactsDossier = { loading: true, contacts: [], error: null };
    });

    builder.addCase('SEARCH_CONTACTS_DOSSIER_SUCCESS', (state, action) => {
      state.searchContactsDossier = { loading: false, contacts: action.payload, error: null };
    });

    builder.addCase('SEARCH_CONTACTS_DOSSIER_FAIL', (state, action) => {
      state.searchContactsDossier = { loading: false, contacts: [], error: action.payload };
    });

    // === Contacts sélectionnés ===
    builder.addCase('ADD_SELECTED_CONTACT', (state, action) => {
      if (!action.payload || !action.payload._id) {
        return;
      }
      const contactExiste = state.selectedContacts.find(
        (contact) => contact && contact._id === action.payload._id,
      );
      if (!contactExiste) {
        state.selectedContacts.push(action.payload);
      }
    });

    builder.addCase('DELETE_SELECTED_CONTACT', (state, action) => {
      state.selectedContacts = state.selectedContacts.filter((c) => c._id !== action.payload);
    });

    builder.addCase('UPDATE_SELECTED_CONTACT', (state, action) => {
      state.selectedContacts = state.selectedContacts.map((c) =>
        c._id === action.payload._id ? action.payload : c,
      );
    });

    // === Tribunal & contacts preset ===
    builder.addCase('SET_SELECTED_TRIBUNAL_AFFAIRE', (state, action) => {
      state.dossierData.selectedTribunalAffaire = action.payload;
    });

    builder.addCase('SET_SELECTED_CONTACTS_FROM_PRESET', (state, action) => {
      state.selectedContacts = Array.isArray(action.payload) ? action.payload : [];
    });

    // CORRECTIF : Nettoyer le state dossierInfo lors du logout/auth_error
    // pour éviter que les données de création de dossier du compte A persistent.
    builder.addCase('LOGOUT', (state) => {
      localStorage.removeItem('dossierInfoState');
      Object.assign(state, defaultInitialState);
    });
    builder.addCase('AUTH_ERROR', (state) => {
      localStorage.removeItem('dossierInfoState');
      Object.assign(state, defaultInitialState);
    });
  },
});

// ========================================================================
// Wrapper : persist to localStorage after EVERY dispatch + default merge
// ========================================================================

/**
 * Le reducer original avait deux comportements spéciaux :
 *  1. Le cas `default` recalculait les responsables via mergeMainUserProperties
 *  2. Après chaque action, l'état était sauvegardé dans localStorage
 *
 * On reproduit ces deux comportements dans un wrapper autour du reducer RTK.
 */
const dossierInfoReducerWithPersist = (state, action) => {
  // Laisser le slice RTK traiter l'action
  const nextState = dossierInfoSlice.reducer(state, action);

  // Reproduire le comportement du cas default de l'ancien switch :
  // Si l'action n'est pas gérée par le slice (état identique par référence
  // ET ce n'est pas un des cas où on retourne volontairement le même état),
  // on recalcule les responsables avec les propriétés mainUser fusionnées.
  // Note: avec Immer, si aucune mutation n'a eu lieu, nextState === state.
  if (nextState === state) {
    const responsablesWithMergedProperties = mergeMainUserProperties(
      nextState.dossierData.responsables,
      nextState.mainUser,
    );
    const stateWithMerge = {
      ...nextState,
      dossierData: {
        ...nextState.dossierData,
        responsables: responsablesWithMergedProperties,
      },
    };
    localStorage.setItem('dossierInfoState', JSON.stringify(stateWithMerge));
    return stateWithMerge;
  }

  // Persister l'état dans localStorage après chaque dispatch
  localStorage.setItem('dossierInfoState', JSON.stringify(nextState));
  return nextState;
};


// ========================================================================
// Action creators migres depuis dossierActions.js — Phase 9D
// ========================================================================

// Détecte si un brouillon de création de dossier est en cours (pour proposer
// "Reprendre" sur la home plutôt qu'un nouveau formulaire vide).
// Critères : nom du dossier non trivial, type sélectionné, description, ou
// au moins une partie saisie. Le mode édition (presetDossier) n'est pas
// concerné — il n'y a pas de "draft persistant" en édition.
export const hasMeaningfulDossierDraft = (dossierInfosState, partieDataState) => {
  const data = dossierInfosState?.dossierData;
  if (!data) return false;
  const hasName = !!(data.nom_dossier && data.nom_dossier.trim() && data.nom_dossier !== 'Dossier sans nom');
  const hasType = !!(data.type_dossier && data.type_dossier.trim());
  const hasDesc = !!(data.description_dossier && data.description_dossier.trim());
  const hasParties = Array.isArray(partieDataState?.parties) && partieDataState.parties.length > 0;
  return hasName || hasType || hasDesc || hasParties;
};

// Construit la liste des responsables par défaut d'un nouveau dossier :
// l'utilisateur courant s'il est avocat, sinon l'avocat principal (mainOfficeUser)
// d'abord puis l'utilisateur courant. Logique partagée entre la modale header
// "Créer un nouveau..." et la carte "Nouveau dossier" du Bureau.
export const buildDefaultResponsables = (currentOfficeUser, officeUsers) => {
  const mainOfficeUser = officeUsers
    ? officeUsers.find(user => user.mainOfficeUser === true)
    : null;
  const responsables = [];
  if (currentOfficeUser) {
    if (currentOfficeUser.isAvocat) {
      responsables.push(currentOfficeUser);
    } else {
      if (mainOfficeUser) {
        responsables.push(mainOfficeUser);
      }
      responsables.push(currentOfficeUser);
    }
  }
  return responsables;
};

export const setNomDossier = (nom) => ({ type: 'SET_NOM_DOSSIER', payload: nom });
export const setTypeDossier = (type) => ({ type: 'SET_TYPE_DOSSIER', payload: type });
export const setDescriptionDossier = (description) => ({ type: 'SET_DESCRIPTION_DOSSIER', payload: description });
export const setDateCreationDossier = (date) => ({ type: 'SET_DATE_CREATION_DOSSIER', payload: date });
export const setResponsables = (responsables) => ({ type: 'SET_RESPONSABLES', payload: responsables });
export const setErrors = (errors) => ({ type: 'SET_ERRORS', payload: errors });
export const setNomDossierForEdit = (nom) => ({ type: 'SET_NOM_DOSSIER_FOR_EDIT', payload: nom });
export const resetDossier = () => ({ type: 'RESET_DOSSIER' });
export const addSelectedContact = (contact) => ({ type: 'ADD_SELECTED_CONTACT', payload: contact });
export const initializeResponsablesForEdit = (responsables) => ({ type: 'INITIALIZE_RESPONSABLES_FOR_EDIT', payload: responsables });
export const addResponsibleToEditSession = (responsible) => ({ type: 'ADD_RESPONSIBLE_TO_EDIT_SESSION', payload: responsible });
export const removeResponsibleFromEditSession = (responsibleId) => ({ type: 'REMOVE_RESPONSIBLE_FROM_EDIT_SESSION', payload: responsibleId });
export const deleteSelectedContact = (contactId) => ({ type: 'DELETE_SELECTED_CONTACT', payload: contactId });
export const updateSelectedContact = (contact) => ({ type: 'UPDATE_SELECTED_CONTACT', payload: contact });
export const setSelectedTribunalAffaire = (obj) => ({ type: 'SET_SELECTED_TRIBUNAL_AFFAIRE', payload: obj });
export const setSelectedContactsFromPreset = (contacts) => ({ type: 'SET_SELECTED_CONTACTS_FROM_PRESET', payload: contacts });
export const initializeDossierInfosForEdit = (dossierPreset) => ({ type: 'INITIALIZE_DOSSIER_INFOS_FOR_EDIT', payload: dossierPreset });
export const setPendingEmailActionForDossierCreation = (payload) => ({
  type: 'SET_PENDING_EMAIL_ACTION_FOR_DOSSIER_CREATION',
  payload,
});

// ========================================================================
// Thunks migres depuis dossierActions.js — Phase 9D
// ========================================================================

export const createDossierServer = (dossierObj, options = {}) => async (dispatch, getState) => {
  try {
    const userId = dossierObj?.user?._id || options.userId;
    console.log('[createDossierServer] ▶ DEBUT | userId:', userId);
    if (!userId) throw new Error("Aucun ID d'utilisateur fourni");

    const { navigate } = options;
    console.log('[createDossierServer] navigate disponible:', typeof navigate === 'function');

    // NE PAS envoyer options (contient navigate = fonction non sérialisable)
    const payload = { dossierData: dossierObj, userId };
    const res = await apiClient.post('/api/folder/createDossier', payload);
    const newDossier = res.data.dossier;

    console.log('[createDossierServer] ✅ Réponse API:', {
      status: res.status,
      hasNewDossier: !!newDossier,
      newDossierId: newDossier?._id,
      newDossierNom: newDossier?.dossier?.dossier?.nom,
    });

    dispatch({ type: 'CREATE_DOSSIER_SUCCESS', payload: res.data });
    if (newDossier) {
      dispatch({ type: 'MOVE_DOSSIER_TO_TOP', payload: newDossier });
      console.log('[createDossierServer] MOVE_DOSSIER_TO_TOP dispatched');
      // Synchroniser la liste des dossiers avec le serveur (awaitée pour éviter race condition)
      try {
        await dispatch(fetchLast25Dossiers());
        console.log('[createDossierServer] ✅ fetchLast25Dossiers terminé');
      } catch (fetchErr) {
        console.warn('[createDossierServer] ⚠️ fetchLast25Dossiers erreur (non bloquante):', fetchErr);
      }
    }

    const { pendingEmailAction } = getState().dossierInfos;
    const token = getState().login.token;

    if (pendingEmailAction && newDossier && newDossier._id && token) {
      console.log('[createDossierServer] Contexte d\'email détecté. Envoi vers le nouveau dossier.');
      const socket = initSocket();
      if (socket && socket.connected) {
        const emailToDossierPayload = {
          type: 'send_email_to_dossier',
          data: {
            token: token,
            emailId: pendingEmailAction.emailId,
            dossierId: newDossier._id,
            sendEmailText: true,
            sendAttachment: true,
            attachmentsToProcess: []
          }
        };
        socket.emit('message', JSON.stringify(emailToDossierPayload));
        console.log('[createDossierServer] Message WebSocket \'send_email_to_dossier\' émis.');
      } else {
        console.error('[createDossierServer] ❌ Socket non connecté. Email non transféré.');
        dispatch(showToast({ type: 'error', message: 'Erreur: La connexion avec l\'application de bureau est inactive. L\'email n\'a pas pu être transféré.' }));
      }
      dispatch({ type: 'CLEAR_PENDING_EMAIL_ACTION' });
    }

    dispatch({ type: 'RESET_ALL' });
    dispatch({ type: 'RESET_PARTIES' });
    console.log('[createDossierServer] RESET_ALL + RESET_PARTIES dispatched');

    if (navigate && newDossier) {
      console.log('[createDossierServer] ▶ Redirection vers dossier ID:', newDossier._id);
      // Import dynamique pour éviter la dépendance circulaire
      const { setCurrentDossier } = require('./currentDossierSlice');
      dispatch(setCurrentDossier(newDossier));
      navigate('/dashboard/dossier');
      console.log('[createDossierServer] ✅ Navigation exécutée vers /dashboard/dossier');
    } else {
      console.warn('[createDossierServer] ⚠️ Pas de redirection — navigate:', typeof navigate, '| newDossier:', !!newDossier);
      if (navigate) navigate('/dashboard/');
    }

    console.log('[createDossierServer] ✅ FIN du thunk — succès complet');
    return Promise.resolve();
  } catch (err) {
    const errorMessage = err.response?.data?.msg || err.message;
    console.error('[createDossierServer] ❌ ERREUR:', errorMessage);
    console.error('[createDossierServer] ❌ err.response?.data:', err.response?.data);
    console.error('[createDossierServer] ❌ err.stack:', err.stack);
    dispatch({ type: 'CREATE_DOSSIER_ERROR', payload: errorMessage });
    return Promise.reject(errorMessage);
  }
};

// Nombre de dossiers affichés sur la page d'accueil : valeurs proposées par le
// sélecteur de la colonne « Dossiers récents » + clé localStorage de la
// préférence. Partagés avec officeHome/index.js.
export const HOME_DOSSIERS_LIMITS = [25, 50, 100, 200, 500];
export const HOME_DOSSIERS_LIMIT_KEY = 'kheopsHomeDossiersLimit';

/** Préférence mémorisée du nombre de dossiers affichés (25 par défaut). */
export const getHomeDossiersLimit = () => {
  try {
    const v = parseInt(localStorage.getItem(HOME_DOSSIERS_LIMIT_KEY), 10);
    return HOME_DOSSIERS_LIMITS.includes(v) ? v : 25;
  } catch (_) {
    return 25;
  }
};

export const fetchLast25Dossiers = (limit) => async (dispatch, getState) => {
  dispatch({ type: 'FETCH_LAST_25_DOSSIERS_REQUEST' });
  try {
    const { token } = getState().login;
    if (!token) {
      // Token transitoirement absent (App.js peut ne pas avoir encore injecté
      // le token bypass dev ou réhydraté localStorage). NE PAS throw : sinon
      // unhandled promise rejection → overlay rouge CRA dev qui bloque l'UI
      // par-dessus les modales (notamment EncryptionUnlockModal).
      // On dispatche l'erreur dans le state Redux (pour que l'UI sache) et
      // on résout proprement — le composant qui fetch retentera au prochain
      // changement de login.token.
      dispatch({ type: 'FETCH_LAST_25_DOSSIERS_ERROR', payload: 'Utilisateur non authentifié' });
      return Promise.resolve();
    }
    // Limite explicite (sélecteur de la home) ou préférence mémorisée : ainsi
    // TOUS les rafraîchissements (après création de dossier, édition, etc.)
    // respectent le choix de l'utilisateur. Sans préférence → appel historique
    // sans paramètre (le serveur applique 25).
    const effectiveLimit = HOME_DOSSIERS_LIMITS.includes(limit) ? limit : getHomeDossiersLimit();
    const res = effectiveLimit && effectiveLimit !== 25
      ? await apiClient.get('/api/folder/last-25-dossiers', { params: { limit: effectiveLimit } })
      : await apiClient.get('/api/folder/last-25-dossiers');
    dispatch({ type: 'FETCH_LAST_25_DOSSIERS_SUCCESS', payload: res.data });
    return Promise.resolve();
  } catch (err) {
    const errorMessage = err.response?.data?.message || err.message;
    console.error('Erreur lors de la récupération des derniers dossiers :', errorMessage);
    dispatch({ type: 'FETCH_LAST_25_DOSSIERS_ERROR', payload: errorMessage });
    // Idem : ne PAS rejeter (sinon unhandled rejection bloque l'UI dev).
    return Promise.resolve();
  }
};

export default dossierInfoReducerWithPersist;
