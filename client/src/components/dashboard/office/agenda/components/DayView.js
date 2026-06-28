import React, { useState, useRef, useEffect, useCallback } from 'react';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import { resolveCategory } from '../categories';
import TimedEventItem from './TimedEventItem';
import { useEventResize } from '../hooks/useEventResize';

const joursSemaine = ['LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.', 'DIM.'];
const formatEventTime = (dateString) => new Date(dateString).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const isSameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const HOUR_PX = 60;
const SNAP_MINUTES = 15;
const SNAP_PX = HOUR_PX * SNAP_MINUTES / 60;

const HourSlot = ({ date, hour, events, passesFilter, handleTimeSlotClick, handleEventClick, onEventDrop, onDragStartEvent, draggedEventId, onResizeStart, resizeOverrideFor, flashEventId }) => (
  <div
    className="time-grid-hour-slot"
    onClick={() => handleTimeSlotClick(date, hour)}
  >
    {events.filter(passesFilter).map(event => (
      <TimedEventItem
        key={event._id}
        event={event}
        speechText={`${event.title}, de ${formatEventTime(event.startDate)} à ${formatEventTime(event.endDate)}`}
        hoverTitle={`${event.title} (${formatEventTime(event.startDate)} - ${formatEventTime(event.endDate)})`}
        showDossier
        onClick={handleEventClick}
        onEventDrop={onEventDrop}
        onDragStartEvent={onDragStartEvent}
        isBeingDragged={draggedEventId === event._id}
        onResizeStart={onResizeStart}
        resizeOverride={resizeOverrideFor(event._id)}
        isFlashTarget={flashEventId === event._id}
      />
    ))}
  </div>
);

const DayView = ({ date, estAujourdhui, getEventsForDay, handleTimeSlotClick, handleEventClick, activeCategories, onEventDrop, onEventResize, scrollBodyRef, flashEventId }) => {
  const passesFilter = (event) => !activeCategories || activeCategories.has(resolveCategory(event));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dayHeaderText = date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const { startResize, resizeOverride } = useEventResize(onEventResize);

  const [dragGhost, setDragGhost] = useState(null);
  const draggedEventRef = useRef(null);
  const pendingCommitRef = useRef(false);

  const handleDragStartEvent = useCallback((event) => {
    draggedEventRef.current = event;
  }, []);

  const computeMinutesFromColumn = (e, colEl) => {
    const rect = colEl.getBoundingClientRect();
    const y = e.clientY - rect.top;
    let minutesAbs = Math.round(y / SNAP_PX) * SNAP_MINUTES;
    if (minutesAbs < 0) minutesAbs = 0;
    if (minutesAbs > 24 * 60 - SNAP_MINUTES) minutesAbs = 24 * 60 - SNAP_MINUTES;
    return minutesAbs;
  };

  const handleColumnDragOver = (e) => {
    if (!onEventDrop || !draggedEventRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const minutesAbs = computeMinutesFromColumn(e, e.currentTarget);
    setDragGhost((cur) => {
      if (cur && cur.minutesAbs === minutesAbs) return cur;
      return { event: draggedEventRef.current, date, minutesAbs };
    });
  };

  const handleColumnDrop = async (e) => {
    if (!onEventDrop || !draggedEventRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const minutesAbs = computeMinutesFromColumn(e, e.currentTarget);
    const hour = Math.floor(minutesAbs / 60);
    const minute = minutesAbs % 60;
    const eventBeingDropped = draggedEventRef.current;
    pendingCommitRef.current = true;
    try {
      await onEventDrop(eventBeingDropped._id, date, hour, minute);
    } catch (_) { /* deja loggue */ }
    pendingCommitRef.current = false;
    setDragGhost(null);
    draggedEventRef.current = null;
  };

  useEffect(() => {
    const onEnd = () => {
      if (pendingCommitRef.current) return;
      setDragGhost(null);
      draggedEventRef.current = null;
    };
    window.addEventListener('dragend', onEnd);
    window.addEventListener('drop', onEnd);
    return () => {
      window.removeEventListener('dragend', onEnd);
      window.removeEventListener('drop', onEnd);
    };
  }, []);

  const showGhost = dragGhost && dragGhost.event && isSameDay(dragGhost.date, date);
  let ghostStyle = null;
  let ghostLabel = '';
  let ghostCat = '';
  if (showGhost) {
    const ev = dragGhost.event;
    const durationMs = (new Date(ev.endDate) - new Date(ev.startDate)) || 60 * 60 * 1000;
    const durationMin = Math.max(durationMs / 60000, SNAP_MINUTES);
    ghostStyle = { top: `${dragGhost.minutesAbs}px`, height: `${durationMin}px` };
    const startH = Math.floor(dragGhost.minutesAbs / 60);
    const startM = dragGhost.minutesAbs % 60;
    const endTotal = dragGhost.minutesAbs + durationMin;
    const endH = Math.floor(endTotal / 60) % 24;
    const endM = endTotal % 60;
    const fmt = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    ghostLabel = `${fmt(startH, startM)} – ${fmt(endH, endM)}`;
    ghostCat = resolveCategory(ev);
  }

  return (
    <div className="agenda-time-grid day-view-grid">
      <header className="time-grid-header">
        <div className="time-grid-gmt-spacer">GMT+02</div>
        <HoverToSpeak textToSpeak={dayHeaderText}>
          <div className={`time-grid-day-header ${estAujourdhui(date) ? 'today' : ''}`}>
            <span className="day-header-name">{joursSemaine[date.getDay() === 0 ? 6 : date.getDay() - 1]}</span>
            <span className="day-header-number">{date.getDate()}</span>
          </div>
        </HoverToSpeak>
      </header>

      <div className="time-grid-body" ref={scrollBodyRef}>
        <div className="time-grid-timeline">
          {hours.map(hour => (
            <div key={hour} className="time-grid-hour-label">
              {hour > 0 && <span>{`${hour.toString().padStart(2, '0')}:00`}</span>}
            </div>
          ))}
        </div>

        <div
          className="time-grid-day-column"
          style={{ gridColumn: 2 }}
          onDragOver={handleColumnDragOver}
          onDrop={handleColumnDrop}
        >
          {hours.map(hour => {
            const eventsForHour = getEventsForDay(date).filter(event => new Date(event.startDate).getHours() === hour);
            return (
              <HourSlot
                key={hour}
                date={date}
                hour={hour}
                events={eventsForHour}
                passesFilter={passesFilter}
                handleTimeSlotClick={handleTimeSlotClick}
                handleEventClick={handleEventClick}
                onEventDrop={onEventDrop}
                onDragStartEvent={handleDragStartEvent}
                draggedEventId={dragGhost?.event?._id || null}
                onResizeStart={startResize}
                resizeOverrideFor={resizeOverride}
                flashEventId={flashEventId}
              />
            );
          })}
          {showGhost && (
            <div className={`grid-event-drag-ghost cat-${ghostCat}`} style={ghostStyle} aria-hidden="true">
              <span className="grid-event-drag-ghost-label">{ghostLabel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DayView;
