import React from 'react';

// Source unique pour les catégories d'événements de l'agenda.
// `key` correspond à event.category côté backend.
// La catégorie spéciale "task" est dérivée de event.type === 'task'.
export const EVENT_CATEGORIES = [
  { key: 'audience',  label: 'Audience',   shortLabel: 'AUDIENCE',   color: '#ef4444' },
  { key: 'rdv',       label: 'RDV client', shortLabel: 'RDV CLIENT', color: '#06b6d4' },
  { key: 'reunion',   label: 'Téléphone',  shortLabel: 'TÉLÉPHONE',  color: '#a855f7' },
  { key: 'task',      label: 'Tâche',      shortLabel: 'TÂCHE',      color: '#f59e0b' },
  { key: 'personnel', label: 'Personnel',  shortLabel: 'PERSONNEL',  color: '#ec4899' },
];

export const resolveCategory = (event) => {
  if (!event) return 'audience';
  if (event.type === 'task') return 'task';
  return event.category || 'audience';
};

export const getCategoryMeta = (key) =>
  EVENT_CATEGORIES.find((c) => c.key === key) || EVENT_CATEGORIES[0];

// Petites icônes inline communes à l'agenda
export const IconAudience = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2 4 7v6c0 5 3.4 9.3 8 10 4.6-.7 8-5 8-10V7l-8-5z" />
  </svg>
);
export const IconRdv = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11a8 8 0 1 1-3-6" />
    <polyline points="21 5 21 11 15 11" />
  </svg>
);
export const IconPhone = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.5 11.5 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A18 18 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.5 11.5 0 0 0 .57 3.6 1 1 0 0 1-.25 1l-2.22 2.2z" />
  </svg>
);
export const IconTask = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);
export const IconPersonnel = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z" />
  </svg>
);

export const CATEGORY_ICONS = {
  audience: IconAudience,
  rdv: IconRdv,
  reunion: IconPhone,
  task: IconTask,
  personnel: IconPersonnel,
};

export const IconClock = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 15 14" />
  </svg>
);
export const IconPin = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 21s7-6.6 7-12a7 7 0 0 0-14 0c0 5.4 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </svg>
);
export const IconFunnel = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h18l-7 9v6l-4 2v-8L3 4z" />
  </svg>
);
export const IconPlus = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
