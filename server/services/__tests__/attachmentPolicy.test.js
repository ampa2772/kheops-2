// Tests A16/A15 — politique commune des pièces jointes (taille + type).

const policy = require('../attachmentPolicy');

afterEach(() => { delete process.env.STORAGE_MAX_ATTACHMENT_BYTES; });

describe('assertAttachmentSize', () => {
  test('accepte sous la limite', () => {
    expect(() => policy.assertAttachmentSize(1000, { maxBytes: 2000 })).not.toThrow();
  });
  test('accepte size absente/NaN (métadonnée manquante → contrôle autoritatif plus tard)', () => {
    expect(() => policy.assertAttachmentSize(undefined)).not.toThrow();
    expect(() => policy.assertAttachmentSize(null)).not.toThrow();
  });
  test('🔒 rejette au-dessus de la limite → 413', () => {
    expect(() => policy.assertAttachmentSize(3000, { maxBytes: 2000 }))
      .toThrow(expect.objectContaining({ statusCode: 413, code: 'ATTACHMENT_TOO_LARGE' }));
  });
  test('limite configurable via env', () => {
    process.env.STORAGE_MAX_ATTACHMENT_BYTES = '100';
    expect(() => policy.assertAttachmentSize(101)).toThrow(/413|trop volumineuse/i);
    expect(() => policy.assertAttachmentSize(99)).not.toThrow();
  });
  test('défaut = 25 Mo', () => {
    expect(policy.maxAttachmentBytes()).toBe(25 * 1024 * 1024);
  });
});

describe('assertAttachmentAllowed — types', () => {
  test('accepte un PDF/docx normal', () => {
    expect(() => policy.assertAttachmentAllowed({ filename: 'acte.pdf', mime: 'application/pdf', size: 10 })).not.toThrow();
    expect(() => policy.assertAttachmentAllowed({ filename: 'conclusions.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10 })).not.toThrow();
  });

  test.each(['virus.exe', 'run.bat', 'macro.js', 'x.vbs', 'a.scr', 'p.ps1', 'setup.msi', 'app.apk'])(
    '🔒 rejette l\'extension dangereuse %s → 415',
    (filename) => {
      expect(() => policy.assertAttachmentAllowed({ filename, mime: 'application/octet-stream', size: 10 }))
        .toThrow(expect.objectContaining({ statusCode: 415, code: 'ATTACHMENT_TYPE_BLOCKED' }));
    },
  );

  test('🔒 rejette un MIME exécutable même si l\'extension est déguisée', () => {
    expect(() => policy.assertAttachmentAllowed({ filename: 'facture.pdf', mime: 'application/x-msdownload', size: 10 }))
      .toThrow(expect.objectContaining({ statusCode: 415 }));
  });

  test('la taille est vérifiée AVANT le type (413 prioritaire)', () => {
    expect(() => policy.assertAttachmentAllowed({ filename: 'x.exe', mime: 'application/x-msdownload', size: 999 }, { maxBytes: 100 }))
      .toThrow(expect.objectContaining({ statusCode: 413 }));
  });
});

describe('extensionOf', () => {
  test('insensible à la casse, sans point', () => {
    expect(policy.extensionOf('Doc.PDF')).toBe('pdf');
    expect(policy.extensionOf('archive.tar.GZ')).toBe('gz');
    expect(policy.extensionOf('sansext')).toBe('');
  });
});
