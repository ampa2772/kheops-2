import { DEFAULT_DOSSIER_COLORS } from './dossierColors';

export const DOCUMENT_COLOR_MODES = Object.freeze({
  TYPE: 'type',
  DOSSIER: 'dossier',
  NONE: 'none',
  CUSTOM: 'custom',
});

export const DOCUMENT_TYPE_LIST = [
  { key: 'courrier', label: 'Courrier', defaultColor: '#2563eb' },
  { key: 'conclusions', label: 'Conclusions', defaultColor: '#7c3aed' },
  { key: 'assignation', label: 'Assignation', defaultColor: '#dc2626' },
  { key: 'convention', label: 'Convention', defaultColor: '#0d9488' },
  { key: 'facture', label: 'Facture', defaultColor: '#d97706' },
  { key: 'note', label: 'Note', defaultColor: '#64748b' },
  { key: 'piece', label: 'Pièce', defaultColor: '#0891b2' },
  { key: 'modele', label: 'Modèle', defaultColor: '#a21caf' },
  { key: 'autre', label: 'Autre document', defaultColor: '#475569' },
];

export const DEFAULT_DOCUMENT_COLORS = DOCUMENT_TYPE_LIST.reduce((acc, item) => {
  acc[item.key] = item.defaultColor;
  return acc;
}, {});

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

export const inferDocumentType = (document) => {
  const explicit = normalizeText(document?.documentType || document?.typeDocument);
  const source = normalizeText([
    explicit,
    document?.categorie,
    document?.nomDocument,
    document?.title,
  ].filter(Boolean).join(' '));

  if (/conclusion/.test(source)) return 'conclusions';
  if (/assignation|citation/.test(source)) return 'assignation';
  if (/convention|honoraire/.test(source)) return 'convention';
  if (/facture|avoir/.test(source)) return 'facture';
  if (/modele|template/.test(source)) return 'modele';
  if (/piece|annexe|justificatif|dropped/.test(source)) return 'piece';
  if (/note|compte.?rendu|memo/.test(source)) return 'note';
  if (/courrier|lettre|selectonedestinataire|selectmultidestinataire/.test(source)) return 'courrier';
  return DOCUMENT_TYPE_LIST.some((item) => item.key === explicit) ? explicit : 'autre';
};

export const getDossierColorKey = (dossier) => {
  const inner = dossier?.dossier?.dossier || dossier?.dossier || dossier || {};
  if (inner.type_dossier === 'divorce_cm') return 'divorce_cm';
  return inner.selectedTribunalAffaire?.type || 'default';
};

const asObject = (value) => {
  if (value instanceof Map) return Object.fromEntries(value);
  return value && typeof value === 'object' ? value : {};
};

const validHex = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ''));

export const resolveDocumentColor = ({
  document,
  documentPreferences,
  dossierPreferences,
  dossierTypeKey = 'default',
}) => {
  // Une couleur choisie directement sur le document reste prioritaire.
  if (validHex(document?.color)) return document.color;

  const type = inferDocumentType(document);
  const preference = asObject(documentPreferences)[type] || {};
  const mode = Object.values(DOCUMENT_COLOR_MODES).includes(preference.mode)
    ? preference.mode
    : DOCUMENT_COLOR_MODES.TYPE;

  if (mode === DOCUMENT_COLOR_MODES.NONE) return undefined;
  if (mode === DOCUMENT_COLOR_MODES.CUSTOM) {
    return validHex(preference.color) ? preference.color : DEFAULT_DOCUMENT_COLORS[type];
  }
  if (mode === DOCUMENT_COLOR_MODES.DOSSIER) {
    const dossierColors = asObject(dossierPreferences);
    return dossierColors[dossierTypeKey]
      || DEFAULT_DOSSIER_COLORS[dossierTypeKey]
      || dossierColors.default
      || DEFAULT_DOSSIER_COLORS.default;
  }
  return DEFAULT_DOCUMENT_COLORS[type] || DEFAULT_DOCUMENT_COLORS.autre;
};

