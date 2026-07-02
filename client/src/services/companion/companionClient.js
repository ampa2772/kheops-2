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

// Etats documentaires exposes a l'UI.
export const DOC_STATE = Object.freeze({
  IDLE: 'idle',
  OPENING: 'opening',
  OPEN: 'open',
  SYNCING: 'syncing',
  SAVED: 'saved',
  ERROR: 'error',
  CLOSED: 'closed',
});

// URL de l'installeur du COMPAGNON MINCE (artefact distinct et SANS secret —
// a ne pas confondre avec l'ancien KHEOPS2-Setup.exe complet, supprime).
// Surcouchable au runtime via public/config.js (window.__KHEOPS_CONFIG__).
const DEFAULT_COMPANION_INSTALLER_URL =
  'https://storage.googleapis.com/kheops-2-app-download/KHEOPS2-Companion-Setup.exe';

export function getCompanionInstallerUrl() {
  try {
    const cfg = (typeof window !== 'undefined' && window.__KHEOPS_CONFIG__) || {};
    return cfg.companionInstallerUrl || DEFAULT_COMPANION_INSTALLER_URL;
  } catch (_e) {
    return DEFAULT_COMPANION_INSTALLER_URL;
  }
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
      setDocState(docId, { state: data.state, error: data.error || null, lastSyncAt: data.lastSyncAt || null });
      if (data.state === DOC_STATE.CLOSED || data.state === DOC_STATE.ERROR) {
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
 * Declenche le telechargement du petit installeur du compagnon.
 * Un navigateur NE PEUT PAS installer/lancer un .exe silencieusement : on
 * declenche le telechargement, l'utilisateur lance l'installeur UNE fois.
 */
export function triggerCompanionInstall() {
  const url = getCompanionInstallerUrl();
  try {
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.download = 'KHEOPS2-Companion-Setup.exe';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch (_e) {
    try { window.open(url, '_blank', 'noopener'); return true; } catch (_e2) { return false; }
  }
}

// ── Abonnement bas niveau (pour hooks React) ─────────────────────────────────
export const companionStore = { subscribe, getPresence, getDocState };
