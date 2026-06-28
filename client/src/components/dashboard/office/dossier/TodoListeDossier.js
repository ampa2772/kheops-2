import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchEventsForDossier, deleteAgendaEvent, fetchAgendaEvents, fetchTop25Tasks } from '../../../../redux/slices/agendaSlice';
import EventCreationModal from '../agenda/EventCreationModal';
import EventDetailModal from '../agenda/EventDetailModal';
import ConfirmDeleteEventModal from '../agenda/ConfirmDeleteEventModal';
import './styles.css'; 
import HoverToSpeak from '../../../common/HoverToSpeak';

const TodoListeDossier = ({ showCreateModal, setShowCreateModal }) => {
  const dispatch = useDispatch();
  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  const { dossierEvents, loadingDossierEvents, errorDossierEvents } = useSelector(state => state.agenda);

  // --- États locaux pour gérer les modales de détail/édition/suppression ---
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);

  // Charger les événements/tâches du dossier au montage du composant
  useEffect(() => {
    if (currentDossier?._id) {
      dispatch(fetchEventsForDossier(currentDossier._id));
    }
  }, [dispatch, currentDossier?._id]);

  // Filtrer et trier les tâches
  const sortedTasks = useMemo(() => {
    if (!dossierEvents) return [];
    
    return dossierEvents
      .filter(event => event.type === 'task') // Garder uniquement les tâches
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate)); // Trier par date d'échéance (croissant)
  }, [dossierEvents]);
  
  // === NOUVEAU GESTIONNAIRE POUR LE SUCCÈS DE CRÉATION ===
  const handleCreateSuccess = () => {
    setShowCreateModal(false); // Ferme la modale via le setter reçu en prop
    if (currentDossier?._id) {
        dispatch(fetchEventsForDossier(currentDossier._id)); // Rafraîchit la liste des tâches du dossier
    }
    dispatch(fetchTop25Tasks());   // Rafraîchit la liste des tâches urgentes pour l'accueil
    dispatch(fetchAgendaEvents()); // Rafraîchit aussi la liste globale des événements pour l'agenda
  };

  // --- Handlers pour les modales ---

  const handleTaskClick = (task) => {
    setSelectedEvent(task);
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
    dispatch(deleteAgendaEvent(eventId));
    dispatch(fetchTop25Tasks());
    closeAllModals();
  };

  const handleSaveSuccess = () => {
    closeAllModals();
    if (currentDossier?._id) {
      dispatch(fetchEventsForDossier(currentDossier._id));
    }
    dispatch(fetchAgendaEvents());
    dispatch(fetchTop25Tasks());
  };

  // --- Fin des handlers ---
  
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('fr-FR', options);
  };

  const renderContent = () => {
    if (loadingDossierEvents) {
      return <p className="todo-list-message">Chargement des tâches...</p>;
    }

    if (errorDossierEvents) {
      return <p className="todo-list-error">Erreur: {errorDossierEvents}</p>;
    }

    if (sortedTasks.length === 0) {
      return <p className="todo-list-message">Aucune tâche à faire pour ce dossier.</p>;
    }

    return (
      <ul className="todo-list">
        {sortedTasks.map(task => {
          const textToSpeak = `${task.title}, échéance le ${formatDate(task.startDate)}`;
          return (
            <HoverToSpeak key={task._id} textToSpeak={textToSpeak}>
              <li className="task-item" onClick={() => handleTaskClick(task)}>
                <div className="task-header">
                  <span className="task-title">{task.title}</span>
                  <span className="task-deadline">Échéance : {formatDate(task.startDate)}</span>
                </div>
              </li>
            </HoverToSpeak>
          );
        })}
      </ul>
    );
  };

  return (
    <>
      <div className="todoListeContent docList">
        {renderContent()}
      </div>

      <div className="agenda-dossier-modal-theme">
        {/* --- MODIFICATION : Logique de la modale de création --- */}
        {showCreateModal && (
          <EventCreationModal
            dossierInitial={currentDossier} // Pour lier automatiquement au bon dossier
            selectedDate={new Date()}
            onClose={() => setShowCreateModal(false)}
            onSaveSuccess={handleCreateSuccess}
            initialActiveTab="task" // Ouvre directement l'onglet "Tâche"
          />
        )}
        {/* --- Fin de la modification --- */}

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

export default TodoListeDossier;