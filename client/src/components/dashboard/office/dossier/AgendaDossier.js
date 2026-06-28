import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchEventsForDossier, deleteAgendaEvent, fetchAgendaEvents } from '../../../../redux/slices/agendaSlice';

// --- IMPORTS DES MODALES (INCHANGÉ) ---
import EventCreationModal from '../agenda/EventCreationModal';
import EventDetailModal from '../agenda/EventDetailModal';
import ConfirmDeleteEventModal from '../agenda/ConfirmDeleteEventModal';
import './AgendaDossierModal.css';
import HoverToSpeak from '../../../common/HoverToSpeak'; // NOUVELLE IMPORTATION

// Le composant reçoit maintenant les props pour gérer l'ouverture de la modale de création
const AgendaDossier = ({ showCreateModal, setShowCreateModal }) => {
  const dispatch = useDispatch();

  // --- ÉTATS LOCAUX POUR GÉRER LES MODALES (INCHANGÉ) ---
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);

  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  const { dossierEvents, loadingDossierEvents, errorDossierEvents } = useSelector(state => state.agenda);

  // =========================================================================
  // === MODIFICATION : Le useEffect qui chargeait les données est retiré ===
  // =========================================================================
  // La logique de chargement est désormais gérée par le composant parent `Dossier/index.js`
  // useEffect(() => {
  //   if (currentDossier?._id) {
  //     dispatch(fetchEventsForDossier(currentDossier._id));
  //   }
  // }, [dispatch, currentDossier?._id]);
  // =========================================================================

  // --- FONCTION DE SUCCÈS POUR LA MODALE DE CRÉATION ---
  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    // On re-fetch directement la liste du dossier courant pour la mettre à jour.
    if (currentDossier?._id) {
        dispatch(fetchEventsForDossier(currentDossier._id));
    }
    // On rafraîchit aussi la liste générale de l'agenda principal.
    dispatch(fetchAgendaEvents()); 
  };
  
  // --- FONCTIONS DE GESTION DES MODALES (INCHANGÉES) ---
  const handleEventClick = (event) => {
    setSelectedEvent(event);
    setShowDetailModal(true);
  };

  const closeAllModals = () => {
    setShowDetailModal(false);
    setShowEditModal(false);
    setShowConfirmDeleteModal(false);
    setSelectedEvent(null);
  };
  
  const handleReturnToDetailView = () => {
    setShowEditModal(false);
    setShowConfirmDeleteModal(false);
    setShowDetailModal(true); 
  };
  
  const handleEditFromDetail = (event) => {
    setSelectedEvent(event);
    setShowDetailModal(false);
    setShowEditModal(true);
  };
  
  const handleInitiateDeleteFromDetail = (event) => {
    setSelectedEvent(event);
    setShowDetailModal(false);
    setShowConfirmDeleteModal(true);
  };
  
  const handleConfirmDelete = (eventId) => {
    dispatch(deleteAgendaEvent(eventId)); // Le reducer gère la mise à jour des deux listes
    closeAllModals();
  };

  // =========================================================================
  // === MODIFICATION PRINCIPALE : handleSaveSuccess =========================
  // =========================================================================
  const handleSaveSuccess = () => {
    closeAllModals(); // Ferme toutes les modales (détail, édition, confirmation)

    // Si un dossier est actuellement affiché, on rafraîchit spécifiquement sa liste d'événements.
    // C'est cette ligne qui résout le problème.
    if (currentDossier?._id) {
      dispatch(fetchEventsForDossier(currentDossier._id));
    }

    // On rafraîchit aussi la liste globale de l'agenda principal pour la cohérence.
    dispatch(fetchAgendaEvents());
  };
  // =========================================================================
  // =========================================================================

  const formatEventDate = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const optionsDate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const optionsTime = { hour: '2-digit', minute: '2-digit' };

    const startDateString = start.toLocaleDateString('fr-FR', optionsDate);
    const startTimeString = start.toLocaleTimeString('fr-FR', optionsTime);
    const endTimeString = end.toLocaleTimeString('fr-FR', optionsTime);
    
    if (start.toDateString() === end.toDateString()) {
      return `${startDateString} de ${startTimeString} à ${endTimeString}`;
    } else {
      const endDateString = end.toLocaleDateString('fr-FR', optionsDate);
      return `Du ${startDateString} à ${startTimeString} au ${endDateString} à ${endTimeString}`;
    }
  };

  const renderContent = () => {
    if (loadingDossierEvents) {
      return <p className="agenda-dossier-message">Chargement de l'agenda du dossier...</p>;
    }

    if (errorDossierEvents) {
      return <p className="agenda-dossier-error">Erreur: {errorDossierEvents}</p>;
    }

    // NOUVEAU : Filtrer pour ne garder que les événements
    const eventsOnly = (dossierEvents || []).filter(event => event.type === 'event' || !event.type);

    if (eventsOnly.length === 0) {
      return <p className="agenda-dossier-message">Aucun événement à venir pour ce dossier.</p>;
    }

    return (
      <ul className="agenda-dossier-list">
        {eventsOnly.map(event => {
          const textToSpeak = `${event.title}, ${formatEventDate(event.startDate, event.endDate)}`;
          return (
            <HoverToSpeak key={event._id} textToSpeak={textToSpeak}>
              <li className="agenda-dossier-item" onClick={() => handleEventClick(event)}>
                <div className="agenda-item-title">{event.title}</div>
                <div className="agenda-item-date">{formatEventDate(event.startDate, event.endDate)}</div>
                {event.description && <p className="agenda-item-description">{event.description}</p>}
              </li>
            </HoverToSpeak>
          );
        })}
      </ul>
    );
  };

  return (
    <>
      <div className="agenda-dossier-content-wrapper docList">
        {renderContent()}
      </div>

      <div className="agenda-dossier-modal-theme">
        {showCreateModal && (
          <EventCreationModal
            dossierInitial={currentDossier} // <-- MODIFICATION: Passer l'objet dossier complet
            selectedDate={new Date()}
            onClose={() => setShowCreateModal(false)}
            onSaveSuccess={handleCreateSuccess}
          />
        )}

        {showDetailModal && selectedEvent && (
          <EventDetailModal
            event={selectedEvent}
            onClose={closeAllModals}
            onEdit={() => handleEditFromDetail(selectedEvent)}
            onInitiateDelete={() => handleInitiateDeleteFromDetail(selectedEvent)}
          />
        )}

        {showEditModal && selectedEvent && (
          <EventCreationModal
            key={selectedEvent._id}
            eventToEdit={selectedEvent}
            onClose={handleReturnToDetailView}
            onSaveSuccess={handleSaveSuccess}
            selectedDate={new Date(selectedEvent.startDate)} 
          />
        )}

        {showConfirmDeleteModal && selectedEvent && (
            <ConfirmDeleteEventModal
                eventId={selectedEvent._id}
                onConfirm={() => handleConfirmDelete(selectedEvent._id)}
                onCancel={handleReturnToDetailView}
            />
        )}
      </div>
    </>
  );
};

export default AgendaDossier;