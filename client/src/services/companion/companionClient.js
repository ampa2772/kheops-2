// client/src/services/companion/companionClient.js
//
// Service frontend du COMPAGNON Kheops (agent local mince).
//
// Role : permettre a l'application WEB (navigateur) d'ouvrir/editer des .docx
// dans Microsoft Word installe localement, via un petit agent Electron invisible
// qui ecoute UNIQUEMENT sur 127.0.0.1:8080.
//
// Ce module est la SOURCE DE VERITE du contrat web <-> compagnon :
//   - port / base URL locale ;
//   - en-tete anti-CSRF obligatoire (X-Kheops-Companion) ;
//   - jeton de session compagnon court (X-Kheops-Companion-Token), emis par le
//     backend apres login et relaye au compagnon (le compagnon ne detient AUCUN
//     secret : il revalide ce jeton aupres du backend).
//
// Le compagnon n'est PERTINENT qu'en mode web. Dans l'app Electron historique
// (window.electron present), on n'utilise pas ce service.

import apiClient from '../apiClient';

// ── Contrat local ──────────────────────────────────────────────────────────
export const COMPANION_PORT = 8080;
export const COMPANION_BASE = `http://127.0.0.1:${COMPANION_PORT}`;
export const COMPANION_HEADER = 'X-Kheops-Companion';        // anti-CSRF (force le preflight)
export const COMPANION_TOKEN_HEADER = 'X-Kheops-Companion-Token';
const HEALTH_TIMEOUT_MS = 1500;

// Version du compagnon CORRESPONDANT a l'installeur actuellement publie sur
// gs://kheops-2-companion-download-16107185088. A INCREMENTER a chaque rebuild/publication du
// compagnon : l'onglet « Mise a jour » compare cette valeur a la version
// reellement installee (renvoyee par /health) pour signaler une MAJ disponible.
export const COMPANION_LATEST_VERSION = '1.0.6';

// Etats documentaires exposes a l'UI.
export const DOC_STATE = Object.freeze({
  IDLE: 'idle',
  OPENING: 'opening',
  OPEN: 'open',
  SYNCING: 'syncing',
  SAVED: 'saved',
  CONFLICT: 'conflict',
  ERROR: 'error',
  CLOSED: 'closed',
});

// URL de l'installeur du COMPAGNON MINCE (artefact distinct et SANS secret —
// a ne pas confondre avec l'ancien KHEOPS2-Setup.exe complet, supprime).
// Surcouchable au runtime via public/config.js (window.__KHEOPS_CONFIG__).
const DEFAULT_COMPANION_INSTALLER_URL =
  'https://storage.googleapis.com/kheops-2-companion-download-16107185088/KHEOPS2-Companion-Setup.exe';

export function detectDesktopPlatform() {
  try {
    const raw = String(
      navigator?.userAgentData?.platform
      || navigator?.platform
      || navigator?.userAgent
      || ''
    ).toLowerCase();
    if (/mac|iphone|ipad|ipod/.test(raw)) return 'macos';
    if (/win/.test(raw)) return 'windows';
    if (/linux|x11|cros/.test(raw)) return 'linux';
  } catch (_e) { /* environnement non navigateur */ }
  return 'unknown';
}

export function getCompanionInstallerInfo() {
  let cfg = {};
  try { cfg = (typeof window !== 'undefined' && window.__KHEOPS_CONFIG__) || {}; } catch (_e) {}
  const platform = detectDesktopPlatform();
  const configured = cfg.companionInstallerUrls || {};

  if (platform === 'windows') {
    const url = cfg.companionInstallerUrlWindows
      || configured.windows
      || cfg.companionInstallerUrl
      || DEFAULT_COMPANION_INSTALLER_URL;
    return {
      platform,
      available: Boolean(url),
      url: url || null,
      fileName: 'KHEOPS2-Companion-Setup.exe',
      platformLabel: 'Windows',
      installHint: "Ouvrez le fichier .exe téléchargé, puis suivez l'assistant Windows.",
      unavailableReason: null,
    };
  }

  if (platform === 'macos') {
    // Ne jamais recycler la valeur historique générique si c'est un .exe :
    // elle est destinée à Windows et produirait un faux bouton sur macOS.
    const explicitUrl = cfg.companionInstallerUrlMacos || configured.macos || null;
    const genericUrl = cfg.companionInstallerUrl && !/\.exe(?:$|[?#])/i.test(cfg.companionInstallerUrl)
      ? cfg.companionInstallerUrl
      : null;
    const url = explicitUrl || genericUrl;
    return {
      platform,
      available: Boolean(url),
      url: url || null,
      fileName: 'KHEOPS2-Companion.dmg',
      platformLabel: 'macOS',
      installHint: url
        ? "Ouvrez l'image disque téléchargée, puis placez le compagnon dans Applications."
        : null,
      unavailableReason: url ? null : "Le compagnon macOS n'est pas encore proposé pour ce déploiement.",
    };
  }

  const url = configured[platform] || null;
  return {
    platform,
    available: Boolean(url),
    url,
    fileName: 'KHEOPS2-Companion',
    platformLabel: platform === 'linux' ? 'Linux' : 'ce système',
    installHint: null,
    unavailableReason: url ? null : "Aucun installateur du compagnon n'est disponible pour ce système.",
  };
}

export function getCompanionInstallerUrl() {
  return getCompanionInstallerInfo().url;
}

// ── Petit store reactif (sans Redux) ────────────────────────────────────────
// presence : 'unknown' | 'present' | 'absent'
// docStates : Map<docId, { state, error, lastSyncAt }>
const state = {
  presence: 'unknown',
  docStates: new Map(),
};
const listeners = new Set();

function emit() {
  for (const l of Array.from(listeners)) {
    try { l(); } catch (_e) { /* un listener qui casse ne bloque pas les autres */ }
  }
}
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function setPresence(p) {
  if (state.presence !== p) {
    state.presence = p;
    emit();
  }
}
function setDocState(docId, patch) {
  const prev = state.docStates.get(docId) || { state: DOC_STATE.IDLE, error: null, lastSyncAt: null };
  state.docStates.set(docId, { ...prev, ...patch });
  emit();
}

export function getPresence() { return state.presence; }
export function getDocState(docId) {
  return state.docStates.get(docId) || { state: DOC_STATE.IDLE, error: null, lastSyncAt: null };
}

// ── Detection ───────────────────────────────────────────────────────────────
/**
 * Ping silencieux du compagnon local. Timeout court : l'absence du compagnon
 * (port ferme) doit echouer vite pour ne pas ralentir l'arrivee sur l'app.
 * @returns {Promise<boolean>}
 */
export async function detectCompanion({ timeoutMs = HEALTH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${COMPANION_BASE}/health`, {
      method: 'GET',
      headers: { [COMPANION_HEADER]: '1' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) { setPresence('absent'); return false; }
    const data = await res.json().catch(() => ({}));
    const ok = !!(data && data.app === 'kheops-companion');
    setPresence(ok ? 'present' : 'absent');
    return ok;
  } catch (_e) {
    // AbortError (timeout), connexion refusee, CORS bloque... => absent.
    setPresence('absent');
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Comme detectCompanion mais renvoie aussi la VERSION installee (utile pour
 * l'onglet « Mise a jour » : comparer version installee vs disponible).
 * @returns {Promise<{present:boolean, version:?string, platform:?string}>}
 */
export async function getCompanionHealth({ timeoutMs = HEALTH_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${COMPANION_BASE}/health`, {
      method: 'GET',
      headers: { [COMPANION_HEADER]: '1' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) { setPresence('absent'); return { present: false, version: null, platform: null }; }
    const data = await res.json().catch(() => ({}));
    const ok = !!(data && data.app === 'kheops-companion');
    setPresence(ok ? 'present' : 'absent');
    return { present: ok, version: (data && data.version) || null, platform: (data && data.platform) || null };
  } catch (_e) {
    setPresence('absent');
    return { present: false, version: null, platform: null };
  } finally {
    clearTimeout(timer);
  }
}

// ── Ouverture d'un document dans Word ────────────────────────────────────────
/**
 * Demande au compagnon d'ouvrir un document dans Word.
 * 1) obtient un jeton de session compagnon court aupres du backend ;
 * 2) demande au compagnon local d'ouvrir le docId ;
 * 3) lance le polling de l'etat de synchronisation.
 */
export async function openDocumentInWord(docId, { fileName } = {}) {
  if (!docId) throw new Error('docId requis');
  setDocState(docId, { state: DOC_STATE.OPENING, error: null });
  try {
    // 1) jeton compagnon (auth = JWT user via apiClient)
    const { data } = await apiClient.post('/api/word/companion/session', { docId });
    const companionToken = data && data.companionToken;
    const backendBaseUrl = (data && data.backendBaseUrl) || window.location.origin;
    if (!companionToken) throw new Error('Jeton compagnon indisponible.');

    // 2) ordre d'ouverture au compagnon local
    const res = await fetch(`${COMPANION_BASE}/open-document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [COMPANION_HEADER]: '1',
        [COMPANION_TOKEN_HEADER]: companionToken,
      },
      body: JSON.stringify({ docId, fileName: fileName || null, backendBaseUrl }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`Compagnon a refuse l'ouverture (HTTP ${res.status}) ${msg}`.trim());
    }
    setDocState(docId, { state: DOC_STATE.OPEN, error: null });
    startStatusPolling(docId);
    return { ok: true };
  } catch (err) {
    setDocState(docId, { state: DOC_STATE.ERROR, error: err.message || String(err) });
    throw err;
  }
}

// ── Polling de l'etat de synchro ─────────────────────────────────────────────
const pollTimers = new Map(); // docId -> intervalId
const POLL_INTERVAL_MS = 3000;

export async function pollSyncStatus(docId) {
  try {
    const res = await fetch(`${COMPANION_BASE}/sync-status/${encodeURIComponent(docId)}`, {
      method: 'GET',
      headers: { [COMPANION_HEADER]: '1' },
      cache: 'no-store',
    });
    if (!res.ok) return getDocState(docId);
    const data = await res.json().catch(() => ({}));
    if (data && data.state) {
      const previousState = getDocState(docId).state;
      setDocState(docId, {
        state: data.state,
        error: data.error || null,
        lastSyncAt: data.lastSyncAt || null,
        conflict: data.conflict || null,
      });
      if (data.state === DOC_STATE.CONFLICT && previousState !== DOC_STATE.CONFLICT) {
        try {
          window.dispatchEvent(new CustomEvent('kheops:word-version-conflict', {
            detail: { docId, message: data.error, conflict: data.conflict || null },
          }));
        } catch (_e) { /* le store conserve malgré tout l'état conflict */ }
      }
      if ([DOC_STATE.CLOSED, DOC_STATE.ERROR, DOC_STATE.CONFLICT].includes(data.state)) {
        stopStatusPolling(docId);
      }
    }
    return getDocState(docId);
  } catch (_e) {
    // Compagnon devenu injoignable pendant l'edition : on signale l'erreur.
    setDocState(docId, { state: DOC_STATE.ERROR, error: 'Compagnon injoignable.' });
    stopStatusPolling(docId);
    return getDocState(docId);
  }
}

function startStatusPolling(docId) {
  stopStatusPolling(docId);
  const id = setInterval(() => { pollSyncStatus(docId); }, POLL_INTERVAL_MS);
  pollTimers.set(docId, id);
}
function stopStatusPolling(docId) {
  const id = pollTimers.get(docId);
  if (id) { clearInterval(id); pollTimers.delete(docId); }
}

// ── Fermeture / nettoyage explicite (optionnel cote UI) ──────────────────────
export async function closeDocument(docId) {
  try {
    await fetch(`${COMPANION_BASE}/close-cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [COMPANION_HEADER]: '1' },
      body: JSON.stringify({ docId }),
    });
  } catch (_e) { /* best-effort */ }
  stopStatusPolling(docId);
  setDocState(docId, { state: DOC_STATE.CLOSED });
}

// ── Installation / reveil du compagnon ───────────────────────────────────────
/**
 * DÉSACTIVÉ (2026-07-01). Historiquement, cette fonction injectait une iframe
 * `kheops2://wake` pour réveiller le compagnon. Mais sur un poste où l'ANCIENNE
 * application native Kheops est installée, le schéma `kheops2://` est enregistré
 * par elle : le navigateur affichait « Ouvrir Kheops2 ? » et lançait l'ancienne
 * app. On NE déclenche donc PLUS aucun protocole. La détection se fait uniquement
 * par le ping local /health (detectCompanion), et le compagnon se lance de lui-même
 * au démarrage de session Windows (auto-launch). No-op conservé pour compat.
 */
export function tryWakeViaProtocol() {
  /* volontairement vide : ne JAMAIS déclencher kheops2:// depuis le web. */
}

/**
 * Demande au compagnon local de S'ARRETER PROPREMENT (route POST /shutdown).
 * Appelee JUSTE AVANT de telecharger/lancer l'installeur de mise a jour : le
 * compagnon etant un agent de fond SANS fenetre, l'installeur NSIS ne peut pas
 * le fermer tout seul (d'ou l'ancien message « veuillez fermer le compagnon »).
 * En le fermant ici, l'installeur trouve le champ libre.
 *
 * Best-effort : renvoie true si le compagnon a accuse l'arret. Un compagnon
 * ANCIEN (< 1.0.2) ne connait pas cette route -> renvoie false ; l'installeur
 * 1.0.2 se charge alors de fermer l'ancien de force (voir build/installer.nsh).
 * @returns {Promise<boolean>}
 */
export async function shutdownCompanion({ timeoutMs = 2500 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${COMPANION_BASE}/shutdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [COMPANION_HEADER]: '1' },
      signal: controller.signal,
      cache: 'no-store',
    });
    const ok = !!res.ok;
    if (ok) setPresence('absent');
    return ok;
  } catch (_e) {
    // Compagnon injoignable / route inconnue / timeout : on continue quand meme.
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Prepare puis declenche la mise a jour du compagnon :
 *   1) ferme proprement l'ancien compagnon (POST /shutdown) s'il tourne ;
 *   2) laisse un court delai pour la liberation du port/fichier ;
 *   3) declenche le telechargement de l'installeur.
 * Ainsi, quand l'utilisateur lance l'installeur, l'ancien compagnon est deja parti :
 * plus de blocage « veuillez fermer le compagnon ».
 * @returns {Promise<{closed:boolean, downloaded:boolean}>}
 */
export async function updateCompanion() {
  if (!getCompanionInstallerInfo().available) {
    return { closed: false, downloaded: false, unavailable: true };
  }
  let closed = false;
  try { closed = await shutdownCompanion(); } catch (_e) { closed = false; }
  // Petit delai pour laisser le process se terminer et liberer le port 8080.
  if (closed) { await new Promise((r) => setTimeout(r, 800)); }
  const downloaded = triggerCompanionInstall();
  return { closed, downloaded };
}

/**
 * Declenche le telechargement du petit installeur du compagnon.
 * Un navigateur NE PEUT PAS installer/lancer un programme silencieusement : on
 * declenche le telechargement adapte au systeme, puis l'utilisateur le lance.
 */
export function triggerCompanionInstall() {
  const installer = getCompanionInstallerInfo();
  const url = installer.url;
  if (!url) return false;
  try {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.download = installer.fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch (_e) {
    try { window.open(url, '_blank', 'noopener'); return true; } catch (_e2) { return false; }
  }
}

// ── Miroir local (Phase 2 « rangement coherent ») ────────────────────────────
/**
 * Declenche la synchronisation du MIROIR LOCAL du compagnon
 * (C:\Files_Clients\Kheops2\Dossiers\<noms lisibles>) pour les comptes sans
 * cloud personnel. Le serveur decide (manifeste) : pour un compte
 * OneDrive/Google/SharePoint le compagnon ne fait rien. Best-effort total :
 * jamais d'erreur visible, renvoie false si compagnon absent/ancien (<1.0.4).
 * @returns {Promise<boolean>}
 */
let lastMirrorSyncAt = 0;
const MIRROR_SYNC_COOLDOWN_MS = 5 * 60 * 1000; // anti-rafale (ouvertures de dossiers successives)

export async function triggerMirrorSync() {
  try {
    if (Date.now() - lastMirrorSyncAt < MIRROR_SYNC_COOLDOWN_MS) return false;
    lastMirrorSyncAt = Date.now();
    // 1) jeton compagnon court (auth = JWT user via apiClient)
    const { data } = await apiClient.post('/api/word/companion/session', {});
    const companionToken = data && data.companionToken;
    const backendBaseUrl = (data && data.backendBaseUrl) || window.location.origin;
    if (!companionToken) return false;
    // 2) ordre de synchro au compagnon local (202 immediat, travail en fond)
    const res = await fetch(`${COMPANION_BASE}/mirror/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [COMPANION_HEADER]: '1',
        [COMPANION_TOKEN_HEADER]: companionToken,
      },
      body: JSON.stringify({ backendBaseUrl }),
    });
    return res.ok || res.status === 202;
  } catch (_e) {
    return false; // compagnon absent, ancien, ou reseau : silencieux
  }
}

// ── Abonnement bas niveau (pour hooks React) ─────────────────────────────────
export const companionStore = { subscribe, getPresence, getDocState };
