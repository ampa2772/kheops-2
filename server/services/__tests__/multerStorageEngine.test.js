const fs = require('fs');
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const { createStorageEngine } = require('../multerStorageEngine');
const { buildFileStorage } = require('../fileStorage');

// Simule l'appel de multer a _handleFile et renvoie l'info (ou rejette).
function handle(engine, file, req = {}) {
    return new Promise((resolve, reject) => {
        engine._handleFile(req, file, (err, info) => (err ? reject(err) : resolve(info)));
    });
}

function fakeFile(content, extra = {}) {
    return {
        stream: Readable.from([Buffer.from(content)]),
        mimetype: 'text/plain',
        originalname: 'f.txt',
        ...extra,
    };
}

describe('multerStorageEngine', () => {
    let root;
    let storage;
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-mse-'));
        storage = buildFileStorage({ FILE_STORAGE_LOCAL_ROOT: root });
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    test('ecrit le fichier via storage et renvoie storageKey/size/kind', async () => {
        const engine = createStorageEngine({ storage, keyFn: () => 'a/b/test.txt' });
        const info = await handle(engine, fakeFile('hello '));
        expect(info.storageKey).toBe('a/b/test.txt');
        expect(info.storageKind).toBe('local');
        expect(info.size).toBe(6);
        expect((await storage.read('a/b/test.txt')).toString()).toBe('hello ');
    });

    test('keyFn recoit (req, file)', async () => {
        const keyFn = jest.fn(() => 'k.bin');
        const engine = createStorageEngine({ storage, keyFn });
        const req = { user: 'u1' };
        await handle(engine, fakeFile('x'), req);
        expect(keyFn).toHaveBeenCalledWith(req, expect.objectContaining({ originalname: 'f.txt' }));
    });

    test('_removeFile supprime le fichier via storage', async () => {
        const engine = createStorageEngine({ storage, keyFn: () => 'r.txt' });
        await handle(engine, fakeFile('y'));
        expect(await storage.exists('r.txt')).toBe(true);
        await new Promise((resolve, reject) =>
            engine._removeFile({}, { storageKey: 'r.txt' }, (e) => (e ? reject(e) : resolve()))
        );
        expect(await storage.exists('r.txt')).toBe(false);
    });

    test('propage l erreur si keyFn jette', async () => {
        const engine = createStorageEngine({ storage, keyFn: () => { throw new Error('bad key'); } });
        await expect(handle(engine, fakeFile('z'))).rejects.toThrow('bad key');
    });

    test('keyFn manquant -> throw a la creation', () => {
        expect(() => createStorageEngine({ storage })).toThrow();
    });
});
