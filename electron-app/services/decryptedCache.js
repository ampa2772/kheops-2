// electron-app/services/decryptedCache.js
//
// Gestion du cache local des documents dechiffres (lot 4a).
//
// Stockage : `<userData>/decrypted-cache/<uuid>/<nom-original>.<ext>`
//   - Sous-dossier <uuid> par document, pour permettre des noms d'origine
//     identiques entre dossiers differents sans collision.
//   - Le nom de fichier conserve l'extension d'origine pour que Word /
//     Adobe / Excel puissent ouvrir naturellement le fichier.
//
// Politique de nettoyage (decision Pierre §10.5 du DESIGN) :
//   - TTL absolu de 10 heures par fichier (compromis confort metier).
//   - Tentative de suppression toutes les 5 minutes : reussit des que le
//     verrou de fichier de Word/Adobe est relache (= utilisateur a ferme
//     le document).
//   - Purge complete au demarrage de Kheops (rattrape les cas Kheops ferme
//     brutalement / Word plante / ordinateur eteint).
//   - Purge complete a la fermeture propre de Kheops.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const CACHE_DIR_NAME = 'decrypted-cache';
const TTL_HOURS = 10;
const TTL_MS = TTL_HOURS * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;                                      // 5 minutes

// Liste des fichiers actuellement dans le cache, avec leur date de creation
// en RAM. Permet de gerer le TTL et de retenter la suppression toutes les
// 5 minutes meme si Word a un verrou actif.
//   key   = absolute path
//   value = { createdAt: Date, attemptedDelete: boolean }
const _trackedFiles = new Map();

let _sweepTimer = null;

// ============================================================
// Helpers internes
// ============================================================

function getCacheRoot() {
  return path.join(app.getPath('userData'), CACHE_DIR_NAME);
}

function ensureCacheRoot() {
  const root = getCacheRoot();
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
    try {
      // Permissions restrictives : seul l'utilisateur Windows courant
      fs.chmodSync(root, 0o700);
    } catch (_) {
      // chmod ignore sur Windows en general, best-effort
    }
  }
  return root;
}

/**
 * Tente de supprimer un fichier. Renvoie true en cas de succes, false si
 * le fichier est verrouille (Word/Adobe ouvert) ou inexistant.
 */
function tryDeleteFile(filePath) {
  if (!fs.existsSync(filePath)) return true;                                  // deja supprime
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    // EBUSY / EPERM sur Windows = fichier verrouille par Word/Adobe.
    // ENOENT = deja supprime par un autre passage.
    return err && err.code === 'ENOENT';
  }
}

/**
 * Tente de supprimer recursivement un sous-dossier <uuid> du cache, s'il
 * est vide ou si tous ses fichiers ont pu etre effaces.
 */
function tryRemoveEmptySubdir(subdirPath) {
  try {
    const entries = fs.readdirSync(subdirPath);
    for (const e of entries) {
      const full = path.join(subdirPath, e);
      const stat = fs.statSync(full);
      if (stat.isFile()) {
        if (!tryDeleteFile(full)) return false;
      } else if (stat.isDirectory()) {
        if (!tryRemoveEmptySubdir(full)) return false;
      }
    }
    fs.rmdirSync(subdirPath);
    return true;
  } catch (err) {
    return err && err.code === 'ENOENT';
  }
}

// ============================================================
// API publique
// ============================================================

/**
 * Initialise le cache : creation du dossier + purge initiale (rattrape les
 * fichiers laisses apres un Kheops ferme brutalement).
 *
 * A appeler au demarrage de l'application (app.whenReady).
 */
function init() {
  ensureCacheRoot();
  purgeAll('startup');                                                        // tente d'effacer tout ce qui traine
  // Programmer le sweep periodique
  if (!_sweepTimer) {
    _sweepTimer = setInterval(() => {
      sweep();
    }, SWEEP_INTERVAL_MS);
    _sweepTimer.unref && _sweepTimer.unref();                                 // ne pas empecher Node de quitter
  }
}

/**
 * Reserve un emplacement dans le cache pour un nouveau document.
 *
 * @param {string} originalName nom du fichier d'origine (ex: "Conclusions Dupont.docx")
 * @returns {string} chemin absolu OU le contenu dechiffre doit etre ecrit
 */
function reserveSlot(originalName) {
  ensureCacheRoot();
  const uuid = crypto.randomBytes(16).toString('hex');
  const subdir = path.join(getCacheRoot(), uuid);
  fs.mkdirSync(subdir, { recursive: true });
  try { fs.chmodSync(subdir, 0o700); } catch (_) { /* best-effort Windows */ }

  // Sanitize originalName : seuls les caracteres usuels + extension
  const safeName = String(originalName || 'document.bin').replace(/[\x00-\x1f<>:"/\\|?*]/g, '_');
  const fullPath = path.join(subdir, safeName);
  _trackedFiles.set(fullPath, {
    createdAt: new Date(),
    attemptedDelete: false,
  });
  return fullPath;
}

/**
 * Sweep periodique : tente d'effacer chaque fichier suivi qui a depasse
 * son TTL OU sur lequel on a deja appele cleanup mais qu'on n'a pas pu
 * supprimer (verrou Word). Reussit pour les fichiers dont Word a relache
 * le verrou.
 */
function sweep() {
  const now = Date.now();
  for (const [filePath, info] of _trackedFiles.entries()) {
    const age = now - info.createdAt.getTime();
    const overdue = age > TTL_MS;
    const shouldTry = overdue || info.attemptedDelete;
    if (!shouldTry) continue;

    if (tryDeleteFile(filePath)) {
      _trackedFiles.delete(filePath);
      // Tenter de nettoyer le sous-dossier parent (best-effort)
      const subdir = path.dirname(filePath);
      tryRemoveEmptySubdir(subdir);
    }
  }
}

/**
 * Signale qu'un fichier dechiffre peut etre supprime des que possible
 * (l'app systeme va le fermer bientot). Le sweep periodique reessaiera
 * jusqu'a ce que le verrou Word soit relache.
 *
 * @param {string} filePath
 */
function requestCleanup(filePath) {
  if (!filePath) return;
  if (!_trackedFiles.has(filePath)) {
    // Fichier non track, mais le caller demande quand meme la suppression
    _trackedFiles.set(filePath, {
      createdAt: new Date(0),
      attemptedDelete: true,
    });
  } else {
    _trackedFiles.get(filePath).attemptedDelete = true;
  }
  // Essai immediat (peut reussir si Word est deja ferme)
  sweep();
}

/**
 * Purge complete : essaie de supprimer tous les fichiers du cache, sans
 * distinction. Les fichiers verrouilles seront retentes au prochain
 * sweep periodique.
 *
 * @param {string} reason 'startup' | 'shutdown' | 'manual' (pour log)
 * @returns {{ totalScanned: number, deleted: number, locked: number }}
 */
function purgeAll(reason = 'manual') {
  const root = getCacheRoot();
  if (!fs.existsSync(root)) return { totalScanned: 0, deleted: 0, locked: 0 };

  let totalScanned = 0;
  let deleted = 0;
  let locked = 0;

  const subdirs = fs.readdirSync(root);
  for (const sub of subdirs) {
    const subPath = path.join(root, sub);
    let stat;
    try { stat = fs.statSync(subPath); } catch (_) { continue; }
    if (!stat.isDirectory()) continue;

    let allCleaned = true;
    try {
      const files = fs.readdirSync(subPath);
      for (const f of files) {
        const full = path.join(subPath, f);
        totalScanned += 1;
        if (tryDeleteFile(full)) {
          deleted += 1;
          _trackedFiles.delete(full);
        } else {
          locked += 1;
          allCleaned = false;
        }
      }
      if (allCleaned) {
        try { fs.rmdirSync(subPath); } catch (_) { /* best-effort */ }
      }
    } catch (_) {
      // Erreur de listing, on passe au suivant
    }
  }

  return { totalScanned, deleted, locked, reason };
}

/**
 * A appeler a la fermeture propre de l'application Electron.
 * Stoppe le sweep, tente une derniere purge.
 */
function shutdown() {
  if (_sweepTimer) {
    clearInterval(_sweepTimer);
    _sweepTimer = null;
  }
  return purgeAll('shutdown');
}

/**
 * Statistiques pour debug / affichage admin.
 */
function getStats() {
  return {
    cacheRoot: getCacheRoot(),
    trackedFilesCount: _trackedFiles.size,
    ttlHours: TTL_HOURS,
    sweepIntervalMs: SWEEP_INTERVAL_MS,
  };
}

module.exports = {
  init,
  reserveSlot,
  sweep,
  requestCleanup,
  purgeAll,
  shutdown,
  getStats,
  // Pour les tests
  _internal: {
    getCacheRoot,
    _trackedFiles,
  },
};
