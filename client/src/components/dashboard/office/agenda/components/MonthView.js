import React, { useState } from 'react';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import { useHoverToSpeak } from '../../../../../services/speechService';
import { resolveCategory } from '../categories';

const joursSemaine = ['LUN.', 'MAR.', 'MER.', 'JEU.', 'VEN.', 'SAM.', 'DIM.'];

const formatEventTime = (dateString) =>
  new Date(dateString).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const isSameDayKey = (a, b) => {
  return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const DayCell = ({
  jourObj,
  rowIndex,
  isSpeechEnabled,
  estAujourdhui,
  handleDayClick,
  handleEventClick,
  handleMoreEventsClick,
  maxEventsToShow,
  activeCategories,
  onEventDrop,
}) => {
  const fullDateStringForDay = jourObj.date.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const dayHoverProps = useHoverToSpeak(fullDateStringForDay, isSpeechEnabled);
  const [isDragOver, setIsDragOver] = useState(false);

  const dailyEvents = (jourObj.events || []).filter(
    (e) => !activeCategories || activeCategories.has(resolveCategory(e))
  );
  const eventsToDisplay = dailyEvents.slice(0, maxEventsToShow);
  const remainingEventsCount = dailyEvents.length - maxEventsToShow;

  const isFirst = jourObj.date.getDate() === 1 && jourObj.moisActuel;
  const monthTag = jourObj.date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '').toUpperCase();

  const handleDragOver = (e) => {
    if (!onEventDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => {
    if (!onEventDrop) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const eventId = e.dataTransfer.getData('text/plain');
    if (!eventId) return;
    // Si l'event est deja sur ce jour, ne rien faire (pas de modification).
    const alreadyHere = (jourObj.events || []).some(ev => ev._id === eventId);
    if (alreadyHere) {
      const ev = (jourObj.events || []).find(e2 => e2._id === eventId);
      const evDate = ev && ev.startDate ? new Date(ev.startDate) : null;
      if (evDate && isSameDayKey(evDate, jourObj.date)) return;
    }
    onEventDrop(eventId, jourObj.date);
  };

  return (
    <div
      className={`agenda-day-kheops ${!jourObj.moisActuel ? 'not-current-month-kheops' : ''} ${estAujourdhui(jourObj.date) && jourObj.moisActuel ? 'today-kheops' : ''} ${rowIndex % 2 === 0 ? 'agenda-day-row-even' : 'agenda-day-row-odd'} ${isDragOver ? 'agenda-day-drag-over' : ''}`}
      onClick={() => handleDayClick(jourObj)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      {...dayHoverProps}
    >
      <span className="agenda-day-number-kheops">
        {jourObj.date.getDate()}
        {isFirst && <span className="agenda-day-month-tag">{monthTag}</span>}
      </span>
      <div className="agenda-events-kheops">
        {eventsToDisplay.map((event) => {
          const eventDate = new Date(event.startDate);
          const fullDateString = eventDate.toLocaleDateString('fr-FR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          });
          const textToSpeak = `${event.title}, le ${fullDateString} à ${formatEventTime(event.startDate)}`;
          const catKey = resolveCategory(event);
          const handleEventDragStart = (e) => {
            if (!onEventDrop) return;
            e.stopPropagation();
            e.dataTransfer.setData('text/plain', event._id);
            e.dataTransfer.effectAllowed = 'move';
          };
          return (
            <HoverToSpeak key={event._id} textToSpeak={textToSpeak}>
              <div
                className={`agenda-event-item-kheops cat-${catKey} ${event.type === 'task' ? 'task-item' : ''}`}
                onClick={(e) => handleEventClick(e, event)}
                title={event.title}
                draggable={!!onEventDrop}
                onDragStart={handleEventDragStart}
              >
                <span className="agenda-event-time-kheops">{formatEventTime(event.startDate)}</span>
                <span className="agenda-event-title-kheops">{event.title}</span>
              </div>
            </HoverToSpeak>
          );
        })}
        {remainingEventsCount > 0 && (
          <HoverToSpeak textToSpeak={`${remainingEventsCount} autres événements`}>
            <div
              className="agenda-more-events-link-kheops"
              onClick={(e) => handleMoreEventsClick(e, { ...jourObj, events: dailyEvents })}
            >
              + {remainingEventsCount} autre{remainingEventsCount > 1 ? 's' : ''}
            </div>
          </HoverToSpeak>
        )}
      </div>
    </div>
  );
};

const MonthView = ({
  joursDuCalendrier,
  onWheel,
  isSpeechEnabled,
  estAujourdhui,
  handleDayClick,
  handleEventClick,
  handleMoreEventsClick,
  maxEventsToShow,
  activeCategories,
  onEventDrop,
}) => {
  return (
    <div className="agenda-grid-kheops" onWheel={onWheel}>
      {joursSemaine.map((jour) => (
        <div key={jour} className="agenda-weekday-kheops">{jour}</div>
      ))}
      {joursDuCalendrier.map((jourObj, index) => (
        <DayCell
          key={index}
          jourObj={jourObj}
          rowIndex={Math.floor(index / 7)}
          isSpeechEnabled={isSpeechEnabled}
          estAujourdhui={estAujourdhui}
          handleDayClick={handleDayClick}
          handleEventClick={handleEventClick}
          handleMoreEventsClick={handleMoreEventsClick}
          maxEventsToShow={maxEventsToShow}
          activeCategories={activeCategories}
          onEventDrop={onEventDrop}
        />
      ))}
    </div>
  );
};

export default MonthView;
