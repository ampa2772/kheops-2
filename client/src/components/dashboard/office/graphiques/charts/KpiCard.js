import React from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { GRADIENTS } from '../palette';

/**
 * Carte KPI avec sparkline optionnelle en arriere-plan.
 *
 * Props:
 *   - label       : intitule du KPI
 *   - value       : valeur principale (formattee par le parent)
 *   - sub         : sous-texte (variation, complement, periode)
 *   - tone        : 'primary' | 'success' | 'danger' | 'purple' | 'warning' | 'blueDeep'
 *   - icon        : ReactNode (emoji ou svg) optionnel
 *   - sparkline   : tableau {x, y} pour mini-courbe en fond
 *   - delta       : variation (+/-%) optionnelle
 */
const KpiCard = ({ label, value, sub, tone = 'primary', icon, sparkline, delta }) => {
  const [c1, c2] = GRADIENTS[tone] || GRADIENTS.primary;
  const gradId = `kpi-grad-${tone}`;
  const gradStrokeId = `kpi-stroke-${tone}`;
  const showDelta = typeof delta === 'number' && Number.isFinite(delta);
  const deltaPositive = showDelta && delta >= 0;

  return (
    <div className={`kpi-card kpi-tone-${tone}`} role="figure" aria-label={label}>
      <div className="kpi-card-glow" aria-hidden="true" />

      {sparkline && sparkline.length > 1 && (
        <div className="kpi-spark" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c1} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={c1} stopOpacity={0} />
                </linearGradient>
                <linearGradient id={gradStrokeId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={c1} />
                  <stop offset="100%" stopColor={c2} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="y"
                stroke={`url(#${gradStrokeId})`}
                strokeWidth={2}
                fill={`url(#${gradId})`}
                isAnimationActive={true}
                animationDuration={900}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="kpi-card-content">
        <div className="kpi-card-head">
          <span className="kpi-card-label">{label}</span>
          {icon && <span className="kpi-card-icon" aria-hidden="true">{icon}</span>}
        </div>
        <div className="kpi-card-value">
          {value}
          {showDelta && (
            <span className={`kpi-delta ${deltaPositive ? 'is-up' : 'is-down'}`}>
              {deltaPositive ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
        </div>
        {sub && <div className="kpi-card-sub">{sub}</div>}
      </div>
    </div>
  );
};

export default KpiCard;
