/**
 * generate-build-manifest.js
 *
 * Genere un fichier server/build-manifest.json contenant l'empreinte canonique
 * (SHA-256 tronque) des fichiers source du serveur, l'algorithme utilise et le
 * commit Git de l'arbre construit. Permet de verifier au runtime que le code
 * serveur embarque dans le build correspond au code source, et de relier
 * l'image deployee a un commit exact.
 *
 * Usage : node scripts/generate-build-manifest.js
 * Appele automatiquement par : npm run package, scripts/gcp/deploy.sh
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { computeRuntimeSourceHash, isRuntimeSourcePath } = require('../server/utils/runtimeSourceManifest');

const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_DIR = path.join(REPO_ROOT, 'server');
const MANIFEST_PATH = path.join(SERVER_DIR, 'build-manifest.json');

function runGit(args, cwd) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
    });
}

// Sources embarquees dans l'image Cloud Run (Dockerfile : server/ et
// client/build) ou le paquet Electron, vues depuis la racine du depot : les
// fichiers du serveur retenus par l'empreinte, et tout client/src et
// client/public (compiles dans client/build). Un fichier non suivi par Git a
// l'un de ces emplacements partirait dans l'image sans appartenir au commit ;
// les autres fichiers non suivis (documentation, scripts d'administration,
// tests, .gcloudignore) n'entrent pas dans l'image et restent sans effet.
const SHIPPED_PATHSPECS = ['server', 'client/src', 'client/public'];

function isShippedSourcePath(file) {
    const normalized = String(file).replace(/\\/g, '/');
    if (normalized.startsWith('server/')) return isRuntimeSourcePath(normalized.slice('server/'.length));
    return normalized.startsWith('client/src/') || normalized.startsWith('client/public/');
}

// Fichiers non suivis par Git (et non ignores par .gitignore) qui entreraient
// dans l'image : chemins relatifs a la racine du depot, separateur "/", tries
// par Git. Regle unique partagee par le manifeste (gitDirty) et par la garde
// « source Git exacte » de scripts/gcp/deploy.sh. cwd doit etre la racine du
// depot. Leve si git est indisponible ou hors d'un depot.
function listUntrackedShippedSources({ cwd = REPO_ROOT, git = runGit } = {}) {
    return String(git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...SHIPPED_PATHSPECS], cwd))
        .split('\0')
        .filter(Boolean)
        .filter(isShippedSourcePath);
}

// Etat Git du depot : commit HEAD complet (40 hexadecimaux, meme regle que
// scripts/gcp/deploy.sh) et arbre « modifie » des qu'une modification suivie
// attend d'etre commitee ou qu'une source non suivie entrerait dans l'image
// (listUntrackedShippedSources). null lorsque git est indisponible ou hors
// d'un depot.
function readGitState({ cwd = REPO_ROOT, git = runGit } = {}) {
    let gitCommit = null;
    let gitDirty = null;
    try {
        const head = String(git(['rev-parse', '--verify', 'HEAD'], cwd)).trim();
        if (/^[0-9a-f]{40}$/.test(head)) gitCommit = head;
    } catch (error) {
        gitCommit = null;
    }
    if (gitCommit) {
        try {
            const pending = String(git(['status', '--porcelain', '--untracked-files=no'], cwd)).trim().length > 0;
            gitDirty = pending || listUntrackedShippedSources({ cwd, git }).length > 0;
        } catch (error) {
            gitDirty = null;
        }
    }
    return { gitCommit, gitDirty };
}

function buildManifest({ serverDirectory = SERVER_DIR, gitState = readGitState(), now = new Date() } = {}) {
    const runtime = computeRuntimeSourceHash(serverDirectory);
    return {
        buildId: `BUILD-${now.getTime().toString(36).toUpperCase()}`,
        buildTimestamp: now.toISOString(),
        serverHash: runtime.hash,
        fileCount: runtime.fileCount,
        hashAlgorithm: runtime.hashAlgorithm,
        gitCommit: gitState.gitCommit,
        gitDirty: gitState.gitDirty,
        generatedBy: 'generate-build-manifest.js'
    };
}

function main() {
    const manifest = buildManifest();
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    console.log(`[Build Manifest] Genere avec succes :`);
    console.log(`  Build ID:    ${manifest.buildId}`);
    console.log(`  Timestamp:   ${manifest.buildTimestamp}`);
    console.log(`  Server Hash: ${manifest.serverHash}`);
    console.log(`  Algorithme:  ${manifest.hashAlgorithm}`);
    console.log(`  Fichiers:    ${manifest.fileCount}`);
    console.log(`  Commit Git:  ${manifest.gitCommit || 'inconnu (git indisponible ou hors depot)'}`);
    console.log(`  Arbre Git:   ${manifest.gitDirty === null ? 'inconnu' : manifest.gitDirty ? 'MODIFIE (modifications non commitees ou sources non suivies)' : 'propre'}`);
}

if (require.main === module) {
    main();
}

module.exports = {
    MANIFEST_PATH,
    SERVER_DIR,
    buildManifest,
    isShippedSourcePath,
    listUntrackedShippedSources,
    readGitState,
};
