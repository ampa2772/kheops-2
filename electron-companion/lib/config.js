// electron-companion/lib/config.js
//
// Constantes partagees du compagnon mince. SOURCE DE VERITE cote Electron du
// contrat web <-> compagnon (doit rester aligne avec
// client/src/services/companion/companionClient.js).

const os = require('os');
const path = require('path');

// Port local. Le serveur ecoute UNIQUEMENT sur 127.0.0.1 (jamais 0.0.0.0).
const PORT = Number(process.env.KHEOPS_COMPANION_PORT) || 8080;
const BIND_HOST = '127.0.0.1';

// En-tetes du contrat.
const COMPANION_HEADER = 'x-kheops-companion';          // anti-CSRF (force le preflight)
const COMPANION_TOKEN_HEADER = 'x-kheops-companion-token';

// Origines WEB autorisees a piloter le compagnon. Un site tiers (Origin non
// liste) est refuse. Surcouchable via KHEOPS_ALLOWED_ORIGINS (CSV).
const DEFAULT_ALLOWED_ORIGINS = [
  'https://kheops-2-backend-16107185088.europe-west1.run.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];

function getAllowedOrigins() {
  const extra = String(process.env.KHEOPS_ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

// Dossier temporaire des .docx en cours d'edition (nettoye apres fermeture).
function getTempDir(app) {
  const base = (app && app.getPath) ? app.getPath('temp') : os.tmpdir();
  return path.join(base, 'kheops-companion');
}

// Heartbeat du verrou cote serveur (le serveur expire un verrou apres ~90s sans
// heartbeat — cf. documentLockService). On bat le coeur toutes les 30s.
const HEARTBEAT_INTERVAL_MS = 30_000;

// Anti-double-upload : ignore un re-trigger du watcher juste apres un upload.
const UPLOAD_DEBOUNCE_MS = 2000;

const APP_NAME = 'kheops-companion';

module.exports = {
  PORT,
  BIND_HOST,
  COMPANION_HEADER,
  COMPANION_TOKEN_HEADER,
  getAllowedOrigins,
  getTempDir,
  HEARTBEAT_INTERVAL_MS,
  UPLOAD_DEBOUNCE_MS,
  APP_NAME,
};
