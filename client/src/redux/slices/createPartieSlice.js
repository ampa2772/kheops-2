// createPartieSlice.js — Factory pour partieSlice + partieEditSlice
// Ces deux slices sont structurellement identiques (~95%) avec des prefixes differents.
// Les quelques divergences sont gerees par des callbacks dans la config.

import { createSlice } from '@reduxjs/toolkit';
import {
  getEntityId,
  hasLawyerRole,
  isLawyerContact,
  normalizeLawyerRoles,
} from '../../utils/partyLinking';

/* ====================================================================
   Helpers partages (identiques entre les deux slices)
   ==================================================================== */

/**
 * Construit le nom d'une partie a partir des donnees du contact.
 */
export const buildPartieNameFromData = (contactData) => {
  if (!contactData) return 'Information manquante';
  if (contactData.raisonSociale) return contactData.raisonSociale;
  if (contactData.denomination) return contactData.denomination;
  const nom = contactData.nom || '';
  const prenoms = contactData.prenoms || '';
  const nomComplet = `${prenoms} ${nom}`.trim();
  return nomComplet || 'Contact non nomme';
};

/**
 * Recalcule isPostulant pour les avocats responsables (Pour).
 */
const recalcResponsablesForPour = (avocatsList) => {
  const hasOtherPostulantNonResponsable = avocatsList.some(
    (av) => !av.fromResponsable && av.isPostulant
  );
  return avocatsList.map((av) =>
    av.fromResponsable
      ? { ...av, isPlaidant: true, isPostulant: !hasOtherPostulantNonResponsable }
      : av
  );
};

/**
 * Construit un objet avocat a partir d'un contact.
 */
const buildAvocatFromContact = (contact) => ({
  _id: contact._id,
  prenomOfficeUser: contact.prenoms,
  nomOfficeUser: contact.nom,
  genre: contact.genre,
  roleOfficeUser: contact.type,
  email: contact.email,
  address: contact.adresse,
  city: contact.ville,
  postalCode: contact.codePostal,
  isAvocat: true,
  ...normalizeLawyerRoles(contact),
  fromResponsable: false,
});

/**
 * Ajoute un lien contact/avocat a une partie (mutatif — Immer).
 */
const addLinkToPartie = (partie, contact) => {
  const contactId = getEntityId(contact);
  if (!contactId) return;

  let linkedContacts = Array.isArray(partie.linkedContacts) ? partie.linkedContacts : [];
  let linkedAvocats = Array.isArray(partie.linkedAvocats) ? partie.linkedAvocats : [];

  if (isLawyerContact(contact)) {
    // Les données historiques sont tolérées à l'hydratation, mais toute
    // nouvelle liaison doit expliciter au moins un rôle.
    if (!hasLawyerRole(contact)) return;
    // Une même personne ne doit jamais exister simultanément dans les deux
    // collections. Les rôles déjà définis sur une partie restent inchangés.
    linkedContacts = linkedContacts.filter((linked) => getEntityId(linked) !== contactId);
    partie.linkedContacts = linkedContacts;
    if (linkedAvocats.some((av) => getEntityId(av) === contactId)) return;

    const newAv = buildAvocatFromContact(contact);
    linkedAvocats.push(newAv);

    if (partie.typePartie === 'Pour' && newAv.isPostulant) {
      for (let i = 0; i < linkedAvocats.length; i++) {
        if (linkedAvocats[i].fromResponsable) {
          linkedAvocats[i].isPlaidant = true;
          linkedAvocats[i].isPostulant = false;
        }
      }
    }

    partie.linkedAvocats = linkedAvocats;
    return;
  }

  // La classification du carnet fait foi : si un ancien lien avocat existe
  // pour cette personne, il est retiré avant de créer le lien contact.
  linkedAvocats = linkedAvocats.filter((linked) => getEntityId(linked) !== contactId);
  partie.linkedAvocats = linkedAvocats;
  if (linkedContacts.some((ct) => getEntityId(ct) === contactId)) return;
  partie.linkedContacts = [...linkedContacts, contact];
};

/* ====================================================================
   Factory
   ==================================================================== */

/**
 * @param {Object} config
 * @param {string} config.prefix          — '' ou 'EDIT_' (prefixe des action types)
 * @param {string} config.sliceName       — 'partieData' ou 'partieEditData'
 * @param {string} config.localStorageKey — 'partieData' ou 'partieEditData'
 * @param {Function} config.getDossierData  — (getState) => dossierData
 * @param {Function} config.getPartiesState — (getState) => state slice
 * @param {string} config.hydrateType        — type string pour hydrate
 * @param {string} config.updatePartieType   — type string pour update partie
 * @param {string[]} config.contactUpdateTypes — types UPDATE_CONTACT_*_SUCCESS
 * @param {Function} [config.onHydrate]      — callback custom pour HYDRATE
 * @param {Function} [config.onContactUpdate] — callback custom pour contact update
 * @param {Function} [config.addExtraCases]  — callback pour ajouter des cases supplementaires
 * @param {string} config.skipPersistType    — type a ne pas persister (HYDRATE ou RESET)
 */
export function createPartieSliceFactory(config) {
  const {
    prefix,
    sliceName,
    localStorageKey,
    getDossierData,
    getPartiesState,
    hydrateType,
    updatePartieType,
    contactUpdateTypes,
    onHydrate,
    onContactUpdate,
    addExtraCases,
    skipPersistType,
  } = config;

  // Type constants
  const SET = `${prefix}SET_PARTIE`;
  const DELETE = `${prefix}DELETE_PARTIE`;
  const SET_LINK = `${prefix}SET_PARTIE_LINK`;
  const DELETE_LINK = `${prefix}DELETE_PARTIE_LINK`;
  const DELETE_CONTACT = `${prefix}DELETE_LINKED_CONTACT`;
  const DELETE_AVOCAT = `${prefix}DELETE_LINKED_AVOCAT`;
  const SET_POPULATE = `${prefix}SET_SHOULD_POPULATE_NAME_FIELDS`;
  const TOGGLE_AV = `${prefix}TOGGLE_AVOCAT_PROPERTY`;
  const DEL_AV_POUR = `${prefix}DELETE_LINKED_AVOCAT_ALL_POUR`;
  const DEL_CT_POUR = `${prefix}DELETE_LINKED_CONTACT_ALL_POUR`;
  const SET_LINK_POUR = `${prefix}SET_PARTIES_LINK_ALL_POUR`;
  const DEL_AV_CONTRE = `${prefix}DELETE_LINKED_AVOCAT_ALL_CONTRE`;
  const DEL_CT_CONTRE = `${prefix}DELETE_LINKED_CONTACT_ALL_CONTRE`;
  const SET_LINK_CONTRE = `${prefix}SET_PARTIES_LINK_ALL_CONTRE`;
  const UPDATE_AV_POUR = `${prefix}UPDATE_LINKED_AVOCATS_FOR_POUR_PARTIES`;
  const RESET = `${prefix}RESET_PARTIES`;

  // Export les constantes pour les re-exports
  const types = {
    SET, DELETE, SET_LINK, DELETE_LINK, DELETE_CONTACT, DELETE_AVOCAT,
    SET_POPULATE, TOGGLE_AV, DEL_AV_POUR, DEL_CT_POUR, SET_LINK_POUR,
    DEL_AV_CONTRE, DEL_CT_CONTRE, SET_LINK_CONTRE, UPDATE_AV_POUR, RESET,
  };

  /* ---------------------------------------------------------------
     Thunk : setPartie
  --------------------------------------------------------------- */
  const setPartie = (typePartie, fullContactData, linkedContacts = [], linkedAvocats = []) => {
    return (dispatch, getState) => {
      console.log(`[${sliceName}-setPartie] Appel avec typePartie:`, typePartie, '| fullContactData:', fullContactData ? { _id: fullContactData._id, raisonSociale: fullContactData.raisonSociale, nom: fullContactData.nom, denomination: fullContactData.denomination } : 'NULL');
      if (!fullContactData || !fullContactData._id) {
        console.error(`[${sliceName}-setPartie] fullContactData ou _id manquant`, fullContactData);
        return;
      }

      const state = getState();
      const dossierData = getDossierData(state);
      const { officeUsers } = state.officeUser;
      const { user } = state.login;
      const partiesState = getPartiesState(state);

      const existing = (partiesState.parties || []).find(p => p.idPartie === fullContactData._id);
      let currentLinkedAvocats = existing?.linkedAvocats || linkedAvocats;

      if (typePartie === 'Pour') {
        let avocatsResponsables = (dossierData.responsables || []).filter(r => r.isAvocat);

        avocatsResponsables = avocatsResponsables.map(av => {
          const office = officeUsers.find(u => u._id === av._id) || {};
          return {
            ...av,
            email: office.email || user?.email || '',
            address: office.address || user?.address || '',
            city: office.city || user?.city || '',
            postalCode: office.postalCode || user?.postalCode || '',
            fromResponsable: true,
          };
        });

        if (avocatsResponsables.length === 0 && user) {
          avocatsResponsables.push({
            _id: user._id,
            prenomOfficeUser: user.firstName,
            nomOfficeUser: user.lastName,
            genre: user.genre,
            roleOfficeUser: 'Avocat',
            mainOfficeUser: true,
            isAvocat: true,
            email: user.email,
            address: user.address,
            city: user.city,
            postalCode: user.postalCode,
            fromResponsable: true,
          });
        }

        const avocatsFromContacts = currentLinkedAvocats.filter(a => !a.fromResponsable);
        const hasPostulant = avocatsFromContacts.some(a => a.isPostulant);
        const adjustedResp = avocatsResponsables.map(a => ({
          ...a,
          isPlaidant: true,
          isPostulant: !hasPostulant,
        }));

        const map = new Map();
        [...avocatsFromContacts, ...adjustedResp].forEach(a => map.set(a._id, a));
        currentLinkedAvocats = Array.from(map.values());
      } else {
        currentLinkedAvocats = currentLinkedAvocats.map(({ fromResponsable, ...rest }) => rest);
      }

      let finalNomPartie = '';
      if (fullContactData.nomPartie?.trim()) finalNomPartie = fullContactData.nomPartie.trim();
      else if (fullContactData.nom && fullContactData.prenoms)
        finalNomPartie = `${fullContactData.nom} ${fullContactData.prenoms}`.trim();
      else if (fullContactData.raisonSociale) finalNomPartie = fullContactData.raisonSociale.trim();
      else if (fullContactData.denomination) finalNomPartie = fullContactData.denomination.trim();
      else finalNomPartie = `Partie ${fullContactData._id.slice(0, 6)}\u2026`;

      console.log(`[${sliceName}-setPartie] finalNomPartie:`, finalNomPartie, '| dispatch SET_PARTIE avec idPartie:', fullContactData._id);
      dispatch({
        type: SET,
        payload: {
          idPartie: fullContactData._id,
          nomPartie: finalNomPartie,
          partieData: (({ _id, nomPartie, ...rest }) => rest)(fullContactData),
          typePartie,
          linkedContacts,
          linkedAvocats: currentLinkedAvocats,
        },
      });
      console.log(`[${sliceName}-setPartie] Dispatch terminé. State parties après:`, getState()[sliceName]?.parties?.length, 'parties');
    };
  };

  /* ---------------------------------------------------------------
     Initial state (hydrated from localStorage)
  --------------------------------------------------------------- */
  const partieDataFromStorage = localStorage.getItem(localStorageKey);
  const defaultState = { parties: [], shouldPopulateNameFields: true };
  const initialState = partieDataFromStorage ? JSON.parse(partieDataFromStorage) : defaultState;

  /* ---------------------------------------------------------------
     Slice
  --------------------------------------------------------------- */
  const slice = createSlice({
    name: sliceName,
    initialState,
    reducers: {},
    extraReducers: (builder) => {
      // SET_PARTIE
      builder.addCase(SET, (state, action) => {
        console.log(`[${sliceName}-reducer SET_PARTIE] Reçu:`, { idPartie: action.payload.idPartie, nomPartie: action.payload.nomPartie, typePartie: action.payload.typePartie });
        const idx = state.parties.findIndex((p) => p.idPartie === action.payload.idPartie);
        if (idx !== -1) {
          state.parties[idx] = { ...state.parties[idx], ...action.payload };
          console.log(`[${sliceName}-reducer SET_PARTIE] Partie existante mise à jour à l'index`, idx);
        } else {
          state.parties.push(action.payload);
          console.log(`[${sliceName}-reducer SET_PARTIE] Nouvelle partie ajoutée. Total parties:`, state.parties.length);
        }
      });

      // DELETE_PARTIE
      builder.addCase(DELETE, (state, action) => {
        state.parties = state.parties.filter((p) => p.idPartie !== action.payload);
      });

      // SET_PARTIE_LINK
      builder.addCase(SET_LINK, (state, action) => {
        const partie = state.parties.find((p) => p.idPartie === action.payload.idPartie);
        if (!partie) return;
        addLinkToPartie(partie, action.payload.contact);
      });

      // DELETE_PARTIE_LINK
      builder.addCase(DELETE_LINK, (state, action) => {
        const partie = state.parties.find((p) => p.idPartie === action.payload.idPartie);
        if (!partie) return;
        partie.linkedContacts = (partie.linkedContacts || []).filter(
          (c) => c._id !== action.payload.contactId
        );
      });

      // DELETE_LINKED_CONTACT (same shape)
      if (DELETE_CONTACT !== DELETE_LINK) {
        builder.addCase(DELETE_CONTACT, (state, action) => {
          const partie = state.parties.find((p) => p.idPartie === action.payload.idPartie);
          if (!partie) return;
          partie.linkedContacts = (partie.linkedContacts || []).filter(
            (c) => c._id !== action.payload.contactId
          );
        });
      }

      // DELETE_LINKED_AVOCAT
      builder.addCase(DELETE_AVOCAT, (state, action) => {
        const partie = state.parties.find((p) => p.idPartie === action.payload.idPartie);
        if (!partie) return;
        partie.linkedAvocats = (partie.linkedAvocats || []).filter(
          (av) => av._id !== action.payload.avocatId
        );
        if (partie.typePartie === 'Pour') {
          partie.linkedAvocats = recalcResponsablesForPour(partie.linkedAvocats);
        }
      });

      // UPDATE_LINKED_AVOCATS_FOR_POUR_PARTIES
      // rc69 : préserve isPlaidant/isPostulant des avocats fromResponsable
      // déjà présents (sinon ce reducer écrasait le toggle utilisateur en
      // mode création — bug signalé sur la modale liens partie).
      builder.addCase(UPDATE_AV_POUR, (state, action) => {
        state.parties.forEach((p) => {
          if (p.typePartie !== 'Pour') return;

          const existingFromResp = (p.linkedAvocats || []).filter((a) => a.fromResponsable);
          const fromContacts = (p.linkedAvocats || []).filter((a) => !a.fromResponsable);
          const hasPost = fromContacts.some((a) => a.isPostulant);

          const adjusted = action.payload.map((a) => {
            // Si cet avocat fromResponsable était déjà dans la partie,
            // on préserve son isPlaidant/isPostulant (toggle utilisateur).
            const existing = existingFromResp.find((e) => e._id === a._id);
            return {
              ...a,
              fromResponsable: true,
              isPlaidant: existing ? existing.isPlaidant : true,
              isPostulant: existing ? existing.isPostulant : !hasPost,
            };
          });

          const map = new Map();
          fromContacts.forEach((a) => map.set(a._id, a));
          adjusted.forEach((a) => map.set(a._id, a));
          p.linkedAvocats = Array.from(map.values());
        });
      });

      // TOGGLE_AVOCAT_PROPERTY
      builder.addCase(TOGGLE_AV, (state, action) => {
        const partie = state.parties.find((p) => p.idPartie === action.payload.idPartie);
        if (!partie) return;

        const avocats = partie.linkedAvocats || [];
        const av = avocats.find((a) => a._id === action.payload.avocatId);
        if (!av) return;

        av[action.payload.property] = !av[action.payload.property];

        // Pour partieEdit: recalc responsables quand isPostulant est toggle
        if (partie.typePartie === 'Pour' && action.payload.property === 'isPostulant') {
          if (!av.fromResponsable) {
            const hasOtherPostulantNonResponsable = avocats.some(
              (a) => a._id !== av._id && !a.fromResponsable && a.isPostulant
            );
            avocats.forEach((a) => {
              if (a.fromResponsable) {
                a.isPlaidant = true;
                a.isPostulant = !hasOtherPostulantNonResponsable && !av.isPostulant;
              }
            });
          }
        }
      });

      // SET_SHOULD_POPULATE_NAME_FIELDS
      builder.addCase(SET_POPULATE, (state, action) => {
        state.shouldPopulateNameFields = action.payload;
      });

      // UPDATE_PARTIE
      builder.addCase(updatePartieType, (state, action) => {
        const { idPartie, updatedData } = action.payload;
        const partie = state.parties.find((p) => p.idPartie === idPartie);
        if (partie) Object.assign(partie, updatedData);
      });

      // RESET_PARTIES
      builder.addCase(RESET, (state) => {
        localStorage.removeItem(localStorageKey);
        state.parties = [];
        state.shouldPopulateNameFields = true;
      });

      // HYDRATE (doit être avant les addMatcher — règle Redux Toolkit)
      builder.addCase(hydrateType, onHydrate || ((state, action) => {
        const { pourParties, contreParties } = action.payload;
        return {
          ...state,
          parties: [
            ...pourParties.map((p) => ({ ...p, typePartie: 'Pour' })),
            ...contreParties.map((p) => ({ ...p, typePartie: 'Contre' })),
          ],
        };
      }));

      // Cases supplementaires (specifiques a un slice) — doit être avant les addMatcher
      if (addExtraCases) addExtraCases(builder);

      // SET_PARTIES_LINK_ALL_POUR / SET_PARTIES_LINK_ALL_CONTRE
      builder.addMatcher(
        (action) => action.type === SET_LINK_POUR || action.type === SET_LINK_CONTRE,
        (state, action) => {
          const targetSide = action.type === SET_LINK_POUR ? 'Pour' : 'Contre';
          const contact = action.payload.contact || action.payload;
          if (!contact || !contact._id) return;

          state.parties.forEach((p) => {
            if (p.typePartie !== targetSide) return;
            addLinkToPartie(p, contact);
          });
        }
      );

      // DELETE_LINKED_AVOCAT_ALL_POUR / DELETE_LINKED_AVOCAT_ALL_CONTRE
      builder.addMatcher(
        (action) => action.type === DEL_AV_POUR || action.type === DEL_AV_CONTRE,
        (state, action) => {
          const side = action.type === DEL_AV_POUR ? 'Pour' : 'Contre';

          state.parties.forEach((p) => {
            if (p.typePartie !== side) return;
            p.linkedAvocats = (p.linkedAvocats || []).filter(
              (av) => av._id !== action.payload.avocatId
            );
            if (side === 'Pour') {
              p.linkedAvocats = recalcResponsablesForPour(p.linkedAvocats);
            }
          });
        }
      );

      // DELETE_LINKED_CONTACT_ALL_POUR / DELETE_LINKED_CONTACT_ALL_CONTRE
      builder.addMatcher(
        (action) => action.type === DEL_CT_POUR || action.type === DEL_CT_CONTRE,
        (state, action) => {
          const side = action.type === DEL_CT_POUR ? 'Pour' : 'Contre';

          state.parties.forEach((p) => {
            if (p.typePartie !== side) return;
            p.linkedContacts = (p.linkedContacts || []).filter(
              (c) => String(c._id ?? '') !== String(action.payload.contactId ?? '')
            );
          });
        }
      );

      // UPDATE_CONTACT_*_SUCCESS — contact update propagation
      builder.addMatcher(
        (action) => contactUpdateTypes.includes(action.type),
        onContactUpdate || ((state, action) => {
          const updated = action.payload;
          state.parties.forEach((p) => {
            if (p.linkedContacts) {
              p.linkedContacts = p.linkedContacts.map((c) =>
                c._id === updated._id ? updated : c
              );
            }
            if (
              updated.pro_contact &&
              (updated.type === 'Avocat' || updated.type === 'Avocate') &&
              p.linkedAvocats
            ) {
              p.linkedAvocats = p.linkedAvocats.map((av) =>
                av._id === updated._id
                  ? {
                      ...av,
                      prenomOfficeUser: updated.prenoms,
                      nomOfficeUser: updated.nom,
                    }
                  : av
              );
            }
          });
        })
      );
    },
  });

  /* ---------------------------------------------------------------
     Wrapper : persistance localStorage
  --------------------------------------------------------------- */
  const wrappedReducer = (state, action) => {
    const nextState = slice.reducer(state, action);
    if (action.type !== skipPersistType) {
      localStorage.setItem(localStorageKey, JSON.stringify(nextState));
    }
    return nextState;
  };

  /* ---------------------------------------------------------------
     Action creators
  --------------------------------------------------------------- */
  const actionCreators = {
    setPartie,
    setPartieLink: (idPartie, contact) => ({ type: SET_LINK, payload: { idPartie, contact } }),
    deletePartie: (idPartie) => ({ type: DELETE, payload: idPartie }),
    deletePartieLink: (idPartie, contactId) => ({ type: DELETE_LINK, payload: { idPartie, contactId } }),
    deleteLinkedContact: (idPartie, contactId) => ({ type: DELETE_CONTACT, payload: { idPartie, contactId } }),
    deleteLinkedAvocat: (idPartie, avocatId) => ({ type: DELETE_AVOCAT, payload: { idPartie, avocatId } }),
    setShouldPopulateNameFields: (bool) => ({ type: SET_POPULATE, payload: bool }),
    updateLinkedAvocatsForPourParties: (linkedAvocats) => ({ type: UPDATE_AV_POUR, payload: linkedAvocats }),
    toggleAvocatProperty: (idPartie, avocatId, property) => ({ type: TOGGLE_AV, payload: { idPartie, avocatId, property } }),
    deleteLinkedAvocatAllPour: (avocatId) => ({ type: DEL_AV_POUR, payload: { avocatId } }),
    deleteLinkedContactAllPour: (contactOrId) => ({ type: DEL_CT_POUR, payload: { contactId: contactOrId?._id ?? contactOrId } }),
    setPartiesLinkAllPour: (contactData) => ({ type: SET_LINK_POUR, payload: contactData }),
    deleteLinkedAvocatAllContre: (avocatId) => ({ type: DEL_AV_CONTRE, payload: { avocatId } }),
    deleteLinkedContactAllContre: (contactOrId) => ({ type: DEL_CT_CONTRE, payload: { contactId: contactOrId?._id ?? contactOrId } }),
    setPartiesLinkAllContre: (contactData) => ({ type: SET_LINK_CONTRE, payload: contactData }),
    resetParties: () => ({ type: RESET }),
    hydratePartiesFromDossier: (pourParties, contreParties) => ({
      type: hydrateType,
      payload: { pourParties, contreParties },
    }),
  };

  return { types, wrappedReducer, actionCreators, slice };
}

/* ====================================================================
   Instance 1 : partieSlice (mode creation)
   ==================================================================== */

const partieCreate = createPartieSliceFactory({
  prefix: '',
  sliceName: 'partieData',
  localStorageKey: 'partieData',
  getDossierData: (state) => state.dossierInfos?.dossierData || {},
  getPartiesState: (state) => state.partieData,
  hydrateType: 'HYDRATE_PARTIES_FROM_DOSSIER',
  updatePartieType: 'UPDATE_PARTIE',
  contactUpdateTypes: [
    'UPDATE_CONTACT_SUCCESS',
    'UPDATE_CONTACT_PM_SUCCESS',
    'UPDATE_CONTACT_PM_PUBLIQUE_SUCCESS',
  ],
  skipPersistType: 'HYDRATE_PARTIES_FROM_DOSSIER',
});

export const partieCreateReducer = partieCreate.wrappedReducer;
export const partieCreateTypes = partieCreate.types;
export const partieCreateActions = partieCreate.actionCreators;

/* ====================================================================
   Instance 2 : partieEditSlice (mode edition)
   ==================================================================== */

const partieEdit = createPartieSliceFactory({
  prefix: 'EDIT_',
  sliceName: 'partieEditData',
  localStorageKey: 'partieEditData',
  getDossierData: (state) => state.currentDossier?.dossier || {},
  getPartiesState: (state) => state.partieEditData,
  hydrateType: 'HYDRATE_EDIT_PARTIES_FROM_DOSSIER',
  updatePartieType: 'EDIT_UPDATE_PARTIE',
  contactUpdateTypes: [
    'UPDATE_CONTACT_SUCCESS',
    'UPDATE_CONTACT_PM_SUCCESS',
    'UPDATE_CONTACT_PM_PUBLIQUE_SUCCESS',
    'EDIT_UPDATE_CONTACT_SUCCESS',
    'EDIT_UPDATE_CONTACT_PM_SUCCESS',
    'EDIT_UPDATE_CONTACT_PM_PUBLIQUE_SUCCESS',
  ],
  skipPersistType: 'EDIT_RESET_PARTIES',

  // Contact update propagation plus detaillee pour le mode edit
  onContactUpdate: (state, action) => {
    const updated = action.payload;

    state.parties.forEach((p) => {
      // Update partieData if idPartie matches
      if (p.idPartie === updated._id) {
        const { _id, ...contactDetailsSansId } = updated;
        p.partieData = { ...p.partieData, ...contactDetailsSansId };
      }

      // Update in linkedContacts
      if (p.linkedContacts) {
        p.linkedContacts = p.linkedContacts.map((c) =>
          c._id === updated._id ? updated : c
        );
      }

      // Update in linkedAvocats (if avocat)
      if (
        updated.pro_contact &&
        (updated.type === 'Avocat' || updated.type === 'Avocate') &&
        p.linkedAvocats
      ) {
        p.linkedAvocats = p.linkedAvocats.map((av) =>
          av._id === updated._id
            ? {
                ...av,
                prenomOfficeUser: updated.prenoms,
                nomOfficeUser: updated.nom,
                genre: updated.genre,
                roleOfficeUser: updated.type,
                email: updated.email,
                address: updated.adresse,
                city: updated.ville,
                postalCode: updated.codePostal,
              }
            : av
        );
      }
    });
  },

  // Hydrate edit avec normalizePartie
  onHydrate: (state, action) => {
    const { pourParties, contreParties } = action.payload || {};
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;

    const normalizePartie = (partieSchemaDB, side) => {
      let finalIdPartie;
      let finalPartieData = {};

      if (
        partieSchemaDB.partieData &&
        partieSchemaDB.partieData._id &&
        objectIdRegex.test(partieSchemaDB.partieData._id)
      ) {
        finalIdPartie = partieSchemaDB.partieData._id.toString();
        const { _id, ...details } = partieSchemaDB.partieData;
        finalPartieData = details;
      } else if (partieSchemaDB.idPartie && objectIdRegex.test(partieSchemaDB.idPartie)) {
        finalIdPartie = partieSchemaDB.idPartie.toString();
        if (partieSchemaDB.partieData) {
          const { _id, ...details } = partieSchemaDB.partieData;
          finalPartieData = details;
        } else {
          console.warn(
            `[partieEditSlice normalizePartie] idPartie ${finalIdPartie} valide mais partieData manquant pour ${partieSchemaDB.nomPartie}`
          );
          finalPartieData = {};
        }
      } else {
        finalIdPartie =
          partieSchemaDB.idPartie ||
          `error-orphaned-partie-${Math.random().toString(36).substr(2, 9)}`;
        finalPartieData = {};
        if (!partieSchemaDB.idPartie || !partieSchemaDB.idPartie.startsWith('error-')) {
          console.warn(
            `[partieEditSlice normalizePartie] idPartie invalide ou partieData manquant pour ${partieSchemaDB.nomPartie}. idPartie utilise: ${finalIdPartie}`
          );
        }
      }

      return {
        idPartie: finalIdPartie,
        nomPartie: partieSchemaDB.nomPartie || 'Partie sans nom',
        partieData: finalPartieData,
        typePartie: side,
        linkedAvocats: partieSchemaDB.avocats || [],
        linkedContacts: partieSchemaDB.contacts || [],
      };
    };

    const newPourParties = Array.isArray(pourParties)
      ? pourParties.map((p) => normalizePartie(p, 'Pour'))
      : [];
    const newContreParties = Array.isArray(contreParties)
      ? contreParties.map((p) => normalizePartie(p, 'Contre'))
      : [];

    state.parties = [...newPourParties, ...newContreParties];
    state.shouldPopulateNameFields = false;
  },

  // Case supplementaire : UPDATE_ENTITY_IN_DOSSIER_SUCCESS
  addExtraCases: (builder) => {
    builder.addCase('UPDATE_ENTITY_IN_DOSSIER_SUCCESS', (state, action) => {
      const { updatedEntity } = action.payload;
      if (!updatedEntity || !updatedEntity._id) return;

      state.parties.forEach((partie) => {
        // 1. If the updated contact IS the partie itself
        if (partie.idPartie === updatedEntity._id) {
          const { _id, __v, ...detailsToUpdate } = updatedEntity;
          partie.partieData = { ...partie.partieData, ...detailsToUpdate };
          partie.nomPartie = buildPartieNameFromData(partie.partieData);
        }

        // 2. Update in linkedContacts
        if (partie.linkedContacts) {
          partie.linkedContacts = partie.linkedContacts.map((lc) =>
            lc._id === updatedEntity._id ? { ...lc, ...updatedEntity } : lc
          );
        }

        // 3. Update in linkedAvocats
        if (partie.linkedAvocats) {
          partie.linkedAvocats = partie.linkedAvocats.map((la) => {
            if (la._id === updatedEntity._id) {
              const { _id, __v, ...detailsToUpdate } = updatedEntity;
              return {
                ...la,
                nom: detailsToUpdate.nom,
                prenoms: detailsToUpdate.prenoms,
                email: detailsToUpdate.email,
                adresse: detailsToUpdate.adresse,
                ville: detailsToUpdate.ville,
                codePostal: detailsToUpdate.codePostal,
                telephone: detailsToUpdate.telephone,
                type: detailsToUpdate.type,
                nomOfficeUser: detailsToUpdate.nom,
                prenomOfficeUser: detailsToUpdate.prenoms,
              };
            }
            return la;
          });
        }
      });
    });
  },
});

export const partieEditReducer = partieEdit.wrappedReducer;
export const partieEditTypes = partieEdit.types;
export const partieEditActions = partieEdit.actionCreators;
