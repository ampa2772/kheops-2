// electron-app/services/microsoftAuthService.js
//
// Authentification Microsoft (MSAL Public Client + PKCE) pour Electron.
// Pattern : navigateur externe → loopback http://localhost:8400 → échange code+verifier → tokens.
// Aucun client secret n'est utilisé (PKCE remplace le secret).

const { PublicClientApplication, LogLevel, CryptoProvider } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
require('isomorphic-fetch');
const { shell, app } = require('electron');
const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

function getUserDataPath() {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch (_) { /* ignore */ }
  return path.join(os.homedir(), '.kheops-electron');
}

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '3d3c2eab-1119-4901-88a9-f3e9d1332ff0';
const AUTHORITY = process.env.MICROSOFT_AUTHORITY || 'https://login.microsoftonline.com/common';
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:8400';
const REDIRECT_PORT = Number(new URL(REDIRECT_URI).port) || 8400;

const SCOPES = ['User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Mail.Send', 'offline_access'];

const TOKEN_CACHE_PATH = path.join(getUserDataPath(), 'msal_cache.json');

const cachePlugin = {
  beforeCacheAccess: async (context) => {
    try {
      const data = await fs.readFile(TOKEN_CACHE_PATH, 'utf8');
      context.tokenCache.deserialize(data);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[MSAL] Erreur lecture cache:', err.message);
      }
    }
  },
  afterCacheAccess: async (context) => {
    if (context.cacheHasChanged) {
      try {
        await fs.writeFile(TOKEN_CACHE_PATH, context.tokenCache.serialize());
      } catch (err) {
        console.error('[MSAL] Erreur écriture cache:', err.message);
      }
    }
  },
};

const msalConfig = {
  auth: { clientId: CLIENT_ID, authority: AUTHORITY },
  cache: { cachePlugin },
  system: {
    loggerOptions: {
      loggerCallback: (level, message) => {
        if (level === LogLevel.Error) console.error('[MSAL]', message);
      },
      logLevel: LogLevel.Warning,
    },
  },
};

const pca = new PublicClientApplication(msalConfig);

const SUCCESS_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Connexion réussie</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f3f4f6}
.card{background:white;padding:40px 60px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);text-align:center;max-width:480px}
h1{color:#10b981;margin:0 0 12px}p{color:#6b7280;margin:0}</style></head>
<body><div class="card"><h1>✓ Connexion réussie</h1><p>Vous pouvez fermer cet onglet et revenir à l'application Kheops 2.</p></div></body></html>`;

const ERROR_HTML = (msg) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Erreur de connexion</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f3f4f6}
.card{background:white;padding:40px 60px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);text-align:center;max-width:480px}
h1{color:#ef4444;margin:0 0 12px}p{color:#6b7280;margin:0;word-break:break-word}</style></head>
<body><div class="card"><h1>✗ Échec de la connexion</h1><p>${msg}</p></div></body></html>`;

let inFlightLogin = null;

async function login() {
  if (inFlightLogin) return inFlightLogin;

  inFlightLogin = (async () => {
    const cryptoProvider = new CryptoProvider();
    const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
    const state = cryptoProvider.createNewGuid();

    const authCodeUrl = await pca.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state,
      prompt: 'select_account',
    });

    const code = await new Promise((resolve, reject) => {
      let server;
      const timeout = setTimeout(() => {
        if (server) server.close();
        reject(new Error('Délai de connexion dépassé (5 min). Veuillez réessayer.'));
      }, 5 * 60 * 1000);

      server = http.createServer((req, res) => {
        const q = url.parse(req.url, true).query;
        if (q.error) {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(ERROR_HTML(q.error_description || q.error));
          clearTimeout(timeout);
          server.close();
          return reject(new Error(q.error_description || q.error));
        }
        if (q.code && q.state === state) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(SUCCESS_HTML);
          clearTimeout(timeout);
          server.close();
          return resolve(q.code);
        }
        res.writeHead(404).end();
      });

      server.on('error', (err) => {
        clearTimeout(timeout);
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Le port ${REDIRECT_PORT} est déjà utilisé. Fermez l'application qui l'occupe et réessayez.`));
        } else {
          reject(err);
        }
      });

      server.listen(REDIRECT_PORT, '127.0.0.1', () => {
        shell.openExternal(authCodeUrl).catch(reject);
      });
    });

    const tokenResponse = await pca.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: REDIRECT_URI,
      codeVerifier: verifier,
    });

    return tokenResponse;
  })().finally(() => { inFlightLogin = null; });

  return inFlightLogin;
}

async function getCurrentAccount() {
  const accounts = await pca.getTokenCache().getAllAccounts();
  return accounts[0] || null;
}

async function getAccessToken() {
  const account = await getCurrentAccount();
  if (!account) throw new Error('Non connecté à Microsoft. Connectez-vous d\'abord.');

  const result = await pca.acquireTokenSilent({ account, scopes: SCOPES });
  return result.accessToken;
}

function buildGraphClient(accessToken) {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

async function getProfile() {
  const account = await getCurrentAccount();
  if (!account) return null;
  const token = await getAccessToken();
  const graph = buildGraphClient(token);
  const me = await graph.api('/me').select('id,displayName,mail,userPrincipalName').get();
  return {
    id: me.id,
    displayName: me.displayName,
    email: me.mail || me.userPrincipalName,
    homeAccountId: account.homeAccountId,
    tenantId: account.tenantId,
    source: 'microsoft',
  };
}

async function getStatus() {
  const account = await getCurrentAccount();
  return { connected: !!account, account: account ? { username: account.username, name: account.name } : null };
}

async function fetchMessages({ top = 10, folder = 'Inbox' } = {}) {
  const token = await getAccessToken();
  const graph = buildGraphClient(token);
  const response = await graph
    .api(`/me/mailFolders/${folder}/messages`)
    .top(top)
    .select('id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments')
    .orderby('receivedDateTime DESC')
    .get();
  return response.value;
}

async function logout() {
  const account = await getCurrentAccount();
  if (account) {
    try {
      await pca.getTokenCache().removeAccount(account);
    } catch (err) {
      console.warn('[MSAL] removeAccount a échoué:', err.message);
    }
  }
  try {
    await fs.unlink(TOKEN_CACHE_PATH);
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[MSAL] suppression cache:', err.message);
  }
  // CRITIQUE confidentialité multi-user : reset le cache du flow "server"
  // pour qu'aucun access token du user précédent ne survive au logout.
  // Sinon un appel OneDrive ultérieur (avant que le prochain user ait
  // initialisé son client) utiliserait les credentials de l'ancien user.
  serverTokenCache = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Flow "server" — l'utilisateur s'est connecté via /api/auth/microsoft (route
// serveur). Le refresh_token est stocké en MongoDB. Electron le récupère via
// /api/auth/microsoft/get-refresh-token et l'utilise ici pour obtenir des
// access tokens fraîs (utilisés par oneDriveService pour appeler Graph).
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

let serverTokenCache = null; // { accessToken, refreshToken, expiresAt }

async function _refreshServerToken(refreshToken) {
  const response = await axios.post(
    `${AUTHORITY}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      scope: SCOPES.join(' '),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token || refreshToken,
    // marge de sécurité de 60s avant expiration réelle
    expiresAt: Date.now() + (response.data.expires_in * 1000) - 60000,
  };
}

async function initFromRefreshToken(refreshToken) {
  if (!refreshToken) throw new Error('refreshToken vide.');
  serverTokenCache = await _refreshServerToken(refreshToken);
  console.log('[MS Auth] Initialisé depuis refresh token serveur. Access token valide.');
  return serverTokenCache.accessToken;
}

async function getServerAccessToken() {
  if (!serverTokenCache) throw new Error('Microsoft non initialisé côté serveur. Appelez initFromRefreshToken().');
  if (Date.now() >= serverTokenCache.expiresAt) {
    console.log('[MS Auth] Access token expiré, rafraîchissement...');
    serverTokenCache = await _refreshServerToken(serverTokenCache.refreshToken);
  }
  return serverTokenCache.accessToken;
}

function isServerInitialized() {
  return !!serverTokenCache;
}

function clearServerTokenCache() {
  serverTokenCache = null;
  console.log('[MS Auth] Server token cache effacé.');
}

async function getServerProfile() {
  if (!serverTokenCache) return null;
  const token = await getServerAccessToken();
  const graph = buildGraphClient(token);
  const me = await graph.api('/me').select('id,displayName,mail,userPrincipalName').get();
  return {
    id: me.id,
    displayName: me.displayName,
    email: me.mail || me.userPrincipalName,
    source: 'microsoft',
  };
}

module.exports = {
  // Flow "client" (MSAL local — non utilisé pour le login Kheops actuellement)
  login,
  logout,
  getStatus,
  getProfile,
  getAccessToken,
  fetchMessages,
  // Flow "serveur" (login Kheops via /api/auth/microsoft + sync OneDrive)
  initFromRefreshToken,
  getServerAccessToken,
  isServerInitialized,
  clearServerTokenCache,
  getServerProfile,
  // Constantes
  SCOPES,
  CLIENT_ID,
  REDIRECT_URI,
  AUTHORITY,
};
