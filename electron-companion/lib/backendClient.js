// electron-companion/lib/backendClient.js
//
// Unique canal du compagnon vers le monde exterieur : le backend Kheops
// (Cloud Run). Le compagnon ne se connecte JAMAIS a MongoDB, ne lit aucun
// secret, ne touche pas a Google Drive. Toute operation passe par des routes
// backend authentifiees par le JETON DE SESSION COMPAGNON (court, signe par le
// serveur, relaye par le web a l'ouverture).

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const DOC_MIME = 'application/msword';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function wordMimeForPath(filePath) {
  return /\.doc$/i.test(String(filePath || '')) ? DOC_MIME : DOCX_MIME;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Valide le jeton compagnon aupres du backend. Renvoie l'userId si valide.
 * @throws si le jeton est invalide/expire (HTTP 401).
 */
async function whoami(backendBaseUrl, token) {
  const url = `${backendBaseUrl}/api/word/companion/whoami`;
  const res = await axios.get(url, { headers: authHeaders(token), timeout: 10_000 });
  return res.data; // { ok:true, userId, expiresAt, sessionAbsoluteExpiresAt }
}

/**
 * Fait tourner le jeton Kheops dedie au compagnon avant son expiration.
 * Le backend n'accepte ici que le jeton compagnon courant et ne renvoie jamais
 * de jeton Google, Microsoft, OneDrive, Drive ou SharePoint.
 */
async function refreshCompanionSession(backendBaseUrl, token, { purpose, docId } = {}) {
  const url = `${backendBaseUrl}/api/word/companion/session`;
  const intent = {};
  if (purpose === 'word' || purpose === 'mirror') intent.purpose = purpose;
  if (purpose === 'word' && docId) intent.docId = String(docId);
  const res = await axios.post(url, intent, {
    headers: authHeaders(token),
    timeout: 10_000,
  });
  const data = res.data || {};
  if (!data.companionToken) {
    const err = new Error('Le backend n a pas renvoye de nouveau jeton compagnon.');
    err.code = 'COMPANION_TOKEN_REFRESH_INVALID_RESPONSE';
    throw err;
  }
  return data;
}

/**
 * Revoque explicitement la chaine de session correspondant au jeton compagnon.
 * L'appel est utilise apres la synchronisation finale (ou lorsqu'une nouvelle
 * chaine remplace celle d'un document deja ouvert). Aucun jeton fournisseur
 * n'est implique ni renvoye.
 */
async function revokeCompanionSession(backendBaseUrl, token) {
  const url = `${backendBaseUrl}/api/word/companion/revoke`;
  const res = await axios.post(url, {}, {
    headers: authHeaders(token),
    timeout: 10_000,
  });
  return res.data;
}

/**
 * Tente d'acquerir le verrou collaboratif du document.
 * @returns {Promise<{granted:boolean, lockedBy?:object}>}
 */
async function acquireLock(backendBaseUrl, token, docId) {
  const url = `${backendBaseUrl}/api/document-locks/${encodeURIComponent(docId)}/acquire`;
  try {
    const res = await axios.post(url, {}, { headers: authHeaders(token), timeout: 10_000 });
    return { granted: !!res.data.granted };
  } catch (err) {
    if (err.response && err.response.status === 409) {
      return { granted: false, lockedBy: err.response.data && err.response.data.lockedBy };
    }
    throw err;
  }
}

async function heartbeat(backendBaseUrl, token, docId) {
  const url = `${backendBaseUrl}/api/document-locks/${encodeURIComponent(docId)}/heartbeat`;
  return axios.post(url, {}, { headers: authHeaders(token), timeout: 10_000 });
}

async function releaseLock(backendBaseUrl, token, docId) {
  const url = `${backendBaseUrl}/api/document-locks/${encodeURIComponent(docId)}/release`;
  return axios.post(url, {}, { headers: authHeaders(token), timeout: 10_000 });
}

/**
 * Manifeste du MIROIR LOCAL (Phase 2) : liste des dossiers (noms lisibles) et
 * documents a materialiser dans C:\Files_Clients. Par defaut (compagnon
 * autonome), le backend repond mirrorEnabled=false pour les comptes avec
 * cloud personnel. L'application Electron historique peut demander
 * explicitement le mode `client=electron` : le backend reste alors l'unique
 * interlocuteur du fournisseur et aucun jeton Google/Microsoft n'est remis au
 * processus Electron.
 */
async function getMirrorManifest(backendBaseUrl, token, { electronClient = false } = {}) {
  const url = `${backendBaseUrl}/api/word/mirror/manifest`;
  const res = await axios.get(url, {
    headers: authHeaders(token),
    timeout: 30_000,
    ...(electronClient ? { params: { client: 'electron' } } : {}),
  });
  return res.data;
}

/**
 * Lit uniquement la précondition de version d'un document déjà présent en
 * local. Express traite HEAD avec le handler GET correspondant mais ne renvoie
 * pas le corps : on ne remplace donc jamais un fichier local historique pour
 * découvrir sa base de synchronisation.
 */
async function getDocumentBaseVersion(backendBaseUrl, token, docId) {
  const url = `${backendBaseUrl}/api/word/${encodeURIComponent(docId)}/download`;
  const res = await axios.head(url, {
    headers: authHeaders(token),
    timeout: 30_000,
  });
  const value = res.headers && res.headers['x-kheops-base-version-id'];
  return value ? String(value) : null;
}

/**
 * Telecharge le document Word (.doc ou .docx) dans destPath (stream -> fichier).
 */
async function downloadDocx(backendBaseUrl, token, docId, destPath) {
  const url = `${backendBaseUrl}/api/word/${encodeURIComponent(docId)}/download`;
  const res = await axios.get(url, {
    headers: authHeaders(token),
    responseType: 'stream',
    timeout: 60_000,
  });
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(destPath);
    res.data.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
    res.data.on('error', reject);
  });
  return {
    filePath: destPath,
    // Axios normalise les noms d'en-têtes en minuscules. Cette valeur peut
    // être un identifiant d'historique ou une précondition sha256:... pour un
    // ancien document pas encore versionné.
    baseVersionId: res.headers && res.headers['x-kheops-base-version-id']
      ? String(res.headers['x-kheops-base-version-id'])
      : null,
  };
}

/**
 * Re-uploade le document Word modifie vers le backend (multipart). Le type de
 * chaque partie est explicite : il ne depend pas de la table MIME du poste et
 * un ancien .doc ne peut donc jamais être annoncé comme un DOCX.
 */
async function uploadDocx(backendBaseUrl, token, docId, filePath, { baseVersionId } = {}) {
  const url = `${backendBaseUrl}/api/word/${encodeURIComponent(docId)}/sync`;
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: wordMimeForPath(filePath),
  });
  if (baseVersionId) form.append('baseVersionId', String(baseVersionId));
  try {
    const res = await axios.post(url, form, {
      headers: { ...authHeaders(token), ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120_000,
    });
    return res.data;
  } catch (err) {
    if (err.response && err.response.status === 409
      && err.response.data?.error === 'DOCUMENT_VERSION_CONFLICT') {
      const conflict = new Error(
        err.response.data.message
          || 'Une version plus récente existe. Votre version a été conservée séparément.'
      );
      conflict.code = 'DOCUMENT_VERSION_CONFLICT';
      conflict.details = err.response.data;
      throw conflict;
    }
    throw err;
  }
}

module.exports = {
  whoami,
  refreshCompanionSession,
  revokeCompanionSession,
  acquireLock,
  heartbeat,
  releaseLock,
  getMirrorManifest,
  getDocumentBaseVersion,
  downloadDocx,
  uploadDocx,
  _private: { wordMimeForPath },
};
