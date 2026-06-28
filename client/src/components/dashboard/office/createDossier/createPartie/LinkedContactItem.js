// File: C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_38\Kheops_2\client\src\components\dashboard\office\createDossier\createPartie\LinkedContactItem.js
// LinkedContactItem.js

import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  getInitials,
  formatProContact,
} from './fonctions';

/* ---------- actions "CREATE" (workflow création) ---------- */
import {
  deletePartieLink as deletePartieLinkCreate,
} from '../../../../../redux/slices/partieSlice';

/* ---------- actions "EDIT" (workflow modification) --------- */
import {
  deletePartieLink as deletePartieLinkEdit,
} from '../../../../../redux/slices/partieEditSlice';

import modifier from '../../../../../assets/modifier.svg';
import supprimerLogoPath from '../../../../../assets/supprimer_responsable.svg';
import modifier_navy from '../../../../../assets/modifier_navy.svg';
import supprimerLogoPath_navy from '../../../../../assets/supprimer_responsable_navy.svg';

import Modal from './Modal';
import CreateContact from '../../createContact';

import useLinkedItemActions from './useLinkedItemActions';
import { removeLinkedContactFromParty } from '../../../../../redux/slices/currentDossierSlice';

/* ------------------------------------------------------------------ */
/* Hook : choisit dynamiquement l'action adéquate (create / edit)      */
/* ------------------------------------------------------------------ */
const useDeletePartieLink = (partieId) => {
  const isEdit = useSelector((s) =>
    (s.partieEditData?.parties || []).some((p) => p.idPartie === partieId)
  );
  return isEdit ? deletePartieLinkEdit : deletePartieLinkCreate;
};

// Nouveau code
/* ------------------------------------------------------------------ */
/* Composant                                                            */
/* ------------------------------------------------------------------ */
const LinkedContactItem = ({
  contact,
  partieId = null,                 /* idPartie pour le cas "single"          */
  handleDeleteLinkedContact = null, /* fonction custom (allPour / allContre)  */
  groupContextType = null, // Nouvelle prop pour le contexte de groupe
}) => {
  const {
    dispatch,
    optionsRef,
    isOptionsOpen,
    handleOptionsClick,
    isModifierHovered,
    setIsModifierHovered,
    isSupprimerHovered,
    setIsSupprimerHovered,
    isModalOpen,
    handleModifierClick,
    handleCloseModal,
    dossierIdFromStore,
  } = useLinkedItemActions(contact._id);

  const deletePartieLink = useDeletePartieLink(partieId); /* alias dynamique */

  /* ----- handlers ----- */
  const handleDelete = () => {
    if (typeof handleDeleteLinkedContact === 'function') {
      /* groupe (allPour / allContre) — auto-save géré dans CreatePartie/index.js */
      handleDeleteLinkedContact(contact._id);
    } else if (partieId) {
      /* single partie */
      dispatch(deletePartieLink(partieId, contact._id));
      // Auto-save en base en mode edit
      if (dossierIdFromStore) {
        dispatch(removeLinkedContactFromParty(dossierIdFromStore, partieId, contact._id, false));
      }
    }
  };

// Nouveau code
  /* ----- fromCreatePartie (mémo) ----- */
  const fromCreatePartie = useMemo(
    () => {
      const isGroupLink = !partieId && !!handleDeleteLinkedContact && !!groupContextType;
      return {
        mode: 'edit', // Indispensable pour que updateContact déclenche fetchCurrentDossier après sauvegarde
        fromCreatePartieForPartie: {
          isTransformedToPartie: false,
          typePartie: null,
        },
        fromCreatePartiesForLink: {
          isLinkedToPartiesGroup: isGroupLink,
          isLinkedToSinglePartie: !!partieId && !isGroupLink,
          isLinkedToDossier: false,
          linkedPartieId: partieId,
          linkedGroupType: isGroupLink ? groupContextType : null,
        },
        modificationInfo: {
          isModification: true,
          contactId: contact._id,
          linkedPartieId: partieId,
          dossierParentId: dossierIdFromStore, // ID du dossier global
        },
      };
    },
    [contact._id, partieId, handleDeleteLinkedContact, groupContextType, dossierIdFromStore]
  );

  /* ------------------------------------------------------------------ */
  /* RENDER                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <div className="container_initialesOptions">
      <div className="linkedContact">
        <div className="linkedContactName">
          {formatProContact(contact)}
        </div>

        {/* ====== icône / options ====== */}
        <div className="OptionsLinkedContact" onClick={handleOptionsClick}>
          {!isOptionsOpen ? (
            <div className="initials-icon_linkedContact">
              {getInitials(formatProContact(contact))}
            </div>
          ) : (
            <div
              className="modif-suppr-options"
              ref={optionsRef}
              onClick={(e) => e.stopPropagation()}
            >
              {/* ----- modifier ----- */}
              <div
                className="modifLinkContact"
                onClick={handleModifierClick}
                onMouseEnter={() => setIsModifierHovered(true)}
                onMouseLeave={() => setIsModifierHovered(false)}
              >
                <img
                  src={isModifierHovered ? modifier_navy : modifier}
                  alt="Modifier"
                  className="k-icon-sm"
                />
              </div>

              {/* ----- supprimer ----- */}
              <div
                className="deleteLinkContact"
                onClick={handleDelete}
                onMouseEnter={() => setIsSupprimerHovered(true)}
                onMouseLeave={() => setIsSupprimerHovered(false)}
              >
                <img
                  src={isSupprimerHovered ? supprimerLogoPath_navy : supprimerLogoPath}
                  alt="Supprimer"
                  className="k-icon-sm"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====== modal de modification ====== */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        fromModif={true}
      >
        <CreateContact fromCreatePartie={fromCreatePartie} />
      </Modal>
    </div>
  );
};

export default LinkedContactItem;
