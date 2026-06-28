// personneMoraleSlice.js — migré depuis dossierReducers/PM/CreateContactPM.js
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
import { isValidEmail, countErrors } from '../utils/validationHelpers';

const isValidField = (value) => !!value && value.trim() !== '';
const isValidFieldAny = (value) => value && value.trim() !== '';

function constructFullName(prenom, nom) {
  if (prenom && nom) return `${prenom} ${nom}`.trim();
  if (prenom) return prenom.trim();
  if (nom) return nom.trim();
  return '';
}

const formErrorsInitialState = {
  raisonSociale: false,
  siret: false,
  formeJuridique: false,
  adresseSiegeSocial: false,
  codePostalPM: false,
  villePM: false,
};

const initialState = {
  personData: {
    contactType: 'morale',
    raisonSociale: '',
    siret: '',
    formeJuridique: '',
    adresseSiegeSocial: '',
    telephoneEntreprise: '',
    emailEntreprise: '',
    siteWeb: '',
    secteurActivite: '',
    dateCreationEntreprise: '',
    capitalSocial: '',
    tvaIntracommunautaire: '',
    codePostalPM: '',
    villePM: '',
    NAF_APE: '',
    // Interlocuteur Principal (simplifié — plus de RL/CD séparés)
    interlocuteurNom: '',
    interlocuteurPrenom: '',
    interlocuteurFonction: '',
    interlocuteurEmail: '',
    interlocuteurTelephone: '',
  },
  formErrors: formErrorsInitialState,
  ErrorsMails: {
    emailEntrepriseError: false,
    emailExistsError: null,
    errorField: null,
  },
  errorsCount: countErrors(formErrorsInitialState),
};

// --- Slice ---
const personneMoraleSlice = createSlice({
  name: 'personneMoraleReducer',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase('EMAIL_ALREADY_EXISTS_PM', (state, action) => {
        // Désactivé : pas de blocage pour email dupliqué
      })

      .addCase('RESET_FORM_PMP', () => {
        localStorage.removeItem('personneMoraleData');
        return initialState;
      })

      .addCase('SET_PERSONNE_MORALE_FIELD', (state, action) => {
        const { field, value } = action.payload;

        // Tous les champs vont dans personData (simplifié — plus de RL/CD)
        state.personData[field] = value;

        // Vérifications désactivées : pas de validation des champs requis ni des emails
        // On garde juste le reset de emailExistsError quand l'utilisateur tape un email
        if (field === 'emailEntreprise' || field === 'interlocuteurEmail') {
          state.ErrorsMails.emailExistsError = null;
          state.ErrorsMails.errorField = null;
        }
      })

      .addCase('SET_PERSONNE_MORALE_FOR_MODIFICATION', (state, action) => {
        const { contactData } = action.payload;

        // personData — simplifié (plus de RL/CD séparés)
        Object.assign(state.personData, contactData);

        // Recalcul erreurs
        Object.keys(state.formErrors).forEach((field) => {
          if (field in state.personData) {
            state.formErrors[field] = !isValidFieldAny(state.personData[field]);
          }
        });
        state.errorsCount = countErrors(state.formErrors);

        // ErrorsMails à false
        state.ErrorsMails.emailEntrepriseError = false;
        state.ErrorsMails.emailExistsError = null;
        state.ErrorsMails.errorField = null;
      })

      .addCase('VALIDATE_FORME_JURIDIQUE', (state, action) => {
        state.formErrors.formeJuridique = action.payload;
        state.errorsCount = countErrors(state.formErrors);
      })

      .addCase('RESET_CONTACT_PM', () => {
        localStorage.removeItem('personneMoraleData');
        return initialState;
      });
  },
});

export const personneMoraleReducer = personneMoraleSlice.reducer;

// ========================================================================
// Action creators migres depuis contactSharedActions.js
// ========================================================================

export const setPersonneMoraleField = (field, value) => ({ type: 'SET_PERSONNE_MORALE_FIELD', payload: { field, value } });
export const setPersonneMoraleForModification = (data) => ({ type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION', payload: data });
export const resetPersonneMorale = () => ({ type: 'RESET_FORM_PMP' });
export const validateFormeJuridique = (isValid) => ({ type: 'VALIDATE_FORME_JURIDIQUE', payload: isValid });

// ========================================================================
// Thunks migres depuis contactPMActions.js — Phase 9C-6
// ========================================================================

const formatContact = (contact) => {
  if (contact.nom && contact.prenoms) {
    return `${contact.nom} ${contact.prenoms} ${contact.nom_de_naissance ? `né(e) ${contact.nom_de_naissance}` : ''}`;
  } else if (contact.raisonSociale) {
    return `${contact.raisonSociale} ${contact.villePM || ''}`;
  } else if (contact.denomination) {
    return `${contact.denomination} ${contact.ville || ''}`;
  }
  return '';
};

export const createContactPM = (contactData, token) => async (dispatch, getState) => {
  console.log('[createContactPM] ▶ DÉBUT du thunk');
  try {
    const { fromCreatePartie, ...contactPayload } = contactData;
    const mode = fromCreatePartie?.mode || 'create';
    console.log('[createContactPM] mode:', mode, '| fromCreatePartie:', JSON.stringify(fromCreatePartie, null, 2));

    const currentSetPartie = mode === 'edit' ? setPartieEdit : setPartieCreate;
    const currentSetPartieLink = mode === 'edit' ? setPartieLinkEdit : setPartieLinkCreate;
    const currentSetPartiesLinkAllPour = mode === 'edit' ? setPartiesLinkAllPourEdit : setPartiesLinkAllPourCreate;
    const currentSetPartiesLinkAllContre = mode === 'edit' ? setPartiesLinkAllContreEdit : setPartiesLinkAllContreCreate;

    console.log('[createContactPM] ▶ Appel API POST /api/folder/contactPM...');
    const res = await apiClient.post(
      '/api/folder/contactPM',
      contactPayload,
    );
    console.log('[createContactPM] ✅ Réponse API reçue, status:', res.status);
    dispatch({ type: 'CREATE_CONTACT_PM_SUCCESS', payload: res.data });
    const newContactData = res.data;
    console.log('[createContactPM] Contact PM créé avec succès:', { _id: newContactData._id, raisonSociale: newContactData.raisonSociale, contactType: newContactData.contactType });

    dispatch({ type: 'RESET_CONTACT_PM' });
    dispatch({ type: 'RESET_SERV_ERRORS' });
    console.log('[createContactPM] Resets dispatched OK');

    if (fromCreatePartie) {
      if (fromCreatePartie.fromCreatePartieForPartie?.isTransformedToPartie) {
        const typePartie = fromCreatePartie.fromCreatePartieForPartie.typePartie;
        console.log('[createContactPM] → Dispatch setPartie avec typePartie:', typePartie, '| newContactData._id:', newContactData._id, '| raisonSociale:', newContactData.raisonSociale);
        try {
          dispatch(currentSetPartie(typePartie, newContactData));
          console.log('[createContactPM] ✅ setPartie dispatched OK');
        } catch (setPartieErr) {
          console.error('[createContactPM] ❌ ERREUR dans setPartie:', setPartieErr.message, setPartieErr.stack);
          throw setPartieErr;
        }
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

    console.log('[createContactPM] ▶ Dispatch SET_CREATE_PARTIE_MODAL = false (fermeture modale)');
    dispatch({ type: 'SET_CREATE_PARTIE_MODAL', payload: false });
    dispatch({ type: 'SET_SEARCH_TERM_LINK_PARTIE', payload: '' });
    dispatch({ type: 'SET_SEARCH_TERM_LINK_ALL_POUR', payload: '' });
    dispatch({ type: 'SET_SEARCH_TERM_LINK_ALL_CONTRE', payload: '' });

    console.log('[createContactPM] ✅ FIN du thunk — succès complet. Retour newContactData._id:', newContactData._id);
    return Promise.resolve(newContactData);
  } catch (err) {
    console.error('[createContactPM] ❌ ERREUR CAPTURÉE dans le thunk:', err);
    console.error('[createContactPM] ❌ err.message:', err.message);
    console.error('[createContactPM] ❌ err.response?.status:', err.response?.status);
    console.error('[createContactPM] ❌ err.response?.data:', err.response?.data);
    console.error('[createContactPM] ❌ err.stack:', err.stack);
    const errorMessage = err.response?.data?.msg || err.message;
    if (err.response && err.response.status === 409) {
      dispatch({
        type: 'EMAIL_ALREADY_EXISTS_PM',
        payload: {
          message: errorMessage,
          field: err.response.data.field
        }
      });
    } else {
      dispatch({ type: 'SET_SERV_ERRORS', payload: errorMessage });
    }
    return Promise.reject(errorMessage);
  }
};

export const updateContactPM = (contactId, contactData, token, options = {}) => async (dispatch, getState) => {
  try {
    const payloadForApi = {
      contact: contactData.contact,
      user: contactData.user,
      options: {
        fromCreatePartie: options.fromCreatePartie,
        modificationType: options.modificationType,
      }
    };

    const res = await apiClient.put(
      `/api/folder/contactPM/${contactId}`,
      payloadForApi,
    );

    const formatLocalContactPM = (c) => { return c.raisonSociale ? `${c.raisonSociale} ${c.villePM || ''}` : ''; };
    const modificationType = options.modificationType;
    const mode = options.fromCreatePartie?.mode || 'create';
    const UPDATE_PARTIE_ACTION_TYPE = mode === 'edit' ? 'EDIT_UPDATE_PARTIE' : 'UPDATE_PARTIE';

    if (options.fromCreatePartie?.fromCreatePartiesForLink?.isLinkedToPartiesGroup) {
      const successActionType = mode === 'edit' ? 'EDIT_UPDATE_CONTACT_PM_SUCCESS' : 'UPDATE_CONTACT_PM_SUCCESS';
      dispatch({ type: successActionType, payload: res.data });
      if (mode === 'edit') {
        const currentDossierId = getState().currentDossier.dossier?._id;
        if (currentDossierId) {
          dispatch(fetchCurrentDossier(currentDossierId, token));
        }
      }
    } else if (options.fromCreatePartie?.fromCreatePartiesForLink?.isLinkedToSinglePartie) {
      const successActionType = mode === 'edit' ? 'EDIT_UPDATE_CONTACT_PM_SUCCESS' : 'UPDATE_CONTACT_PM_SUCCESS';
      dispatch({ type: successActionType, payload: res.data });
      if (mode === 'edit') {
        const currentDossierId = getState().currentDossier.dossier?._id;
        if (currentDossierId) {
          dispatch(fetchCurrentDossier(currentDossierId, token));
        }
      }
    } else if (modificationType === 'partieItself') {
      const nomPartie = formatLocalContactPM(res.data);
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
    dispatch({ type: 'RESET_CONTACT_PM' });
    dispatch({ type: 'RESET_SERV_ERRORS' });
    dispatch({ type: 'SET_CREATE_PARTIE_MODAL', payload: false });

    return Promise.resolve(res.data);
  } catch (err) {
    console.error('ACTION updateContactPM Erreur:', err.response?.data || err);
    const errorMessage = err.response?.data?.msg || err.message || 'Erreur serveur lors de la mise à jour du contact PM.';
    dispatch({ type: 'SET_SERV_ERRORS', payload: errorMessage });
    return Promise.reject(errorMessage);
  }
};

// Action creators migres depuis contactPMActions.js — Phase 9C-6
export const resetContactPM = () => ({ type: 'RESET_CONTACT_PM' });
export const resetRepresentantLegal = () => ({ type: 'RESET_REPRESENTANT_LEGAL' });
export const resetContactDirectPM = () => ({ type: 'RESET_CONTACT_DIRECT' });
export const resetServErrorsPM = () => ({ type: 'RESET_SERV_ERRORS' });
