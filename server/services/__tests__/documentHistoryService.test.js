jest.mock('../../models/Storage/DocumentHistory', () => ({}));
jest.mock('../fileStorage', () => ({ getFileStorage: jest.fn() }));

const {
  checksumOf,
  historyStorageKey,
} = require('../documentHistoryService');

describe('documentHistoryService helpers', () => {
  test('checksum SHA-256 déterministe', () => {
    expect(checksumOf(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('clé de version neutralise les traversées de chemin', () => {
    const key = historyStorageKey('../tenant', '../../doc', 'v/1', 'test.docx');
    expect(key).toMatch(/^document-history\//);
    expect(key).not.toContain('..');
    expect(key).toMatch(/\.docx$/);
  });

  test('clé de version conserve le format texte original', () => {
    const key = historyStorageKey('tenant', 'document', 'version', 'notes.txt');
    expect(key).toMatch(/\.txt$/);
    expect(key).not.toMatch(/\.docx$/);
  });
});
