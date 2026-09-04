// partieEditSlice.js — SHIM : redirige vers createPartieSlice.js (factory)
// Ce fichier preserve la surface d'API pour tous les importateurs existants.

import { partieEditReducer, partieEditTypes, partieEditActions } from './createPartieSlice';

/* ------------------------------------------------------------------
   Type constants
------------------------------------------------------------------ */
export const EDIT_SET_PARTIE = partieEditTypes.SET;
export const EDIT_DELETE_PARTIE = partieEditTypes.DELETE;
export const EDIT_SET_PARTIE_LINK = partieEditTypes.SET_LINK;
export const EDIT_DELETE_PARTIE_LINK = partieEditTypes.DELETE_LINK;
export const EDIT_DELETE_LINKED_CONTACT = partieEditTypes.DELETE_CONTACT;
export const EDIT_DELETE_LINKED_AVOCAT = partieEditTypes.DELETE_AVOCAT;
export const EDIT_SET_SHOULD_POPULATE_NAME_FIELDS = partieEditTypes.SET_POPULATE;
export const EDIT_TOGGLE_AVOCAT_PROPERTY = partieEditTypes.TOGGLE_AV;
export const EDIT_DELETE_LINKED_AVOCAT_ALL_POUR = partieEditTypes.DEL_AV_POUR;
export const EDIT_DELETE_LINKED_CONTACT_ALL_POUR = partieEditTypes.DEL_CT_POUR;
export const EDIT_SET_PARTIES_LINK_ALL_POUR = partieEditTypes.SET_LINK_POUR;
export const EDIT_DELETE_LINKED_AVOCAT_ALL_CONTRE = partieEditTypes.DEL_AV_CONTRE;
export const EDIT_DELETE_LINKED_CONTACT_ALL_CONTRE = partieEditTypes.DEL_CT_CONTRE;
export const EDIT_SET_PARTIES_LINK_ALL_CONTRE = partieEditTypes.SET_LINK_CONTRE;
export const EDIT_UPDATE_LINKED_AVOCATS_FOR_POUR_PARTIES = partieEditTypes.UPDATE_AV_POUR;
export const EDIT_SYNC_PARTIE_RELATIONS = partieEditTypes.SYNC_RELATIONS;
export const EDIT_RESET_PARTIES = partieEditTypes.RESET;

/* ------------------------------------------------------------------
   Thunk + Action creators
------------------------------------------------------------------ */
export const setPartie = partieEditActions.setPartie;
export const setPartieLink = partieEditActions.setPartieLink;
export const deletePartie = partieEditActions.deletePartie;
export const deletePartieLink = partieEditActions.deletePartieLink;
export const deleteLinkedContact = partieEditActions.deleteLinkedContact;
export const deleteLinkedAvocat = partieEditActions.deleteLinkedAvocat;
export const setShouldPopulateNameFields = partieEditActions.setShouldPopulateNameFields;
export const updateLinkedAvocatsForPourParties = partieEditActions.updateLinkedAvocatsForPourParties;
export const toggleAvocatProperty = partieEditActions.toggleAvocatProperty;
export const syncPartieRelations = partieEditActions.syncPartieRelations;
export const deleteLinkedAvocatAllPour = partieEditActions.deleteLinkedAvocatAllPour;
export const deleteLinkedContactAllPour = partieEditActions.deleteLinkedContactAllPour;
export const setPartiesLinkAllPour = partieEditActions.setPartiesLinkAllPour;
export const deleteLinkedAvocatAllContre = partieEditActions.deleteLinkedAvocatAllContre;
export const deleteLinkedContactAllContre = partieEditActions.deleteLinkedContactAllContre;
export const setPartiesLinkAllContre = partieEditActions.setPartiesLinkAllContre;
export const resetParties = partieEditActions.resetParties;
export const hydratePartiesFromDossier = partieEditActions.hydratePartiesFromDossier;

/* ------------------------------------------------------------------
   Default export : wrapped reducer
------------------------------------------------------------------ */
export default partieEditReducer;
