// client/src/services/microsoftGraphClient.js
//
// Service frontend de l'agenda + des contacts Outlook (Microsoft Graph, lecture
// seule). Sépare volontairement du apiClient partagé : il l'IMPORTE seulement.
//
// Routes serveur (cf. server/routes/microsoftGraph.js) :
//   GET /api/microsoft/calendar/events?from=&to=&pageToken=
//   GET /api/microsoft/contacts?pageToken=
//
// Les erreurs applicatives du serveur remontent en { error, message } stables :
//   MICROSOFT_NOT_CONNECTED | MICROSOFT_REAUTH_REQUIRED | MICROSOFT_SCOPE_MISSING
//   | CALENDAR_RANGE_REQUIRED | MICROSOFT_GRAPH_ERROR
// classifyMicrosoftError() les traduit en message lisible + drapeau reconnexion.

import apiClient from './apiClient';

/**
 * Événements de l'agenda Outlook entre deux dates (ISO 8601).
 * from/to optionnels : le serveur applique une fenêtre par défaut (maintenant → +30 jours).
 * @returns {Promise<{events:Array, nextPageToken:string|null}>}
 */
export async function getCalendarEvents({ from, to, pageToken } = {}) {
  const params = {};
  if (from) params.from = from;
  if (to) params.to = to;
  if (pageToken) params.pageToken = pageToken;
  const { data } = await apiClient.get('/api/microsoft/calendar/events', { params });
  return data;
}

/**
 * Contacts Outlook (paginés).
 * @returns {Promise<{contacts:Array, nextPageToken:string|null}>}
 */
export async function getOutlookContacts({ pageToken } = {}) {
  const params = {};
  if (pageToken) params.pageToken = pageToken;
  const { data } = await apiClient.get('/api/microsoft/contacts', { params });
  return data;
}

/**
 * Traduit une erreur d'appel Graph en information exploitable par l'UI.
 * @returns {{code:string, message:string, needsReconnect:boolean, notConnected:boolean}}
 */
export function classifyMicrosoftError(error) {
  const data = error && error.response && error.response.data;
  const code = (data && data.error) || 'MICROSOFT_GRAPH_ERROR';
  const serverMessage = data && data.message;

  switch (code) {
    case 'MICROSOFT_NOT_CONNECTED':
      return {
        code,
        message: serverMessage || 'Aucun compte Microsoft connecté.',
        needsReconnect: false,
        notConnected: true,
      };
    case 'MICROSOFT_REAUTH_REQUIRED':
    case 'MICROSOFT_SCOPE_MISSING':
      return {
        code,
        message: serverMessage || 'Reconnectez-vous à Microsoft pour accorder l\'accès à votre agenda et vos contacts.',
        needsReconnect: true,
        notConnected: false,
      };
    default:
      return {
        code,
        message: serverMessage || 'Microsoft a renvoyé une erreur. Réessayez dans un instant.',
        needsReconnect: false,
        notConnected: false,
      };
  }
}
