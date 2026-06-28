import React from 'react';
import BaseModal from '../../../../common/BaseModal';
import CloseButton from '../../../../../assets/bouton-supprimer.svg';
import '../../dossier/ConfirmDeleteModal.css';

/**
 * Modale de confirmation de suppression d'un dossier entier.
 * Réutilise les styles de ConfirmDeleteModal.css (thème noir/jaune).
 *
 * Props :
 *   dossier     — l'objet dossier à supprimer
 *   onConfirm() — callback si l'utilisateur confirme
 *   onCancel()  — callback si l'utilisateur annule
 */
const ConfirmDeleteDossierModal = ({ dossier, onConfirm, onCancel }) => {
  if (!dossier) return null;

  const nomDossier = dossier?.dossier?.dossier?.nom || 'ce dossier';

  return (
    <BaseModal
      isOpen={true}
      onClose={onCancel}
      overlayClassName="modal-overlay-confirm-delete"
      contentClassName="modal-content-confirm-delete"
    >
      <button className="modal-close-button-confirm-delete" onClick={onCancel}>
        <img src={CloseButton} alt="Fermer" className="k-icon-sm" />
      </button>

      <h2>Confirmation de suppression</h2>
      <p>
        Êtes-vous sûr de vraiment vouloir supprimer le dossier{' '}
        <strong>{nomDossier}</strong> et tous les documents qu'il contient,
        ainsi que tous les rendez-vous qui lui sont attachés et les tâches
        qui lui sont attachées ?
      </p>

      <div className="modal-buttons-row-confirm-delete">
        <button className="modal-btn-cancel-confirm-delete" onClick={onCancel}>
          Annuler
        </button>
        <button className="modal-btn-confirm-delete" onClick={() => onConfirm(dossier)}>
          Confirmer
        </button>
      </div>
    </BaseModal>
  );
};

export default ConfirmDeleteDossierModal;
