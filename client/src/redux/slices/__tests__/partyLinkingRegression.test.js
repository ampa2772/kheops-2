import {
  partieCreateReducer,
  partieCreateTypes,
  partieCreateActions,
  partieEditReducer,
  partieEditTypes,
  partieEditActions,
} from '../createPartieSlice';
import { buildPartieMovePayload } from '../../../components/dashboard/office/createDossier/createPartie/utils/partiesHelpers';

const makePartie = (id = 'partie-1', typePartie = 'Contre', extras = {}) => ({
  idPartie: id,
  nomPartie: 'Partie de test',
  partieData: { _id: id, nom: 'Test' },
  typePartie,
  linkedContacts: [],
  linkedAvocats: [],
  ...extras,
});

const setupPartie = (reducer, types, partie = makePartie()) => reducer(
  reducer(undefined, { type: '@@INIT' }),
  { type: types.SET, payload: partie },
);

const linkContact = (reducer, types, state, contact, idPartie = 'partie-1') => reducer(
  state,
  { type: types.SET_LINK, payload: { idPartie, contact } },
);

const expectLinkedAsLawyer = (state, id) => {
  expect(state.parties[0].linkedAvocats).toEqual(
    expect.arrayContaining([expect.objectContaining({ _id: id })]),
  );
  expect(state.parties[0].linkedContacts).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ _id: id })]),
  );
};

const expectLinkedAsContact = (state, id) => {
  expect(state.parties[0].linkedContacts).toEqual(
    expect.arrayContaining([expect.objectContaining({ _id: id })]),
  );
  expect(state.parties[0].linkedAvocats).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ _id: id })]),
  );
};

describe('classification des personnes liées dans partieData', () => {
  test.each(['Avocat', 'Avocate'])('%s est classé uniquement dans linkedAvocats', (type) => {
    const id = `lawyer-${type}`;
    const initial = setupPartie(partieCreateReducer, partieCreateTypes);
    const state = linkContact(partieCreateReducer, partieCreateTypes, initial, {
      _id: id,
      nom: 'Durand',
      prenoms: 'Camille',
      pro_contact: true,
      type,
      isPlaidant: true,
    });

    expectLinkedAsLawyer(state, id);
  });

  test.each(['Notaire', 'Commissaire de justice', 'Expert'])(
    '%s est classé uniquement dans linkedContacts',
    (type) => {
      const id = `professional-${type}`;
      const initial = setupPartie(partieCreateReducer, partieCreateTypes);
      const state = linkContact(partieCreateReducer, partieCreateTypes, initial, {
        _id: id,
        nom: 'Martin',
        prenoms: 'Alex',
        pro_contact: true,
        type,
      });

      expectLinkedAsContact(state, id);
    },
  );

  test('un particulier est classé uniquement dans linkedContacts', () => {
    const initial = setupPartie(partieCreateReducer, partieCreateTypes);
    const state = linkContact(partieCreateReducer, partieCreateTypes, initial, {
      _id: 'person-1',
      nom: 'Bernard',
      prenoms: 'Louise',
      pro_contact: false,
    });

    expectLinkedAsContact(state, 'person-1');
  });

  test.each([
    { _id: 'company-1', raisonSociale: 'Nova Conseil' },
    { _id: 'public-1', denomination: 'Mairie de Bernay' },
  ])('une personne morale est classée uniquement dans linkedContacts', (contact) => {
    const initial = setupPartie(partieCreateReducer, partieCreateTypes);
    const state = linkContact(partieCreateReducer, partieCreateTypes, initial, contact);

    expectLinkedAsContact(state, contact._id);
  });

  test('reclasse sans doublon un ancien contact générique devenu avocat', () => {
    const initial = setupPartie(
      partieCreateReducer,
      partieCreateTypes,
      makePartie('partie-1', 'Contre', {
        linkedContacts: [{ _id: 'lawyer-legacy', nom: 'Ancien lien' }],
      }),
    );
    const state = linkContact(partieCreateReducer, partieCreateTypes, initial, {
      _id: 'lawyer-legacy',
      nom: 'Durand',
      prenoms: 'Camille',
      pro_contact: true,
      type: 'Avocate',
      isPlaidant: true,
    });

    expectLinkedAsLawyer(state, 'lawyer-legacy');
    expect(state.parties[0].linkedAvocats).toHaveLength(1);
  });

  test('refuse un second lien vers la même personne', () => {
    const contact = { _id: 'contact-duplicate', nom: 'Petit', prenoms: 'Noah' };
    const initial = setupPartie(partieCreateReducer, partieCreateTypes);
    const once = linkContact(partieCreateReducer, partieCreateTypes, initial, contact);
    const twice = linkContact(partieCreateReducer, partieCreateTypes, once, contact);

    expect(twice.parties[0].linkedContacts).toHaveLength(1);
  });
});

describe('rôles des avocats liés', () => {
  test('refuse une liaison avocat sans rôle explicite', () => {
    const initial = setupPartie(partieCreateReducer, partieCreateTypes);
    const state = linkContact(partieCreateReducer, partieCreateTypes, initial, {
      _id: 'lawyer-without-role',
      nom: 'Leroy',
      prenoms: 'Morgan',
      pro_contact: true,
      type: 'Avocat',
    });

    expect(state.parties[0].linkedAvocats).toHaveLength(0);
    expect(state.parties[0].linkedContacts).toHaveLength(0);
  });

  test.each([
    { isPlaidant: true, isPostulant: false },
    { isPlaidant: false, isPostulant: true },
    { isPlaidant: true, isPostulant: true },
  ])('conserve les booléens plaidant/postulant à la liaison', (roles) => {
    const initial = setupPartie(partieCreateReducer, partieCreateTypes);
    const state = linkContact(partieCreateReducer, partieCreateTypes, initial, {
      _id: `lawyer-${Number(roles.isPlaidant)}-${Number(roles.isPostulant)}`,
      nom: 'Leroy',
      prenoms: 'Morgan',
      pro_contact: true,
      type: 'Avocat',
      ...roles,
    });

    expect(state.parties[0].linkedAvocats[0]).toEqual(expect.objectContaining(roles));
  });

  test('l’hydratation de création conserve les deux rôles', () => {
    const roles = { isPlaidant: true, isPostulant: true };
    const state = partieCreateReducer(
      undefined,
      partieCreateActions.hydratePartiesFromDossier(
        [makePartie('create-hydrated', 'Pour', {
          linkedAvocats: [{ _id: 'lawyer-create', ...roles }],
        })],
        [],
      ),
    );

    expect(state.parties[0].linkedAvocats[0]).toEqual(expect.objectContaining(roles));
  });

  test('l’hydratation d’édition conserve les deux rôles', () => {
    const roles = { isPlaidant: true, isPostulant: true };
    const state = partieEditReducer(
      undefined,
      partieEditActions.hydratePartiesFromDossier(
        [{
          idPartie: '507f1f77bcf86cd799439011',
          nomPartie: 'Dossier existant',
          partieData: { _id: '507f1f77bcf86cd799439011', nom: 'Dossier existant' },
          avocats: [{ _id: 'lawyer-edit', ...roles }],
          contacts: [],
        }],
        [],
      ),
    );

    expect(state.parties[0].linkedAvocats[0]).toEqual(expect.objectContaining(roles));
  });
});

describe('parité création/édition et glisser-déposer', () => {
  test.each([
    ['création', partieCreateReducer, partieCreateTypes],
    ['édition', partieEditReducer, partieEditTypes],
  ])('le mode %s applique la même classification', (_label, reducer, types) => {
    const initial = setupPartie(reducer, types);
    const withLawyer = linkContact(reducer, types, initial, {
      _id: 'lawyer-parity',
      nom: 'Moreau',
      pro_contact: true,
      type: 'Avocate',
      isPlaidant: true,
      isPostulant: false,
    });
    const finalState = linkContact(reducer, types, withLawyer, {
      _id: 'notary-parity',
      nom: 'Roux',
      pro_contact: true,
      type: 'Notaire',
    });

    expectLinkedAsLawyer(finalState, 'lawyer-parity');
    expectLinkedAsContact(finalState, 'notary-parity');
  });

  test('le payload de déplacement conserve contacts, avocats et rôles sans partager les références', () => {
    const partie = makePartie('moving-party', 'Pour', {
      partieData: { _id: 'moving-party', nom: 'Dubois', prenoms: 'Élodie' },
      linkedContacts: [{ _id: 'contact-moving', type: 'Notaire' }],
      linkedAvocats: [{
        _id: 'lawyer-moving',
        isPlaidant: true,
        isPostulant: true,
      }],
    });

    const payload = buildPartieMovePayload(partie);

    expect(payload.linkedContacts).toEqual(partie.linkedContacts);
    expect(payload.linkedAvocats).toEqual(partie.linkedAvocats);
    expect(payload.linkedContacts).not.toBe(partie.linkedContacts);
    expect(payload.linkedAvocats).not.toBe(partie.linkedAvocats);
    expect(payload.linkedAvocats[0]).not.toBe(partie.linkedAvocats[0]);
    expect(payload.linkedAvocats[0]).toEqual(expect.objectContaining({
      isPlaidant: true,
      isPostulant: true,
    }));
  });
});
