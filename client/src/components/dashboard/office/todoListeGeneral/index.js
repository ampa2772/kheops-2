import React, { useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  fetchAgendaEvents,
  fetchTop25Tasks,
  deleteAgendaEvent,
} from '../../../../redux/slices/agendaSlice';
import EventDetailModal from '../agenda/EventDetailModal';
import EventCreationModal from '../agenda/EventCreationModal';
import ConfirmDeleteEventModal from '../agenda/ConfirmDeleteEventModal';
import HoverToSpeak from '../../../common/HoverToSpeak';
import './TodoListeGeneral.css';

// --- Logique de categorisation par urgence (F-004) ---
// `now` est passe en parametre pour que le composant puisse re-categoriser
// dynamiquement au tick d'un setInterval (reclassement temps reel sans
// rechargement de la page).
const categorizeTask = (task, now) => {
  const oneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const oneMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const taskDate = new Date(task.startDate);

  if (taskDate < oneWeek) return 'red';
  if (taskDate < oneMonth) return 'orange';
  return 'green';
};

// Intervalle de re-evaluation : 30 secondes. Compromis entre fluidite
// (decalage max 30 s entre franchissement reel d'un seuil et bascule
// visuelle) et cout CPU (un setState toutes les 30 s est negligeable).
const RECLASSIFY_INTERVAL_MS = 30 * 1000;

// --- Formatage de date (meme pattern que todoListe existante) ---
const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
};

// Libelle court pour la priorite (lu par les lecteurs d'ecran via aria-label)
const PRIORITY_LABEL = {
  red: 'Priorite urgente',
  orange: 'Priorite moyenne',
  green: 'Priorite faible',
};

// --- Sous-composant : Carte tache ---
// L'attribut data-priority porte la couleur ; le CSS ajoute un trait a gauche
// de 4px (rouge / orange / vert) pour rendre la priorite visible meme hors
// contexte de colonne (lecture seule dans agenda, favoris, etc.).
const TaskCard = ({ task, priority, onClick }) => {
  const dossierName = task.dossier?.dossier?.dossier?.nom || null;
  const speechText = `${task.title}, échéance le ${formatDate(task.startDate)}${
    dossierName ? `, dossier ${dossierName}` : ''
  }`;

  return (
    <HoverToSpeak textToSpeak={speechText}>
      <div
        className="todoGeneral-task-card"
        data-priority={priority}
        onClick={() => onClick(task)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(task);
          }
        }}
        aria-label={`${PRIORITY_LABEL[priority] || 'Tache'} : ${task.title}, echeance ${formatDate(task.startDate)}${dossierName ? ', dossier ' + dossierName : ''}`}
      >
        <span
          className="todoGeneral-task-priority-bar"
          aria-hidden="true"
        />
        <div className="todoGeneral-task-date-container">
          <span className="todoGeneral-task-date">
            {formatDate(task.startDate)}
          </span>
        </div>
        <div className="todoGeneral-task-details">
          <span className="todoGeneral-task-title">{task.title}</span>
          {dossierName && (
            <span className="todoGeneral-task-dossier" title={dossierName}>
              {dossierName}
            </span>
          )}
        </div>
      </div>
    </HoverToSpeak>
  );
};

// --- Sous-composant : Colonne de taches ---
const TaskColumn = ({ title, count, tasks, colorClass, priority, onTaskClick }) => (
  <div className={`todoGeneral-column ${colorClass}`}>
    <div className="todoGeneral-column-header">
      <h3 className="todoGeneral-column-title">{title}</h3>
      <span className="todoGeneral-column-count">{count}</span>
    </div>
    <div className="todoGeneral-column-list">
      {tasks.length > 0 ? (
        tasks.map((task) => (
          <TaskCard
            key={task._id}
            task={task}
            priority={priority}
            onClick={onTaskClick}
          />
        ))
      ) : (
        <p className="todoGeneral-column-empty">Aucune tâche</p>
      )}
    </div>
  </div>
);

// --- Composant principal ---
const TodoListeGeneral = () => {
  const dispatch = useDispatch();
  const { events, loading, error } = useSelector((state) => state.agenda);

  // Etats des modales (meme pattern que todoListe existante)
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
  // F-003 : creation directe d'une tache depuis cette vue
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);

  // F-004 : `now` est mis a jour toutes les 30 s pour re-categoriser
  // dynamiquement les taches au franchissement des seuils 7 jours / 30 jours.
  // Permet le reclassement visuel temps reel sans rechargement de la page.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(new Date());
    }, RECLASSIFY_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  // Chargement des evenements si pas encore charge
  useEffect(() => {
    if (events.length === 0 && !loading) {
      dispatch(fetchAgendaEvents());
    }
  }, [dispatch, events.length, loading]);

  // Filtrage et categorisation des taches — depend de `now` (F-004) pour
  // recalculer les colonnes a chaque tick.
  const { redTasks, orangeTasks, greenTasks } = useMemo(() => {
    const red = [];
    const orange = [];
    const green = [];

    (events || []).forEach((event) => {
      if (event.type !== 'task') return;
      if (new Date(event.startDate) < now) return;

      const category = categorizeTask(event, now);
      if (category === 'red') red.push(event);
      else if (category === 'orange') orange.push(event);
      else green.push(event);
    });

    const sortByDate = (a, b) => new Date(a.startDate) - new Date(b.startDate);
    red.sort(sortByDate);
    orange.sort(sortByDate);
    green.sort(sortByDate);

    return { redTasks: red, orangeTasks: orange, greenTasks: green };
  }, [events, now]);

  // --- Gestionnaires de modales (identiques a todoListe) ---
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

  // F-003 : ouvrir la modale en mode creation, pre-reglee sur l'onglet "Tache"
  const handleOpenCreateTask = () => {
    setShowCreateTaskModal(true);
  };
  const handleCloseCreateTask = () => {
    setShowCreateTaskModal(false);
  };
  const handleCreateTaskSuccess = () => {
    setShowCreateTaskModal(false);
    dispatch(fetchAgendaEvents());
    dispatch(fetchTop25Tasks());
  };

  if (loading) {
    return (
      <div className="todoGeneral-container">
        <p className="todoGeneral-loading">Chargement des tâches...</p>
      </div>
    );
  }

  // Total taches actives (futures, non triees)
  const totalActiveTasks = redTasks.length + orangeTasks.length + greenTasks.length;

  return (
    <div className="todoGeneral-wrapper">
      {/* F-003 : header avec titre et bouton creation */}
      <header className="todoGeneral-page-header">
        <div className="todoGeneral-page-header-info">
          <h2 className="todoGeneral-page-title">Toutes les taches</h2>
          <span className="todoGeneral-page-subtitle">
            {totalActiveTasks === 0
              ? 'Aucune tache active'
              : `${totalActiveTasks} tache${totalActiveTasks > 1 ? 's' : ''} active${totalActiveTasks > 1 ? 's' : ''}`}
          </span>
        </div>
        <button
          type="button"
          className="todoGeneral-new-task-btn"
          onClick={handleOpenCreateTask}
          aria-label="Creer une nouvelle tache"
          title="Creer une nouvelle tache"
        >
          <svg
            className="todoGeneral-new-task-btn__icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Nouvelle tache</span>
        </button>
      </header>

      <div className="todoGeneral-container">
        <TaskColumn
          title="Urgent (< 1 semaine)"
          count={redTasks.length}
          tasks={redTasks}
          colorClass="column-red"
          priority="red"
          onTaskClick={handleTaskClick}
        />
        <TaskColumn
          title="Moyen (1 sem. - 1 mois)"
          count={orangeTasks.length}
          tasks={orangeTasks}
          colorClass="column-orange"
          priority="orange"
          onTaskClick={handleTaskClick}
        />
        <TaskColumn
          title="Non urgent (> 1 mois)"
          count={greenTasks.length}
          tasks={greenTasks}
          colorClass="column-green"
          priority="green"
          onTaskClick={handleTaskClick}
        />
      </div>

      {/* Modales — meme systeme que todoListe existante */}
      <div className="agenda-dossier-modal-theme">
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
        {/* F-003 : modale creation tache (ouverte directement sur onglet Tache) */}
        {showCreateTaskModal && (
          <EventCreationModal
            key="create-task-from-todolist"
            onClose={handleCloseCreateTask}
            onSaveSuccess={handleCreateTaskSuccess}
            selectedDate={new Date()}
            defaultTab="task"
          />
        )}
      </div>
    </div>
  );
};

export default TodoListeGeneral;
