// Tests unitaires des helpers PURS de routes/word.js : sanitisation des clés de
// stockage (.docx + modèles). Propriété de sécurité vérifiée : aucun séparateur
// de chemin ne survit → pas de path traversal dans la clé GCS/local.

const router = require('../word');
const { docxStorageKey, templateStorageKey } = router._private;

describe('word route — docxStorageKey', () => {
  test('clé normale sous documents/', () => {
    expect(docxStorageKey('64f0a1b2c3d4e5f6a7b8c9d0')).toBe('documents/64f0a1b2c3d4e5f6a7b8c9d0.docx');
  });

  test('neutralise le path traversal (aucun / ni .. dans le nom)', () => {
    const key = docxStorageKey('../../etc/passwd');
    expect(key.startsWith('documents/')).toBe(true);
    const name = key.slice('documents/'.length);
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
    expect(key).toBe('documents/______etc_passwd.docx');
  });

  test('coerce les valeurs non-chaîne', () => {
    expect(docxStorageKey(12345)).toBe('documents/12345.docx');
  });
});

describe('word route — templateStorageKey', () => {
  test('ajoute .docx si absent', () => {
    expect(templateStorageKey('courrier-simple')).toBe('templates/courrier-simple.docx');
  });

  test('ne double pas .docx (insensible à la casse)', () => {
    expect(templateStorageKey('courrier.docx')).toBe('templates/courrier.docx');
    expect(templateStorageKey('courrier.DOCX')).toBe('templates/courrier.DOCX');
  });

  test('neutralise le séparateur de chemin (pas de / dans le nom)', () => {
    const key = templateStorageKey('../../etc/passwd');
    expect(key.startsWith('templates/')).toBe(true);
    const name = key.slice('templates/'.length);
    expect(name).not.toContain('/');
  });
});
