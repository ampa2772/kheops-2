const { isDuplicateVersion, isVersionConflict } = require('../documentHistoryService');

describe('documentHistoryService.isVersionConflict', () => {
  test('une synchronisation compagnon sans base ne remplace pas une version existante', () => {
    expect(isVersionConflict({
      baseVersionId: null,
      previousCurrent: 'v2',
      latestChecksum: 'abc',
      requireBaseVersion: true,
    })).toBe(true);
  });

  test('la version courante exacte autorise la prochaine sauvegarde séquentielle', () => {
    expect(isVersionConflict({
      baseVersionId: 'v2',
      previousCurrent: 'v2',
      latestChecksum: 'abc',
      requireBaseVersion: true,
    })).toBe(false);
  });

  test("l'empreinte du téléchargement initial protège aussi un document hérité", () => {
    expect(isVersionConflict({
      baseVersionId: 'sha256:abc',
      previousCurrent: 'v1',
      latestChecksum: 'abc',
      requireBaseVersion: true,
    })).toBe(false);
    expect(isVersionConflict({
      baseVersionId: 'sha256:abc',
      previousCurrent: 'v2',
      latestChecksum: 'changed',
      requireBaseVersion: true,
    })).toBe(true);
  });

  test("la première version d'un document reste créable sans faux conflit", () => {
    expect(isVersionConflict({
      baseVersionId: null,
      previousCurrent: null,
      requireBaseVersion: true,
    })).toBe(false);
  });
});

describe('documentHistoryService.isDuplicateVersion', () => {
  test('un retry identique après une réponse perdue est idempotent', () => {
    expect(isDuplicateVersion({
      latest: {
        checksum: 'same-bytes',
        status: 'draft',
        comment: 'Synchronisation depuis Microsoft Word',
        structuredChecksum: null,
      },
      checksum: 'same-bytes',
      status: 'draft',
      normalizedComment: 'Synchronisation depuis Microsoft Word',
      structuredChecksum: null,
    })).toBe(true);
  });

  test('des octets ou métadonnées différents ne sont jamais absorbés comme retry', () => {
    const latest = {
      checksum: 'current-bytes',
      status: 'draft',
      comment: 'Synchronisation depuis Microsoft Word',
      structuredChecksum: null,
    };
    expect(isDuplicateVersion({
      latest,
      checksum: 'other-bytes',
      status: 'draft',
      normalizedComment: latest.comment,
      structuredChecksum: null,
    })).toBe(false);
    expect(isDuplicateVersion({
      latest,
      checksum: latest.checksum,
      status: 'validated',
      normalizedComment: latest.comment,
      structuredChecksum: null,
    })).toBe(false);
  });
});
