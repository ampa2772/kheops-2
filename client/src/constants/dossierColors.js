// Liste centralisée des types de dossiers (juridictions + cas spéciaux) et
// de leurs couleurs par défaut. Utilisée à la fois par :
// - le composant Paramètres → onglet « Couleurs des dossiers »
// - le hook qui injecte les variables CSS sur :root
// - le slider/badge dans la liste des dossiers (via styles.css)
//
// Pour ajouter un nouveau type, étendre DOSSIER_TYPE_LIST ici ET ajouter
// la classe correspondante dans dossiersListe/styles.css.

export const DOSSIER_TYPE_LIST = [
  { key: 'default',    label: 'Aucun type particulier', defaultColor: '#192d4b' },
  { key: 'tgi',        label: 'Tribunal Judiciaire (inclut JAF)', defaultColor: '#2563eb' },
  { key: 'tco',        label: 'Tribunal de Commerce',   defaultColor: '#0d9488' },
  { key: 'cph',        label: "Conseil de Prud'hommes", defaultColor: '#d97706' },
  { key: 'ta',         label: 'Tribunal Administratif', defaultColor: '#7c3aed' },
  { key: 'cass',       label: "Cour d'Assises",         defaultColor: '#dc2626' },
  { key: 'ccd',        label: 'Cour Criminelle Départementale', defaultColor: '#be185d' },
  { key: 'te',         label: 'Tribunal pour Enfants',  defaultColor: '#0891b2' },
  { key: 'tprx',       label: 'Tribunal de Proximité',  defaultColor: '#059669' },
  { key: 'ca',         label: "Cour d'Appel",           defaultColor: '#c2410c' },
  { key: 'caa',        label: "Cour Administrative d'Appel", defaultColor: '#4f46e5' },
  { key: 'cdad',       label: "Conseil Départemental d'Accès au Droit", defaultColor: '#0284c7' },
  { key: 'tbrtj',      label: 'Tribunal Paritaire des Baux Ruraux', defaultColor: '#65a30d' },
  { key: 'divorce_cm', label: 'Divorce par consentement mutuel', defaultColor: '#a21caf' },
];

// Map utilitaire {key → defaultColor}
export const DEFAULT_DOSSIER_COLORS = DOSSIER_TYPE_LIST.reduce((acc, t) => {
  acc[t.key] = t.defaultColor;
  return acc;
}, {});

// Variable CSS exposée sur :root pour chaque type, consommée par
// dossiersListe/styles.css.
export const cssVarForType = (key) => `--dossier-color-${key.replace(/_/g, '-')}`;
