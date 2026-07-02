const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    buildFileStorage,
    resolveStorageConfig,
    sanitizeKey,
    LocalDiskStorage,
    GcsStorage,
} = require('../fileStorage');

describe('fileStorage — sanitizeKey', () => {
    test('normalise les backslashes et le slash initial', () => {
        expect(sanitizeKey('\\a\\b.txt')).toBe('a/b.txt');
        expect(sanitizeKey('/x/y')).toBe('x/y');
    });
    test('rejette le path traversal', () => {
        expect(() => sanitizeKey('../secret')).toThrow();
        expect(() => sanitizeKey('a/../../b')).toThrow();
    });
    test('rejette une cle vide ou nulle', () => {
        expect(() => sanitizeKey('')).toThrow();
        expect(() => sanitizeKey(null)).toThrow();
    });
});

describe('fileStorage — resolveStorageConfig (selection sans instanciation)', () => {
    test('local par defaut (aucun GCS_BUCKET)', () => {
        const cfg = resolveStorageConfig({});
        expect(cfg.kind).toBe('local');
        expect(typeof cfg.options.root).toBe('string');
    });
    test('local respecte FILE_STORAGE_LOCAL_ROOT', () => {
        const cfg = resolveStorageConfig({ FILE_STORAGE_LOCAL_ROOT: '/tmp/x' });
        expect(cfg.options.root).toBe('/tmp/x');
    });
    test('gcs des que GCS_BUCKET est defini', () => {
        const cfg = resolveStorageConfig({ GCS_BUCKET: 'my-bucket', GCS_PROJECT_ID: 'p' });
        expect(cfg.kind).toBe('gcs');
        expect(cfg.options.bucket).toBe('my-bucket');
        expect(cfg.options.projectId).toBe('p');
    });
});

describe('fileStorage — LocalDiskStorage CRUD', () => {
    let root;
    let storage;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-fs-'));
        storage = buildFileStorage({ FILE_STORAGE_LOCAL_ROOT: root });
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('buildFileStorage renvoie un adaptateur local par defaut', () => {
        expect(storage).toBeInstanceOf(LocalDiskStorage);
        expect(storage.kind).toBe('local');
    });

    test('save puis read restitue le contenu (avec sous-dossiers)', async () => {
        const key = 'cabinets/c1/doc1/hello.txt';
        const res = await storage.save(key, Buffer.from('bonjour'), { contentType: 'text/plain' });
        expect(res.key).toBe(key);
        expect(await storage.exists(key)).toBe(true);
        const buf = await storage.read(key);
        expect(buf.toString()).toBe('bonjour');
    });

    test('exists = false pour une cle inconnue', async () => {
        expect(await storage.exists('nope.txt')).toBe(false);
    });

    test('delete supprime puis est idempotent', async () => {
        const key = 'a/b.txt';
        await storage.save(key, Buffer.from('x'));
        await storage.delete(key);
        expect(await storage.exists(key)).toBe(false);
        await expect(storage.delete(key)).resolves.toBeUndefined();
    });

    test('getSignedUrl renvoie un chemin API en local', async () => {
        expect(await storage.getSignedUrl('a/b.txt')).toBe('/api/files/a/b.txt');
    });

    test('refuse le path traversal a la sauvegarde', async () => {
        await expect(storage.save('../evil.txt', Buffer.from('x'))).rejects.toThrow();
    });
});

describe('fileStorage — GcsStorage (instanciation, sans reseau)', () => {
    test('buildFileStorage instancie GcsStorage quand GCS_BUCKET est defini', () => {
        const s = buildFileStorage({ GCS_BUCKET: 'test-bucket', GCS_PROJECT_ID: 'test-proj' });
        expect(s).toBeInstanceOf(GcsStorage);
        expect(s.kind).toBe('gcs');
        expect(s.bucketName).toBe('test-bucket');
    });
});
