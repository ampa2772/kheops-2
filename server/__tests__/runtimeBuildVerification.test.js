process.env.NODE_ENV = 'test';

const path = require('path');
const { HASH_ALGORITHM, computeRuntimeSourceHash } = require('../utils/runtimeSourceManifest');
const {
  describeBuildVerdict,
  describeManifest,
  describeManifestCommit,
  verifyRuntimeBuild,
} = require('../index');

const HEAD = 'c'.repeat(40);

// Empreinte v2 factice, injectee a la place du calcul sur le disque.
const RUNTIME_V2 = { hash: '0123456789abcdef', fileCount: 4, hashAlgorithm: HASH_ALGORITHM };

// Manifeste v1 tel que genere avant l'empreinte canonique (rc4) : ni
// hashAlgorithm, ni gitCommit, ni gitDirty.
const MANIFEST_V1 = {
  buildId: 'BUILD-V1',
  buildTimestamp: '2026-09-04T21:56:00.112Z',
  serverHash: 'c74457d7ce44ffdf',
  fileCount: 278,
  generatedBy: 'generate-build-manifest.js',
};

const MANIFEST_V2 = {
  buildId: 'BUILD-V2',
  buildTimestamp: '2026-09-05T10:00:00.000Z',
  serverHash: RUNTIME_V2.hash,
  fileCount: RUNTIME_V2.fileCount,
  hashAlgorithm: HASH_ALGORITHM,
  gitCommit: HEAD,
  gitDirty: false,
  generatedBy: 'generate-build-manifest.js',
};

const originalNodeEnv = process.env.NODE_ENV;
let savedVerification;

beforeEach(() => {
  savedVerification = global.__buildVerification;
});

afterEach(() => {
  global.__buildVerification = savedVerification;
  process.env.NODE_ENV = originalNodeEnv;
});

describe('describeManifestCommit', () => {
  test('manifeste sans commit (v1, ou git indisponible au build) → inconnu', () => {
    expect(describeManifestCommit(MANIFEST_V1)).toBe('inconnu (manifeste sans commit)');
    expect(describeManifestCommit({ ...MANIFEST_V2, gitCommit: null })).toBe('inconnu (manifeste sans commit)');
    expect(describeManifestCommit({ ...MANIFEST_V2, gitCommit: '' })).toBe('inconnu (manifeste sans commit)');
  });

  test('commit depuis un arbre propre → le commit seul', () => {
    expect(describeManifestCommit(MANIFEST_V2)).toBe(HEAD);
    expect(describeManifestCommit({ ...MANIFEST_V2, gitDirty: null })).toBe(HEAD);
  });

  test('arbre de travail modifie au build → suffixe explicite', () => {
    expect(describeManifestCommit({ ...MANIFEST_V2, gitDirty: true })).toBe(`${HEAD} (arbre de travail modifie au build)`);
    expect(describeManifestCommit({ ...MANIFEST_V1, gitDirty: true }))
      .toBe('inconnu (manifeste sans commit) (arbre de travail modifie au build)');
  });
});

describe('describeManifest (ligne « Hash manifeste » du journal)', () => {
  test('manifeste v2 complet', () => {
    expect(describeManifest(MANIFEST_V2)).toBe(`0123456789abcdef (4 fichiers, kheops-src-v2, commit ${HEAD})`);
  });

  test('manifeste v1 : algorithme non renseigne et commit inconnu', () => {
    expect(describeManifest(MANIFEST_V1))
      .toBe('c74457d7ce44ffdf (278 fichiers, algorithme non renseigne, commit inconnu (manifeste sans commit))');
  });
});

describe('verifyRuntimeBuild', () => {
  test("manifeste v2 identique a l'empreinte → correspondance", () => {
    const verification = verifyRuntimeBuild({ manifest: MANIFEST_V2, runtime: RUNTIME_V2 });
    expect(verification).toEqual({
      manifest: MANIFEST_V2,
      runtime: RUNTIME_V2,
      required: false,
      match: true,
      sameAlgorithm: true,
    });
    expect(global.__buildVerification).toBe(verification);
    expect(describeBuildVerdict(verification)).toBe('OUI — Serveur a jour');
  });

  test("manifeste v1 face a l'empreinte v2 : jamais compare, meme si hash et nombre de fichiers coincidaient", () => {
    const verification = verifyRuntimeBuild({ manifest: MANIFEST_V1, runtime: RUNTIME_V2 });
    expect(verification).toMatchObject({ match: false, sameAlgorithm: false });
    expect(describeBuildVerdict(verification))
      .toBe('NON — manifeste calcule avec un autre algorithme, regenerer le manifeste');

    // Rupture volontaire v1/v2 : une egalite fortuite des valeurs ne suffit pas.
    const coincidence = verifyRuntimeBuild({
      manifest: { ...MANIFEST_V1, serverHash: RUNTIME_V2.hash, fileCount: RUNTIME_V2.fileCount },
      runtime: RUNTIME_V2,
    });
    expect(coincidence).toMatchObject({ match: false, sameAlgorithm: false });

    const future = verifyRuntimeBuild({ manifest: { ...MANIFEST_V2, hashAlgorithm: 'kheops-src-v3' }, runtime: RUNTIME_V2 });
    expect(future).toMatchObject({ match: false, sameAlgorithm: false });
  });

  test('meme algorithme, empreinte ou nombre de fichiers differents → code modifie', () => {
    const changed = verifyRuntimeBuild({ manifest: { ...MANIFEST_V2, serverHash: 'fedcba9876543210' }, runtime: RUNTIME_V2 });
    expect(changed).toMatchObject({ match: false, sameAlgorithm: true });
    expect(describeBuildVerdict(changed)).toBe('NON — ATTENTION, code modifie depuis le build !');

    const count = verifyRuntimeBuild({ manifest: { ...MANIFEST_V2, fileCount: RUNTIME_V2.fileCount + 1 }, runtime: RUNTIME_V2 });
    expect(count).toMatchObject({ match: false, sameAlgorithm: true });
  });

  test('sans manifeste : tolere hors production, refuse en production', () => {
    expect(verifyRuntimeBuild({ manifest: null, runtime: RUNTIME_V2 }))
      .toMatchObject({ required: false, match: true, sameAlgorithm: true });

    process.env.NODE_ENV = 'production';
    expect(verifyRuntimeBuild({ manifest: null, runtime: RUNTIME_V2 }))
      .toMatchObject({ required: true, match: false, sameAlgorithm: true });
  });

  test("sans injection, l'empreinte est celle du dossier serveur en kheops-src-v2", () => {
    const expected = computeRuntimeSourceHash(path.resolve(__dirname, '..'));
    const verification = verifyRuntimeBuild({ manifest: null });
    expect(verification.runtime).toEqual(expected);
    expect(verification.runtime.hashAlgorithm).toBe('kheops-src-v2');
    expect(verification.runtime.fileCount).toBeGreaterThan(0);
  });
});
