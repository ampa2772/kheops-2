import React, { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  EVENT_CATEGORIES,
  CATEGORY_ICONS,
  resolveCategory,
  getCategoryMeta,
  IconClock,
  IconPin,
} from '../categories';

const DOW_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DOW_FULL = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const MONTH_SHORT = ['Janv.', 'Févr.', 'Mars', 'Avril', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

const sameDay = (a, b) =>
  a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();

const formatTime = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const buildMiniCalendar = (cursor) => {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const startDow = firstOfMonth.getDay() === 0 ? 6 : firstOfMonth.getDay() - 1;
  const days = [];
  const lastOfPrev = new Date(year, month, 0).getDate();
  for (let i = startDow; i > 0; i--) {
    days.push({ date: new Date(year, month - 1, lastOfPrev - i + 1, 12), other: true });
  }
  for (let d = 1; d <= lastOfMonth.getDate(); d++) {
    days.push({ date: new Date(year, month, d, 12), other: false });
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    days.push({ date: next, other: true });
  }
  // 6 rows max
  while (days.length < 42) {
    const last = days[days.length - 1].date;
    const next = new Date(last);
    next.setDate(last.getDate() + 1);
    days.push({ date: next, other: true });
  }
  return days.slice(0, 42);
};

const MiniCalendar = ({ currentDate, onSelectDate, eventsByDateKey }) => {
  const [cursor, setCursor] = useState(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));

  React.useEffect(() => {
    setCursor(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
  }, [currentDate]);

  const days = useMemo(() => buildMiniCalendar(cursor), [cursor]);
  const today = new Date();

  const moveMonth = (delta) => {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  };

  return (
    <div className="agenda-sidebar-card">
      <div className="mini-cal-header">
        <div className="mini-cal-title">
          {MONTH_SHORT[cursor.getMonth()]}
          <span className="mini-cal-year">{cursor.getFullYear()}</span>
        </div>
        <div className="mini-cal-nav">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Mois précédent">{'<'}</button>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Mois suivant">{'>'}</button>
        </div>
      </div>
      <div className="mini-cal-grid">
        {DOW_LABELS.map((d, i) => (
          <div key={`${d}-${i}`} className="mini-cal-dow">{d}</div>
        ))}
        {days.map((d, i) => {
          const key = d.date.toISOString().split('T')[0];
          const dayEvents = eventsByDateKey.get(key);
          const firstEvent = dayEvents && dayEvents[0];
          const ringColor = firstEvent ? getCategoryMeta(resolveCategory(firstEvent)).color : null;
          const isToday = sameDay(d.date, today);
          return (
            <div
              key={i}
              className="mini-cal-day-wrap"
              onClick={() => onSelectDate(new Date(d.date))}
              role="button"
              tabIndex={0}
            >
              <span
                className={[
                  'mini-cal-day',
                  d.other ? 'is-other-month' : '',
                  isToday ? 'is-today' : '',
                  ringColor ? 'has-events' : '',
                ].filter(Boolean).join(' ')}
                style={ringColor ? { '--day-ring': ringColor } : undefined}
              >
                {d.date.getDate()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const UpcomingItem = ({ event, onClick }) => {
  const catKey = resolveCategory(event);
  const meta = getCategoryMeta(catKey);
  const Icon = CATEGORY_ICONS[catKey];
  const start = new Date(event.startDate);
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);

  let eyebrow;
  if (sameDay(start, today)) eyebrow = "AUJ.";
  else if (sameDay(start, tomorrow)) eyebrow = "DEMAIN";
  else eyebrow = DOW_FULL[(start.getDay() + 6) % 7];

  const dossierLabel = event.dossier?.name || event.dossier?.label || event.location || '';

  return (
    <div className={`upcoming-item cat-${catKey}`} onClick={() => onClick?.(event)}>
      <div className="upcoming-date">
        <span className="upcoming-date-eyebrow">{eyebrow}</span>
        <span className="upcoming-date-day">{start.getDate()}</span>
        <span className="upcoming-date-month">{MONTH_SHORT[start.getMonth()].replace('.', '').slice(0,3).toUpperCase()}</span>
      </div>
      <div className="upcoming-body">
        <span className="upcoming-cat">
          <Icon />
          {meta.shortLabel}
        </span>
        <span className="upcoming-title" title={event.title}>{event.title}</span>
        <span className="upcoming-meta">
          <IconClock />
          {formatTime(event.startDate)}
          {dossierLabel && (
            <>
              <IconPin />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{dossierLabel}</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
};

const AgendaSidebar = ({
  currentDate,
  onSelectDate,
  onEventClick,
  activeCategories,
  onToggleCategory,
}) => {
  const { events } = useSelector((s) => s.agenda);

  const filteredEvents = useMemo(() => {
    if (!activeCategories) return events || [];
    return (events || []).filter((e) => activeCategories.has(resolveCategory(e)));
  }, [events, activeCategories]);

  const eventsByDateKey = useMemo(() => {
    const m = new Map();
    filteredEvents.forEach((ev) => {
      if (!ev.startDate) return;
      const d = new Date(ev.startDate);
      if (Number.isNaN(d.getTime())) return;
      const k = d.toISOString().split('T')[0];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(ev);
    });
    return m;
  }, [filteredEvents]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return [...filteredEvents]
      .filter((e) => new Date(e.startDate) >= new Date(now.getFullYear(), now.getMonth(), now.getDate()))
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .slice(0, 3);
  }, [filteredEvents]);

  const totalCats = EVENT_CATEGORIES.length;
  const activeCount = activeCategories ? activeCategories.size : totalCats;

  return (
    <aside className="agenda-sidebar">
      <MiniCalendar
        currentDate={currentDate}
        onSelectDate={onSelectDate}
        eventsByDateKey={eventsByDateKey}
      />

      <div className="agenda-sidebar-card">
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 7 12 12 15 14" />
            </svg>
            À venir
          </span>
          <span className="sidebar-section-count">{upcoming.length} prochain{upcoming.length > 1 ? 's' : ''}</span>
        </div>
        <div className="upcoming-list">
          {upcoming.length === 0 ? (
            <div className="upcoming-empty">Aucun événement à venir.</div>
          ) : (
            upcoming.map((ev) => (
              <UpcomingItem key={ev._id} event={ev} onClick={onEventClick} />
            ))
          )}
        </div>
      </div>

      <div className="agenda-sidebar-card">
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">Catégories</span>
          <span className="sidebar-section-count">{activeCount}/{totalCats}</span>
        </div>
        <div className="cat-chips">
          {EVENT_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.key];
            const isActive = !activeCategories || activeCategories.has(cat.key);
            return (
              <button
                key={cat.key}
                type="button"
                className={`cat-chip cat-${cat.key} ${isActive ? 'is-active' : 'is-disabled'}`}
                onClick={() => onToggleCategory(cat.key)}
                aria-pressed={isActive}
                title={`${isActive ? 'Masquer' : 'Afficher'} : ${cat.label}`}
              >
                <Icon />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
};

export default AgendaSidebar;
