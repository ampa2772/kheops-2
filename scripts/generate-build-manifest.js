/**
 * generate-build-manifest.js
 *
 * Genere un fichier server/build-manifest.json contenant un hash SHA-256
 * de tous les fichiers source du serveur. Permet de verifier au runtime
 * que le code serveur embarque dans le build correspond au code source.
 *
 * Usage : node scripts/generate-build-manifest.js
 * Appele automatiquement par : npm run package
 */

const fs = require('fs');
const path = require('path');
const { computeRuntimeSourceHash } = require('../server/utils/runtimeSourceManifest');

const SERVER_DIR = path.resolve(__dirname, '..', 'server');
const MANIFEST_PATH = path.join(SERVER_DIR, 'build-manifest.json');

const runtime = computeRuntimeSourceHash(SERVER_DIR);

const manifest = {
    buildId: `BUILD-${Date.now().toString(36).toUpperCase()}`,
    buildTimestamp: new Date().toISOString(),
    serverHash: runtime.hash,
    fileCount: runtime.fileCount,
    generatedBy: 'generate-build-manifest.js'
};

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log(`[Build Manifest] Genere avec succes :`);
console.log(`  Build ID:    ${manifest.buildId}`);
console.log(`  Timestamp:   ${manifest.buildTimestamp}`);
console.log(`  Server Hash: ${manifest.serverHash}`);
console.log(`  Fichiers:    ${manifest.fileCount}`);
