// server/utils/microsoftGraphExtended.js
//
// Extension Microsoft Graph au-delà de la boîte mail : AGENDA (calendrier
// Outlook) et CONTACTS, en LECTURE SEULE. Réutilise strictement le mécanisme
// d'authentification de microsoftGraphMail (`_graphCall`) — même cache de jeton,
// même rotation de refresh token chiffré. Aucune écriture chez Microsoft.
//
// ⚠️ PORTÉES OAuth (scopes) : ces appels exigent `Calendars.Read` et
// `Contacts.Read`, ajoutés à MICROSOFT_SCOPES (auth.js + microsoftGraphMail.js).
// Ajouter des scopes IMPOSE une nouvelle autorisation : un utilisateur déjà
// connecté à Microsoft AVANT cet ajout devra se reconnecter une fois pour
// accorder l'agenda + les contacts (sinon Graph renvoie 403 ErrorAccessDenied,
// traduit ici en AUTH_SCOPE_MISSING). Sans incidence tant que rien n'est en
// service et qu'aucun compte Microsoft n'est configuré en production.

const { _graphCall } = require('./microsoftGraphMail');

// Normalise une erreur Graph "accès refusé faute de portée" en code stable,
// pour que la route puisse guider l'utilisateur vers une reconnexion.
function _translateScopeError(err) {
  const status = err && err.response && err.response.status;
  const code = err && err.response && err.response.data
    && err.response.data.error && err.response.data.error.code;
  if (status === 403 || code === 'ErrorAccessDenied' || code === 'AccessDenied') {
    const e = new Error('AUTH_SCOPE_MISSING');
    e.cause = err;
    return e;
  }
  return err;
}

// ── AGENDA ──────────────────────────────────────────────────────────────────

function _formatAttendee(a) {
  const ea = (a && a.emailAddress) || {};
  return { name: ea.name || null, email: ea.address || null, type: a && a.type ? a.type : null };
}

/** Projette un événement Graph brut vers une forme stable et sobre. */
function _formatEvent(ev) {
  if (!ev) return null;
  return {
    id: ev.id,
    subject: ev.subject || '(Sans objet)',
    start: ev.start ? ev.start.dateTime : null,
    end: ev.end ? ev.end.dateTime : null,
    timeZone: ev.start ? ev.start.timeZone : null,
    isAllDay: !!ev.isAllDay,
    location: ev.location && ev.location.displayName ? ev.location.displayName : null,
    organizer: ev.organizer ? _formatAttendee(ev.organizer) : null,
    attendees: Array.isArray(ev.attendees) ? ev.attendees.map(_formatAttendee) : [],
    onlineMeetingUrl: ev.onlineMeeting && ev.onlineMeeting.joinUrl ? ev.onlineMeeting.joinUrl : null,
    webLink: ev.webLink || null,
  };
}

/**
 * Liste les événements de l'agenda entre deux dates (bornes ISO 8601).
 * Utilise calendarView (Graph déroule les récurrences sur la fenêtre demandée).
 * @param {string} userId
 * @param {{from:string, to:string, pageToken?:string, maxResults?:number}} opts
 * @returns {Promise<{events:Array, nextPageToken:string|null}>}
 */
async function listCalendarEvents(userId, { from, to, pageToken, maxResults = 50 } = {}) {
  if (!from || !to) throw new Error('CALENDAR_RANGE_REQUIRED');
  let response;
  try {
    if (pageToken && pageToken.startsWith('http')) {
      response = await _graphCall(userId, 'get', pageToken);
    } else {
      response = await _graphCall(userId, 'get', '/me/calendarView', {
        params: {
          startDateTime: from,
          endDateTime: to,
          $orderby: 'start/dateTime',
          $top: Math.min(Math.max(Number(maxResults) || 50, 1), 100),
          $select: 'id,subject,start,end,isAllDay,location,organizer,attendees,onlineMeeting,webLink',
        },
        // Demande à Graph d'exprimer les horaires dans un fuseau explicite.
        headers: { Prefer: 'outlook.timezone="Europe/Paris"' },
      });
    }
  } catch (err) {
    throw _translateScopeError(err);
  }
  const data = response.data || {};
  return {
    events: (data.value || []).map(_formatEvent),
    nextPageToken: data['@odata.nextLink'] || null,
  };
}

// ── CONTACTS ────────────────────────────────────────────────────────────────

/** Projette un contact Graph brut vers une forme stable et sobre. */
function _formatContact(c) {
  if (!c) return null;
  const emails = Array.isArray(c.emailAddresses)
    ? c.emailAddresses.map((e) => (e && e.address ? e.address : null)).filter(Boolean)
    : [];
  const phones = []
    .concat(Array.isArray(c.mobilePhone) ? c.mobilePhone : (c.mobilePhone ? [c.mobilePhone] : []))
    .concat(Array.isArray(c.businessPhones) ? c.businessPhones : [])
    .concat(Array.isArray(c.homePhones) ? c.homePhones : [])
    .filter(Boolean);
  return {
    id: c.id,
    displayName: c.displayName || [c.givenName, c.surname].filter(Boolean).join(' ') || null,
    givenName: c.givenName || null,
    surname: c.surname || null,
    company: c.companyName || null,
    jobTitle: c.jobTitle || null,
    emails,
    phones,
  };
}

/**
 * Liste les contacts Outlook de l'utilisateur (pagination Graph).
 * @param {string} userId
 * @param {{pageToken?:string, maxResults?:number}} opts
 * @returns {Promise<{contacts:Array, nextPageToken:string|null}>}
 */
async function listContacts(userId, { pageToken, maxResults = 50 } = {}) {
  let response;
  try {
    if (pageToken && pageToken.startsWith('http')) {
      response = await _graphCall(userId, 'get', pageToken);
    } else {
      response = await _graphCall(userId, 'get', '/me/contacts', {
        params: {
          $top: Math.min(Math.max(Number(maxResults) || 50, 1), 100),
          $orderby: 'displayName',
          $select: 'id,displayName,givenName,surname,companyName,jobTitle,emailAddresses,mobilePhone,businessPhones,homePhones',
        },
      });
    }
  } catch (err) {
    throw _translateScopeError(err);
  }
  const data = response.data || {};
  return {
    contacts: (data.value || []).map(_formatContact),
    nextPageToken: data['@odata.nextLink'] || null,
  };
}

module.exports = {
  listCalendarEvents,
  listContacts,
  // Helpers exposés pour les tests unitaires
  _formatEvent,
  _formatContact,
  _translateScopeError,
};
