import { useState, useEffect, useCallback, useRef } from 'react';

const HOUR_PX = 60;       // hauteur d'un slot dans la grille temporelle
const SNAP_MINUTES = 15;  // pas de quart d'heure
const MIN_DURATION_MS = SNAP_MINUTES * 60 * 1000;

const snapMinutes = (m) => Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;

/**
 * useEventResize — gere le redimensionnement d'un event via les poignees
 * haut/bas. Appelle onCommit(eventId, newStartIso, newEndIso) au mouseup.
 *
 * Retourne :
 *   - startResize(event, edge, mouseDownEvent) : a brancher sur onMouseDown
 *     des poignees.
 *   - resizeOverride(eventId) : si l'event est en cours de resize, retourne
 *     { startDate, endDate } a utiliser pour calculer le style en live ;
 *     sinon retourne null. Permet d'afficher le feedback visuel.
 *   - isResizingId : id de l'event en cours de resize (ou null).
 */
export const useEventResize = (onCommit) => {
  const [resizeState, setResizeState] = useState(null);
  // ref pour acceder a l'etat dans les listeners window
  const resizeStateRef = useRef(null);
  resizeStateRef.current = resizeState;

  const startResize = useCallback((event, edge, mouseDownEvent) => {
    if (!event || event.type === 'task') return;
    mouseDownEvent.preventDefault();
    mouseDownEvent.stopPropagation();
    const originalStart = new Date(event.startDate);
    const originalEnd = event.endDate ? new Date(event.endDate) : new Date(originalStart.getTime() + 60 * 60 * 1000);
    setResizeState({
      eventId: event._id,
      edge,
      originalStart,
      originalEnd,
      pointerStartY: mouseDownEvent.clientY,
      liveStart: originalStart,
      liveEnd: originalEnd,
    });
  }, []);

  useEffect(() => {
    if (!resizeState) return;

    const onMouseMove = (e) => {
      const cur = resizeStateRef.current;
      if (!cur) return;
      const deltaY = e.clientY - cur.pointerStartY;
      const deltaMinutesRaw = (deltaY / HOUR_PX) * 60;
      const deltaMinutes = snapMinutes(deltaMinutesRaw);

      if (cur.edge === 'top') {
        let newStart = new Date(cur.originalStart.getTime() + deltaMinutes * 60000);
        const maxStart = new Date(cur.originalEnd.getTime() - MIN_DURATION_MS);
        if (newStart > maxStart) newStart = maxStart;
        // Skip setState si la position snappee n'a pas change (evite des
        // rerenders inutiles qui font scintiller l'event)
        if (newStart.getTime() === cur.liveStart.getTime()) return;
        setResizeState((s) => s && { ...s, liveStart: newStart, liveEnd: cur.originalEnd });
      } else {
        let newEnd = new Date(cur.originalEnd.getTime() + deltaMinutes * 60000);
        const minEnd = new Date(cur.originalStart.getTime() + MIN_DURATION_MS);
        if (newEnd < minEnd) newEnd = minEnd;
        if (newEnd.getTime() === cur.liveEnd.getTime()) return;
        setResizeState((s) => s && { ...s, liveStart: cur.originalStart, liveEnd: newEnd });
      }
    };

    const onMouseUp = async () => {
      const cur = resizeStateRef.current;
      if (!cur) { setResizeState(null); return; }
      const startChanged = cur.liveStart.getTime() !== cur.originalStart.getTime();
      const endChanged = cur.liveEnd.getTime() !== cur.originalEnd.getTime();
      const didResize = startChanged || endChanged;

      // Bloque le click natif que le browser va emettre apres ce mouseup
      // (sinon ouvre la modale detail de l'event). Listener one-shot en
      // capture phase pour avaler le premier click et le suivant uniquement.
      if (didResize) {
        const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
        window.addEventListener('click', swallow, { capture: true, once: true });
        // Filet de securite : retire le listener apres 300ms s'il n'a pas tire
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 300);
      }

      if (didResize && onCommit) {
        try {
          // On attend que le commit (update + fetch) ait propage le state Redux,
          // puis on retire l'override visuel pour eviter un flash de position.
          await onCommit(cur.eventId, cur.liveStart.toISOString(), cur.liveEnd.toISOString());
        } catch (_) { /* deja loggue */ }
      }
      setResizeState(null);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [resizeState, onCommit]);

  const resizeOverride = useCallback((eventId) => {
    if (!resizeState || resizeState.eventId !== eventId) return null;
    return { startDate: resizeState.liveStart, endDate: resizeState.liveEnd };
  }, [resizeState]);

  return {
    startResize,
    resizeOverride,
    isResizingId: resizeState?.eventId || null,
  };
};
