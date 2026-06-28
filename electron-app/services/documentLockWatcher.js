// electron-app/services/documentLockWatcher.js
//
// Détection automatique de la fermeture d'un document ouvert via shell.openPath.
// Quand l'utilisateur ferme Word/Excel/PowerPoint/etc., on libère immédiatement
// le verrou côté serveur central pour que les autres utilisateurs puissent
// rouvrir le document.
//
// Stratégie en 2 couches (fallback) :
//
//   COUCHE 1 — Fichier-lock Office (".~$<nom>")
//     Word, Excel et PowerPoint créent un fichier caché `~$<filename>` dans
//     le dossier du document à l'ouverture, et le suppriment à la fermeture.
//     C'est la méthode la plus fiable et la moins intrusive.
//     - Watch chokidar sur le dossier parent pour le pattern `~$<filename>`
//     - Création détectée → on confirme "Office détecté" + reset le watchdog
//     - Suppression détectée → release immédiate
//
//   COUCHE 2 — Sonde périodique du file-lock Windows (FALLBACK)
//     Pour les fichiers non-Office (PDF, images, txt) qui ne créent pas
//     de `~$`. Au bout de 30s sans `~$`, on bascule en mode sondage :
//     toutes les 5s, tenter `fs.openSync(path, 'r+')` en mode exclusif.
//     Si succès → personne ne tient le fichier → release.
//     Si échec EBUSY/EPERM → encore ouvert, on retente plus tard.
//
// Filet de sécurité : TTL absolu de 8h. Au-delà, on libère même sans
// détection (sécurité contre les fuites de verrou si le watcher devenait
// fou pour une raison inattendue).

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const OFFICE_LOCK_DETECTION_TIMEOUT_MS = 30_000;   // si pas de ~$ après 30s → fallback
const FALLBACK_PROBE_INTERVAL_MS = 5_000;          // sonde toutes les 5s
const ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000;        // 8h max

// État interne : Map<docId, watcherSession>
const sessions = new Map();

/**
 * Démarre la surveillance d'un document ouvert.
 *
 * @param {object} opts
 * @param {string} opts.docId           — ID du document (clé du verrou serveur)
 * @param {string} opts.localFilePath   — chemin absolu du fichier ouvert
 * @param {string} opts.jwtToken        — JWT du user (pour appeler /release)
 * @param {string} opts.serverUrl       — URL de base de l'API (ex: http://localhost:5000)
 * @param {function?} opts.onReleased   — callback optionnel après libération réussie
 */
function track({ docId, localFilePath, jwtToken, serverUrl, onReleased }) {
    if (!docId || !localFilePath) {
        console.warn('[DocLockWatcher] track() ignoré : docId et localFilePath sont requis.');
        return;
    }

    // Si une session existe déjà pour ce docId, on la remplace proprement
    if (sessions.has(docId)) {
        console.log(`[DocLockWatcher] Session existante pour ${docId} — remplacement.`);
        stop(docId, { silent: true });
    }

    if (!fs.existsSync(localFilePath)) {
        console.warn(`[DocLockWatcher] Fichier introuvable, pas de tracking : ${localFilePath}`);
        return;
    }

    const fileDir = path.dirname(localFilePath);
    const fileName = path.basename(localFilePath);
    const officeLockName = `~$${fileName}`;
    const officeLockPath = path.join(fileDir, officeLockName);

    const session = {
        docId,
        localFilePath,
        fileName,
        officeLockName,
        officeLockPath,
        jwtToken,
        serverUrl,
        onReleased,
        watcher: null,
        officeDetected: false,
        startedAt: Date.now(),
        // Timers
        officeTimeoutTimer: null,    // bascule fallback si pas de ~$ en 30s
        fallbackProbeTimer: null,    // sonde 5s
        absoluteTtlTimer: null,      // hard release 8h
        released: false,
    };
    sessions.set(docId, session);

    console.log(`[DocLockWatcher] Tracking démarré pour ${docId} (${fileName})`);

    // ── Démarrer le watcher chokidar sur le dossier parent ─────────────────
    // On surveille uniquement les ~$<filename> + le fichier lui-même.
    // depth:0 → pas de récursion (le ~$ est toujours dans le même dossier).
    try {
        session.watcher = chokidar.watch(fileDir, {
            persistent: true,
            ignoreInitial: false,  // on veut être notifié si ~$ existe DEJA (cas Word déjà lancé)
            depth: 0,
            awaitWriteFinish: false,
        });

        session.watcher.on('add', (p) => {
            if (path.basename(p) === officeLockName) {
                console.log(`[DocLockWatcher] ~$ détecté pour ${docId} : ${p}`);
                session.officeDetected = true;
                clearTimeout(session.officeTimeoutTimer);
                session.officeTimeoutTimer = null;
                // Si le fallback était lancé, l'arrêter
                if (session.fallbackProbeTimer) {
                    clearInterval(session.fallbackProbeTimer);
                    session.fallbackProbeTimer = null;
                }
            }
        });

        session.watcher.on('unlink', (p) => {
            if (path.basename(p) === officeLockName && session.officeDetected) {
                console.log(`[DocLockWatcher] ~$ supprimé pour ${docId} → fermeture détectée.`);
                releaseLockAndStop(session, 'office-close');
            }
        });

        session.watcher.on('error', (err) => {
            console.error(`[DocLockWatcher] Erreur watcher pour ${docId}:`, err.message);
        });
    } catch (err) {
        console.error(`[DocLockWatcher] Impossible de démarrer chokidar pour ${docId}:`, err.message);
    }

    // ── Si pas de ~$ après 30s, bascule en mode fallback ───────────────────
    session.officeTimeoutTimer = setTimeout(() => {
        if (session.released) return;
        if (session.officeDetected) return; // Office détecté entre-temps, pas de fallback
        console.log(`[DocLockWatcher] Pas de ~$ pour ${docId} après 30s → bascule fallback (sonde file-lock).`);
        startFallbackProbe(session);
    }, OFFICE_LOCK_DETECTION_TIMEOUT_MS);

    // ── TTL absolu : 8h max ─────────────────────────────────────────────
    session.absoluteTtlTimer = setTimeout(() => {
        if (session.released) return;
        console.warn(`[DocLockWatcher] TTL absolu (8h) atteint pour ${docId} → libération forcée.`);
        releaseLockAndStop(session, 'absolute-ttl');
    }, ABSOLUTE_TTL_MS);
}

function startFallbackProbe(session) {
    if (session.released) return;
    session.fallbackProbeTimer = setInterval(() => {
        if (session.released) return;
        if (!fs.existsSync(session.localFilePath)) {
            // Fichier disparu (rare : déplacé/supprimé). On libère par sécurité.
            console.log(`[DocLockWatcher] Fichier disparu pour ${session.docId} → libération.`);
            releaseLockAndStop(session, 'file-missing');
            return;
        }
        // Tenter une ouverture en lecture/écriture. Si une autre app détient
        // un handle exclusif (Word, Acrobat read-only mode), ça échouera EBUSY.
        let fd;
        try {
            fd = fs.openSync(session.localFilePath, 'r+');
            // Succès → fichier libre → personne ne le tient ouvert
            fs.closeSync(fd);
            console.log(`[DocLockWatcher] Sonde fallback : fichier libre pour ${session.docId} → fermeture détectée.`);
            releaseLockAndStop(session, 'fallback-probe');
        } catch (err) {
            if (fd !== undefined) { try { fs.closeSync(fd); } catch (_) {} }
            // EBUSY / EPERM / EACCES → encore ouvert, on retente plus tard
            // Tout autre code → on log mais on continue (ex: ENOENT déjà géré)
            if (!['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) {
                console.warn(`[DocLockWatcher] Sonde fallback : code inattendu ${err.code} pour ${session.docId} (${err.message})`);
            }
        }
    }, FALLBACK_PROBE_INTERVAL_MS);
}

function releaseLockAndStop(session, reason) {
    if (session.released) return;
    session.released = true;

    // Stopper tous les timers
    if (session.officeTimeoutTimer) clearTimeout(session.officeTimeoutTimer);
    if (session.fallbackProbeTimer) clearInterval(session.fallbackProbeTimer);
    if (session.absoluteTtlTimer) clearTimeout(session.absoluteTtlTimer);

    // Stopper le watcher
    if (session.watcher) {
        try { session.watcher.close(); } catch (_) {}
        session.watcher = null;
    }

    // Appel HTTP au serveur central pour libérer le verrou
    const url = `${session.serverUrl}/api/document-locks/${encodeURIComponent(session.docId)}/release`;
    axios.post(url, {}, {
        headers: { Authorization: `Bearer ${session.jwtToken}` },
        timeout: 10_000,
    })
    .then(() => {
        console.log(`[DocLockWatcher] Verrou libéré côté serveur pour ${session.docId} (raison: ${reason}).`);
    })
    .catch((err) => {
        console.error(`[DocLockWatcher] Échec libération verrou pour ${session.docId}: ${err.message}`);
        // Le filet de sécurité côté serveur (TTL 90s sans heartbeat) prendra le relais.
    })
    .finally(() => {
        sessions.delete(session.docId);
        if (typeof session.onReleased === 'function') {
            try { session.onReleased({ docId: session.docId, reason }); } catch (_) {}
        }
    });
}

/**
 * Arrête manuellement la surveillance d'un document.
 * Utilisé : quand l'utilisateur ferme l'app, ou quand on veut nettoyer un docId.
 *
 * @param {string} docId
 * @param {{ silent?: boolean, releaseLock?: boolean }} options
 */
function stop(docId, options = {}) {
    const session = sessions.get(docId);
    if (!session) return;
    if (options.releaseLock) {
        releaseLockAndStop(session, 'manual-stop');
        return;
    }
    // Sinon : arrêt propre sans libération (ex: l'app se ferme, le serveur
    // libérera tout seul après 90s).
    if (!options.silent) console.log(`[DocLockWatcher] Stop manuel pour ${docId}.`);
    if (session.officeTimeoutTimer) clearTimeout(session.officeTimeoutTimer);
    if (session.fallbackProbeTimer) clearInterval(session.fallbackProbeTimer);
    if (session.absoluteTtlTimer) clearTimeout(session.absoluteTtlTimer);
    if (session.watcher) {
        try { session.watcher.close(); } catch (_) {}
    }
    session.released = true;
    sessions.delete(docId);
}

/**
 * Arrête toutes les sessions actives. Appelé à la fermeture de l'app.
 * Note : ne libère PAS les verrous côté serveur (le serveur les expirera
 * tout seul). Si on libérait ici, ça créerait des appels HTTP en flight
 * pendant la fermeture de l'app, peu fiables.
 */
function stopAll() {
    const ids = Array.from(sessions.keys());
    for (const id of ids) stop(id, { silent: true });
    console.log(`[DocLockWatcher] ${ids.length} session(s) stoppée(s).`);
}

/**
 * RÉSERVÉ AUX TESTS : retourne l'état interne pour assertions.
 */
function _getStateForTesting() {
    return {
        activeCount: sessions.size,
        docIds: Array.from(sessions.keys()),
        getSession: (docId) => sessions.get(docId),
    };
}

/**
 * RÉSERVÉ AUX TESTS : raccourci pour configurer des timeouts plus courts.
 */
function _setTimeoutsForTesting({ officeTimeoutMs, fallbackProbeMs }) {
    if (typeof officeTimeoutMs === 'number') {
        module.exports._OFFICE_TIMEOUT_OVERRIDE = officeTimeoutMs;
    }
    if (typeof fallbackProbeMs === 'number') {
        module.exports._FALLBACK_PROBE_OVERRIDE = fallbackProbeMs;
    }
}

module.exports = {
    track,
    stop,
    stopAll,
    OFFICE_LOCK_DETECTION_TIMEOUT_MS,
    FALLBACK_PROBE_INTERVAL_MS,
    ABSOLUTE_TTL_MS,
    _getStateForTesting,
    _setTimeoutsForTesting,
};
