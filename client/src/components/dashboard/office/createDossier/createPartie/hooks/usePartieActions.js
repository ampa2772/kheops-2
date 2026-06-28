// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_29 - Copie\Kheops_2\client\src\components\dashboard\office\createDossier\createPartie\hooks\usePartieActions.js
import { useMemo } from 'react';

/* Actions "CREATE" */
import {
  setPartie as setPartieCreate,
  deletePartie as deletePartieCreate,
  setPartieLink as setPartieLinkCreate,
  deleteLinkedAvocat as deleteLinkedAvocatCreate,
  deleteLinkedAvocatAllPour as deleteLinkedAvocatAllPourCreate,
  deleteLinkedContactAllPour as deleteLinkedContactAllPourCreate,
  setPartiesLinkAllPour as setPartiesLinkAllPourCreate,
  deleteLinkedAvocatAllContre as deleteLinkedAvocatAllContreCreate,
  deleteLinkedContactAllContre as deleteLinkedContactAllContreCreate,
  setPartiesLinkAllContre as setPartiesLinkAllContreCreate,
  toggleAvocatProperty as toggleAvocatPropertyCreate,
} from '../../../../../../redux/slices/partieSlice';

/* Actions "EDIT" */
import {
  setPartie as setPartieEdit,
  deletePartie as deletePartieEdit,
  setPartieLink as setPartieLinkEdit,
  deleteLinkedAvocat as deleteLinkedAvocatEdit,
  deleteLinkedAvocatAllPour as deleteLinkedAvocatAllPourEdit,
  deleteLinkedContactAllPour as deleteLinkedContactAllPourEdit,
  setPartiesLinkAllPour as setPartiesLinkAllPourEdit,
  deleteLinkedAvocatAllContre as deleteLinkedAvocatAllContreEdit,
  deleteLinkedContactAllContre as deleteLinkedContactAllContreEdit,
  setPartiesLinkAllContre as setPartiesLinkAllContreEdit,
  toggleAvocatProperty as toggleAvocatPropertyEdit,
} from '../../../../../../redux/slices/partieEditSlice';

/**
 * Hook pour obtenir le bon set d'actions Redux pour les parties,
 * en fonction du mode ('create' ou 'edit').
 *
 * @param {'create' | 'edit'} mode - Le mode actuel du composant parent.
 * @returns {object} Un objet contenant les actions Redux appropriées.
 */
export const usePartieActions = (mode) => {
  const isEdit = mode === 'edit';

  const actions = useMemo(() => ({
    setPartie: isEdit ? setPartieEdit : setPartieCreate,
    deletePartie: isEdit ? deletePartieEdit : deletePartieCreate,
    setPartieLink: isEdit ? setPartieLinkEdit : setPartieLinkCreate,
    deleteLinkedAvocat: isEdit ? deleteLinkedAvocatEdit : deleteLinkedAvocatCreate,
    deleteLinkedAvocatAllPour: isEdit ? deleteLinkedAvocatAllPourEdit : deleteLinkedAvocatAllPourCreate,
    deleteLinkedAvocatAllContre: isEdit ? deleteLinkedAvocatAllContreEdit : deleteLinkedAvocatAllContreCreate,
    deleteLinkedContactAllPour: isEdit ? deleteLinkedContactAllPourEdit : deleteLinkedContactAllPourCreate,
    deleteLinkedContactAllContre: isEdit ? deleteLinkedContactAllContreEdit : deleteLinkedContactAllContreCreate,
    setPartiesLinkAllPour: isEdit ? setPartiesLinkAllPourEdit : setPartiesLinkAllPourCreate,
    setPartiesLinkAllContre: isEdit ? setPartiesLinkAllContreEdit : setPartiesLinkAllContreCreate,
    // Note: toggleAvocatProperty est déjà géré dynamiquement dans LinkedAvocatItem,
    // mais on peut l'inclure ici pour cohérence si nécessaire ailleurs.
    // toggleAvocatProperty: isEdit ? toggleAvocatPropertyEdit : toggleAvocatPropertyCreate,
  }), [isEdit]);

  return actions;
};