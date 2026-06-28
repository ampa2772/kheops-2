/* eslint-disable no-console */
// Test harness pour documentLockWatcher.
// Simule des scénarios concrets sans ouvrir Electron ni Word :
//   1. Ouverture Office (création ~$, suppression ~$ → release auto)
//   2. Ouverture Office crashée (~$ orphelin, watchdog ne libère JAMAIS prématurément)
//   3. Fichier non-Office (fallback : sonde fs.openSync → release dès qu'aucun verrou Win)
//   4. stop() manuel sans release
//
// Le harness mock axios pour intercepter les appels HTTP au serveur central
// (POST /api/document-locks/:docId/release) et asserter qu'ils ont bien lieu
// avec le bon docId + JWT, SANS qu'aucun vrai serveur ne tourne.

const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

// ─────────────────────────────────────────────────────────────────────────────
// Mock axios (intercepte les appels HTTP de release)
// ─────────────────────────────────────────────────────────────────────────────
const releaseCalls = []; // [{ url, docId, authHeader }]
const fakeAxios = {
    post: (url, _body, opts) => {
        const m = url.match(/\/api\/document-locks\/([^/]+)\/release$/);
        const docId = m ? decodeURIComponent(m[1]) : null;
        const authHeader = opts?.headers?.Authorization || null;
        releaseCalls.push({ url, docId, authHeader });
        return Promise.resolve({ status: 200, data: { released: true } });
    },
};
const axiosResolved = require.resolve('axios');
require.cache[axiosResolved] = {
    id: axiosResolved, filename: axiosResolved, loaded: true,
    exports: fakeAxios, children: [], paths: Module._nodeModulePaths(path.dirname(axiosResolved)),
};

const watcher = require('../services/documentLockWatcher');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const TMP_ROOT = path.join(os.tmpdir(), 'kheops-doclock-test-' + Date.now());
fs.mkdirSync(TMP_ROOT, { recursive: true });

function makeDoc(name = 'Conclusions.docx') {
    const docId = 'doc-' + Math.random().toString(36).slice(2, 10);
    const docDir = path.join(TMP_ROOT, docId);
    fs.mkdirSync(docDir, { recursive: true });
    const filePath = path.join(docDir, name);
    fs.writeFileSync(filePath, 'fake content');
    return { docId, filePath, docDir, fileName: name };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function assert(cond, msg) {
    if (!cond) throw new Error('Assertion failed: ' + msg);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────
const TESTS = [];
function test(name, fn) { TESTS.push({ name, fn }); }

test('1. Office : création de ~$ puis suppression → release auto', async () => {
    const { docId, filePath, docDir, fileName } = makeDoc('Conclusions.docx');
    releaseCalls.length = 0;

    watcher.track({
        docId, localFilePath: filePath,
        jwtToken: 'jwt-A', serverUrl: 'http://fake',
    });

    // Simule Word : création du fichier ~$Conclusions.docx
    await sleep(100);
    const lockFile = path.join(docDir, `~$${fileName}`);
    fs.writeFileSync(lockFile, 'office-lock');

    // chokidar émet add — on attend un peu
    await sleep(300);

    // Simule la fermeture de Word : suppression de ~$
    fs.unlinkSync(lockFile);

    // Le watcher détecte unlink → appelle axios.post(/release)
    // On attend un poil pour laisser la promise axios se résoudre
    await sleep(400);

    assert(releaseCalls.length === 1, `1 appel release attendu, ${releaseCalls.length} reçu(s)`);
    assert(releaseCalls[0].docId === docId, `docId ${docId} attendu, ${releaseCalls[0].docId} reçu`);
    assert(releaseCalls[0].authHeader === 'Bearer jwt-A', `auth header invalide: ${releaseCalls[0].authHeader}`);

    // Session doit être terminée
    const state = watcher._getStateForTesting();
    assert(!state.docIds.includes(docId), `Session pour ${docId} aurait dû être supprimée`);
});

test('2. Office : ~$ jamais créé → pas de release prématurée pendant la fenêtre de détection', async () => {
    const { docId, filePath } = makeDoc('NoLockDoc.docx');
    releaseCalls.length = 0;

    watcher.track({
        docId, localFilePath: filePath,
        jwtToken: 'jwt-B', serverUrl: 'http://fake',
    });

    // Pendant 500 ms (bien avant les 30s du fallback), aucun release ne doit
    // être émis. On nettoie la session manuellement (sans release) après.
    await sleep(500);
    assert(releaseCalls.length === 0, `Aucun release attendu en 500ms, ${releaseCalls.length} reçu(s)`);

    watcher.stop(docId, { silent: true });
});

test('3. Stop manuel sans release : aucun appel HTTP', async () => {
    const { docId, filePath } = makeDoc('Manual.docx');
    releaseCalls.length = 0;

    watcher.track({
        docId, localFilePath: filePath,
        jwtToken: 'jwt-C', serverUrl: 'http://fake',
    });
    await sleep(50);

    watcher.stop(docId, { silent: true });
    await sleep(200);

    assert(releaseCalls.length === 0, `Aucun release attendu sur stop(), ${releaseCalls.length} reçu(s)`);
    const state = watcher._getStateForTesting();
    assert(!state.docIds.includes(docId), 'Session aurait dû être nettoyée');
});

test('4. Stop avec releaseLock:true → appel HTTP de release', async () => {
    const { docId, filePath } = makeDoc('ManualForce.docx');
    releaseCalls.length = 0;

    watcher.track({
        docId, localFilePath: filePath,
        jwtToken: 'jwt-D', serverUrl: 'http://fake',
    });
    await sleep(50);

    watcher.stop(docId, { releaseLock: true });
    await sleep(300);

    assert(releaseCalls.length === 1, `1 release attendu, ${releaseCalls.length} reçu(s)`);
    assert(releaseCalls[0].docId === docId, 'docId incorrect dans le release forcé');
});

test('5. track() sur fichier inexistant ne crée pas de session', async () => {
    const docId = 'doc-nonexistent';
    const filePath = path.join(TMP_ROOT, 'nope.docx');
    releaseCalls.length = 0;

    watcher.track({
        docId, localFilePath: filePath,
        jwtToken: 'jwt-E', serverUrl: 'http://fake',
    });

    const state = watcher._getStateForTesting();
    assert(!state.docIds.includes(docId), 'Aucune session ne devrait exister pour un fichier absent');
});

test('6. Re-track du même docId → ancienne session remplacée', async () => {
    const { docId, filePath } = makeDoc('ReTrack.docx');
    releaseCalls.length = 0;

    watcher.track({ docId, localFilePath: filePath, jwtToken: 'jwt-1', serverUrl: 'http://fake' });
    await sleep(30);
    watcher.track({ docId, localFilePath: filePath, jwtToken: 'jwt-2', serverUrl: 'http://fake' });
    await sleep(30);

    const state = watcher._getStateForTesting();
    const sess = state.getSession(docId);
    assert(sess, 'Session devait exister');
    assert(sess.jwtToken === 'jwt-2', 'Le re-track aurait dû remplacer le JWT');
    assert(state.docIds.filter(d => d === docId).length === 1, 'Une seule session par docId');

    watcher.stop(docId, { silent: true });
});

test('7. Office : création + suppression rapide (race) → release émis une seule fois', async () => {
    const { docId, filePath, docDir, fileName } = makeDoc('Fast.docx');
    releaseCalls.length = 0;

    watcher.track({ docId, localFilePath: filePath, jwtToken: 'jwt-F', serverUrl: 'http://fake' });

    await sleep(50);
    const lockFile = path.join(docDir, `~$${fileName}`);
    fs.writeFileSync(lockFile, 'lock');
    await sleep(150);
    fs.unlinkSync(lockFile);
    await sleep(400);

    assert(releaseCalls.length === 1, `1 seul release attendu, ${releaseCalls.length} reçu(s)`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────
(async () => {
    console.log(`\n=== Document Lock Watcher Test Harness ===\n`);
    console.log(`TMP_ROOT : ${TMP_ROOT}\n`);

    let passed = 0, failed = 0;
    for (const t of TESTS) {
        process.stdout.write(`[ ] ${t.name} ... `);
        try {
            await t.fn();
            console.log('✅ OK');
            passed++;
        } catch (err) {
            console.log('❌ FAIL\n   →', err.message);
            failed++;
        }
        // Cleanup all sessions between tests
        for (const id of watcher._getStateForTesting().docIds) {
            watcher.stop(id, { silent: true });
        }
    }

    // Cleanup
    try {
        watcher.stopAll();
        if (fs.existsSync(TMP_ROOT)) fs.rmSync(TMP_ROOT, { recursive: true, force: true });
    } catch (_) {}

    console.log(`\n--- Résumé : ${passed}/${TESTS.length} OK, ${failed} FAIL ---`);
    process.exit(failed === 0 ? 0 : 1);
})();
