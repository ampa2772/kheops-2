// electron-app/crypto-handler.js
//
// Handlers IPC pour le chiffrement E2E (lot 3a — V1 du chantier crypto).
//
// PRINCIPE DE SECURITE FONDAMENTAL :
//   La MasterKey du cabinet est stockee uniquement dans la memoire du main
//   process Electron. Elle n'est JAMAIS exposee au renderer (React).
//   Le renderer envoie des demandes d'operations via IPC et reçoit du
//   ciphertext ou des resultats opaques. Cela limite la surface d'attaque
//   d'eventuelles XSS dans l'app React.
//
// Persistance locale : la MasterKey est chiffree au repos via Electron
// `safeStorage` (qui utilise DPAPI sur Windows, lié au compte utilisateur
// Windows courant). Stockee dans userData/.cabinet-master.key.
//
// Voir DESIGN_CHIFFREMENT_E2E.md sections 4 (architecture cryptographique)
// et 7.4 (composants a creer).

'use strict';

const path = require('path');
const fs = require('fs');
const { ipcMain, safeStorage, app, dialog, shell, BrowserWindow } = require('electron');

// Module crypto partage avec le serveur et le client (via require Node).
// Ce module ne touche AUCUN fichier reseau ni Electron : c'est de la crypto
// pure (scrypt, AES-GCM, HMAC, Diceware).
const kheopsCrypto = require('../shared/crypto');

// Generation PDF de la feuille de secours (lot 2.0.4)
const { buildRecoverySheetPdf } = require('./services/recoverySheetPdf');

// ============================================================
// Etat en RAM (limite au main process)
// ============================================================

// MasterKey deverrouillee pour la session courante. null tant que
// l'utilisateur n'a pas saisi sa phrase secrete OU charge depuis safeStorage.
let _masterKey = null;

// Identifiant du cabinet associe a la MasterKey en RAM (pour controle de
// coherence en cas de changement de session sans redemarrage).
let _ownerUserId = null;

// Indique si la protection E2E est ACTIVÉE pour ce cabinet côté serveur
// (CabinetEncryption.enabled === true). Indépendant de `_masterKey` :
//   - protectionEnabled=false + _masterKey=null : cabinet pas configuré, upload en clair OK
//   - protectionEnabled=true  + _masterKey=null : cabinet protégé MAIS verrouillé → REFUS upload (S25 #1, D1)
//   - protectionEnabled=true  + _masterKey!=null : cabinet protégé ET déverrouillé → chiffrement actif
// Synchronisé depuis le renderer via IPC `crypto:set-protection-enabled` à
// chaque `fetchEncryptionStatus` (encryptionSlice).
let _protectionEnabled = false;

// ============================================================
// Helpers internes
// ============================================================

/**
 * Chemin du fichier ou la MasterKey chiffree par safeStorage est persistee
 * pour une machine donnee. Un fichier par ownerUserId pour supporter le
 * cas multi-comptes sur la meme machine Windows.
 */
function getMasterKeyFilePath(ownerUserId) {
  const dir = app.getPath('userData');
  // Sanitize l'ownerUserId pour eviter les caracteres exotiques dans le nom
  // de fichier (l'_id Mongo est deja hex, mais ceinture+bretelles).
  const safe = String(ownerUserId).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(dir, '.cabinet-master-' + safe + '.key');
}

/**
 * Vide la MasterKey en memoire. Appele a la deconnexion et au verrouillage.
 * NB : on ne touche PAS à `_protectionEnabled` ici — l'état serveur de la
 * protection ne change pas parce qu'on verrouille localement.
 */
function clearMasterKeyInMemory() {
  if (_masterKey && Buffer.isBuffer(_masterKey)) {
    _masterKey.fill(0);                                                      // best-effort wipe
  }
  _masterKey = null;
  _ownerUserId = null;
}

/**
 * Renvoie l'etat actuel sans exposer la MasterKey elle-meme.
 */
function getStatus() {
  return {
    isUnlocked: _masterKey !== null,
    ownerUserId: _ownerUserId,
    wordlistIsPlaceholder: kheopsCrypto.WORDLIST_IS_PLACEHOLDER,
    protectionEnabled: _protectionEnabled,
  };
}

/**
 * Indique si la protection E2E est activée pour ce cabinet (côté serveur).
 * À ne pas confondre avec `isUnlocked()` qui dit si la MasterKey est en RAM.
 *   shouldEncrypt() === true && isUnlocked() === true  → chiffrer
 *   shouldEncrypt() === true && isUnlocked() === false → REFUSER l'upload
 *   shouldEncrypt() === false                          → upload en clair
 */
function shouldEncrypt() {
  return _protectionEnabled === true;
}

// ============================================================
// Enregistrement des handlers IPC
// ============================================================

function registerCryptoHandlers() {
  // -- Generation et validation de phrase secrete --

  // Genere une phrase Diceware de 6 mots (par defaut) ou N mots (4-12).
  // Le renderer affiche la phrase a l'utilisateur, qui la note sur papier.
  ipcMain.handle('crypto:generate-passphrase', async (event, wordCount) => {
    const n = Number.isInteger(wordCount) ? wordCount : 6;
    try {
      return { ok: true, passphrase: kheopsCrypto.generatePassphrase(n) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Validation syntaxique cote main d'une phrase saisie. Ne deverrouille pas.
  ipcMain.handle('crypto:validate-passphrase', async (event, passphrase) => {
    return kheopsCrypto.validatePassphrase(passphrase);
  });

  // -- Setup d'un nouveau cabinet (situation A) --

  // Genere un salt + derive une MasterKey + calcule le verifier, sans
  // stocker la MasterKey en safeStorage tant que l'utilisateur n'a pas
  // valide l'enrolement cote serveur.
  //
  // Retourne { ok, salt, verifier } pour que le renderer envoie ces deux
  // valeurs au serveur via POST /api/encryption/setup, et garde la
  // MasterKey en RAM pour la suite.
  ipcMain.handle('crypto:setup-new-cabinet', async (event, { passphrase, ownerUserId }) => {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      return { ok: false, error: 'Phrase secrete vide.' };
    }
    if (typeof ownerUserId !== 'string' || ownerUserId.length === 0) {
      return { ok: false, error: 'ownerUserId manquant.' };
    }
    const validation = kheopsCrypto.validatePassphrase(passphrase);
    if (!validation.valid) {
      return { ok: false, error: validation.error };
    }
    try {
      const salt = kheopsCrypto.generateSalt();
      const masterKey = kheopsCrypto.deriveMasterKey(validation.normalized, salt);
      const verifier = kheopsCrypto.computeVerifier(masterKey);

      // Stockage RAM. La persistance safeStorage sera demandee par le
      // renderer apres confirmation serveur (crypto:persist-master-key).
      clearMasterKeyInMemory();
      _masterKey = masterKey;
      _ownerUserId = ownerUserId;

      return {
        ok: true,
        salt: salt.toString('hex'),
        verifier,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // -- Unlock cabinet existant (situation B) --

  // Le renderer a recupere salt + verifier du serveur via GET /api/encryption/info.
  // Il demande au main de deriver la MasterKey a partir de la phrase saisie,
  // de comparer le verifier localement (pour donner un feedback rapide a
  // l'utilisateur sans round-trip serveur), et de garder la MasterKey en RAM.
  ipcMain.handle('crypto:unlock-cabinet', async (event, { passphrase, saltHex, expectedVerifier, ownerUserId }) => {
    if (typeof passphrase !== 'string' || passphrase.length === 0) {
      return { ok: false, error: 'Phrase secrete vide.' };
    }
    if (typeof saltHex !== 'string' || !/^[0-9a-f]{32}$/i.test(saltHex)) {
      return { ok: false, error: 'Sel invalide.' };
    }
    if (typeof expectedVerifier !== 'string' || !/^[0-9a-f]{64}$/i.test(expectedVerifier)) {
      return { ok: false, error: 'Verifier attendu invalide.' };
    }
    const validation = kheopsCrypto.validatePassphrase(passphrase);
    if (!validation.valid) {
      return { ok: false, error: validation.error };
    }
    try {
      const salt = Buffer.from(saltHex, 'hex');
      const masterKey = kheopsCrypto.deriveMasterKey(validation.normalized, salt);
      const computedVerifier = kheopsCrypto.computeVerifier(masterKey);

      if (!kheopsCrypto.verifyVerifier(expectedVerifier, computedVerifier)) {
        // Phrase incorrecte : on n'expose RIEN, et on nettoie la cle en RAM
        masterKey.fill(0);
        return { ok: false, error: 'La phrase secrete ne correspond pas a ce cabinet.' };
      }

      // Phrase correcte : MasterKey en RAM, le renderer peut demander la
      // persistance via crypto:persist-master-key si la machine est durable.
      clearMasterKeyInMemory();
      _masterKey = masterKey;
      _ownerUserId = ownerUserId || null;

      return { ok: true, verifier: computedVerifier };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // -- Persistance locale via safeStorage --

  ipcMain.handle('crypto:persist-master-key', async () => {
    if (!_masterKey) {
      return { ok: false, error: 'Aucune MasterKey en memoire a persister.' };
    }
    if (!_ownerUserId) {
      return { ok: false, error: 'Aucun ownerUserId associe.' };
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return {
        ok: false,
        error: 'safeStorage n\'est pas disponible sur ce systeme. La phrase devra etre ressaisie a chaque demarrage.',
      };
    }
    try {
      // safeStorage attend une string. On encode la MasterKey en base64.
      const b64 = _masterKey.toString('base64');
      const encrypted = safeStorage.encryptString(b64);
      const filePath = getMasterKeyFilePath(_ownerUserId);
      fs.writeFileSync(filePath, encrypted, { mode: 0o600 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('crypto:load-master-key-from-disk', async (event, ownerUserId) => {
    if (typeof ownerUserId !== 'string' || ownerUserId.length === 0) {
      return { ok: false, error: 'ownerUserId manquant.' };
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'safeStorage indisponible.', available: false };
    }
    const filePath = getMasterKeyFilePath(ownerUserId);
    if (!fs.existsSync(filePath)) {
      return { ok: false, error: 'Aucune cle persistee pour ce compte.', available: true, persistedOnDisk: false };
    }
    try {
      const encrypted = fs.readFileSync(filePath);
      const b64 = safeStorage.decryptString(encrypted);
      const masterKey = Buffer.from(b64, 'base64');
      if (masterKey.length !== 32) {
        return { ok: false, error: 'Fichier de cle corrompu.' };
      }
      clearMasterKeyInMemory();
      _masterKey = masterKey;
      _ownerUserId = ownerUserId;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: 'Echec du dechiffrement local : ' + err.message };
    }
  });

  ipcMain.handle('crypto:forget-master-key', async (event, options = {}) => {
    // Vide la RAM. Si options.removeDisk, supprime aussi le fichier persiste.
    const ownerUserId = _ownerUserId;
    clearMasterKeyInMemory();
    if (options.removeDisk && ownerUserId) {
      const filePath = getMasterKeyFilePath(ownerUserId);
      if (fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch (_) { /* best-effort */ }
      }
    }
    return { ok: true };
  });

  // -- Etat et utilitaires --

  ipcMain.handle('crypto:get-status', async () => {
    return { ok: true, status: getStatus() };
  });

  // Synchronisation de l'état serveur `CabinetEncryption.enabled` vers le main
  // process. Appelé par le slice Redux après chaque `fetchEncryptionStatus`.
  // Indispensable pour que les uploads sachent s'ils doivent refuser ou non
  // quand la machine est verrouillée (cf. audit S25 #1, D1).
  ipcMain.handle('crypto:set-protection-enabled', async (event, enabled) => {
    _protectionEnabled = !!enabled;
    return { ok: true, protectionEnabled: _protectionEnabled };
  });

  ipcMain.handle('crypto:safe-storage-available', async () => {
    return { ok: true, available: safeStorage.isEncryptionAvailable() };
  });

  // -- Operations de chiffrement / dechiffrement de buffers --
  //
  // Note importante : ces handlers sont prevus pour ETRE APPELES depuis le
  // main process lui-meme (lors de l'upload Drive ou du download Drive),
  // PAS depuis le renderer React. Le renderer ne devrait pas envoyer de
  // contenu sensible en clair via IPC. Les modeles de contenu (chat,
  // documents) seront chiffres au plus pres de leur source.
  //
  // On expose quand meme ces helpers via IPC pour permettre au renderer
  // de chiffrer les messages chat (texte court) cote main. La frontiere
  // IPC est dans le meme processus OS, donc pas de fuite reseau.

  ipcMain.handle('crypto:encrypt-string', async (event, plaintext) => {
    if (!_masterKey) {
      return { ok: false, error: 'Cabinet verrouille.' };
    }
    try {
      const buf = Buffer.from(String(plaintext), 'utf8');
      const encoded = kheopsCrypto.encryptToString(buf, _masterKey);
      return { ok: true, encoded };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('crypto:decrypt-string', async (event, encoded) => {
    if (!_masterKey) {
      return { ok: false, error: 'Cabinet verrouille.' };
    }
    try {
      const buf = kheopsCrypto.decryptFromString(String(encoded), _masterKey);
      return { ok: true, plaintext: buf.toString('utf8') };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // -- Feuille de secours : generation et impression (lot C2) --

  // Genere la feuille de secours pour la MasterKey en RAM, produit un PDF,
  // ouvre une boite de dialogue pour que l'utilisateur choisisse ou
  // l'enregistrer, et propose ensuite l'impression directe.
  //
  // Retourne { ok, path?, error? } — le path est le chemin du PDF sauvegarde.
  ipcMain.handle('crypto:generate-recovery-sheet', async (event, options = {}) => {
    if (!_masterKey) {
      return { ok: false, error: 'Cabinet verrouille. Impossible de generer la feuille de secours.' };
    }
    try {
      const sheet = kheopsCrypto.createRecoverySheet(_masterKey);
      const pdfBytes = await buildRecoverySheetPdf({
        recoveryPassword: sheet.recoveryPassword,
        recoveryCode: sheet.recoveryCode,
        cabinetHint: options.cabinetHint || null,
        createdAt: new Date(),
      });

      // Dialogue d'enregistrement. Sender contient l'id du BrowserWindow appelant.
      const win = BrowserWindow.fromWebContents(event.sender);
      const defaultName = 'Kheops-Feuille-de-secours-' +
        new Date().toISOString().slice(0, 10) + '.pdf';
      const result = await dialog.showSaveDialog(win, {
        title: 'Enregistrer la feuille de secours',
        defaultPath: defaultName,
        filters: [{ name: 'Document PDF', extensions: ['pdf'] }],
      });

      if (result.canceled || !result.filePath) {
        return { ok: false, canceled: true };
      }

      fs.writeFileSync(result.filePath, Buffer.from(pdfBytes), { mode: 0o600 });
      return { ok: true, path: result.filePath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Ouvre le PDF avec le visualiseur par defaut du systeme (utile pour
  // l'impression directe : l'utilisateur fait Ctrl+P depuis Adobe / Edge / etc).
  ipcMain.handle('crypto:open-recovery-sheet', async (event, filePath) => {
    if (typeof filePath !== 'string' || !fs.existsSync(filePath)) {
      return { ok: false, error: 'Fichier introuvable.' };
    }
    try {
      const errorMessage = await shell.openPath(filePath);
      if (errorMessage) {
        return { ok: false, error: errorMessage };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Restaure la MasterKey a partir d'une feuille de secours saisie par
  // l'utilisateur. Si succes, la MasterKey est mise en RAM avec
  // l'ownerUserId fourni. Le renderer enchainera typiquement avec un
  // crypto:setup-new-cabinet pour redefinir une phrase secrete fraiche
  // (au final l'ancienne phrase est revoque).
  ipcMain.handle('crypto:restore-from-recovery-sheet', async (event, { recoveryPassword, recoveryCode, ownerUserId }) => {
    if (typeof recoveryPassword !== 'string' || recoveryPassword.length === 0) {
      return { ok: false, error: 'Mot de passe de secours manquant.' };
    }
    if (typeof recoveryCode !== 'string' || recoveryCode.length === 0) {
      return { ok: false, error: 'Code de secours manquant.' };
    }
    try {
      const masterKey = kheopsCrypto.restoreFromRecoverySheet(recoveryPassword, recoveryCode);
      // Mise en RAM
      clearMasterKeyInMemory();
      _masterKey = masterKey;
      _ownerUserId = ownerUserId || null;
      // Calculer le verifier que le renderer enverra au serveur pour
      // verifier la correspondance avec le cabinet attendu.
      const verifier = kheopsCrypto.computeVerifier(masterKey);
      return { ok: true, verifier };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

// ============================================================
// API interne pour les autres modules du main process
// ============================================================
//
// Ces fonctions sont utilisees par main.js et services/docGenerator.js
// pour chiffrer/dechiffrer les buffers lors des operations Drive (upload
// et download). Elles ne passent PAS par IPC : c'est du code main process
// qui consomme directement la MasterKey.

function getMasterKey() {
  return _masterKey;
}

function isUnlocked() {
  return _masterKey !== null;
}

function encryptBufferForDrive(plaintextBuffer, meta = {}) {
  if (!_masterKey) {
    throw new Error('Cabinet verrouille : impossible de chiffrer pour Drive.');
  }
  return kheopsCrypto.encryptToBlob(plaintextBuffer, _masterKey, meta);
}

function decryptBufferFromDrive(blobBuffer) {
  if (!_masterKey) {
    throw new Error('Cabinet verrouille : impossible de dechiffrer depuis Drive.');
  }
  return kheopsCrypto.decryptFromBlob(blobBuffer, _masterKey);
}

/**
 * Point d'entrée UNIQUE pour préparer un fichier local à l'envoi vers le
 * cloud (Drive ou OneDrive). Centralise la politique S25 chantier #1 :
 *
 *   - shouldEncrypt() === true  && isUnlocked() === false → THROW
 *     (cabinet protégé mais machine verrouillée — refus pour éviter une
 *      fuite silencieuse en clair, cf. audit S25 D1).
 *
 *   - shouldEncrypt() === true  && isUnlocked() === true  → chiffrement
 *     dans un .kbox temporaire ; le caller upload ce tmp file puis appelle
 *     cleanup().
 *
 *   - shouldEncrypt() === false                            → fichier
 *     renvoyé tel quel (cabinet non protégé : comportement historique).
 *
 * Tous les sites qui montent un fichier vers le cloud (uploadFileToCloud
 * dans localFileWatcher, IPC handlers dans main.js, mailRoutes) DOIVENT
 * passer par ce helper pour bénéficier de la garde et du chiffrement.
 *
 * @param {string} localFilePath  Chemin local du fichier en clair.
 * @param {string} fileName       Nom remote souhaité (sans suffixe .kbox).
 * @param {string} mimeType       Type MIME du fichier original.
 * @returns {{ uploadPath: string, uploadName: string, uploadMime: string,
 *             cleanup: () => void, wasEncrypted: boolean }}
 */
function prepareFileForUpload(localFilePath, fileName, mimeType) {
  // Garde D1 : refus si protection activée serveur mais MasterKey absente
  if (_protectionEnabled && !_masterKey) {
    throw new Error(
      'Cabinet verrouille : impossible d\'envoyer "' + fileName + '". ' +
      'Deverrouillez votre cabinet (saisissez votre phrase secrete) avant ' +
      'de pouvoir envoyer des documents.'
    );
  }

  // Cas non chiffré : pas de protection ou MasterKey absente sur cabinet non protégé
  if (!_masterKey) {
    return {
      uploadPath: localFilePath,
      uploadName: fileName,
      uploadMime: mimeType,
      cleanup: () => {},
      wasEncrypted: false,
    };
  }

  // Cas chiffré : protection active + MasterKey en RAM
  const os = require('os');
  const fileContent = fs.readFileSync(localFilePath);
  const blob = kheopsCrypto.encryptToBlob(fileContent, _masterKey, {
    originalName: fileName,
    originalMime: mimeType,
    createdAt: new Date().toISOString(),
  });
  const tmpName = 'kheops-encrypt-' + Date.now() + '-' +
                  Math.random().toString(36).slice(2) + '.kbox';
  const tmpPath = path.join(os.tmpdir(), tmpName);
  fs.writeFileSync(tmpPath, blob);
  return {
    uploadPath: tmpPath,
    uploadName: fileName + '.kbox',
    uploadMime: 'application/octet-stream',
    cleanup: () => { try { fs.unlinkSync(tmpPath); } catch (_) { /* best-effort */ } },
    wasEncrypted: true,
  };
}

module.exports = {
  registerCryptoHandlers,
  clearMasterKeyInMemory,
  getMasterKey,
  isUnlocked,
  shouldEncrypt,
  encryptBufferForDrive,
  decryptBufferFromDrive,
  prepareFileForUpload,
  getStatus,
};
