const {
  MAX_PLAIN_TEXT_BYTES,
  decodePlainTextBuffer,
  encodePlainTextBuffer,
  plainTextToStructuredDocument,
  structuredDocumentToPlainText,
} = require('../documentPlainTextFormat');

describe('documentPlainTextFormat', () => {
  test('préserve UTF-8 BOM, CRLF, extension et MIME sans conversion DOCX', () => {
    const original = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from('Première ligne\r\nDeuxième ligne\r\n', 'utf8'),
    ]);
    const decoded = decodePlainTextBuffer(original, { filename: 'notes.txt', mime: 'text/plain; charset=utf-8' });
    expect(decoded.text).toBe('Première ligne\nDeuxième ligne\n');
    expect(decoded.fileFormat).toMatchObject({
      kind: 'text', filename: 'notes.txt', mime: 'text/plain', encoding: 'utf8', bom: true, lineEnding: 'crlf', finalNewline: true,
    });
    expect(encodePlainTextBuffer(decoded.text, decoded.fileFormat).buffer).toEqual(original);
  });

  test('préserve un texte UTF-16 LE avec BOM', () => {
    const body = Buffer.from('Bonjour\r\nÉlodie', 'utf16le');
    const original = Buffer.concat([Buffer.from([0xff, 0xfe]), body]);
    const decoded = decodePlainTextBuffer(original, { filename: 'utf16.txt', mime: 'text/plain' });
    expect(decoded.fileFormat).toMatchObject({ encoding: 'utf16le', bom: true, lineEnding: 'crlf' });
    expect(encodePlainTextBuffer(decoded.text, decoded.fileFormat).buffer).toEqual(original);
  });

  test('reconnaît Windows-1252 et refuse une corruption quand un caractère est impossible à réencoder', () => {
    const original = Buffer.from([0x52, 0xe9, 0x73, 0x75, 0x6d, 0xe9, 0x20, 0x80]);
    const decoded = decodePlainTextBuffer(original, { filename: 'legacy.txt', mime: 'text/plain' });
    expect(decoded.text).toBe('Résumé €');
    expect(decoded.fileFormat.encoding).toBe('windows-1252');
    expect(encodePlainTextBuffer(decoded.text, decoded.fileFormat).buffer).toEqual(original);
    expect(() => encodePlainTextBuffer(`${decoded.text} 😀`, decoded.fileFormat)).toThrow(/Windows-1252/);
  });

  test('le modèle structuré du TXT ne contient aucune mise en forme riche', () => {
    const document = plainTextToStructuredDocument('A\nB', 'notes.txt');
    expect(document.documentType).toBe('plain-text');
    expect(document.signature).toBeNull();
    expect(document.page.showPageNumbers).toBe(false);
    expect(document.blocks).toHaveLength(1);
    expect(document.blocks[0]).toMatchObject({ type: 'paragraph', align: 'left' });
    expect(document.blocks[0].runs.every((run) => Object.keys(run.marks).length === 0)).toBe(true);
    expect(structuredDocumentToPlainText(document)).toBe('A\nB');
  });

  test('refuse le binaire et accepte au plus 5 Mo', () => {
    expect(MAX_PLAIN_TEXT_BYTES).toBe(5 * 1024 * 1024);
    expect(() => decodePlainTextBuffer(Buffer.from([0, 1, 2]), { filename: 'faux.txt' })).toThrow(/binaires/);
  });
});
