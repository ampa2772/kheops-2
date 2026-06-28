// electron-app/services/configManager.js
const Store = require('electron-store');
const fs = require('fs');
const path = require('path');
const os = require('os');

const store = new Store();
const STORAGE_KEY = 'localRootPath';
const DEFAULT_WINDOWS_PATH = 'C:\\Files_Clients';

// --- Isolation par USER Kheops (rc34+) ---
// Avant rc34, l'isolation locale se faisait via l'email du compte cloud
// d'authentification (Google ou Microsoft). Problème : un même utilisateur
// Kheops avec plusieurs comptes cloud (ou qui change de compte) voyait ses
// fichiers éparpillés dans plusieurs sous-dossiers, sans pouvoir les retrouver.
// Désormais l'isolation se fait par `userId` Kheops MongoDB (ObjectId) :
// chaque user a un unique sous-dossier `<basePath>/<userId>/` qui contient
// tous ses documents, peu importe le compte cloud par lequel il s'auth.
let currentUserId = null;
let currentAccountEmail = null; // gardé pour debug + logs + migration

/**
 * Vérifie si le chemin par défaut Windows est applicable.
 * @returns {boolean}
 */
function isWindowsCAvailable() {
  return os.platform() === 'win32' && fs.existsSync('C:\\');
}

/**
 * Sanitize un email pour l'utiliser comme nom de dossier.
 * Sur NTFS, @ et . sont valides — on garde l'email lisible.
 * On ne retire que les caractères vraiment interdits sur Windows.
 * @param {string} email
 * @returns {string}
 */
function sanitizeEmail(email) {
  if (!email) return '';
  // Caractères interdits NTFS : < > : " / \ | ? *
  return email.toLowerCase().replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * Sanitize un userId Mongo (24 chars hex) — défensif, normalement déjà safe.
 * @param {string} userId
 * @returns {string}
 */
function sanitizeUserId(userId) {
  if (!userId) return '';
  return String(userId).toLowerCase().replace(/[^a-f0-9]/g, '');
}

/**
 * Récupère le chemin racine de base (SANS sous-dossier user).
 * C'est le chemin configuré par l'utilisateur ou le défaut.
 * @returns {string|null} Le chemin de base ou null si non configuré.
 */
function getBaseRootPath() {
  let currentPath = store.get(STORAGE_KEY);

  if (!currentPath) {
    if (isWindowsCAvailable()) {
      // Cas par défaut Windows : on initialise automatiquement
      currentPath = DEFAULT_WINDOWS_PATH;
      store.set(STORAGE_KEY, currentPath);
      console.log(`[ConfigManager] Chemin par défaut initialisé : ${currentPath}`);
    } else {
      // Autres OS ou pas de C: -> Non configuré
      console.log('[ConfigManager] Aucun chemin configuré. En attente de configuration utilisateur.');
      return null;
    }
  }

  return currentPath;
}

/**
 * Récupère le chemin racine local effectif.
 *
 * Priorité (rc34+) :
 *  1. Si `currentUserId` est défini → basePath/<userId>/
 *  2. Sinon, si `currentAccountEmail` est défini (legacy avant la réception
 *     du userId par IPC) → basePath/<email>/  (fallback temporaire ; les
 *     fichiers seront migrés vers <userId>/ dès que disponible)
 *  3. Sinon → basePath/  (rétro-compat)
 *
 * @returns {string|null} Le chemin effectif ou null si non configuré.
 */
function getLocalRootPath() {
  const basePath = getBaseRootPath();
  if (!basePath) return null;

  if (currentUserId) {
    return path.join(basePath, sanitizeUserId(currentUserId));
  }
  if (currentAccountEmail) {
    return path.join(basePath, sanitizeEmail(currentAccountEmail));
  }
  return basePath;
}

/**
 * Définit le chemin racine local de base.
 * @param {string} newPath
 */
function setLocalRootPath(newPath) {
  if (!newPath) {
    throw new Error("Le chemin ne peut pas être vide.");
  }
  store.set(STORAGE_KEY, newPath);
  console.log(`[ConfigManager] Nouveau chemin configuré : ${newPath}`);
  return newPath;
}

/**
 * Définit le compte actif pour l'isolation des fichiers.
 *
 * Signature flexible (rc34+) :
 *   setCurrentAccount('user@example.com')                 → legacy email-only
 *   setCurrentAccount({ email, userId })                  → moderne (préféré)
 *   setCurrentAccount(null)                               → effacement
 *
 * Tant que `userId` n'est pas fourni, on retombe sur l'email comme clé
 * temporaire ; dès que le renderer envoie l'IPC `set-user-context`, on
 * bascule sur le userId définitif.
 *
 * @param {string|object|null} arg
 */
function setCurrentAccount(arg) {
  const previousEmail = currentAccountEmail;
  const previousUserId = currentUserId;

  if (arg === null || arg === undefined) {
    currentAccountEmail = null;
    currentUserId = null;
    console.log(`[ConfigManager] Compte actif effacé (était : email=${previousEmail} userId=${previousUserId})`);
    return;
  }

  if (typeof arg === 'string') {
    // Forme legacy : juste l'email du compte cloud
    currentAccountEmail = arg || null;
    // Ne pas écraser un userId déjà défini si on reçoit juste un email plus tard
    console.log(`[ConfigManager] Compte cloud actif : ${currentAccountEmail} (userId: ${currentUserId || 'pas encore'})`);
    return;
  }

  if (typeof arg === 'object') {
    if (Object.prototype.hasOwnProperty.call(arg, 'email')) {
      currentAccountEmail = arg.email || null;
    }
    if (Object.prototype.hasOwnProperty.call(arg, 'userId')) {
      currentUserId = arg.userId || null;
    }
    console.log(`[ConfigManager] Compte actif : email=${currentAccountEmail} userId=${currentUserId}`);
  }
}

/**
 * Retourne l'email du compte cloud actif.
 * @returns {string|null}
 */
function getCurrentAccount() {
  return currentAccountEmail;
}

/**
 * Retourne le userId Kheops du user actif.
 * @returns {string|null}
 */
function getCurrentUserId() {
  return currentUserId;
}

/**
 * Migre les fichiers existants vers le sous-dossier du user (rc34+).
 * Appelée une fois par user après le premier login suivant la mise à jour.
 *
 * Stratégies appliquées :
 *  1. Si `basePath/<email>/` existe → déplacer son contenu vers `basePath/<userId>/`.
 *     C'est le cas typique pour un user qui s'authentifie de nouveau avec son
 *     compte cloud habituel après mise à jour.
 *  2. Si `basePath/` contient des dossiers `<docId>` à plat (très ancien
 *     layout, avant l'isolation par compte cloud) → déplacer aussi vers
 *     `basePath/<userId>/`.
 *
 * Les sous-dossiers d'AUTRES emails ne sont JAMAIS touchés : ils peuvent
 * appartenir à d'autres users Kheops du même PC (multi-user). Pour migrer
 * leurs fichiers, ces users devront se connecter eux-mêmes (la migration
 * se déclenche par-user au login).
 *
 * @param {string} basePath - Le chemin racine (ex: C:\Files_Clients)
 * @param {string} userId - Le userId Kheops du user qui se connecte
 * @param {string} email - L'email du compte cloud utilisé pour ce login
 */
function migrateToUserId(basePath, userId, email) {
  if (!basePath || !userId) return;

  const userDir = path.join(basePath, sanitizeUserId(userId));
  const migrationMarker = path.join(userDir, '.migrated-userid');

  // Déjà migré pour ce user
  if (fs.existsSync(migrationMarker)) return;

  // S'assurer que le dossier user existe
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  try {
    // === 1. Migrer depuis le sous-dossier email du compte cloud actuel ===
    if (email) {
      const emailDir = path.join(basePath, sanitizeEmail(email));
      if (fs.existsSync(emailDir) && emailDir !== userDir) {
        const emailEntries = fs.readdirSync(emailDir, { withFileTypes: true });
        let movedCount = 0;
        for (const entry of emailEntries) {
          if (entry.name === '.migrated' || entry.name === '.migrated-userid') continue;
          const src = path.join(emailDir, entry.name);
          const dst = path.join(userDir, entry.name);
          if (fs.existsSync(dst)) {
            // Conflit : le nom existe déjà sous userDir, on renomme la source
            // avec un suffixe -from-<email> pour éviter écrasement.
            const safeSuffix = sanitizeEmail(email).replace(/[^a-z0-9]/gi, '_');
            const dstAlt = path.join(userDir, `${entry.name}__from_${safeSuffix}`);
            try {
              fs.renameSync(src, dstAlt);
              movedCount++;
              console.log(`[ConfigManager] Migré (collision) : ${entry.name} -> ${path.basename(dstAlt)}`);
            } catch (err) {
              console.error(`[ConfigManager] Erreur migration ${entry.name}: ${err.message}`);
            }
          } else {
            try {
              fs.renameSync(src, dst);
              movedCount++;
            } catch (err) {
              console.error(`[ConfigManager] Erreur migration ${entry.name}: ${err.message}`);
            }
          }
        }
        if (movedCount > 0) {
          console.log(`[ConfigManager] ${movedCount} entrée(s) migrée(s) depuis ${emailDir} vers ${userDir}.`);
        }
        // Tenter de supprimer le dossier email maintenant vide
        try {
          const remaining = fs.readdirSync(emailDir).filter(n => n !== '.migrated');
          if (remaining.length === 0) {
            fs.rmSync(emailDir, { recursive: true, force: true });
            console.log(`[ConfigManager] Dossier email vide supprimé : ${emailDir}`);
          }
        } catch (_) { /* best-effort */ }
      }
    }

    // === 2. Migrer les docId à plat dans basePath (ancien layout) ===
    const baseEntries = fs.readdirSync(basePath, { withFileTypes: true });
    const docIdFolders = baseEntries.filter(e =>
      e.isDirectory() && /^[a-f0-9]{24}$/.test(e.name)
    );
    if (docIdFolders.length > 0) {
      console.log(`[ConfigManager] Migration de ${docIdFolders.length} dossier(s) docId à plat vers ${userDir}...`);
      for (const folder of docIdFolders) {
        const src = path.join(basePath, folder.name);
        const dst = path.join(userDir, folder.name);
        if (fs.existsSync(dst)) continue; // déjà présent, skip
        try {
          fs.renameSync(src, dst);
        } catch (err) {
          console.error(`[ConfigManager] Erreur migration docId ${folder.name}: ${err.message}`);
        }
      }
    }

    // Marker de migration
    fs.writeFileSync(migrationMarker, `${new Date().toISOString()} email=${email || ''}`);
    console.log(`[ConfigManager] Migration userId terminée pour ${userId}.`);
  } catch (err) {
    console.error(`[ConfigManager] Erreur lors de la migration: ${err.message}`);
    try {
      fs.writeFileSync(migrationMarker, `error: ${err.message} - ${new Date().toISOString()}`);
    } catch (_) { /* ignore */ }
  }
}

/**
 * @deprecated Utiliser migrateToUserId(basePath, userId, email) à la place.
 * Cette fonction reste exportée pour rétro-compatibilité avec d'éventuels
 * appels externes existants. Elle ne fait rien en rc34+.
 */
function migrateIfNeeded(_basePath, _email) {
  // No-op : la migration est désormais déclenchée par migrateToUserId
  // après que le renderer a fourni le userId via IPC `set-user-context`.
}

/**
 * Vérifie si le chemin est configuré.
 * @returns {boolean}
 */
function isConfigured() {
  return !!store.get(STORAGE_KEY);
}

module.exports = {
  getLocalRootPath,
  getBaseRootPath,
  setLocalRootPath,
  setCurrentAccount,
  getCurrentAccount,
  getCurrentUserId,
  sanitizeEmail,
  sanitizeUserId,
  migrateIfNeeded,
  migrateToUserId,
  isConfigured
};
