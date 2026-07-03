// client/src/services/wordDocumentClient.js
//
// Téléchargement NAVIGATEUR des documents Word générés côté serveur.
// S'appuie sur GET /api/word/:docId/download (server/routes/word.js) qui sert
// le fichier documents/<docId>.docx depuis le stockage serveur (GCS ou disque).
//
// C'était LE trou du mode « tout navigateur » : la route serveur existait,
// mais l'écran répondait « Le téléchargement nécessite l'application de
// bureau ». Ce service comble ce trou, sans compagnon ni Electron.

import apiClient from './apiClient';

/**
 * Télécharge le .docx d'un document dans le navigateur (déclenche
 * l'enregistrement du fichier comme n'importe quel téléchargement web).
 * @param {string} docId  identifiant de la fiche document
 * @param {string} [fileName]  nom proposé à l'utilisateur (défaut <docId>.docx)
 * @returns {Promise<void>}
 * @throws l'erreur axios d'origine (classifiable via classifyWordDownloadError)
 */
export async function downloadWordDocument(docId, fileName) {
  const response = await apiClient.get(`/api/word/${docId}/download`, {
    responseType: 'blob',
  });
  const blob = response.data;
  const url = window.URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || `${docId}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Laisse au navigateur le temps d'amorcer le téléchargement avant de
    // libérer l'adresse temporaire.
    setTimeout(() => window.URL.revokeObjectURL(url), 4000);
  }
}

/**
 * Traduit une erreur de téléchargement en message lisible.
 * NB : la réponse d'erreur est un Blob (responseType:'blob') — on ne peut pas
 * lire response.data.error de façon synchrone, on classe donc par statut HTTP.
 * @returns {{code:string, message:string}}
 */
export function classifyWordDownloadError(error) {
  const status = error && error.response && error.response.status;
  if (status === 404) {
    return {
      code: 'DOCX_ABSENT',
      message: "Ce document n'a pas encore de fichier sur le serveur "
        + "(il a probablement été créé avec l'ancienne application de bureau).",
    };
  }
  if (status === 403 || status === 401) {
    return {
      code: 'ACCES_REFUSE',
      message: "Accès refusé à ce document.",
    };
  }
  return {
    code: 'TELECHARGEMENT_ECHOUE',
    message: 'Le téléchargement a échoué. Réessayez dans un instant.',
  };
}
