// Connexion Kheops : identité uniquement. Les droits métier sont accordés par
// des consentements dédiés depuis les paramètres.
const MICROSOFT_LOGIN_SCOPES = Object.freeze([
  'openid',
  'profile',
  'email',
  'User.Read',
]);

const MICROSOFT_MAIL_SCOPES = Object.freeze([
  'openid',
  'profile',
  'email',
  'User.Read',
  'Mail.Read',
  'Mail.ReadWrite',
  'Mail.Send',
  'Calendars.Read',
  'Contacts.Read',
  'offline_access',
]);

const MICROSOFT_ONEDRIVE_SCOPES = Object.freeze([
  'openid',
  'profile',
  'email',
  'User.Read',
  'Files.ReadWrite',
  'offline_access',
]);

const MICROSOFT_SHAREPOINT_SCOPES = Object.freeze([
  'openid',
  'profile',
  'email',
  'User.Read',
  'Sites.ReadWrite.All',
  'offline_access',
]);

const MICROSOFT_CONSUMER_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';

// Par sécurité, une identité dont le tenant n'est pas prouvé est traitée comme
// personnelle. Elle ne peut ainsi jamais contourner une politique « comptes
// professionnels uniquement » à cause d'un id_token absent ou incomplet.
function classifyMicrosoftAccountType(claims = {}) {
  const tenantId = String(claims.tid || '').trim().toLowerCase();
  if (!tenantId || tenantId === MICROSOFT_CONSUMER_TENANT_ID) return 'personal';
  return 'organization';
}

module.exports = {
  MICROSOFT_LOGIN_SCOPES,
  MICROSOFT_MAIL_SCOPES,
  MICROSOFT_ONEDRIVE_SCOPES,
  MICROSOFT_SHAREPOINT_SCOPES,
  MICROSOFT_CONSUMER_TENANT_ID,
  classifyMicrosoftAccountType,
};
