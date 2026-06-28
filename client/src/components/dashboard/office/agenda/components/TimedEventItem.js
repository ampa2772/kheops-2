import React from 'react';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import { resolveCategory } from '../categories';

const formatEventTime = (dateOrStr) =>
  new Date(dateOrStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Calcule le style positionnel d'un event dans la grille (top/height en %)
 * en fonction des startDate / endDate fournis. Si overrideStart/overrideEnd
 * sont passes (resize en cours), ils ont priorite.
 */
const calculateStyle = (startDate, endDate) => {
  const s = new Date(startDate);
  const e = new Date(endDate);
  const startMinutes = s.getMinutes();
  let durationMinutes = (e - s) / (1000 * 60);
  if (durationMinutes === 0) durationMinutes = 30;
  if (durationMinutes < 0) return { display: 'none' };
  const top = (startMinutes / 60) * 100;
  const height = (durationMinutes / 60) * 100;
  let fontSize = durationMinutes < 30 ? '8.5px' : (durationMinutes < 45 ? '9.5px' : '10.5px');
  return { top: `${top}%`, height: `${height}%`, fontSize };
};

/**
 * TimedEventItem — rendu d'un event dans une vue Semaine/Jour.
 * Gere drag&drop horizontal/vertical + poignees de resize haut/bas.
 *
 * Pendant un resize, le style est calcule a partir de liveStart/liveEnd
 * pour un feedback visuel temps reel.
 *
 * Les tasks (event.type === 'task') n'ont pas de poignees de resize.
 */
// Image transparente 1x1 utilisee pour cacher le drag image natif HTML5.
// Permet d'afficher uniquement notre ghost custom dimensionne a la duree
// de l'event a la place du fantome browser.
const EMPTY_DRAG_IMAGE_SRC = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

const TimedEventItem = ({
  event,
  speechText,
  hoverTitle,
  showDossier,
  onClick,
  onEventDrop,
  onDragStartEvent,
  isBeingDragged,
  onResizeStart,
  resizeOverride,
  isFlashTarget,
}) => {
  const liveStart = resizeOverride?.startDate || event.startDate;
  const liveEnd = resizeOverride?.endDate || event.endDate;
  const style = calculateStyle(liveStart, liveEnd);

  const handleEventDragStart = (e) => {
    if (!onEventDrop) return;
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', event._id);
    e.dataTransfer.effectAllowed = 'move';
    // Cache le drag image natif pour ne montrer que notre ghost custom
    const img = new Image();
    img.src = EMPTY_DRAG_IMAGE_SRC;
    try { e.dataTransfer.setDragImage(img, 0, 0); } catch (_) { /* ignore */ }
    if (onDragStartEvent) onDragStartEvent(event);
  };

  const canResize = event.type !== 'task' && !!onResizeStart;
  const isResizing = !!resizeOverride;

  return (
    <HoverToSpeak textToSpeak={speechText}>
      <div
        className={`grid-event-item cat-${resolveCategory(event)} ${event.type === 'task' ? 'task-item' : ''} ${isResizing ? 'is-resizing' : ''} ${isBeingDragged ? 'is-being-dragged' : ''} ${isFlashTarget ? 'k2-flash-target' : ''}`}
        style={style}
        onClick={(e) => { if (!isResizing) onClick(e, event); }}
        title={hoverTitle}
        draggable={!!onEventDrop && !isResizing}
        onDragStart={handleEventDragStart}
      >
        {canResize && (
          <div
            className="grid-event-resize-handle grid-event-resize-handle-top"
            onMouseDown={(e) => onResizeStart(event, 'top', e)}
            aria-hidden="true"
          />
        )}
        <span className="grid-event-title">{event.title}</span>
        {showDossier && event.dossier && (
          <span className="grid-event-dossier">{event.dossier.dossier?.dossier?.nom}</span>
        )}
        {isResizing && (
          <span className="grid-event-live-times">
            {formatEventTime(liveStart)} – {formatEventTime(liveEnd)}
          </span>
        )}
        {canResize && (
          <div
            className="grid-event-resize-handle grid-event-resize-handle-bottom"
            onMouseDown={(e) => onResizeStart(event, 'bottom', e)}
            aria-hidden="true"
          />
        )}
      </div>
    </HoverToSpeak>
  );
};

export default TimedEventItem;
