// server/services/chatLogger.js
//
// Logger persistant pour le chat. Écrit dans %APPDATA%\kheops-2\chat-debug.log
// (Windows) ou ~/.kheops2/chat-debug.log (Linux/Mac).
//
// Permet de diagnostiquer en production où l'on n'a pas accès à la console
// du serveur Express (mode packagé Electron). Le fichier est rotaté à 5 MB
// pour ne pas exploser le disque.

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 Mo

function resolveLogPath() {
    const userDataDir = process.env.APPDATA
        ? path.join(process.env.APPDATA, 'kheops-2')
        : path.join(os.homedir(), '.kheops2');
    try { fs.mkdirSync(userDataDir, { recursive: true }); } catch (_) {}
    return path.join(userDataDir, 'chat-debug.log');
}

const LOG_PATH = resolveLogPath();

function rotateIfNeeded() {
    try {
        const st = fs.statSync(LOG_PATH);
        if (st.size > MAX_LOG_BYTES) {
            fs.renameSync(LOG_PATH, LOG_PATH + '.old');
        }
    } catch (_) { /* fichier n'existe pas encore */ }
}

function log(...parts) {
    try {
        rotateIfNeeded();
        const ts = new Date().toISOString();
        const line = `[${ts}] ${parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ')}\n`;
        fs.appendFileSync(LOG_PATH, line);
    } catch (e) {
        console.warn('[chatLogger] write failed:', e && e.message);
    }
    // Console aussi (dev mode)
    console.log('[chat]', ...parts);
}

module.exports = { log, LOG_PATH };
