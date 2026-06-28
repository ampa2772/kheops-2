// contactPMPubliqueSlice.js — migré depuis dossierReducers/PM/CreateContactPMP.js
// localStorage.removeItem seulement sur RESET
import { createSlice } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { fetchCurrentDossier, addLinkedContactToParty } from './currentDossierSlice';
import {
  setPartie as setPartieCreate,
  setPartieLink as setPartieLinkCreate,
  setPartiesLinkAllPour as setPartiesLinkAllPourCreate,
  setPartiesLinkAllContre as setPartiesLinkAllContreCreate,
} from './partieSlice';
import {
  setPartie as setPartieEdit,
  setPartieLink as setPartieLinkEdit,
  setPartiesLinkAllPour as setPartiesLinkAllPourEdit,
  setPartiesLinkAllContre as setPartiesLinkAllContreEdit,
} from './partieEditSlice';

// --- Fonctions utilitaires ---
import { countErrors } from '../utils/validationHelpers';

const isValidEmail = (email) => true; // Désactivation complète
const isValidField = (value) => true; // Désactivation complète

const initializeErrors = (personneMorale) => {
  const errors = {};
  Object.keys(personneMorale).forEach(field => {
    if (!['genre', 'appellationCourrier'].includes(field)) {
      if (field === 'email' || field === 'contactEmail') {
        errors[field] = !isValidEmail(personneMorale[field]);
      } else {
        errors[field] = !isValidField(personneMorale[field]);
      }
    }
  });
  return errors;
};

// --- État initial ---
const initialStatePublique = {
  personneMorale: {
    denomination: '',
    adresse: '',
    ville: '',
    codePostal: '',
    siteWeb: '',
    email: '',
    contactNom: '',
    contactPrenom: '',
    genre: 'Masculin',
    appellationCourrier: '',
    contactTelephone: '',
    contactEmail: '',
    contactFonction: '',
  },
  validation: {
    submitAttempted: false,
    validateMail: true,
    validateContactMail: true,
    appellationCourrierAffichage: 'Masculin',
    errors: {},
    errorsCount: 0,
    emailExistsError: null,
    errorField: null,
  },
  appellationCourrierGenre: {
    appellationCourrierMasculin: '',
    appellationCourrierFeminin: '',
  },
};

// Initialisation des erreurs
initialStatePublique.validation.errors = initializeErrors(initialStatePublique.personneMorale);
initialStatePublique.validation.errorsCount = countErrors(initialStatePublique.validation.errors);

// --- Slice ---
const contactPMPubliqueSlice = createSlice({
  name: 'contactPMPubliqueReducer',
  initialState: initialStatePublique,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase('EMAIL_ALREADY_EXISTS_PMP', (state, action) => {
        // Désactivé : pas de blocage pour email dupliqué
      })

      .addCase('RESET_CONTACT_PM_PUBLIQUE_PMP', (state) => {
        localStorage.removeItem('personneMoralePubliqueData');

        // Réinitialisation champ par champ
        Object.keys(state.personneMorale).forEach((key) => {
          state.personneMorale[key] = key === 'genre' ? 'Masculin' : '';
        });

        // Reset validation & appellationCourrierGenre
        state.validation.submitAttempted = initialStatePublique.validation.submitAttempted;
        state.validation.validateMail = initialStatePublique.validation.validateMail;
        state.validation.validateContactMail = initialStatePublique.validation.validateContactMail;
        state.validation.appellationCourrierAffichage = initialStatePublique.validation.appellationCourrierAffichage;
        state.validation.emailExistsError = null;
        state.validation.errorField = null;

        state.appellationCourrierGenre.appellationCourrierMasculin = '';
        state.appellationCourrierGenre.appellationCourrierFeminin = '';

        // Recalcul erreurs
        state.validation.errors = initializeErrors(state.personneMorale);
        state.validation.errorsCount = countErrors(state.validation.errors);
      })

      .addCase('SET_PERSONNE_MORALE_PUB_FIELD', (state, action) => {
        const { field, value } = action.payload;

        // Mise à jour de la valeur du champ
        state.personneMorale[field] = value;

        // Gestion des validations spécifiques
        if (field === 'email' || field === 'contactEmail') {
          const emailValid = isValidEmail(value);
          if (field === 'email') {
            state.validation.validateMail = emailValid;
          } else {
            state.validation.validateContactMail = emailValid;
          }
          state.validation.errors[field] = !emailValid;
          state.validation.emailExistsError = null;
          state.validation.errorField = null;
        } else if (['appellationCourrierMasculin', 'appellationCourrierFeminin'].includes(field)) {
          state.appellationCourrierGenre[field] = value;
          const appellationKey = state.personneMorale.genre === 'Masculin' ? 'appellationCourrierMasculin' : 'appellationCourrierFeminin';
          state.personneMorale.appellationCourrier = state.appellationCourrierGenre[appellationKey];
          state.validation.errors['appellationCourrier'] = !isValidField(state.personneMorale.appellationCourrier);
        } else if (field === 'genre') {
          state.validation.appellationCourrierAffichage = value === 'Masculin' ? 'Masculin' : 'Feminin';
          const appellationKey = value === 'Masculin' ? 'appellationCourrierMasculin' : 'appellationCourrierFeminin';
          state.personneMorale.appellationCourrier = state.appellationCourrierGenre[appellationKey];
          state.validation.errors['appellationCourrier'] = !isValidField(state.personneMorale.appellationCourrier);
        } else if (field === 'submitAttempted') {
          state.validation.submitAttempted = value;
        } else {
          if (field in state.validation.errors) {
            state.validation.errors[field] = !isValidField(value);
          }
        }

        // Recalcul du compteur d'erreurs
        state.validation.errorsCount = countErrors(state.validation.errors);
      })

      .addCase('SET_PERSONNE_MORALE_PUBLIQUE_FOR_MODIFICATION', (state, action) => {
        const contactData = action.payload;

        // Mise à jour des données
        Object.assign(state.personneMorale, contactData);

        // Initialiser les erreurs à false pour tous les champs
        const updatedErrors = {};
        Object.keys(state.personneMorale).forEach(field => {
          if (!['genre', 'appellationCourrier'].includes(field)) {
            updatedErrors[field] = false;
          }
        });
        state.validation.errors = updatedErrors;
        state.validation.errorsCount = 0;
        state.validation.emailExistsError = null;
        state.validation.errorField = null;

        // Mise à jour de appellationCourrierGenre
        state.validation.appellationCourrierAffichage = state.personneMorale.genre === 'Masculin' ? 'Masculin' : 'Feminin';
        if (state.personneMorale.genre === 'Masculin') {
          state.appellationCourrierGenre.appellationCourrierMasculin = state.personneMorale.appellationCourrier;
        } else {
          state.appellationCourrierGenre.appellationCourrierFeminin = state.personneMorale.appellationCourrier;
        }
      })

      .addCase('RESET_FORM_PMP_PUBLIC', (state) => {
        localStorage.removeItem('personneMoralePubliqueData');

        Object.keys(state.personneMorale).forEach((key) => {
          state.personneMorale[key] = key === 'genre' ? 'Masculin' : '';
        });

        state.validation.submitAttempted = initialStatePublique.validation.submitAttempted;
        state.validation.validateMail = initialStatePublique.validation.validateMail;
        state.validation.validateContactMail = initialStatePublique.validation.validateContactMail;
        state.validation.appellationCourrierAffichage = initialStatePublique.validation.appellationCourrierAffichage;
        state.validation.emailExistsError = null;
        state.validation.errorField = null;

        state.appellationCourrierGenre.appellationCourrierMasculin = '';
        state.appellationCourrierGenre.appellationCourrierFeminin = '';

        state.validation.errors = initializeErrors(state.personneMorale);
        state.validation.errorsCount = countErrors(state.validation.errors);
      });
  },
});

export const contactPMPubliqueReducer = contactPMPubliqueSlice.reducer;

// ========================================================================
// Action creators migres depuis contactSharedActions.js
// ========================================================================

export const setPersonneMoralePubliqueField = (field, value) => ({ type: 'SET_PERSONNE_MORALE_PUB_FIELD', payload: { field, value } });
export const setPersonneMoralePubliqueForModification = (data) => ({ type: 'SET_PERSONNE_MORALE_PUBLIQUE_FOR_MODIFICATION', payload: data });
export const resetPersonneMoralePublique = () => ({ type: 'RESET_FORM_PMP_PUBLIC' });


// ========================================================================
// Thunks migres depuis contactPMPActions.js — Phase 9C-7
// ========================================================================

export const createContactPMPublique = (contactData, token) => async (dispatch, getState) => {
  try {
    const { fromCreatePartie, personneMorale: fullPersonneMoraleData, user } = contactData;
    const mode = fromCreatePartie?.mode || 'create';

    const currentSetPartie = mode === 'edit' ? setPartieEdit : setPartieCreate;
    const currentSetPartieLink = mode === 'edit' ? setPartieLinkEdit : setPartieLinkCreate;
    const currentSetPartiesLinkAllPour = mode === 'edit' ? setPartiesLinkAllPourEdit : setPartiesLinkAllPourCreate;
    const currentSetPartiesLinkAllContre = mode === 'edit' ? setPartiesLinkAllContreEdit : setPartiesLinkAllContreCreate;

    const personneMorale = fullPersonneMoraleData.personneMorale;
    const requestBody = { contactData: personneMorale, user };

    const res = await apiClient.post(
      '/api/folder/contactPMPublique',
      requestBody,
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
    dispatch({ type: 'CREATE_CONTACT_PM_PUBLIQUE_SUCCESS', payload: res.data });
    const newContactData = res.data;

    dispatch({ type: 'RESET_CONTACT_PM_PUBLIQUE_PMP' });

    if (fromCreatePartie) {
      if (fromCreatePartie.fromCreatePartieForPartie?.isTransformedToPartie) {
        const typePartie = fromCreatePartie.fromCreatePartieForPartie.typePartie;
        dispatch(currentSetPartie(typePartie, newContactData));
      } else if (fromCreatePartie.fromCreatePartiesForLink?.isLinkedToSinglePartie) {
        const targetPartyId = fromCreatePartie.fromCreatePartiesForLink.linkedPartieId;
        if (targetPartyId) {
          dispatch(currentSetPartieLink(targetPartyId, newContactData));
          if (mode === 'edit') {
            const currentDossierId = getState().currentDossier?.dossier?._id;
            if (currentDossierId) {
              dispatch(addLinkedContactToParty(currentDossierId, targetPartyId, { existingContactId: newContactData._id }));
            }
          }
        }
      } else if (fromCreatePartie.fromCreatePartiesForLink?.isLinkedToPartiesGroup) {
        const linkedGroupType = fromCreatePartie.fromCreatePartiesForLink.linkedGroupType;
        if (linkedGroupType === 'Pour') {
          dispatch(currentSetPartiesLinkAllPour({ contact: newContactData }));
        } else if (linkedGroupType === 'Contre') {
          dispatch(currentSetPartiesLinkAllContre({ contact: newContactData }));
        }
        if (mode === 'edit') {
          const currentDossierId = getState().currentDossier?.dossier?._id;
          const partieState = getState().partieEditData;
          if (currentDossierId && partieState?.parties) {
            const targetParties = partieState.parties.filter(p => p.typePartie === linkedGroupType);
            targetParties.forEach(p => {
              dispatch(addLinkedContactToParty(currentDossierId, p.idPartie, { existingContactId: newContactData._id }));
            });
          }
        }
      } else if (fromCreatePartie.fromCreatePartiesForLink?.isLinkedToDossier) {
        dispatch({ type: 'ADD_SELECTED_CONTACT', payload: newContactData });
        dispatch({ type: 'SET_MODIFYING_CONTACT_ID', payload: null });
      }
    }

    dispatch({ type: 'SET_CREATE_PARTIE_MODAL', payload: false });
    dispatch({ type: 'SET_SUBMITATTEMPTED_PMP', payload: false });
    dispatch({ type: 'SET_SEARCH_TERM_LINK_PARTIE', payload: '' });
    dispatch({ type: 'SET_SEARCH_TERM_LINK_ALL_POUR', payload: '' });
    dispatch({ type: 'SET_SEARCH_TERM_LINK_ALL_CONTRE', payload: '' });

    return Promise.resolve(newContactData);
  } catch (error) {
    const errorMessage = error.response?.data?.msg || error.message;
    if (error.response && error.response.status === 409) {
      dispatch({
        type: 'EMAIL_ALREADY_EXISTS_PMP',
        payload: {
          message: errorMessage,
          field: error.response.data.field
        }
      });
    } else {
      dispatch({ type: 'CREATE_CONTACT_PM_PUBLIQUE_FAIL', payload: errorMessage });
    }
    return Promise.reject(error);
  }
};

export const updateContactPMPublique = (contactId, contactData, token, options = {}) => async (dispatch, getState) => {
  try {
    const payloadForApi = {
      contactData: contactData.personneMorale.personneMorale,
      user: contactData.user,
      options: {
        fromCreatePartie: options.fromCreatePartie,
        modificationType: options.modificationType,
      }
    };

    const res = await apiClient.put(
      `/api/folder/contactPMPublique/${contactId}`,
      payloadForApi,
      { headers: { 'Content-Type': 'application/json' } },
    );

    const formatLocalContactPMP = (c) => { return c.denomination ? `${c.denomination} ${c.ville || ''}` : ''; };
    const modificationType = options.modificationType;
    const mode = options.fromCreatePartie?.mode || 'create';
    const UPDATE_PARTIE_ACTION_TYPE = mode === 'edit' ? 'EDIT_UPDATE_PARTIE' : 'UPDATE_PARTIE';

    if (options.fromCreatePartie?.fromCreatePartiesForLink?.isLinkedToPartiesGroup) {
      const successActionType = mode === 'edit' ? 'EDIT_UPDATE_CONTACT_PM_PUBLIQUE_SUCCESS' : 'UPDATE_CONTACT_PM_PUBLIQUE_SUCCESS';
      dispatch({ type: successActionType, payload: res.data });
      if (mode === 'edit') {
        const currentDossierId = getState().currentDossier.dossier?._id;
        if (currentDossierId) {
          dispatch(fetchCurrentDossier(currentDossierId, token));
        }
      }
    } else if (options.fromCreatePartie?.fromCreatePartiesForLink?.isLinkedToSinglePartie) {
      const successActionType = mode === 'edit' ? 'EDIT_UPDATE_CONTACT_PM_PUBLIQUE_SUCCESS' : 'UPDATE_CONTACT_PM_PUBLIQUE_SUCCESS';
      dispatch({ type: successActionType, payload: res.data });
      if (mode === 'edit') {
        const currentDossierId = getState().currentDossier.dossier?._id;
        if (currentDossierId) {
          dispatch(fetchCurrentDossier(currentDossierId, token));
        }
      }
    } else if (modificationType === 'partieItself') {
      const nomPartie = formatLocalContactPMP(res.data);
      let typePartie = options.fromCreatePartie?.fromCreatePartieForPartie?.typePartie || res.data.typePartie;
      if (!typePartie) {
        const partieState = mode === 'edit' ? getState().partieEditData : getState().partieData;
        const partie = partieState.parties.find(p => p.idPartie === contactId);
        typePartie = partie ? partie.typePartie : 'Pour';
      }
      const updatedPartieData = { nomPartie, typePartie, partieData: res.data };
      dispatch({ type: UPDATE_PARTIE_ACTION_TYPE, payload: { idPartie: contactId, updatedData: updatedPartieData } });
    } else if (modificationType === 'contactLinkedToDossier') {
      dispatch({ type: 'UPDATE_SELECTED_CONTACT', payload: res.data });
    }

    // Rafraîchissement systématique du dossier courant après mise à jour
    // (alignement sur updateContact PP dans createContactSlice.js)
    const currentDossierId = getState().currentDossier.dossier?._id;
    if (currentDossierId) {
      dispatch(fetchCurrentDossier(currentDossierId, token));
    }

    dispatch({ type: 'SET_MODIFYING_CONTACT_ID', payload: null });
    dispatch({ type: 'RESET_CONTACT_PM_PUBLIQUE_PMP' });
    dispatch({ type: 'SET_CREATE_PARTIE_MODAL', payload: false });

    return Promise.resolve(res.data);
  } catch (error) {
    console.error('ACTION updateContactPMPublique Erreur:', error.response?.data || error);
    dispatch({ type: 'UPDATE_CONTACT_PM_PUBLIQUE_FAIL', payload: error.message });
    return Promise.reject(error);
  }
};

// Action creators migres depuis contactPMPActions.js — Phase 9C-7
export const resetContactPMPublique = () => ({ type: 'RESET_CONTACT_PM_PUBLIQUE_PMP' });
export const setSubmitAttemptedPMP = (value) => ({ type: 'SET_SUBMITATTEMPTED_PMP', payload: value });
