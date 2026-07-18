const asArray = (value) => (Array.isArray(value) ? value : []);

export const getRecipientEntityId = (entityOrId) => {
  if (entityOrId === null || entityOrId === undefined) return '';
  const raw = typeof entityOrId === 'object'
    ? (entityOrId._id ?? entityOrId.id)
    : entityOrId;
  return raw === null || raw === undefined ? '' : String(raw);
};

export const getRecipientEntityEmails = (entity) => {
  if (!entity) return [];

  return [
    entity.email,
    entity.emailEntreprise,
    entity.interlocuteurEmail,
    entity.contactEmail,
  ]
    .map((email) => (typeof email === 'string' ? email.trim().toLowerCase() : ''))
    .filter(Boolean);
};

const resolveDossierContent = (dossier) => {
  if (dossier?.dossier?.parties || dossier?.dossier?.contactsDuDossier) {
    return dossier.dossier;
  }
  if (dossier?.parties || dossier?.contactsDuDossier) return dossier;
  return null;
};

const isEmbeddedPartyEntity = (value) => !!(
  value
  && (
    value.nom
    || value.prenoms
    || value.raisonSociale
    || value.denomination
    || getRecipientEntityEmails(value).length > 0
  )
);

/**
 * Construit les groupes affichés par « Choisir un contact » lors de l'envoi
 * d'un courriel depuis un dossier.
 *
 * Ordre de priorité en cas de doublon : partie principale, avocat/contact lié,
 * puis contact directement lié au dossier. Une même entité n'est affichée
 * qu'une fois si son identifiant OU l'une de ses adresses e-mail a déjà été vu.
 */
export const buildDossierEmailRecipientGroups = (dossier, officeUsers = []) => {
  const result = { pour: [], contre: [], dossierContacts: [] };
  const content = resolveDossierContent(dossier);
  if (!content) return result;

  const responsables = asArray(content.responsables).length > 0
    ? content.responsables
    : asArray(content.dossier?.responsables);
  const excludedIds = new Set([
    ...asArray(responsables),
    ...asArray(content.avocatsResponsables),
  ].map(getRecipientEntityId).filter(Boolean));
  const officeUserIds = new Set(
    asArray(officeUsers).map(getRecipientEntityId).filter(Boolean),
  );
  const seenIds = new Set();
  const seenEmails = new Set();

  const takeUniqueEntity = (entity, metadata) => {
    if (!entity) return null;
    const id = getRecipientEntityId(entity);
    if (id && excludedIds.has(id)) return null;

    const emails = getRecipientEntityEmails(entity);
    if ((id && seenIds.has(id)) || emails.some((email) => seenEmails.has(email))) {
      return null;
    }

    if (id) seenIds.add(id);
    emails.forEach((email) => seenEmails.add(email));
    return { ...entity, ...metadata };
  };

  const buildSide = (entries, isContre) => asArray(entries).flatMap((entry) => {
    const block = { partieData: null, avocats: [], contacts: [] };
    const partySource = entry?.partieData
      || (isEmbeddedPartyEntity(entry) ? entry : null);

    block.partieData = takeUniqueEntity(partySource, {
      type: 'Partie',
      isContre,
    });

    const linkedAvocats = [
      ...asArray(entry?.avocats),
      ...asArray(entry?.linkedAvocats),
    ];
    linkedAvocats.forEach((avocat) => {
      const avocatId = getRecipientEntityId(avocat);
      if (!isContre && avocatId && officeUserIds.has(avocatId)) return;
      const unique = takeUniqueEntity(avocat, {
        type: 'Avocat',
        isContre,
        nom: avocat.nomOfficeUser || avocat.nom || '',
        prenoms: avocat.prenomOfficeUser || avocat.prenoms || '',
      });
      if (unique) block.avocats.push(unique);
    });

    const linkedContacts = [
      ...asArray(entry?.contacts),
      ...asArray(entry?.linkedContacts),
    ];
    linkedContacts.forEach((contact) => {
      const contactId = getRecipientEntityId(contact);
      if (!isContre && contactId && officeUserIds.has(contactId)) return;
      const unique = takeUniqueEntity(contact, { type: 'Contact', isContre });
      if (unique) block.contacts.push(unique);
    });

    return block.partieData || block.avocats.length > 0 || block.contacts.length > 0
      ? [block]
      : [];
  });

  result.pour = buildSide(content.parties?.pour, false);
  result.contre = buildSide(content.parties?.contre, true);
  result.dossierContacts = asArray(content.contactsDuDossier).flatMap((contact) => {
    const unique = takeUniqueEntity(contact, {
      type: 'Contact',
      isDossierDirect: true,
    });
    return unique ? [unique] : [];
  });

  return result;
};

export const flattenDossierEmailRecipientGroups = (groupedData) => {
  const recipients = [];
  ['pour', 'contre'].forEach((side) => {
    asArray(groupedData?.[side]).forEach((block) => {
      if (block.partieData) recipients.push(block.partieData);
      recipients.push(...asArray(block.avocats), ...asArray(block.contacts));
    });
  });
  recipients.push(...asArray(groupedData?.dossierContacts));
  return recipients;
};
