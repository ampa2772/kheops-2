import React, { useEffect, useRef, useState } from 'react';
import { useHoverToSpeak } from '../../../../../services/speechService';
import { EVENT_CATEGORIES, CATEGORY_ICONS, IconFunnel, IconPlus } from '../categories';

const VIEWS = ['Jour', 'Semaine', 'Mois', 'Liste'];

const AgendaHeader = ({
  currentDate,
  currentView,
  isSpeechEnabled,
  onToday,
  onPrev,
  onNext,
  onViewChange,
  onCreateNew,
  activeCategories,
  onToggleCategory,
}) => {
  const filterRef = useRef(null);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (!filterOpen) return undefined;
    const onDocClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [filterOpen]);

  const monthLong = currentDate.toLocaleDateString('fr-FR', { month: 'long' });
  const monthCapitalized = monthLong.charAt(0).toUpperCase() + monthLong.slice(1);
  const year = currentDate.getFullYear();

  const getSecondaryTitle = () => {
    if (currentView === 'Jour') {
      return currentDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' });
    }
    if (currentView === 'Semaine') {
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay() === 0 ? 6 : startOfWeek.getDay() - 1;
      startOfWeek.setDate(startOfWeek.getDate() - day);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${startOfWeek.getDate()} – ${endOfWeek.getDate()} ${endOfWeek.toLocaleDateString('fr-FR', { month: 'short' })}`;
    }
    return null;
  };

  const secondary = getSecondaryTitle();

  const headerTitleHoverProps = useHoverToSpeak(`${monthCapitalized} ${year}`, isSpeechEnabled);
  const prevButtonHoverProps = useHoverToSpeak('Période précédente', isSpeechEnabled);
  const nextButtonHoverProps = useHoverToSpeak('Période suivante', isSpeechEnabled);
  const todayButtonHoverProps = useHoverToSpeak("Aujourd'hui", isSpeechEnabled);
  const filterHoverProps = useHoverToSpeak('Filtrer par catégorie', isSpeechEnabled);
  const newHoverProps = useHoverToSpeak('Créer un nouvel événement', isSpeechEnabled);

  const totalCats = EVENT_CATEGORIES.length;
  const activeCount = activeCategories ? activeCategories.size : totalCats;
  const filterIsActive = activeCount < totalCats;

  return (
    <div className="agenda-header-kheops">
      <div className="agenda-header-left-controls">
        <button
          onClick={onToday}
          className="agenda-button-kheops agenda-today-btn-kheops"
          aria-label="Revenir au jour courant"
          {...todayButtonHoverProps}
        >Aujourd'hui</button>
        <button
          onClick={onPrev}
          className="agenda-button-kheops agenda-nav-arrow-kheops"
          aria-label="Période précédente"
          {...prevButtonHoverProps}
        >{'<'}</button>
        <button
          onClick={onNext}
          className="agenda-button-kheops agenda-nav-arrow-kheops"
          aria-label="Période suivante"
          {...nextButtonHoverProps}
        >{'>'}</button>
        <div className="agenda-title-block" {...headerTitleHoverProps}>
          <span className="agenda-title-eyebrow">Calendrier</span>
          <span className="agenda-title-main">
            {secondary ? `${secondary} ` : ''}{monthCapitalized}
            <span className="agenda-title-year">{year}</span>
          </span>
        </div>
      </div>

      <div className="agenda-header-right-controls">
        <div className="agenda-view-tabs" role="tablist" aria-label="Vue de l'agenda">
          {VIEWS.map((view) => (
            <button
              key={view}
              role="tab"
              aria-selected={currentView === view}
              className={`agenda-view-tab ${currentView === view ? 'is-active' : ''}`}
              onClick={() => onViewChange(view)}
            >
              {view}
            </button>
          ))}
        </div>

        <div className="agenda-view-selector-kheops" ref={filterRef}>
          <button
            type="button"
            className={`agenda-button-kheops agenda-filter-btn ${filterIsActive ? 'is-active' : ''}`}
            onClick={() => setFilterOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={filterOpen}
            aria-label="Filtrer les événements"
            {...filterHoverProps}
          >
            <IconFunnel />
            {filterIsActive && <span className="agenda-filter-dot" />}
          </button>
          {filterOpen && (
            <div className="agenda-filter-popover" role="menu">
              {EVENT_CATEGORIES.map((cat) => {
                const Icon = CATEGORY_ICONS[cat.key];
                const checked = !activeCategories || activeCategories.has(cat.key);
                return (
                  <label key={cat.key} className="agenda-filter-popover-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleCategory(cat.key)}
                    />
                    <span style={{ color: cat.color, display: 'inline-flex' }}><Icon /></span>
                    <span>{cat.label}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <button
          type="button"
          className="agenda-new-btn"
          onClick={onCreateNew}
          aria-label="Créer un nouvel événement"
          {...newHoverProps}
        >
          <IconPlus />
          Nouveau
        </button>
      </div>
    </div>
  );
};

export default AgendaHeader;
