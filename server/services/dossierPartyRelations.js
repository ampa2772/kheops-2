'use strict';

/**
 * Normalise les relations embarquees dans Dossier.dossier.parties.
 *
 * Le modele Dossier conserve volontairement ces objets en Mixed pour rester
 * compatible avec les anciens dossiers. Cette frontiere serveur garantit
 * toutefois une representation canonique avant chaque sauvegarde :
 *   - avocats dans `avocats`, autres personnes dans `contacts` ;
 *   - aucun doublon intra- ou inter-collection ;
 *   - roles plaidant/postulant conserves sans valeur par defaut inventee ;
 *   - la partie elle-meme n'est jamais aussi une personne liee.
 */

const hasOwn = (value, property) => Object.prototype.hasOwnProperty.call(value || {}, property);

class PartyRelationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PartyRelationError';
    this.code = code;
    this.statusCode = 400;
  }
}

const normalizeLabel = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const getEntityId = (entity) => {
  const value = entity && (entity._id || entity.id || entity.contactId);
  return value == null ? '' : String(value);
};

const toPlainEntity = (entity) => {
  if (!entity || typeof entity !== 'object') return {};
  if (typeof entity.toObject === 'function') return entity.toObject();
  return { ...entity };
};

const getEntityKey = (entity, fallback) => {
  const id = getEntityId(entity);
  if (id) return `id:${id}`;

  const email = normalizeLabel(entity && (
    entity.email
    || entity.emailEntreprise
    || entity.contactEmail
    || entity.interlocuteurEmail
  ));
  if (email) return `email:${email}`;

  return fallback;
};

const isLawyerEntity = (entity) => {
  if (!entity || typeof entity !== 'object') return false;
  if (entity.isAvocat === true) return true;

  return [entity.type, entity.roleOfficeUser, entity.profession]
    .map(normalizeLabel)
    .some((type) => type === 'avocat' || type === 'avocate');
};

const mergeRole = (existing, incoming, property) => {
  const existingHas = hasOwn(existing, property);
  const incomingHas = hasOwn(incoming, property);

  if (!existingHas && !incomingHas) return { present: false };
  if (existing?.[property] === true || incoming?.[property] === true) {
    return { present: true, value: true };
  }
  if (incomingHas) return { present: true, value: Boolean(incoming[property]) };
  return { present: true, value: Boolean(existing[property]) };
};

const mergeLinkedEntity = (existing, incoming) => {
  if (!existing) return { ...(incoming || {}) };
  const merged = { ...existing, ...(incoming || {}) };

  ['isPlaidant', 'isPostulant'].forEach((property) => {
    const role = mergeRole(existing, incoming, property);
    if (role.present) merged[property] = role.value;
    else delete merged[property];
  });

  return merged;
};

const addToMap = (map, entity, fallback) => {
  if (!entity || typeof entity !== 'object') return;
  const key = getEntityKey(entity, fallback);
  map.set(key, mergeLinkedEntity(map.get(key), entity));
};

const normalizePartyRelation = (party = {}) => {
  const sourceLawyers = [
    ...(Array.isArray(party.avocats) ? party.avocats : []),
    ...(Array.isArray(party.linkedAvocats) ? party.linkedAvocats : []),
  ];
  const sourceContacts = [
    ...(Array.isArray(party.contacts) ? party.contacts : []),
    ...(Array.isArray(party.linkedContacts) ? party.linkedContacts : []),
  ];

  const partyId = String(party.idPartie || getEntityId(party.partieData) || '');
  const lawyers = new Map();
  const contacts = new Map();

  const addEntity = (entity, fallback) => {
    if (!entity || typeof entity !== 'object') return;
    if (partyId && getEntityId(entity) === partyId) return;

    const key = getEntityKey(entity, fallback);
    if (isLawyerEntity(entity)) {
      contacts.delete(key);
      addToMap(lawyers, entity, key);
      return;
    }

    if (lawyers.has(key)) return;
    addToMap(contacts, entity, key);
  };

  sourceLawyers.forEach((entity, index) => addEntity(entity, `lawyer:${index}`));
  sourceContacts.forEach((entity, index) => addEntity(entity, `contact:${index}`));

  const {
    linkedAvocats: _legacyLawyers,
    linkedContacts: _legacyContacts,
    ...rest
  } = party;

  return {
    ...rest,
    avocats: Array.from(lawyers.values()),
    contacts: Array.from(contacts.values()),
  };
};

/**
 * Conserve la regle historique du client pour les avocats internes d'une
 * partie POUR :
 *   - si un avocat externe est postulant, aucun responsable interne ne l'est ;
 *   - sinon exactement un responsable interne est postulant ;
 *   - les responsables internes restent plaidants.
 *
 * L'avocat responsable deja postulant est conserve en priorite afin que la
 * normalisation soit stable. A defaut, le premier responsable embarque est
 * choisi. Les parties CONTRE ne sont pas modifiees par cette regle metier.
 */
const reconcileResponsibleLawyerRoles = (party = {}) => {
  const normalized = normalizePartyRelation(party);
  if (normalizeLabel(normalized.typePartie) !== 'pour') return normalized;

  const responsibleLawyers = normalized.avocats.filter((lawyer) => lawyer?.fromResponsable === true);
  if (responsibleLawyers.length === 0) return normalized;

  const hasExternalPostulant = normalized.avocats.some(
    (lawyer) => lawyer?.fromResponsable !== true && lawyer?.isPostulant === true,
  );
  const selectedResponsible = hasExternalPostulant
    ? null
    : (responsibleLawyers.find((lawyer) => lawyer?.isPostulant === true) || responsibleLawyers[0]);
  const selectedId = getEntityId(selectedResponsible);

  return {
    ...normalized,
    avocats: normalized.avocats.map((lawyer) => {
      if (lawyer?.fromResponsable !== true) return lawyer;
      return {
        ...lawyer,
        isPlaidant: true,
        isPostulant: Boolean(selectedId && getEntityId(lawyer) === selectedId),
      };
    }),
  };
};

const sameEntity = (left, right) => {
  const leftId = getEntityId(left);
  const rightId = getEntityId(right);
  if (leftId && rightId) return leftId === rightId;

  const leftEmail = normalizeLabel(left && (
    left.email || left.emailEntreprise || left.contactEmail || left.interlocuteurEmail
  ));
  const rightEmail = normalizeLabel(right && (
    right.email || right.emailEntreprise || right.contactEmail || right.interlocuteurEmail
  ));
  return Boolean(leftEmail && rightEmail && leftEmail === rightEmail);
};

const validateRoleInput = (options) => {
  ['isPlaidant', 'isPostulant', 'forceRoleUpdate'].forEach((property) => {
    if (hasOwn(options, property) && typeof options[property] !== 'boolean') {
      throw new PartyRelationError(
        `${property} doit etre un booleen.`,
        'INVALID_LAWYER_ROLE',
      );
    }
  });
};

/**
 * Ajoute ou met a jour une personne liee sur une partie sans muter l'objet
 * fourni. Cette fonction est utilisee par la route d'auto-sauvegarde en mode
 * edition ; elle applique donc les memes invariants que la sauvegarde complete.
 *
 * Regles de roles :
 *   - un NOUVEL avocat doit avoir au moins un role explicite ;
 *   - un avocat deja lie conserve ses roles tant que forceRoleUpdate !== true ;
 *   - avec forceRoleUpdate, seuls les booleens explicitement fournis changent.
 */
const upsertLinkedEntity = (party = {}, entity, options = {}) => {
  validateRoleInput(options);

  const plainEntity = toPlainEntity(entity);
  if (!getEntityId(plainEntity) && !getEntityKey(plainEntity, '')) {
    throw new PartyRelationError(
      'La personne liee doit posseder un identifiant ou un e-mail.',
      'INVALID_LINKED_ENTITY',
    );
  }

  const normalized = normalizePartyRelation(party);
  const existingLawyer = normalized.avocats.find((item) => sameEntity(item, plainEntity));
  const existingContact = normalized.contacts.find((item) => sameEntity(item, plainEntity));
  const existing = existingLawyer || existingContact;
  const lawyer = isLawyerEntity(plainEntity);

  const withoutEntity = {
    ...normalized,
    avocats: normalized.avocats.filter((item) => !sameEntity(item, plainEntity)),
    contacts: normalized.contacts.filter((item) => !sameEntity(item, plainEntity)),
  };

  let linkedEntity = mergeLinkedEntity(existing, plainEntity);

  if (lawyer) {
    const newRoleSelected = options.isPlaidant === true || options.isPostulant === true;
    if (!existing && !newRoleSelected) {
      throw new PartyRelationError(
        'Selectionnez au moins un role (plaidant ou postulant) pour ce nouvel avocat.',
        'LAWYER_ROLE_REQUIRED',
      );
    }

    // Les roles appartiennent a la relation dossier/partie, jamais a la fiche
    // contact maitre. On retire donc toute valeur provenant de cette fiche puis
    // on reapplique uniquement l'etat relationnel autorise.
    delete linkedEntity.isPlaidant;
    delete linkedEntity.isPostulant;

    if (!existing) {
      linkedEntity.isPlaidant = options.isPlaidant === true;
      linkedEntity.isPostulant = options.isPostulant === true;
    } else if (options.forceRoleUpdate === true) {
      ['isPlaidant', 'isPostulant'].forEach((property) => {
        if (hasOwn(options, property)) linkedEntity[property] = options[property];
        else if (hasOwn(existing, property)) linkedEntity[property] = existing[property];
      });
    } else {
      ['isPlaidant', 'isPostulant'].forEach((property) => {
        if (hasOwn(existing, property)) linkedEntity[property] = existing[property];
      });
    }

    withoutEntity.avocats.push(linkedEntity);
  } else {
    withoutEntity.contacts.push(linkedEntity);
  }

  const updatedParty = reconcileResponsibleLawyerRoles(withoutEntity);
  const collection = lawyer ? updatedParty.avocats : updatedParty.contacts;
  linkedEntity = collection.find((item) => sameEntity(item, plainEntity)) || linkedEntity;

  return {
    party: updatedParty,
    linkedEntity,
    relationType: lawyer ? 'avocat' : 'contact',
    created: !existing,
    rolesUpdated: lawyer && (Boolean(!existing) || options.forceRoleUpdate === true),
  };
};

/**
 * Retire une personne liee des formes canonique et legacy, puis reapplique les
 * invariants de roles. La recherche par identite utilise les memes regles que
 * l'ajout (ObjectId en priorite, e-mail en repli).
 */
const removeLinkedEntity = (party = {}, entityOrId) => {
  const target = typeof entityOrId === 'object'
    ? entityOrId
    : { _id: entityOrId };
  const normalized = normalizePartyRelation(party);
  const removedLawyer = normalized.avocats.some((item) => sameEntity(item, target));
  const removedContact = normalized.contacts.some((item) => sameEntity(item, target));
  const updatedParty = reconcileResponsibleLawyerRoles({
    ...normalized,
    avocats: normalized.avocats.filter((item) => !sameEntity(item, target)),
    contacts: normalized.contacts.filter((item) => !sameEntity(item, target)),
  });

  return {
    party: updatedParty,
    removed: removedLawyer || removedContact,
    relationType: removedLawyer ? 'avocat' : (removedContact ? 'contact' : null),
  };
};

const getPartyKey = (party, fallback) => {
  const id = party && (party.idPartie || getEntityId(party.partieData));
  return id ? `id:${String(id)}` : fallback;
};

const mergeParty = (existing, incoming) => reconcileResponsibleLawyerRoles({
  ...existing,
  ...incoming,
  avocats: [
    ...(existing?.avocats || existing?.linkedAvocats || []),
    ...(incoming?.avocats || incoming?.linkedAvocats || []),
  ],
  contacts: [
    ...(existing?.contacts || existing?.linkedContacts || []),
    ...(incoming?.contacts || incoming?.linkedContacts || []),
  ],
});

const normalizePartySide = (parties, sideType) => {
  const normalized = new Map();
  (Array.isArray(parties) ? parties : []).forEach((party, index) => {
    if (!party || typeof party !== 'object') return;
    const partyWithSide = {
      ...party,
      typePartie: party.typePartie || sideType,
    };
    const key = getPartyKey(partyWithSide, `anonymous:${index}`);
    normalized.set(
      key,
      normalized.has(key)
        ? mergeParty(normalized.get(key), partyWithSide)
        : reconcileResponsibleLawyerRoles(partyWithSide),
    );
  });
  return Array.from(normalized.values());
};

const normalizeDossierParties = (parties = {}) => ({
  ...(parties && typeof parties === 'object' ? parties : {}),
  pour: normalizePartySide(parties?.pour, 'Pour'),
  contre: normalizePartySide(parties?.contre, 'Contre'),
});

module.exports = {
  PartyRelationError,
  getEntityId,
  isLawyerEntity,
  normalizePartyRelation,
  reconcileResponsibleLawyerRoles,
  normalizeDossierParties,
  upsertLinkedEntity,
  removeLinkedEntity,
};
