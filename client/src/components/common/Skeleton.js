// Composants Skeleton : feedback visuel pendant les chargements asynchrones.
// Préférables aux spinners pour les listes / cartes (donnent une idée de la
// structure attendue, perçus comme plus rapides).
//
// Variantes :
//   <SkeletonLine width="80%" />          — barre simple
//   <SkeletonCard />                       — carte de liste type "dossier récent"
//   <SkeletonList rows={3} />              — n cartes empilées
//   <SkeletonInline width={80} />          — petit segment inline (titre, badge)
//
// L'animation shimmer est définie une seule fois en CSS et appliquée à
// tous les variants via la classe `.k-skeleton`.
import React from 'react';
import './Skeleton.css';

export const SkeletonLine = ({ width = '100%', height = 12, radius = 4, style }) => (
  <span
    className="k-skeleton"
    style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    aria-hidden="true"
  />
);

export const SkeletonInline = ({ width = 80, height = 12, radius = 4 }) => (
  <span
    className="k-skeleton k-skeleton--inline"
    style={{ width, height, borderRadius: radius }}
    aria-hidden="true"
  />
);

export const SkeletonCard = () => (
  <div className="k-skeleton-card" aria-hidden="true">
    <span className="k-skeleton k-skeleton-card__badge" />
    <div className="k-skeleton-card__body">
      <span className="k-skeleton k-skeleton-card__line k-skeleton-card__line--title" />
      <span className="k-skeleton k-skeleton-card__line k-skeleton-card__line--sub" />
    </div>
  </div>
);

export const SkeletonList = ({ rows = 3 }) => (
  <div className="k-skeleton-list" role="status" aria-live="polite" aria-label="Chargement…">
    {Array.from({ length: rows }).map((_, i) => <SkeletonCard key={i} />)}
  </div>
);

// Spinner circulaire compact pour les actions ponctuelles
export const Spinner = ({ size = 18, label }) => (
  <span className="k-spinner-wrap" role="status" aria-live="polite">
    <span
      className="k-spinner"
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 9)) }}
      aria-hidden="true"
    />
    {label && <span className="k-spinner-label">{label}</span>}
  </span>
);

export default SkeletonList;
