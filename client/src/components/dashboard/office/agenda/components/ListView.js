import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { resolveCategory, getCategoryMeta } from '../categories';

const DOW_FULL = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const MONTH_SHORT = ['JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.'];

const sameDay = (a, b) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

const formatTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const ListView = ({ currentDate, activeCategories, handleEventClick }) => {
  const { events } = useSelector((s) => s.agenda);

  const groups = useMemo(() => {
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();
    const filtered = (events || [])
      .filter((e) => e && e.startDate)
      .filter((e) => {
        const d = new Date(e.startDate);
        return d.getFullYear() === year && d.getMonth() === month;
      })
      .filter((e) => !activeCategories || activeCategories.has(resolveCategory(e)))
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    const map = new Map();
    filtered.forEach((ev) => {
      const d = new Date(ev.startDate);
      const k = d.toISOString().split('T')[0];
      if (!map.has(k)) map.set(k, { date: d, events: [] });
      map.get(k).events.push(ev);
    });
    return Array.from(map.values());
  }, [events, currentDate, activeCategories]);

  const today = new Date();

  if (groups.length === 0) {
    return (
      <div className="agenda-listview">
        <div className="agenda-listview-empty">
          Aucun événement ce mois-ci.
        </div>
      </div>
    );
  }

  return (
    <div className="agenda-listview">
      {groups.map((g) => {
        const isToday = sameDay(g.date, today);
        return (
          <div key={g.date.toISOString()} className={`agenda-listview-day-group ${isToday ? 'is-today' : ''}`}>
            <div className="agenda-listview-day-header">
              <span className="agenda-listview-day-num">{g.date.getDate()}</span>
              <span className="agenda-listview-day-name">{DOW_FULL[(g.date.getDay() + 6) % 7]}</span>
              <span className="agenda-listview-day-month">{MONTH_SHORT[g.date.getMonth()]}</span>
            </div>
            {g.events.map((ev) => {
              const catKey = resolveCategory(ev);
              const meta = getCategoryMeta(catKey);
              const dossierLabel = ev.dossier?.name || ev.dossier?.label || ev.location || '';
              return (
                <div
                  key={ev._id}
                  className={`agenda-listview-row cat-${catKey}`}
                  onClick={(e) => handleEventClick?.(e, ev)}
                  role="button"
                  tabIndex={0}
                >
                  <span className="agenda-listview-time">{formatTime(ev.startDate)}</span>
                  <span className="agenda-listview-bar" />
                  <span className="agenda-listview-title" title={ev.title}>
                    {ev.title}
                    {dossierLabel ? <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 400, marginLeft: 8 }}>· {dossierLabel}</span> : null}
                  </span>
                  <span className="agenda-listview-meta">
                    <span className="agenda-listview-cat-pill">{meta.shortLabel}</span>
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export default ListView;
