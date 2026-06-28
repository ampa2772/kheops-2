// electron-app/services/localFileWatcher.js
const chokidar = require("chokidar");
const fs = require("fs");
const path = require("path");
const async = require("async");
const mime = require('mime-types');
const EventEmitter = require('events');

// Services
const configManager = require("./configManager");
const { getCloudCtx, requireCloudCtx } = require("./cloudContext");

// --- Bus d'événements pour la progression du pull ---
// Le main process s'y abonne pour relayer les événements vers le renderer
// (via IPC) afin d'afficher la modale de synchronisation.
const pullEvents = new EventEmitter();
function onPullProgress(handler) { pullEvents.on('progress', handler); }
function offPullProgress(handler) { pullEvents.off('progress', handler); }
function emitProgress(evt) {
    try { pullEvents.emit('progress', evt); } catch (_) { /* listener errors ne bloquent pas le pull */ }
}

// --- Configuration ---
const DEBOUNCE_DELAY = 2000; // 2 secondes
const CONCURRENCY = 1; // 1 upload à la fois
const RECENTLY_UPLOADED_TTL = 10000; // 10 secondes de protection anti-double-upload

// --- State ---
let watcher = null;
let currentWatchedPath = null;
const uploadTimers = {}; // Stockage des timers de debounce

// >>> CORRECTION DOUBLE-UPLOAD : Set de fichiers récemment uploadés par la logique métier
// Les fichiers dans ce Set seront ignorés par le watcher pendant RECENTLY_UPLOADED_TTL ms
const recentlyUploadedFiles = new Map(); // Map<filePath, timeoutId>

// --- Queue de traitement (Async) ---
const syncQueue = async.queue(async (task) => {
    const { type, filePath } = task;
    console.log(`[SyncQueue] Traitement : ${type} - ${filePath}`);

    try {
        if (type === 'upload') {
            await processUpload(filePath);
        }
        // Pas de traitement 'delete' pour le moment (sécurité)
    } catch (error) {
        console.error(`[SyncQueue] Erreur sur ${filePath}:`, error);
    }
}, CONCURRENCY);

// --- Logique Métier ---

/**
 * Upload effectif vers le cloud actif (Google Drive ou OneDrive).
 * Source-agnostique : utilise getCloudCtx() pour déterminer le service.
 */
async function processUpload(localFilePath) {
    // Anti-double-upload : ignorer les fichiers récemment uploadés par la logique métier
    if (recentlyUploadedFiles.has(path.resolve(localFilePath))) {
        console.log(`[Upload] Fichier ignoré (récemment uploadé par la logique métier) : ${path.basename(localFilePath)}`);
        return;
    }

    if (!fs.existsSync(localFilePath)) {
        console.log(`[Upload] Fichier introuvable (supprimé ?) : ${localFilePath}`);
        return;
    }

    const ctx = getCloudCtx();
    if (!ctx) {
        console.warn("[Upload] Aucune authentification cloud (ni Google ni Microsoft). Upload annulé.");
        return;
    }

    const rootPath = configManager.getLocalRootPath();
    const relativePath = path.relative(rootPath, localFilePath);
    const fileName = path.basename(localFilePath);
    const dirName = path.dirname(relativePath);

    try {
        let parentId = await ctx.service.ensureFolder("Files_Clients", 'root');

        if (dirName !== '.') {
            const folders = dirName.split(path.sep);
            for (const folder of folders) {
                parentId = await ctx.service.ensureFolder(folder, parentId);
            }
        }

        const mimeType = mime.lookup(localFilePath) || 'application/octet-stream';
        // OneDrive a besoin d'un Buffer/path (pas de stream pour le PUT direct < 4 MiB) ;
        // Google accepte tous les types. On passe le chemin directement, les deux services le gèrent.
        console.log(`[Upload ${ctx.source}] Envoi de ${fileName} vers ${ctx.source}, parent=${parentId}...`);
        await ctx.service.uploadFile(fileName, mimeType, localFilePath, parentId);
        console.log(`[Upload ${ctx.source}] Succès : ${fileName}`);

    } catch (err) {
        console.error(`[Upload ${ctx.source}] Échec pour ${fileName}:`, err.message);
    }
}

// --- Gestion du Debounce ---

function scheduleUpload(filePath) {
    // >>> CORRECTION DOUBLE-UPLOAD : Si le fichier a été récemment uploadé par la logique métier, on l'ignore
    if (recentlyUploadedFiles.has(path.resolve(filePath))) {
        console.log(`[Debounce] Fichier ignoré (récemment uploadé par la logique métier) : ${path.basename(filePath)}`);
        return;
    }

    // Annuler le timer précédent s'il existe
    if (uploadTimers[filePath]) {
        clearTimeout(uploadTimers[filePath]);
    }

    // Nouveau timer
    uploadTimers[filePath] = setTimeout(() => {
        delete uploadTimers[filePath];
        // Ajout à la queue après 2s de silence
        syncQueue.push({ type: 'upload', filePath });
        console.log(`[Debounce] Ajout à la queue d'upload : ${path.basename(filePath)}`);
    }, DEBOUNCE_DELAY);
}

// --- Watcher ---

function watchFilesClientsFolder(folderPath) {
    // Si pas de chemin fourni, on tente de le récupérer via configManager
    const targetPath = folderPath || configManager.getLocalRootPath();

    if (!targetPath) {
        console.warn("[Watcher] Aucun chemin configuré.");
        return;
    }

    // Création du dossier si inexistant
    if (!fs.existsSync(targetPath)) {
        try {
            fs.mkdirSync(targetPath, { recursive: true });
            console.log(`[Watcher] Dossier racine créé : ${targetPath}`);
        } catch (e) {
            console.error(`[Watcher] Impossible de créer le dossier : ${e.message}`);
            return;
        }
    }

    // Éviter doublon
    if (watcher && currentWatchedPath === targetPath) return;
    if (watcher) stopAllWatchers();

    console.log(`[Watcher] Démarrage sur : ${targetPath}`);
    currentWatchedPath = targetPath;

    watcher = chokidar.watch(targetPath, {
        persistent: true,
        ignoreInitial: true,
        ignored: [
            /(^|[\/\\])\../,       // Fichiers cachés (.git, .env, etc.)
            /~\$.*/,               // Fichiers temporaires Office
            /desktop\.ini/i,       // Windows
            /thumbs\.db/i
        ]
    });

    watcher
        .on('add', (filePath) => {
            console.log(`[Watcher] ADD détecté : ${filePath}`);
            scheduleUpload(filePath);
        })
        .on('change', (filePath) => {
            console.log(`[Watcher] CHANGE détecté : ${filePath}`);
            scheduleUpload(filePath);
        })
        .on('unlink', (filePath) => {
            // Consigne : Log seulement, pas de suppression Drive pour l'instant
            console.log(`[Watcher] Suppression locale détectée (Sécurité : Pas de suppression Drive) : ${filePath}`);

            // Si un upload était prévu, on l'annule
            if (uploadTimers[filePath]) {
                clearTimeout(uploadTimers[filePath]);
                delete uploadTimers[filePath];
            }
        })
        .on('error', error => console.error(`[Watcher] Erreur : ${error}`));
}

function stopAllWatchers() {
    if (watcher) {
        watcher.close();
        watcher = null;
    }
    currentWatchedPath = null;
    // Nettoyage timers
    Object.values(uploadTimers).forEach(clearTimeout);
    for (const key in uploadTimers) delete uploadTimers[key];
}

function restartWatcher(newPath) {
    stopAllWatchers();
    watchFilesClientsFolder(newPath);
}

// --- Anti-Double-Upload API ---

/**
 * Marque un fichier comme "récemment uploadé par la logique métier".
 * Le watcher ignorera ce fichier pendant RECENTLY_UPLOADED_TTL millisecondes.
 * Doit être appelé par docGenerator.js, fileUtils.js, socketHandlers.js, etc.
 * AVANT ou APRÈS l'écriture locale du fichier et son upload explicite.
 *
 * @param {string} filePath - Le chemin local absolu du fichier à marquer.
 */
function markAsRecentlyUploaded(filePath) {
    const resolvedPath = path.resolve(filePath);

    // Si déjà marqué, on annule le timer précédent pour le renouveler
    if (recentlyUploadedFiles.has(resolvedPath)) {
        clearTimeout(recentlyUploadedFiles.get(resolvedPath));
    }

    // Marquer le fichier et programmer le nettoyage automatique
    const timeoutId = setTimeout(() => {
        recentlyUploadedFiles.delete(resolvedPath);
        console.log(`[AntiDoubleUpload] Protection expirée pour : ${path.basename(resolvedPath)}`);
    }, RECENTLY_UPLOADED_TTL);

    recentlyUploadedFiles.set(resolvedPath, timeoutId);
    console.log(`[AntiDoubleUpload] Fichier marqué (protection ${RECENTLY_UPLOADED_TTL}ms) : ${path.basename(resolvedPath)}`);
}

// --- Synchro Drive → Local (Pull) ---

let pullInterval = null;
let isPulling = false;

// Configuration retry — erreurs transitoires (réseau, 5xx, timeout, 401)
const PULL_RETRY_DELAYS_MS = [1000, 3000, 8000]; // 3 essais : 1s, 3s, 8s
const TRANSIENT_ERROR_CODES = new Set([
    'ETIMEDOUT', 'ECONNRESET', 'ECONNABORTED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH',
    'ECONNREFUSED', 'EPIPE',
]);

function isTransientError(err) {
    if (!err) return false;
    if (err.code && TRANSIENT_ERROR_CODES.has(err.code)) return true;
    // Code HTTP : retry sur 5xx, 429 (rate limit), 408 (timeout), 401 (token peut être rafraîchi)
    const status = err.response?.status || err.status || err.code;
    if (typeof status === 'number') {
        return status === 408 || status === 429 || status === 401 || (status >= 500 && status < 600);
    }
    return false;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Télécharge un fichier avec retry exponentiel sur erreurs transitoires.
 * Retourne true si succès, false si échec définitif (toutes erreurs transient
 * épuisées OU erreur permanente).
 */
async function downloadWithRetry(service, fileId, destPath, fileName) {
    let lastErr;
    for (let attempt = 0; attempt <= PULL_RETRY_DELAYS_MS.length; attempt++) {
        try {
            await service.downloadFile(fileId, destPath);
            if (attempt > 0) {
                console.log(`[Pull] Succès au retry n°${attempt} pour ${fileName}`);
            }
            return true;
        } catch (err) {
            lastErr = err;
            if (!isTransientError(err) || attempt === PULL_RETRY_DELAYS_MS.length) {
                // Échec définitif (permanent ou retries épuisés)
                console.error(`[Pull] Échec définitif sur ${fileName} (attempt ${attempt + 1}): ${err.message}`);
                return false;
            }
            const delay = PULL_RETRY_DELAYS_MS[attempt];
            console.warn(`[Pull] Erreur transitoire sur ${fileName} (attempt ${attempt + 1}): ${err.message} — retry dans ${delay}ms`);
            await sleep(delay);
        }
    }
    return false;
}

/**
 * Helper : détection source-agnostique d'un dossier (Google ou OneDrive).
 */
function isCloudFolder(item) {
    return item.isFolder === true ||
        item.mimeType === 'application/vnd.google-apps.folder' ||
        item.mimeType === 'application/vnd.ms-onedrive.folder';
}

/**
 * Énumère récursivement TOUT le contenu d'un dossier cloud.
 * Retourne :
 *  - files : Map<relativePath, { id, name, modifiedTime, size, parentRelPath }>
 *  - folders : Set<relativePath>  (chaque dossier rencontré, hors racine)
 *  - errors : array de { relPath, message }  (erreurs partielles, le pull continue)
 *
 * @param {object} service - Le service cloud (googleDriveService ou oneDriveService)
 * @param {string} rootCloudId - L'ID cloud du dossier racine (Files_Clients)
 * @param {string[]} skipTopLevelNames - Noms de dossiers de premier niveau à ignorer
 *                                        (ex: ['Templates'])
 */
async function listCloudTreeRecursively(service, rootCloudId, skipTopLevelNames = []) {
    const files = new Map();
    const folders = new Set();
    const errors = [];
    const skipSet = new Set(skipTopLevelNames);

    // Pile de travail : { cloudId, relPath, depth }
    const stack = [{ cloudId: rootCloudId, relPath: '', depth: 0 }];

    while (stack.length > 0) {
        const node = stack.pop();
        let children;
        try {
            children = await service.listChildren(node.cloudId, 'id, name, mimeType, modifiedTime, size');
        } catch (err) {
            errors.push({ relPath: node.relPath || '/', message: err.message });
            continue; // on saute ce sous-arbre, mais on continue ailleurs
        }

        for (const child of children) {
            // Filtrer les dossiers de premier niveau exclus (Templates)
            if (node.depth === 0 && skipSet.has(child.name)) continue;

            const childRelPath = node.relPath
                ? path.join(node.relPath, child.name)
                : child.name;

            if (isCloudFolder(child)) {
                folders.add(childRelPath);
                stack.push({ cloudId: child.id, relPath: childRelPath, depth: node.depth + 1 });
            } else {
                files.set(childRelPath, {
                    id: child.id,
                    name: child.name,
                    modifiedTime: child.modifiedTime,
                    size: child.size,
                    parentRelPath: node.relPath,
                });
            }
        }
    }

    return { files, folders, errors };
}

/**
 * Énumère récursivement le contenu local sous rootPath.
 * Retourne :
 *  - files : Map<relativePath (POSIX-like, séparateurs OS), { mtimeMs, size }>
 *  - folders : Set<relativePath>
 *
 * Filtre les fichiers cachés et tampons Office, comme le watcher.
 */
function listLocalTreeRecursively(rootPath) {
    const files = new Map();
    const folders = new Set();

    if (!fs.existsSync(rootPath)) {
        return { files, folders };
    }

    const isIgnored = (name) =>
        name.startsWith('.') ||
        name.startsWith('~$') ||
        name.toLowerCase() === 'desktop.ini' ||
        name.toLowerCase() === 'thumbs.db';

    const stack = [{ absPath: rootPath, relPath: '' }];
    while (stack.length > 0) {
        const node = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(node.absPath, { withFileTypes: true });
        } catch (_) {
            continue; // dossier illisible, on saute
        }

        for (const entry of entries) {
            if (isIgnored(entry.name)) continue;
            const childAbs = path.join(node.absPath, entry.name);
            const childRel = node.relPath ? path.join(node.relPath, entry.name) : entry.name;

            if (entry.isDirectory()) {
                folders.add(childRel);
                stack.push({ absPath: childAbs, relPath: childRel });
            } else if (entry.isFile()) {
                let stats;
                try { stats = fs.statSync(childAbs); } catch (_) { continue; }
                files.set(childRel, { mtimeMs: stats.mtimeMs, size: stats.size });
            }
        }
    }

    return { files, folders };
}

/**
 * Synchronise les fichiers depuis le cloud actif (Google Drive ou OneDrive)
 * vers le dossier local. Source-agnostique grâce à getCloudCtx().
 *
 * Algorithme :
 *  1. Énumère récursivement TOUT le cloud sous Files_Clients/ (hors Templates).
 *  2. Énumère récursivement le contenu local sous le rootPath du compte.
 *  3. Diff explicite :
 *      - cloud présent, local absent  → à télécharger
 *      - cloud présent, local présent, cloud plus récent (>2s)  → à télécharger
 *      - cloud absent, local présent  → conservé tel quel (politique conservative,
 *        pas de suppression locale pour ne jamais perdre de données utilisateur)
 *  4. Téléchargement avec retry + émission d'événements de progression.
 *
 * Détection des dossiers : sur Google, mimeType = 'application/vnd.google-apps.folder'.
 *   Sur OneDrive, oneDriveService.listChildren ajoute un flag `isFolder: true`.
 *   On utilise les deux pour être source-agnostique.
 */
async function pullFromDrive(options = {}) {
    // options.isNewMachine = true → propage le flag dans tous les events
    // émis pour que la modale s'affiche immédiatement avec un message dédié.
    const isNewMachine = !!options.isNewMachine;

    if (isPulling) {
        console.log('[Pull] Déjà en cours, ignoré.');
        return { skippedReason: 'already-pulling' };
    }

    const ctx = getCloudCtx();
    if (!ctx) {
        console.log('[Pull] Aucune authentification cloud (ni Google ni Microsoft), pull ignoré.');
        return { skippedReason: 'no-cloud' };
    }

    const rootPath = configManager.getLocalRootPath();
    if (!rootPath) {
        console.log('[Pull] Pas de chemin local configuré, pull ignoré.');
        return { skippedReason: 'no-local-path' };
    }

    isPulling = true;
    const startedAt = Date.now();
    console.log(`[Pull ${ctx.source}] Démarrage synchronisation Cloud → Local...`);

    let toDownload = []; // { relPath, cloudFile, localFilePath }
    let listingError = null;
    let cloudListing = { files: new Map(), folders: new Set(), errors: [] };
    let localListing = { files: new Map(), folders: new Set() };

    try {
        // ── Phase 1a : énumération RÉCURSIVE du cloud ──────────────────────
        const filesClientsId = await ctx.service.ensureFolder("Files_Clients", 'root');
        cloudListing = await listCloudTreeRecursively(ctx.service, filesClientsId, ['Templates']);
        console.log(`[Pull ${ctx.source}] Cloud énuméré : ${cloudListing.files.size} fichier(s), ${cloudListing.folders.size} dossier(s).`);
        if (cloudListing.errors.length > 0) {
            console.warn(`[Pull ${ctx.source}] ${cloudListing.errors.length} erreur(s) partielle(s) lors de l'énumération cloud.`);
        }

        // ── Phase 1b : énumération RÉCURSIVE du local ──────────────────────
        localListing = listLocalTreeRecursively(rootPath);
        console.log(`[Pull ${ctx.source}] Local énuméré : ${localListing.files.size} fichier(s), ${localListing.folders.size} dossier(s).`);

        // ── Phase 1c : diff formel cloud vs local ──────────────────────────
        for (const [relPath, cloudFile] of cloudListing.files.entries()) {
            const localFilePath = path.join(rootPath, relPath);
            const localInfo = localListing.files.get(relPath);

            let shouldDownload = false;
            if (!localInfo) {
                shouldDownload = true; // absent en local
            } else if (cloudFile.modifiedTime) {
                const cloudMs = new Date(cloudFile.modifiedTime).getTime();
                if (cloudMs > localInfo.mtimeMs + 2000) {
                    shouldDownload = true; // cloud plus récent (marge 2s)
                }
            }

            if (shouldDownload) {
                toDownload.push({ relPath, cloudFile, localFilePath });
            }
        }
    } catch (err) {
        listingError = err;
        console.error(`[Pull ${ctx.source}] Erreur énumération:`, err.message);
    }

    const total = toDownload.length;
    emitProgress({
        phase: 'start',
        total,
        source: ctx.source,
        listingError: listingError ? listingError.message : null,
        cloudFilesTotal: cloudListing.files.size,
        localFilesTotal: localListing.files.size,
        isNewMachine,
    });

    // ── Phase 2 : téléchargement avec retry + progression ──────────────────
    let downloaded = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < toDownload.length; i++) {
        const { relPath, cloudFile, localFilePath } = toDownload[i];
        const localFolder = path.dirname(localFilePath);
        // On expose folder + file séparément pour la modale
        const folderName = path.dirname(relPath) === '.' ? '' : path.dirname(relPath);

        try {
            if (!fs.existsSync(localFolder)) {
                fs.mkdirSync(localFolder, { recursive: true });
            }
            markAsRecentlyUploaded(localFilePath);
            const ok = await downloadWithRetry(ctx.service, cloudFile.id, localFilePath, cloudFile.name);
            if (ok) {
                downloaded++;
                console.log(`[Pull ${ctx.source}] Téléchargé: ${relPath}`);
                markAsRecentlyUploaded(localFilePath);
            } else {
                failed++;
                errors.push(relPath);
            }
        } catch (err) {
            // mkdir / writeFile error
            failed++;
            errors.push(`${relPath}: ${err.message}`);
            console.error(`[Pull ${ctx.source}] Erreur locale sur ${relPath}:`, err.message);
        }

        emitProgress({
            phase: 'progress',
            current: i + 1,
            total,
            percent: total > 0 ? Math.round(((i + 1) / total) * 100) : 100,
            currentFolder: folderName,
            currentFile: cloudFile.name,
            downloaded,
            failed,
            source: ctx.source,
            isNewMachine,
        });
    }

    const elapsedMs = Date.now() - startedAt;
    const success = !listingError && failed === 0;
    console.log(`[Pull ${ctx.source}] Terminé en ${elapsedMs}ms. ${downloaded} téléchargé(s), ${failed} échec(s), ${total - downloaded - failed} ignoré(s).`);

    emitProgress({
        phase: 'end',
        success,
        total,
        downloaded,
        failed,
        errors,
        elapsedMs,
        source: ctx.source,
        isNewMachine,
    });

    isPulling = false;
    return { success, total, downloaded, failed, errors, elapsedMs };
}

/**
 * Démarre le polling périodique Drive → Local.
 * @param {number} intervalMs - Intervalle en millisecondes (défaut: 60000 = 1 minute)
 */
function startPullPolling(intervalMs = 60000) {
    if (pullInterval) {
        clearInterval(pullInterval);
    }
    console.log(`[Pull] Polling démarré (intervalle: ${intervalMs / 1000}s)`);
    pullInterval = setInterval(pullFromDrive, intervalMs);
}

function stopPullPolling() {
    if (pullInterval) {
        clearInterval(pullInterval);
        pullInterval = null;
        console.log('[Pull] Polling arrêté.');
    }
}

// --- Helpers Legacy (Pour compatibilité avec docGenerator.js, etc.) ---

function ensureFilesClientsFolderExists(specificPath) {
    const p = specificPath || configManager.getLocalRootPath();
    if (p && !fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function ensureAndGetCloudFolderId(folderName, parentId) {
    const ctx = requireCloudCtx();
    return await ctx.service.ensureFolder(folderName, parentId);
}

async function uploadFileToCloud(localFilePath, remoteFileName, parentFolderId) {
    const ctx = requireCloudCtx();
    const mimeType = mime.lookup(localFilePath) || 'application/octet-stream';

    // --- Chiffrement E2E (audit S25 chantier #1) ---
    // Toute la politique est centralisée dans cryptoHandler.prepareFileForUpload :
    //   - REFUSE (throw) si cabinet protégé serveur mais MasterKey absente (D1)
    //   - chiffre dans un .kbox temporaire si protégé + déverrouillé
    //   - laisse passer en clair si cabinet non protégé
    // L'exception éventuelle remonte au caller IPC qui la convertit en
    // { success:false, error:'...' } visible côté renderer.
    let cryptoHandler = null;
    try { cryptoHandler = require('../crypto-handler'); } catch (_) { /* hors test */ }

    if (!cryptoHandler) {
        // Module inaccessible (tests unitaires) → comportement historique en clair
        return await ctx.service.uploadFile(remoteFileName, mimeType, localFilePath, parentFolderId);
    }

    const startedAt = Date.now();
    let plaintextSize = 0;
    try { plaintextSize = fs.statSync(localFilePath).size; } catch (_) { /* best-effort */ }

    const prepared = cryptoHandler.prepareFileForUpload(localFilePath, remoteFileName, mimeType);
    try {
        if (prepared.wasEncrypted) {
            // Log explicite pour pouvoir verifier dans crash-log.txt qu'un
            // fichier a bien ete protege avant l'envoi (lot C3 — 2.0.4).
            try {
                const { logToFile } = require('./crashLog');
                const blobSize = fs.statSync(prepared.uploadPath).size;
                const durationMs = Date.now() - startedAt;
                logToFile(
                    '[localFileWatcher] Chiffrement avant upload : "' + remoteFileName +
                    '" (' + plaintextSize + ' octets) -> "' + prepared.uploadName +
                    '" (' + blobSize + ' octets) en ' + durationMs + ' ms'
                );
            } catch (_) { /* logToFile peut ne pas etre charge en mode test */ }
        }
        return await ctx.service.uploadFile(
            prepared.uploadName,
            prepared.uploadMime,
            prepared.uploadPath,
            parentFolderId
        );
    } finally {
        prepared.cleanup();
    }
}

module.exports = {
    watchFilesClientsFolder,
    stopAllWatchers,
    restartWatcher,
    ensureFilesClientsFolderExists,
    ensureAndGetCloudFolderId,
    uploadFileToCloud,
    markAsRecentlyUploaded,
    pullFromDrive,
    startPullPolling,
    stopPullPolling,
    onPullProgress,
    offPullProgress,
};
