import React from 'react';
import BaseModal from '../../../common/BaseModal';
import './ConfirmDeleteEventModal.css';

const ConfirmDeleteEventModal = ({ eventId, onConfirm, onCancel }) => {

  const handleDelete = () => {
    if (onConfirm && eventId) {
      onConfirm(eventId);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <BaseModal
      onClose={onCancel}
      overlayClassName="confirm-delete-modal-overlay-kheops"
      contentClassName="confirm-delete-modal-kheops"
    >
      <h4>Confirmer la suppression</h4>
      <p>Êtes-vous sûr de vouloir supprimer cet événement ?</p>
      <div className="confirm-delete-modal-actions-kheops">
        <button
          onClick={handleCancel}
          className="confirm-delete-modal-btn-kheops cancel-btn-kheops"
        >
          Annuler
        </button>
        <button
          onClick={handleDelete}
          className="confirm-delete-modal-btn-kheops delete-btn-kheops"
        >
          Supprimer
        </button>
      </div>
    </BaseModal>
  );
};

export default ConfirmDeleteEventModal;