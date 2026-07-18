import {
  inferDocumentType,
  getDossierColorKey,
  resolveDocumentColor,
} from '../documentColors';

test('déduit les principaux types depuis les métadonnées ou le nom', () => {
  expect(inferDocumentType({ nomDocument: 'Conclusions récapitulatives.docx' })).toBe('conclusions');
  expect(inferDocumentType({ categorie: 'selectOneDestinataire', nomDocument: 'Projet.docx' })).toBe('courrier');
  expect(inferDocumentType({ nomDocument: 'Facture-2026-07.pdf' })).toBe('facture');
  expect(inferDocumentType({ nomDocument: 'scan-sans-titre.pdf' })).toBe('autre');
});

test('une couleur locale de document reste prioritaire', () => {
  expect(resolveDocumentColor({
    document: { nomDocument: 'Facture.pdf', color: '#123456' },
    documentPreferences: { facture: { mode: 'none' } },
  })).toBe('#123456');
});

test('gère type, absence, couleur personnalisée et héritage dossier', () => {
  const document = { nomDocument: 'Convention honoraires.docx' };
  expect(resolveDocumentColor({ document })).toBe('#0d9488');
  expect(resolveDocumentColor({ document, documentPreferences: { convention: { mode: 'none' } } })).toBeUndefined();
  expect(resolveDocumentColor({
    document,
    documentPreferences: { convention: { mode: 'custom', color: '#abcdef' } },
  })).toBe('#abcdef');
  expect(resolveDocumentColor({
    document,
    documentPreferences: { convention: { mode: 'dossier' } },
    dossierPreferences: { cph: '#654321' },
    dossierTypeKey: 'cph',
  })).toBe('#654321');
});

test('déduit la clé couleur du dossier sans modifier les préférences existantes', () => {
  expect(getDossierColorKey({ dossier: { dossier: { type_dossier: 'divorce_cm' } } })).toBe('divorce_cm');
  expect(getDossierColorKey({ dossier: { dossier: { selectedTribunalAffaire: { type: 'tgi' } } } })).toBe('tgi');
  expect(getDossierColorKey({})).toBe('default');
});

