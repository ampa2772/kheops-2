// electron-app/main.js
// =============================================================================
// APPLICATION ELECTRON UNIFIÉE — Kheops 2 (Google Drive)
// Fusionne : Client React + Serveur Express + Agent Electron (fichiers Word)
// =============================================================================

const { app, BrowserWindow, ipcMain, shell, dialog, crashReporter, Menu } = require("electron");
const fs = require("fs");
const path = require("path");

// Activer le crash reporter pour capturer les crashs natifs (segfaults, etc.)
crashReporter.start({
    submitURL: '', // Pas de serveur de crash report — on stocke les dumps localement
    uploadToServer: false,
    compress: false
});
const { spawn, spawnSync } = require("child_process");
const axios = require('axios');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

// --- Services Cloud (Google Drive + OneDrive) ---
const authService = require('./services/authService');
const microsoftAuthService = require('./services/microsoftAuthService');
const googleDriveService = require('./services/googleDriveService');
const oneDriveService = require('./services/oneDriveService');
const configManager = require('./services/configManager');
const localFileWatcher = require('./services/localFileWatcher');
const documentLockWatcher = require('./services/documentLockWatcher');
const { getMachineId } = require('./services/machineId');
const { initializeSocketHandlers } = require('./services/socketHandlers');
const mailRoutes = require('./routes/mailRoutes');

// --- Services documents ---
const { createDocumentForClient, openDocument } = require('./services/docGenerator');

// --- Module chiffrement E2E (lot 3a — handlers IPC + safeStorage) ---
const cryptoHandler = require('./crypto-handler');

// --- Cache local des documents dechiffres (lot 4a) ---
// TTL 10h, purge au demarrage et a la fermeture. Voir DESIGN section 10.5.
const decryptedCache = require('./services/decryptedCache');

// --- Serveur local (Socket.IO) ---
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');

// --- Instance Socket.IO (module-level pour accès depuis les IPC handlers) ---
let socketIoServer = null;

// --- CRASH LOG : factorise dans services/crashLog.js (consomme aussi par fileUtils.js)
const { logToFile, CRASH_LOG_PATH } = require('./services/crashLog');

/**
 * Log structuré "sécurité" côté Electron. Format aligné avec le securityLogger
 * serveur (mêmes types d'événements, mêmes clés) pour faciliter la corrélation
 * client/serveur lors d'un debug. Écrit dans crash-log.txt avec un préfixe
 * `[SECURITY <TYPE>]` facile à grepper.
 *
 * Types d'événements typiques côté Electron :
 *   ELECTRON_LOGIN_GOOGLE_SUCCESS / FAILURE
 *   ELECTRON_LOGOUT_GOOGLE
 *   ELECTRON_LOGIN_MICROSOFT_SUCCESS / FAILURE
 *   ELECTRON_LOGOUT_MICROSOFT
 *   ELECTRON_SET_USER_CONTEXT      Renderer a fourni { userId, email }
 *   ELECTRON_DEEP_LINK_AUTH        Deep link OAuth callback reçu
 *   ELECTRON_CLOUD_INIT            Init cloud après login (Google ou Microsoft)
 */
function secLog(eventType, data = {}) {
    const parts = [`[SECURITY ${eventType}]`];
    if (data.userId) parts.push(`userId=${data.userId}`);
    if (data.email) parts.push(`email=${data.email}`);
    if (data.source) parts.push(`source=${data.source}`);
    if (data.reason) parts.push(`reason=${data.reason}`);
    if (data.extra) parts.push(`extra=${typeof data.extra === 'string' ? data.extra : JSON.stringify(data.extra)}`);
    logToFile(parts.join(' '));
}

/**
 * Configuration de l'auto-update via electron-updater.
 * Provider : generic HTTPS sur GCS (kheops-2-app-download bucket).
 * Manifest attendu : `latest.yml` a la racine du bucket, genere automatiquement
 * par electron-builder a chaque `npm run package` grace au bloc `publish`.
 *
 * Ne fait rien en dev (app non packagee). Tous les events sont logges dans
 * crash-log.txt pour diagnostic post-mortem.
 */
function setupAutoUpdater() {
    if (!app.isPackaged) {
        logToFile('[AutoUpdater] Skip (app non packagee, mode dev).');
        return;
    }
    try {
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;

        autoUpdater.on('checking-for-update', () => {
            logToFile('[AutoUpdater] Checking for update...');
        });
        autoUpdater.on('update-available', (info) => {
            logToFile(`[AutoUpdater] Update available: ${info && info.version}`);
        });
        autoUpdater.on('update-not-available', (info) => {
            logToFile(`[AutoUpdater] No update (current ${info && info.version}).`);
        });
        autoUpdater.on('error', (err) => {
            logToFile(`[AutoUpdater] ERROR: ${err && err.message}`);
        });
        autoUpdater.on('download-progress', (progress) => {
            const pct = Math.round(progress && progress.percent || 0);
            if (pct > 0 && pct % 10 === 0) {
                logToFile(`[AutoUpdater] Download: ${pct}%`);
            }
        });
        autoUpdater.on('update-downloaded', (info) => {
            const newVersion = info && info.version;
            logToFile(`[AutoUpdater] Update downloaded: ${newVersion}. Prompting user.`);
            const choice = dialog.showMessageBoxSync({
                type: 'info',
                buttons: ['Redemarrer maintenant', 'Plus tard'],
                defaultId: 0,
                cancelId: 1,
                title: 'Mise a jour Kheops 2',
                message: `Une nouvelle version (${newVersion}) a ete telechargee.`,
                detail: 'Vous pouvez redemarrer maintenant pour l\'appliquer, ou continuer a travailler — elle s\'installera automatiquement quand vous quitterez l\'application.',
            });
            if (choice === 0) {
                logToFile('[AutoUpdater] User chose immediate restart.');
                setImmediate(() => autoUpdater.quitAndInstall());
            } else {
                logToFile('[AutoUpdater] User chose deferred install (next quit).');
            }
        });

        // Premier check 30s apres le boot (laisse l'app se stabiliser)
        setTimeout(() => {
            autoUpdater.checkForUpdatesAndNotify().catch((err) => {
                logToFile('[AutoUpdater] checkForUpdatesAndNotify failed: ' + (err && err.message));
            });
        }, 30 * 1000);

        // Re-check toutes les 6h pour les sessions longues
        setInterval(() => {
            autoUpdater.checkForUpdatesAndNotify().catch((err) => {
                logToFile('[AutoUpdater] periodic check failed: ' + (err && err.message));
            });
        }, 6 * 60 * 60 * 1000);

        logToFile('[AutoUpdater] Setup OK. Premier check dans 30s, puis toutes les 6h.');
    } catch (err) {
        logToFile('[AutoUpdater] Setup failed: ' + (err && err.message));
    }
}

/**
 * Tue tout processus ecoutant sur le port donne (Windows).
 * Utilise PowerShell Get-NetTCPConnection + Stop-Process.
 */
function killProcessOnPort(port) {
    try {
        const result = spawnSync('powershell', [
            '-NoProfile', '-Command',
            `$pids = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($pids) { $pids | ForEach-Object { if ($_ -gt 4) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } }`
        ], { timeout: 5000 });
        console.log(`[Cleanup] Port ${port}: nettoyage effectue`);
    } catch (err) {
        console.warn(`[Cleanup] Port ${port}: erreur non fatale:`, err.message);
    }
}

// --- Détection mode packagé vs développement ---
const isPackaged = app.isPackaged;

// --- Build ID : depuis le manifeste (production) ou dynamique (dev) ---
const BUILD_TIMESTAMP = new Date().toISOString();
let BUILD_ID;
try {
    const manifestPath = path.join(
        isPackaged
            ? path.join(process.resourcesPath, 'server')
            : path.resolve(__dirname, '..', 'server'),
        'build-manifest.json'
    );
    if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        BUILD_ID = manifest.buildId;
    } else {
        BUILD_ID = `DEV-${Date.now().toString(36).slice(-6).toUpperCase()}`;
    }
} catch (e) {
    BUILD_ID = `DEV-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

// --- Charger les variables d'environnement depuis le .env ---
const envPath = isPackaged
    ? path.join(process.resourcesPath, '.env')
    : path.resolve(__dirname, '..', '.env');
require('dotenv').config({ path: envPath });

// En mode packagé, TOUJOURS forcer la production
if (isPackaged) {
    process.env.NODE_ENV = 'production';
    // Securite : forcer bypass auth desactive en build packagee, peu importe
    // ce que contient le .env. Le serveur Express embarque lit cette variable
    // au demarrage (middleware-auth.js + chatSocketHandler.js).
    process.env.KHEOPS_BYPASS_AUTH = 'false';
}

const PORT = process.env.PORT || 5000;
const isDev = !isPackaged && process.env.NODE_ENV === "development";
const devUrl = process.env.ELECTRON_START_URL || "http://localhost:3000";
const SERVER_URL = `http://localhost:${PORT}`;

/**
 * Enregistre l'empreinte de cette machine côté serveur et indique si c'est
 * la première fois qu'on s'y connecte. Utilisé pour déclencher une UX
 * explicite de synchro cloud→local lors d'un boot sur un nouvel ordinateur.
 * Échec silencieux : en cas d'erreur réseau ou serveur down, on présume que
 * c'est une machine connue (false) — on ne veut pas déclencher de modale
 * intrusive sur de simples problèmes transitoires.
 */
async function checkAndRegisterMachine(token) {
    if (!token || typeof token !== 'string') return false;
    try {
        const { machineId, label } = getMachineId();
        const resp = await axios.post(
            `${SERVER_URL}/api/auth/user/known-machines`,
            { machineId, label },
            { headers: { Authorization: `Bearer ${token}` }, timeout: 6000 }
        );
        const isNew = !!resp.data?.isNewMachine;
        if (isNew) {
            console.log(`[Machine] 🆕 Nouvel ordinateur détecté (${label}) — synchro cloud→local sera explicite.`);
        } else {
            console.log(`[Machine] ✅ Ordinateur déjà connu (${label}).`);
        }
        return isNew;
    } catch (err) {
        console.warn('[Machine] Vérification empreinte échouée (non bloquant):', err.message);
        return false;
    }
}

// --- Chemin du serveur Express (différent selon le mode) ---
const serverBasePath = isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.resolve(__dirname, '..', 'server');

console.log("[Electron Main] ===========================================");
console.log("[Electron Main] Kheops 2 — Application Electron (Google Drive)");
console.log(`[Electron Main] BUILD_ID: ${BUILD_ID} | ${BUILD_TIMESTAMP}`);
console.log("[Electron Main] ===========================================");
console.log(`[Electron Main] Mode: ${isDev ? 'DÉVELOPPEMENT' : 'PRODUCTION'}`);
console.log(`[Electron Main] Serveur Express: ${SERVER_URL}`);
console.log(`[Electron Main] Client React: ${isDev ? devUrl : 'servi par Express'}`);

// =============================================================================
// === SECTION 2 : CUSTOM PROTOCOL (kheops2://) + SINGLE INSTANCE
// =============================================================================

// Enregistrer le protocole kheops2:// pour le deep linking (Google OAuth callback)
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('kheops2', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('kheops2');
}

// Single instance lock — empêche d'ouvrir plusieurs fenêtres
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    console.log("[Electron Main] Une autre instance est déjà en cours. Fermeture.");
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        console.log("[Electron Main] ========== SECOND INSTANCE ==========");
        console.log("[Electron Main] CommandLine:", commandLine.join(' '));
        logToFile("[second-instance] CommandLine: " + commandLine.join(' '));

        const deepLinkUrl = commandLine.find(arg => arg.startsWith('kheops2://'));
        if (deepLinkUrl) {
            console.log("[Electron Main] Deep link trouvé:", deepLinkUrl);
            handleDeepLink(deepLinkUrl);
            // v7 : handleDeepLink ne cache plus la fenêtre, elle reste visible
            // et se met au premier plan après loadURL
        } else {
            console.log("[Electron Main] Pas de deep link dans les arguments.");
            // Pas de deep link → montrer la fenêtre normalement
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
            }
        }
        console.log("[Electron Main] ====================================");
    });
}

// Sur macOS, les deep links arrivent via cet événement
app.on('open-url', (event, url) => {
    event.preventDefault();
    console.log("[Electron Main] open-url reçu:", url);
    handleDeepLink(url);
});

// =============================================================================
// === SECTION 3 : VARIABLES ET FONCTIONS UTILITAIRES
// =============================================================================

let mainWindow;
let localServer;
const MAX_LOAD_RETRIES = 5;
const LOAD_RETRY_DELAY = 3000;

// --- Splash window (affichée pendant le démarrage du serveur Express + chargement React) ---
let splashWindow = null;
let splashClosed = false;
const SPLASH_SAFETY_TIMEOUT_MS = 45000; // safety net : on ferme le splash après 45s même si rien ne s'est passé
let splashSafetyTimer = null;

function createSplashWindow() {
    if (splashWindow || splashClosed) return splashWindow;
    try {
        // IMPORTANT — Choix de robustesse Windows :
        // - PAS de `transparent: true` (échec de rendu fréquent au démarrage)
        // - PAS de `alwaysOnTop` (peut bloquer sous d'autres fenêtres système)
        // - `show: true` : la fenêtre apparaît IMMÉDIATEMENT, pas d'attente
        //   de `ready-to-show` (qui peut tarder ou ne jamais arriver)
        // - `backgroundColor` opaque pour éviter le flash blanc avant le rendu
        splashWindow = new BrowserWindow({
            width: 440,
            height: 320,
            frame: false,
            resizable: false,
            movable: true,
            skipTaskbar: false,
            show: true,
            center: true,
            backgroundColor: '#0a1322',
            title: 'Kheops 2 — Démarrage',
            icon: path.join(__dirname, 'icon.ico'),
            roundedCorners: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
            },
        });
        console.log('[splash] BrowserWindow créée, chargement de splash.html…');
        logToFile('[splash] BrowserWindow créée');

        const splashPath = path.join(__dirname, 'splash.html');
        splashWindow.loadFile(splashPath)
            .then(() => {
                console.log('[splash] splash.html chargé.');
                logToFile('[splash] splash.html chargé');
            })
            .catch((err) => {
                console.error('[splash] loadFile failed:', err && err.message);
                logToFile('[splash] loadFile failed: ' + (err && err.message));
            });

        // Forcer l'affichage et le focus dès que le DOM est prêt
        splashWindow.webContents.once('dom-ready', () => {
            try {
                if (splashWindow && !splashWindow.isDestroyed()) {
                    splashWindow.show();
                    splashWindow.focus();
                    splashWindow.moveTop();
                }
            } catch (_) {}
        });

        splashWindow.on('closed', () => {
            console.log('[splash] window closed.');
            logToFile('[splash] window closed');
            splashWindow = null;
        });

        // Safety net : fermer le splash après timeout (au cas où mainWindow ne se charge jamais)
        splashSafetyTimer = setTimeout(() => {
            console.warn('[splash] Safety timeout atteint — fermeture forcée du splash.');
            logToFile('[splash] Safety timeout atteint');
            closeSplashWindow();
            // Forcer l'affichage de la mainWindow si elle existe mais n'est pas visible
            try {
                if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
                    mainWindow.show();
                }
            } catch (_) {}
        }, SPLASH_SAFETY_TIMEOUT_MS);
    } catch (err) {
        console.error('[splash] Création splash échouée:', err && err.message);
        logToFile('[splash] Création splash échouée: ' + (err && err.message));
        splashWindow = null;
    }
    return splashWindow;
}

function closeSplashWindow() {
    if (splashClosed) return;
    splashClosed = true;
    if (splashSafetyTimer) {
        clearTimeout(splashSafetyTimer);
        splashSafetyTimer = null;
    }
    const finalCloseFn = () => {
        try {
            if (splashWindow && !splashWindow.isDestroyed()) {
                splashWindow.close();
            }
        } catch (_) {}
        splashWindow = null;
    };
    // Animation 95% → 100% + fade out, puis fermeture (~480ms total).
    // Si executeJavaScript échoue (renderer pas prêt, splash crashed, etc.),
    // on ferme immédiatement.
    try {
        if (splashWindow && !splashWindow.isDestroyed() && splashWindow.webContents) {
            splashWindow.webContents
                .executeJavaScript('typeof window.__finalizeProgress === "function" ? new Promise(r => window.__finalizeProgress(() => r(true))) : false', true)
                .then(() => setTimeout(finalCloseFn, 60))
                .catch(() => finalCloseFn());
            // Fail-safe : si executeJavaScript ne résout jamais, on ferme après 500ms
            setTimeout(finalCloseFn, 500);
        } else {
            finalCloseFn();
        }
    } catch (_) {
        finalCloseFn();
    }
}

// Variable pour stocker un deep link en attente (si reçu avant que la fenêtre soit prête)
let pendingDeepLinkUrl = null;

// Flag pour ignorer les deep links en double (auto-redirect + clic bouton)
let lastDeepLinkToken = null;
let lastDeepLinkTime = 0;
// Source de l'auth pour le dernier deep link reçu : 'google' (défaut) ou 'microsoft'
// Permet à auth-ready de brancher sur la bonne stack cloud (Drive vs OneDrive).
let lastDeepLinkSource = 'google';

// Flag pour empêcher window-all-closed de quitter pendant un loadURL
let isNavigatingDeepLink = false;

// Flag pour signaler qu'un deep link auth a été traité — le startup init chain
// doit ABANDONNER le pull Drive/watcher car le compte a potentiellement changé.
// Le IPC auth-ready relancera la synchro proprement après l'auth.
let deepLinkAuthProcessed = false;

/**
 * Traite un deep link kheops2://auth/callback?token=XXX
 *
 * STRATÉGIE v8 — NAVIGATION DIRECTE + ARRÊT SYNCHRO PENDANT TRANSITION :
 * v5/v6 : hide/show causait un crash natif Chromium
 * v7 : navigation directe sans hide/show — crash persistant
 * v8 : ARRÊT du watcher/pull Drive AVANT le loadURL pour éviter une
 *       race condition entre le startup init chain (pull Drive) et le
 *       changement d'authentification. Le IPC auth-ready relance la
 *       synchro Drive 3s après que le dashboard est stable.
 *
 * Approche :
 * 1. La fenêtre RESTE VISIBLE tout le temps
 * 2. On ARRÊTE le watcher et le polling Drive immédiatement
 * 3. On navigue avec mainWindow.loadURL() vers /auth/callback?token=XXX
 * 4. Le composant React GoogleCallbackHandler gère l'authentification
 * 5. Le composant navigue vers /dashboard quand c'est terminé
 * 6. Le IPC auth-ready relance la synchro Drive proprement après 3s
 *
 * Le composant React GoogleCallbackHandler s'occupe de :
 *   1. Extraire le token depuis l'URL
 *   2. Nettoyer le localStorage (données du compte précédent)
 *   3. Appeler loadUser() pour charger le nouveau compte
 *   4. Naviguer vers /dashboard en cas de succès
 */
function handleDeepLink(url) {
    console.log("[Deep Link] Traitement:", url);
    logToFile("[Deep Link] Traitement: " + url);
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'auth' && urlObj.pathname === '/callback') {
            const token = urlObj.searchParams.get('token');
            const source = urlObj.searchParams.get('source') || 'google';
            if (!token) {
                console.warn("[Deep Link] Token manquant dans l'URL.");
                return;
            }

            // ANTI-DOUBLON : Ignorer si c'est le même token reçu il y a moins de 10 secondes
            // (le navigateur envoie le deep link 2 fois : auto-redirect + clic bouton)
            const now = Date.now();
            if (token === lastDeepLinkToken && (now - lastDeepLinkTime) < 10000) {
                console.log("[Deep Link] ⏭ Doublon ignoré (même token, < 10s).");
                return;
            }
            lastDeepLinkToken = token;
            lastDeepLinkTime = now;
            lastDeepLinkSource = source;
            console.log(`[Deep Link] source=${source}`);

            // Si la fenêtre n'est pas encore disponible, stocker le deep link
            // pour le traiter après la création de la fenêtre
            if (!mainWindow || mainWindow.isDestroyed()) {
                console.log("[Deep Link] Fenêtre non disponible. Deep link mis en attente.");
                pendingDeepLinkUrl = url;
                return;
            }

            console.log("[Deep Link] Token reçu. Navigation DIRECTE (fenêtre visible)...");
            logToFile("[Deep Link] Token reçu. Navigation directe...");

            // Signaler que l'auth via deep link est en cours — le startup init chain
            // doit abandonner le pull/watcher pour éviter un crash de race condition
            deepLinkAuthProcessed = true;

            // Arrêter immédiatement le watcher et le polling Drive pour éviter les conflits
            // pendant la transition d'authentification
            localFileWatcher.stopPullPolling();
            localFileWatcher.stopAllWatchers();
            console.log("[Deep Link] Watcher et polling arrêtés pendant la transition auth.");

            // Marquer qu'on est en navigation deep link (empêche window-all-closed de quitter)
            isNavigatingDeepLink = true;

            // Navigation directe — la fenêtre reste visible
            const baseUrl = isDev ? devUrl : SERVER_URL;
            const callbackUrl = baseUrl + '/auth/callback?token=' + encodeURIComponent(token);
            console.log("[Deep Link] URL cible:", callbackUrl);

            mainWindow.loadURL(callbackUrl).then(() => {
                console.log("[Deep Link] ✅ loadURL terminé avec succès.");
                logToFile("[Deep Link] loadURL terminé avec succès.");
                isNavigatingDeepLink = false;
                // Mettre la fenêtre au premier plan
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.focus();
                }
            }).catch((err) => {
                console.error("[Deep Link] ❌ ERREUR loadURL:", err.message);
                logToFile("[Deep Link] ERREUR loadURL: " + err.message);
                isNavigatingDeepLink = false;
                // En cas d'erreur, s'assurer que la fenêtre est visible et au premier plan
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            });

        } else if (urlObj.hostname === 'auth' && urlObj.pathname.startsWith('/error')) {
            const errorCode = urlObj.searchParams.get('code') || 'unknown';
            if (mainWindow && !mainWindow.isDestroyed()) {
                const baseUrl = isDev ? devUrl : SERVER_URL;
                mainWindow.loadURL(`${baseUrl}/?error=${errorCode}`);
                mainWindow.show();
                mainWindow.focus();
            }
        }
    } catch (err) {
        console.error("[Deep Link] Erreur de parsing:", err);
        logToFile("[Deep Link] Erreur de parsing: " + err.message);
    }
}

/**
 * Copie google_credentials.json vers userData au premier lancement
 */
function ensureGoogleCredentials() {
    const userDataPath = app.getPath('userData');
    const targetPath = path.join(userDataPath, 'google_credentials.json');
    const sourcePath = isPackaged
        ? path.join(process.resourcesPath, 'google_credentials.json')
        : path.resolve(__dirname, 'google_credentials.json');

    if (!fs.existsSync(targetPath)) {
        console.log(`[Main] google_credentials.json absent de ${targetPath}`);
        if (fs.existsSync(sourcePath)) {
            try {
                fs.copyFileSync(sourcePath, targetPath);
                console.log(`[Main] google_credentials.json copié depuis ${sourcePath}`);
            } catch (err) {
                console.error(`[Main] Erreur copie credentials:`, err);
            }
        } else {
            console.warn(`[Main] google_credentials.json introuvable: ${sourcePath}`);
        }
    } else {
        console.log(`[Main] google_credentials.json trouvé.`);
    }
}

/**
 * Démarre le serveur local Socket.IO sur le port 8080
 */
function startLocalServer() {
    const serverApp = express();
    const LOCAL_PORT = 8080;
    const CLIENT_URL = isDev ? devUrl : SERVER_URL;

    serverApp.use(cors({ origin: CLIENT_URL, credentials: true }));
    serverApp.use(express.json());

    const upload = multer({ dest: path.join(app.getPath('userData'), 'temp_uploads') });
    serverApp.post('/api/upload-temp-file', upload.single('file'), (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ success: false, message: "Aucun fichier reçu." });
            const sanitize = require('sanitize-filename');
            const originalName = sanitize(Buffer.from(req.file.originalname, 'latin1').toString('utf8'));
            res.json({ success: true, tempPath: req.file.path, originalName });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // Routes mail
    serverApp.use('/api/mails', mailRoutes);

    localServer = http.createServer(serverApp);
    const io = new Server(localServer, {
        cors: { origin: CLIENT_URL, methods: ["GET", "POST"] },
        transports: ['websocket', 'polling']
    });
    socketIoServer = io;

    initializeSocketHandlers(io, SERVER_URL);

    localServer.listen(LOCAL_PORT, () => {
        console.log(`[Electron] Socket.IO & serveur local démarrés sur le port ${LOCAL_PORT}`);
    });

    localServer.on('error', (e) => {
        console.error('[Electron] Erreur serveur local:', e);
    });
}

/**
 * Charge une URL avec logique de réessai
 */
async function loadMainWindowUrl(window, url, isDevUrl, retries = MAX_LOAD_RETRIES) {
    console.log(`[Electron Main] Tentative de chargement: ${url} (Tentatives restantes: ${retries})`);
    try {
        await window.loadURL(url);
        console.log(`[Electron Main] ${url} chargé avec succès.`);
    } catch (err) {
        console.error(`[Electron Main] ERREUR CHARGEMENT ${url}:`, err.message);
        if (isDevUrl && retries > 0) {
            console.log(`[Electron Main] Réessai dans ${LOAD_RETRY_DELAY / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, LOAD_RETRY_DELAY));
            await loadMainWindowUrl(window, url, isDevUrl, retries - 1);
        } else {
            console.error(`[Electron Main] Nombre maximum de tentatives atteint.`);
            try {
                await window.loadFile(path.join(__dirname, 'loadError.html'));
            } catch (loadErr) {
                console.error("[Electron Main] Échec chargement page d'erreur:", loadErr);
                window.loadURL(`data:text/html;charset=utf-8,<h1>Erreur Critique</h1><p>Impossible de charger l'application.</p><pre>${encodeURI(err.message)}</pre>`);
            }
        }
    }
}

/**
 * Crée la fenêtre principale Electron
 */
function createWindow() {
    console.log("[Electron Main] Création de la fenêtre principale...");

    // Vérifier s'il y a un deep link en attente ou dans process.argv (premier lancement via deep link)
    const deepLinkFromArgv = process.argv.find(arg => arg.startsWith('kheops2://'));
    const deepLinkToProcess = pendingDeepLinkUrl || deepLinkFromArgv;

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        // v9 : la fenêtre démarre cachée. Le splash screen reste visible
        // tant que le renderer n'est pas prêt. Une fois 'ready-to-show'
        // (ou 'did-finish-load' en fallback), on affiche mainWindow et
        // on ferme le splash. Pendant les transitions ultérieures
        // (deep link auth callback), la fenêtre reste visible.
        show: false,
        backgroundColor: '#0f1c2e',
        autoHideMenuBar: true,
        title: `Kheops 2 [${BUILD_ID}]`,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: !isDev
        }
    });

    // Supprimer complètement la barre de menu native
    Menu.setApplicationMenu(null);

    // --- Transition splash → mainWindow ---
    // ready-to-show est la voie principale. did-finish-load et did-fail-load
    // servent de filets de sécurité pour s'assurer que le splash se ferme
    // toujours, même si le rendu initial échoue.
    let mainWindowRevealed = false;
    const revealMainWindow = (reason) => {
        if (mainWindowRevealed) return;
        mainWindowRevealed = true;
        try {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.show();
                mainWindow.focus();
            }
        } catch (e) {
            console.warn('[Electron Main] revealMainWindow show() failed:', e.message);
        }
        closeSplashWindow();
        console.log(`[Electron Main] mainWindow révélée (raison: ${reason}).`);
        logToFile(`mainWindow révélée (raison: ${reason})`);
    };
    mainWindow.once('ready-to-show', () => revealMainWindow('ready-to-show'));
    mainWindow.webContents.once('did-finish-load', () => revealMainWindow('did-finish-load'));
    mainWindow.webContents.once('did-fail-load', () => revealMainWindow('did-fail-load'));

    // --- Bridge de progression du pull cloud → local ---
    // Relaie les events du localFileWatcher vers le renderer pour la modale.
    const _syncProgressForwarder = (evt) => {
        try {
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
                mainWindow.webContents.send('sync:progress', evt);
            }
        } catch (_) { /* ignore — le renderer peut être en cours de navigation */ }
    };
    localFileWatcher.onPullProgress(_syncProgressForwarder);
    mainWindow.on('closed', () => {
        try { localFileWatcher.offPullProgress(_syncProgressForwarder); } catch (_) {}
    });

    // --- DIAGNOSTIC : Écouter les événements de crash/erreur du renderer ---
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        const msg = `RENDERER CRASH: ${details.reason} exitCode: ${details.exitCode}`;
        console.error("[Electron Main] ⚠️ " + msg);
        logToFile(msg);
    });

    mainWindow.webContents.on('unresponsive', () => {
        console.warn("[Electron Main] ⚠️ La fenêtre ne répond plus.");
        logToFile("UNRESPONSIVE: La fenêtre ne répond plus.");
    });

    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        const msg = `did-fail-load: ${errorDescription} (code: ${errorCode}) URL: ${validatedURL}`;
        console.error("[Electron Main] ⚠️ " + msg);
        logToFile(msg);
    });

    if (deepLinkToProcess) {
        // Il y a un deep link à traiter : charger DIRECTEMENT la page callback
        console.log(`[Electron Main] Deep link détecté (${pendingDeepLinkUrl ? 'en attente' : 'argv'}): ${deepLinkToProcess}`);
        logToFile("[createWindow] Deep link détecté: " + deepLinkToProcess);
        pendingDeepLinkUrl = null; // Consommer le deep link en attente

        try {
            const urlObj = new URL(deepLinkToProcess);
            if (urlObj.hostname === 'auth' && urlObj.pathname === '/callback') {
                const token = urlObj.searchParams.get('token');
                const source = urlObj.searchParams.get('source') || 'google';
                if (token) {
                    // Marquer l'anti-doublon
                    lastDeepLinkToken = token;
                    lastDeepLinkTime = Date.now();
                    lastDeepLinkSource = source;

                    // Signaler que l'auth via deep link est en cours
                    deepLinkAuthProcessed = true;
                    console.log(`[createWindow] Deep link source=${source}`);

                    const baseUrl = isDev ? devUrl : SERVER_URL;
                    const callbackUrl = baseUrl + '/auth/callback?token=' + encodeURIComponent(token);
                    console.log(`[Electron Main] Chargement direct de la page callback: ${callbackUrl}`);

                    loadMainWindowUrl(mainWindow, callbackUrl, false);
                } else {
                    console.warn("[Electron Main] Deep link sans token. Chargement normal.");
                    loadMainWindowUrl(mainWindow, isDev ? devUrl : SERVER_URL, isDev);
                }
            } else {
                console.log("[Electron Main] Deep link non-callback. Chargement normal.");
                loadMainWindowUrl(mainWindow, isDev ? devUrl : SERVER_URL, isDev);
            }
        } catch (parseErr) {
            console.error("[Electron Main] Erreur parsing deep link:", parseErr);
            loadMainWindowUrl(mainWindow, isDev ? devUrl : SERVER_URL, isDev);
        }
    } else {
        const startUrl = isDev ? devUrl : SERVER_URL;
        console.log(`[Electron Main] URL de démarrage: ${startUrl}`);
        loadMainWindowUrl(mainWindow, startUrl, isDev);
    }

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // F12 active/desactive les DevTools même en mode production (debug client)
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'F12'
            && !input.alt && !input.control && !input.meta && !input.shift) {
            if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
            } else {
                mainWindow.webContents.openDevTools({ mode: 'detach' });
            }
            event.preventDefault();
        }
    });

    // Événement AVANT la fermeture
    mainWindow.on("close", (event) => {
        console.log("[Electron Main] ⚠️ Événement 'close' sur mainWindow.");
        logToFile("[close] Événement close. isQuitting=" + isQuitting + " isNavigatingDeepLink=" + isNavigatingDeepLink);
        // PROTECTION : Si on est en pleine navigation deep link, empêcher la fermeture
        if (!isQuitting && isNavigatingDeepLink) {
            console.log("[Electron Main] → FERMETURE EMPÊCHÉE (isNavigatingDeepLink actif).");
            logToFile("[close] FERMETURE EMPÊCHÉE (isNavigatingDeepLink)");
            event.preventDefault();
            return;
        }
    });

    // Événement APRÈS la fermeture
    mainWindow.on("closed", () => {
        console.log("[Electron Main] Fenêtre principale fermée (événement 'closed').");
        logToFile("[closed] Fenêtre principale fermée.");
        mainWindow = null;
    });

    // Écouter la destruction du webContents
    mainWindow.webContents.on('destroyed', () => {
        console.log("[Electron Main] ⚠️ webContents DÉTRUIT.");
        logToFile("webContents DÉTRUIT.");
    });

    // Écouter la navigation pour tracer les changements d'URL
    mainWindow.webContents.on('did-navigate', (event, url) => {
        console.log(`[Electron Main] did-navigate → ${url}`);
        logToFile("did-navigate → " + url);
    });

    mainWindow.webContents.on('did-navigate-in-page', (event, url) => {
        console.log(`[Electron Main] did-navigate-in-page → ${url}`);
        logToFile("did-navigate-in-page → " + url);
    });
}

/**
 * Copie récursive de dossier (pour duplication de documents)
 */
function copyFolderRecursiveSync(src, dest) {
    if (!fs.existsSync(src)) { console.warn(`[Copy Util] Dossier source introuvable: ${src}`); return; }
    try {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) copyFolderRecursiveSync(srcPath, destPath);
            else fs.copyFileSync(srcPath, destPath);
        }
    } catch (error) { console.error(`[Copy Util] Erreur copie ${src} -> ${dest}:`, error); }
}

/**
 * Retourne le chemin racine des fichiers clients (local).
 * Tient compte du compte Google actif (sous-dossier par compte).
 */
function getFilesClientsRoot() {
    const configPath = configManager.getLocalRootPath();
    return configPath || process.env.FILES_CLIENTS_PATH || path.join("C:\\", "Files_Clients");
}

/**
 * Met à jour la variable d'environnement FILES_CLIENTS_PATH
 * pour que le serveur Express (mails.js) utilise le bon chemin.
 * Appelé après chaque changement de compte ou de chemin racine.
 */
function updateFilesClientsEnv() {
    const effectivePath = configManager.getLocalRootPath();
    if (effectivePath) {
        process.env.FILES_CLIENTS_PATH = effectivePath;
        console.log(`[Main] FILES_CLIENTS_PATH mis à jour : ${effectivePath}`);
    }
}

// =============================================================================
// === SECTION 4 : DÉMARRAGE DE L'APPLICATION
// =============================================================================

app.whenReady().then(async () => {
    // === GUARD CRITIQUE : Seconde instance ===
    // Quand un deep link arrive, Windows lance une 2ème instance de Kheops2.exe.
    // Cette 2ème instance appelle app.quit() (ligne ~140), mais c'est ASYNCHRONE :
    // app.whenReady() se résout AVANT que le quit ne prenne effet.
    // Sans ce guard, la 2ème instance exécuterait killProcessOnPort(5000/8080)
    // et TUERAIT le serveur Express de la 1ère instance → crash silencieux.
    if (!gotTheLock) {
        console.log("[Electron App] Seconde instance détectée — arrêt immédiat (pas de startup).");
        logToFile("[GUARD] Seconde instance — app.whenReady() bloqué.");
        return;
    }

    console.log("[Electron App] Prêt. Démarrage...");
    logToFile("=== APPLICATION DÉMARRÉE ===");

    // --- 4.-0.5 : CSP renderer (S26 #31, defense en profondeur contre XSS) ---
    // Appliquee UNIQUEMENT en mode packagé : en dev (CRA + webpack-dev-server),
    // CRA a besoin d'eval/inline scripts, et une CSP stricte casserait le
    // hot reload. En prod (Electron + bundle figé), on durcit.
    //
    // Politique :
    //   - 'self' partout par défaut
    //   - script-src + style-src : 'unsafe-inline' obligatoire (React inline
    //     styles + CRA bundle), 'unsafe-eval' nécessaire pour certaines libs
    //     bundlées. Restriction CSP réelle = aucune source externe de script.
    //   - connect-src : whitelist stricte (API locale, Google APIs OAuth/Drive/
    //     Gmail/GCS update, Microsoft Graph OAuth/Mail). Pas de https: générique
    //     → bloque l'exfiltration vers un serveur arbitraire en cas de XSS.
    //   - img-src : data: + blob: + https: (les images Drive viennent en https).
    //   - frame-src / object-src 'none' : pas d'iframe, pas de plugin (Flash etc).
    //   - base-uri / form-action 'self' : protège contre les hijacks <base>/<form>.
    if (app.isPackaged) {
        const { session } = require('electron');
        const cspPolicy = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: blob: https:",
            // ★ S27 hotfix 2.0.12-rc1 : ajout media-src pour les data: URLs
            //   des pièces jointes inline (messages vocaux du chat — chantier
            //   #12). Sans cette directive, <audio src="data:audio/webm;...">
            //   retombait sur default-src 'self' et bloquait silencieusement
            //   la lecture (P1 : "on n'entend rien").
            "media-src 'self' data: blob:",
            // ★ S27 hotfix 2.0.10-rc1 : ajout du port 8080 (agent de bureau
            //   local, démarré par startLocalServer dans ce même main.js).
            //   Oubli de la 2.0.7-rc1 → toutes les communications du moteur
            //   d'affichage vers l'agent étaient bloquées par la CSP (drag-drop,
            //   export texte, génération Cerfa aide juridictionnelle).
            "connect-src 'self'" +
                " http://localhost:5000 http://127.0.0.1:5000" +
                " ws://localhost:5000 ws://127.0.0.1:5000" +
                " http://localhost:8080 http://127.0.0.1:8080" +
                " ws://localhost:8080 ws://127.0.0.1:8080" +
                " https://storage.googleapis.com" +
                " https://*.googleapis.com" +
                " https://accounts.google.com" +
                " https://*.microsoftonline.com" +
                " https://graph.microsoft.com",
            "frame-src 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ].join('; ');

        session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [cspPolicy],
                },
            });
        });
        console.log("[Electron App] CSP renderer activée (mode packagé).");
        logToFile("CSP renderer activée (mode packagé).");
    }

    // --- 4.0 : Splash screen (feedback immédiat pendant le démarrage du serveur) ---
    createSplashWindow();

    // --- 4.1 : Credentials Google ---
    ensureGoogleCredentials();

    // --- 4.1b : Nettoyage des ports avant demarrage ---
    console.log('[Electron App] Nettoyage des ports 5000 et 8080...');
    killProcessOnPort(5000);
    killProcessOnPort(8080);

    // --- 4.2 : Démarrer le serveur Express (port 5000, BDD, API) ---
    // En mode portable, electron-builder extrait l'asar (avec main.js) et les
    // extraResources (server/) ASYNCHRONIQUEMENT. main.js peut donc démarrer
    // alors que server/index.js n'est pas encore extrait.
    // → On attend la présence du fichier avant de tenter le require.
    try {
        const serverIndexPath = path.join(serverBasePath, 'index');
        const serverIndexFile = serverIndexPath + '.js';
        console.log(`[Electron App] Chargement du serveur depuis: ${serverIndexPath}`);
        logToFile(`Chargement serveur: ${serverIndexPath}`);

        if (isPackaged) {
            process.env.CLIENT_BUILD_PATH = path.join(app.getAppPath(), 'client', 'build');
        }

        // Wait for extraction to complete (max 30s, check every 200ms)
        const waitStart = Date.now();
        const WAIT_MAX_MS = 30000;
        const WAIT_INTERVAL_MS = 200;
        let extractionWaited = 0;
        while (!fs.existsSync(serverIndexFile)) {
            if (Date.now() - waitStart > WAIT_MAX_MS) {
                throw new Error(`Le fichier serveur n'a pas été extrait après ${WAIT_MAX_MS / 1000}s.\nPath: ${serverIndexFile}`);
            }
            await new Promise((r) => setTimeout(r, WAIT_INTERVAL_MS));
            extractionWaited += WAIT_INTERVAL_MS;
            if (extractionWaited % 1000 === 0) {
                console.log(`[Electron App] Attente extraction… ${extractionWaited / 1000}s`);
                logToFile(`Attente extraction: ${extractionWaited / 1000}s`);
            }
        }
        if (extractionWaited > 0) {
            console.log(`[Electron App] server/index.js détecté après ${extractionWaited}ms d'attente.`);
            logToFile(`server/index.js détecté après ${extractionWaited}ms`);
        }

        const { startServer } = require(serverIndexPath);
        await startServer();
        console.log("[Electron App] Serveur Express démarré sur le port " + PORT);
        logToFile("Serveur Express démarré port " + PORT);
    } catch (err) {
        console.error("[Electron App] ERREUR FATALE — Impossible de démarrer le serveur Express:", err);
        logToFile("ERREUR FATALE serveur: " + (err && err.message));
        closeSplashWindow();
        dialog.showErrorBox(
            'Erreur de démarrage',
            `Impossible de démarrer le serveur Kheops 2.\n\nErreur : ${err.message}\n\nFermez l'application et redémarrez-la (double-clic sur le fichier).`
        );
        app.quit();
        return;
    }

    // --- 4.3 : Démarrer le serveur local Socket.IO (port 8080, documents) ---
    startLocalServer();

    // --- 4.4 : Enregistrer les handlers IPC ---
    console.log("[Electron App] Enregistrement des handlers IPC...");

    // ---- Handlers Google Auth ----

    ipcMain.handle('login-google', async () => {
        try {
            secLog('ELECTRON_LOGIN_GOOGLE_START', { source: 'google' });
            const client = await authService.initGoogleAuth();
            if (client) {
                googleDriveService.init(client);

                // Récupérer le profil pour connaître le compte actif
                const profile = await authService.getUserInfo();
                secLog('ELECTRON_LOGIN_GOOGLE_SUCCESS', { email: profile && profile.email, source: 'google' });

                // Isolation par compte : définir le compte actif + migration
                if (profile && profile.email) {
                    configManager.setCurrentAccount(profile.email);
                    configManager.migrateIfNeeded(configManager.getBaseRootPath(), profile.email);
                    updateFilesClientsEnv();
                }

                try {
                    await googleDriveService.ensureBaseStructure();
                } catch (err) {
                    console.error('[GDRIVE] Erreur structure après login:', err);
                }

                // Relancer le watcher sur le chemin du compte actif
                const accountPath = configManager.getLocalRootPath();
                if (accountPath) {
                    localFileWatcher.restartWatcher(accountPath);
                }

                // Lancer la synchro Drive → Local après login
                localFileWatcher.pullFromDrive().catch(err =>
                    console.error('[Main] Pull après login échoué:', err.message)
                );
                localFileWatcher.startPullPolling(60000);

                return { success: true, profile };
            }
            return { success: false, error: 'Connexion Google annulée ou échouée.' };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('logout-google', async () => {
        const previousUserId = configManager.getCurrentUserId();
        const previousEmail = configManager.getCurrentAccount();
        secLog('ELECTRON_LOGOUT_GOOGLE_START', { userId: previousUserId, email: previousEmail, source: 'google' });
        await authService.logoutGoogle();

        // Confidentialité multi-user : reset le client Drive en mémoire
        // pour qu'aucune opération ultérieure n'utilise l'ancien auth.
        try { googleDriveService.reset(); } catch (e) { console.warn('[logout-google] reset GDrive:', e.message); }

        // Isolation par compte : effacer le compte actif et arrêter la synchro
        configManager.setCurrentAccount(null);
        updateFilesClientsEnv();
        localFileWatcher.stopAllWatchers();
        localFileWatcher.stopPullPolling();

        secLog('ELECTRON_LOGOUT_GOOGLE_DONE', { userId: previousUserId, email: previousEmail, source: 'google' });
        return { success: true };
    });

    ipcMain.handle('check-google-status', async () => {
        const client = authService.getGoogleAuthClient();
        return { connected: !!client };
    });

    // ─── Handler IPC : initialiser le cloud APRÈS un login email/password ─────
    // Couvre le scénario "nouveau PC + compte existant lié à Google ou Microsoft" :
    //  - React appelle window.electron.requestCloudSync(token) après loadUser
    //  - Ici on tente de récupérer le refresh_token du compte côté backend
    //  - Si Google : initialise le client Google Drive, lance pull
    //  - Sinon Microsoft : initialise OneDrive, lance pull
    //  - Sinon : aucun cloud lié, on retourne sans erreur
    // Idempotent : si un client cloud est déjà actif (déjà initialisé via deep-link
    // ou session sauvegardée), on lance juste le pull sans re-initialiser.
    ipcMain.handle('cloud-init-after-login', async (_event, token) => {
        try {
            if (!token || typeof token !== 'string') {
                return { success: false, error: 'Token JWT manquant.' };
            }

            // Détection de nouvelle machine : permet d'afficher une modale
            // de synchro explicite et plus visible si c'est la 1re fois que
            // l'utilisateur s'authentifie depuis ce PC.
            const isNewMachine = await checkAndRegisterMachine(token);

            // Si un cloud est déjà actif, on évite la ré-init et on (re)lance le pull
            const existingCtx = require('./services/cloudContext').getCloudCtx();
            if (existingCtx) {
                console.log(`[IPC cloud-init-after-login] Cloud déjà actif (${existingCtx.source}), lancement direct du pull.`);
                const localPath = configManager.getLocalRootPath();
                if (localPath) localFileWatcher.restartWatcher(localPath);
                localFileWatcher.pullFromDrive({ isNewMachine }).catch(e =>
                    console.error('[IPC cloud-init-after-login] Pull échoué:', e.message)
                );
                localFileWatcher.startPullPolling(60000);
                return { success: true, source: existingCtx.source, alreadyActive: true, isNewMachine };
            }

            // ─ Tentative Google ─
            try {
                console.log('[IPC cloud-init-after-login] Tentative récupération refresh_token Google...');
                const gResp = await axios.get(`${SERVER_URL}/api/auth/google/get-refresh-token`, {
                    headers: { Authorization: `Bearer ${token}` },
                    validateStatus: (s) => s < 500, // 401 attendu si pas de session, on traite plus bas
                });
                if (gResp.status === 200 && gResp.data && gResp.data.refreshToken) {
                    const client = await authService.initGoogleAuthFromRefreshToken(
                        gResp.data.refreshToken,
                        process.env.GOOGLE_CLIENT_ID,
                        process.env.GOOGLE_CLIENT_SECRET
                    );
                    if (client) {
                        googleDriveService.init(client);
                        try {
                            const profile = await authService.getUserInfo();
                            if (profile && profile.email) {
                                configManager.setCurrentAccount(profile.email);
                                configManager.migrateIfNeeded(configManager.getBaseRootPath(), profile.email);
                                updateFilesClientsEnv();
                            }
                        } catch (pErr) {
                            console.warn('[IPC cloud-init-after-login] Profil Google inaccessible:', pErr.message);
                        }
                        try { await googleDriveService.ensureBaseStructure(); } catch (e) {
                            console.error('[IPC cloud-init-after-login] ensureBaseStructure Google:', e.message);
                        }
                        const localPath = configManager.getLocalRootPath();
                        if (localPath) localFileWatcher.restartWatcher(localPath);
                        localFileWatcher.pullFromDrive({ isNewMachine }).catch(e =>
                            console.error('[IPC cloud-init-after-login] Pull Google échoué:', e.message)
                        );
                        localFileWatcher.startPullPolling(60000);
                        console.log('[IPC cloud-init-after-login] ✅ Google Drive initialisé + pull lancé.');
                        return { success: true, source: 'google', isNewMachine };
                    }
                }
            } catch (gErr) {
                console.warn('[IPC cloud-init-after-login] Google refresh_token KO:', gErr.message);
            }

            // ─ Tentative Microsoft (fallback) ─
            try {
                console.log('[IPC cloud-init-after-login] Tentative récupération refresh_token Microsoft...');
                const mResp = await axios.get(`${SERVER_URL}/api/auth/microsoft/get-refresh-token`, {
                    headers: { Authorization: `Bearer ${token}` },
                    validateStatus: (s) => s < 500,
                });
                if (mResp.status === 200 && mResp.data && mResp.data.refreshToken) {
                    await microsoftAuthService.initFromRefreshToken(mResp.data.refreshToken);
                    oneDriveService.init(() => microsoftAuthService.getServerAccessToken());
                    try {
                        const profile = await microsoftAuthService.getServerProfile();
                        if (profile && profile.email) {
                            configManager.setCurrentAccount(profile.email);
                            configManager.migrateIfNeeded(configManager.getBaseRootPath(), profile.email);
                            updateFilesClientsEnv();
                        }
                    } catch (pErr) {
                        console.warn('[IPC cloud-init-after-login] Profil Microsoft inaccessible:', pErr.message);
                    }
                    try { await oneDriveService.ensureBaseStructure(); } catch (e) {
                        console.error('[IPC cloud-init-after-login] ensureBaseStructure Microsoft:', e.message);
                    }
                    const localPath = configManager.getLocalRootPath();
                    if (localPath) localFileWatcher.restartWatcher(localPath);
                    localFileWatcher.pullFromDrive({ isNewMachine }).catch(e =>
                        console.error('[IPC cloud-init-after-login] Pull Microsoft échoué:', e.message)
                    );
                    localFileWatcher.startPullPolling(60000);
                    console.log('[IPC cloud-init-after-login] ✅ OneDrive initialisé + pull lancé.');
                    return { success: true, source: 'microsoft', isNewMachine };
                }
            } catch (mErr) {
                console.warn('[IPC cloud-init-after-login] Microsoft refresh_token KO:', mErr.message);
            }

            console.log('[IPC cloud-init-after-login] Aucun cloud lié à ce compte (ni Google ni Microsoft).');
            return { success: false, error: 'no-cloud-linked' };
        } catch (err) {
            console.error('[IPC cloud-init-after-login] Erreur globale:', err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('get-user-info', async () => {
        const store = new Store();
        const profile = store.get('user_profile');
        if (profile && profile.source === 'google') {
            return await authService.getUserInfo();
        }
        if (profile && profile.source !== 'google') {
            store.delete('user_profile');
        }
        return null;
    });

    ipcMain.handle('upload-to-gdrive', async (event, { fileName, mimeType, fileBuffer, parentFolderId }) => {
        try {
            const authClient = authService.getGoogleAuthClient();
            if (!authClient) throw new Error("Authentification Google requise.");
            googleDriveService.init(authClient);

            // Garde chiffrement E2E (audit S25 #1, D1) : refus si cabinet
            // protégé mais machine verrouillée — empêche fuite silencieuse.
            const cryptoHandler = require('./crypto-handler');
            if (cryptoHandler.shouldEncrypt() && !cryptoHandler.isUnlocked()) {
                return {
                    success: false,
                    error: 'Cabinet verrouille : deverrouillez votre cabinet (saisissez votre phrase secrete) avant d\'envoyer ce fichier.',
                };
            }

            // Passer par uploadFileToCloud (helper centralisé qui gère le
            // chiffrement .kbox quand la protection est active). Le buffer
            // est écrit dans un tmp file pour respecter la signature
            // (localFilePath, fileName, parentFolderId).
            const os = require('os');
            const tmpName = 'kheops-upload-' + Date.now() + '-' + Math.random().toString(36).slice(2);
            const tmpPath = path.join(os.tmpdir(), tmpName);
            fs.writeFileSync(tmpPath, fileBuffer);
            try {
                const { uploadFileToCloud } = require('./services/localFileWatcher');
                const file = await uploadFileToCloud(tmpPath, fileName, parentFolderId || 'root');
                return { success: true, fileId: file.id, name: file.name };
            } finally {
                try { fs.unlinkSync(tmpPath); } catch (_) { /* best-effort */ }
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    // ---- Handlers Microsoft Auth (MSAL Public Client + PKCE) ----

    ipcMain.handle('login-microsoft', async () => {
        try {
            secLog('ELECTRON_LOGIN_MICROSOFT_START', { source: 'microsoft' });
            await microsoftAuthService.login();
            const profile = await microsoftAuthService.getProfile();
            secLog('ELECTRON_LOGIN_MICROSOFT_SUCCESS', { email: profile && profile.email, source: 'microsoft' });

            // Symétrie avec login-google : initialiser le service OneDrive
            // avec le getter du flow client, basculer le compte actif local,
            // démarrer le watcher et la synchro pull. Sans ces lignes, le
            // user Microsoft pouvait écrire sur le rootPath du user précédent
            // tant que le renderer n'avait pas envoyé set-user-context.
            if (profile && profile.email) {
                oneDriveService.init(() => microsoftAuthService.getAccessToken());
                configManager.setCurrentAccount(profile.email);
                updateFilesClientsEnv();

                try {
                    await oneDriveService.ensureBaseStructure();
                } catch (err) {
                    console.error('[ONEDRIVE] Erreur structure après login:', err);
                }

                const accountPath = configManager.getLocalRootPath();
                if (accountPath) {
                    localFileWatcher.restartWatcher(accountPath);
                }

                localFileWatcher.pullFromDrive().catch(err =>
                    console.error('[Main] Pull Microsoft après login échoué:', err.message)
                );
                localFileWatcher.startPullPolling(60000);
            }

            return { success: true, profile };
        } catch (error) {
            console.error("[Microsoft] Échec login:", error.message);
            secLog('ELECTRON_LOGIN_MICROSOFT_FAILURE', { source: 'microsoft', reason: error.message });
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('logout-microsoft', async () => {
        const previousUserId = configManager.getCurrentUserId();
        const previousEmail = configManager.getCurrentAccount();
        secLog('ELECTRON_LOGOUT_MICROSOFT_START', { userId: previousUserId, email: previousEmail, source: 'microsoft' });
        try {
            await microsoftAuthService.logout();

            // Symétrie avec logout-google : nettoyage complet du contexte pour
            // garantir l'étanchéité multi-user. Sans ces lignes, le rootPath
            // local et les watchers du user précédent restaient actifs, et un
            // login ultérieur d'un autre user pouvait fuiter des fichiers.
            try { oneDriveService.reset(); } catch (e) { console.warn('[logout-microsoft] reset OneDrive:', e.message); }
            configManager.setCurrentAccount(null);
            updateFilesClientsEnv();
            localFileWatcher.stopAllWatchers();
            localFileWatcher.stopPullPolling();

            secLog('ELECTRON_LOGOUT_MICROSOFT_DONE', { userId: previousUserId, email: previousEmail, source: 'microsoft' });
            return { success: true };
        } catch (error) {
            secLog('ELECTRON_LOGOUT_MICROSOFT_FAILURE', { userId: previousUserId, email: previousEmail, source: 'microsoft', reason: error.message });
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('check-microsoft-status', async () => {
        try {
            return await microsoftAuthService.getStatus();
        } catch (error) {
            return { connected: false, error: error.message };
        }
    });

    ipcMain.handle('get-microsoft-profile', async () => {
        try {
            const profile = await microsoftAuthService.getProfile();
            return { success: true, profile };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('fetch-microsoft-mails', async (event, options = {}) => {
        try {
            const messages = await microsoftAuthService.fetchMessages(options);
            return { success: true, messages };
        } catch (error) {
            console.error("[Microsoft] Échec fetch mails:", error.message);
            return { success: false, error: error.message };
        }
    });

    // ---- Handlers configuration ----

    ipcMain.handle('get-root-path', async () => {
        return configManager.getLocalRootPath();
    });

    ipcMain.handle('select-root-path', async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            title: 'Sélectionner le dossier de stockage local',
            buttonLabel: 'Sélectionner ce dossier'
        });
        if (!result.canceled && result.filePaths.length > 0) {
            const newBasePath = result.filePaths[0];
            configManager.setLocalRootPath(newBasePath);
            updateFilesClientsEnv();
            // Utiliser le chemin effectif (base + compte si connecté)
            const effectivePath = configManager.getLocalRootPath();
            localFileWatcher.restartWatcher(effectivePath);
            return effectivePath;
        }
        return null;
    });

    // ---- Handlers chiffrement E2E (lot 3a — crypto-handler.js) ----
    // Voir DESIGN_CHIFFREMENT_E2E.md et NOTICE_CHIFFREMENT_UTILISATEUR.md
    // dans Kheops_2/e2e/. La MasterKey du cabinet vit uniquement dans le
    // main process (jamais exposee au renderer React). safeStorage Electron
    // persiste la cle au repos (DPAPI Windows, liee au compte utilisateur).
    cryptoHandler.registerCryptoHandlers();
    logToFile('[crypto-handler] Handlers IPC enregistres');

    // ---- Cache local des documents dechiffres (lot 4a — decryptedCache.js) ----
    // Init = creation du dossier + purge initiale (rattrape les fichiers
    // laisses apres un crash). Le sweep periodique (5 min) tourne ensuite
    // en arriere-plan jusqu'a la fermeture de l'app.
    try {
      decryptedCache.init();
      const stats = decryptedCache.getStats();
      logToFile('[decryptedCache] Initialise: ' + stats.cacheRoot + ' (TTL ' + stats.ttlHours + 'h)');
    } catch (err) {
      logToFile('[decryptedCache] Echec init: ' + err.message);
    }

    // ---- Handlers documents (compatibilité window.electron) ----

    ipcMain.handle('handle-document-creation', async (event, args) => {
        console.log('[IPC handle-document-creation] Reçu:', args);
        const { folderName, clientData, templateFileName, localFileName, templateCategory } = args;
        logToFile(`[IPC handle-document-creation] START folder="${folderName}" template="${templateFileName}" file="${localFileName}"`);
        if (!folderName || !clientData || !templateFileName || !localFileName) {
            logToFile(`[IPC handle-document-creation] BAD_REQUEST missing args`);
            return { success: false, error: "Données manquantes pour la création." };
        }
        try {
            await createDocumentForClient(folderName, clientData, templateFileName, localFileName, socketIoServer);
            logToFile(`[IPC handle-document-creation] OK file="${localFileName}"`);
            return { success: true };
        } catch (error) {
            console.error("[IPC handle-document-creation] Erreur:", error);
            logToFile(`[IPC handle-document-creation] ERROR file="${localFileName}" msg="${error.message}"`);
            return { success: false, error: error.message || "Erreur lors de la création du document." };
        }
    });

    ipcMain.handle('handle-blank-document-creation', async (event, args) => {
        console.log('[IPC handle-blank-document-creation] Reçu:', args);
        const { docId, fileName } = args;
        if (!docId || !fileName) {
            return { success: false, error: "docId ou fileName manquant." };
        }

        // Garde chiffrement E2E (audit S25 #1, D1) : refus si cabinet protégé
        // + verrouillé — pour ne pas créer de document en clair sans avertir.
        const cryptoHandler = require('./crypto-handler');
        if (cryptoHandler.shouldEncrypt() && !cryptoHandler.isUnlocked()) {
            return {
                success: false,
                error: 'Cabinet verrouille : deverrouillez votre cabinet (saisissez votre phrase secrete) avant de creer un document.',
            };
        }

        try {
            const blankTemplatePath = isPackaged
                ? path.join(process.resourcesPath, 'templates', 'blank.docx')
                : path.resolve(__dirname, 'templates', 'blank.docx');

            if (!fs.existsSync(blankTemplatePath)) {
                return { success: false, error: "Template vierge introuvable: " + blankTemplatePath };
            }

            const filesClientsRoot = getFilesClientsRoot();
            const docFolder = path.join(filesClientsRoot, docId);
            if (!fs.existsSync(docFolder)) {
                fs.mkdirSync(docFolder, { recursive: true });
            }

            const targetPath = path.join(docFolder, fileName);
            fs.copyFileSync(blankTemplatePath, targetPath);
            console.log('[IPC handle-blank-document-creation] Fichier copié:', targetPath);

            await shell.openPath(targetPath);
            console.log('[IPC handle-blank-document-creation] Ouvert dans Word.');

            // Upload vers Google Drive en arrière-plan (audit S25 #1 :
            // passe par uploadFileToCloud qui applique le chiffrement .kbox
            // automatiquement si la protection est active).
            try {
                const authClient = authService.getGoogleAuthClient();
                if (authClient) {
                    googleDriveService.init(authClient);
                    const filesClientsId = await googleDriveService.ensureFolder("Files_Clients", 'root');
                    const cloudFolderId = await googleDriveService.ensureFolder(docId, filesClientsId);
                    const { uploadFileToCloud } = require('./services/localFileWatcher');
                    await uploadFileToCloud(targetPath, fileName, cloudFolderId);
                    console.log('[IPC handle-blank-document-creation] Uploadé sur Google Drive.');
                }
            } catch (uploadErr) {
                console.warn("[IPC] Upload Google Drive échoué:", uploadErr.message);
            }

            return { success: true, localPath: targetPath };
        } catch (error) {
            console.error("[IPC handle-blank-document-creation] Erreur:", error);
            return { success: false, error: error.message || "Erreur lors de la création du document vierge." };
        }
    });

    ipcMain.handle('handle-document-rename', async (event, args) => {
        const { docId, oldFileName, newFileName } = args;
        console.log(`[IPC handle-document-rename] docId=${docId}, old="${oldFileName}" -> new="${newFileName}"`);
        logToFile(`[IPC handle-document-rename] START docId=${docId} old="${oldFileName}" new="${newFileName}"`);
        if (!docId || !oldFileName || !newFileName) {
            logToFile(`[IPC handle-document-rename] BAD_REQUEST missing args`);
            return { success: false, error: "Paramètres manquants (docId, oldFileName, newFileName)." };
        }
        if (oldFileName === newFileName) {
            logToFile(`[IPC handle-document-rename] NOOP same name`);
            return { success: true };
        }
        try {
            const filesClientsRoot = getFilesClientsRoot();
            const docFolder = path.join(filesClientsRoot, docId);
            const oldPath = path.join(docFolder, oldFileName);
            const newPath = path.join(docFolder, newFileName);

            if (fs.existsSync(oldPath)) {
                if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
                fs.renameSync(oldPath, newPath);
                console.log(`[IPC handle-document-rename] Fichier local renommé: "${oldFileName}" -> "${newFileName}"`);

                // Marquer comme récemment uploadé pour éviter que le watcher re-uploade
                const { markAsRecentlyUploaded } = require('./services/localFileWatcher');
                markAsRecentlyUploaded(newPath);

                // Renommer sur Google Drive — chercher dans le BON dossier parent
                try {
                    const authClient = authService.getGoogleAuthClient();
                    if (authClient) {
                        googleDriveService.init(authClient);
                        // 1. Résoudre le dossier parent : Files_Clients/{docId}
                        const filesClientsId = await googleDriveService.ensureFolder("Files_Clients", 'root');
                        const docFolderId = await googleDriveService.findItemByNameAndParent(docId, filesClientsId, true);
                        if (docFolderId) {
                            // 2. Chercher le fichier DANS le bon dossier
                            const parentId = docFolderId.id || docFolderId;
                            const existing = await googleDriveService.findItemByNameAndParent(oldFileName, parentId, false);
                            if (existing) {
                                await googleDriveService.renameItem(existing.id, newFileName);
                                console.log(`[IPC handle-document-rename] Google Drive renommé: "${oldFileName}" -> "${newFileName}"`);
                            } else {
                                console.warn(`[IPC handle-document-rename] Fichier "${oldFileName}" introuvable sur Google Drive dans Files_Clients/${docId}/`);
                            }
                        } else {
                            console.warn(`[IPC handle-document-rename] Dossier "${docId}" introuvable sur Google Drive`);
                        }
                    }
                } catch (renameErr) {
                    console.warn("[IPC] Rename Google Drive échoué:", renameErr.message);
                }

                logToFile(`[IPC handle-document-rename] OK docId=${docId} new="${newFileName}"`);
                return { success: true, newPath };
            } else {
                console.warn(`[IPC handle-document-rename] Fichier source introuvable: ${oldPath}`);
                logToFile(`[IPC handle-document-rename] WARN source missing path=${oldPath}`);
                return { success: true, warning: "Fichier source introuvable, renommage BDD uniquement." };
            }
        } catch (error) {
            console.error("[IPC handle-document-rename] Erreur:", error);
            logToFile(`[IPC handle-document-rename] ERROR docId=${docId} msg="${error.message}"`);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('handle-document-deletion', async (event, doc) => {
        console.log(`[IPC handle-document-deletion] Reçu pour doc: ${doc?._id} (${doc?.nomDocument || 'sans nom'})`);
        logToFile(`[IPC handle-document-deletion] START docId=${doc?._id} name="${doc?.nomDocument || ''}"`);
        if (!doc?._id) {
            logToFile(`[IPC handle-document-deletion] BAD_REQUEST missing _id`);
            return { success: false, error: "ID de document manquant." };
        }
        try {
            let driveDeleted = false;
            let localDeleted = false;

            // 1. Supprimer sur Google Drive
            try {
                const authClient = authService.getGoogleAuthClient();
                if (authClient) {
                    googleDriveService.init(authClient);
                    const filesClientsId = await googleDriveService.ensureFolder("Files_Clients", 'root');
                    const folderItem = await googleDriveService.findItemByNameAndParent(doc._id, filesClientsId, true);
                    if (folderItem) {
                        await googleDriveService.deleteFileOrFolder(folderItem.id || folderItem);
                        driveDeleted = true;
                        console.log(`[IPC handle-document-deletion] Google Drive: dossier ${doc._id} supprimé`);
                    } else {
                        console.warn(`[IPC handle-document-deletion] Google Drive: dossier ${doc._id} introuvable (peut-être déjà supprimé)`);
                    }
                }
            } catch (driveErr) {
                console.warn("[IPC handle-document-deletion] Google Drive échoué:", driveErr.message);
            }

            // 2. Supprimer localement
            const filesClientsRoot = getFilesClientsRoot();
            const localFolder = path.join(filesClientsRoot, doc._id);
            if (fs.existsSync(localFolder)) {
                fs.rmSync(localFolder, { recursive: true, force: true });
                localDeleted = true;
                console.log(`[IPC handle-document-deletion] Local: dossier ${localFolder} supprimé`);
            } else {
                console.warn(`[IPC handle-document-deletion] Local: dossier ${localFolder} introuvable (peut-être déjà supprimé)`);
            }

            console.log(`[IPC handle-document-deletion] Résultat: Drive=${driveDeleted ? 'OK' : 'N/A'}, Local=${localDeleted ? 'OK' : 'N/A'}`);
            logToFile(`[IPC handle-document-deletion] OK docId=${doc._id} drive=${driveDeleted} local=${localDeleted}`);
            return { success: true };
        } catch (error) {
            console.error("[IPC handle-document-deletion] Erreur:", error);
            logToFile(`[IPC handle-document-deletion] ERROR docId=${doc?._id} msg="${error.message}"`);
            return { success: false, error: error.message || "Erreur lors de la suppression." };
        }
    });

    ipcMain.handle('handle-document-duplication', async (event, args) => {
        console.log('[IPC handle-document-duplication] Reçu:', args);
        const { oldDoc, newDoc } = args;
        logToFile(`[IPC handle-document-duplication] START oldId=${oldDoc?._id} newId=${newDoc?._id} name="${newDoc?.nomDocument || ''}"`);
        if (!oldDoc?._id || !newDoc?._id || !newDoc.nomDocument) {
            logToFile(`[IPC handle-document-duplication] BAD_REQUEST invalid args`);
            return { success: false, error: "Données invalides pour la duplication." };
        }

        // Garde chiffrement E2E (audit S25 #1, D1) : refus si cabinet protégé
        // + verrouillé — pour ne pas dupliquer en clair des documents protégés.
        const cryptoHandler = require('./crypto-handler');
        if (cryptoHandler.shouldEncrypt() && !cryptoHandler.isUnlocked()) {
            return {
                success: false,
                error: 'Cabinet verrouille : deverrouillez votre cabinet (saisissez votre phrase secrete) avant de dupliquer un document.',
            };
        }
        const filesClientsRoot = getFilesClientsRoot();
        const oldFolder = path.join(filesClientsRoot, oldDoc._id);
        const newFolder = path.join(filesClientsRoot, newDoc._id);
        if (!fs.existsSync(oldFolder)) {
            logToFile(`[IPC handle-document-duplication] SOURCE_MISSING ${oldFolder}`);
            return { success: false, error: "Dossier source introuvable." };
        }
        try {
            copyFolderRecursiveSync(oldFolder, newFolder);

            // Upload vers Google Drive (audit S25 #1 : passe par
            // uploadFileToCloud → chiffrement .kbox automatique si protégé).
            try {
                const authClient = authService.getGoogleAuthClient();
                if (authClient) {
                    googleDriveService.init(authClient);
                    const filesClientsId = await googleDriveService.ensureFolder("Files_Clients", 'root');
                    const cloudFolderId = await googleDriveService.ensureFolder(newDoc._id, filesClientsId);
                    const { uploadFileToCloud } = require('./services/localFileWatcher');
                    const filesInFolder = fs.readdirSync(newFolder).filter(f => !f.startsWith('.'));
                    for (const file of filesInFolder) {
                        const filePath = path.join(newFolder, file);
                        await uploadFileToCloud(filePath, file, cloudFolderId);
                    }
                }
            } catch (uploadErr) {
                console.warn("[IPC] Upload duplication Google Drive échoué:", uploadErr.message);
            }

            logToFile(`[IPC handle-document-duplication] OK oldId=${oldDoc._id} newId=${newDoc._id}`);
            return { success: true };
        } catch (error) {
            console.error("[IPC handle-document-duplication] Erreur:", error);
            logToFile(`[IPC handle-document-duplication] ERROR newId=${newDoc?._id} msg="${error.message}"`);
            return { success: false, error: error.message || "Erreur lors de la duplication." };
        }
    });

    ipcMain.handle('handle-file-drop', async (event, dossierId, token, fileName, filePath) => {
        console.log(`[IPC handle-file-drop] Reçu: dossierId=${dossierId}, fileName=${fileName}`);
        if (!dossierId || !token || !fileName || !filePath) {
            return { success: false, error: "Données manquantes pour traiter le fichier déposé." };
        }

        // Garde chiffrement E2E (audit S25 #1, D1) : refus si cabinet protégé
        // + verrouillé — pour ne pas déposer en clair un fichier sensible.
        const cryptoHandler = require('./crypto-handler');
        if (cryptoHandler.shouldEncrypt() && !cryptoHandler.isUnlocked()) {
            return {
                success: false,
                error: 'Cabinet verrouille : deverrouillez votre cabinet (saisissez votre phrase secrete) avant de deposer un fichier.',
            };
        }

        try {
            const backendUrl = `${SERVER_URL}/api/fusion/createDroppedDocumentMetadata`;
            const config = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
            const metadataResponse = await axios.post(backendUrl, { dossierId, originalFileName: fileName }, config);
            const newDocMetadata = metadataResponse.data.doc;
            if (!newDocMetadata || !newDocMetadata._id) {
                return { success: false, error: "Impossible de créer les métadonnées du document." };
            }

            // Upload vers Google Drive (audit S25 #1 : passe par
            // uploadFileToCloud → chiffrement .kbox automatique si protégé).
            try {
                const authClient = authService.getGoogleAuthClient();
                if (authClient) {
                    googleDriveService.init(authClient);
                    const filesClientsId = await googleDriveService.ensureFolder("Files_Clients", 'root');
                    const cloudFolderId = await googleDriveService.ensureFolder(newDocMetadata._id, filesClientsId);
                    const { uploadFileToCloud } = require('./services/localFileWatcher');
                    await uploadFileToCloud(filePath, fileName, cloudFolderId);
                }
            } catch (uploadErr) {
                console.warn("[IPC] Upload Google Drive échoué:", uploadErr.message);
            }

            return { success: true, doc: newDocMetadata };
        } catch (error) {
            console.error("[IPC handle-file-drop] Erreur:", error.response?.data || error.message);
            return { success: false, error: error.response?.data?.message || error.message || "Erreur lors du traitement du fichier." };
        }
    });

    ipcMain.handle('open-document', async (event, doc, options) => {
        console.log(`[IPC open-document] Reçu pour doc:`, doc?._id);
        if (!doc || !doc._id || !doc.nomDocument) {
            return { success: false, error: "Données document invalides." };
        }
        try {
            const result = await openDocument(doc);
            // Si l'ouverture a réussi ET qu'on a un JWT (passé par le React),
            // on démarre la surveillance de la fermeture. Quand l'utilisateur
            // ferme Word/Excel/etc., le watcher libère automatiquement le verrou
            // côté serveur central pour les autres utilisateurs.
            if (result && result.localFilePath && options && options.jwtToken) {
                try {
                    documentLockWatcher.track({
                        docId: result.docId,
                        localFilePath: result.localFilePath,
                        jwtToken: options.jwtToken,
                        serverUrl: SERVER_URL,
                    });
                } catch (watchErr) {
                    // Le watcher est best-effort : si on n'arrive pas à le démarrer,
                    // l'ouverture du document reste réussie. Le serveur expirera le
                    // verrou tout seul après 90s sans heartbeat (filet de sécurité).
                    console.warn('[IPC open-document] Démarrage watcher de fermeture impossible:', watchErr.message);
                }
            }
            return { success: true };
        } catch (error) {
            console.error(`[IPC open-document] Erreur:`, error);
            return { success: false, error: error.message || "Erreur lors de l'ouverture." };
        }
    });

    ipcMain.handle('download-document', async (event, doc) => {
        console.log(`[IPC download-document] Reçu pour doc:`, doc?._id, doc?.nomDocument);
        if (!doc || !doc._id || !doc.nomDocument) {
            return { success: false, error: "Données document invalides." };
        }
        try {
            const rootPath = configManager.getLocalRootPath();
            if (!rootPath) {
                return { success: false, error: "Chemin local non configuré." };
            }
            const docId = doc._id.toString();
            const localPath = path.join(rootPath, docId, doc.subfolderName || '', doc.nomDocument);

            if (!fs.existsSync(localPath)) {
                return { success: false, error: "Fichier introuvable localement." };
            }

            const result = await dialog.showSaveDialog({
                defaultPath: doc.nomDocument,
                filters: [{ name: 'Fichiers texte', extensions: ['txt'] }],
            });

            if (result.canceled || !result.filePath) {
                return { success: false, error: 'cancelled' };
            }

            await fs.promises.copyFile(localPath, result.filePath);
            console.log(`[IPC download-document] Fichier copié vers: ${result.filePath}`);
            return { success: true };
        } catch (error) {
            console.error(`[IPC download-document] Erreur:`, error);
            return { success: false, error: error.message || "Erreur lors du téléchargement." };
        }
    });

    // Drag inter-app natif OS : permet de glisser un document Kheops vers une
    // autre application (ChatGPT desktop, Claude desktop, navigateur sur
    // chatgpt.com/claude.ai, Slack, Word, Explorer Windows, etc.). L'OS prend
    // en charge le ghost cursor et le drop. Contraintes Electron :
    //  1. Doit être appelé en réponse à un dragstart user-initiated.
    //  2. L'icône DOIT être un nativeImage non-vide (sinon échec silencieux
    //     sur Windows + macOS strict). On embed un PNG 32x32 inline pour
    //     garantir une icône valide quel que soit le bundling.
    const DRAG_ICON_PNG_BASE64 =
        'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABZ0lEQVRYhe2YsUrDUBSGv9' +
        'ImpaWLLh3EwUVwcHFwEIeCk4Ovo7g4uPgGPoCDg4ODiy8gIvgKLg6CCG7iIDi4dFAJpJBC' +
        'Y0zOuTfNdf2H5OZyc/9z/3/uTW6Iiqio+EuoVlJVVbvAFugBXSAA3oA34BV4UVU9M/Hyhr' +
        'pAH7gAhsAYmABKIAUS4Bm4BzZNvLygqnpAH3gC5kCmqicDvQOCM/v6oepqj5wDvwAaaG7' +
        'i/5XDvwsi+E3oKhVVT2gB8yAEeBs4BQYAFvAKzCjqjogr6e87Wz1B9gFrlR1fFLfmULVt' +
        'lCoCw+B9bz9aoetQXfKqzwQIPyR4Nf4bLD8NRRP4LD/JSC4tj6xvPRJX0SKMnKp6Ag6BC' +
        '+vJWcCkFlgLLh+UoqobAGfA6mLg2hLgjGRUVa1V9R34tqxvLyvAKvACDPLIoF24g58sGv' +
        'q23F8fTBtbAsKv+SeUiaVXFRURv8gPLNeyP56C5VsAAAAASUVORK5CYII=';

    let cachedDragIcon = null;
    function getDragIcon() {
        if (cachedDragIcon && !cachedDragIcon.isEmpty()) return cachedDragIcon;
        const { nativeImage } = require('electron');

        // Tentative 1 : icon.ico de l'app (embarqué via files:["electron-app/**/*"]
        // dans electron-builder.json). Sur Windows, .ico contient plusieurs
        // résolutions, on resize en 32x32 pour que Windows accepte le drag.
        try {
            const iconPath = path.join(__dirname, 'icon.ico');
            const img = nativeImage.createFromPath(iconPath);
            if (img && !img.isEmpty()) {
                const resized = img.resize({ width: 32, height: 32, quality: 'best' });
                const final = resized && !resized.isEmpty() ? resized : img;
                cachedDragIcon = final;
                logToFile(`[start-file-drag] icon loaded from ${iconPath} size=${JSON.stringify(final.getSize())}`);
                return final;
            }
            logToFile(`[start-file-drag] icon.ico empty after createFromPath, path=${iconPath}`);
        } catch (e) {
            logToFile(`[start-file-drag] icon.ico load failed: ${e.message}`);
        }

        // Tentative 2 : PNG base64 inline (fallback legacy)
        try {
            const buf = Buffer.from(DRAG_ICON_PNG_BASE64, 'base64');
            const img = nativeImage.createFromBuffer(buf);
            if (img && !img.isEmpty()) {
                cachedDragIcon = img;
                logToFile(`[start-file-drag] icon loaded from inline PNG size=${JSON.stringify(img.getSize())}`);
                return img;
            }
            logToFile(`[start-file-drag] inline PNG decoded as empty image`);
        } catch (e) {
            logToFile(`[start-file-drag] inline PNG decode failed: ${e.message}`);
        }

        // Dernier recours : empty (startDrag échouera silencieusement)
        return nativeImage.createEmpty();
    }

    ipcMain.on('start-file-drag', (event, doc) => {
        logToFile(`[start-file-drag] CALL doc._id=${doc?._id} nomDocument=${doc?.nomDocument} subfolderName=${doc?.subfolderName}`);
        if (!doc || !doc._id || !doc.nomDocument) {
            logToFile(`[start-file-drag] ABORT doc invalide`);
            event.sender.send('start-file-drag:result', { success: false, error: 'invalid-doc', docId: doc?._id });
            return;
        }
        try {
            const rootPath = configManager.getLocalRootPath();
            if (!rootPath) {
                logToFile(`[start-file-drag] ABORT rootPath non configuré`);
                event.sender.send('start-file-drag:result', { success: false, error: 'no-root-path', docId: doc._id });
                return;
            }
            const docId = doc._id.toString();
            const localPath = path.join(rootPath, docId, doc.subfolderName || '', doc.nomDocument);
            const exists = fs.existsSync(localPath);
            logToFile(`[start-file-drag] localPath=${localPath} exists=${exists}`);
            let pathToUse = null;
            if (exists) {
                pathToUse = localPath;
            } else {
                const altPath = path.join(rootPath, docId, doc.nomDocument);
                const altExists = fs.existsSync(altPath);
                logToFile(`[start-file-drag] altPath (no subfolder)=${altPath} exists=${altExists}`);
                if (altExists) {
                    pathToUse = altPath;
                } else {
                    logToFile(`[start-file-drag] ABORT fichier introuvable ni à ${localPath} ni à ${altPath}`);
                    // Tentative de téléchargement Cloud automatique en arrière-plan.
                    // L'utilisateur retentera le drag dans quelques secondes ; le toast
                    // côté renderer reflète ce statut "fetching".
                    let autoFetching = false;
                    try {
                        const { downloadFileFromCloud } = require('./services/docUtils');
                        const remoteFilePath = doc.subfolderName
                            ? `Files_Clients/${docId}/${doc.subfolderName}/${doc.nomDocument}`
                            : `Files_Clients/${docId}/${doc.nomDocument}`;
                        const localDir = doc.subfolderName
                            ? path.join(rootPath, docId, doc.subfolderName)
                            : path.join(rootPath, docId);
                        autoFetching = true;
                        logToFile(`[start-file-drag] AUTO-FETCH lance : ${remoteFilePath} -> ${localDir}`);
                        downloadFileFromCloud(remoteFilePath, localDir, doc.nomDocument)
                            .then(() => {
                                logToFile(`[start-file-drag] AUTO-FETCH OK : ${doc.nomDocument} disponible localement.`);
                                event.sender.send('start-file-drag:result', {
                                    success: false,
                                    error: 'file-fetched',
                                    docId: doc._id,
                                    nomDocument: doc.nomDocument,
                                });
                            })
                            .catch((err) => {
                                logToFile(`[start-file-drag] AUTO-FETCH KO : ${err.message}`);
                                event.sender.send('start-file-drag:result', {
                                    success: false,
                                    error: 'file-missing-no-cloud',
                                    docId: doc._id,
                                    nomDocument: doc.nomDocument,
                                    message: err.message,
                                });
                            });
                    } catch (e) {
                        logToFile(`[start-file-drag] AUTO-FETCH dispatch echec : ${e.message}`);
                    }
                    event.sender.send('start-file-drag:result', {
                        success: false,
                        error: autoFetching ? 'file-missing-fetching' : 'file-missing',
                        docId: doc._id,
                        nomDocument: doc.nomDocument,
                    });
                    return;
                }
            }
            const dragIcon = getDragIcon();
            logToFile(`[start-file-drag] startDrag(file=${pathToUse}, iconEmpty=${dragIcon.isEmpty()}, iconSize=${JSON.stringify(dragIcon.getSize())})`);
            event.sender.startDrag({ file: pathToUse, icon: dragIcon });
            logToFile(`[start-file-drag] startDrag returned`);
            event.sender.send('start-file-drag:result', { success: true, docId: doc._id });
        } catch (err) {
            logToFile(`[start-file-drag] EXCEPTION: ${err.message}`);
            event.sender.send('start-file-drag:result', { success: false, error: 'exception', message: err.message, docId: doc?._id });
        }
    });

    // Logging depuis le renderer vers crash-log.txt (pour debug drag-and-drop
    // et tout autre flux côté UI où DevTools n'est pas pratique).
    ipcMain.on('log-renderer', (_event, message) => {
        try {
            logToFile(`[renderer] ${typeof message === 'string' ? message : JSON.stringify(message)}`);
        } catch (e) {
            logToFile(`[renderer] (log failed: ${e.message})`);
        }
    });

    // Reçoit le contexte user Kheops depuis le renderer après le login backend.
    // L'email du compte cloud est connu dès l'OAuth, mais le userId Kheops
    // (ObjectId MongoDB) n'est connu qu'après l'échange JWT côté serveur.
    // Cet IPC permet au renderer de transmettre le userId au main process,
    // qui peut alors basculer l'isolation locale sur `<basePath>/<userId>/`
    // (au lieu de `<basePath>/<email_cloud>/`) et lancer la migration des
    // fichiers depuis l'ancien layout email vers le layout userId.
    //
    // Voir configManager.setCurrentAccount + migrateToUserId pour les détails.
    ipcMain.on('set-user-context', (_event, payload) => {
        try {
            if (!payload || typeof payload !== 'object') {
                secLog('ELECTRON_SET_USER_CONTEXT_FAIL', { reason: 'payload-invalid' });
                return;
            }
            const { userId, email } = payload;
            if (!userId || typeof userId !== 'string' || !/^[a-f0-9]{24}$/i.test(userId)) {
                secLog('ELECTRON_SET_USER_CONTEXT_FAIL', { reason: `userId-invalid: ${userId}` });
                return;
            }
            const previousUserId = configManager.getCurrentUserId();
            const previousEmail = configManager.getCurrentAccount();
            secLog('ELECTRON_SET_USER_CONTEXT', {
                userId,
                email,
                extra: { previousUserId, previousEmail, switched: previousUserId && previousUserId !== userId },
            });
            configManager.setCurrentAccount({ email: email || configManager.getCurrentAccount(), userId });
            const basePath = configManager.getBaseRootPath();
            if (basePath) {
                configManager.migrateToUserId(basePath, userId, email || configManager.getCurrentAccount());
            }
            updateFilesClientsEnv();
            // Relancer le watcher sur le nouveau path user-isolé
            const newRootPath = configManager.getLocalRootPath();
            if (newRootPath) {
                try { localFileWatcher.restartWatcher(newRootPath); }
                catch (e) { logToFile(`[set-user-context] restartWatcher KO: ${e.message}`); }
            }
        } catch (err) {
            secLog('ELECTRON_SET_USER_CONTEXT_FAIL', { reason: `exception: ${err.message}` });
        }
    });

    // Détecte si un filePath (issu de dataTransfer.files[0].path lors d'un drop)
    // pointe vers un fichier déjà géré par Kheops sous rootPath. Permet au
    // renderer de distinguer un drop interne (move) d'un drop externe (upload)
    // quand le drag native OS est utilisé pour les deux flux.
    ipcMain.handle('is-kheops-local-path', async (_event, filePath) => {
        try {
            if (!filePath || typeof filePath !== 'string') return { isLocal: false };
            const rootPath = configManager.getLocalRootPath();
            if (!rootPath) return { isLocal: false };
            const normalizedRoot = path.normalize(rootPath);
            const normalizedFile = path.normalize(filePath);
            // Comparaison case-insensitive sur Windows
            const rootLow = normalizedRoot.toLowerCase();
            const fileLow = normalizedFile.toLowerCase();
            const sep = path.sep.toLowerCase();
            const rootWithSep = rootLow.endsWith(sep) ? rootLow : rootLow + sep;
            if (!fileLow.startsWith(rootWithSep)) return { isLocal: false };
            // Structure attendue : rootPath/<docId>/[<subfolderName>/]<fileName>
            const relative = normalizedFile.slice(normalizedRoot.length).replace(/^[\\/]+/, '');
            const segments = relative.split(/[\\/]+/);
            if (segments.length < 2) return { isLocal: false };
            const docId = segments[0];
            // docId attendu = ObjectId 24 hex
            if (!/^[a-f0-9]{24}$/i.test(docId)) return { isLocal: false };
            const subfolderName = segments.length > 2 ? segments[1] : null;
            return { isLocal: true, docId, subfolderName };
        } catch (err) {
            logToFile(`[is-kheops-local-path] EXCEPTION: ${err.message}`);
            return { isLocal: false };
        }
    });

    ipcMain.handle('clean-files-clients', async () => {
        console.log('[IPC clean-files-clients] Nettoyage Files_Clients (local + Google Drive)...');
        const results = { driveDeleted: 0, driveFailed: 0, localDeleted: 0, localFailed: 0 };
        try {
            // 1. Nettoyage Google Drive
            const authClient = authService.getGoogleAuthClient();
            if (authClient) {
                googleDriveService.init(authClient);
                const filesClientsId = await googleDriveService.ensureFolder("Files_Clients", 'root');
                const children = await googleDriveService.listChildren(filesClientsId, 'id, name, mimeType');
                console.log(`[clean-files-clients] ${children.length} éléments trouvés dans Files_Clients sur Drive`);

                for (const child of children) {
                    if (child.name === 'Templates') {
                        console.log(`[clean-files-clients] Drive: Templates conservé (ID: ${child.id})`);
                        continue;
                    }
                    try {
                        await googleDriveService.deleteFileOrFolder(child.id);
                        results.driveDeleted++;
                    } catch (err) {
                        console.error(`[clean-files-clients] Drive: Échec suppression "${child.name}":`, err.message);
                        results.driveFailed++;
                    }
                }
                console.log(`[clean-files-clients] Drive: ${results.driveDeleted} supprimés, ${results.driveFailed} échecs`);
            } else {
                console.warn('[clean-files-clients] Pas de client Google Auth, nettoyage Drive ignoré');
            }

            // 2. Nettoyage local
            const filesClientsRoot = getFilesClientsRoot();
            if (fs.existsSync(filesClientsRoot)) {
                const entries = fs.readdirSync(filesClientsRoot, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name === 'Templates') continue;
                    const entryPath = path.join(filesClientsRoot, entry.name);
                    try {
                        if (entry.isDirectory()) {
                            fs.rmSync(entryPath, { recursive: true, force: true });
                        } else {
                            fs.unlinkSync(entryPath);
                        }
                        results.localDeleted++;
                    } catch (err) {
                        console.error(`[clean-files-clients] Local: Échec suppression "${entry.name}":`, err.message);
                        results.localFailed++;
                    }
                }
                console.log(`[clean-files-clients] Local: ${results.localDeleted} supprimés, ${results.localFailed} échecs`);
            }

            return { success: true, results };
        } catch (error) {
            console.error('[IPC clean-files-clients] Erreur:', error);
            return { success: false, error: error.message, results };
        }
    });

    ipcMain.handle('open-external', async (event, url) => {
        console.log(`[IPC open-external] Ouverture dans le navigateur: ${url}`);
        try {
            await shell.openExternal(url);
            return { success: true };
        } catch (error) {
            console.error("[IPC open-external] Erreur:", error);
            return { success: false, error: error.message };
        }
    });

    // --- Handler IPC 'auth-ready' : le React a terminé l'authentification ---
    // GoogleCallbackHandler envoie cet événement quand loadUser() a réussi.
    // v8 : Si un deep link auth a été traité, on relance la synchro Drive ici
    // (le startup init chain a été abandonné pour éviter les race conditions).
    ipcMain.on('auth-ready', () => {
        console.log("[IPC auth-ready] ✅ React signale que l'authentification est prête !");
        logToFile("[IPC auth-ready] Authentification prête. deepLinkAuthProcessed=" + deepLinkAuthProcessed);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.focus();
            console.log("[IPC auth-ready] ✅ Focus appliqué.");
        } else {
            console.error("[IPC auth-ready] ❌ mainWindow n'est pas disponible !");
        }

        // Si un deep link a été traité, relancer la synchro cloud proprement
        // avec un délai pour laisser le dashboard se stabiliser.
        // BRANCHEMENT : selon `lastDeepLinkSource`, on initialise soit Google
        // Drive (existant) soit OneDrive (nouveau).
        if (deepLinkAuthProcessed) {
            console.log(`[IPC auth-ready] Deep link auth détecté (source=${lastDeepLinkSource}) — relance synchro cloud immédiate...`);
            logToFile(`[IPC auth-ready] Relance synchro cloud après deep link (source=${lastDeepLinkSource}).`);
            // 200ms suffisent pour laisser React monter SyncProgressModal et s'abonner
            // à l'event 'sync:progress' AVANT le premier emit. Avant : 3000ms (trop long).
            setTimeout(async () => {
                try {
                    if (lastDeepLinkSource === 'microsoft') {
                        // ─── BRANCHE MICROSOFT (OneDrive) ─────────────────────────────────
                        if (!lastDeepLinkToken) {
                            console.warn('[IPC auth-ready] Pas de JWT pour récupérer le refresh token Microsoft.');
                            return;
                        }
                        console.log('[IPC auth-ready] Récupération refresh_token Microsoft depuis le backend...');
                        const response = await axios.get(`${SERVER_URL}/api/auth/microsoft/get-refresh-token`, {
                            headers: { Authorization: `Bearer ${lastDeepLinkToken}` }
                        });
                        const refreshToken = response.data && response.data.refreshToken;
                        if (!refreshToken) {
                            console.warn('[IPC auth-ready] Aucun refresh_token Microsoft retourné.');
                            return;
                        }
                        await microsoftAuthService.initFromRefreshToken(refreshToken);
                        oneDriveService.init(() => microsoftAuthService.getServerAccessToken());
                        console.log('[IPC auth-ready] ✅ OneDrive initialisé depuis refresh_token serveur.');

                        // Profil → compte actif (isolation par email)
                        try {
                            const profile = await microsoftAuthService.getServerProfile();
                            if (profile && profile.email) {
                                configManager.setCurrentAccount(profile.email);
                                configManager.migrateIfNeeded(configManager.getBaseRootPath(), profile.email);
                                updateFilesClientsEnv();
                            }
                        } catch (pErr) {
                            console.warn('[IPC auth-ready] Récupération profil Microsoft échouée:', pErr.message);
                        }

                        // Structure de base sur OneDrive
                        try {
                            console.log('[IPC auth-ready] Vérification structure OneDrive...');
                            await oneDriveService.ensureBaseStructure();
                            console.log('[IPC auth-ready] Structure OneDrive OK.');
                        } catch (e) {
                            console.error('[IPC auth-ready] Erreur ensureBaseStructure OneDrive:', e.message);
                        }

                        // Watcher + pull initial + polling
                        const localPath = configManager.getLocalRootPath();
                        if (localPath) {
                            console.log(`[IPC auth-ready] Démarrage watcher sur: ${localPath}`);
                            localFileWatcher.restartWatcher(localPath);
                        }
                        try {
                            console.log('[IPC auth-ready] Premier pull OneDrive → Local...');
                            await localFileWatcher.pullFromDrive();
                        } catch (e) {
                            console.error('[IPC auth-ready] Erreur premier pull OneDrive:', e.message);
                        }
                        localFileWatcher.startPullPolling(60000);
                        console.log('[IPC auth-ready] ✅ Synchro OneDrive relancée.');
                        return;
                    }

                    // ─── BRANCHE GOOGLE (existante, inchangée) ────────────────────────
                    let client = authService.getGoogleAuthClient();
                    if (!client && lastDeepLinkToken) {
                        console.log('[IPC auth-ready] Pas de client Google Auth — récupération du refresh_token depuis le backend...');
                        try {
                            const response = await axios.get(`${SERVER_URL}/api/auth/google/get-refresh-token`, {
                                headers: { Authorization: `Bearer ${lastDeepLinkToken}` }
                            });
                            const refreshToken = response.data && response.data.refreshToken;
                            if (refreshToken) {
                                client = await authService.initGoogleAuthFromRefreshToken(
                                    refreshToken,
                                    process.env.GOOGLE_CLIENT_ID,
                                    process.env.GOOGLE_CLIENT_SECRET
                                );
                                if (client) console.log('[IPC auth-ready] ✅ Client Google initialisé depuis le refresh_token du backend.');
                            }
                        } catch (fetchErr) {
                            console.error('[IPC auth-ready] Erreur récupération refresh_token:', fetchErr.message);
                        }
                    }

                    if (client) {
                        googleDriveService.init(client);
                        const profile = await authService.getUserInfo();
                        if (profile && profile.email) {
                            configManager.setCurrentAccount(profile.email);
                            // Symétrie avec la branche Microsoft : migrer le layout plat
                            // vers le sous-dossier du compte si nécessaire.
                            configManager.migrateIfNeeded(configManager.getBaseRootPath(), profile.email);
                            updateFilesClientsEnv();
                        }
                        try {
                            await googleDriveService.ensureBaseStructure();
                        } catch (structErr) {
                            console.error('[IPC auth-ready] Erreur ensureBaseStructure:', structErr.message);
                        }
                        const localPath = configManager.getLocalRootPath();
                        if (localPath) localFileWatcher.restartWatcher(localPath);
                        await localFileWatcher.pullFromDrive();
                        localFileWatcher.startPullPolling(60000);
                        console.log('[IPC auth-ready] ✅ Synchro Drive relancée avec succès.');
                    } else {
                        console.warn('[IPC auth-ready] Pas de client Google Auth disponible.');
                    }
                } catch (err) {
                    console.error('[IPC auth-ready] Erreur relance synchro cloud:', err.message);
                    logToFile('[IPC auth-ready] Erreur synchro: ' + err.message);
                }
            }, 200);
        }
    });

    console.log("[Electron App] Tous les handlers IPC enregistrés.");

    // --- 4.5 : Créer la fenêtre ---
    createWindow();

    // --- 4.6 : Initialiser Google Drive puis le file watcher ---
    // NOTE : Le watcher est démarré APRÈS l'auth pour connaître le compte actif
    //        et utiliser le bon sous-dossier (isolation par compte).
    //
    // IMPORTANT : on appelle initGoogleAuth en MODE SILENCIEUX au démarrage.
    // Si un token Google a déjà été sauvegardé (utilisateur déjà connecté
    // précédemment), on le réutilise pour relancer la synchro Drive sans
    // intervention. Sinon, on retourne null et on laisse l'utilisateur
    // choisir librement son mode de connexion (email/password, Google ou
    // Microsoft) sur l'écran de login. La connexion Google ne doit JAMAIS
    // être déclenchée sans clic explicite de l'utilisateur.
    console.log('[Main] Tentative de chargement silencieux d\'une session Google sauvegardée...');
    authService.initGoogleAuth({ interactive: false })
        .then(async (client) => {
            if (client) {
                console.log('[Main] Google Auth initialisé avec succès. Initialisation Drive...');
                googleDriveService.init(client);

                // Isolation par compte : récupérer l'email et définir le compte actif
                try {
                    const profile = await authService.getUserInfo();
                    if (profile && profile.email) {
                        configManager.setCurrentAccount(profile.email);
                        configManager.migrateIfNeeded(configManager.getBaseRootPath(), profile.email);
                        updateFilesClientsEnv();
                    }
                } catch (err) {
                    console.warn('[Main] Impossible de récupérer le profil utilisateur:', err.message);
                }

                try {
                    console.log('[Main] Appel de ensureBaseStructure()...');
                    const result = await googleDriveService.ensureBaseStructure();
                    console.log('[Main] ensureBaseStructure() terminé avec succès:', JSON.stringify(result));
                } catch (err) {
                    console.error('[Main] ERREUR ensureBaseStructure():', err.message, err.stack);
                }

                // Vérifier si un deep link auth a été traité entre-temps.
                // Si oui, on ABANDONNE le watcher/pull car le compte est en train de changer.
                // Le handler IPC auth-ready relancera tout proprement.
                if (deepLinkAuthProcessed) {
                    console.log('[Main] ⏭ Deep link auth en cours — watcher/pull startup ABANDONNÉ.');
                    console.log('[Main] Le IPC auth-ready relancera la synchro après authentification.');
                    logToFile('[Startup Init] Abandonné: deepLinkAuthProcessed=true');
                } else {
                    // Démarrer le watcher sur le chemin du compte actif
                    const localPath = configManager.getLocalRootPath();
                    if (localPath) {
                        console.log(`[Main] Chemin local configuré (avec compte) : ${localPath}`);
                        localFileWatcher.watchFilesClientsFolder(localPath);
                    }

                    // --- Synchro Drive → Local : premier pull puis polling toutes les 60s ---
                    try {
                        console.log('[Main] Premier pull Drive → Local...');
                        await localFileWatcher.pullFromDrive();
                        console.log('[Main] Premier pull terminé.');
                    } catch (pullErr) {
                        console.error('[Main] Erreur premier pull:', pullErr.message);
                    }
                    localFileWatcher.startPullPolling(60000);
                }
            } else {
                console.log('[Main] initGoogleAuth() a retourné null — pas de client.');
                // Pas d'auth : démarrer le watcher sur le basePath comme fallback
                const localPath = configManager.getLocalRootPath();
                if (localPath) {
                    console.log(`[Main] Chemin local (sans compte) : ${localPath}`);
                    localFileWatcher.watchFilesClientsFolder(localPath);
                } else {
                    console.log('[Main] Aucun chemin local configuré.');
                }
            }
        })
        .catch((err) => {
            console.log('[Main] Pas de session Google active:', err.message);
            // Pas d'auth : démarrer le watcher sur le basePath comme fallback
            const localPath = configManager.getLocalRootPath();
            if (localPath) {
                console.log(`[Main] Chemin local (fallback) : ${localPath}`);
                localFileWatcher.watchFilesClientsFolder(localPath);
            } else {
                console.log('[Main] Aucun chemin local configuré.');
            }
        });

    // macOS : recréer la fenêtre si elle a été fermée
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    // Auto-update (electron-updater) : actif uniquement en build packagee.
    setupAutoUpdater();
});

// =============================================================================
// === SECTION 5 : GESTION DE LA FERMETURE
// =============================================================================

let isQuitting = false;
const cleanupAndQuit = (reason) => {
    const msg = `cleanupAndQuit(${reason || 'non spécifiée'}). isQuitting: ${isQuitting}`;
    console.log(`[Electron App] ${msg}`);
    logToFile(msg);
    if (isQuitting) {
        console.log('[Electron App] Déjà en cours de fermeture, ignoré.');
        return;
    }
    isQuitting = true;
    console.log('[Electron App] Fermeture en cours...');
    localFileWatcher.stopPullPolling();
    localFileWatcher.stopAllWatchers();
    documentLockWatcher.stopAll();
    // Cache plaintext (lot 4a) : purge finale + arret du sweep.
    // Les fichiers verrouilles par Word/Adobe seront eventuellement
    // ratrapes par la purge au demarrage suivant.
    try {
      const result = decryptedCache.shutdown();
      logToFile('[decryptedCache] Purge fermeture: ' + result.deleted + ' supprimes, ' + result.locked + ' encore verrouilles');
    } catch (err) {
      logToFile('[decryptedCache] Erreur purge fermeture: ' + err.message);
    }
    // Oublie la MasterKey en RAM (best-effort wipe).
    try { cryptoHandler.clearMasterKeyInMemory(); } catch (_) { /* ignore */ }
    if (localServer) {
        localServer.close();
    }
    app.quit();
    setTimeout(() => {
        console.warn('[Electron App] Fermeture forcée après timeout.');
        app.exit();
    }, 5000);
};

app.on("window-all-closed", () => {
    console.log("[Electron App] ⚠️ TOUTES LES FENÊTRES FERMÉES.");
    logToFile("[window-all-closed] isNavigatingDeepLink=" + isNavigatingDeepLink + " isQuitting=" + isQuitting);

    // NE PAS quitter si on est en pleine navigation deep link
    // (loadURL peut temporairement "fermer" la page pendant la transition)
    if (isNavigatingDeepLink) {
        console.log("[Electron App] → Navigation deep link en cours, on NE QUITTE PAS.");
        logToFile("[window-all-closed] → BLOQUÉ (isNavigatingDeepLink)");
        return;
    }

    if (process.platform !== "darwin") {
        console.log("[Electron App] → Appel cleanupAndQuit('window-all-closed')");
        logToFile("[window-all-closed] → cleanupAndQuit('window-all-closed')");
        cleanupAndQuit('window-all-closed');
    }
});

process.on('SIGINT', () => {
    console.log("[Electron App] SIGINT reçu !");
    cleanupAndQuit('SIGINT');
});
process.on('SIGTERM', () => {
    console.log("[Electron App] SIGTERM reçu !");
    cleanupAndQuit('SIGTERM');
});

app.on('before-quit', (event) => {
    console.log(`[Electron App] before-quit. isQuitting: ${isQuitting}, isNavigatingDeepLink: ${isNavigatingDeepLink}`);
    logToFile("[before-quit] isQuitting=" + isQuitting + " isNavigatingDeepLink=" + isNavigatingDeepLink);
    // NE PAS quitter si on est en pleine transition auth (loadURL en cours)
    if (!isQuitting && isNavigatingDeepLink) {
        console.log("[Electron App] before-quit → BLOQUÉ (isNavigatingDeepLink en cours).");
        logToFile("[before-quit] → BLOQUÉ (isNavigatingDeepLink)");
        event.preventDefault();
        return;
    }
    if (!isQuitting) {
        event.preventDefault();
        cleanupAndQuit('before-quit');
    }
});

// === DIAGNOSTIC FINAL : capturer TOUTE raison de sortie du processus ===
// v7 : Log AUSSI dans un fichier car stdout peut être perdu lors d'un crash natif
process.on('exit', (code) => {
    const msg = `[PROCESS EXIT] Code: ${code}. isQuitting: ${isQuitting}`;
    console.log(msg);
    logToFile(msg);
});

process.on('uncaughtException', (err) => {
    const msg = `[PROCESS] UNCAUGHT EXCEPTION: ${err.message}\n${err.stack}`;
    console.error(msg);
    logToFile(msg);
});

process.on('unhandledRejection', (reason, promise) => {
    const msg = `[PROCESS] UNHANDLED REJECTION: ${reason}`;
    console.error(msg);
    logToFile(msg);
});

app.on('render-process-gone', (event, webContents, details) => {
    const msg = `[Electron App] RENDER PROCESS GONE: ${details.reason} exitCode: ${details.exitCode}`;
    console.error(msg);
    logToFile(msg);
});

app.on('child-process-gone', (event, details) => {
    const msg = `[Electron App] CHILD PROCESS GONE: ${details.type} ${details.reason} exitCode: ${details.exitCode}`;
    console.error(msg);
    logToFile(msg);
});

// =============================================================================
// === SECTION 6 : GÉNÉRATION FICHIER ERREUR (FALLBACK)
// =============================================================================

try {
    const errorHtmlPath = path.join(__dirname, 'loadError.html');
    if (!fs.existsSync(errorHtmlPath)) {
        fs.writeFileSync(errorHtmlPath, `<!DOCTYPE html><html><head><title>Erreur</title></head><body><h1>Erreur de chargement</h1><p>L'application n'a pas pu démarrer.</p></body></html>`);
    }
} catch (e) {
    console.error("Impossible de créer le fichier loadError.html:", e);
}
