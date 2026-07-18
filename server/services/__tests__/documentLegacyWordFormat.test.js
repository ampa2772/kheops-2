const {
  LEGACY_DOC_MAGIC,
  MAX_LEGACY_DOC_BYTES,
  convertLegacyWordBuffer,
  isLegacyWordContent,
} = require('../documentLegacyWordFormat');

function oleBuffer(size = 512) {
  return Buffer.concat([
    LEGACY_DOC_MAGIC,
    Buffer.alloc(Math.max(0, size - LEGACY_DOC_MAGIC.length)),
  ]);
}

describe('conversion sûre des documents Word historiques', () => {
  test('reconnaît .doc et application/msword sans confondre .docx', () => {
    expect(isLegacyWordContent({ filename: 'Conclusions.doc' })).toBe(true);
    expect(isLegacyWordContent({ mime: 'application/msword; charset=binary' })).toBe(true);
    expect(isLegacyWordContent({ filename: 'Conclusions.docx' })).toBe(false);
    expect(isLegacyWordContent({ filename: 'Conclusions.docx', mime: 'application/msword' })).toBe(false);
    expect(isLegacyWordContent({
      filename: 'Conclusions.doc',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })).toBe(true);
  });

  test('convertit le texte dans un modèle éditable et signale les pertes possibles', async () => {
    const extractor = jest.fn().mockResolvedValue({
      body: 'Première ligne\rDeuxième ligne',
      headers: 'Cabinet Martin',
      footers: 'Page historique',
      footnotes: '1. Note récupérée',
      endnotes: '',
      annotations: 'Commentaire non publié',
      textboxes: 'Texte encadré',
    });

    const result = await convertLegacyWordBuffer(
      oleBuffer(),
      'Conclusions historiques.doc',
      { extractor },
    );

    expect(extractor).toHaveBeenCalledWith(expect.any(Buffer));
    expect(result.compatibility).toEqual(expect.objectContaining({
      level: 'partial',
      label: 'DOC historique converti',
      warnings: expect.arrayContaining([
        expect.stringMatching(/original \.doc est conservé/i),
        expect.stringMatching(/mise en forme.*tableaux.*images/i),
        expect.stringMatching(/commentaires Word/i),
      ]),
    }));
    expect(result.structured).toEqual(expect.objectContaining({
      title: 'Conclusions historiques',
      documentType: 'legacy-word',
    }));
    const body = result.structured.blocks
      .flatMap((block) => block.runs || [])
      .map((run) => run.text)
      .join('');
    expect(body).toContain('Première ligne\nDeuxième ligne');
    expect(body).toContain('Texte encadré');
    expect(body).toContain('Note récupérée');
    expect(result.structured.page.header.blocks[0].runs[0].text).toBe('Cabinet Martin');
    expect(result.structured.page.footer.blocks[0].runs[0].text).toBe('Page historique');
  });

  test('refuse avant extraction un faux .doc sans signature OLE', async () => {
    const extractor = jest.fn();

    await expect(convertLegacyWordBuffer(
      Buffer.from('{\\rtf1 faux document Word}'),
      'Faux.doc',
      { extractor },
    )).rejects.toMatchObject({ code: 'INVALID_LEGACY_DOC', statusCode: 415 });
    expect(extractor).not.toHaveBeenCalled();
  });

  test('borne la taille avant de lancer le parseur', async () => {
    const source = Buffer.alloc(MAX_LEGACY_DOC_BYTES + 1);
    LEGACY_DOC_MAGIC.copy(source, 0);
    const extractor = jest.fn();

    await expect(convertLegacyWordBuffer(source, 'Trop-long.doc', { extractor }))
      .rejects.toMatchObject({ code: 'LEGACY_DOC_TOO_LARGE', statusCode: 413 });
    expect(extractor).not.toHaveBeenCalled();
  });

  test('transforme une erreur du parseur en refus stable sans exposer son détail', async () => {
    const extractor = jest.fn().mockRejectedValue(new Error('internal OLE offset 0x1234'));

    await expect(convertLegacyWordBuffer(oleBuffer(), 'Endommage.doc', { extractor }))
      .rejects.toMatchObject({
        code: 'INVALID_LEGACY_DOC',
        statusCode: 415,
        message: expect.not.stringContaining('0x1234'),
      });
  });

  test('interrompt logiquement une extraction qui dépasse le délai de sécurité', async () => {
    const extractor = jest.fn(() => new Promise(() => {}));

    await expect(convertLegacyWordBuffer(
      oleBuffer(),
      'Bloque.doc',
      { extractor, timeoutMs: 5 },
    )).rejects.toMatchObject({
      code: 'LEGACY_DOC_CONVERSION_TIMEOUT',
      statusCode: 422,
    });
  });
});
