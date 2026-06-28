import React from 'react';

/**
 * Tooltip personnalise pour Recharts au look Kheops (verre + glow).
 *
 * Props standards passees par Recharts : active, payload, label.
 *
 * Options :
 *   - formatter(value, name, entry) : pour reformater la valeur (currency...)
 *   - labelFormatter(label)         : pour reformater le label X
 *   - hideTotal                     : masque la ligne Total quand >1 series
 */
const ChartTooltip = ({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
  hideTotal = false,
}) => {
  if (!active || !payload || payload.length === 0) return null;

  const fmtLabel = labelFormatter ? labelFormatter(label) : label;
  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);

  return (
    <div className="chart-tooltip" role="tooltip">
      {fmtLabel != null && fmtLabel !== '' && (
        <div className="chart-tooltip-label">{fmtLabel}</div>
      )}
      <ul className="chart-tooltip-list">
        {payload.map((p, idx) => {
          const formatted = formatter ? formatter(p.value, p.name, p) : p.value;
          return (
            <li key={`${p.dataKey || p.name || idx}-${idx}`} className="chart-tooltip-row">
              <span className="chart-tooltip-dot" style={{ background: p.color || p.fill }} />
              <span className="chart-tooltip-name">{p.name}</span>
              <span className="chart-tooltip-value">{formatted}</span>
            </li>
          );
        })}
        {!hideTotal && payload.length > 1 && (
          <li className="chart-tooltip-row chart-tooltip-total">
            <span className="chart-tooltip-name">Total</span>
            <span className="chart-tooltip-value">
              {formatter ? formatter(total, 'total') : total}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
};

export default ChartTooltip;
