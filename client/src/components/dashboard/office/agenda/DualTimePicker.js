import React, { useEffect, useRef, useState } from 'react';
import ClockPicker from './ClockPicker';
import './DualTimePicker.css';

/**
 * DualTimePicker
 *
 * Combine un champ HH:MM editable au clavier ET un cadran analogique
 * (ClockPicker) reglable a la souris/touch. Les deux modes sont synchronises.
 *
 * Props:
 *  - value: string "HH:MM"
 *  - onChange: (newValue: string) => void
 *  - label: string (optionnel) — petit label au-dessus
 *  - icon: ReactNode (optionnel) — icone prefixe affichee dans le champ
 */
const ClockIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const isValidTime = (s) => /^([01]?\d|2[0-3]):([0-5]\d)$/.test(s);

const normalize = (s) => {
  const m = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return null;
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mi = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
};

const DualTimePicker = ({ value, onChange, label, icon, ariaLabel }) => {
  const [showClock, setShowClock] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const wrapRef = useRef(null);
  const popoverRef = useRef(null);

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  // Fermer le popover au clic exterieur
  useEffect(() => {
    if (!showClock) return undefined;
    const onDoc = (e) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target) &&
        popoverRef.current && !popoverRef.current.contains(e.target)
      ) {
        setShowClock(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [showClock]);

  const commit = (next) => {
    const norm = normalize(next) || (isValidTime(next) ? next : null);
    if (norm) {
      onChange && onChange(norm);
      setDraft(norm);
    } else {
      setDraft(value || '');
    }
  };

  const handleInputChange = (e) => {
    let v = e.target.value.replace(/[^0-9:]/g, '');
    // Insertion auto du ":" apres 2 chiffres
    if (v.length === 2 && !v.includes(':') && draft.length === 1) {
      v = v + ':';
    }
    if (v.length > 5) v = v.slice(0, 5);
    setDraft(v);
  };

  const handleInputBlur = () => {
    commit(draft);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(draft);
      e.target.blur();
    }
  };

  const handleClockChange = (next) => {
    setDraft(next);
    onChange && onChange(next);
  };

  return (
    <div className="dual-time" ref={wrapRef}>
      {label && <label className="dual-time__label">{label}</label>}
      <div className="dual-time__field">
        {icon && <span className="dual-time__icon" aria-hidden="true">{icon}</span>}
        <input
          type="text"
          inputMode="numeric"
          className="dual-time__input"
          value={draft}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          placeholder="--:--"
          aria-label={ariaLabel || label || 'Heure'}
          maxLength={5}
        />
        <button
          type="button"
          className={`dual-time__clock-toggle ${showClock ? 'is-active' : ''}`}
          onClick={() => setShowClock(s => !s)}
          aria-label={showClock ? 'Fermer le cadran horloge' : 'Ouvrir le cadran horloge'}
          aria-expanded={showClock}
          title="Selectionner avec un cadran"
        >
          <ClockIcon size={18} />
        </button>
      </div>
      {showClock && (
        <div className="dual-time__popover" ref={popoverRef}>
          <ClockPicker
            value={value}
            onChange={handleClockChange}
            onCommit={(v) => { handleClockChange(v); setShowClock(false); }}
          />
        </div>
      )}
    </div>
  );
};

export default DualTimePicker;
