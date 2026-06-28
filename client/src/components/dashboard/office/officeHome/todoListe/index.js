import React, { useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { setCurrentDossier } from '../../../../../redux/slices/currentDossierSlice';

// --- IMPORTATIONS MODIFIÉES ---
import {
  deleteAgendaEvent,
  fetchAgendaEvents,
  fetchTop25Tasks,
} from '../../../../../redux/slices/agendaSlice';
import EventDetailModal from '../../agenda/EventDetailModal';
import EventCreationModal from '../../agenda/EventCreationModal'; // <- Le composant clé
import ConfirmDeleteEventModal from '../../agenda/ConfirmDeleteEventModal';
import HoverToSpeak from '../../../../common/HoverToSpeak';

import './styles.css';

// === MODIFICATION DE LA SIGNATURE DU COMPOSANT ===
const Todoliste = ({ showCreateModal, setShowCreateModal }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // --- États locaux pour les modales de détail/édition/suppression ---
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
  // ---------------------------------------------

  const { topTasks, loadingTopTasks, errorTopTasks } = useSelector(
    (state) => state.agenda
  );
  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  
  // === NOUVEAU GESTIONNAIRE POUR LE SUCCÈS DE CRÉATION ===
  const handleCreateSuccess = () => {
    setShowCreateModal(false); // Ferme la modale via le setter reçu en prop
    dispatch(fetchTop25Tasks());   // Rafraîchit la liste des tâches urgentes
    dispatch(fetchAgendaEvents()); // Rafraîchit aussi la liste globale des événements
  };
  // --------------------------------------------------------

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

  const handleEditEvent = (event) => {
    setSelectedEvent(event);
    setShowDetailModal(false);
    setShowEditModal(true);
  };

  const handleInitiateDelete = (event) => {
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
    dispatch(fetchAgendaEvents());
    dispatch(fetchTop25Tasks());
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  };

  return (
    <div className="Todoliste">
      {loadingTopTasks && (
        <p className="todo-liste-message">Chargement des tâches...</p>
      )}
      {errorTopTasks && (
        <p className="todo-liste-error">Erreur: {errorTopTasks}</p>
      )}
      {!loadingTopTasks &&
        !errorTopTasks &&
        (topTasks.length > 0 ? (
          <ul className="todo-liste">
            {topTasks.map((task) => {
              const textToSpeak = `${task.title}, échéance le ${formatDate(task.startDate)}`;
              return (
                <HoverToSpeak key={task._id} textToSpeak={textToSpeak}>
                  <li
                    className={`todo-item ${task.dossier ? 'has-dossier' : ''}`}
                    onClick={() => handleTaskClick(task)}
                    title={
                      task.dossier
                        ? `Dossier: ${task.dossier.dossier?.dossier?.nom}`
                        : 'Tâche sans dossier lié'
                    }
                  >
                    <div className="todo-item-date-container">
                      <span className="todo-item-date">
                        {formatDate(task.startDate)}
                      </span>
                    </div>
                    <div className="todo-item-details">
                      <span className="todo-item-title">{task.title}</span>
                      {task.dossier && (
                        <span className="todo-item-dossier-link">
                          {task.dossier.dossier?.dossier?.nom}
                        </span>
                      )}
                    </div>
                  </li>
                </HoverToSpeak>
              );
            })}
          </ul>
        ) : (
          <p className="todo-liste-message">Aucune tâche urgente.</p>
        ))}

      {/* --- MODALES CONDITIONNELLES --- */}
      <div className="agenda-dossier-modal-theme">
        {/* MODALE DE CRÉATION (la nouveauté ici) */}
        {showCreateModal && (
          <EventCreationModal
            selectedDate={new Date()} // Une nouvelle tâche est créée pour aujourd'hui par défaut
            onClose={() => setShowCreateModal(false)}
            onSaveSuccess={handleCreateSuccess}
            dossierInitial={currentDossier || null}
            initialActiveTab="task" // Important: force l'ouverture sur l'onglet "Tâche"
          />
        )}
      
        {/* Modales existantes pour détail/édition/suppression */}
        {showDetailModal && selectedEvent && (
          <EventDetailModal
            event={selectedEvent}
            onClose={closeAllModals}
            onEdit={() => handleEditEvent(selectedEvent)}
            onInitiateDelete={() => handleInitiateDelete(selectedEvent)}
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
    </div>
  );
};

export default Todoliste;