/**
 * Helpers partagés par le carnet de contacts et le flux « Parties ».
 * Les propriétés `linkRoles` sont transitoires : elles servent à choisir les
 * rôles lors d'une liaison et ne constituent pas un nouveau modèle de contact.
 */

export const getEntityId = (entity) => String(entity?._id ?? entity?.idPartie ?? '');

export const isLawyerContact = (contact = {}) => {
  const type = String(contact.type || contact.roleOfficeUser || '').trim().toLowerCase();
  return contact.isAvocat === true || (
    contact.pro_contact === true && (type === 'avocat' || type === 'avocate')
  ) || type === 'avocat' || type === 'avocate';
};

export const normalizeLawyerRoles = (source = {}) => ({
  isPlaidant: source?.isPlaidant === true || source?.linkRoles?.isPlaidant === true,
  isPostulant: source?.isPostulant === true || source?.linkRoles?.isPostulant === true,
});

export const hasLawyerRole = (source = {}) => {
  const roles = normalizeLawyerRoles(source);
  return roles.isPlaidant || roles.isPostulant;
};

export const withLawyerRoles = (contact, roles) => {
  const normalized = normalizeLawyerRoles(roles);
  return {
    ...contact,
    isPlaidant: normalized.isPlaidant,
    isPostulant: normalized.isPostulant,
    linkRoles: normalized,
  };
};

export const getContactTypeLabel = (contact = {}) => {
  if (isLawyerContact(contact)) return 'Avocat';
  if (contact.pro_contact) return contact.type || 'Professionnel';
  if (contact.raisonSociale) return 'Organisation privée';
  if (contact.denomination) return 'Organisation publique';
  return 'Particulier / non professionnel';
};

export const getContactMeta = (contact = {}) => [
  contact.email || contact.emailEntreprise || contact.contactEmail,
  contact.ville || contact.villePM,
  contact.cabinet || contact.raisonSociale,
].filter(Boolean);
