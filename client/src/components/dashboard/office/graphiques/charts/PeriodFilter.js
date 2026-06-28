import React from 'react';

/**
 * Selecteur de periode global pour la page Graphiques.
 *
 * Modes :
 *   - 30d  : 30 derniers jours
 *   - 3m   : 3 derniers mois
 *   - 6m   : 6 derniers mois
 *   - 12m  : 12 derniers mois
 *   - ytd  : depuis le 1er janvier
 *   - custom : intervalle personnalise (from / to)
 *
 * Renvoie via onChange un objet { mode, from, to } ou from/to sont des
 * dates JS (ou null pour mode 'all').
 */

const MODES = [
  { key: '30d',  label: '30 j' },
  { key: '3m',   label: '3 mois' },
  { key: '6m',   label: '6 mois' },
  { key: '12m',  label: '12 mois' },
  { key: 'ytd',  label: 'Annee en cours' },
  { key: 'all',  label: 'Tout' },
];

export function computeRange(mode) {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let from = null;
  switch (mode) {
    case '30d': from = addDays(now, -30); break;
    case '3m':  from = addMonths(now, -3); break;
    case '6m':  from = addMonths(now, -6); break;
    case '12m': from = addMonths(now, -12); break;
    case 'ytd': from = new Date(now.getFullYear(), 0, 1); break;
    case 'all': default: from = null;
  }
  return { from, to: from ? to : null };
}

function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function addMonths(d, n) {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r;
}

const PeriodFilter = ({ mode, onChange }) => {
  return (
    <div className="period-filter" role="tablist" aria-label="Filtre de periode">
      {MODES.map((m) => (
        <button
          key={m.key}
          type="button"
          role="tab"
          aria-selected={mode === m.key}
          className={`period-btn ${mode === m.key ? 'is-active' : ''}`}
          onClick={() => {
            const range = computeRange(m.key);
            onChange({ mode: m.key, ...range });
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
};

export default PeriodFilter;
