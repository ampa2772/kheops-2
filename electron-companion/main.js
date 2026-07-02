// electron-companion/main.js
//
// Point d'entree du COMPAGNON KHEOPS — agent local mince et INVISIBLE.
//
// Ce qu'il N'EST PAS (volontairement) :
//   - pas de BrowserWindow / aucune UI ;
//   - pas d'icone dans la barre des taches ni de Tray ;
//   - ne charge JAMAIS http://localhost:5000 ni l'app Kheops complete ;
//   - ne demarre PAS le serveur Express complet, ni MongoDB ;
//   - n'embarque AUCUN secret (.env, credentials, JWT, cle de chiffrement).
//
// Ce qu'il EST : un serveur HTTP local (127.0.0.1) qui ouvre des .docx dans
// Microsoft Word, surveille les sauvegardes, resynchronise vers le backend
// Kheops (Cloud Run) et libere les verrous a la fermeture.

const { app } = require('electron');
const localServer = require('./lib/localServer');
const autoLaunch = require('./lib/autoLaunch');
const wordSession = require('./lib/wordSession');

// ── Instance unique : un seul compagnon a la fois ───────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Une instance tourne deja : la nouvelle se contente de quitter (l'existante
  // reste l'agent actif). On ne montre rien.
  app.quit();
} else {
  // Reveil depuis une 2e tentative de lancement ou un lien kheops2:// :
  // le compagnon est deja la, rien a faire de plus (le serveur local repond).
  app.on('second-instance', () => { /* deja actif, aucune fenetre a focus */ });
  app.on('open-url', () => { /* macOS : kheops2:// — deja actif */ });

  // macOS : pas d'icone dans le Dock (invisible).
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.hide(); } catch (_) {}
  }

  app.whenReady().then(() => {
    // Enregistre le scheme kheops2:// (sert a "reveiller" le compagnon depuis le web).
    try { app.setAsDefaultProtocolClient('kheops2'); } catch (_) {}

    localServer.start();
    autoLaunch.ensure();

    console.log('[Companion] Demarre en arriere-plan (aucune fenetre, aucune icone).');
  });

  // IMPORTANT : ne JAMAIS quitter quand il n'y a pas de fenetre — c'est un agent
  // de fond. (On ne cree aucune fenetre, donc ce handler ne quitte pas l'app.)
  app.on('window-all-closed', (e) => { e.preventDefault(); });

  app.on('before-quit', () => {
    try { wordSession.stopAll(); } catch (_) {}
    try { localServer.stop(); } catch (_) {}
  });
}
