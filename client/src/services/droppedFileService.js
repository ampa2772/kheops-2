// client/src/services/droppedFileService.js
//
// Glisser-déposer de fichiers (Explorateur Windows → « Documents stockés »)
// en MODE WEB PUR. Remplace l'ancien chemin de l'agent Electron local
// (POST http://localhost:8080/api/upload-temp-file + signal socket
// 'process_temp_file'), disparu avec l'application de bureau.
//
// Déroulé pour CHAQUE fichier déposé :
//   1. POST /api/fusion/createDroppedDocumentMetadata
//      → crée la fiche du document dans le dossier (visible dans la liste).
//   2. POST /api/storage/documents/upload (via storageClient)
//      → envoie les octets dans le stockage du cabinet, lié à la fiche
//        (documentId). Quota atomique + types bloqués côté serveur (413/415).
//   3. (.doc/.docx uniquement, best-effort) POST /api/word/:docId/sync
//      → copie sous documents/<docId>.docx pour que le document déposé
//        s'ouvre dans Word via le compagnon et se télécharge comme un
//        document généré.
//
// Anti-orphelin : si l'étape 2 échoue, la fiche créée en 1 est retirée
// (POST /api/fusion/deleteDocument, best-effort) avant de remonter l'erreur.

import apiClient from './apiClient';
import { uploadStoredDocument } from './storageClient';

// La route de stockage applique la meme limite autoritative cote serveur.
// Cette validation cote navigateur evite de creer une fiche temporaire pour
// un fichier qui sera necessairement refuse quelques millisecondes plus tard.
export const MAX_DROPPED_FILE_BYTES = 100 * 1024 * 1024;

const BLOCKED_DROPPED_EXTENSIONS = new Set([
  'exe', 'com', 'scr', 'bat', 'cmd', 'pif', 'msi', 'msp', 'cpl', 'jar',
  'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'sh', 'app',
  'apk', 'dll', 'sys', 'scf', 'lnk', 'reg', 'hta', 'gadget', 'msc',
]);

const BLOCKED_DROPPED_MIME = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-dosexec',
  'application/x-sh',
  'application/x-bat',
  'application/x-executable',
  'application/vnd.microsoft.portable-executable',
  'application/x-msi',
]);

const droppedExtension = (fileName) => {
  const match = String(fileName || '').match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
};

/** Indique si un DataTransfer transporte bien des fichiers du systeme. */
export function isExternalFileDrag(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes('Files');
}

/** Convertit la FileList native en tableau stable et testable. */
export function filesFromDrop(dataTransfer) {
  return Array.from(dataTransfer?.files || []).filter(Boolean);
}

/** Validation immediate, en miroir de la politique autoritative du serveur. */
export function validateDroppedFile(file) {
  if (!file || !String(file.name || '').trim()) {
    throw new Error('Le fichier déposé est invalide ou ne possède pas de nom.');
  }

  if (Number(file.size) > MAX_DROPPED_FILE_BYTES) {
    throw new Error(`« ${file.name} » dépasse la taille maximale autorisée de 100 Mo.`);
  }

  const extension = droppedExtension(file.name);
  const mime = String(file.type || '').toLowerCase();
  if (BLOCKED_DROPPED_EXTENSIONS.has(extension) || BLOCKED_DROPPED_MIME.has(mime)) {
    throw new Error(`Le type de fichier de « ${file.name} » n'est pas autorisé : les exécutables et scripts sont refusés.`);
  }

  return file;
}

/** Message lisible pour l'utilisateur selon l'erreur d'upload serveur. */
function messageForUploadError(err, fileName) {
  const status = err?.response?.status;
  const serverMsg = err?.response?.data?.message;
  if (status === 413) {
    return serverMsg
      || `« ${fileName} » dépasse la taille autorisée ou l'espace de stockage du cabinet est plein.`;
  }
  if (status === 415) {
    return serverMsg || `Le type de fichier de « ${fileName} » n'est pas autorisé.`;
  }
  if (status === 403 || status === 401) {
    return serverMsg || 'Accès refusé à ce dossier.';
  }
  return serverMsg || `L'envoi de « ${fileName} » au stockage a échoué.`;
}

/**
 * Upload web pur d'un fichier déposé dans un dossier.
 * @param {File} file        fichier natif (event.dataTransfer.files)
 * @param {string} dossierId dossier cible
 * @param {string} [subfolderId] sous-dossier cible (vue courante), sinon racine
 * @returns {Promise<object>} la fiche du document créée (métadonnées)
 */
export async function uploadDroppedFileWeb(file, dossierId, subfolderId = null) {
  validateDroppedFile(file);

  // 1) Fiche (métadonnées) — le serveur vérifie l'accès au dossier (cabinet).
  const metaRes = await apiClient.post('/api/fusion/createDroppedDocumentMetadata', {
    dossierId,
    originalFileName: file.name,
    subfolderId: subfolderId || null,
  });
  const doc = metaRes.data?.newDocMetadata;
  if (!doc || !doc._id) {
    throw new Error("Le serveur n'a pas pu créer la fiche du document.");
  }

  // 2) Octets → stockage du cabinet (lié à la fiche via documentId).
  try {
    await uploadStoredDocument(file, { dossierId, documentId: doc._id });
  } catch (err) {
    // Anti-orphelin : retirer la fiche si le fichier n'a pas pu être stocké.
    try {
      await apiClient.post('/api/fusion/deleteDocument', { dossierId, docId: doc._id });
    } catch (cleanupErr) {
      console.warn('[Drop] Nettoyage de la fiche orpheline impossible:', cleanupErr.message);
    }
    throw new Error(messageForUploadError(err, file.name));
  }

  // 3) Miroir Word (best-effort) : rend le .doc/.docx déposé ouvrable dans
  //    Word via le compagnon et téléchargeable par la route word existante.
  if (/\.docx?$/i.test(file.name || '')) {
    try {
      const form = new FormData();
      form.append('file', file);
      await apiClient.post(`/api/word/${doc._id}/sync`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (mirrorErr) {
      // Non bloquant : la copie canonique (stockage cabinet) existe déjà.
      console.warn(`[Drop] Copie Word indisponible pour « ${file.name} »:`, mirrorErr.message);
    }
  }

  return doc;
}

/**
 * Télécharge dans le navigateur un document DÉPOSÉ (ses octets vivent dans le
 * stockage du cabinet — GET /api/storage/documents/:id/download, où :id peut
 * être l'_id de la fiche).
 * @param {object} doc fiche du document ({ _id, nomDocument })
 */
export async function downloadDroppedDocument(doc) {
  const response = await apiClient.get(
    `/api/storage/documents/${encodeURIComponent(doc._id)}/download`,
    { responseType: 'blob' }
  );
  const url = window.URL.createObjectURL(response.data);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.nomDocument || 'document';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Laisse au navigateur le temps d'amorcer le téléchargement.
    setTimeout(() => window.URL.revokeObjectURL(url), 4000);
  }
}
