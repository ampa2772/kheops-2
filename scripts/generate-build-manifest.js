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

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.resolve(__dirname, '..', 'server');
const MANIFEST_PATH = path.join(SERVER_DIR, 'build-manifest.json');

/**
 * Collecte recursivement tous les fichiers .js et .json du serveur
 * (hors node_modules et build-manifest.json)
 */
function getAllServerFiles(dir, fileList = []) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.name === 'node_modules' || entry.name === 'build-manifest.json') continue;
        if (entry.isDirectory()) {
            getAllServerFiles(fullPath, fileList);
        } else if (entry.name.endsWith('.js') || entry.name.endsWith('.json')) {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

const files = getAllServerFiles(SERVER_DIR).sort();
const hash = crypto.createHash('sha256');

for (const file of files) {
    const relativePath = path.relative(SERVER_DIR, file).replace(/\\/g, '/');
    hash.update(relativePath);
    hash.update(fs.readFileSync(file));
}

const manifest = {
    buildId: `BUILD-${Date.now().toString(36).toUpperCase()}`,
    buildTimestamp: new Date().toISOString(),
    serverHash: hash.digest('hex').slice(0, 16),
    fileCount: files.length,
    generatedBy: 'generate-build-manifest.js'
};

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log(`[Build Manifest] Genere avec succes :`);
console.log(`  Build ID:    ${manifest.buildId}`);
console.log(`  Timestamp:   ${manifest.buildTimestamp}`);
console.log(`  Server Hash: ${manifest.serverHash}`);
console.log(`  Fichiers:    ${manifest.fileCount}`);
