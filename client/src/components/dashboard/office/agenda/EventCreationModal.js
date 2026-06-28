import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  createAgendaEvent,
  searchDossiersForAgenda,
  resetDossierSearchForAgenda,
  updateAgendaEvent,
} from '../../../../redux/slices/agendaSlice';
import dossierIcon from '../../../../assets/dossier-create.svg';
import ModifEvent from '../../../../assets/modifier.svg';
import './EventCreationModal.css';
import HoverToSpeak from '../../../common/HoverToSpeak';
import { useToast } from '../../../common/notifications/useToast';
import { EVENT_CATEGORIES as CANONICAL_EVENT_CATEGORIES } from './categories';

import DatePicker from 'react-datepicker';
import { fr } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

import DualTimePicker from './DualTimePicker';

// ============================================================================
//   Helpers
// ============================================================================

const getRoundedInitialTime = () => {
  const now = new Date();
  const minutes = now.getMinutes();
  const remainder = minutes % 15;
  if (remainder !== 0) {
    now.setMinutes(minutes + (15 - remainder));
  }
  const startDate = new Date(now.getTime());
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
  const fmt = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { initialStart: fmt(startDate), initialEnd: fmt(endDate) };
};

const DEFAULT_DEADLINE_TIME = '18:00';

const formatTime = (date) => {
  if (!date) return '';
  const d = new Date(date);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const computeDuration = (start, end) => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h00`;
  return `${h}h${String(m).padStart(2, '0')}`;
};

// Cat\u00e9gories d'\u00e9v\u00e9nements : on importe la liste CANONIQUE depuis ./categories
// pour que les couleurs et libell\u00e9s affich\u00e9s dans la modale de cr\u00e9ation
// correspondent exactement \u00e0 ceux de la sidebar et du calendrier (correctif
// du bug o\u00f9 "Personnel" rouge dans la modale \u00e9tait confondu avec "Audience"
// rouge dans la sidebar \u2014 labels et couleurs maintenant coh\u00e9rents partout).
//
// On retire "task" car les t\u00e2ches ne se cr\u00e9ent pas via cette modale (elles
// viennent du syst\u00e8me "\u00c0 faire", d\u00e9riv\u00e9es de event.type === 'task').
const EVENT_CATEGORIES = CANONICAL_EVENT_CATEGORIES.filter((c) => c.key !== 'task');

// Petites icones SVG inline
const IconCalendar = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconRepeat = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const IconBell = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const IconCheck = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconClose = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconArrow = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

// Avatar initiales depuis le nom du dossier
const getDossierInitials = (name) => {
  if (!name) return '?';
  const tokens = String(name).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
};

// Options de recurrence et de rappel (visuelles + traitees au save)
const RECURRENCE_OPTIONS = [
  { key: 'never', label: 'Jamais' },
  { key: 'daily', label: 'Tous les jours' },
  { key: 'weekly', label: 'Toutes les semaines' },
  { key: 'monthly', label: 'Tous les mois' },
];

const REMINDER_OPTIONS = [
  { key: 'none', label: 'Aucun' },
  { key: '5min', label: '5 min avant' },
  { key: '15min', label: '15 min avant' },
  { key: '30min', label: '30 min avant' },
  { key: '1h', label: '1 h avant' },
  { key: '1d', label: '1 jour avant' },
];

// ============================================================================
//   Mini-dropdown reutilisable (Recurrence / Rappel)
// ============================================================================

const InlineDropdown = ({ value, options, onChange, icon, label, ariaLabel }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = options.find((o) => o.key === value) || options[0];

  return (
    <div className="ev-dropdown" ref={ref}>
      <button
        type="button"
        className={`ev-dropdown__trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel || label}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {icon && <span className="ev-dropdown__icon">{icon}</span>}
        {label && <span className="ev-dropdown__label">{label}</span>}
        <span className="ev-dropdown__value">{current.label}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="ev-dropdown__menu" role="listbox">
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="option"
              aria-selected={opt.key === value}
              className={`ev-dropdown__item ${opt.key === value ? 'is-selected' : ''}`}
              onClick={() => { onChange(opt.key); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
//   Composant principal
// ============================================================================

const EventCreationModal = ({ selectedDate, onClose, eventToEdit = null, dossierInitial = null, onSaveSuccess, initialTime = null, defaultTab = 'event' }) => {
  const isEditMode = !!eventToEdit;
  const dispatch = useDispatch();
  const toast = useToast();
  const modalRef = useRef();
  const searchContainerRef = useRef(null);

  // En mode edit, l'onglet est determine par le type de l'evenement edite ;
  // en mode create, on utilise defaultTab (par defaut 'event', mais
  // TodoListeGeneral ouvre la modale directement sur 'task').
  const [activeTab, setActiveTab] = useState(
    isEditMode
      ? (eventToEdit.type === 'task' ? 'task' : 'event')
      : (defaultTab === 'task' ? 'task' : 'event')
  );
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

  const [title, setTitle] = useState(isEditMode ? eventToEdit.title || '' : '');
  const [description, setDescription] = useState(isEditMode ? eventToEdit.description || '' : '');
  const [dateForDisplay, setDateForDisplay] = useState(isEditMode ? new Date(eventToEdit.startDate) : selectedDate);

  const [category, setCategory] = useState(
    isEditMode && eventToEdit.category ? eventToEdit.category : 'audience'
  );

  const [allDay, setAllDay] = useState(isEditMode ? !!eventToEdit.allDay : false);
  const [recurrence, setRecurrence] = useState(
    isEditMode && eventToEdit.recurrence ? eventToEdit.recurrence : 'never'
  );
  const [reminder, setReminder] = useState(
    isEditMode && eventToEdit.reminder ? eventToEdit.reminder : '15min'
  );

  const { initialStart, initialEnd } = useMemo(() => {
    if (isEditMode && eventToEdit) {
      return {
        initialStart: formatTime(new Date(eventToEdit.startDate)),
        initialEnd: formatTime(new Date(eventToEdit.endDate)),
      };
    }
    if (initialTime) {
      const start = new Date(selectedDate);
      const [hours, minutes] = initialTime.split(':').map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) start.setHours(hours, minutes, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      return { initialStart: formatTime(start), initialEnd: formatTime(end) };
    }
    return getRoundedInitialTime();
  }, [isEditMode, eventToEdit, initialTime, selectedDate]);

  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(initialEnd);
  const [userManuallySetEndTime, setUserManuallySetEndTime] = useState(isEditMode);

  const [deadlineTime, setDeadlineTime] = useState(() => {
    if (isEditMode && eventToEdit && eventToEdit.type === 'task') {
      return formatTime(new Date(eventToEdit.startDate));
    }
    return DEFAULT_DEADLINE_TIME;
  });

  const [linkedDossier, setLinkedDossier] = useState(() => {
    if (isEditMode) return eventToEdit.dossier;
    if (dossierInitial) return { _id: dossierInitial._id, dossier: dossierInitial.dossier };
    return null;
  });

  // Case "Aucun dossier lié" : permet de créer un événement/tâche
  // explicitement non rattaché à un dossier, même si un dossier courant
  // était pré-rempli. En édition, coche automatiquement si l'événement
  // sauvegardé n'a pas de dossier.
  const [noDossier, setNoDossier] = useState(() => {
    if (isEditMode) return !eventToEdit.dossier;
    return false;
  });

  const [isSearchingDossier, setIsSearchingDossier] = useState(false);
  const [dossierSearchTerm, setDossierSearchTerm] = useState('');

  const { dossierSearchResults, dossierSearchLoading } = useSelector((state) => state.agenda);

  // Fermeture au clic exterieur de la modale
  useEffect(() => {
    const onDoc = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [onClose]);

  // Fermeture du resultat de recherche
  useEffect(() => {
    const onDoc = (e) => {
      if (isSearchingDossier && searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setIsSearchingDossier(false);
        setDossierSearchTerm('');
        dispatch(resetDossierSearchForAgenda());
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [isSearchingDossier, dispatch]);

  const handleDossierSearchChange = (e) => {
    const term = e.target.value;
    setDossierSearchTerm(term);
    if (term.trim() !== '') {
      dispatch(searchDossiersForAgenda(term));
    } else {
      dispatch(resetDossierSearchForAgenda());
    }
  };

  const handleDossierSelect = (dossier) => {
    setLinkedDossier(dossier);
    setDossierSearchTerm('');
    setIsSearchingDossier(false);
    dispatch(resetDossierSearchForAgenda());
  };

  const handleNoDossierToggle = (checked) => {
    setNoDossier(checked);
    if (checked) {
      setLinkedDossier(null);
      setIsSearchingDossier(false);
      setDossierSearchTerm('');
      dispatch(resetDossierSearchForAgenda());
    } else if (dossierInitial) {
      setLinkedDossier({ _id: dossierInitial._id, dossier: dossierInitial.dossier });
    }
  };

  // Quand on clique sur une categorie, on auto-remplit le titre avec son label,
  // sauf si l'utilisateur a deja tape un titre personnalise (i.e. qui ne
  // correspond a aucun label de categorie connu).
  const handleCategorySelect = useCallback((cat) => {
    setCategory(cat.key);
    setTitle((prev) => {
      const trimmed = (prev || '').trim();
      const isCustomTitle = trimmed.length > 0
        && !EVENT_CATEGORIES.some((c) => c.label === trimmed);
      return isCustomTitle ? prev : cat.label;
    });
  }, []);

  const handleStartTimeChange = useCallback((newTime) => {
    setStartTime(newTime);
    setUserManuallySetEndTime(false);
  }, []);

  const handleEndTimeChange = useCallback((newTime) => {
    setEndTime(newTime);
    setUserManuallySetEndTime(true);
  }, []);

  // Auto-shift end +1h quand start change et que l'utilisateur n'a pas touche a end
  useEffect(() => {
    if (userManuallySetEndTime || !startTime) return;
    const [hours, minutes] = startTime.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return;
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);
    startDate.setHours(startDate.getHours() + 1);
    const newEndHour = String(startDate.getHours()).padStart(2, '0');
    const newEndMinute = String(startDate.getMinutes()).padStart(2, '0');
    setEndTime(`${newEndHour}:${newEndMinute}`);
  }, [startTime, userManuallySetEndTime]);

  const duration = useMemo(
    () => allDay ? 'Toute la journ\u00e9e' : computeDuration(startTime, endTime),
    [startTime, endTime, allDay]
  );

  // Soumission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    let eventData;
    if (activeTab === 'task') {
      const deadlineDate = new Date(dateForDisplay);
      const [hours, minutes] = deadlineTime.split(':').map(Number);
      if (!isNaN(hours) && !isNaN(minutes)) deadlineDate.setHours(hours, minutes, 0, 0);
      else deadlineDate.setHours(0, 0, 0, 0);
      eventData = {
        title,
        description,
        deadline: deadlineDate.toISOString(),
        type: 'task',
        dossierId: linkedDossier?._id || null,
        category,
        recurrence,
        reminder,
      };
    } else {
      const [startHours, startMinutes] = startTime.split(':').map(Number);
      const [endHours, endMinutes] = endTime.split(':').map(Number);
      const eventStartDate = new Date(dateForDisplay);
      const eventEndDate = new Date(dateForDisplay);
      if (allDay) {
        eventStartDate.setHours(0, 0, 0, 0);
        eventEndDate.setHours(23, 59, 0, 0);
      } else {
        eventStartDate.setHours(startHours, startMinutes, 0, 0);
        eventEndDate.setHours(endHours, endMinutes, 0, 0);
        if (eventEndDate <= eventStartDate) eventEndDate.setDate(eventEndDate.getDate() + 1);
      }
      eventData = {
        title,
        description,
        startDate: eventStartDate.toISOString(),
        endDate: eventEndDate.toISOString(),
        type: 'event',
        dossierId: linkedDossier?._id || null,
        allDay,
        category,
        recurrence,
        reminder,
      };
    }

    try {
      let savedEvent;
      if (isEditMode) savedEvent = await dispatch(updateAgendaEvent(eventToEdit._id, eventData));
      else savedEvent = await dispatch(createAgendaEvent(eventData));
      if (onSaveSuccess) onSaveSuccess(savedEvent);
      else onClose();
    } catch (err) {
      console.error('\u00c9chec de la sauvegarde:', err);
      toast.error(`Erreur: ${err.response?.data?.message || err.message || 'Erreur inconnue.'}`);
    }
  };

  // Date affichee : "AVR 15 mer."
  const dayMonthLabel = useMemo(() => ({
    month: dateForDisplay.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '').toUpperCase(),
    day: dateForDisplay.toLocaleDateString('fr-FR', { day: '2-digit' }),
    weekday: dateForDisplay.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', ''),
  }), [dateForDisplay]);

  const dossierName = linkedDossier?.dossier?.dossier?.nom
    || linkedDossier?.dossier?.nom
    || linkedDossier?.nomDocument
    || '';
  const dossierInitials = getDossierInitials(dossierName);

  return (
    <div className="k-modal-overlay event-modal-overlay-kheops ev-overlay">
      <div className="event-modal-kheops ev-modal" ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="ev-title">
       {/* Bouton fermer : ancre en absolu au coin haut-droit de toute la modale */}
       <HoverToSpeak textToSpeak="Fermer la fenetre">
         <button type="button" className="ev-modal__close" onClick={onClose} aria-label="Fermer">
           <IconClose />
         </button>
       </HoverToSpeak>

       <div className="ev-modal__scroll">
        {/* Header */}
        <div className="ev-modal__header">
          <div className="ev-modal__header-text">
            <span className="ev-modal__breadcrumb">{isEditMode ? 'MODIFIER' : 'NOUVEAU'}</span>
            <h2 id="ev-title" className="ev-modal__title">
              {isEditMode
                ? (activeTab === 'task' ? 'Modifier la t\u00e2che' : "Modifier l'\u00e9v\u00e9nement")
                : (activeTab === 'task' ? 'Cr\u00e9er une t\u00e2che' : 'Cr\u00e9er un \u00e9v\u00e9nement')}
            </h2>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="ev-modal__form">
          {/* Onglets Evenement / Tache */}
          <div className="ev-tabs" role="tablist" aria-label="Type d'\u00e9l\u00e9ment">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'event'}
              className={`ev-tab ${activeTab === 'event' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('event')}
            >
              <IconCalendar size={14} />
              <span>&Eacute;v&eacute;nement</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'task'}
              className={`ev-tab ${activeTab === 'task' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('task')}
            >
              <IconCheck size={14} />
              <span>T&acirc;che</span>
            </button>
          </div>

          {/* Titre */}
          <div className="ev-title-field">
            <span className="ev-title-field__icon" aria-hidden="true"><IconCalendar /></span>
            <input
              type="text"
              className="ev-title-field__input"
              placeholder={activeTab === 'task' ? 'Nom de la t\u00e2che, livrable...' : 'Audience, RDV client...'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <kbd className="ev-title-field__shortcut" aria-hidden="true">&#x2318;+&crarr;</kbd>
          </div>

          {/* Categories pills (event only) */}
          {activeTab === 'event' && (
            <div className="ev-categories" role="radiogroup" aria-label="Cat\u00e9gorie d'\u00e9v\u00e9nement">
              {EVENT_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={category === c.key}
                  className={`ev-cat-pill ${category === c.key ? 'is-active' : ''}`}
                  style={category === c.key ? { '--cat-color': c.color } : { '--cat-color': c.color }}
                  onClick={() => handleCategorySelect(c)}
                >
                  <span className="ev-cat-pill__dot" aria-hidden="true" />
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {/* Date + Heures */}
          {activeTab === 'event' && (
            <div className="ev-datetime-row">
              <button
                type="button"
                className="ev-date-card"
                onClick={() => setIsDatePickerOpen((o) => !o)}
                aria-label="Choisir la date"
              >
                <span className="ev-date-card__month">{dayMonthLabel.month}</span>
                <span className="ev-date-card__day">{dayMonthLabel.day}</span>
                <span className="ev-date-card__wd">{dayMonthLabel.weekday}.</span>
              </button>

              {!allDay && (
                <>
                  <DualTimePicker
                    label="D\u00e9but"
                    value={startTime}
                    onChange={handleStartTimeChange}
                    icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
                    ariaLabel="Heure de debut"
                  />
                  <span className="ev-datetime-arrow" aria-hidden="true"><IconArrow /></span>
                  <DualTimePicker
                    label="Fin"
                    value={endTime}
                    onChange={handleEndTimeChange}
                    icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
                    ariaLabel="Heure de fin"
                  />
                </>
              )}

              {duration && (
                <div className="ev-duration">
                  <span className="ev-duration__label">DUR&Eacute;E</span>
                  <span className="ev-duration__value">{duration}</span>
                </div>
              )}

              {isDatePickerOpen && (
                <div className="ev-date-popover">
                  <DatePicker
                    selected={dateForDisplay}
                    onChange={(d) => { setDateForDisplay(d); setIsDatePickerOpen(false); }}
                    onClickOutside={() => setIsDatePickerOpen(false)}
                    locale={fr}
                    inline
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === 'task' && (
            <div className="ev-datetime-row">
              <button
                type="button"
                className="ev-date-card"
                onClick={() => setIsDatePickerOpen((o) => !o)}
                aria-label="Date d'echeance"
              >
                <span className="ev-date-card__month">{dayMonthLabel.month}</span>
                <span className="ev-date-card__day">{dayMonthLabel.day}</span>
                <span className="ev-date-card__wd">{dayMonthLabel.weekday}.</span>
              </button>
              <DualTimePicker
                label="\u00c9ch\u00e9ance"
                value={deadlineTime}
                onChange={setDeadlineTime}
                icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
                ariaLabel="Heure d'echeance"
              />
              {isDatePickerOpen && (
                <div className="ev-date-popover">
                  <DatePicker
                    selected={dateForDisplay}
                    onChange={(d) => { setDateForDisplay(d); setIsDatePickerOpen(false); }}
                    onClickOutside={() => setIsDatePickerOpen(false)}
                    locale={fr}
                    inline
                  />
                </div>
              )}
            </div>
          )}

          {/* Toute la journee (event only) */}
          {activeTab === 'event' && (
            <div className="ev-allday">
              <button
                type="button"
                role="switch"
                aria-checked={allDay}
                className={`ev-switch ${allDay ? 'is-on' : ''}`}
                onClick={() => setAllDay((v) => !v)}
                aria-label="Toute la journee"
              >
                <span className="ev-switch__knob" />
              </button>
              <span className="ev-allday__label">Toute la journ&eacute;e</span>
            </div>
          )}

          {/* Recurrence + Rappel */}
          <div className="ev-options-row">
            <InlineDropdown
              value={recurrence}
              options={RECURRENCE_OPTIONS}
              onChange={setRecurrence}
              icon={<IconRepeat size={13} />}
              label="R\u00e9currence"
              ariaLabel="Choisir la recurrence"
            />
            <InlineDropdown
              value={reminder}
              options={REMINDER_OPTIONS}
              onChange={setReminder}
              icon={<IconBell size={13} />}
              label="Rappel"
              ariaLabel="Choisir le rappel"
            />
          </div>

          {/* Case à cocher "Aucun dossier lié" */}
          <div className="ev-no-dossier">
            <label className="ev-no-dossier__label">
              <input
                type="checkbox"
                className="ev-no-dossier__checkbox"
                checked={noDossier}
                onChange={(e) => handleNoDossierToggle(e.target.checked)}
              />
              <span className="ev-no-dossier__text">Aucun dossier lié</span>
            </label>
          </div>

          {/* Lien dossier — masqué quand "Aucun dossier" est coché */}
          {!noDossier && (
          <div className="ev-dossier" ref={searchContainerRef}>
            {isSearchingDossier ? (
              <div className="ev-dossier__search">
                <input
                  type="text"
                  className="ev-dossier__search-input"
                  placeholder="Rechercher un nom de dossier..."
                  value={dossierSearchTerm}
                  onChange={handleDossierSearchChange}
                  autoFocus
                />
                {dossierSearchLoading && <div className="ev-dossier__search-loading">Recherche...</div>}
                {dossierSearchResults && dossierSearchResults.length > 0 && (
                  <div className="ev-dossier__search-results">
                    {dossierSearchResults.map((d) => (
                      <button
                        key={d._id}
                        type="button"
                        className="ev-dossier__search-item"
                        onClick={() => handleDossierSelect(d)}
                      >
                        {d.dossier?.dossier?.nom || d.dossier?.nom || 'Dossier sans nom'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : linkedDossier ? (
              <div className="ev-dossier__linked">
                <div className="ev-dossier__avatar" aria-hidden="true">{dossierInitials}</div>
                <div className="ev-dossier__info">
                  <div className="ev-dossier__caption">LI&Eacute; AU DOSSIER</div>
                  <div className="ev-dossier__name" title={dossierName}>{dossierName}</div>
                </div>
                <button
                  type="button"
                  className="ev-dossier__edit"
                  onClick={() => setIsSearchingDossier(true)}
                  title="Modifier le dossier li\u00e9"
                  aria-label="Modifier le dossier lie"
                >
                  <img src={ModifEvent} alt="" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="ev-dossier__link-btn"
                onClick={() => setIsSearchingDossier(true)}
              >
                <img src={dossierIcon} alt="" aria-hidden="true" className="k-icon-sm" />
                Relier &agrave; un dossier
              </button>
            )}
          </div>
          )}

          {/* Description */}
          <div className="ev-desc">
            <div className="ev-desc__head">
              <span className="ev-desc__label">DESCRIPTION</span>
              <div className="ev-desc__toolbar" aria-hidden="true">
                <span className="ev-desc__toolbar-btn" title="Gras"><b>B</b></span>
                <span className="ev-desc__toolbar-btn" title="Italique"><i>I</i></span>
                <span className="ev-desc__toolbar-btn" title="Pi\u00e8ce jointe">&#64;</span>
              </div>
            </div>
            <textarea
              className="ev-desc__textarea"
              placeholder="Notes, ordre du jour, lien visio..."
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              rows={4}
              maxLength={500}
            />
            <div className="ev-desc__meta">
              <span>Markdown support&eacute;</span>
              <span>{description.length} / 500</span>
            </div>
          </div>

          {/* Footer : Annuler + Enregistrer */}
          <div className="ev-modal__footer">
            <button type="button" onClick={onClose} className="ev-btn ev-btn--ghost">
              Annuler
            </button>
            <button type="submit" className="ev-btn ev-btn--primary" disabled={!title.trim()}>
              <IconCheck />
              <span>{isEditMode ? 'Modifier' : 'Enregistrer'}</span>
              <kbd className="ev-btn__shortcut" aria-hidden="true">&#x2318;+&crarr;</kbd>
            </button>
          </div>
        </form>
       </div>
      </div>
    </div>
  );
};

export default EventCreationModal;
