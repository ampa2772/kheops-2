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
import { resolveApiBase } from '../utils/apiBase';

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
 * @returns {Promise<{connected:boolean, connectUrl:string}>}
 */
export async function getOneDriveStatus() {
  const { data } = await apiClient.get('/api/storage/onedrive/status');
  return data;
}

/**
 * URL absolue de connexion Microsoft (même pattern que le login) — le login MS
 * consent déjà Files.ReadWrite, ce qui « connecte » le OneDrive de l'utilisateur.
 */
export function microsoftConnectUrl() {
  return `${resolveApiBase()}/api/auth/microsoft`;
}

/**
 * A3 — statut de connexion du Google Drive PERSONNEL de l'utilisateur courant.
 * @returns {Promise<{connected:boolean, connectUrl:string}>}
 */
export async function getGoogleDriveStatus() {
  const { data } = await apiClient.get('/api/storage/googledrive/status');
  return data;
}

/** URL absolue de connexion Google (le login Google consent déjà drive.file). */
export function googleConnectUrl() {
  return `${resolveApiBase()}/api/auth/google`;
}

/** Définit le mode de rangement du cabinet. */
export async function selectStorageProvider(provider) {
  const { data } = await apiClient.post('/api/storage/provider/select', { provider });
  return data;
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
