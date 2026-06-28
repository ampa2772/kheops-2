const { google } = require('googleapis');
// CORRECTION : On importe 'authenticate' directement (déstructuration)
const { authenticate } = require('@google-cloud/local-auth');
const path = require('path');
const fs = require('fs').promises;
const Store = require('electron-store');
const { app } = require('electron');
const os = require('os');

function getUserDataPath() {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch (_) {
    /* ignore */
  }
  return path.join(os.homedir(), '.kheops-electron');
}

// Configuration de l'emplacement des identifiants (token)
const CREDENTIALS_PATH = path.join(getUserDataPath(), 'google_credentials.json');
const TOKEN_PATH = path.join(getUserDataPath(), 'google_token.json');

// Ajout du scope 'drive.file' pour permettre la création/gestion des fichiers
// que l'application elle-même crée dans Google Drive.
const SCOPES = [
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents' // Google Docs API (injection en-tête)
];

const store = new Store();
let googleAuthClient = null; // Client OAuth2 authentifié

async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

async function saveCredentials(client) {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
      type: 'authorized_user',
      client_id: key.client_id,
      client_secret: key.client_secret,
      refresh_token: client.credentials.refresh_token,
      scopes: SCOPES, // Sauvegarder les scopes pour vérification ultérieure
    });
    await fs.writeFile(TOKEN_PATH, payload);
  } catch (err) {
    console.error('Erreur lors de la sauvegarde des credentials Google:', err);
  }
}

/**
 * Vérifie que le token sauvegardé contient tous les scopes requis.
 * Retourne false si le token est ancien (pas de champ scopes) ou si un scope manque.
 */
async function checkSavedTokenScopes() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const tokenData = JSON.parse(content);
    const savedScopes = tokenData.scopes;

    // Si pas de champ 'scopes' (ancien format de token), ré-auth requise
    if (!savedScopes || !Array.isArray(savedScopes)) {
      console.log('[AUTH] Token sans champ scopes (ancien format), ré-authentification requise.');
      return false;
    }

    // Vérifier que TOUS les scopes requis sont présents dans le token
    for (const scope of SCOPES) {
      if (!savedScopes.includes(scope)) {
        console.log(`[AUTH] Scope manquant dans le token: ${scope}`);
        return false;
      }
    }

    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Initialise l'authentification Google.
 *
 * @param {object} [options]
 * @param {boolean} [options.interactive=true] Si false, n'ouvre PAS le
 *   navigateur pour l'OAuth desktop : on se contente de charger les
 *   credentials sauvegardes (et de retourner null s'il n'y en a pas).
 *   Utile au demarrage de l'app : on ne veut pas declencher Google sans
 *   que l'utilisateur ait clique sur "Se connecter avec Google".
 */
async function initGoogleAuth({ interactive = true } = {}) {
  // 1. Tenter de charger les identifiants existants
  googleAuthClient = await loadSavedCredentialsIfExist();
  if (googleAuthClient) {
    console.log('Client Google chargé depuis le token sauvegardé.');

    // NOUVEAU : Vérifier que le token a tous les scopes requis (ex: nouveau scope 'documents')
    const scopesOk = await checkSavedTokenScopes();
    if (!scopesOk) {
      console.log('[AUTH] Scopes insuffisants, suppression du token et ré-authentification...');
      await logoutGoogle(); // Supprime le token
      googleAuthClient = null;
      // Continue vers l'authentification complète ci-dessous
    } else {
      // Vérifier si le token a expiré et le rafraîchir si nécessaire
      try {
        await googleAuthClient.getAccessToken();
        return googleAuthClient;
      } catch (err) {
        console.warn('Token Google expiré, tentative de rafraîchissement...', err.message);
        googleAuthClient = null;
      }
    }
  }

  // 1bis. Mode silencieux : on s'arrete la, sans declencher la fenetre
  // OAuth Google. Le demarrage de l'app utilise ce mode pour ne pas
  // imposer Google avant l'ecran de login Kheops.
  if (!interactive) {
    console.log('[AUTH] Pas de session Google sauvegardée — mode silencieux, pas d\'auth interactive.');
    return null;
  }

  // 2. Si échec, lancer l'authentification
  try {
    console.log("Démarrage de l'authentification locale Google...");

    // CORRECTION MAJEURE ICI : Utilisation de la fonction authenticate directement
    googleAuthClient = await authenticate({
      keyfilePath: CREDENTIALS_PATH,
      scopes: SCOPES,
    });

    // Sauvegarder les credentials (surtout le refresh_token)
    if (googleAuthClient.credentials.refresh_token) {
      await saveCredentials(googleAuthClient);
    }

    console.log('Authentification Google réussie.');
    store.set('google_authenticated', true);
    return googleAuthClient;

  } catch (error) {
    console.error("Échec de l'authentification Google:", error);
    store.set('google_authenticated', false);
    throw new Error("Échec de l'authentification Google.");
  }
}

async function getUserInfo() {
  if (!googleAuthClient) {
    console.log('Aucun client Google authentifié, tentative d\'initialisation...');
    try {
      await initGoogleAuth();
    } catch (error) {
      return { error: 'Authentification Google requise.' };
    }
  }

  try {
    // S'assurer que le token d'accès est frais
    await googleAuthClient.getAccessToken();

    const oauth2 = google.oauth2({
      auth: googleAuthClient,
      version: 'v2',
    });
    const { data } = await oauth2.userinfo.get();

    store.set('user_profile', {
      name: data.name,
      email: data.email,
      picture: data.picture,
      source: 'google'
    });
    return data;
  } catch (error) {
    console.error('Erreur lors de la récupération des infos utilisateur (Google):', error.message);
    // Si le token est invalide (ex: révoqué), forcer la ré-authentification
    if (error.response && (error.response.status === 401 || error.response.status === 400)) {
      await logoutGoogle();
      return { error: 'Token invalide ou expiré. Déconnexion.', needsReauth: true };
    }
    return { error: error.message };
  }
}

async function logoutGoogle() {
  googleAuthClient = null;
  store.delete('user_profile');
  store.set('google_authenticated', false);
  try {
    await fs.unlink(TOKEN_PATH);
    console.log('Token Google supprimé.');
  } catch (err) {
    console.warn('Impossible de supprimer le token Google (peut-être inexistant):', err.message);
  }
}

/**
 * Initialise le client Google Auth à partir d'un refresh_token récupéré depuis
 * le backend (MongoDB). Utilisé après un deep link auth quand le fichier
 * google_token.json n'existe pas encore côté Electron.
 *
 * IMPORTANT : Le refresh_token a été obtenu par le serveur Express (OAuth web)
 * avec son propre client_id/client_secret (variables d'env), qui est DIFFÉRENT
 * du client_id/client_secret dans google_credentials.json (OAuth desktop Electron).
 * On doit donc utiliser les mêmes credentials que le serveur pour que le
 * refresh_token soit valide.
 *
 * @param {string} refreshToken - Le refresh_token Google stocké en BDD
 * @param {string} serverClientId - GOOGLE_CLIENT_ID du serveur Express (process.env)
 * @param {string} serverClientSecret - GOOGLE_CLIENT_SECRET du serveur Express (process.env)
 * @returns {OAuth2Client|null} Le client authentifié ou null en cas d'erreur
 */
async function initGoogleAuthFromRefreshToken(refreshToken, serverClientId, serverClientSecret) {
  if (!refreshToken) {
    console.warn('[AUTH] initGoogleAuthFromRefreshToken: refreshToken manquant.');
    return null;
  }
  if (!serverClientId || !serverClientSecret) {
    console.error('[AUTH] initGoogleAuthFromRefreshToken: client_id ou client_secret du serveur manquant.');
    return null;
  }

  try {
    console.log('[AUTH] Construction du client Google avec les credentials du serveur Express...');

    // Sauvegarder le token dans google_token.json avec les credentials du SERVEUR
    // pour que les prochains démarrages puissent le charger via loadSavedCredentialsIfExist()
    const payload = JSON.stringify({
      type: 'authorized_user',
      client_id: serverClientId,
      client_secret: serverClientSecret,
      refresh_token: refreshToken,
      scopes: SCOPES,
    });
    await fs.writeFile(TOKEN_PATH, payload);
    console.log('[AUTH] google_token.json écrit avec le refresh_token + credentials du serveur.');

    // Charger le client depuis le fichier qu'on vient d'écrire
    // google.auth.fromJSON() crée un OAuth2Client avec le bon client_id/secret
    googleAuthClient = await loadSavedCredentialsIfExist();
    if (googleAuthClient) {
      // Vérifier que le token fonctionne (rafraîchir l'access_token)
      await googleAuthClient.getAccessToken();
      console.log('[AUTH] ✅ Client Google initialisé depuis le refresh_token du backend.');
      store.set('google_authenticated', true);
      return googleAuthClient;
    }

    return null;
  } catch (err) {
    console.error('[AUTH] Erreur initGoogleAuthFromRefreshToken:', err.message);
    googleAuthClient = null;
    return null;
  }
}

// Fonction pour exposer le client authentifié à d'autres services (main.js)
function getGoogleAuthClient() {
  return googleAuthClient;
}

module.exports = {
  initGoogleAuth,
  initGoogleAuthFromRefreshToken,
  getUserInfo,
  logoutGoogle,
  getGoogleAuthClient,
  SCOPES,
  CREDENTIALS_PATH,
};
