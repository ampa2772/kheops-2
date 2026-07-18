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
import {
  resetCorrespondingContactState,
  isValidEmail,
  initializeErrorForm,
  updateNbErrors,
  adjustMaritalStatusForGender,
  initializeResetState,
  loadInitialState,
  getDefaultContact
} from '../utils/FonctionsCreateContact';
import { isLawyerContact, normalizeLawyerRoles, withLawyerRoles } from '../../utils/partyLinking';

// ========================================================================
// Thunks classiques (cross-slice dispatch + re-fetch)
// ========================================================================
//
// Les anciens thunks d'administration des TypeContact (fetchTypeContacts,
// modifContactType, deleteContactType, saveNewContactType) ont ete retires :
// le selecteur de type de contact est maintenant un switch binaire
// pro/client + dropdown ferme (voir FormePP/ContactTypeSwitch), et les
// routes serveur correspondantes sont supprimees.

export const checkExistingContact = (contact, token) => async (dispatch) => {
  try {
    const res = await apiClient.post(`/api/folder/check-contact`, contact);
    if (res.status === 200) {
      dispatch({ type: 'RESET_SERV_ERRORS' });
      return Promise.resolve(res.data.msg);
    }
  } catch (err) {
    const errorMessage = err.response?.data?.msg || 'Erreur lors de la vérification du contact';
    dispatch({ type: 'SET_SERV_ERRORS', payload: errorMessage });
    return Promise.reject(errorMessage);
  }
};

// ========================================================================
// Slice
// ========================================================================

const initialState = {
  ...loadInitialState(),
  isModificationMode: false,
};

const createContactSlice = createSlice({
  name: 'createContactReducer',
  initialState,
  reducers: {
    // setContactType est conservee pour compatibilite (utilisee dans
    // createContact/index.js lors du switch PP/PM) : elle ecrit dans
    // typeContactsData.currentTypeContact qui n'est plus qu'un placeholder
    // historique (l'UI n'en depend plus). Peut etre retiree ulterieurement.
    setContactType(state, action) {
      state.typeContactsData.currentTypeContact = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase('EMAIL_ALREADY_EXISTS_PP', (state, action) => {
        // Désactivé : pas de blocage pour email dupliqué
      })

      .addCase('SET_CONTACT_FIELD', (state, action) => {
        const { field, value } = action.payload;

        // 1. Mettre a jour la valeur du champ
        state.contactDetails.contact[field] = value;

        // 1bis. Si l'utilisateur a tape dans appellationCourrier, marquer
        // comme custom pour bloquer toute resynchronisation auto ulterieure
        // (sinon "Mon cher confrere" tape par l'utilisateur serait ecrase
        // par la valeur recalculee a partir de pro_contact/type/genre).
        if (field === 'appellationCourrier') {
          state.contactDetails.contact.appellationCourrierIsCustom = true;
        }

        // 2. Mettre a jour les erreurs de validation
        if (typeof value === 'string' && state.formErrors.errorForm.hasOwnProperty(field)) {
          state.formErrors.errorForm[field] = !value.trim();
        }
        if (field === 'email') {
          state.formErrors.validEmail = isValidEmail(value);
          state.formErrors.emailExistsError = null;
        }

        // 3. Ajustement statut marital / options selon le genre
        if (field === 'genre') {
          const adjustedMaritalStatus = adjustMaritalStatusForGender(state.contactDetails.currentStatusMarital, value, state.contactDetails.optionsStatusMaritaux);
          state.contactDetails.currentStatusMarital = adjustedMaritalStatus;
          state.contactDetails.statusMaritauxGenre = state.contactDetails.optionsStatusMaritaux
            .map(option => option[value.toLowerCase()])
            .filter(status => status !== adjustedMaritalStatus);
          state.contactDetails.contact.maritalStatus = adjustedMaritalStatus;
        }

        // 4. Quand on passe de/vers "Professionnel" ou qu'on change le label type,
        //    reinitialiser les erreurs du formulaire pour qu'elles reflètent le
        //    nouveau sous-ensemble de champs obligatoires (le form pro est réduit).
        if (field === 'pro_contact' || field === 'type') {
          state.formErrors.errorForm = initializeErrorForm(
            state.contactDetails.contact,
            state.contactDetails.contact.pro_contact
          );
        }

        // 5. Recalculer le nombre total d'erreurs
        updateNbErrors(state);
      })

      // Action dediee a l'auto-remplissage de l'appellation courrier :
      // met a jour la valeur SANS marquer le flag custom. Utilisee par
      // ContactTypeSwitch et l'effet de synchro dans FormePP.
      .addCase('SET_APPELLATION_AUTO', (state, action) => {
        state.contactDetails.contact.appellationCourrier = action.payload || '';
        state.contactDetails.contact.appellationCourrierIsCustom = false;
      })

      .addCase('RESET_FORM_CONTACT', (state) => {
        localStorage.removeItem('contactFormData');
        const resetState = initializeResetState(null, true);
        Object.assign(state, resetState);
        state.isModificationMode = false;

        // Par defaut : Client/Partie, type standard, appellation par defaut
        // (le reset force genre Masculin -> 'Cher Monsieur')
        state.contactDetails.contact.type = 'Partie (Client/Adversaire)';
        state.contactDetails.contact.appellationCourrier = 'Cher Monsieur';
        state.contactDetails.contact.appellationCourrierIsCustom = false;
        state.contactDetails.contact.pro_contact = false;

        state.formErrors.errorForm = initializeErrorForm(state.contactDetails.contact, state.contactDetails.contact.pro_contact);
        updateNbErrors(state);
      })

      .addCase('SET_CONTACT_FOR_MODIFICATION', (state, action) => {
        const contactData = action.payload;
        const formattedContactData = {
          ...contactData,
          dateNaissance: contactData.dateNaissance
            ? new Date(contactData.dateNaissance).toISOString().substring(0, 10)
            : '',
        };
        state.contactDetails.contact = { ...state.contactDetails.contact, ...formattedContactData };
        // Quand on charge un contact existant, son appellation est protegee
        // contre la resynchronisation auto : la valeur enregistree est la
        // verite. L'utilisateur peut toujours la re-editer manuellement.
        state.contactDetails.contact.appellationCourrierIsCustom = true;
        state.isModificationMode = true;

        // Fix 2026-07-04 : restaurer le statut marital AFFICHE depuis le contact
        // charge. On alimentait contact.maritalStatus mais pas
        // currentStatusMarital (source du bouton affiche) ni statusMaritauxGenre
        // (options du dropdown) => un contact marie reaffichait « Celibataire »
        // et le bouton « D » (details mariage) disparaissait a la reouverture.
        const loadedMaritalStatus = state.contactDetails.contact.maritalStatus;
        if (loadedMaritalStatus) {
          state.contactDetails.currentStatusMarital = loadedMaritalStatus;
          const genreKey = (state.contactDetails.contact.genre || 'Masculin').toLowerCase();
          state.contactDetails.statusMaritauxGenre = state.contactDetails.optionsStatusMaritaux
            .map(option => option[genreKey])
            .filter(status => status !== loadedMaritalStatus);
        }

        state.formErrors.errorForm = initializeErrorForm(state.contactDetails.contact, state.contactDetails.contact.pro_contact, true);
        state.formErrors.errorForm.email = false;
        state.formErrors.validEmail = true;
        updateNbErrors(state);
      })

      .addCase('SET_MARITAL_STATUS', (state, action) => {
        const { value } = action.payload;
        state.contactDetails.currentStatusMarital = value;
        state.contactDetails.contact.maritalStatus = value;
        state.contactDetails.statusMaritauxGenre = state.contactDetails.optionsStatusMaritaux
          .map(option => option[state.contactDetails.contact.genre.toLowerCase()])
          .filter(status => status !== value);
      })

      .addCase('RESET_CONTACT', (state) => {
        const resetState = initializeResetState(state);
        Object.assign(state, resetState);
        state.isModificationMode = false;
        state.contactDetails.contact = {
          ...getDefaultContact(state.contactDetails.contact.genre, state.contactDetails.currentStatusMarital),
          type: 'Partie (Client/Adversaire)',
          // Appellation par defaut alignee sur le genre conserve par le reset.
          appellationCourrier: state.contactDetails.contact.genre === 'Feminin' ? 'Chère Madame' : 'Cher Monsieur',
          appellationCourrierIsCustom: false,
          pro_contact: false,
        };
        state.formErrors.errorForm = initializeErrorForm(state.contactDetails.contact, state.contactDetails.contact.pro_contact);
        updateNbErrors(state);
        localStorage.setItem('contactFormData', JSON.stringify(state));
      })

      .addCase('SET_SERV_ERRORS', (state, action) => {
        state.servErrors = action.payload;
      })

      .addCase('RESET_SERV_ERRORS', (state) => {
        state.servErrors = null;
      })

      .addCase('SET_CORRESPONDING_CONTACT', (state, action) => {
        state.correspondingContact = action.payload;
      })

      .addCase('RESET_CORRESPONDING_CONTACT', (state) => {
        state.correspondingContact = resetCorrespondingContactState;
      })

      .addCase('SET_HAS_CHECKED_CONTACT', (state, action) => {
        state.formErrors.hasCheckedContact = action.payload;
      });
  },
});

export const {
  setContactType,
} = createContactSlice.actions;

// ========================================================================
// Thunks et action creators migrés depuis contactSharedActions.js
// ========================================================================

export const resetContactAndErrors = () => (dispatch) => {
  dispatch({ type: 'RESET_CONTACT_PM' });
  dispatch({ type: 'RESET_SERV_ERRORS' });
  dispatch({ type: 'RESET_CONTACT' });
  dispatch({ type: 'RESET_PERSONNES_CHARGE' });
  dispatch({ type: 'RESET_MARIAGE_DETAILS' });
  dispatch({ type: 'RESET_MATCHING' });
  dispatch({ type: 'RESET_CORRESPONDING_CONTACT' });
  dispatch(resetFormContact());
  dispatch(resetPersonneCharge());
  dispatch(resetPersonneMorale());
  dispatch(resetPersonneMoralePublique());
  dispatch(resetMariageDetails());
};

export const setMaritalStatus = (value) => ({ type: 'SET_MARITAL_STATUS', payload: { value } });
export const setHasCheckedContact = (hasCheckedContact) => ({ type: 'SET_HAS_CHECKED_CONTACT', payload: hasCheckedContact });
export const setContactField = (field, value) => ({ type: 'SET_CONTACT_FIELD', payload: { field, value } });
export const setContactForModification = (contactData) => ({ type: 'SET_CONTACT_FOR_MODIFICATION', payload: contactData });
export const resetFormContact = () => ({ type: 'RESET_FORM_CONTACT' });

// Helpers pour resetContactAndErrors (dispatch de string types gérés par d'autres slices)
const resetPersonneCharge = () => ({ type: 'RESET_TOUTE_LISTE' });
const resetPersonneMorale = () => ({ type: 'RESET_FORM_PMP' });
const resetPersonneMoralePublique = () => ({ type: 'RESET_FORM_PMP_PUBLIC' });
const resetMariageDetails = () => ({ type: 'RESET_MARIAGE_DETAILS' });



// ========================================================================
// Thunks et action creators migrés depuis contactPPActions.js — Phase 9C-5
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
export const createContact = (contact, token, options = {}) => async (dispatch, getState) => {
  const { contactType = 'contact', fromCreatePartie } = options;
  const mode = fromCreatePartie?.mode || 'create';

  // Utilisation des actions spécifiques au mode (Create ou Edit)
  const currentSetPartie = mode === 'edit' ? setPartieEdit : setPartieCreate;
  const currentSetPartieLink = mode === 'edit' ? setPartieLinkEdit : setPartieLinkCreate;
  const currentSetPartiesLinkAllPour = mode === 'edit' ? setPartiesLinkAllPourEdit : setPartiesLinkAllPourCreate;
  const currentSetPartiesLinkAllContre = mode === 'edit' ? setPartiesLinkAllContreEdit : setPartiesLinkAllContreCreate;

  try {
    const transientRoles = normalizeLawyerRoles(contact?.linkRoles || contact);
    const { linkRoles: _transientLinkRoles, ...contactForApi } = contact || {};
    const payload = {
      contact: contactForApi,
      options: { ...options, userId: options.userId },
    };
    const res = await apiClient.post(
      '/api/folder/contact',
      payload,
    );
    dispatch({ type: 'CREATE_CONTACT_SUCCESS', payload: res.data });
    const newContactData = res.data;
    // Certains endpoints historiques renvoient une fiche partielle. Le type
    // saisi avant création reste alors la source de secours pour classer la
    // relation sans jamais persister `linkRoles` sur la fiche maître.
    const createdContactIsLawyer = isLawyerContact(newContactData) || isLawyerContact(contact);
    const relationRoles = createdContactIsLawyer ? transientRoles : {};
    const linkedContactData = createdContactIsLawyer
      ? withLawyerRoles(newContactData, transientRoles)
      : newContactData;

    if (contactType === 'notaireMariage') {
      dispatch({ type: 'RESET_NOTAIRES', payload: res.data });
    } else {
      dispatch({ type: 'RESET_CONTACT' });
      dispatch({ type: 'RESET_MARIAGE_DETAILS' });
      dispatch({ type: 'RESET_PERSONNES_CHARGE' });
      dispatch({ type: 'RESET_MATCHING' });
    }
    dispatch({ type: 'CONTACT_RESET_COMMUNES' });
    // Purge explicite du brouillon localStorage apres creation reussie,
    // pour que la prochaine creation reparte d'un formulaire vide.
    dispatch({ type: 'RESET_FORM_CONTACT' });

    // Logique de liaison après création
    if (fromCreatePartie) {
      if (fromCreatePartie.fromCreatePartieForPartie?.isTransformedToPartie) {
        const typePartie = fromCreatePartie.fromCreatePartieForPartie.typePartie;
        dispatch(currentSetPartie(typePartie, newContactData));
      } else if (fromCreatePartie.fromCreatePartiesForLink?.isLinkedToSinglePartie) {
        const targetPartyId = fromCreatePartie.fromCreatePartiesForLink.linkedPartieId;
        if (targetPartyId) {
          dispatch(currentSetPartieLink(targetPartyId, linkedContactData));
          // Auto-save en base en mode edit
          if (mode === 'edit') {
            const currentDossierId = getState().currentDossier?.dossier?._id;
            if (currentDossierId) {
              dispatch(addLinkedContactToParty(currentDossierId, targetPartyId, {
                existingContactId: newContactData._id,
                ...relationRoles,
              }));
            }
          }
        }
      } else if (fromCreatePartie.fromCreatePartiesForLink?.isLinkedToPartiesGroup) {
        const linkedGroupType = fromCreatePartie.fromCreatePartiesForLink.linkedGroupType;
        if (linkedGroupType === 'Pour') {
          dispatch(currentSetPartiesLinkAllPour({ contact: linkedContactData }));
        } else if (linkedGroupType === 'Contre') {
          dispatch(currentSetPartiesLinkAllContre({ contact: linkedContactData }));
        }
        // Auto-save en base en mode edit pour toutes les parties du groupe
        if (mode === 'edit') {
          const currentDossierId = getState().currentDossier?.dossier?._id;
          const partieState = getState().partieEditData;
          if (currentDossierId && partieState?.parties) {
            const targetParties = partieState.parties.filter(p => p.typePartie === linkedGroupType);
            // Le dossier est un snapshot partagé : les sauvegardes d'un même
            // groupe doivent être séquentielles pour éviter qu'une réponse
            // plus ancienne écrase la relation ajoutée juste après.
            for (const partie of targetParties) {
              await dispatch(addLinkedContactToParty(currentDossierId, partie.idPartie, {
                existingContactId: newContactData._id,
                ...relationRoles,
              }));
            }
          }
        }
      } else if (fromCreatePartie.fromCreatePartiesForLink?.isLinkedToDossier) {
        dispatch({ type: 'ADD_SELECTED_CONTACT', payload: newContactData });
        dispatch({ type: 'SET_MODIFYING_CONTACT_ID', payload: null });
      }
    }

    dispatch({ type: 'SET_CREATE_PARTIE_MODAL', payload: false });
    dispatch({ type: 'SET_SEARCH_TERM_LINK_PARTIE', payload: '' });
    dispatch({ type: 'SET_SEARCH_TERM_LINK_ALL_POUR', payload: '' });
    dispatch({ type: 'SET_SEARCH_TERM_LINK_ALL_CONTRE', payload: '' });

    return Promise.resolve(newContactData);
  } catch (err) {
    const errorMessage = err.response?.data?.msg || err.message;
    if (err.response && err.response.status === 409) {
      dispatch({
        type: 'EMAIL_ALREADY_EXISTS_PP',
        payload: {
          message: errorMessage,
          field: err.response.data.field
        }
      });
    } else {
      dispatch({ type: 'CREATE_CONTACT_FAIL', payload: errorMessage });
    }
    return Promise.reject(errorMessage);
  }
};

export const updateContact = (contactId, contactData, token, options = {}) => async (dispatch, getState) => {
  console.log('[DEBUG updateContact] contactId:', contactId, '| mode:', options.fromCreatePartie?.mode, '| modificationType:', options.modificationType);
  console.log('[DEBUG updateContact] isLinkedToSinglePartie:', options.fromCreatePartie?.fromCreatePartiesForLink?.isLinkedToSinglePartie, '| email envoyé:', contactData?.email);
  try {
    // `linkRoles` n'appartient pas à la fiche maître du contact : les rôles
    // sont portés par la relation avocat ↔ partie.
    const { linkRoles: _transientLinkRoles, ...contactForApi } = contactData || {};
    const payloadForApi = {
      contact: contactForApi,
      options: {
        fromCreatePartie: options.fromCreatePartie,
        modificationType: options.modificationType,
        // Transmet la liste actuelle des personnes à charge pour synchronisation
        // côté serveur (création/mise à jour/suppression par diff sur les _id).
        personnesCharge: options.personnesCharge,
        // Fix 2026-07-04 : transmettre aussi les détails de mariage au PUT
        // (avant, ils n'étaient persistés qu'à la création du contact).
        detailMariage: options.detailMariage,
      }
    };

    const res = await apiClient.put(
      `/api/folder/contact/${contactId}`,
      payloadForApi,
    );
    console.log('[DEBUG updateContact] Réponse serveur OK, email retourné:', res.data?.email);

    const modificationType = options.modificationType;
    const mode = options.fromCreatePartie?.mode || 'create';
    const UPDATE_PARTIE_ACTION_TYPE = mode === 'edit' ? 'EDIT_UPDATE_PARTIE' : 'UPDATE_PARTIE';

    if (options.fromCreatePartie?.fromCreatePartiesForLink?.isLinkedToPartiesGroup) {
      const successActionType = mode === 'edit' ? 'EDIT_UPDATE_CONTACT_SUCCESS' : 'UPDATE_CONTACT_SUCCESS';
      dispatch({ type: successActionType, payload: res.data });
      if (mode === 'edit') {
        const currentDossierId = getState().currentDossier.dossier?._id;
        console.log('[DEBUG updateContact] isLinkedToPartiesGroup + edit → fetchCurrentDossier dossierId:', currentDossierId);
        if (currentDossierId) {
          dispatch(fetchCurrentDossier(currentDossierId, token));
        }
      }
    } else if (options.fromCreatePartie?.fromCreatePartiesForLink?.isLinkedToSinglePartie) {
      const successActionType = mode === 'edit' ? 'EDIT_UPDATE_CONTACT_SUCCESS' : 'UPDATE_CONTACT_SUCCESS';
      dispatch({ type: successActionType, payload: res.data });
      if (mode === 'edit') {
        const currentDossierId = getState().currentDossier.dossier?._id;
        console.log('[DEBUG updateContact] isLinkedToSinglePartie + edit → fetchCurrentDossier dossierId:', currentDossierId);
        if (currentDossierId) {
          dispatch(fetchCurrentDossier(currentDossierId, token));
        }
      }
    } else if (modificationType === 'partieItself') {
      const nomPartie = formatContact(res.data);
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

    // ========================================================================
    // CORRECTION : Toujours rafraîchir le dossier courant après mise à jour
    // d'un contact, quelle que soit la branche empruntée ci-dessus.
    // Cela garantit que les snapshots embarqués sont à jour dans le Redux store.
    // ========================================================================
    const currentDossierId = getState().currentDossier.dossier?._id;
    if (currentDossierId) {
      console.log('[DEBUG updateContact] Rafraîchissement systématique du dossier courant:', currentDossierId);
      dispatch(fetchCurrentDossier(currentDossierId, token));
    }

    dispatch({ type: 'SET_MODIFYING_CONTACT_ID', payload: null });
    dispatch({ type: 'RESET_CONTACT' });
    dispatch({ type: 'RESET_MARIAGE_DETAILS' });
    dispatch({ type: 'RESET_PERSONNES_CHARGE' });
    dispatch({ type: 'RESET_MATCHING' });
    dispatch({ type: 'CONTACT_RESET_COMMUNES' });
    dispatch({ type: 'RESET_CONTACT_DIRECT' });
    dispatch({ type: 'RESET_REPRESENTANT_LEGAL' });
    dispatch({ type: 'RESET_FORM_PMP' });
    dispatch({ type: 'RESET_FORM_PMP_PUBLIC' });
    dispatch({ type: 'RESET_FORM_CONTACT' });
    dispatch({ type: 'RESET_TOUTE_LISTE' });
    dispatch({ type: 'SET_CREATE_PARTIE_MODAL', payload: false });

    return Promise.resolve({ payload: res.data });
  } catch (err) {
    console.error('ACTION updateContact Erreur:', err.response?.data || err);
    const errorMessage = err.response?.data?.msg || err.message || 'Erreur serveur lors de la mise à jour du contact.';
    return Promise.reject(errorMessage);
  }
};

export const resetContact = () => ({ type: 'RESET_CONTACT' });
export const resetMatchingPP = () => ({ type: 'RESET_MATCHING' });
export const resetCommunesContact = () => ({ type: 'CONTACT_RESET_COMMUNES' });

// Détecte si un brouillon de création de contact est en cours.
// Le state Redux est persisté en localStorage sous 'contactFormData' (cf
// wrappedReducer ci-dessous). On considère le brouillon "non vide" dès qu'un
// champ identitaire significatif est rempli (PP : nom/prénom/email ;
// PM : raison sociale via personneMoraleData ; PMP : dénomination via
// contactPMPubliqueData). En mode modification (isModificationMode=true),
// le state est volontairement non persisté → pas de faux positif.
export const hasMeaningfulContactDraft = (
  createContactState,
  personneMoraleState,
  contactPMPubliqueState,
) => {
  if (!createContactState || createContactState.isModificationMode) return false;
  const c = createContactState?.contactDetails?.contact || {};
  const pp = !!(c.nom || c.prenoms || c.email || c.dateNaissance || c.adresse);
  const pm = !!(personneMoraleState?.raisonSociale || personneMoraleState?.siren);
  const pmp = !!(contactPMPubliqueState?.denomination);
  return pp || pm || pmp;
};

// Wrapper : persiste le formulaire en localStorage pour garder le brouillon
// entre fermeture/reouverture de la modale dans la meme session.
// Deux regles strictes :
//   - ne sauvegarde JAMAIS quand on est en mode modification
//     (sinon les donnees d'un contact existant viendraient polluer le brouillon
//     d'une future creation) ;
//   - ne sauvegarde pas sur RESET_FORM_CONTACT (cette action purge deja le
//     localStorage explicitement dans son reducer).
const wrappedReducer = (state, action) => {
  const newState = createContactSlice.reducer(state, action);

  if (
    action.type !== 'RESET_FORM_CONTACT' &&
    !newState.isModificationMode
  ) {
    localStorage.setItem('contactFormData', JSON.stringify(newState));
  }

  return newState;
};

export default wrappedReducer;
