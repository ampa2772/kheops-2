// server/services/storage/sharePointClient.js
//
// Client Microsoft Graph pour le SharePoint PAR UTILISATEUR (Volet B).
//
// Principe (confidentialite) : il n'existe AUCUN compte SharePoint « cabinet »
// central / partage. Chaque utilisateur connecte SON PROPRE SharePoint via SON
// jeton Microsoft delegue (scope Sites.ReadWrite.All). Les documents qu'il depose
// sont ranges dans le site/drive qu'IL a choisi, dans son propre espace.
//
// Isolation volontaire du jeton : ce module gere son PROPRE rafraichissement de
// jeton, demandant explicitement le scope Sites.ReadWrite.All. Il NE reutilise
// PAS getAccessTokenForUser() de microsoftGraphMail (qui ne demande que les
// scopes mail/OneDrive) afin de ne JAMAIS risquer de casser la messagerie :
//   - si l'utilisateur n'a pas SharePoint (compte perso Outlook) ou si le scope
//     Sites.ReadWrite.All n'a pas ete consenti (admin M365), le rafraichissement
//     echoue proprement -> SharePoint « non connecte » -> aucune modale, aucun
//     impact sur le mail/OneDrive.
// Le refresh_token dédié vit dans User.microsoftSharePointRefreshToken. Un
// repli sur l'ancien jeton Microsoft conserve les comptes qui avaient déjà
// accordé Sites.ReadWrite.All avant la séparation des consentements.

const axios = require('axios');
const User = require('../../models/App_Users/User');
const { encryptIfNeeded, decryptIfNeeded } = require('../../utils/tokenCrypto');
const { MICROSOFT_SHAREPOINT_SCOPES } = require('../../utils/microsoftOAuthScopes');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || process.env.MSAL_CLIENT_ID;
const AUTHORITY = process.env.MICROSOFT_AUTHORITY || 'https://login.microsoftonline.com/common';

// Scopes demandes au rafraichissement pour SharePoint. Sites.ReadWrite.All est
// « admin-consent » cote organisation Microsoft 365. offline_access garantit la
// remise d'un refresh_token rotatif.
const SHAREPOINT_SCOPES = MICROSOFT_SHAREPOINT_SCOPES;

// userId -> { accessToken, refreshToken, expiresAt }
const tokenCache = new Map();

// Erreur normalisee « SharePoint non connecte » (jeton absent / refresh echoue /
// scope Sites non consenti). 428 : le client doit (re)connecter Microsoft.
function notConnectedError(cause) {
  const err = new Error(
    'SharePoint non connecte pour cet utilisateur : une connexion Microsoft avec le scope Sites.ReadWrite.All est requise.',
  );
  err.statusCode = 428;
  err.code = 'SHAREPOINT_NOT_CONNECTED';
  if (cause) err.cause = cause;
  return err;
}

async function _refresh(refreshToken) {
  const response = await axios.post(
    `${AUTHORITY}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      scope: SHAREPOINT_SCOPES.join(' '),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 },
  );
  return {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token || refreshToken,
    expiresAt: Date.now() + (response.data.expires_in * 1000) - 60000,
    // Scopes REELLEMENT accordes. ATTENTION : `scope` est OPTIONNEL dans la
    // reponse OAuth v2.0 — on preserve `undefined` (NE PAS coercer en '') pour
    // distinguer « absent » (= scopes demandes accordes) de « present mais sans
    // Sites » (= downscope avere). Voir tokenFor.
    scope: response.data.scope,
  };
}

// Jeton d'acces couvrant Sites.ReadWrite.All pour l'utilisateur. Leve
// notConnectedError si SharePoint n'est pas accessible (pas de refresh token,
// scope non consenti, compte perso sans SharePoint...).
async function tokenFor(userId) {
  const key = String(userId);
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    // Cache negatif : compte joignable mais SANS le scope Sites (compte perso /
    // consentement admin absent) -> on evite de re-refresh (et de re-roter le RT
    // PARTAGE) a chaque probe de statut.
    if (cached.hasSites === false) throw notConnectedError('SITES_SCOPE_NOT_GRANTED');
    return cached.accessToken;
  }

  const user = await User.findById(userId).select('microsoftSharePointRefreshToken microsoftRefreshToken');
  const tokenField = user?.microsoftSharePointRefreshToken
    ? 'microsoftSharePointRefreshToken'
    : 'microsoftRefreshToken';
  const encryptedToken = user?.[tokenField];
  if (!user || !encryptedToken) throw notConnectedError('AUTH_REQUIRED');

  const refreshTokenPlain = decryptIfNeeded(encryptedToken);
  if (!refreshTokenPlain) throw notConnectedError('AUTH_REFRESH_FAILED');

  try {
    const fresh = await _refresh(refreshTokenPlain);
    // PERSISTER LA ROTATION EN PREMIER — Azure a deja invalide l'ancien RT cote
    // serveur des que le refresh a reussi. On sauve le nouveau AVANT toute autre
    // decision (y compris un rejet pour scope manquant), sinon le RT rote serait
    // orphelin et le mail casserait en essayant l'ancien. Compare-and-set : on
    // n'ecrase QUE si personne d'autre (mail/OneDrive) n'a roule le RT entre-temps
    // — evite d'ecraser un RT plus recent (course de refresh partage).
    if (fresh.refreshToken !== refreshTokenPlain) {
      await User.updateOne(
        { _id: userId, [tokenField]: encryptedToken },
        { $set: { [tokenField]: encryptIfNeeded(fresh.refreshToken) } },
      );
    }
    // Sites.ReadWrite.All accorde ? Le champ `scope` est OPTIONNEL (doc Entra
    // v2.0) : s'il est ABSENT, le token porte les scopes DEMANDES (donc Sites)
    // -> accorde. On ne rejette (428, « non connecte ») QUE si Entra a
    // EXPLICITEMENT renvoye une liste EXCLUANT Sites (downscope avere) — sinon on
    // deconnecterait a tort un compte pourtant consenti (faux 428 intermittent).
    const granted = fresh.scope != null ? String(fresh.scope).toLowerCase() : null;
    const hasSites = granted === null || granted.includes('sites.readwrite.all');
    // Mise en cache DANS TOUS LES CAS (avec le marqueur hasSites) : amortit les
    // probes suivantes et evite de re-roter le RT partage a chaque appel de statut
    // pour les comptes sans SharePoint.
    tokenCache.set(key, { ...fresh, hasSites });
    if (!hasSites) throw notConnectedError('SITES_SCOPE_NOT_GRANTED');
    return fresh.accessToken;
  } catch (err) {
    // invalid_grant : refresh revoque. Les autres erreurs (consent_required,
    // interaction_required, scope non accorde) signifient toutes « SharePoint
    // indisponible pour ce compte » -> non connecte (jamais une erreur mail).
    if (err.statusCode === 428) throw err;
    throw notConnectedError(err.response?.data?.error || err.message);
  }
}

// Mappe une erreur d'authentification Graph (401/403 sur un appel /sites ou
// /drives) vers notConnectedError (428) : le client sait alors qu'une
// (re)connexion / un consentement Microsoft est requis, au lieu de recevoir un
// 500 opaque « Request failed with status code 403 ». Les autres erreurs passent.
function mapGraphAuthError(err) {
  const s = err?.response?.status;
  if (s === 401 || s === 403) {
    return notConnectedError(err.response?.data?.error?.code || `HTTP_${s}`);
  }
  return err;
}

function encodePath(pathStr) {
  return String(pathStr)
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

// ── Detection / choix du site ───────────────────────────────────────────────

/**
 * Liste les sites SharePoint accessibles a l'utilisateur. Sert de SONDE de
 * disponibilite : si l'appel reussit, l'utilisateur « a » SharePoint. Ne leve
 * PAS pour un compte sans SharePoint : renvoie [] (le detecteur en deduit
 * available=false). Leve uniquement si le jeton lui-meme est inutilisable.
 * @returns {Promise<Array<{siteId,name,webUrl}>>}
 */
async function listSites(userId) {
  const token = await tokenFor(userId);
  const headers = { Authorization: `Bearer ${token}` };
  const out = new Map();

  // 1) Recherche large (org M365). '*' matche tous les sites indexes.
  try {
    const resp = await axios.get(`${GRAPH_BASE}/sites`, {
      headers,
      params: { search: '*', $select: 'id,name,displayName,webUrl', $top: 50 },
      timeout: 20000,
      validateStatus: (s) => (s >= 200 && s < 300) || s === 400 || s === 403 || s === 404,
    });
    for (const s of resp.data?.value || []) {
      if (s.id) out.set(s.id, { siteId: s.id, name: s.displayName || s.name || s.webUrl, webUrl: s.webUrl });
    }
  } catch (_) { /* sonde tolerante */ }

  // 2) Sites suivis par l'utilisateur (complete la recherche).
  try {
    const resp = await axios.get(`${GRAPH_BASE}/me/followedSites`, {
      headers,
      params: { $select: 'id,name,displayName,webUrl' },
      timeout: 20000,
      validateStatus: (s) => (s >= 200 && s < 300) || s === 400 || s === 403 || s === 404,
    });
    for (const s of resp.data?.value || []) {
      if (s.id && !out.has(s.id)) out.set(s.id, { siteId: s.id, name: s.displayName || s.name || s.webUrl, webUrl: s.webUrl });
    }
  } catch (_) { /* sonde tolerante */ }

  // 3) Site racine du tenant (repli minimal si rien d'autre).
  if (out.size === 0) {
    try {
      const resp = await axios.get(`${GRAPH_BASE}/sites/root`, {
        headers,
        params: { $select: 'id,name,displayName,webUrl' },
        timeout: 15000,
      });
      const s = resp.data;
      if (s?.id) out.set(s.id, { siteId: s.id, name: s.displayName || s.name || s.webUrl, webUrl: s.webUrl });
    } catch (_) { /* pas de SharePoint accessible */ }
  }

  return Array.from(out.values());
}

/**
 * Bibliotheque de documents (drive) par defaut d'un site. Utilisee au moment ou
 * l'utilisateur CHOISIT un site : on y rangera ses documents.
 * @returns {Promise<{driveId,name,webUrl}>}
 */
async function getSiteDefaultDrive(userId, siteId) {
  const token = await tokenFor(userId);
  try {
    const resp = await axios.get(`${GRAPH_BASE}/sites/${encodeURIComponent(siteId)}/drive`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { $select: 'id,name,webUrl' },
      timeout: 15000,
    });
    return { driveId: resp.data.id, name: resp.data.name, webUrl: resp.data.webUrl };
  } catch (err) {
    throw mapGraphAuthError(err);
  }
}

/** Detection complete : { available, sites[] }. Ne leve jamais. */
async function detect(userId) {
  try {
    const sites = await listSites(userId);
    return { available: sites.length > 0, sites };
  } catch (_) {
    return { available: false, sites: [] };
  }
}

/** Sonde booleenne : le SharePoint de l'utilisateur est-il joignable ? */
async function isConnected(userId) {
  try {
    await tokenFor(userId);
    return true;
  } catch (_) {
    return false;
  }
}

function clearTokenCache(userId) {
  tokenCache.delete(String(userId));
}

/**
 * Cree (ou retrouve) une HIERARCHIE de dossiers dans le drive SharePoint choisi
 * par l'utilisateur, et renvoie l'item feuille. IDEMPOTENT (reutilise l'existant,
 * gere la course via conflictBehavior=fail + relecture sur 409). Sert a
 * MATERIALISER un dossier (vide) des sa creation dans l'appli.
 * @returns {Promise<{itemId:string, webUrl:string}>}
 */
async function ensureFolderPath(userId, driveId, segments) {
  if (!driveId) {
    const err = new Error('driveId SharePoint manquant.');
    err.statusCode = 400;
    err.code = 'MISSING_SHAREPOINT_DRIVE';
    throw err;
  }
  const token = await tokenFor(userId);
  const headers = { Authorization: `Bearer ${token}` };
  const base = `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}`;
  let path = '';
  let item = null;
  try {
    for (const seg of segments) {
      const next = path ? `${path}/${seg}` : String(seg);
      let resp = await axios.get(`${base}/root:/${encodePath(next)}`, {
        headers,
        params: { $select: 'id,webUrl' },
        timeout: 20000,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
      });
      if (resp.status === 404) {
        const parentUrl = path
          ? `${base}/root:/${encodePath(path)}:/children`
          : `${base}/root/children`;
        const createResp = await axios.post(
          parentUrl,
          { name: String(seg), folder: {}, '@microsoft.graph.conflictBehavior': 'fail' },
          { headers, timeout: 20000, validateStatus: (s) => (s >= 200 && s < 300) || s === 409 },
        );
        if (createResp.status === 409) {
          resp = await axios.get(`${base}/root:/${encodePath(next)}`, {
            headers, params: { $select: 'id,webUrl' }, timeout: 20000,
          });
          item = resp.data;
        } else {
          item = createResp.data;
        }
      } else {
        item = resp.data;
      }
      path = next;
    }
    return { itemId: item.id, webUrl: item.webUrl };
  } catch (err) {
    throw mapGraphAuthError(err);
  }
}

// ── Operations fichiers sur un drive SharePoint donne ───────────────────────

/** Upload simple (PUT .../root:/{path}:/content). */
async function uploadFile(userId, driveId, { path, buffer, mime, idempotencyKey }) {
  if (!driveId) {
    const err = new Error('driveId SharePoint manquant.');
    err.statusCode = 400;
    err.code = 'MISSING_SHAREPOINT_DRIVE';
    throw err;
  }
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error('Buffer fichier manquant.');
    err.statusCode = 400;
    err.code = 'MISSING_FILE_BUFFER';
    throw err;
  }
  const token = await tokenFor(userId);
  if (idempotencyKey) return require('./immutableGraphUpload').immutableGraphUpload({
    token,driveRoot:`${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}`,path,buffer,idempotencyKey,
  });
  // conflictBehavior=rename (et NON replace) : deux documents DISTINCTS de meme
  // nom dans le meme dossier produisent le meme chemin ; « replace » ecraserait
  // silencieusement le premier (perte de donnees). « rename » fait ajouter un
  // suffixe « (1) » par Graph et renvoie un itemId DISTINCT (capture dans le
  // storageKey). Les vraies nouvelles versions ne collisionnent pas (« (vN) »).
  const url =
    `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/root:/${encodePath(path)}:/content` +
    '?%40microsoft.graph.conflictBehavior=rename';
  try {
    const resp = await axios.put(url, buffer, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mime || 'application/octet-stream',
      },
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return {
      itemId: resp.data.id,
      size: resp.data.size,
      webUrl: resp.data.webUrl,
      name: resp.data.name,
    };
  } catch (err) {
    throw mapGraphAuthError(err);
  }
}

async function downloadFile(userId, driveId, itemId) {
  const token = await tokenFor(userId);
  try {
    const resp = await axios.get(
      `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`,
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
        timeout: 60000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      },
    );
    return Buffer.from(resp.data);
  } catch (err) {
    throw mapGraphAuthError(err);
  }
}

async function getDownloadUrl(userId, driveId, itemId) {
  const token = await tokenFor(userId);
  let resp;
  try {
    resp = await axios.get(
      `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { $select: 'id,@microsoft.graph.downloadUrl' },
        timeout: 30000,
      },
    );
  } catch (err) {
    throw mapGraphAuthError(err);
  }
  const url = resp.data['@microsoft.graph.downloadUrl'];
  if (!url) {
    const err = new Error('URL de telechargement SharePoint indisponible.');
    err.statusCode = 502;
    err.code = 'SHAREPOINT_NO_DOWNLOAD_URL';
    throw err;
  }
  return url;
}

async function deleteItem(userId, driveId, itemId) {
  const token = await tokenFor(userId);
  try {
    await axios.delete(
      `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 404, // 404 = deja supprime : idempotent
      },
    );
    return { ok: true };
  } catch (err) {
    throw mapGraphAuthError(err);
  }
}

async function itemExists(userId, driveId, itemId) {
  const token = await tokenFor(userId);
  try {
    const resp = await axios.get(
      `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { $select: 'id' },
        timeout: 30000,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
      },
    );
    return resp.status !== 404;
  } catch (err) {
    throw mapGraphAuthError(err);
  }
}

module.exports = {
  // detection / choix
  listSites,
  getSiteDefaultDrive,
  detect,
  isConnected,
  clearTokenCache,
  // fichiers
  uploadFile,
  downloadFile,
  getDownloadUrl,
  deleteItem,
  itemExists,
  ensureFolderPath,
  notConnectedError,
  _encodePath: encodePath,
  _refresh,
};
