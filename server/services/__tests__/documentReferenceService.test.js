const { buildReferenceBlock, choosePinnedVersion } = require('../documentReferenceService');

describe('documentReferenceService', () => {
  const candidate = {
    currentVersionId: 'v2',
    versions: [{ versionId: 'v2' }, { versionId: 'v1' }],
  };

  test('fige une version existante ou suit explicitement la dernière', () => {
    expect(choosePinnedVersion(candidate, 'v1', false)).toBe('v1');
    expect(choosePinnedVersion(candidate, '', true)).toBeNull();
    expect(() => choosePinnedVersion(candidate, 'disparue', false)).toThrow(/n’est plus disponible/);
  });

  test('produit un bloc structuré qui conserve la cible exacte', () => {
    const block = buildReferenceBlock({
      _id: 'mongo-id', referenceId: 'ref-1', sourceDossierId: 'dossier-source',
      sourceDocumentId: 'source', targetDossierId: 'dossier-cible', targetDocumentId: 'piece-1',
      targetVersionId: 'v1', followLatest: false, referenceType: 'piece', label: 'Pièce n° 1', status: 'active',
    });
    expect(block).toMatchObject({
      type: 'reference', referenceId: 'ref-1', targetDocumentId: 'piece-1', targetVersionId: 'v1', followLatest: false,
    });
  });
});
