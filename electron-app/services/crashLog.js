// electron-app/services/crashLog.js
//
// Centralise l'ecriture dans crash-log.txt pour permettre aux modules du
// process Electron main de tracer en prod (ou stdout est perdu).
//
// En mode packagee : %APPDATA%\kheops-2\crash-log.txt (via app.getPath('userData')).
// En mode dev      : <racine projet>/crash-log.txt
//
// Consomme par : main.js, services/fileUtils.js (et a venir si besoin).

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { redactSecrets } = require('./logRedaction');

const CRASH_LOG_PATH = app.isPackaged
    ? path.join(app.getPath('userData'), 'crash-log.txt')
    : path.join(__dirname, '..', '..', 'crash-log.txt');

function logToFile(message) {
    try {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(CRASH_LOG_PATH, `[${timestamp}] ${redactSecrets(message)}\n`);
    } catch (e) { /* ignore */ }
}

module.exports = { logToFile, CRASH_LOG_PATH, redactSecrets };
