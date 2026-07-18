const { normalizeDocumentOptions } = require('../artifactService');

describe('AI document creation options', () => {
  test('normalizes every frontend option without silently dropping it', () => {
    expect(normalizeDocumentOptions({
      type: 'draft-letter', language: 'fr-FR', visibility: 'matter',
      editor: 'word-desktop', includeSources: true, versionComment: 'Première proposition',
    })).toEqual({
      type: 'draft-letter', language: 'fr-FR', visibility: 'matter',
      editor: 'word_desktop', includeSources: true, versionComment: 'Première proposition',
    });
  });

  test('rejects unsupported language/editor instead of making a false UX promise', () => {
    expect(() => normalizeDocumentOptions({ language: 'français' })).toThrow(expect.objectContaining({ code: 'AI_DOCUMENT_LANGUAGE_INVALID' }));
    expect(() => normalizeDocumentOptions({ editor: 'unknown-editor' })).toThrow(expect.objectContaining({ code: 'AI_DOCUMENT_EDITOR_INVALID' }));
    expect(() => normalizeDocumentOptions({ visibility: 'private' })).toThrow(expect.objectContaining({ code: 'AI_DOCUMENT_VISIBILITY_UNSUPPORTED' }));
  });

  test.each([
    ['word-desktop', 'word_desktop'],
    ['word-web', 'word_web'],
    ['google-docs', 'google_docs'],
  ])('accepts exact frontend editor value %s', (input, expected) => {
    expect(normalizeDocumentOptions({ editor: input }).editor).toBe(expected);
  });
});
