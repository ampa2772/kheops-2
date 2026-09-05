const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const runtimeSourceManifest = require('../runtimeSourceManifest');
const { collectRuntimeSourceFiles, computeRuntimeSourceHash, ignoredFile } = runtimeSourceManifest;
// Exports introduits par l'empreinte canonique (absents de l'ancien calcul).
const {
  HASH_ALGORITHM,
  canonicalizeSourceContent,
  computeCanonicalSourceHash,
  isRuntimeSourcePath,
  relativeSourcePath,
} = runtimeSourceManifest;

// Arborescence témoin : un sous-ensemble représentatif du serveur (JS, JSON,
// sous-dossiers, accents), écrite telle quelle dans un dossier temporaire.
const BASE_TREE = {
  'index.js': "const app = require('./services/app');\nmodule.exports = app;\n",
  'package.json': '{\n  "name": "temoin",\n  "version": "1.0.0"\n}\n',
  'services/app.js': "module.exports = { nom: 'témoin', état: 'prêt' };\n",
  'utils/hash.js': 'function hash(value) {\n  return value;\n}\nmodule.exports = hash;\n',
};
const BASE_FILE_COUNT = Object.keys(BASE_TREE).length;

// Arborescence bruitée : BASE_TREE plus tout ce que le contexte Cloud Run
// exclut (.gcloudignore) et que l'empreinte doit donc ignorer.
const NOISY_TREE = {
  ...BASE_TREE,
  'node_modules/dep/index.js': 'module.exports = {};\n',
  '__tests__/app.test.js': 'test("x", () => {});\n',
  'services/__tests__/app.test.js': 'test("y", () => {});\n',
  'services/__tests__/fixture.json': '{}\n',
  'services/app.test.js': 'test("z", () => {});\n',
  'coverage/coverage-final.json': '{}\n',
  'scripts/outil.js': 'console.log(1);\n',
  'scripts/lib/aide.js': 'console.log(3);\n',
  'build-manifest.json': '{ "serverHash": "x" }\n',
  'user.json': '{ "token": "x" }\n',
  'jest.config.js': 'module.exports = {};\n',
  'debug_trace.js': 'console.log(2);\n',
  'README.md': '# notes\n',
  'notes.txt': 'texte\n',
  'services/.env': 'SECRET=x\n',
};

const temporaryDirectories = [];

function makeTemporaryDirectory(label) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `kheops-empreinte-${label}-`));
  temporaryDirectories.push(directory);
  return directory;
}

function writeTree(directory, tree, transform = (content) => content) {
  for (const [relativePath, content] of Object.entries(tree)) {
    const target = path.join(directory, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, transform(content, relativePath));
  }
  return directory;
}

// Empreinte brute des octets, sans aucune normalisation : sert à prouver que
// deux arborescences comparées diffèrent réellement sur le disque.
function rawDigest(directory) {
  const hash = crypto.createHash('sha256');
  for (const file of collectRuntimeSourceFiles(directory).sort()) {
    hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex');
}

function hashOf(directory) {
  return computeRuntimeSourceHash(directory).hash;
}

afterAll(() => {
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('runtimeSourceManifest', () => {
  test('reproduit les exclusions du contexte Cloud Run', () => {
    const serverDirectory = path.resolve(__dirname, '..', '..');
    const relativeFiles = collectRuntimeSourceFiles(serverDirectory)
      .map((file) => path.relative(serverDirectory, file).replace(/\\/g, '/'));

    expect(relativeFiles).toContain('index.js');
    expect(relativeFiles).toContain('utils/runtimeSourceManifest.js');
    expect(relativeFiles.some((file) => file.includes('/__tests__/'))).toBe(false);
    expect(relativeFiles.some((file) => file.startsWith('scripts/'))).toBe(false);
    expect(relativeFiles.some((file) => file.includes('/node_modules/'))).toBe(false);
  });

  test('écarte les fichiers de diagnostic et de test non copiés', () => {
    expect(ignoredFile('debug_file_access.js')).toBe(true);
    expect(ignoredFile('feature.test.js')).toBe(true);
    expect(ignoredFile('jest.config.js')).toBe(true);
    expect(ignoredFile('user.json')).toBe(true);
    expect(ignoredFile('service.js')).toBe(false);
  });

  test('isRuntimeSourcePath juge un chemin relatif avec les règles de collectRuntimeSourceFiles', () => {
    expect(isRuntimeSourcePath('index.js')).toBe(true);
    expect(isRuntimeSourcePath('config/env.js')).toBe(true);
    expect(isRuntimeSourcePath('services/deep/data.json')).toBe(true);
    expect(isRuntimeSourcePath('config\\env.js')).toBe(true);
    expect(isRuntimeSourcePath('scripts/outil.js')).toBe(false);
    expect(isRuntimeSourcePath('utils/__tests__/x.test.js')).toBe(false);
    expect(isRuntimeSourcePath('utils/__tests__/fixture.json')).toBe(false);
    expect(isRuntimeSourcePath('utils/x.test.js')).toBe(false);
    expect(isRuntimeSourcePath('node_modules/dep/index.js')).toBe(false);
    expect(isRuntimeSourcePath('coverage/coverage-final.json')).toBe(false);
    expect(isRuntimeSourcePath('build-manifest.json')).toBe(false);
    expect(isRuntimeSourcePath('user.json')).toBe(false);
    expect(isRuntimeSourcePath('jest.config.js')).toBe(false);
    expect(isRuntimeSourcePath('debug_trace.js')).toBe(false);
    expect(isRuntimeSourcePath('notes.txt')).toBe(false);
    expect(isRuntimeSourcePath('services/.env')).toBe(false);
    expect(isRuntimeSourcePath('')).toBe(false);
  });

  test('isRuntimeSourcePath et collectRuntimeSourceFiles retiennent exactement les mêmes fichiers', () => {
    const directory = writeTree(makeTemporaryDirectory('equivalence'), NOISY_TREE);
    const collected = collectRuntimeSourceFiles(directory)
      .map((file) => path.relative(directory, file).split(path.sep).join('/'))
      .sort();
    const judged = Object.keys(NOISY_TREE).filter(isRuntimeSourcePath).sort();
    expect(judged).toEqual(Object.keys(BASE_TREE).sort());
    expect(collected).toEqual(judged);
  });
});

describe('computeRuntimeSourceHash — représentation canonique', () => {
  test("annonce l'algorithme et conserve hash/fileCount", () => {
    const result = computeRuntimeSourceHash(writeTree(makeTemporaryDirectory('algo'), BASE_TREE));
    expect(HASH_ALGORITHM).toBe('kheops-src-v2');
    expect(result).toEqual({
      hash: expect.stringMatching(/^[0-9a-f]{16}$/),
      fileCount: BASE_FILE_COUNT,
      hashAlgorithm: 'kheops-src-v2',
    });
  });

  test('CRLF et LF : deux arborescences identiques à la fin de ligne près ont la même empreinte', () => {
    const lf = writeTree(makeTemporaryDirectory('lf'), BASE_TREE);
    const crlf = writeTree(makeTemporaryDirectory('crlf'), BASE_TREE, (content) => content.replace(/\n/g, '\r\n'));
    expect(rawDigest(crlf)).not.toBe(rawDigest(lf));
    expect(computeRuntimeSourceHash(crlf)).toEqual(computeRuntimeSourceHash(lf));
  });

  test('CR seul est ramené à LF', () => {
    const lf = writeTree(makeTemporaryDirectory('lf-cr'), BASE_TREE);
    const cr = writeTree(makeTemporaryDirectory('cr'), BASE_TREE, (content) => content.replace(/\n/g, '\r'));
    expect(rawDigest(cr)).not.toBe(rawDigest(lf));
    expect(hashOf(cr)).toBe(hashOf(lf));
  });

  test('un BOM UTF-8 initial est ignoré', () => {
    const plain = writeTree(makeTemporaryDirectory('sans-bom'), BASE_TREE);
    const withBom = writeTree(makeTemporaryDirectory('bom'), BASE_TREE, (content) => `\uFEFF${content}`);
    expect(rawDigest(withBom)).not.toBe(rawDigest(plain));
    expect(hashOf(withBom)).toBe(hashOf(plain));
  });

  test("l'ordre de création des fichiers est sans effet", () => {
    const ordered = writeTree(makeTemporaryDirectory('ordre-a'), BASE_TREE);
    const reversed = writeTree(makeTemporaryDirectory('ordre-b'), Object.fromEntries(Object.entries(BASE_TREE).reverse()));
    expect(hashOf(reversed)).toBe(hashOf(ordered));
  });

  test('chemins Windows et Unix produisent le même chemin canonique', () => {
    expect(relativeSourcePath('C:\\srv', 'C:\\srv\\utils\\hash.js', path.win32)).toBe('utils/hash.js');
    expect(relativeSourcePath('/srv', '/srv/utils/hash.js', path.posix)).toBe('utils/hash.js');

    const directory = writeTree(makeTemporaryDirectory('separateurs'), BASE_TREE);
    const unixStyle = directory.split(path.sep).join('/');
    const nativeStyle = directory.split('/').join(path.sep);
    expect(hashOf(unixStyle)).toBe(hashOf(nativeStyle));
  });

  test('nom et contenu Unicode stables (accents, idéogrammes, formes NFC/NFD)', () => {
    const unicodeName = 'donn\u00e9es/r\u00e9sum\u00e9-\u65e5\u672c\u8a9e.js';
    const content = "const libell\u00e9 = '\u00c9l\u00e9ment \u2014 \u65e5\u672c\u8a9e \u2713';\nmodule.exports = libell\u00e9;\n";
    const tree = { ...BASE_TREE, [unicodeName]: content };
    const first = writeTree(makeTemporaryDirectory('unicode-a'), tree);
    const second = writeTree(makeTemporaryDirectory('unicode-b'), tree);
    const decomposed = writeTree(makeTemporaryDirectory('unicode-nfd'), { ...BASE_TREE, [unicodeName.normalize('NFD')]: content });
    expect(computeRuntimeSourceHash(first).fileCount).toBe(BASE_FILE_COUNT + 1);
    expect(hashOf(second)).toBe(hashOf(first));
    expect(hashOf(decomposed)).toBe(hashOf(first));
    expect(hashOf(first)).not.toBe(hashOf(writeTree(makeTemporaryDirectory('unicode-sans'), BASE_TREE)));
  });

  test("les métadonnées (dates) ne participent pas à l'empreinte", () => {
    const directory = writeTree(makeTemporaryDirectory('mtime'), BASE_TREE);
    const before = hashOf(directory);
    const old = new Date('2001-01-01T00:00:00Z');
    for (const file of collectRuntimeSourceFiles(directory)) fs.utimesSync(file, old, old);
    expect(hashOf(directory)).toBe(before);
  });

  test("un seul caractère modifié change l'empreinte", () => {
    const reference = writeTree(makeTemporaryDirectory('ref'), BASE_TREE);
    const modified = writeTree(makeTemporaryDirectory('modif'), {
      ...BASE_TREE,
      'utils/hash.js': BASE_TREE['utils/hash.js'].replace('return value;', 'return valuf;'),
    });
    expect(computeRuntimeSourceHash(modified).fileCount).toBe(BASE_FILE_COUNT);
    expect(hashOf(modified)).not.toBe(hashOf(reference));
  });

  test("un fichier ajouté change l'empreinte et le nombre de fichiers", () => {
    const reference = writeTree(makeTemporaryDirectory('ref-ajout'), BASE_TREE);
    const extended = writeTree(makeTemporaryDirectory('ajout'), { ...BASE_TREE, 'services/extra.js': 'module.exports = 1;\n' });
    const result = computeRuntimeSourceHash(extended);
    expect(result.fileCount).toBe(BASE_FILE_COUNT + 1);
    expect(result.hash).not.toBe(hashOf(reference));
  });

  test('les exclusions du contexte Cloud Run sont respectées', () => {
    const reference = writeTree(makeTemporaryDirectory('ref-exclusions'), BASE_TREE);
    const noisy = writeTree(makeTemporaryDirectory('exclusions'), NOISY_TREE);
    expect(computeRuntimeSourceHash(noisy)).toEqual(computeRuntimeSourceHash(reference));
  });

  test('des octets non UTF-8 donnent une empreinte déterministe et participent', () => {
    // Le décodage UTF-8 remplace les octets invalides par U+FFFD, comme le fait
    // le chargeur de Node au démarrage : deux fichiers que l'empreinte confond
    // s'exécutent de la même façon. Ce qui compte ici est que le résultat soit
    // stable d'une copie à l'autre et que le fichier participe bien.
    const invalid = Buffer.concat([Buffer.from('const a = "'), Buffer.from([0xff, 0xfe, 0xc3]), Buffer.from('";\n')]);
    const tree = { ...BASE_TREE, 'services/octets.js': invalid };
    const first = writeTree(makeTemporaryDirectory('octets-a'), tree);
    const second = writeTree(makeTemporaryDirectory('octets-b'), tree);
    expect(computeRuntimeSourceHash(first).fileCount).toBe(BASE_FILE_COUNT + 1);
    expect(hashOf(second)).toBe(hashOf(first));
    expect(hashOf(first)).not.toBe(hashOf(writeTree(makeTemporaryDirectory('octets-sans'), BASE_TREE)));
    const valid = writeTree(makeTemporaryDirectory('octets-valide'), { ...BASE_TREE, 'services/octets.js': 'const a = "";\n' });
    expect(hashOf(first)).not.toBe(hashOf(valid));
  });
});

describe('computeCanonicalSourceHash (fonction pure) et canonicalizeSourceContent', () => {
  const entries = [
    { relativePath: 'index.js', content: Buffer.from('a\n') },
    { relativePath: 'Z.js', content: Buffer.from('z\n') },
    { relativePath: 'utils/\u00e9.js', content: Buffer.from('e\n') },
    { relativePath: 'b.json', content: Buffer.from('{}\n') },
  ];

  test("l'ordre des entrées est sans effet (tri binaire des chemins)", () => {
    const reference = computeCanonicalSourceHash(entries);
    expect(computeCanonicalSourceHash([...entries].reverse())).toEqual(reference);
    expect(computeCanonicalSourceHash([entries[2], entries[0], entries[3], entries[1]])).toEqual(reference);
    expect(reference.fileCount).toBe(4);
    expect(reference.hashAlgorithm).toBe('kheops-src-v2');
  });

  test("renommer un fichier change l'empreinte", () => {
    const renamed = entries.map((entry) => (entry.relativePath === 'b.json' ? { ...entry, relativePath: 'c.json' } : entry));
    expect(computeCanonicalSourceHash(renamed).hash).not.toBe(computeCanonicalSourceHash(entries).hash);
  });

  test('aucune ambiguïté entre la frontière chemin/contenu', () => {
    const first = computeCanonicalSourceHash([{ relativePath: 'a', content: Buffer.from('bc') }]);
    const second = computeCanonicalSourceHash([{ relativePath: 'ab', content: Buffer.from('c') }]);
    expect(first.hash).not.toBe(second.hash);
  });

  test('canonicalizeSourceContent retire le BOM initial et ramène CRLF/CR à LF', () => {
    expect(canonicalizeSourceContent(Buffer.from('\uFEFFa\r\nb\rc\n'))).toBe('a\nb\nc\n');
    expect(canonicalizeSourceContent(Buffer.from('a\uFEFFb'))).toBe('a\uFEFFb');
    expect(canonicalizeSourceContent(Buffer.from(''))).toBe('');
  });
});

describe('manifeste de build (scripts/generate-build-manifest.js)', () => {
  const {
    buildManifest,
    isShippedSourcePath,
    listUntrackedShippedSources,
    readGitState,
  } = require('../../../scripts/generate-build-manifest');
  const HEAD = 'a'.repeat(40);
  const LS_FILES_ARGS = ['ls-files', '--others', '--exclude-standard', '-z', '--', 'server', 'client/src', 'client/public'];

  function fakeGit(responses) {
    return jest.fn((args) => {
      const response = responses[args[0]];
      if (response instanceof Error) throw response;
      return response;
    });
  }

  test("isShippedSourcePath : sources du serveur selon l'empreinte, tout client/src et client/public", () => {
    expect(isShippedSourcePath('server/config/env.js')).toBe(true);
    expect(isShippedSourcePath('server\\config\\env.js')).toBe(true);
    expect(isShippedSourcePath('server/services/données.json')).toBe(true);
    expect(isShippedSourcePath('client/src/App.js')).toBe(true);
    expect(isShippedSourcePath('client/src/styles/app.css')).toBe(true);
    expect(isShippedSourcePath('client/public/index.html')).toBe(true);
    expect(isShippedSourcePath('server/scripts/outil.js')).toBe(false);
    expect(isShippedSourcePath('server/scripts/lib/aide.js')).toBe(false);
    expect(isShippedSourcePath('server/utils/__tests__/x.test.js')).toBe(false);
    expect(isShippedSourcePath('server/utils/x.test.js')).toBe(false);
    expect(isShippedSourcePath('server/notes.txt')).toBe(false);
    expect(isShippedSourcePath('server/build-manifest.json')).toBe(false);
    expect(isShippedSourcePath('server/.env.development')).toBe(false);
    expect(isShippedSourcePath('client/build/main.js')).toBe(false);
    expect(isShippedSourcePath('client/package.json')).toBe(false);
    expect(isShippedSourcePath('docs/notes.md')).toBe(false);
    expect(isShippedSourcePath('scripts/generate-build-manifest.js')).toBe(false);
    expect(isShippedSourcePath('serveur/index.js')).toBe(false);
    expect(isShippedSourcePath('client/srcx/App.js')).toBe(false);
  });

  test("listUntrackedShippedSources : sortie -z de git ls-files filtrée par les règles de l'image", () => {
    const git = fakeGit({
      'ls-files': [
        'server/config/env.js',
        'server/scripts/outil.js',
        'server/notes.txt',
        'server/utils/__tests__/env.test.js',
        'server/services/données.json',
        'client/src/App.js',
        'client/public/robots.txt',
      ].join('\0') + '\0',
    });
    expect(listUntrackedShippedSources({ cwd: 'repo', git })).toEqual([
      'server/config/env.js',
      'server/services/données.json',
      'client/src/App.js',
      'client/public/robots.txt',
    ]);
    expect(git).toHaveBeenCalledWith(LS_FILES_ARGS, 'repo');
    expect(listUntrackedShippedSources({ cwd: 'repo', git: fakeGit({ 'ls-files': '' }) })).toEqual([]);
  });

  test('readGitState : commit HEAD complet et arbre propre (aucune source non suivie)', () => {
    const git = fakeGit({ 'rev-parse': `${HEAD}\n`, status: '', 'ls-files': '' });
    expect(readGitState({ cwd: 'repo', git })).toEqual({ gitCommit: HEAD, gitDirty: false });
    expect(git).toHaveBeenCalledWith(['rev-parse', '--verify', 'HEAD'], 'repo');
    expect(git).toHaveBeenCalledWith(['status', '--porcelain', '--untracked-files=no'], 'repo');
    expect(git).toHaveBeenCalledWith(LS_FILES_ARGS, 'repo');
  });

  test('readGitState : modifications suivies en attente → gitDirty', () => {
    const git = fakeGit({ 'rev-parse': `${HEAD}\n`, status: ' M server/index.js\n', 'ls-files': '' });
    expect(readGitState({ cwd: 'repo', git })).toEqual({ gitCommit: HEAD, gitDirty: true });
  });

  test("readGitState : source non suivie qui entrerait dans l'image → gitDirty", () => {
    const server = fakeGit({ 'rev-parse': `${HEAD}\n`, status: '', 'ls-files': 'server/config/env.js\0' });
    expect(readGitState({ cwd: 'repo', git: server })).toEqual({ gitCommit: HEAD, gitDirty: true });
    const client = fakeGit({ 'rev-parse': `${HEAD}\n`, status: '', 'ls-files': 'client/src/App.js\0' });
    expect(readGitState({ cwd: 'repo', git: client })).toEqual({ gitCommit: HEAD, gitDirty: true });
  });

  test("readGitState : fichiers non suivis exclus de l'image → arbre propre", () => {
    const git = fakeGit({
      'rev-parse': `${HEAD}\n`,
      status: '',
      'ls-files': [
        'server/scripts/outil.js',
        'server/notes.txt',
        'server/utils/env.test.js',
        'server/config/__tests__/env.test.js',
        'server/.env.development.example',
      ].join('\0') + '\0',
    });
    expect(readGitState({ cwd: 'repo', git })).toEqual({ gitCommit: HEAD, gitDirty: false });
  });

  test("readGitState : échec de git ls-files → état de l'arbre inconnu", () => {
    const git = fakeGit({ 'rev-parse': `${HEAD}\n`, status: '', 'ls-files': new Error('git ls-files a échoué') });
    expect(readGitState({ cwd: 'repo', git })).toEqual({ gitCommit: HEAD, gitDirty: null });
  });

  test('readGitState : seul un commit de 40 hexadécimaux est accepté (même règle que deploy.sh)', () => {
    for (const head of ['b'.repeat(64), 'abc123', HEAD.toUpperCase(), `${HEAD} `]) {
      const git = fakeGit({ 'rev-parse': `${head}\n`, status: '', 'ls-files': '' });
      expect(readGitState({ cwd: 'repo', git })).toEqual({ gitCommit: head === `${HEAD} ` ? HEAD : null, gitDirty: head === `${HEAD} ` ? false : null });
    }
  });

  test('readGitState : git indisponible ou hors dépôt → null', () => {
    const git = fakeGit({ 'rev-parse': new Error('spawn git ENOENT') });
    expect(readGitState({ cwd: 'repo', git })).toEqual({ gitCommit: null, gitDirty: null });
    expect(readGitState({ cwd: 'repo', git: fakeGit({ 'rev-parse': 'fatal: not a git repository\n' }) }))
      .toEqual({ gitCommit: null, gitDirty: null });
  });

  test('buildManifest : conserve buildId/buildTimestamp/serverHash/fileCount et ajoute commit, état et algorithme', () => {
    const directory = writeTree(makeTemporaryDirectory('manifeste'), BASE_TREE);
    const now = new Date('2026-09-05T10:00:00.000Z');
    const manifest = buildManifest({ serverDirectory: directory, gitState: { gitCommit: HEAD, gitDirty: false }, now });
    expect(manifest).toEqual({
      buildId: `BUILD-${now.getTime().toString(36).toUpperCase()}`,
      buildTimestamp: '2026-09-05T10:00:00.000Z',
      serverHash: hashOf(directory),
      fileCount: BASE_FILE_COUNT,
      hashAlgorithm: 'kheops-src-v2',
      gitCommit: HEAD,
      gitDirty: false,
      generatedBy: 'generate-build-manifest.js',
    });
  });

  // Dépôt Git réel et temporaire : vérifie la commande git elle-même
  // (--others --exclude-standard -z, pathspecs, .gitignore), pas seulement le
  // filtre. Ignoré si git est absent du poste.
  const { execFileSync } = require('child_process');
  let gitAvailable = false;
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore', windowsHide: true });
    gitAvailable = true;
  } catch (error) {
    gitAvailable = false;
  }
  const testWithGit = gitAvailable ? test : test.skip;

  testWithGit('dépôt Git réel : sources non suivies embarquées, .gitignore respecté, puis gitDirty du manifeste', () => {
    const repo = makeTemporaryDirectory('depot');
    const run = (args) => execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    run(['init', '-q']);
    run(['config', 'core.autocrlf', 'false']);
    run(['config', 'user.name', 'Kheops test']);
    run(['config', 'user.email', 'kheops-test@example.invalid']);
    run(['config', 'commit.gpgsign', 'false']);
    writeTree(repo, {
      '.gitignore': 'server/.env\nserver/node_modules/\n',
      'server/index.js': "module.exports = 'index';\n",
      'server/package.json': '{ "name": "temoin" }\n',
      'client/src/index.js': 'export default 1;\n',
      'docs/notes.md': '# notes\n',
    });
    run(['add', '--all']);
    run(['commit', '-q', '-m', 'initial']);
    expect(listUntrackedShippedSources({ cwd: repo })).toEqual([]);
    const initial = readGitState({ cwd: repo });
    expect(initial).toEqual({ gitCommit: expect.stringMatching(/^[0-9a-f]{40}$/), gitDirty: false });

    writeTree(repo, {
      'server/config/env.js': 'module.exports = {};\n',
      'server/services/données.json': '{}\n',
      'server/scripts/outil.js': 'console.log(1);\n',
      'server/utils/__tests__/env.test.js': 'test("x", () => {});\n',
      'server/utils/env.test.js': 'test("y", () => {});\n',
      'server/notes.txt': 'texte\n',
      'server/.env': 'SECRET=x\n',
      'server/node_modules/dep/index.js': 'module.exports = {};\n',
      'client/src/App.js': 'export default 2;\n',
      'client/public/index.html': '<html></html>\n',
      'client/build/main.js': 'built\n',
      'docs/autre.md': '# autre\n',
      'scripts/outil-racine.js': 'console.log(2);\n',
    });
    const listed = listUntrackedShippedSources({ cwd: repo }).map((file) => file.normalize('NFC'));
    expect(listed).toEqual([
      'client/public/index.html',
      'client/src/App.js',
      'server/config/env.js',
      'server/services/données.json',
    ]);
    expect(readGitState({ cwd: repo })).toEqual({ gitCommit: initial.gitCommit, gitDirty: true });

    run(['add', '--', 'server/config/env.js', 'server/services/données.json', 'client/src/App.js', 'client/public/index.html']);
    expect(listUntrackedShippedSources({ cwd: repo })).toEqual([]);
    expect(readGitState({ cwd: repo })).toEqual({ gitCommit: initial.gitCommit, gitDirty: true });
    run(['commit', '-q', '-m', 'sources']);
    const committed = readGitState({ cwd: repo });
    expect(committed.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(committed.gitCommit).not.toBe(initial.gitCommit);
    expect(committed.gitDirty).toBe(false);

    fs.appendFileSync(path.join(repo, 'server', 'index.js'), '// modification locale\n');
    expect(readGitState({ cwd: repo })).toEqual({ gitCommit: committed.gitCommit, gitDirty: true });
  });
});
