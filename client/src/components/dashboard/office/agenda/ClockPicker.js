import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import './ClockPicker.css';

/**
 * ClockPicker — Selecteur d'heure analogique (cadran circulaire SVG).
 *
 * UX:
 *  - Mode HEURES : 12 marqueurs autour du cadran. Clic ou drag de l'aiguille
 *    pour selectionner. AM/PM toggle en bas si format 12h.
 *  - Mode MINUTES : 60 marqueurs (12 visibles tous les 5min). Clic ou drag.
 *  - Validation auto au passage hour -> minute, fermeture sur clic exterieur.
 *
 * Props:
 *  - value: string "HH:MM" en 24h
 *  - onChange: (newValue: "HH:MM") => void
 *  - onClose: () => void  (optionnel, ferme apres selection minutes)
 */
const SIZE = 220;
const CENTER = SIZE / 2;
const HOUR_RADIUS_OUTER = 88;
const HOUR_RADIUS_INNER = 60;
const MINUTE_RADIUS = 88;
const HAND_LENGTH_HOUR = 78;
const HAND_LENGTH_INNER = 52;
const HAND_LENGTH_MINUTE = 86;
const TICK_RADIUS = 96;

const parseTime = (value) => {
  if (!value || typeof value !== 'string') return { h: 0, m: 0 };
  const [hStr, mStr] = value.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  return {
    h: Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 0,
    m: Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0,
  };
};

const formatTime = (h, m) =>
  `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

const polarToCartesian = (angleDeg, radius) => {
  // 0 deg = 12 o'clock (top). Angle increases clockwise.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(rad),
    y: CENTER + radius * Math.sin(rad),
  };
};

const cartesianToAngle = (x, y) => {
  // Returns angle in deg, 0=top, clockwise.
  const dx = x - CENTER;
  const dy = y - CENTER;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  if (angle < 0) angle += 360;
  return angle;
};

const ClockPicker = ({ value, onChange, onCommit }) => {
  const { h: initH, m: initM } = parseTime(value);
  const [mode, setMode] = useState('hour'); // 'hour' | 'minute'
  const [hour, setHour] = useState(initH);
  const [minute, setMinute] = useState(initM);
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef(null);

  // Sync external value -> internal
  useEffect(() => {
    const { h, m } = parseTime(value);
    setHour(h);
    setMinute(m);
  }, [value]);

  // Si l'heure depasse 12h, on est en "outer ring" (PM = 12-23h)
  const isPM = hour >= 12;
  const hour12 = hour % 12; // 0..11

  const computePosFromEvent = useCallback((evt) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * SIZE;
    const y = ((evt.clientY - rect.top) / rect.height) * SIZE;
    return { x, y };
  }, []);

  const computeHourFromPos = useCallback((pos) => {
    const angle = cartesianToAngle(pos.x, pos.y);
    // 30 deg per hour (12 hours)
    const h12 = Math.round(angle / 30) % 12; // 0..11

    // Determiner si c'est sur l'anneau externe (0-11h) ou interne (12-23h)
    const dist = Math.hypot(pos.x - CENTER, pos.y - CENTER);
    const inner = dist < (HOUR_RADIUS_OUTER + HOUR_RADIUS_INNER) / 2;

    let newH = h12 + (inner ? 12 : 0);
    if (newH === 24) newH = 12;
    if (newH === 12 && !inner) newH = 0; // Le 12 du dessus est "0" (minuit)
    return newH;
  }, []);

  const computeMinuteFromPos = useCallback((pos) => {
    const angle = cartesianToAngle(pos.x, pos.y);
    // 6 deg per minute (60 minutes)
    return Math.round(angle / 6) % 60;
  }, []);

  const handleSelect = useCallback((pos) => {
    if (!pos) return;
    if (mode === 'hour') {
      const newH = computeHourFromPos(pos);
      setHour(newH);
      onChange && onChange(formatTime(newH, minute));
    } else {
      const newM = computeMinuteFromPos(pos);
      setMinute(newM);
      onChange && onChange(formatTime(hour, newM));
    }
  }, [mode, hour, minute, onChange, computeHourFromPos, computeMinuteFromPos]);

  const handlePointerDown = (evt) => {
    evt.preventDefault();
    setIsDragging(true);
    handleSelect(computePosFromEvent(evt));
  };

  const handlePointerMove = (evt) => {
    if (!isDragging) return;
    handleSelect(computePosFromEvent(evt));
  };

  const handlePointerUp = (evt) => {
    if (!isDragging) return;
    setIsDragging(false);
    handleSelect(computePosFromEvent(evt));
    // Apres avoir choisi une heure, on passe en mode minutes
    if (mode === 'hour') {
      setTimeout(() => setMode('minute'), 180);
    }
  };

  // Aiguille : positionnee selon le mode courant
  const handAngle = useMemo(() => {
    if (mode === 'hour') {
      return (hour12 * 30) + (minute * 0.5); // 30 deg/heure + offset minutes
    }
    return minute * 6; // 6 deg/minute
  }, [mode, hour12, minute]);

  const handLength = useMemo(() => {
    if (mode === 'hour') {
      // Plus court si on est sur l'anneau interne (12-23)
      return isPM ? HAND_LENGTH_INNER : HAND_LENGTH_HOUR;
    }
    return HAND_LENGTH_MINUTE;
  }, [mode, isPM]);

  const handTip = useMemo(
    () => polarToCartesian(handAngle, handLength),
    [handAngle, handLength]
  );

  // Marqueurs : heures (1-12 outer + 13-24 inner) ou minutes
  const hourMarks = useMemo(() => {
    const marks = [];
    for (let i = 0; i < 12; i++) {
      const angle = i * 30;
      const outerLabel = i === 0 ? 12 : i; // 12, 1, 2, ... 11
      const innerLabel = i === 0 ? '00' : String(i + 12); // 00, 13, 14, ... 23
      const outerPos = polarToCartesian(angle, HOUR_RADIUS_OUTER);
      const innerPos = polarToCartesian(angle, HOUR_RADIUS_INNER);
      // Hour value for this slot
      const outerHour = i === 0 ? 0 : i; // 0,1,2..11
      const innerHour = i === 0 ? 12 : i + 12; // 12,13..23
      marks.push({ kind: 'outer', angle, label: outerLabel, x: outerPos.x, y: outerPos.y, hourValue: outerHour });
      marks.push({ kind: 'inner', angle, label: innerLabel, x: innerPos.x, y: innerPos.y, hourValue: innerHour });
    }
    return marks;
  }, []);

  const minuteMarks = useMemo(() => {
    const marks = [];
    for (let i = 0; i < 12; i++) {
      const angle = i * 30;
      const m = i * 5;
      const pos = polarToCartesian(angle, MINUTE_RADIUS);
      marks.push({ angle, label: String(m).padStart(2, '0'), x: pos.x, y: pos.y, minuteValue: m });
    }
    return marks;
  }, []);

  const handleHourLabelClick = (h) => (e) => {
    e.stopPropagation();
    setHour(h);
    onChange && onChange(formatTime(h, minute));
    setTimeout(() => setMode('minute'), 180);
  };

  const handleMinuteLabelClick = (m) => (e) => {
    e.stopPropagation();
    setMinute(m);
    onChange && onChange(formatTime(hour, m));
  };

  return (
    <div className="clock-picker">
      <div className="clock-picker__display">
        <button
          type="button"
          className={`clock-picker__display-num ${mode === 'hour' ? 'is-active' : ''}`}
          onClick={() => setMode('hour')}
          aria-label="Modifier l'heure"
        >
          {String(hour).padStart(2, '0')}
        </button>
        <span className="clock-picker__display-sep" aria-hidden="true">:</span>
        <button
          type="button"
          className={`clock-picker__display-num ${mode === 'minute' ? 'is-active' : ''}`}
          onClick={() => setMode('minute')}
          aria-label="Modifier les minutes"
        >
          {String(minute).padStart(2, '0')}
        </button>
      </div>

      <svg
        ref={svgRef}
        className="clock-picker__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => isDragging && setIsDragging(false)}
        role="application"
        aria-label="Selecteur d'heure analogique"
      >
        {/* Cadran de fond */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={CENTER - 4}
          className="clock-picker__face"
        />

        {/* Petits ticks externes */}
        {Array.from({ length: 60 }).map((_, i) => {
          const angle = i * 6;
          const pos1 = polarToCartesian(angle, TICK_RADIUS - 6);
          const pos2 = polarToCartesian(angle, TICK_RADIUS - (i % 5 === 0 ? 12 : 8));
          return (
            <line
              key={i}
              x1={pos1.x}
              y1={pos1.y}
              x2={pos2.x}
              y2={pos2.y}
              className={`clock-picker__tick ${i % 5 === 0 ? 'is-major' : ''}`}
            />
          );
        })}

        {/* Aiguille */}
        <g className="clock-picker__hand-group">
          <line
            x1={CENTER}
            y1={CENTER}
            x2={handTip.x}
            y2={handTip.y}
            className="clock-picker__hand-line"
          />
          <circle
            cx={handTip.x}
            cy={handTip.y}
            r={mode === 'hour' && (
              (mode === 'hour' && (hour % 12) === 0 && !isPM) ||
              (mode === 'hour' && (hour % 12) !== 0)
            ) ? 16 : 16}
            className="clock-picker__hand-tip"
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={4}
            className="clock-picker__hand-center"
          />
        </g>

        {/* Marqueurs : heures ou minutes selon le mode */}
        {mode === 'hour' && hourMarks.map((m, idx) => {
          const isSelected = m.hourValue === hour;
          return (
            <g key={`h-${idx}`} onClick={handleHourLabelClick(m.hourValue)}>
              <text
                x={m.x}
                y={m.y}
                className={`clock-picker__label ${m.kind === 'inner' ? 'is-inner' : ''} ${isSelected ? 'is-selected' : ''}`}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {mode === 'minute' && minuteMarks.map((m, idx) => {
          const isSelected = m.minuteValue === minute;
          return (
            <g key={`m-${idx}`} onClick={handleMinuteLabelClick(m.minuteValue)}>
              <text
                x={m.x}
                y={m.y}
                className={`clock-picker__label ${isSelected ? 'is-selected' : ''}`}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="clock-picker__footer">
        <button
          type="button"
          className={`clock-picker__mode-btn ${mode === 'hour' ? 'is-active' : ''}`}
          onClick={() => setMode('hour')}
        >
          Heure
        </button>
        <button
          type="button"
          className={`clock-picker__mode-btn ${mode === 'minute' ? 'is-active' : ''}`}
          onClick={() => setMode('minute')}
        >
          Minute
        </button>
        {onCommit && (
          <button
            type="button"
            className="clock-picker__commit-btn"
            onClick={() => onCommit(formatTime(hour, minute))}
          >
            OK
          </button>
        )}
      </div>
    </div>
  );
};

export default ClockPicker;
