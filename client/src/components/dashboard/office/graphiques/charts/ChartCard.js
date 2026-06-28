import React from 'react';

/**
 * Wrapper d'une carte contenant un graphique.
 *   - title    : titre principal
 *   - subtitle : description courte sous le titre
 *   - actions  : ReactNode rendu a droite du header (filtres, badges)
 *   - footer   : ReactNode optionnel sous le chart
 *   - span     : 1 (col1) | 2 (col2) | 3 (col3) | 4 (full)  --> classe CSS
 *   - empty    : booleen ; si true, affiche children = empty state
 *   - height   : hauteur du body en px (defaut 320)
 */
const ChartCard = ({
  title,
  subtitle,
  actions,
  footer,
  span = 2,
  empty = false,
  height = 320,
  children,
  className = '',
}) => {
  return (
    <section
      className={`chart-card chart-card-span-${span} ${empty ? 'is-empty' : ''} ${className}`}
      aria-label={title}
    >
      <header className="chart-card-head">
        <div className="chart-card-titles">
          {title && <h3 className="chart-card-title">{title}</h3>}
          {subtitle && <p className="chart-card-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="chart-card-actions">{actions}</div>}
      </header>
      <div className="chart-card-body" style={{ minHeight: height, height }}>
        {children}
      </div>
      {footer && <div className="chart-card-footer">{footer}</div>}
    </section>
  );
};

export default ChartCard;
