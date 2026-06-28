// partieSlice.js — SHIM : redirige vers createPartieSlice.js (factory)
// Ce fichier preserve la surface d'API pour tous les importateurs existants.

import { partieCreateReducer, partieCreateTypes, partieCreateActions } from './createPartieSlice';

/* ------------------------------------------------------------------
   Type constants
------------------------------------------------------------------ */
export const SET_PARTIE = partieCreateTypes.SET;
export const DELETE_PARTIE = partieCreateTypes.DELETE;
export const SET_PARTIE_LINK = partieCreateTypes.SET_LINK;
export const DELETE_PARTIE_LINK = partieCreateTypes.DELETE_LINK;
export const DELETE_LINKED_CONTACT = partieCreateTypes.DELETE_CONTACT;
export const DELETE_LINKED_AVOCAT = partieCreateTypes.DELETE_AVOCAT;
export const SET_SHOULD_POPULATE_NAME_FIELDS = partieCreateTypes.SET_POPULATE;
export const TOGGLE_AVOCAT_PROPERTY = partieCreateTypes.TOGGLE_AV;
export const DELETE_LINKED_AVOCAT_ALL_POUR = partieCreateTypes.DEL_AV_POUR;
export const DELETE_LINKED_CONTACT_ALL_POUR = partieCreateTypes.DEL_CT_POUR;
export const SET_PARTIES_LINK_ALL_POUR = partieCreateTypes.SET_LINK_POUR;
export const DELETE_LINKED_AVOCAT_ALL_CONTRE = partieCreateTypes.DEL_AV_CONTRE;
export const DELETE_LINKED_CONTACT_ALL_CONTRE = partieCreateTypes.DEL_CT_CONTRE;
export const SET_PARTIES_LINK_ALL_CONTRE = partieCreateTypes.SET_LINK_CONTRE;
export const UPDATE_LINKED_AVOCATS_FOR_POUR_PARTIES = partieCreateTypes.UPDATE_AV_POUR;
export const RESET_PARTIES = partieCreateTypes.RESET;

/* ------------------------------------------------------------------
   Thunk + Action creators
------------------------------------------------------------------ */
export const setPartie = partieCreateActions.setPartie;
export const setPartieLink = partieCreateActions.setPartieLink;
export const deletePartie = partieCreateActions.deletePartie;
export const deletePartieLink = partieCreateActions.deletePartieLink;
export const deleteLinkedContact = partieCreateActions.deleteLinkedContact;
export const deleteLinkedAvocat = partieCreateActions.deleteLinkedAvocat;
export const setShouldPopulateNameFields = partieCreateActions.setShouldPopulateNameFields;
export const updateLinkedAvocatsForPourParties = partieCreateActions.updateLinkedAvocatsForPourParties;
export const toggleAvocatProperty = partieCreateActions.toggleAvocatProperty;
export const deleteLinkedAvocatAllPour = partieCreateActions.deleteLinkedAvocatAllPour;
export const deleteLinkedContactAllPour = partieCreateActions.deleteLinkedContactAllPour;
export const setPartiesLinkAllPour = partieCreateActions.setPartiesLinkAllPour;
export const deleteLinkedAvocatAllContre = partieCreateActions.deleteLinkedAvocatAllContre;
export const deleteLinkedContactAllContre = partieCreateActions.deleteLinkedContactAllContre;
export const setPartiesLinkAllContre = partieCreateActions.setPartiesLinkAllContre;
export const resetParties = partieCreateActions.resetParties;
export const hydratePartiesFromDossier = partieCreateActions.hydratePartiesFromDossier;

/* ------------------------------------------------------------------
   Default export : wrapped reducer
------------------------------------------------------------------ */
export default partieCreateReducer;
