const stringId = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const contactLabel = (entity = {}) => (
  entity.raisonSociale
  || entity.denomination
  || [
    entity.prenoms || entity.prenom || entity.prenomOfficeUser,
    entity.nom || entity.nomOfficeUser,
  ].filter(Boolean).join(' ')
  || 'Contact'
);

/**
 * Le formulaire classique edite les trois modeles de contacts maitres.
 * Les snapshots OfficeUser (avocats internes, responsables) restent sur leur
 * editeur historique car /api/folder/contact/:id ne les represente pas.
 */
export const isClassicContactEntity = (selectedEntity) => {
  const type = selectedEntity?.type;
  const full = selectedEntity?.fullObject || {};
  const id = stringId(selectedEntity?.id || full?._id);
  const isInternalOfficeUser = full.fromResponsable === true
    || (full.mainOfficeUser === true && full.fromResponsable !== false);
  return !!id
    && (type === 'Partie' || type === 'Contact' || type === 'Avocat')
    && !isInternalOfficeUser;
};

export const buildDossierContactEditNavigation = ({ dossierId, selectedEntity }) => {
  const safeDossierId = stringId(dossierId);
  const contactId = stringId(selectedEntity?.id || selectedEntity?.fullObject?._id);
  if (!safeDossierId || !contactId || !isClassicContactEntity(selectedEntity)) return null;

  const entityType = selectedEntity.type || 'Contact';
  const side = selectedEntity.isContre ? 'contre' : 'pour';

  const returnParams = new URLSearchParams({
    dossierId: safeDossierId,
    focusContactId: contactId,
    focusEntityType: entityType,
    focusSide: side,
  });
  const editorParams = new URLSearchParams({
    contactId,
    returnDossierId: safeDossierId,
    returnEntityType: entityType,
    returnSide: side,
  });

  return {
    to: `/dashboard/createContact?${editorParams.toString()}`,
    state: {
      contactReturn: {
        to: `/dashboard/dossier?${returnParams.toString()}`,
        label: 'Retour au contact',
      },
    },
  };
};

export const readDossierContactFocus = (search = '') => {
  const params = new URLSearchParams(search);
  return {
    contactId: stringId(params.get('focusContactId')),
    entityType: stringId(params.get('focusEntityType')),
    side: stringId(params.get('focusSide')).toLowerCase(),
  };
};

export const clearDossierContactFocus = (search = '') => {
  const params = new URLSearchParams(search);
  params.delete('focusContactId');
  params.delete('focusEntityType');
  params.delete('focusSide');
  const next = params.toString();
  return next ? `?${next}` : '';
};

const dossierParties = (dossier) => (
  dossier?.dossier?.parties
  || dossier?.dossier?.dossier?.parties
  || dossier?.parties
  || { pour: [], contre: [] }
);

const entityCandidate = (fullObject, type, isContre, fallbackId) => {
  if (!fullObject) return null;
  const id = stringId(fullObject._id || fallbackId);
  if (!id) return null;
  return {
    id,
    label: contactLabel(fullObject),
    type,
    isContre,
    fullObject: { ...fullObject, isContre },
  };
};

const directPartyData = (block) => {
  if (!block) return null;
  if (block.partieData) return block.partieData;
  if (block.nom || block.prenoms || block.raisonSociale || block.denomination || block.nomPartie) {
    return block;
  }
  return null;
};

/** Recherche la meme ligne dans le dossier recharge, afin d'afficher la fiche
 * rapide avec les donnees autoritatives apres l'enregistrement. */
export const findFocusedDossierEntity = (dossier, focus = {}) => {
  const contactId = stringId(focus.contactId);
  if (!contactId) return null;

  const parties = dossierParties(dossier);
  const requestedSide = focus.side === 'contre' || focus.side === 'pour' ? focus.side : '';
  const requestedType = stringId(focus.entityType);
  const sides = requestedSide ? [requestedSide] : ['pour', 'contre'];

  for (const side of sides) {
    const isContre = side === 'contre';
    for (const block of (Array.isArray(parties[side]) ? parties[side] : [])) {
      const candidates = [
        entityCandidate(directPartyData(block), 'Partie', isContre, block?.idPartie),
        ...(Array.isArray(block?.contacts)
          ? block.contacts.map((contact) => entityCandidate(contact, 'Contact', isContre))
          : []),
        ...(Array.isArray(block?.avocats)
          ? block.avocats.map((contact) => entityCandidate(contact, 'Avocat', isContre))
          : []),
      ].filter(Boolean);

      const found = candidates.find((candidate) => (
        candidate.id === contactId
        && (!requestedType || candidate.type === requestedType)
      ));
      if (found) return found;
    }
  }
  return null;
};
