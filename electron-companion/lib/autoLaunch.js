// electron-companion/lib/autoLaunch.js
//
// Relance automatique du compagnon au demarrage de la session utilisateur.
// On s'appuie sur l'API native d'Electron app.setLoginItemSettings :
//   - Windows : ajoute une entree dans HKCU\...\Run (par-utilisateur, pas admin) ;
//   - macOS   : enregistre un Login Item (openAsHidden pour rester invisible).
//
// Le compagnon n'ouvre aucune fenetre : au demarrage de session, il se relance
// silencieusement en arriere-plan.

const { app } = require('electron');

function ensure() {
  try {
    const current = app.getLoginItemSettings();
    if (!current.openAtLogin) {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,        // macOS : demarre masque
        args: ['--background'],     // marqueur de demarrage auto (sans UI de toute facon)
      });
      console.log('[Companion] Auto-launch au demarrage de session ACTIVE.');
    }
  } catch (err) {
    console.error('[Companion] Impossible de configurer l auto-launch:', err.message);
  }
}

function disable() {
  try { app.setLoginItemSettings({ openAtLogin: false }); } catch (_) {}
}

module.exports = { ensure, disable };
