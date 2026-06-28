// Kheops_2/client/src/components/dashboard/office/agenda/EventDetailModal.js
import React from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import BaseModal from '../../../common/BaseModal';
import { setCurrentDossier } from '../../../../redux/slices/currentDossierSlice';
import './EventDetailModal.css';

import SupprimerEvent from '../../../../assets/supprimer.svg';
import ModifEvent from '../../../../assets/modifier.svg';
import HoverToSpeak from '../../../common/HoverToSpeak';

const EditIcon = () => <span className="icon-event-detail modifEvent">
  <img src={ModifEvent} alt="" className="k-icon-sm" />
</span>;
const DeleteIcon = () => <span className="icon-event-detail supprEvent">
  <img src={SupprimerEvent} alt="" className="k-icon-sm" />
</span>;
const CloseIcon = () => <span className="icon-event-detail">×</span>;


const EventDetailModal = ({ event, onClose, onEdit, onInitiateDelete }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleDossierClick = (e) => {
    e.stopPropagation(); // Évite que le clic se propage à l'overlay
    if (event.dossier) {
      dispatch(setCurrentDossier(event.dossier));
      navigate('/dashboard/dossier');
      onClose(); // Ferme la modale après la navigation
    }
  };

  if (!event) return null;

  const handleDelete = () => {
    if (onInitiateDelete) {
      onInitiateDelete(event);
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(event);
    }
  };

  const isTask = event.type === 'task';

  const formattedDate = new Date(event.startDate).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric' // Ajout de l'année pour plus de clarté
  });

  const formattedStartTime = new Date(event.startDate).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const formattedEndTime = new Date(event.endDate).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const renderDateTime = () => {
    if (isTask) {
      // Pour les tâches, on affiche la date d'échéance
      return (
        <div className="event-detail-datetime-kheops task-datetime">
          <span className="icon-event-detail-body">🚩</span> Échéance le {formattedDate} à {formattedStartTime}
        </div>
      );
    }
    // Pour les événements, on affiche la plage horaire
    return (
      <div className="event-detail-datetime-kheops">
        <span className="icon-event-detail-body">🕒</span> {formattedDate} ⋅ {formattedStartTime} – {formattedEndTime}
      </div>
    );
  };

  // --- NOUVEAU : Préparation des textes pour la lecture vocale ---
  const titleToSpeak = event.title || "Titre non défini";

  const dateTimeToSpeak = isTask
    ? `Échéance le ${formattedDate} à ${formattedStartTime}`
    : `Événement le ${formattedDate}, de ${formattedStartTime} à ${formattedEndTime}`;

  const dossierToSpeak = event.dossier
    ? `Lié au dossier : ${event.dossier.dossier?.dossier?.nom || 'Nom du dossier inconnu'}`
    : '';

  const descriptionToSpeak = event.description || "Aucune description.";
  // --- FIN NOUVEAU ---

  return (
    <BaseModal isOpen={!!event} onClose={onClose} overlayClassName="event-detail-modal-overlay-kheops" contentClassName="event-detail-modal-kheops">
        <div className="event-detail-modal-header-kheops">
          <button onClick={handleEdit} className="event-detail-action-btn-kheops" title="Modifier"><EditIcon /></button>
          <button onClick={handleDelete} className="event-detail-action-btn-kheops" title="Supprimer"><DeleteIcon /></button>
          <button onClick={onClose} className="event-detail-action-btn-kheops event-detail-close-main-btn-kheops" title="Fermer"><CloseIcon /></button>
        </div>

        <div className="event-detail-modal-body-kheops">
          <HoverToSpeak textToSpeak={titleToSpeak}>
            <div className="event-detail-title-kheops">{event.title}</div>
          </HoverToSpeak>

          <HoverToSpeak textToSpeak={dateTimeToSpeak}>
            {renderDateTime()}
          </HoverToSpeak>

          {event.dossier && (
            <HoverToSpeak textToSpeak={dossierToSpeak}>
              <div className="event-detail-description-kheops clickable-dossier-link" onClick={handleDossierClick}>
                <span className="icon-event-detail-body">📁</span> Lié au dossier : <strong>{event.dossier.dossier?.dossier?.nom || 'Nom inconnu'}</strong>
              </div>
            </HoverToSpeak>
          )}

          {event.description && (
            <HoverToSpeak textToSpeak={descriptionToSpeak}>
              <div className="event-detail-description-kheops">
                <span className="icon-event-detail-body">📄</span> {event.description}
              </div>
            </HoverToSpeak>
          )}
        </div>
    </BaseModal>
  );
};

export default EventDetailModal;