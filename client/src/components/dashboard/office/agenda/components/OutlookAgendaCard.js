// Carte latérale « Agenda Outlook » (lecture seule, Microsoft Graph).
//
// Comportement volontairement discret :
//   - compte non relié à Microsoft → la carte NE S'AFFICHE PAS (aucun bruit
//     pour les comptes Google ou e-mail classique) ;
//   - autorisation agenda manquante ou connexion expirée → petit message
//     invitant à se reconnecter à Microsoft ;
//   - panne passagère → message + bouton « Réessayer » ;
//   - sinon → les prochains rendez-vous Outlook (30 jours), en lecture seule.
import React, { useCallback, useEffect, useState } from 'react';
import { getCalendarEvents, classifyMicrosoftError } from '../../../../../services/microsoftGraphClient';

const MONTH_SHORT = ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const MAX_DISPLAYED = 5;

const formatTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const OutlookEventItem = ({ event }) => {
  const start = event.start ? new Date(event.start) : null;
  const valid = start && !Number.isNaN(start.getTime());
  return (
    <div className="upcoming-item cat-outlook outlook-event-item">
      <div className="upcoming-date">
        <span className="upcoming-date-day">{valid ? start.getDate() : '—'}</span>
        <span className="upcoming-date-month">
          {valid ? MONTH_SHORT[start.getMonth()].replace('.', '').slice(0, 3).toUpperCase() : ''}
        </span>
      </div>
      <div className="upcoming-body">
        <span className="upcoming-title" title={event.subject}>{event.subject}</span>
        <span className="upcoming-meta">
          {event.isAllDay ? 'Journée entière' : (valid ? formatTime(event.start) : '')}
          {event.location ? ` · ${event.location}` : ''}
        </span>
      </div>
    </div>
  );
};

const OutlookAgendaCard = () => {
  // status : 'loading' | 'hidden' | 'reconnect' | 'error' | 'ready'
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [events, setEvents] = useState([]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await getCalendarEvents();
      setEvents((data.events || []).slice(0, MAX_DISPLAYED));
      setStatus('ready');
    } catch (err) {
      const info = classifyMicrosoftError(err);
      if (info.notConnected) {
        // Pas de compte Microsoft : on disparaît sans bruit.
        setStatus('hidden');
        return;
      }
      setMessage(info.message);
      setStatus(info.needsReconnect ? 'reconnect' : 'error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (status === 'hidden') return null;

  return (
    <div className="agenda-sidebar-card outlook-agenda-card">
      <div className="sidebar-section-header">
        <span className="sidebar-section-title">Agenda Outlook</span>
        {status === 'ready' && (
          <span className="sidebar-section-count">
            {events.length} à venir
          </span>
        )}
      </div>

      {status === 'loading' && (
        <div className="upcoming-empty">Chargement de l'agenda Outlook…</div>
      )}

      {status === 'reconnect' && (
        <div className="upcoming-empty outlook-agenda-hint">{message}</div>
      )}

      {status === 'error' && (
        <div className="upcoming-empty outlook-agenda-hint">
          {message}
          <button type="button" className="outlook-retry-btn" onClick={load}>
            Réessayer
          </button>
        </div>
      )}

      {status === 'ready' && (
        <div className="upcoming-list">
          {events.length === 0 ? (
            <div className="upcoming-empty">Aucun rendez-vous Outlook sur les 30 prochains jours.</div>
          ) : (
            events.map((ev) => <OutlookEventItem key={ev.id} event={ev} />)
          )}
        </div>
      )}
    </div>
  );
};

export default OutlookAgendaCard;
