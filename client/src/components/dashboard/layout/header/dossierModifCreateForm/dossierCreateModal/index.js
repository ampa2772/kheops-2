import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  closeCreateModal,
  openEmailComposeModal,
  openDocumentCreateModal,
} from '../../../../../../redux/slices/layoutSlice';
import { setResponsables, resetDossier } from '../../../../../../redux/slices/dossierInfoSlice';

import BaseModal from '../../../../../common/BaseModal';
import CreateOptionCard from './CreateOptionCard';
import HoverToSpeak from '../../../../../common/HoverToSpeak';

import DossierIcon from '../../../../../../assets/dossier-create.svg';
import ContactIcon from '../../../../../../assets/utilisateur-create.svg';
import EmailIcon from '../../../../../../assets/envoyer-un-mail.svg';
import DocumentIcon from '../../../../../../assets/fichier.svg';

import './createModal.css';

/**
 * CreateModal — Menu "Creer un nouveau..." avec 4 options premium.
 *
 * Affiche une grille 2x2 de cartes :
 *   - Dossier  : navigue vers /dashboard/createDossier/step1
 *   - Contact  : navigue vers /dashboard/createContact
 *   - Mail     : ouvre EmailComposeModal
 *   - Document : ouvre DocumentCreateModal
 */
const CreateModal = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const currentOfficeUser = useSelector(state => state.officeUser.officeUser);
  const officeUsers = useSelector(state => state.officeUser.officeUsers);
  const mainOfficeUser = officeUsers
    ? officeUsers.find(user => user.mainOfficeUser === true)
    : null;

  const handleClose = () => {
    dispatch(closeCreateModal());
  };

  const handleDossierClick = () => {
    dispatch(resetDossier());
    let responsables = [];
    if (currentOfficeUser) {
      if (currentOfficeUser.isAvocat) {
        responsables.push(currentOfficeUser);
      } else {
        if (mainOfficeUser) {
          responsables.push(mainOfficeUser);
        }
        responsables.push(currentOfficeUser);
      }
    }
    dispatch(setResponsables(responsables));
    dispatch(closeCreateModal());
    navigate('/dashboard/createDossier/step1');
  };

  const handleContactClick = () => {
    dispatch({ type: 'RESET_CONTACT_DIRECT' });
    dispatch({ type: 'RESET_REPRESENTANT_LEGAL' });
    dispatch({ type: 'RESET_FORM_PMP' });
    dispatch({ type: 'RESET_FORM_PMP_PUBLIC' });
    // Volontairement on NE dispatch PAS RESET_FORM_CONTACT ici :
    // on veut preserver le brouillon PP entre fermeture/reouverture de la modale
    // de creation dans la meme session. Le brouillon est purge apres creation
    // reussie (thunk createContact) ou a l'ouverture en mode modification.
    dispatch({ type: 'RESET_TOUTE_LISTE' });
    dispatch({ type: 'RESET_MARIAGE_DETAILS' });
    dispatch(closeCreateModal());
    navigate('/dashboard/createContact');
  };

  const handleMailClick = () => {
    dispatch(openEmailComposeModal());
  };

  const handleDocumentClick = () => {
    dispatch(openDocumentCreateModal());
  };

  return (
    <BaseModal
      isOpen={true}
      onClose={handleClose}
      overlayClassName="create-modal-overlay"
      contentClassName="k-modal-box create-modal-box"
    >
      <div className="create-modal-header">
        <HoverToSpeak textToSpeak="Titre: Creer un nouveau">
          <h2>{"Cr\u00E9er un nouveau..."}</h2>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Bouton fermer">
          <button
            className="k-modal-close"
            onClick={handleClose}
            aria-label="Fermer"
          >
            &times;
          </button>
        </HoverToSpeak>
      </div>
      <div className="create-modal-body">
        <div className="create-modal-grid">
          <CreateOptionCard
            icon={DossierIcon}
            label="Dossier"
            alt="Nouveau Dossier"
            onClick={handleDossierClick}
            speechText={"Cr\u00E9er un nouveau dossier"}
          />
          <CreateOptionCard
            icon={ContactIcon}
            label="Contact"
            alt="Nouveau Contact"
            onClick={handleContactClick}
            speechText={"Cr\u00E9er un nouveau contact"}
          />
          <CreateOptionCard
            icon={EmailIcon}
            label="Mail"
            alt="Nouveau Mail"
            onClick={handleMailClick}
            speechText="Envoyer un nouvel email"
          />
          <CreateOptionCard
            icon={DocumentIcon}
            label="Document"
            alt="Nouveau Document"
            onClick={handleDocumentClick}
            speechText={"Cr\u00E9er un nouveau document"}
          />
        </div>
      </div>
    </BaseModal>
  );
};

export default CreateModal;
