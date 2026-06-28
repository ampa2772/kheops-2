// LinkedDossierContactItem.js

import React, { useMemo } from 'react';
import { getInitials, formatProContact } from '../createPartie/fonctions';
import modifier from '../../../../../assets/modifier.svg';
import supprimerLogoPath from '../../../../../assets/supprimer_responsable.svg';
import modifier_navy from '../../../../../assets/modifier_navy.svg';
import supprimerLogoPath_navy from '../../../../../assets/supprimer_responsable_navy.svg';
import Modal from '../createPartie/Modal';
import CreateContact from '../../createContact';

import { deleteSelectedContact } from '../../../../../redux/slices/dossierInfoSlice';

import useLinkedItemActions from '../createPartie/useLinkedItemActions';

const LinkedDossierContactItem = ({ contact }) => {
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

  const handleDeleteContact = () => {
    dispatch(deleteSelectedContact(contact._id));
  };

 // Nouveau code
  // Objet fromCreatePartie pour un contact lié directement au dossier
  const fromCreatePartie = useMemo(() => {
    const obj = {
      mode: 'edit', // Indispensable pour que updateContact déclenche fetchCurrentDossier après sauvegarde
      fromCreatePartieForPartie: {
        isTransformedToPartie: false,
        typePartie: null,
      },
      fromCreatePartiesForLink: {
        isLinkedToPartiesGroup: false,
        isLinkedToSinglePartie: false,
        isLinkedToDossier: true, // Ce contact est lié directement au dossier
        linkedPartieId: null,
        linkedGroupType: null,
      },
      modificationInfo: {
        isModification: true,
        contactId: contact._id, // ID du contact à modifier
        linkedPartieId: null,
        dossierParentId: dossierIdFromStore, // ID du dossier global
      },
    };
    return obj;
  }, [contact._id, dossierIdFromStore]);

  return (
    <div className="container_initialesOptions">
      <div className="linkedContact">
        <div className="linkedContactName">{formatProContact(contact)}</div>
        <div className="OptionsLinkedContact" onClick={handleOptionsClick}>
          {!isOptionsOpen ? (
            <div className="initials-icon_linkedContact">
              {getInitials(formatProContact(contact))}
            </div>
          ) : (
            <div className="modif-suppr-options" ref={optionsRef} onClick={(e) => e.stopPropagation()}>
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
              <div
                className="deleteLinkContact"
                onClick={handleDeleteContact}
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

      {/* Modal de modification */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        fromModif={true}
      >
        <CreateContact
          fromCreatePartie={fromCreatePartie}
        />
      </Modal>
    </div>
  );
};

export default LinkedDossierContactItem;
