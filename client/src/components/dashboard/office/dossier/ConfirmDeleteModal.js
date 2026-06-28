import React from 'react';
import BaseModal from '../../../common/BaseModal';
import CloseButton from '../../../../assets/bouton-supprimer.svg';
import HoverToSpeak from '../../../common/HoverToSpeak';
import './ConfirmDeleteModal.css';

/**
 * Modale de confirmation de suppression générique pour un document ou un sous-dossier.
 * - itemToDelete : l'objet { item, type } à supprimer.
 * - onConfirm(item, type) : callback lorsque l'utilisateur confirme.
 * - onCancel() : callback lorsque l'utilisateur annule.
 */
const ConfirmDeleteModal = ({ itemToDelete, onConfirm, onCancel }) => {
  if (!itemToDelete || !itemToDelete.item) {
    return null;
  }

  const { item, type } = itemToDelete;
  const itemName = type === 'subfolder' ? item.name : item.nomDocument;
  const isSubfolder = type === 'subfolder';

  return (
    <BaseModal isOpen={true} onClose={onCancel} overlayClassName="modal-overlay-confirm-delete" contentClassName="modal-content-confirm-delete">
      <HoverToSpeak textToSpeak="Bouton fermer">
        <button className="modal-close-button-confirm-delete" onClick={onCancel}>
          <img src={CloseButton} alt="Fermer" className="k-icon-sm" />
        </button>
      </HoverToSpeak>

      <HoverToSpeak textToSpeak="Titre: Confirmation de suppression">
        <h2>Confirmation de suppression</h2>
      </HoverToSpeak>
      <HoverToSpeak textToSpeak={`Voulez-vous vraiment supprimer ${itemName} ?${isSubfolder ? ' Ce sous-dossier et tout son contenu seront definitivement supprimes.' : ''}`}>
        <p>
          Voulez-vous vraiment supprimer <strong>{itemName}</strong> ?
          {isSubfolder && (
            <br />
          )}
          {isSubfolder && (
            <strong>Ce sous-dossier et tout son contenu seront définitivement supprimés.</strong>
          )}
        </p>
      </HoverToSpeak>

      <div className="modal-buttons-row-confirm-delete">
        <HoverToSpeak textToSpeak="Bouton Annuler la suppression">
          <button className="modal-btn-cancel-confirm-delete" onClick={onCancel}>
            Annuler
          </button>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak={`Bouton confirmer la suppression de ${itemName}`}>
          <button className="modal-btn-confirm-delete" onClick={() => onConfirm(item, type)}>
            Supprimer
          </button>
        </HoverToSpeak>
      </div>
    </BaseModal>
  );
};

export default ConfirmDeleteModal;