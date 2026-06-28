// client/src/components/dashboard/office/graphiques/charts/PremiumDonut.js
//
// Donut "premium" reutilisable, ideal pour 2 a 4 segments. Compose :
//   1. un donut Recharts avec segments degrades + arrondis + paddingAngle + glow
//   2. une zone centrale pour une stat principale (label + valeur + delta + sub)
//   3. une sidebar a droite avec une carte legende par segment
//      (icone, nom, pourcentage, montant, delta)
//   4. un panel additionnel optionnel sous la sidebar (ex : "Ratio recettes/depenses")
//
// Le composant gere automatiquement le calcul des pourcentages.

import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const PremiumDonut = ({
  data,         // [{ name, value, color, amountText?, delta?, icon? }]
  centerLabel,  // 'MARGE NETTE'
  centerValue,  // '7 340 €' (string deja formate par le parent)
  centerDelta,  // number (variation en %, ex 18.9 ou -3.1)
  centerSub,    // '51,4 % de marge'
  extraPanel,   // ReactNode optionnel sous la sidebar
  height = 280,
  uid = 'def',  // identifiant unique pour les <defs> SVG (gradients/glow)
}) => {
  const total = useMemo(
    () => data.reduce((s, d) => s + (Number(d.value) || 0), 0),
    [data]
  );

  const items = useMemo(() => data.map((d) => ({
    ...d,
    pct: total > 0 ? ((Number(d.value) || 0) / total) * 100 : 0,
  })), [data, total]);

  const showDelta = typeof centerDelta === 'number' && Number.isFinite(centerDelta);

  return (
    <div className="pdonut">
      <div className="pdonut-chart-wrap" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {items.map((d, i) => (
                <linearGradient
                  id={`pdonut-${uid}-${i}`}
                  key={`grad-${i}`}
                  x1="0" y1="0" x2="1" y2="1"
                >
                  <stop offset="0%"   stopColor={d.color} stopOpacity={0.65} />
                  <stop offset="100%" stopColor={d.color} stopOpacity={1} />
                </linearGradient>
              ))}
              <filter id={`pdonut-glow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <Pie
              data={items}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="68%"
              outerRadius="96%"
              paddingAngle={2.5}
              cornerRadius={10}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
              startAngle={90}
              endAngle={-270}
              isAnimationActive
              animationDuration={1100}
              filter={`url(#pdonut-glow-${uid})`}
            >
              {items.map((d, i) => (
                <Cell key={`pcell-${i}`} fill={`url(#pdonut-${uid}-${i})`} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Centre : stat principale */}
        <div className="pdonut-center" aria-hidden="true">
          {centerLabel && <span className="pdonut-center-label">{centerLabel}</span>}
          {centerValue !== undefined && centerValue !== null && centerValue !== '' && (
            <span className="pdonut-center-value">{centerValue}</span>
          )}
          {showDelta && (
            <span className={`pdonut-center-delta ${centerDelta >= 0 ? 'is-up' : 'is-down'}`}>
              {centerDelta >= 0 ? '▲' : '▼'} {Math.abs(centerDelta).toFixed(1).replace('.', ',')} %
            </span>
          )}
          {centerSub && <span className="pdonut-center-sub">{centerSub}</span>}
        </div>
      </div>

      {/* Sidebar legende custom */}
      <div className="pdonut-side">
        <ul className="pdonut-legend" role="list">
          {items.map((d, i) => (
            <li
              key={`pleg-${i}`}
              className="pdonut-legend-item"
              style={{ '--seg-color': d.color }}
            >
              <span className="pdonut-legend-icon" aria-hidden="true" style={{ background: d.color }}>
                {d.icon || ''}
              </span>
              <div className="pdonut-legend-body">
                <div className="pdonut-legend-row pdonut-legend-row-top">
                  <span className="pdonut-legend-name">{d.name}</span>
                  <span className="pdonut-legend-pct">{Math.round(d.pct)} %</span>
                </div>
                <div className="pdonut-legend-row pdonut-legend-row-bot">
                  <span className="pdonut-legend-amount">{d.amountText || ''}</span>
                  {typeof d.delta === 'number' && Number.isFinite(d.delta) && (
                    <span className={`pdonut-legend-delta ${d.delta >= 0 ? 'is-up' : 'is-down'}`}>
                      {d.delta >= 0 ? '+' : ''}{d.delta.toFixed(1).replace('.', ',')} %
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {extraPanel && <div className="pdonut-extra">{extraPanel}</div>}
      </div>
    </div>
  );
};

export default PremiumDonut;
