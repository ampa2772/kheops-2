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
  return res.data; // { ok:true, userId }
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
 * Telecharge le .docx du document dans destPath (stream -> fichier).
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
  return destPath;
}

/**
 * Re-uploade le .docx modifie vers le backend (multipart).
 */
async function uploadDocx(backendBaseUrl, token, docId, filePath) {
  const url = `${backendBaseUrl}/api/word/${encodeURIComponent(docId)}/sync`;
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), { filename: path.basename(filePath) });
  const res = await axios.post(url, form, {
    headers: { ...authHeaders(token), ...form.getHeaders() },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 120_000,
  });
  return res.data;
}

module.exports = {
  whoami,
  acquireLock,
  heartbeat,
  releaseLock,
  downloadDocx,
  uploadDocx,
};
