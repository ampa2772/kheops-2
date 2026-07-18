import {
  DOCUMENT_BROWSER_PREVIEW_KINDS,
  DOCUMENT_FILE_OPENING_ACTIONS,
  classifyDocumentFileOpening,
  getDocumentFileExtension,
} from '../documentFileRouting';

describe('documentFileRouting', () => {
  test.each(['Acte.doc', 'Acte.DOCX', 'Notes.txt'])(
    'conserve la modale documentaire pour %s',
    (fileName) => {
      expect(classifyDocumentFileOpening(fileName)).toMatchObject({
        action: DOCUMENT_FILE_OPENING_ACTIONS.DOCUMENT_CHOOSER,
        previewKind: null,
      });
    },
  );

  it('ouvre les PDF directement dans le lecteur du navigateur', () => {
    expect(classifyDocumentFileOpening({ nomDocument: 'Assignation.PDF' })).toEqual({
      action: DOCUMENT_FILE_OPENING_ACTIONS.BROWSER_PREVIEW,
      extension: 'pdf',
      previewKind: DOCUMENT_BROWSER_PREVIEW_KINDS.PDF,
    });
  });

  test.each(['preuve.png', 'photo.JPG', 'scan.jpeg', 'animation.gif', 'image.webp'])(
    'ouvre directement le raster sûr %s',
    (fileName) => {
      expect(classifyDocumentFileOpening(fileName)).toMatchObject({
        action: DOCUMENT_FILE_OPENING_ACTIONS.BROWSER_PREVIEW,
        previewKind: DOCUMENT_BROWSER_PREVIEW_KINDS.IMAGE,
      });
    },
  );

  test.each([
    'dessin.svg',
    'page.html',
    'archive.zip',
    'tableur.xlsx',
    'presentation.pptx',
    'donnees.csv',
    'sans-extension',
  ])('telecharge %s sans affichage inline', (fileName) => {
    expect(classifyDocumentFileOpening(fileName)).toMatchObject({
      action: DOCUMENT_FILE_OPENING_ACTIONS.DOWNLOAD,
      previewKind: null,
    });
  });

  it('ne fait pas confiance au MIME seul pour autoriser un affichage inline', () => {
    expect(classifyDocumentFileOpening({
      nomDocument: 'contenu.bin',
      mimeType: 'application/pdf',
    }).action).toBe(DOCUMENT_FILE_OPENING_ACTIONS.DOWNLOAD);
  });

  it('normalise les différentes clés de nom historiques', () => {
    expect(getDocumentFileExtension({ fileName: 'A.TXT' })).toBe('txt');
    expect(getDocumentFileExtension({ name: 'B.PDF' })).toBe('pdf');
    expect(getDocumentFileExtension({ nom: 'C.WEBP' })).toBe('webp');
  });
});
