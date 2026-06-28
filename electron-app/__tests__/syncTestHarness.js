/* eslint-disable no-console */
// Sync test harness — exécute des scénarios de synchro Cloud → Local
// SANS ouvrir l'application Electron. Mock cloudContext + configManager,
// puis charge le vrai localFileWatcher.js et appelle pullFromDrive().
//
// Usage : node electron-app/__tests__/syncTestHarness.js
//
// Sortie : OK / FAIL pour chaque scénario, et code de sortie != 0 si au moins
// un test a échoué.

const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

// ─────────────────────────────────────────────────────────────────────────────
// Setup : répertoire temporaire de test
// ─────────────────────────────────────────────────────────────────────────────
const TEST_LOCAL_ROOT = path.join(os.tmpdir(), 'kheops-sync-test-' + Date.now());

function resetLocalRoot() {
    try {
        if (fs.existsSync(TEST_LOCAL_ROOT)) {
            fs.rmSync(TEST_LOCAL_ROOT, { recursive: true, force: true });
        }
    } catch (_) { /* ignore */ }
    fs.mkdirSync(TEST_LOCAL_ROOT, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mocks injectés dans require.cache AVANT chargement de localFileWatcher
// ─────────────────────────────────────────────────────────────────────────────
const SERVICES_DIR = path.resolve(__dirname, '..', 'services');

const fakeConfigManager = {
    getLocalRootPath: () => TEST_LOCAL_ROOT,
    getBaseRootPath: () => TEST_LOCAL_ROOT,
    setCurrentAccount: () => {},
    getCurrentAccount: () => 'test@example.com',
    sanitizeEmail: (e) => e,
    migrateIfNeeded: () => {},
    isConfigured: () => true,
    setLocalRootPath: () => {},
};

let fakeCloudHandle = null; // assigné par chaque test
const fakeCloudContext = {
    getCloudCtx: () => (fakeCloudHandle ? { service: fakeCloudHandle, source: 'google' } : null),
    requireCloudCtx: () => {
        if (!fakeCloudHandle) throw new Error('No cloud (test harness)');
        return { service: fakeCloudHandle, source: 'google' };
    },
};

function injectMock(modulePath, exportsObj) {
    const resolved = require.resolve(modulePath);
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: exportsObj,
        children: [],
        paths: Module._nodeModulePaths(path.dirname(resolved)),
    };
}

injectMock(path.join(SERVICES_DIR, 'configManager.js'), fakeConfigManager);
injectMock(path.join(SERVICES_DIR, 'cloudContext.js'), fakeCloudContext);

// Charger le vrai localFileWatcher APRÈS injection des mocks
const localFileWatcher = require(path.join(SERVICES_DIR, 'localFileWatcher.js'));

// ─────────────────────────────────────────────────────────────────────────────
// Fake cloud service : simule Google Drive / OneDrive en mémoire
// ─────────────────────────────────────────────────────────────────────────────
function createFakeCloud(structure, options = {}) {
    // structure : forme à plat { 'Dossier_A': [ { name, content, modifiedTime? } ] }
    //         OU forme arborescente { 'Dossier_A': { _files: [...], 'Sous_dossier': { ... } } }
    // Le dossier racine simulé est "Files_Clients" (créé automatiquement).
    // options : { transientFailFile?: string, permanentFailFile?: string,
    //             transientFailRetriesRemaining?: number, listChildrenError?: boolean }
    const folders = new Map();   // id -> { name, parentId }
    const files = new Map();     // id -> { name, parentId, content (Buffer), modifiedTime }
    let nextId = 1;
    const newId = (p) => p + (nextId++);

    const rootFcId = newId('fc-');
    folders.set(rootFcId, { name: 'Files_Clients', parentId: 'root' });

    function addNode(parentId, name, value) {
        // value peut être :
        //  - un array de { name, content, modifiedTime? } (forme à plat — fichiers seulement)
        //  - un object { _files?: [...], <subFolder>: <subValue> } (forme arborescente)
        const folderId = newId('fol-');
        folders.set(folderId, { name, parentId });

        if (Array.isArray(value)) {
            for (const f of value) {
                const dId = newId('doc-');
                files.set(dId, {
                    name: f.name, parentId: folderId,
                    content: Buffer.isBuffer(f.content) ? f.content : Buffer.from(String(f.content)),
                    modifiedTime: f.modifiedTime || new Date().toISOString(),
                });
            }
        } else if (value && typeof value === 'object') {
            // Forme arborescente
            const filesArr = value._files || [];
            for (const f of filesArr) {
                const dId = newId('doc-');
                files.set(dId, {
                    name: f.name, parentId: folderId,
                    content: Buffer.isBuffer(f.content) ? f.content : Buffer.from(String(f.content)),
                    modifiedTime: f.modifiedTime || new Date().toISOString(),
                });
            }
            for (const [subName, subVal] of Object.entries(value)) {
                if (subName === '_files') continue;
                addNode(folderId, subName, subVal);
            }
        }
    }

    for (const [name, value] of Object.entries(structure)) {
        addNode(rootFcId, name, value);
    }

    let transientRetriesLeft = options.transientFailRetriesRemaining ?? 0;

    return {
        // ── Compteurs (utiles pour les assertions) ──
        _stats: { listChildrenCalls: 0, downloadCalls: 0, downloadFailures: 0 },

        async ensureFolder(name, parentId = 'root') {
            for (const [id, f] of folders.entries()) {
                if (f.name === name && f.parentId === parentId) return id;
            }
            const id = newId('fol-');
            folders.set(id, { name, parentId });
            return id;
        },

        async listChildren(parentId, _fields) {
            this._stats.listChildrenCalls++;
            if (options.listChildrenError) {
                throw new Error('Simulated listChildren error');
            }
            const out = [];
            for (const [id, f] of folders.entries()) {
                if (f.parentId === parentId) {
                    out.push({
                        id, name: f.name,
                        mimeType: 'application/vnd.google-apps.folder',
                    });
                }
            }
            for (const [id, f] of files.entries()) {
                if (f.parentId === parentId) {
                    out.push({
                        id, name: f.name,
                        mimeType: 'text/plain',
                        modifiedTime: f.modifiedTime,
                        size: f.content.length,
                    });
                }
            }
            return out;
        },

        async downloadFile(fileId, destPath) {
            this._stats.downloadCalls++;
            const file = files.get(fileId);
            if (!file) throw new Error(`File ${fileId} introuvable`);

            // Simulation erreur permanente sur ce fichier
            if (options.permanentFailFile && file.name === options.permanentFailFile) {
                this._stats.downloadFailures++;
                const err = new Error(`Permanent error on ${file.name}`);
                err.code = 'PERMANENT';
                throw err;
            }

            // Simulation erreur transitoire (retry attendu)
            if (options.transientFailFile && file.name === options.transientFailFile && transientRetriesLeft > 0) {
                transientRetriesLeft--;
                this._stats.downloadFailures++;
                const err = new Error(`Transient error on ${file.name}`);
                err.code = 'ETIMEDOUT';
                throw err;
            }

            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            fs.writeFileSync(destPath, file.content);
            return destPath;
        },

        async getFileMetadata(fileId, _fields) {
            const f = files.get(fileId);
            if (!f) throw new Error(`File ${fileId} introuvable`);
            return {
                id: fileId, name: f.name, mimeType: 'text/plain',
                modifiedTime: f.modifiedTime, size: f.content.length,
            };
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers tests
// ─────────────────────────────────────────────────────────────────────────────
function assert(cond, msg) {
    if (!cond) throw new Error('Assertion failed: ' + msg);
}

function expectFile(relPath, expectedContent) {
    const full = path.join(TEST_LOCAL_ROOT, relPath);
    assert(fs.existsSync(full), `Fichier attendu absent: ${relPath}`);
    if (expectedContent !== undefined) {
        const got = fs.readFileSync(full);
        assert(got.equals(Buffer.isBuffer(expectedContent) ? expectedContent : Buffer.from(expectedContent)),
            `Contenu différent pour ${relPath}: attendu="${expectedContent}" obtenu="${got}"`);
    }
}

function expectNoFile(relPath) {
    const full = path.join(TEST_LOCAL_ROOT, relPath);
    assert(!fs.existsSync(full), `Fichier inattendu présent: ${relPath}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite de tests
// ─────────────────────────────────────────────────────────────────────────────
const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

test('1. Happy path — 3 dossiers, 6 fichiers, dossier local vide → tout est téléchargé', async () => {
    resetLocalRoot();
    fakeCloudHandle = createFakeCloud({
        'Dossier_A': [
            { name: 'note.txt', content: 'A1' },
            { name: 'contrat.docx', content: 'A2' },
        ],
        'Dossier_B': [
            { name: 'jugement.pdf', content: 'B1' },
            { name: 'memo.txt', content: 'B2' },
        ],
        'Dossier_C': [
            { name: 'expertise.docx', content: 'C1' },
            { name: 'photos.zip', content: 'C2' },
        ],
    });

    await localFileWatcher.pullFromDrive();

    expectFile('Dossier_A/note.txt', 'A1');
    expectFile('Dossier_A/contrat.docx', 'A2');
    expectFile('Dossier_B/jugement.pdf', 'B1');
    expectFile('Dossier_B/memo.txt', 'B2');
    expectFile('Dossier_C/expertise.docx', 'C1');
    expectFile('Dossier_C/photos.zip', 'C2');
});

test('2. Re-pull idempotent — tous les fichiers déjà présents et identiques → aucun re-download', async () => {
    // Suite directe du test 1, on garde TEST_LOCAL_ROOT
    fakeCloudHandle._stats.downloadCalls = 0;
    await localFileWatcher.pullFromDrive();
    assert(fakeCloudHandle._stats.downloadCalls === 0,
        `Aucun download attendu, ${fakeCloudHandle._stats.downloadCalls} effectués`);
});

test('3. Cloud plus récent — un fichier modifié récemment côté cloud → re-téléchargé', async () => {
    resetLocalRoot();
    const oldTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    fakeCloudHandle = createFakeCloud({
        'Dossier_X': [
            { name: 'doc.txt', content: 'old-version', modifiedTime: oldTime },
        ],
    });
    await localFileWatcher.pullFromDrive();
    expectFile('Dossier_X/doc.txt', 'old-version');

    // Modifier le contenu côté cloud avec un timestamp récent
    fakeCloudHandle = createFakeCloud({
        'Dossier_X': [
            { name: 'doc.txt', content: 'new-version', modifiedTime: new Date().toISOString() },
        ],
    });
    // Backdate le local pour s'assurer qu'on est avant le cloud
    const localFile = path.join(TEST_LOCAL_ROOT, 'Dossier_X', 'doc.txt');
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(localFile, past, past);

    await localFileWatcher.pullFromDrive();
    expectFile('Dossier_X/doc.txt', 'new-version');
});

test('4. Templates ignoré — le dossier Templates ne doit pas être pull', async () => {
    resetLocalRoot();
    fakeCloudHandle = createFakeCloud({
        'Templates': [{ name: 'Courrier.docx', content: 'TPL' }],
        'Vrai_Dossier': [{ name: 'fichier.txt', content: 'V' }],
    });
    await localFileWatcher.pullFromDrive();
    expectNoFile('Templates/Courrier.docx');
    expectFile('Vrai_Dossier/fichier.txt', 'V');
});

test('5. Erreur transitoire (retry) — un fichier rate 1 fois puis réussit → présent en local', async () => {
    resetLocalRoot();
    fakeCloudHandle = createFakeCloud({
        'D': [{ name: 'flaky.txt', content: 'OK' }],
    }, { transientFailFile: 'flaky.txt', transientFailRetriesRemaining: 1 });
    await localFileWatcher.pullFromDrive();
    // Si on n'a pas de retry, le fichier sera absent (BUG attendu sur code actuel).
    expectFile('D/flaky.txt', 'OK');
});

test('6. Erreur permanente — un fichier en erreur ne bloque pas les autres', async () => {
    resetLocalRoot();
    fakeCloudHandle = createFakeCloud({
        'D': [
            { name: 'broken.txt', content: 'X' },
            { name: 'good.txt', content: 'OK' },
        ],
    }, { permanentFailFile: 'broken.txt' });
    await localFileWatcher.pullFromDrive();
    expectFile('D/good.txt', 'OK');
    expectNoFile('D/broken.txt');
});

test('7. Beaucoup de dossiers (50) — tous téléchargés', async () => {
    resetLocalRoot();
    const big = {};
    for (let i = 0; i < 50; i++) {
        big[`Dossier_${i}`] = [
            { name: `f${i}_1.txt`, content: `c${i}_1` },
            { name: `f${i}_2.txt`, content: `c${i}_2` },
        ];
    }
    fakeCloudHandle = createFakeCloud(big);
    await localFileWatcher.pullFromDrive();
    for (let i = 0; i < 50; i++) {
        expectFile(`Dossier_${i}/f${i}_1.txt`, `c${i}_1`);
        expectFile(`Dossier_${i}/f${i}_2.txt`, `c${i}_2`);
    }
});

test('8. Cloud absent (getCloudCtx renvoie null) — pull ne crash pas', async () => {
    resetLocalRoot();
    fakeCloudHandle = null;
    await localFileWatcher.pullFromDrive(); // Doit return sans throw
    // Rien à vérifier d'autre que l'absence de crash
});

test('9. Erreur sur listChildren racine — pull ne crash pas, retry implicite plus tard', async () => {
    resetLocalRoot();
    fakeCloudHandle = createFakeCloud({
        'D': [{ name: 'f.txt', content: 'X' }],
    }, { listChildrenError: true });
    await localFileWatcher.pullFromDrive();
    // Le fichier ne doit pas être là (listChildren a échoué) mais pas de crash
    expectNoFile('D/f.txt');
});

test('11. Sous-dossiers récursifs — Dossier/Sous/file.txt téléchargé en local', async () => {
    resetLocalRoot();
    fakeCloudHandle = createFakeCloud({
        'Affaire_Dupont': {
            _files: [{ name: 'note.txt', content: 'racine' }],
            'Pieces': {
                _files: [{ name: 'photo.jpg', content: 'photo-data' }],
                'Annexes': {
                    _files: [{ name: 'recu.pdf', content: 'recu-data' }],
                },
            },
        },
    });
    await localFileWatcher.pullFromDrive();
    expectFile('Affaire_Dupont/note.txt', 'racine');
    expectFile('Affaire_Dupont/Pieces/photo.jpg', 'photo-data');
    expectFile('Affaire_Dupont/Pieces/Annexes/recu.pdf', 'recu-data');
});

test('12. Orphelin local préservé — fichier en local absent du cloud n\'est PAS supprimé', async () => {
    resetLocalRoot();
    // Pose un fichier orphelin en local (créé "manuellement" par l\'user avant connexion)
    const orphanDir = path.join(TEST_LOCAL_ROOT, 'Mon_Dossier_Local');
    fs.mkdirSync(orphanDir, { recursive: true });
    const orphanPath = path.join(orphanDir, 'mes_notes.txt');
    fs.writeFileSync(orphanPath, 'données importantes');

    // Le cloud ne contient PAS ce dossier/fichier
    fakeCloudHandle = createFakeCloud({
        'Autre_Dossier_Cloud': [{ name: 'doc.txt', content: 'cloud' }],
    });
    await localFileWatcher.pullFromDrive();

    // Cloud → local : OK
    expectFile('Autre_Dossier_Cloud/doc.txt', 'cloud');
    // Orphelin local : DOIT toujours exister (politique conservative)
    assert(fs.existsSync(orphanPath), 'Le fichier local orphelin a été supprimé alors qu\'il devait être préservé');
});

test('13. Fresh PC scenario — local vide + cloud avec arborescence complexe → tout descendu', async () => {
    resetLocalRoot();
    fakeCloudHandle = createFakeCloud({
        'Affaire_A': {
            _files: [
                { name: 'assignation.docx', content: 'A1' },
                { name: 'conclusions.docx', content: 'A2' },
            ],
            'Pieces_Adverses': {
                _files: [
                    { name: 'piece_01.pdf', content: 'PA1' },
                    { name: 'piece_02.pdf', content: 'PA2' },
                ],
            },
        },
        'Affaire_B': [
            { name: 'memo.txt', content: 'B1' },
        ],
        'Affaire_C': {
            _files: [{ name: 'recap.docx', content: 'C1' }],
            'Sous': { _files: [{ name: 'detail.txt', content: 'C2' }] },
        },
    });

    await localFileWatcher.pullFromDrive();

    expectFile('Affaire_A/assignation.docx', 'A1');
    expectFile('Affaire_A/conclusions.docx', 'A2');
    expectFile('Affaire_A/Pieces_Adverses/piece_01.pdf', 'PA1');
    expectFile('Affaire_A/Pieces_Adverses/piece_02.pdf', 'PA2');
    expectFile('Affaire_B/memo.txt', 'B1');
    expectFile('Affaire_C/recap.docx', 'C1');
    expectFile('Affaire_C/Sous/detail.txt', 'C2');
});

test('14. Templates (récursif) — sous-arbre Templates entier ignoré', async () => {
    resetLocalRoot();
    fakeCloudHandle = createFakeCloud({
        'Templates': {
            _files: [{ name: 'Courrier.docx', content: 'TPL' }],
            'Modeles_Avances': {
                _files: [{ name: 'Avance.docx', content: 'TPL2' }],
            },
        },
        'Vrai_Dossier': [{ name: 'fichier.txt', content: 'V' }],
    });
    await localFileWatcher.pullFromDrive();
    expectNoFile('Templates/Courrier.docx');
    expectNoFile('Templates/Modeles_Avances/Avance.docx');
    expectFile('Vrai_Dossier/fichier.txt', 'V');
});

test('10. Progression — événements de progression émis (si feature implémentée)', async () => {
    resetLocalRoot();
    const events = [];
    if (typeof localFileWatcher.onPullProgress === 'function') {
        localFileWatcher.onPullProgress((evt) => events.push(evt));
    }
    fakeCloudHandle = createFakeCloud({
        'A': [{ name: 'f.txt', content: 'X' }],
        'B': [{ name: 'g.txt', content: 'Y' }],
    });
    await localFileWatcher.pullFromDrive();
    expectFile('A/f.txt', 'X');
    expectFile('B/g.txt', 'Y');

    // Soft-check : si l'API existe, on attend au moins start + end
    if (typeof localFileWatcher.onPullProgress === 'function') {
        assert(events.some(e => e.phase === 'start'), 'événement start manquant');
        assert(events.some(e => e.phase === 'end'), 'événement end manquant');
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
    console.log(`\n=== Sync Test Harness ===`);
    console.log(`Local root : ${TEST_LOCAL_ROOT}\n`);

    let passed = 0, failed = 0;
    for (const t of TESTS) {
        process.stdout.write(`[ ] ${t.name} ... `);
        try {
            // Stop polling au cas où un test précédent l'aurait démarré
            if (typeof localFileWatcher.stopPullPolling === 'function') {
                localFileWatcher.stopPullPolling();
            }
            await t.fn();
            console.log('✅ OK');
            passed++;
        } catch (err) {
            console.log('❌ FAIL\n   →', err.message);
            failed++;
        }
    }

    // Cleanup final
    try {
        if (typeof localFileWatcher.stopAllWatchers === 'function') {
            localFileWatcher.stopAllWatchers();
        }
        if (typeof localFileWatcher.stopPullPolling === 'function') {
            localFileWatcher.stopPullPolling();
        }
        if (fs.existsSync(TEST_LOCAL_ROOT)) {
            fs.rmSync(TEST_LOCAL_ROOT, { recursive: true, force: true });
        }
    } catch (_) { /* ignore */ }

    console.log(`\n--- Résumé : ${passed}/${TESTS.length} OK, ${failed} FAIL ---`);
    process.exit(failed === 0 ? 0 : 1);
})();
