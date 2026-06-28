// electron-app/preload.js
// Bridge IPC sécurisé entre le renderer (React) et le main process (Electron)
const { contextBridge, ipcRenderer } = require("electron");

// --- API documents existante (window.electron) ---
// Utilisée par : currentDossierSlice.js, DocumentList.js, SendEmailModal.js, Login.js, socketService.js
contextBridge.exposeInMainWorld("electron", {
  handleFileDrop: (dossierId, token, fileName, filePath) =>
    ipcRenderer.invoke('handle-file-drop', dossierId, token, fileName, filePath),

  // openDocument(doc, options?) — options.jwtToken active la détection automatique
  // de fermeture (Office ~$ + fallback file-lock) qui libère le verrou serveur.
  openDocument: (doc, options) => ipcRenderer.invoke('open-document', doc, options),
  downloadDocument: (doc) => ipcRenderer.invoke('download-document', doc),

  handleDocumentCreation: (args) => ipcRenderer.invoke('handle-document-creation', args),

  // Création d'un document vierge (flux simplifié : copie + ouverture)
  handleBlankDocumentCreation: (args) => ipcRenderer.invoke('handle-blank-document-creation', args),

  handleDocumentRename: (args) => ipcRenderer.invoke('handle-document-rename', args),

  handleDocumentDeletion: (doc) => ipcRenderer.invoke('handle-document-deletion', doc),

  handleDocumentDuplication: (args) => ipcRenderer.invoke('handle-document-duplication', args),

  // Ouvrir un lien dans le navigateur système (pour Google OAuth)
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Signaler au main process que l'authentification Google est terminée
  // et que la fenêtre peut être affichée (utilisé par GoogleCallbackHandler)
  authReady: () => ipcRenderer.send('auth-ready'),

  // Abonnement à la progression du pull cloud → local.
  // Le handler reçoit un objet { phase, total, current, percent, currentFolder,
  // currentFile, downloaded, failed, source, success?, errors? }.
  // Retourne une fonction de désabonnement (à appeler au unmount du composant).
  onSyncProgress: (handler) => {
    const wrapped = (_event, evt) => handler(evt);
    ipcRenderer.on('sync:progress', wrapped);
    return () => ipcRenderer.removeListener('sync:progress', wrapped);
  },

  // Demande au main process d'initialiser le cloud après un login email/password
  // et de lancer la synchronisation initiale. Couvre le scénario "nouveau PC,
  // compte existant lié à Google/Microsoft sur un autre PC".
  // Retourne { success, source?, error? } via une promesse.
  requestCloudSync: (token) => ipcRenderer.invoke('cloud-init-after-login', token),

  // Démarre un drag native OS depuis un document Kheops (déjà synchronisé en
  // local via rootPath). Permet de glisser le fichier vers une autre app
  // (ChatGPT desktop, Claude, browser, etc.). Doit être appelé depuis
  // ondragstart APRÈS event.preventDefault() côté renderer.
  startFileDrag: (doc) => ipcRenderer.send('start-file-drag', doc),

  // Détecte si un path local (issu de file.path lors d'un drop) appartient à
  // l'arborescence Kheops sous rootPath. Permet de distinguer un drop interne
  // (move) d'un drop externe (upload) quand on utilise le drag native OS pour
  // les deux flux. Retourne { isLocal, docId?, subfolderName? }.
  isKheopsLocalPath: (filePath) => ipcRenderer.invoke('is-kheops-local-path', filePath),

  // Abonnement au résultat asynchrone du startDrag. Le main process envoie
  // { success, error?, docId, ... } après chaque tentative de start-file-drag.
  // Retourne une fonction de désabonnement.
  onStartFileDragResult: (handler) => {
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on('start-file-drag:result', wrapped);
    return () => ipcRenderer.removeListener('start-file-drag:result', wrapped);
  },

  // Logging depuis le renderer vers crash-log.txt (debug uniquement).
  logRenderer: (message) => ipcRenderer.send('log-renderer', message),

  // Transmet le userId Kheops au main process après le login backend.
  // L'OAuth Google/Microsoft donne un email, mais le userId Kheops MongoDB
  // n'est connu qu'après l'échange JWT côté serveur. Le renderer décode le
  // JWT et appelle setUserContext({ email, userId }) pour permettre au main
  // de basculer l'isolation locale sur `<basePath>/<userId>/` (au lieu de
  // `<basePath>/<email_cloud>/`) et de migrer les fichiers existants.
  setUserContext: (payload) => ipcRenderer.send('set-user-context', payload),

  // === Chiffrement E2E (lot 3a) ====================================
  // Voir Kheops_2/e2e/DESIGN_CHIFFREMENT_E2E.md et NOTICE_CHIFFREMENT_UTILISATEUR.md.
  //
  // La MasterKey du cabinet vit uniquement dans le main process. Les methodes
  // ci-dessous renvoient des resultats opaques (statut, ciphertext en
  // base64/hex). Le renderer ne manipule JAMAIS la MasterKey en clair.
  crypto: {
    // Etat actuel : { isUnlocked, ownerUserId, wordlistIsPlaceholder, protectionEnabled }
    getStatus: () => ipcRenderer.invoke('crypto:get-status'),
    // Synchronise l'état serveur CabinetEncryption.enabled vers le main process.
    // À appeler après chaque fetchEncryptionStatus pour que les uploads sachent
    // refuser quand la machine est verrouillée alors que le cabinet est protégé.
    setProtectionEnabled: (enabled) => ipcRenderer.invoke('crypto:set-protection-enabled', enabled),
    // Disponibilite de safeStorage sur la machine
    safeStorageAvailable: () => ipcRenderer.invoke('crypto:safe-storage-available'),
    // Generation et validation de phrase secrete (situation A)
    generatePassphrase: (wordCount) => ipcRenderer.invoke('crypto:generate-passphrase', wordCount),
    validatePassphrase: (passphrase) => ipcRenderer.invoke('crypto:validate-passphrase', passphrase),
    // Setup d'un nouveau cabinet : renvoie { salt, verifier } a envoyer au
    // serveur via POST /api/encryption/setup. La MasterKey reste cote main.
    setupNewCabinet: (args) => ipcRenderer.invoke('crypto:setup-new-cabinet', args),
    // Deverrouille un cabinet existant a partir d'une phrase (situation B)
    unlockCabinet: (args) => ipcRenderer.invoke('crypto:unlock-cabinet', args),
    // Persistance locale via safeStorage (DPAPI Windows)
    persistMasterKey: () => ipcRenderer.invoke('crypto:persist-master-key'),
    loadMasterKeyFromDisk: (ownerUserId) => ipcRenderer.invoke('crypto:load-master-key-from-disk', ownerUserId),
    forgetMasterKey: (options) => ipcRenderer.invoke('crypto:forget-master-key', options),
    // Chiffrement / dechiffrement de chaines (pour les messages chat).
    // Pour les fichiers Drive, le chiffrement est fait directement cote main
    // (docGenerator.js), pas via IPC, pour eviter le surcout de passage de
    // buffers volumineux a travers la frontiere IPC.
    encryptString: (plaintext) => ipcRenderer.invoke('crypto:encrypt-string', plaintext),
    decryptString: (encoded) => ipcRenderer.invoke('crypto:decrypt-string', encoded),
    // Feuille de secours (lot 2.0.4) :
    //   - generateRecoverySheet ouvre une boite de dialogue d'enregistrement
    //     et ecrit le PDF a l'emplacement choisi par l'utilisateur
    //   - openRecoverySheet ouvre le PDF avec le visualiseur par defaut
    //     (utile pour declencher l'impression via Ctrl+P)
    //   - restoreFromRecoverySheet reconstruit la MasterKey a partir des
    //     elements saisis (mot de passe de secours + code de secours)
    generateRecoverySheet: (options) => ipcRenderer.invoke('crypto:generate-recovery-sheet', options),
    openRecoverySheet: (filePath) => ipcRenderer.invoke('crypto:open-recovery-sheet', filePath),
    restoreFromRecoverySheet: (args) => ipcRenderer.invoke('crypto:restore-from-recovery-sheet', args),
  },
});

// --- API Google Drive (window.electronAPI) ---
// Utilisée par : mainUserModal/index.js
contextBridge.exposeInMainWorld("electronAPI", {
  // Configuration du chemin local
  getRootPath: () => ipcRenderer.invoke('get-root-path'),
  selectRootPath: () => ipcRenderer.invoke('select-root-path'),

  // Authentification Google
  loginGoogle: () => ipcRenderer.invoke('login-google'),
  logoutGoogle: () => ipcRenderer.invoke('logout-google'),
  getUserInfo: () => ipcRenderer.invoke('get-user-info'),
  checkGoogleStatus: () => ipcRenderer.invoke('check-google-status'),

  // Authentification Microsoft (MSAL Public Client + PKCE)
  loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
  logoutMicrosoft: () => ipcRenderer.invoke('logout-microsoft'),
  checkMicrosoftStatus: () => ipcRenderer.invoke('check-microsoft-status'),
  getMicrosoftProfile: () => ipcRenderer.invoke('get-microsoft-profile'),
  fetchMicrosoftMails: (options) => ipcRenderer.invoke('fetch-microsoft-mails', options),

  // Google Drive (Upload générique)
  uploadToGdrive: (fileData) => ipcRenderer.invoke('upload-to-gdrive', fileData),
});
