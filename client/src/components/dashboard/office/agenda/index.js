import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAgendaEvents, openDeleteConfirmModal, closeDeleteConfirmModal, deleteAgendaEvent, fetchTop25Tasks, updateAgendaEvent } from '../../../../redux/slices/agendaSlice';
import './styles.css';

import { useAgenda } from './hooks/useAgenda';
import AgendaHeader from './components/AgendaHeader';
import AgendaSidebar from './components/AgendaSidebar';
import MonthView from './components/MonthView';
import WeekView from './components/WeekView';
import DayView from './components/DayView';
import ListView from './components/ListView';
import EventCreationModal from './EventCreationModal';
import ConfirmDeleteEventModal from './ConfirmDeleteEventModal';
import EventDetailModal from './EventDetailModal';
import MoreEventsModal from './MoreEventsModal';
import { EVENT_CATEGORIES, resolveCategory } from './categories';

const AgendaComponent = () => {
  const dispatch = useDispatch();
  const { showConfirmDeleteModal, eventToDeleteId } = useSelector(state => state.agenda);
  const isSpeechEnabled = useSelector(state => state.login.user?.isSpeechEnabled || false);
  const { dossier: currentDossier } = useSelector(state => state.currentDossier);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentView, setCurrentView] = useState('Mois');
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

  // Scroll auto-centre + surbrillance declenches depuis la sidebar
  // (clic sur un jour du mini-calendrier ou un event de la liste "A venir").
  const [pendingScroll, setPendingScroll] = useState(null); // { targetMinutes, eventId|null }
  const [flashEventId, setFlashEventId] = useState(null);

  // Filtre par catégories : Set des catégories actives. Toutes actives par défaut.
  const [activeCategories, setActiveCategories] = useState(
    () => new Set(EVENT_CATEGORIES.map((c) => c.key))
  );
  const toggleCategory = useCallback((key) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Modales
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedDateForModal, setSelectedDateForModal] = useState(null);
  const [initialTimeForModal, setInitialTimeForModal] = useState(null);
  const [eventToEdit, setEventToEdit] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEventForDetail, setSelectedEventForDetail] = useState(null);
  const [showMoreEventsModal, setShowMoreEventsModal] = useState(false);
  const [selectedDayForMoreEvents, setSelectedDayForMoreEvents] = useState(null);

  const timeGridRef = useRef(null);
  const scrollBodyRef = useRef(null);
  const flashTimeoutRef = useRef(null);

  const { getEventsForDay, genererJoursCalendrier, getWeekViewDates } = useAgenda(currentDate);

  useEffect(() => {
    dispatch(fetchAgendaEvents());
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [dispatch]);

  // Applique le scroll centre une fois la vue (Jour/Semaine) rendue pour la
  // bonne date. L'effet tourne apres le commit DOM (DayView/WeekView monte,
  // ref attachee) ; lire clientHeight force le reflow donc les mesures sont
  // a jour. Pas de rAF : il est suspendu si la fenetre n'est pas visible.
  useEffect(() => {
    if (!pendingScroll) return;
    const body = scrollBodyRef.current;
    if (body) {
      const targetPx = pendingScroll.targetMinutes; // grille 60px/h => 1min = 1px
      const maxScroll = Math.max(0, body.scrollHeight - body.clientHeight);
      let top = targetPx - body.clientHeight / 2;
      if (top < 0) top = 0;
      if (top > maxScroll) top = maxScroll;
      body.scrollTo({ top, behavior: 'smooth' });
    }
    if (pendingScroll.eventId) {
      setFlashEventId(pendingScroll.eventId);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = setTimeout(() => {
        setFlashEventId(null);
        flashTimeoutRef.current = null;
      }, 1800);
    }
    setPendingScroll(null);
  }, [pendingScroll]);

  useEffect(() => () => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
  }, []);

  const handleNavigation = useCallback((direction) => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      const step = direction === 'prev' ? -1 : 1;
      if (currentView === 'Mois' || currentView === 'Liste') newDate.setMonth(newDate.getMonth() + step);
      else if (currentView === 'Semaine') newDate.setDate(newDate.getDate() + (step * 7));
      else if (currentView === 'Jour') newDate.setDate(newDate.getDate() + step);
      return newDate;
    });
  }, [currentView]);

  const openCreateModal = useCallback((date, hour) => {
    setEventToEdit(null);
    setSelectedDateForModal(date || new Date());
    setInitialTimeForModal(hour != null ? `${String(hour).padStart(2, '0')}:00` : null);
    setShowEventModal(true);
  }, []);

  const handleDayClick = (jourObj) => {
    openCreateModal(jourObj.date);
  };

  const handleTimeSlotClick = (date, hour) => {
    openCreateModal(date, hour);
  };

  const handleEventClick = (e, event) => {
    e?.stopPropagation();
    setSelectedEventForDetail(event);
    setShowDetailModal(true);
  };

  // Clic sur un jour du mini-calendrier : on bascule sur ce jour (vue Jour
  // si on etait en Mois/Liste, sinon on garde Jour/Semaine) et on centre
  // le 1er event du jour — ou midi s'il n'y a aucun event visible.
  const handleMiniCalSelect = useCallback((d) => {
    const date = new Date(d);
    setCurrentDate(date);
    setCurrentView((v) => (v === 'Mois' || v === 'Liste') ? 'Jour' : v);
    const dayEvents = getEventsForDay(date).filter(
      (ev) => !activeCategories || activeCategories.has(resolveCategory(ev))
    );
    let targetMinutes = 12 * 60;
    let eventId = null;
    if (dayEvents.length) {
      const s = new Date(dayEvents[0].startDate);
      targetMinutes = s.getHours() * 60 + s.getMinutes();
      eventId = dayEvents[0]._id;
    }
    setPendingScroll({ targetMinutes, eventId });
  }, [getEventsForDay, activeCategories]);

  // Clic sur un event de la liste "A venir" : on bascule sur son jour et
  // on centre precisement cet event (pas de modale, juste scroll + flash).
  const handleSidebarEventClick = useCallback((ev) => {
    if (!ev || !ev.startDate) return;
    const start = new Date(ev.startDate);
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12, 0, 0);
    setCurrentDate(date);
    setCurrentView((v) => (v === 'Mois' || v === 'Liste') ? 'Jour' : v);
    setPendingScroll({
      targetMinutes: start.getHours() * 60 + start.getMinutes(),
      eventId: ev._id,
    });
  }, []);

  const handleMoreEventsClick = (e, jourObj) => {
    e.stopPropagation();
    setSelectedDayForMoreEvents(jourObj);
    setShowMoreEventsModal(true);
  };

  // Auto-flip de mois pendant un drag&drop en vue Mois : si le curseur reste
  // ~800ms dans une bande de 60px sur le bord gauche/droit de la grille,
  // on navigue automatiquement au mois precedent / suivant. Un cooldown de
  // 400ms apres chaque flip evite les enchainements rapides.
  const AUTOFLIP_HOT_ZONE_PX = 60;
  const AUTOFLIP_HOLD_MS = 800;
  const AUTOFLIP_COOLDOWN_MS = 400;
  const [dragHotZone, setDragHotZone] = useState(null); // 'left' | 'right' | null
  const flipTimerRef = useRef(null);
  const lastFlipAtRef = useRef(0);
  const calendarWrapperRef = useRef(null);

  const clearAutoFlipTimer = useCallback(() => {
    if (flipTimerRef.current) {
      clearTimeout(flipTimerRef.current);
      flipTimerRef.current = null;
    }
  }, []);

  const handleAutoFlipDragOver = useCallback((e) => {
    // Auto-flip est actif sur les 3 vues navigables : Mois, Semaine, Jour.
    if (currentView !== 'Mois' && currentView !== 'Semaine' && currentView !== 'Jour') return;
    if (!calendarWrapperRef.current) return;
    const rect = calendarWrapperRef.current.getBoundingClientRect();
    const x = e.clientX;

    let zone = null;
    if (x >= rect.left && x < rect.left + AUTOFLIP_HOT_ZONE_PX) zone = 'left';
    else if (x > rect.right - AUTOFLIP_HOT_ZONE_PX && x <= rect.right) zone = 'right';

    // Cooldown : on ignore les zones hot tant que le dernier flip est trop recent
    if (zone && Date.now() - lastFlipAtRef.current < AUTOFLIP_COOLDOWN_MS) {
      zone = null;
    }

    if (zone !== dragHotZone) {
      setDragHotZone(zone);
      clearAutoFlipTimer();
      if (zone) {
        flipTimerRef.current = setTimeout(() => {
          handleNavigation(zone === 'left' ? 'prev' : 'next');
          lastFlipAtRef.current = Date.now();
          setDragHotZone(null);
          flipTimerRef.current = null;
        }, AUTOFLIP_HOLD_MS);
      }
    }
  }, [currentView, dragHotZone, clearAutoFlipTimer]); // eslint-disable-line react-hooks/exhaustive-deps

  const resetAutoFlip = useCallback(() => {
    clearAutoFlipTimer();
    setDragHotZone(null);
  }, [clearAutoFlipTimer]);

  // Reset global a la fin du drag (drop reussi ou drag abandonne hors grille)
  useEffect(() => {
    const onEnd = () => resetAutoFlip();
    window.addEventListener('dragend', onEnd);
    window.addEventListener('drop', onEnd);
    return () => {
      window.removeEventListener('dragend', onEnd);
      window.removeEventListener('drop', onEnd);
      clearAutoFlipTimer();
    };
  }, [resetAutoFlip, clearAutoFlipTimer]);

  // Drag&drop : deplace un event sur un nouveau jour (et optionnellement
  // une nouvelle heure pour Week/Day). En vue Mois targetHour est null,
  // l'heure d'origine est conservee. En vue Semaine/Jour, on snap a l'heure
  // du slot, on conserve les minutes originaux et on arrondit au quart
  // d'heure le plus proche (precision 15 min).
  const allEvents = useSelector(state => state.agenda.events);
  const snapMinutesToQuarter = (m) => Math.round(m / 15) * 15;
  const handleEventDrop = useCallback((eventId, targetDate, targetHour, targetMinute) => {
    const event = (allEvents || []).find(ev => ev._id === eventId);
    if (!event || !event.startDate) return;
    const originalStart = new Date(event.startDate);
    const originalEnd = event.endDate ? new Date(event.endDate) : null;

    const newStart = new Date(targetDate);
    if (typeof targetHour === 'number' && typeof targetMinute === 'number') {
      // Position precise dans la column (vue Week/Day) : heure + minute deja
      // snappes par le caller via la position curseur exacte.
      newStart.setHours(targetHour, targetMinute, 0, 0);
    } else if (typeof targetHour === 'number') {
      // Fallback (vue Mois ou cas sans precision minute) : conserve les minutes
      // originaux snappes au quart d'heure.
      let snapped = snapMinutesToQuarter(originalStart.getMinutes());
      let hourShift = 0;
      if (snapped === 60) { snapped = 0; hourShift = 1; }
      newStart.setHours(targetHour + hourShift, snapped, 0, 0);
    } else {
      let snapped = snapMinutesToQuarter(originalStart.getMinutes());
      let hourShift = 0;
      if (snapped === 60) { snapped = 0; hourShift = 1; }
      newStart.setHours(originalStart.getHours() + hourShift, snapped, 0, 0);
    }

    if (newStart.getTime() === originalStart.getTime()) return;

    let newEnd = null;
    if (originalEnd) {
      const durationMs = originalEnd.getTime() - originalStart.getTime();
      newEnd = new Date(newStart.getTime() + durationMs);
    }

    const payload = event.type === 'task'
      ? { type: 'task', title: event.title, deadline: newStart.toISOString() }
      : { type: event.type, title: event.title, startDate: newStart.toISOString(), endDate: newEnd ? newEnd.toISOString() : newStart.toISOString() };

    return dispatch(updateAgendaEvent(eventId, payload))
      .then(() => Promise.all([dispatch(fetchAgendaEvents()), dispatch(fetchTop25Tasks())]))
      .catch(() => { /* erreur deja loggee dans le thunk */ });
  }, [allEvents, dispatch]);

  // Resize d'un event (vues Semaine/Jour) : recoit les nouvelles bornes
  // start/end deja arrondies au quart d'heure. Interdit pour les tasks.
  // Retourne la Promise pour que le hook puisse attendre que le state
  // Redux soit a jour avant de retirer l'override visuel (evite le flash).
  const handleEventResize = useCallback((eventId, newStartIso, newEndIso) => {
    const event = (allEvents || []).find(ev => ev._id === eventId);
    if (!event || event.type === 'task') return Promise.resolve();
    const payload = { type: event.type, title: event.title, startDate: newStartIso, endDate: newEndIso };
    return dispatch(updateAgendaEvent(eventId, payload))
      .then(() => dispatch(fetchAgendaEvents()))
      .catch(() => { /* erreur loggee */ });
  }, [allEvents, dispatch]);

  const handleSaveSuccess = () => {
    setShowEventModal(false);
    setEventToEdit(null);
    setShowDetailModal(false);
    setSelectedEventForDetail(null);
    dispatch(fetchAgendaEvents());
    dispatch(fetchTop25Tasks());
  };

  const estAujourdhui = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  };

  const renderView = () => {
    switch (currentView) {
      case 'Semaine':
        return (
          <WeekView
            timeGridRef={timeGridRef}
            scrollBodyRef={scrollBodyRef}
            flashEventId={flashEventId}
            weekDates={getWeekViewDates()}
            estAujourdhui={estAujourdhui}
            getEventsForDay={getEventsForDay}
            handleTimeSlotClick={handleTimeSlotClick}
            handleEventClick={handleEventClick}
            activeCategories={activeCategories}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
          />
        );
      case 'Jour':
        return (
          <DayView
            date={currentDate}
            scrollBodyRef={scrollBodyRef}
            flashEventId={flashEventId}
            estAujourdhui={estAujourdhui}
            getEventsForDay={getEventsForDay}
            handleTimeSlotClick={handleTimeSlotClick}
            handleEventClick={handleEventClick}
            activeCategories={activeCategories}
            onEventDrop={handleEventDrop}
            onEventResize={handleEventResize}
          />
        );
      case 'Liste':
        return (
          <ListView
            currentDate={currentDate}
            activeCategories={activeCategories}
            handleEventClick={handleEventClick}
          />
        );
      case 'Mois':
      default:
        return (
          <MonthView
            joursDuCalendrier={genererJoursCalendrier()}
            onWheel={(e) => { e.preventDefault(); handleNavigation(e.deltaY > 0 ? 'next' : 'prev'); }}
            isSpeechEnabled={isSpeechEnabled}
            estAujourdhui={estAujourdhui}
            handleDayClick={handleDayClick}
            handleEventClick={handleEventClick}
            handleMoreEventsClick={handleMoreEventsClick}
            maxEventsToShow={screenWidth < 768 ? 2 : 2}
            activeCategories={activeCategories}
            onEventDrop={handleEventDrop}
          />
        );
    }
  };

  return (
    <div className="agenda-container-kheops">
      <AgendaHeader
        currentDate={currentDate}
        currentView={currentView}
        isSpeechEnabled={isSpeechEnabled}
        onToday={() => setCurrentDate(new Date())}
        onPrev={() => handleNavigation('prev')}
        onNext={() => handleNavigation('next')}
        onViewChange={setCurrentView}
        onCreateNew={() => openCreateModal(currentDate)}
        activeCategories={activeCategories}
        onToggleCategory={toggleCategory}
      />
      <div className="agenda-main-content-kheops">
        <div
          className="agenda-main-calendar"
          ref={calendarWrapperRef}
          onDragOver={handleAutoFlipDragOver}
        >
          {(currentView === 'Mois' || currentView === 'Semaine' || currentView === 'Jour') && (() => {
            const unitLabel = currentView === 'Mois' ? 'Mois' : (currentView === 'Semaine' ? 'Semaine' : 'Jour');
            const prevLabel = currentView === 'Semaine' ? 'Semaine precedente' : `${unitLabel} precedent${currentView === 'Semaine' ? 'e' : ''}`;
            const nextLabel = currentView === 'Semaine' ? 'Semaine suivante' : `${unitLabel} suivant${currentView === 'Semaine' ? 'e' : ''}`;
            return (
              <>
                <div className={`agenda-autoflip-edge agenda-autoflip-edge-left ${dragHotZone === 'left' ? 'is-active' : ''}`} aria-hidden="true">
                  <span className="agenda-autoflip-arrow">&larr;</span>
                  <span className="agenda-autoflip-label">{prevLabel}</span>
                </div>
                <div className={`agenda-autoflip-edge agenda-autoflip-edge-right ${dragHotZone === 'right' ? 'is-active' : ''}`} aria-hidden="true">
                  <span className="agenda-autoflip-label">{nextLabel}</span>
                  <span className="agenda-autoflip-arrow">&rarr;</span>
                </div>
              </>
            );
          })()}
          {renderView()}
        </div>
        <AgendaSidebar
          currentDate={currentDate}
          onSelectDate={handleMiniCalSelect}
          onEventClick={handleSidebarEventClick}
          activeCategories={activeCategories}
          onToggleCategory={toggleCategory}
        />
      </div>

      {showEventModal && (
        <EventCreationModal
          selectedDate={selectedDateForModal}
          eventToEdit={eventToEdit}
          dossierInitial={currentDossier || null}
          onClose={() => setShowEventModal(false)}
          onSaveSuccess={handleSaveSuccess}
          initialTime={initialTimeForModal}
        />
      )}
      {showConfirmDeleteModal && eventToDeleteId && (
        <ConfirmDeleteEventModal eventId={eventToDeleteId} onConfirm={(id) => { dispatch(deleteAgendaEvent(id)); dispatch(closeDeleteConfirmModal()); }} onCancel={() => dispatch(closeDeleteConfirmModal())} />
      )}
      {showDetailModal && selectedEventForDetail && (
        <EventDetailModal event={selectedEventForDetail} onClose={() => setShowDetailModal(false)} onEdit={(event) => { setShowDetailModal(false); setEventToEdit(event); setShowEventModal(true); }} onInitiateDelete={(event) => { setShowDetailModal(false); dispatch(openDeleteConfirmModal(event._id)); }} />
      )}
      {showMoreEventsModal && selectedDayForMoreEvents && (
        <MoreEventsModal day={selectedDayForMoreEvents} onClose={() => setShowMoreEventsModal(false)} onEventClick={(event) => { setShowMoreEventsModal(false); handleEventClick(null, event); }} />
      )}
    </div>
  );
};

export default AgendaComponent;
