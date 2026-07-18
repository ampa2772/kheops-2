'use strict';

const {
  isLawyerEntity,
  normalizePartyRelation,
  normalizeDossierParties,
  removeLinkedEntity,
  upsertLinkedEntity,
} = require('../dossierPartyRelations');
const Dossier = require('../../models/Folder/Dossier');

describe('dossierPartyRelations', () => {
  test.each([
    [{ type: 'Avocat' }, true],
    [{ type: 'Avocate' }, true],
    [{ roleOfficeUser: 'AVOCATE' }, true],
    [{ isAvocat: true }, true],
    [{ type: 'Notaire' }, false],
    [{ type: 'Commissaire de justice' }, false],
    [{ type: 'Expert' }, false],
  ])('classe correctement %p', (entity, expected) => {
    expect(isLawyerEntity(entity)).toBe(expected);
  });

  test('classe avocats et autres personnes dans des collections distinctes', () => {
    const normalized = normalizePartyRelation({
      idPartie: 'party-1',
      avocats: [
        { _id: 'lawyer-1', type: 'Avocate', isPlaidant: true },
        { _id: 'notary-1', type: 'Notaire' },
      ],
      contacts: [
        { _id: 'lawyer-2', type: 'Avocat', isPostulant: true },
        { _id: 'expert-1', type: 'Expert' },
        { _id: 'person-1', pro_contact: false },
        { _id: 'company-1', raisonSociale: 'Societe Exemple' },
      ],
    });

    expect(normalized.avocats.map((item) => item._id)).toEqual(['lawyer-1', 'lawyer-2']);
    expect(normalized.contacts.map((item) => item._id)).toEqual([
      'notary-1',
      'expert-1',
      'person-1',
      'company-1',
    ]);
    expect(normalized.avocats[0]).toMatchObject({ isPlaidant: true });
    expect(normalized.avocats[1]).toMatchObject({ isPostulant: true });
  });

  test('supprime les doublons croises et fusionne sans perdre les deux roles', () => {
    const normalized = normalizePartyRelation({
      avocats: [{ _id: 'lawyer-1', type: 'Avocat', isPlaidant: true, isPostulant: false }],
      contacts: [
        { _id: 'lawyer-1', type: 'Avocat', isPlaidant: false, isPostulant: true },
        { _id: 'lawyer-1', type: 'Avocat' },
      ],
    });

    expect(normalized.avocats).toHaveLength(1);
    expect(normalized.contacts).toHaveLength(0);
    expect(normalized.avocats[0]).toMatchObject({
      _id: 'lawyer-1',
      isPlaidant: true,
      isPostulant: true,
    });
  });

  test('ne fabrique pas de role pour un ancien avocat dont le role est absent', () => {
    const [lawyer] = normalizePartyRelation({
      linkedAvocats: [{ _id: 'lawyer-legacy', type: 'Avocat' }],
    }).avocats;

    expect(lawyer).not.toHaveProperty('isPlaidant');
    expect(lawyer).not.toHaveProperty('isPostulant');
  });

  test('exclut la partie elle-meme de ses personnes liees', () => {
    const normalized = normalizePartyRelation({
      idPartie: 'party-1',
      contacts: [
        { _id: 'party-1', type: 'Particulier' },
        { _id: 'other-1', type: 'Particulier' },
      ],
    });

    expect(normalized.contacts.map((item) => item._id)).toEqual(['other-1']);
  });

  test('deduplique une meme partie dans un cote et conserve toutes ses relations', () => {
    const normalized = normalizeDossierParties({
      pour: [
        {
          idPartie: 'party-1',
          nomPartie: 'Alice',
          avocats: [{ _id: 'lawyer-1', type: 'Avocat', isPlaidant: true }],
        },
        {
          idPartie: 'party-1',
          nomPartie: 'Alice mise a jour',
          contacts: [{ _id: 'notary-1', type: 'Notaire' }],
        },
      ],
      contre: [],
    });

    expect(normalized.pour).toHaveLength(1);
    expect(normalized.pour[0]).toMatchObject({ nomPartie: 'Alice mise a jour' });
    expect(normalized.pour[0].avocats.map((item) => item._id)).toEqual(['lawyer-1']);
    expect(normalized.pour[0].contacts.map((item) => item._id)).toEqual(['notary-1']);
  });

  test('conserve les relations et roles lorsqu une partie change de cote', () => {
    const movedParty = {
      idPartie: 'party-1',
      avocats: [{
        _id: 'lawyer-1',
        type: 'Avocat',
        isPlaidant: true,
        isPostulant: true,
      }],
      contacts: [{ _id: 'expert-1', type: 'Expert' }],
    };

    const normalized = normalizeDossierParties({ pour: [], contre: [movedParty] });

    expect(normalized.contre[0].avocats[0]).toMatchObject({
      isPlaidant: true,
      isPostulant: true,
    });
    expect(normalized.contre[0].contacts[0]._id).toBe('expert-1');
  });

  test('le schema Dossier persiste les roles normalises dans le snapshot Mixed', () => {
    const parties = normalizeDossierParties({
      pour: [{
        idPartie: 'party-1',
        avocats: [{
          _id: 'lawyer-1',
          type: 'Avocate',
          isPlaidant: true,
          isPostulant: true,
        }],
        contacts: [{ _id: 'notary-1', type: 'Notaire' }],
      }],
      contre: [],
    });
    const dossier = new Dossier({
      reference: 'TEST-RELATIONS',
      dossier: { parties },
    });

    expect(dossier.validateSync()).toBeUndefined();
    const persistedShape = dossier.toObject().dossier.parties.pour[0];
    expect(persistedShape.avocats[0]).toMatchObject({
      _id: 'lawyer-1',
      isPlaidant: true,
      isPostulant: true,
    });
    expect(persistedShape.contacts[0]).toMatchObject({
      _id: 'notary-1',
      type: 'Notaire',
    });
  });

  test('refuse une nouvelle liaison avocat sans role', () => {
    expect(() => upsertLinkedEntity(
      { idPartie: 'party-1', avocats: [], contacts: [] },
      { _id: 'lawyer-1', type: 'Avocat' },
      {},
    )).toThrow(expect.objectContaining({ code: 'LAWYER_ROLE_REQUIRED' }));
  });

  test('persiste les deux roles d un nouvel avocat et le retire des contacts generiques', () => {
    const result = upsertLinkedEntity(
      {
        idPartie: 'party-1',
        avocats: [],
        contacts: [],
      },
      { _id: 'lawyer-1', type: 'Avocate', nom: 'Durand' },
      { isPlaidant: true, isPostulant: true },
    );

    expect(result.party.contacts).toHaveLength(0);
    expect(result.party.avocats).toHaveLength(1);
    expect(result.party.avocats[0]).toMatchObject({
      _id: 'lawyer-1',
      nom: 'Durand',
      isPlaidant: true,
      isPostulant: true,
    });
  });

  test('preserve les roles existants sans forceRoleUpdate', () => {
    const result = upsertLinkedEntity(
      {
        avocats: [{
          _id: 'lawyer-1',
          type: 'Avocat',
          isPlaidant: true,
          isPostulant: false,
        }],
        contacts: [{ _id: 'lawyer-1', type: 'Avocat' }],
      },
      { _id: 'lawyer-1', type: 'Avocat', nom: 'Actualise' },
      { isPlaidant: false, isPostulant: true },
    );

    expect(result.party.avocats).toHaveLength(1);
    expect(result.party.contacts).toHaveLength(0);
    expect(result.party.avocats[0]).toMatchObject({
      nom: 'Actualise',
      isPlaidant: true,
      isPostulant: false,
    });
    expect(result.rolesUpdated).toBe(false);
  });

  test('forceRoleUpdate modifie uniquement les roles explicitement fournis', () => {
    const result = upsertLinkedEntity(
      {
        avocats: [{
          _id: 'lawyer-1',
          type: 'Avocat',
          isPlaidant: true,
          isPostulant: true,
        }],
      },
      { _id: 'lawyer-1', type: 'Avocat' },
      { isPlaidant: false, forceRoleUpdate: true },
    );

    expect(result.party.avocats[0]).toMatchObject({
      isPlaidant: false,
      isPostulant: true,
    });
    expect(result.rolesUpdated).toBe(true);
  });

  test('un avocat externe postulant retire le role postulant a tous les responsables Pour', () => {
    const result = upsertLinkedEntity(
      {
        idPartie: 'party-1',
        typePartie: 'Pour',
        avocats: [
          { _id: 'responsable-1', type: 'Avocat', fromResponsable: true, isPlaidant: true, isPostulant: true },
          { _id: 'responsable-2', type: 'Avocat', fromResponsable: true, isPlaidant: true, isPostulant: false },
        ],
      },
      { _id: 'externe-1', type: 'Avocat' },
      { isPlaidant: true, isPostulant: true },
    );

    const responsables = result.party.avocats.filter((lawyer) => lawyer.fromResponsable);
    expect(responsables).toHaveLength(2);
    expect(responsables.every((lawyer) => lawyer.isPlaidant === true)).toBe(true);
    expect(responsables.every((lawyer) => lawyer.isPostulant === false)).toBe(true);
    expect(result.party.avocats.find((lawyer) => lawyer._id === 'externe-1')).toMatchObject({
      isPlaidant: true,
      isPostulant: true,
    });
  });

  test('le retrait du dernier postulant externe restaure exactement un responsable postulant', () => {
    const removal = removeLinkedEntity(
      {
        idPartie: 'party-1',
        typePartie: 'Pour',
        avocats: [
          { _id: 'responsable-1', type: 'Avocat', fromResponsable: true, isPlaidant: true, isPostulant: false },
          { _id: 'responsable-2', type: 'Avocat', fromResponsable: true, isPlaidant: true, isPostulant: false },
          { _id: 'externe-1', type: 'Avocat', isPlaidant: true, isPostulant: true },
        ],
      },
      'externe-1',
    );

    expect(removal.removed).toBe(true);
    expect(removal.relationType).toBe('avocat');
    const responsables = removal.party.avocats.filter((lawyer) => lawyer.fromResponsable);
    expect(responsables.filter((lawyer) => lawyer.isPostulant)).toHaveLength(1);
    expect(responsables[0]).toMatchObject({ isPlaidant: true, isPostulant: true });
    expect(responsables[1]).toMatchObject({ isPlaidant: true, isPostulant: false });
  });

  test('la sauvegarde complete normalise aussi a exactement un responsable postulant', () => {
    const normalized = normalizeDossierParties({
      pour: [{
        idPartie: 'party-1',
        avocats: [
          { _id: 'responsable-1', type: 'Avocat', fromResponsable: true, isPostulant: true },
          { _id: 'responsable-2', type: 'Avocat', fromResponsable: true, isPostulant: true },
        ],
      }],
      contre: [],
    });

    const responsables = normalized.pour[0].avocats;
    expect(responsables.filter((lawyer) => lawyer.isPostulant)).toHaveLength(1);
    expect(responsables.every((lawyer) => lawyer.isPlaidant)).toBe(true);
  });

  test('un non avocat est deduplique et range uniquement dans contacts', () => {
    const result = upsertLinkedEntity(
      {
        avocats: [{ _id: 'notary-1', type: 'Avocat', ancienChamp: 'conserve' }],
        contacts: [{ _id: 'notary-1', type: 'Notaire' }],
      },
      { _id: 'notary-1', type: 'Notaire', ville: 'Rouen' },
    );

    expect(result.party.avocats).toHaveLength(0);
    expect(result.party.contacts).toHaveLength(1);
    expect(result.party.contacts[0]).toMatchObject({
      _id: 'notary-1',
      type: 'Notaire',
      ville: 'Rouen',
    });
  });
});
