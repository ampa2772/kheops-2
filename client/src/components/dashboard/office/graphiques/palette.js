// Palette de couleurs categorielle harmonieuse pour les graphiques.
// Derivee du theme Kheops bleu-turquoise + accents complementaires.
//
// Regle d'usage :
//   - CATEGORICAL    : pour distinguer plusieurs categories (camemberts, bar groupes)
//   - SEQUENTIAL_BLUE: pour des intensites graduees (heatmaps, single-color charts)
//   - SEMANTIC       : pour les statuts (succes, en attente, archive, danger)

export const CATEGORICAL = [
  '#0ea5d1', // turquoise franc
  '#8ab4f8', // bleu accent Kheops
  '#a78bfa', // violet doux
  '#34d399', // vert menthe
  '#fbbf24', // jaune dore
  '#fb7185', // rose corail
  '#60a5fa', // bleu ciel
  '#f97316', // orange vif
  '#10b981', // emeraude
  '#e879f9', // magenta
  '#22d3ee', // cyan electrique
  '#facc15', // jaune solaire
  '#84cc16', // vert pomme
  '#f472b6', // rose bonbon
  '#38bdf8', // azur
  '#c084fc', // lavande
  '#fb923c', // mandarine
];

export const SEQUENTIAL_BLUE = [
  '#7ab8ff',
  '#3d97ff',
  '#0969da',
  '#0550ae',
  '#033d8b',
];

export const SEMANTIC = {
  success: '#34d399',
  warning: '#fbbf24',
  danger:  '#fb7185',
  info:    '#60a5fa',
  neutral: '#94a3b8',
  archived:'#a78bfa',
  pending: '#fbbf24',
  paid:    '#34d399',
  active:  '#0ea5d1',
  closed:  '#a78bfa',
  unbilled:'#94a3b8',
};

// Palette dediee aux 17 categories de depenses cabinet.
// Codes alignes avec server/services/cabinetConstants.js.
export const CATEGORIE_COLORS = {
  salaires:       '#0ea5d1',
  loyer:          '#8ab4f8',
  cotisations:    '#a78bfa',
  logiciels:      '#34d399',
  materiel:       '#fbbf24',
  deplacements:   '#fb7185',
  postal:         '#60a5fa',
  sous_traitance: '#f97316',
  formation:      '#10b981',
  banque:         '#e879f9',
  impots:         '#fb923c',
  telephonie:     '#22d3ee',
  energie:        '#facc15',
  assurance:      '#84cc16',
  restauration:   '#f472b6',
  documentation:  '#c084fc',
  autre:          '#94a3b8',
};

export function colorAt(index) {
  return CATEGORICAL[index % CATEGORICAL.length];
}

// Degrades pour fills de cards et charts.
export const GRADIENTS = {
  // Bleu turquoise → bleu accent (defaut KPI)
  primary:   ['#0ea5d1', '#8ab4f8'],
  // Vert menthe (recettes)
  success:   ['#10b981', '#34d399'],
  // Rouge corail (depenses)
  danger:    ['#fb7185', '#f97316'],
  // Violet (rentabilite)
  purple:    ['#a78bfa', '#8ab4f8'],
  // Jaune (volumes / en attente)
  warning:   ['#fbbf24', '#facc15'],
  // Bleu profond (CA brut)
  blueDeep:  ['#0969da', '#0ea5d1'],
};

const palette = {
  CATEGORICAL,
  SEQUENTIAL_BLUE,
  SEMANTIC,
  CATEGORIE_COLORS,
  GRADIENTS,
  colorAt,
};

export default palette;
