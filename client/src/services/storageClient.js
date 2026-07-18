// client/src/services/storageClient.js
//
// Service frontend du STOCKAGE documentaire (R4). Volontairement SÉPARÉ de
// apiClient.js (édité par Codex pour le mail) pour éviter tout télescopage —
// il se contente d'IMPORTER apiClient (lecture seule), sans le modifier.
//
// S'appuie sur les routes serveur livrées par Codex (cf. AI_COORDINATION.md) :
//   GET    /api/storage/usage                   espace utilisé / quota du cabinet
//   POST   /api/storage/provider/select         choix du rangement (google_drive|onedrive|managed_gcs)
//   GET    /api/storage/documents               liste cloisonnée
//   POST   /api/storage/documents/upload        dépôt d'un fichier (multipart)
//   GET    /api/storage/documents/:id/download  téléchargement (ou URL temporaire)
//   DELETE /api/storage/documents/:id           suppression (corbeille)

import apiClient from './apiClient';

export const STORAGE_PROVIDERS = Object.freeze({
  GOOGLE_DRIVE: 'google_drive',
  ONEDRIVE: 'onedrive',
  MANAGED_GCS: 'managed_gcs',
});

// Libellés présentés à l'utilisateur (non techniques).
export const STORAGE_PROVIDER_LABELS = Object.freeze({
  google_drive: 'Google Drive',
  onedrive: 'OneDrive',
  managed_gcs: 'Stockage sécurisé Corodia',
});

/** Espace utilisé + quota du cabinet : { usedBytes, quotaBytes, percent? }. */
export async function getStorageUsage() {
  const { data } = await apiClient.get('/api/storage/usage');
  return data;
}

/**
 * A3 — statut de connexion du OneDrive PERSONNEL de l'utilisateur courant.
 * @returns {Promise<{connected:boolean, connectEndpoint:string}>}
 */
export async function getOneDriveStatus() {
  const { data } = await apiClient.get('/api/storage/onedrive/status');
  return data;
}

/**
 * Lance le consentement OneDrive dédié sans modifier la connexion Kheops/Outlook.
 */
async function dedicatedConnectUrl(endpoint) {
  const { data } = await apiClient.post(endpoint);
  if (!data?.authorizationUrl) throw new Error("L'adresse de connexion n'a pas été fournie.");
  return data.authorizationUrl;
}

export function microsoftConnectUrl() {
  return dedicatedConnectUrl('/api/auth/microsoft/connect-url');
}

/**
 * A3 — statut de connexion du Google Drive PERSONNEL de l'utilisateur courant.
 * @returns {Promise<{connected:boolean, connectEndpoint:string}>}
 */
export async function getGoogleDriveStatus() {
  const { data } = await apiClient.get('/api/storage/googledrive/status');
  return data;
}

/** Lance le consentement Google Drive dédié sans modifier la connexion Kheops/Gmail. */
export function googleConnectUrl() {
  return dedicatedConnectUrl('/api/auth/google/connect-url');
}

export function sharePointConnectUrl() {
  return dedicatedConnectUrl('/api/auth/microsoft/sharepoint-connect-url');
}

/** Définit le mode de rangement du cabinet. */
export async function selectStorageProvider(provider) {
  const { data } = await apiClient.post('/api/storage/provider/select', { provider });
  return data;
}

// ── SharePoint PAR UTILISATEUR (Volet B) — optionnel, jamais partagé ─────────
// Chaque utilisateur connecte SON PROPRE SharePoint. Ces appels sont per-USER.

/**
 * Statut + détection SharePoint du compte courant.
 * @returns {Promise<{connected:boolean, available:boolean, enabled:boolean,
 *   promptDismissed:boolean, selected:?object, sites:Array, connectEndpoint:string}>}
 */
export async function getSharePointStatus() {
  const { data } = await apiClient.get('/api/storage/sharepoint/status');
  return data;
}

/** L'utilisateur choisit son site SharePoint (active SharePoint pour lui). */
export async function selectSharePointSite({ siteId, siteName, webUrl, driveId } = {}) {
  const { data } = await apiClient.post('/api/storage/sharepoint/select-site', {
    siteId, siteName, webUrl, driveId,
  });
  return data;
}

/** Désactive SharePoint pour l'utilisateur (retour au rangement du cabinet). */
export async function disableSharePoint() {
  const { data } = await apiClient.post('/api/storage/sharepoint/disable', {});
  return data;
}

/** « Ne plus me proposer » : masque définitivement la modale d'invitation. */
export async function dismissSharePointPrompt() {
  const { data } = await apiClient.post('/api/storage/sharepoint/dismiss-prompt', {});
  return data;
}

/**
 * Backfill : crée sur le cloud de l'utilisateur (SharePoint/OneDrive/Drive) les
 * dossiers lisibles de TOUS ses dossiers existants (même créés avant) ET y
 * recopie les documents restés sur le stockage interne. Idempotent.
 * @returns {Promise<{total:number, ok:number, skipped:number, reasons:Object,
 *   folders:Object, documents:Object}>}
 */
export async function backfillCloudFolders() {
  const { data } = await apiClient.post('/api/storage/cloud-folders/backfill', {});
  return data;
}

/**
 * Sync (fire-and-forget) d'UN dossier : recopie vers le cloud personnel de
 * l'utilisateur les documents de ce dossier restés sur le stockage interne.
 * Le serveur répond 202 immédiatement et poursuit en arrière-plan. Idempotent :
 * les documents déjà sur cloud perso sont ignorés. À appeler à l'ouverture d'un
 * dossier. Best-effort côté client : ne jette pas (échec silencieux).
 * @param {string} dossierId
 * @returns {Promise<boolean>} true si la demande a été acceptée.
 */
export async function syncDossierDocuments(dossierId) {
  if (!dossierId) return false;
  try {
    await apiClient.post(`/api/storage/dossiers/${encodeURIComponent(dossierId)}/sync-documents`, {});
    return true;
  } catch (_e) {
    return false;
  }
}

/** Liste les documents (optionnellement filtrés par dossier). */
export async function listStoredDocuments({ dossierId } = {}) {
  const params = {};
  if (dossierId) params.dossierId = dossierId;
  const { data } = await apiClient.get('/api/storage/documents', { params });
  return data.documents || [];
}

/** Dépose un fichier dans le stockage interne (FormData). */
export async function uploadStoredDocument(file, { dossierId, documentId } = {}) {
  const form = new FormData();
  form.append('file', file);
  if (dossierId) form.append('dossierId', dossierId);
  if (documentId) form.append('documentId', documentId);
  const { data } = await apiClient.post('/api/storage/documents/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** Obtient une URL de téléchargement temporaire pour un document. */
export async function getStoredDocumentDownloadUrl(id, { versionId, expiresInSec } = {}) {
  const params = { signed: 'true' };
  if (versionId) params.versionId = versionId;
  if (expiresInSec) params.expiresInSec = expiresInSec;
  const { data } = await apiClient.get(`/api/storage/documents/${encodeURIComponent(id)}/download`, { params });
  return data.url;
}

/** Supprime (corbeille) un document. */
export async function deleteStoredDocument(id) {
  const { data } = await apiClient.delete(`/api/storage/documents/${encodeURIComponent(id)}`);
  return data;
}

/** Convertit un nombre d'octets en libellé lisible (ex. « 2,3 Go »). */
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(1).replace('.', ',')} ${units[i]}`;
}
