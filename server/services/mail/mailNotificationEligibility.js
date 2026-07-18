'use strict';

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function hasDossierContext(contactData) {
  return Array.isArray(contactData?.contexts)
    && contactData.contexts.some((context) => Boolean(context?.dossierId));
}

function isEligibleNotificationSender(email, currentUserEmail, contactsMap) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !(contactsMap instanceof Map)) return false;

  const contactData = contactsMap.get(normalizedEmail);
  if (!contactData) return false;

  const normalizedCurrentUserEmail = normalizeEmail(currentUserEmail);
  if (normalizedEmail !== normalizedCurrentUserEmail) return true;

  // Un auto-message n'est pertinent que si cette adresse est effectivement
  // rattachée à un dossier accessible. Cela évite d'afficher tous les messages
  // personnels de l'utilisateur simplement parce qu'il existe comme contact.
  return hasDossierContext(contactData);
}

function eligibleNotificationEmails(contactsMap, currentUserEmail) {
  if (!(contactsMap instanceof Map)) return [];
  return Array.from(contactsMap.keys())
    .map(normalizeEmail)
    .filter((email, index, emails) => (
      emails.indexOf(email) === index
      && isEligibleNotificationSender(email, currentUserEmail, contactsMap)
    ));
}

module.exports = {
  eligibleNotificationEmails,
  hasDossierContext,
  isEligibleNotificationSender,
  normalizeEmail,
};
