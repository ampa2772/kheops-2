import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  updateSelectedEntityInDossier,
  UPDATE_CURRENT_DOSSIER_SUCCESS,
} from '../../../../../../redux/slices/currentDossierSlice';
import apiClient from '../../../../../../services/apiClient';
import { detectEntityType } from './ariaFieldConfig';

/**
 * useAriaInlineEdit
 *
 * Hook qui gere la sauvegarde d'un champ inline.
 * Appelle l'API existante updateSelectedEntityInDossier pour :
 * 1. Mettre a jour le contact en base
 * 2. Propager les modifications dans tous les dossiers embarques
 * 3. Mettre a jour le store Redux (dossier courant rafraichi automatiquement)
 *
 * Expose aussi des operations CRUD pour les personnes a charge :
 *  - addPersonneCharge(contactId, pcData)
 *  - updatePersonneChargeField(pcId, fieldKey, value)
 *  - deletePersonneCharge(pcId)
 *
 * @param {string} dossierId - L'ID du dossier courant
 */
export const useAriaInlineEdit = (dossierId) => {
  const dispatch = useDispatch();
  const token = useSelector((state) => state.login.token);

  // Track quels champs sont en cours de sauvegarde { "entityId:fieldKey": true }
  const [savingFields, setSavingFields] = useState({});

  const saveField = useCallback(async (entityId, entityData, fieldKey, newValue) => {
    if (!entityId || !token || !dossierId) {
      console.warn('[useAriaInlineEdit] Donnees manquantes pour la sauvegarde:', { entityId, token: !!token, dossierId });
      throw new Error('Donnees manquantes pour la sauvegarde');
    }

    const savingKey = `${entityId}:${fieldKey}`;
    setSavingFields((prev) => ({ ...prev, [savingKey]: true }));

    try {
      const entityType = detectEntityType(entityData);
      const updatedData = { [fieldKey]: newValue };
      await dispatch(updateSelectedEntityInDossier(entityId, entityType, updatedData, token, dossierId));
    } catch (error) {
      console.error(`[useAriaInlineEdit] Erreur sauvegarde "${fieldKey}":`, error);
      throw error;
    } finally {
      setSavingFields((prev) => {
        const next = { ...prev };
        delete next[savingKey];
        return next;
      });
    }
  }, [dispatch, token, dossierId]);

  const isFieldSaving = useCallback((entityId, fieldKey) => {
    return !!savingFields[`${entityId}:${fieldKey}`];
  }, [savingFields]);

  // ====================================================================
  // Operations CRUD pour les personnes a charge (utilise routes inline)
  // ====================================================================

  const refreshDossier = useCallback((updatedDossier) => {
    if (updatedDossier) {
      // Le serveur retourne le dossier brut (lean), on l'enveloppe pour
      // matcher la structure attendue par UPDATE_CURRENT_DOSSIER_SUCCESS.
      dispatch({ type: UPDATE_CURRENT_DOSSIER_SUCCESS, payload: updatedDossier });
    }
  }, [dispatch]);

  const addPersonneCharge = useCallback(async (contactId, pcData) => {
    if (!contactId) throw new Error('contactId requis');
    const savingKey = `${contactId}:__add_pc__`;
    setSavingFields((prev) => ({ ...prev, [savingKey]: true }));
    try {
      const res = await apiClient.post(
        `/api/folder/contact/${contactId}/personne-charge`,
        { personneCharge: pcData, dossierId }
      );
      refreshDossier(res.data?.updatedDossier);
      return res.data?.personneCharge;
    } finally {
      setSavingFields((prev) => {
        const next = { ...prev };
        delete next[savingKey];
        return next;
      });
    }
  }, [dossierId, refreshDossier]);

  const updatePersonneChargeField = useCallback(async (pcId, fieldKey, value) => {
    if (!pcId) throw new Error('pcId requis');
    const savingKey = `${pcId}:${fieldKey}`;
    setSavingFields((prev) => ({ ...prev, [savingKey]: true }));
    try {
      const res = await apiClient.put(
        `/api/folder/personne-charge/${pcId}`,
        { data: { [fieldKey]: value }, dossierId }
      );
      refreshDossier(res.data?.updatedDossier);
      return res.data?.personneCharge;
    } finally {
      setSavingFields((prev) => {
        const next = { ...prev };
        delete next[savingKey];
        return next;
      });
    }
  }, [dossierId, refreshDossier]);

  const deletePersonneCharge = useCallback(async (pcId) => {
    if (!pcId) throw new Error('pcId requis');
    const savingKey = `${pcId}:__delete_pc__`;
    setSavingFields((prev) => ({ ...prev, [savingKey]: true }));
    try {
      const res = await apiClient.delete(
        `/api/folder/personne-charge/${pcId}`,
        { params: { dossierId } }
      );
      refreshDossier(res.data?.updatedDossier);
      return true;
    } finally {
      setSavingFields((prev) => {
        const next = { ...prev };
        delete next[savingKey];
        return next;
      });
    }
  }, [dossierId, refreshDossier]);

  return {
    saveField,
    isFieldSaving,
    addPersonneCharge,
    updatePersonneChargeField,
    deletePersonneCharge,
  };
};
