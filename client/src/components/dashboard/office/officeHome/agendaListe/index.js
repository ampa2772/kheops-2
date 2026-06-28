import React, { useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { setCurrentDossier } from "../../../../../redux/slices/currentDossierSlice";
import './styles.css';

// --- IMPORTS MODIFIÉS ---
import EventDetailModal from '../../agenda/EventDetailModal';
import EventCreationModal from '../../agenda/EventCreationModal';
import ConfirmDeleteEventModal from '../../agenda/ConfirmDeleteEventModal';
import { deleteAgendaEvent, fetchAgendaEvents } from '../../../../../redux/slices/agendaSlice';
import HoverToSpeak from '../../../../common/HoverToSpeak'; // NOUVELLE IMPORTATION

const AgendaListe = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const { events, loading, error } = useSelector(state => state.agenda);

    // --- NOUVEAUX ÉTATS LOCAUX POUR LES MODALES ---
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showConfirmDeleteModal, setShowConfirmDeleteModal] = useState(false);
    // ---------------------------------------------

    const upcomingEvents = useMemo(() => {
        if (!events) return [];

        const today = new Date();
        today.setHours(0, 0, 0, 0); 

        return events
            .filter(event => 
                (event.type === 'event' || !event.type) && // Only show events or items without a type
                new Date(event.startDate) >= today
            )
            .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
            .slice(0, 25);
    }, [events]);

    const closeAllModals = () => {
        setShowDetailModal(false);
        setShowEditModal(false);
        setShowConfirmDeleteModal(false);
        setSelectedEvent(null);
    };
    
    // --- GESTIONNAIRE DE CLIC MODIFIÉ ---
    const handleEventClick = (event) => {
        setSelectedEvent(event);
        setShowDetailModal(true); // Ouvre directement les détails
    };
    
    // --- NOUVEAUX HANDLERS POUR LA MODALE DE DÉTAIL ---
    const handleEditEvent = (event) => {
        setSelectedEvent(event); // Assure que le bon événement est sélectionné
        setShowDetailModal(false);
        setShowEditModal(true);
    };
    
    const handleInitiateDelete = (event) => {
        setSelectedEvent(event); // Assure que le bon événement est sélectionné
        setShowDetailModal(false);
        setShowConfirmDeleteModal(true);
    };
    
    const handleConfirmDelete = (eventId) => {
        dispatch(deleteAgendaEvent(eventId));
        closeAllModals();
    };

    const handleSaveSuccess = () => {
        closeAllModals();
        dispatch(fetchAgendaEvents()); // Rafraîchir la liste des événements
    };
    // ----------------------------------------------------
    
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' });
    };

    const formatTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="agenda-liste-container">           
            {loading && <p className="agenda-liste-message">Chargement...</p>}
            {error && <p className="agenda-liste-error">Erreur: {error}</p>}
            {!loading && !error && (
                upcomingEvents.length > 0 ? (
                    <ul className="agenda-liste">
                        {upcomingEvents.map(event => {
                            const textToSpeak = `${event.title}, le ${formatDate(event.startDate)} à ${formatTime(event.startDate)}`;
                            return (
                                <HoverToSpeak key={event._id} textToSpeak={textToSpeak}>
                                    <li 
                                        className={`agenda-item ${event.dossier ? 'has-dossier' : ''}`}
                                        onClick={() => handleEventClick(event)}
                                        title={event.dossier ? `Dossier: ${event.dossier.dossier?.dossier?.nom}` : "Événement sans dossier lié"}
                                    >
                                        <div className="agenda-item-date-time">
                                            <span className="agenda-item-date">{formatDate(event.startDate)}</span>
                                            <span className="agenda-item-time">{formatTime(event.startDate)}</span>
                                        </div>
                                        <div className="agenda-item-details">
                                            <span className="agenda-item-title">{event.title}</span>
                                            {event.dossier && (
                                                <span className="agenda-item-dossier-link">
                                                    {event.dossier.dossier?.dossier?.nom}
                                                </span>
                                            )}
                                        </div>
                                    </li>
                                </HoverToSpeak>
                            );
                        })}
                    </ul>
                ) : (
                    <p className="agenda-liste-message">Aucun événement à venir.</p>
                )
            )}

            {/* --- GESTION DES MODALES --- */}
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
                    onClose={() => { setShowEditModal(false); setShowDetailModal(true); }} // Retour au détail si on annule
                    onSaveSuccess={handleSaveSuccess}
                    selectedDate={new Date(selectedEvent.startDate)} 
                />
            )}
            
            {showConfirmDeleteModal && selectedEvent && (
                <ConfirmDeleteEventModal
                    eventId={selectedEvent._id}
                    onConfirm={() => handleConfirmDelete(selectedEvent._id)}
                    onCancel={() => { setShowConfirmDeleteModal(false); setShowDetailModal(true); }} // Retour au détail
                />
            )}
        </div>
    );
};

export default AgendaListe;