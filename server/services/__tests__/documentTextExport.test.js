// Tests — export texte serveur (docx/txt/pdf via buffer, formatage, robustesse).

const { extractTextFromBuffer, generateFullTextExport, buildTxtContent } = require('../documentTextExport');
const { buildBlankDocxBuffer } = require('../docx/docxGenerator');

describe('extractTextFromBuffer', () => {
  test('docx → mammoth', async () => {
    const r = await extractTextFromBuffer(buildBlankDocxBuffer(), 'doc.docx');
    expect(r.method).toMatch(/mammoth/i);
    expect(r.error).toBeUndefined();
  });

  test('txt → lecture directe', async () => {
    const r = await extractTextFromBuffer(Buffer.from('Bonjour maître', 'utf-8'), 'note.txt');
    expect(r.text).toBe('Bonjour maître');
  });

  test('format non supporté → erreur explicite, pas de crash', async () => {
    const r = await extractTextFromBuffer(Buffer.from('x'), 'image.png');
    expect(r.error).toMatch(/pris en charge|non supporte/i);
    expect(r.text).toBe('');
  });

  test('buffer docx corrompu → ECHEC propre (jamais de throw)', async () => {
    const r = await extractTextFromBuffer(Buffer.from('pas un vrai docx'), 'faux.docx');
    expect(r.method).toBe('ECHEC');
    expect(r.error).toBeTruthy();
  });
});

describe('generateFullTextExport', () => {
  const dossierData = {
    _id: 'DOS1',
    reference: '202610',
    subfolders: [{ _id: 'SF1', name: 'Pièces' }],
    dossier: {
      dossier: { nom: 'Delmont c/ Abily', type_dossier: 'CPH' },
      parties: { pour: [{ nomPartie: 'Delmont', partieData: { nom: 'Delmont', prenoms: 'Jérôme' } }], contre: [] },
      contactsDuDossier: [],
      documents: [
        { _id: 'D1', nomDocument: 'Conclusion.docx', subfolderId: null, dateCreation: new Date('2026-07-01') },
        { _id: 'D2', nomDocument: 'Piece1.txt', subfolderId: 'SF1', dateCreation: new Date('2026-07-02') },
        { _id: 'D3', nomDocument: 'Absent.docx', subfolderId: null, dateCreation: new Date('2026-07-03') },
      ],
    },
  };

  test('assemble le TXT avec en-tête, protagonistes, index et contenu ; compte les échecs', async () => {
    const fetchBytes = async (docId) => {
      if (docId === 'D1') return { buffer: buildBlankDocxBuffer(), filename: 'Conclusion.docx' };
      if (docId === 'D2') return { buffer: Buffer.from('Texte de la pièce', 'utf-8'), filename: 'Piece1.txt' };
      return null; // D3 : aucun octet serveur
    };
    const r = await generateFullTextExport(dossierData, fetchBytes);

    expect(r.total).toBe(3);
    expect(r.errorCount).toBe(1); // D3 sans octets
    expect(r.fileName).toMatch(/^Export_Complet_Delmont.*\.txt$/);
    expect(r.txtContent).toContain('EXPORT TEXTE COMPLET DU DOSSIER');
    expect(r.txtContent).toContain('Delmont c/ Abily');
    expect(r.txtContent).toContain('INDEX DES DOCUMENTS (3 documents)');
    expect(r.txtContent).toContain('Texte de la pièce');       // contenu D2 (txt)
    expect(r.txtContent).toContain('Pièces');                   // emplacement sous-dossier
    expect(r.txtContent).toContain('RESUME DES ERREURS');       // D3
    expect(r.txtContent).toContain('FIN DE L\'EXPORT');
  });

  test('un fetchBytes qui jette n\'arrête pas l\'export', async () => {
    const fetchBytes = async (docId) => {
      if (docId === 'D2') return { buffer: Buffer.from('ok', 'utf-8'), filename: 'Piece1.txt' };
      throw new Error('réseau');
    };
    const r = await generateFullTextExport(dossierData, fetchBytes);
    expect(r.total).toBe(3);
    expect(r.errorCount).toBe(2); // D1 et D3 jettent → comptés en échec
    expect(r.txtContent).toContain('ok'); // D2 réussi
  });
});
