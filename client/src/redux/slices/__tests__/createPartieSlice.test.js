// Tests unitaires — createPartieSlice.js (factory + 2 instances)

beforeEach(() => {
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation();
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation();
});
afterEach(() => {
  Storage.prototype.getItem.mockRestore();
  Storage.prototype.setItem.mockRestore();
  Storage.prototype.removeItem.mockRestore();
  jest.resetModules();
});

let buildPartieNameFromData, partieCreateReducer, partieCreateTypes, partieCreateActions;
let partieEditReducer, partieEditTypes, partieEditActions;

beforeEach(() => {
  jest.isolateModules(() => {
    const mod = require('../createPartieSlice');
    buildPartieNameFromData = mod.buildPartieNameFromData;
    partieCreateReducer = mod.partieCreateReducer;
    partieCreateTypes = mod.partieCreateTypes;
    partieCreateActions = mod.partieCreateActions;
    partieEditReducer = mod.partieEditReducer;
    partieEditTypes = mod.partieEditTypes;
    partieEditActions = mod.partieEditActions;
  });
});

// === Helpers ===

const getBaseCreate = () => partieCreateReducer(undefined, { type: '@@INIT' });
const getBaseEdit = () => partieEditReducer(undefined, { type: '@@INIT' });

const makePartie = (id = 'p1', type = 'Pour', extras = {}) => ({
  idPartie: id,
  nomPartie: 'Test',
  partieData: {},
  typePartie: type,
  linkedContacts: [],
  linkedAvocats: [],
  ...extras,
});

const addPartie = (state, reducer, types, partie) =>
  reducer(state, { type: types.SET, payload: partie });

// ========================================================================
// buildPartieNameFromData
// ========================================================================

describe('buildPartieNameFromData', () => {
  test('retourne "Information manquante" pour null', () => {
    expect(buildPartieNameFromData(null)).toBe('Information manquante');
  });

  test('retourne raisonSociale si present', () => {
    expect(buildPartieNameFromData({ raisonSociale: 'SARL Test' })).toBe('SARL Test');
  });

  test('retourne denomination si present (pas de raisonSociale)', () => {
    expect(buildPartieNameFromData({ denomination: 'Mairie Paris' })).toBe('Mairie Paris');
  });

  test('retourne nom + prenoms combine', () => {
    expect(buildPartieNameFromData({ nom: 'Dupont', prenoms: 'Jean' })).toBe('Jean Dupont');
  });

  test('retourne "Contact non nomme" pour objet vide', () => {
    expect(buildPartieNameFromData({})).toBe('Contact non nomme');
  });
});

// ========================================================================
// partieCreate — etat initial
// ========================================================================

describe('createPartieSlice instance partieCreate etat initial', () => {
  test('retourne l etat initial par defaut', () => {
    const state = getBaseCreate();
    expect(state.parties).toEqual([]);
    expect(state.shouldPopulateNameFields).toBe(true);
  });

  test('charge depuis localStorage si present', () => {
    Storage.prototype.getItem.mockReturnValue(
      JSON.stringify({ parties: [{ idPartie: 'x' }], shouldPopulateNameFields: false })
    );
    jest.isolateModules(() => {
      const mod = require('../createPartieSlice');
      const state = mod.partieCreateReducer(undefined, { type: '@@INIT' });
      expect(state.parties.length).toBe(1);
      expect(state.shouldPopulateNameFields).toBe(false);
    });
  });
});

// ========================================================================
// partieCreate — SET_PARTIE
// ========================================================================

describe('createPartieSlice SET_PARTIE', () => {
  test('ajoute une nouvelle partie', () => {
    const state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1'));
    expect(state.parties.length).toBe(1);
    expect(state.parties[0].idPartie).toBe('p1');
  });

  test('met a jour une partie existante', () => {
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1'));
    state = addPartie(state, partieCreateReducer, partieCreateTypes, makePartie('p1', 'Contre', { nomPartie: 'Updated' }));
    expect(state.parties.length).toBe(1);
    expect(state.parties[0].nomPartie).toBe('Updated');
    expect(state.parties[0].typePartie).toBe('Contre');
  });

  test('ajoute plusieurs parties distinctes', () => {
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1'));
    state = addPartie(state, partieCreateReducer, partieCreateTypes, makePartie('p2', 'Contre'));
    expect(state.parties.length).toBe(2);
  });
});

// ========================================================================
// partieCreate — DELETE_PARTIE
// ========================================================================

describe('createPartieSlice DELETE_PARTIE', () => {
  test('supprime la partie par idPartie', () => {
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1'));
    state = partieCreateReducer(state, { type: partieCreateTypes.DELETE, payload: 'p1' });
    expect(state.parties.length).toBe(0);
  });
});

// ========================================================================
// partieCreate — SET_PARTIE_LINK
// ========================================================================

describe('createPartieSlice SET_PARTIE_LINK', () => {
  test('ajoute un contact lie a une partie', () => {
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1'));
    state = partieCreateReducer(state, {
      type: partieCreateTypes.SET_LINK,
      payload: { idPartie: 'p1', contact: { _id: 'c1', nom: 'X', pro_contact: false } },
    });
    expect(state.parties[0].linkedContacts.length).toBe(1);
  });

  test('ajoute un avocat si contact.pro_contact et type Avocat', () => {
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1', 'Contre'));
    state = partieCreateReducer(state, {
      type: partieCreateTypes.SET_LINK,
      payload: { idPartie: 'p1', contact: { _id: 'a1', nom: 'Av', pro_contact: true, type: 'Avocat' } },
    });
    expect(state.parties[0].linkedAvocats.length).toBe(1);
    expect(state.parties[0].linkedContacts.length).toBe(0);
  });

  test('ne duplique pas un contact deja present', () => {
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1'));
    const contact = { _id: 'c1', nom: 'X', pro_contact: false };
    state = partieCreateReducer(state, { type: partieCreateTypes.SET_LINK, payload: { idPartie: 'p1', contact } });
    state = partieCreateReducer(state, { type: partieCreateTypes.SET_LINK, payload: { idPartie: 'p1', contact } });
    expect(state.parties[0].linkedContacts.length).toBe(1);
  });
});

// ========================================================================
// partieCreate — DELETE_PARTIE_LINK
// ========================================================================

describe('createPartieSlice DELETE_PARTIE_LINK', () => {
  test('supprime un contact lie', () => {
    const partie = makePartie('p1', 'Pour', { linkedContacts: [{ _id: 'c1' }] });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    state = partieCreateReducer(state, {
      type: partieCreateTypes.DELETE_LINK,
      payload: { idPartie: 'p1', contactId: 'c1' },
    });
    expect(state.parties[0].linkedContacts.length).toBe(0);
  });
});

// ========================================================================
// partieCreate — DELETE_LINKED_AVOCAT
// ========================================================================

describe('createPartieSlice DELETE_LINKED_AVOCAT', () => {
  test('supprime un avocat lie', () => {
    const partie = makePartie('p1', 'Pour', {
      linkedAvocats: [
        { _id: 'a1', fromResponsable: true, isPostulant: true, isPlaidant: true },
        { _id: 'a2', fromResponsable: false, isPostulant: false, isPlaidant: true },
      ],
    });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    state = partieCreateReducer(state, {
      type: partieCreateTypes.DELETE_AVOCAT,
      payload: { idPartie: 'p1', avocatId: 'a2' },
    });
    expect(state.parties[0].linkedAvocats.length).toBe(1);
  });

  test('recalcule isPostulant pour les Pour apres suppression', () => {
    const partie = makePartie('p1', 'Pour', {
      linkedAvocats: [
        { _id: 'resp', fromResponsable: true, isPostulant: false, isPlaidant: true },
        { _id: 'ext', fromResponsable: false, isPostulant: true, isPlaidant: true },
      ],
    });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    // Supprimer l'avocat externe — le responsable doit redevenir postulant
    state = partieCreateReducer(state, {
      type: partieCreateTypes.DELETE_AVOCAT,
      payload: { idPartie: 'p1', avocatId: 'ext' },
    });
    expect(state.parties[0].linkedAvocats[0].isPostulant).toBe(true);
  });
});

// ========================================================================
// partieCreate — TOGGLE_AVOCAT_PROPERTY
// ========================================================================

describe('createPartieSlice TOGGLE_AVOCAT_PROPERTY', () => {
  test('inverse la propriete d un avocat', () => {
    const partie = makePartie('p1', 'Contre', {
      linkedAvocats: [{ _id: 'a1', isPlaidant: true, isPostulant: false }],
    });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    state = partieCreateReducer(state, {
      type: partieCreateTypes.TOGGLE_AV,
      payload: { idPartie: 'p1', avocatId: 'a1', property: 'isPlaidant' },
    });
    expect(state.parties[0].linkedAvocats[0].isPlaidant).toBe(false);
  });

  test('recalcule responsables Pour quand isPostulant toggle', () => {
    const partie = makePartie('p1', 'Pour', {
      linkedAvocats: [
        { _id: 'resp', fromResponsable: true, isPostulant: true, isPlaidant: true },
        { _id: 'ext', fromResponsable: false, isPostulant: false, isPlaidant: true },
      ],
    });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    // ext passe isPostulant=true => le responsable ne devrait plus etre postulant
    state = partieCreateReducer(state, {
      type: partieCreateTypes.TOGGLE_AV,
      payload: { idPartie: 'p1', avocatId: 'ext', property: 'isPostulant' },
    });
    const resp = state.parties[0].linkedAvocats.find(a => a._id === 'resp');
    expect(resp.isPostulant).toBe(false);
  });
});

// ========================================================================
// partieCreate — SET_SHOULD_POPULATE_NAME_FIELDS
// ========================================================================

describe('createPartieSlice SET_SHOULD_POPULATE_NAME_FIELDS', () => {
  test('definit shouldPopulateNameFields', () => {
    const state = partieCreateReducer(getBaseCreate(), {
      type: partieCreateTypes.SET_POPULATE,
      payload: false,
    });
    expect(state.shouldPopulateNameFields).toBe(false);
  });
});

// ========================================================================
// partieCreate — UPDATE_PARTIE
// ========================================================================

describe('createPartieSlice UPDATE_PARTIE', () => {
  test('met a jour les donnees d une partie existante', () => {
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1'));
    state = partieCreateReducer(state, {
      type: 'UPDATE_PARTIE',
      payload: { idPartie: 'p1', updatedData: { nomPartie: 'Nouveau nom' } },
    });
    expect(state.parties[0].nomPartie).toBe('Nouveau nom');
  });
});

// ========================================================================
// partieCreate — RESET_PARTIES
// ========================================================================

describe('createPartieSlice RESET_PARTIES', () => {
  test('vide les parties et supprime localStorage', () => {
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1'));
    state = partieCreateReducer(state, { type: partieCreateTypes.RESET });
    expect(state.parties).toEqual([]);
    expect(state.shouldPopulateNameFields).toBe(true);
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('partieData');
  });
});

// ========================================================================
// partieCreate — HYDRATE_PARTIES_FROM_DOSSIER
// ========================================================================

describe('createPartieSlice HYDRATE_PARTIES_FROM_DOSSIER', () => {
  test('hydrate les parties depuis pourParties et contreParties', () => {
    const state = partieCreateReducer(getBaseCreate(), {
      type: 'HYDRATE_PARTIES_FROM_DOSSIER',
      payload: {
        pourParties: [{ idPartie: 'p1', nomPartie: 'A' }],
        contreParties: [{ idPartie: 'p2', nomPartie: 'B' }],
      },
    });
    expect(state.parties.length).toBe(2);
    expect(state.parties[0].typePartie).toBe('Pour');
    expect(state.parties[1].typePartie).toBe('Contre');
  });

  test('ne persiste pas en localStorage (skipPersistType)', () => {
    const base = getBaseCreate();
    // Clear les appels precedents (@@INIT declenche la persistence)
    Storage.prototype.setItem.mockClear();
    partieCreateReducer(base, {
      type: 'HYDRATE_PARTIES_FROM_DOSSIER',
      payload: { pourParties: [], contreParties: [] },
    });
    // setItem ne doit PAS etre appele pour HYDRATE
    const setItemCalls = Storage.prototype.setItem.mock.calls.filter(
      c => c[0] === 'partieData'
    );
    expect(setItemCalls.length).toBe(0);
  });
});

// ========================================================================
// partieCreate — Matchers: SET_LINK_ALL_POUR / CONTRE
// ========================================================================

describe('createPartieSlice SET_PARTIES_LINK_ALL_POUR', () => {
  test('ajoute un contact a toutes les parties Pour', () => {
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1', 'Pour'));
    state = addPartie(state, partieCreateReducer, partieCreateTypes, makePartie('p2', 'Contre'));
    state = partieCreateReducer(state, {
      type: partieCreateTypes.SET_LINK_POUR,
      payload: { contact: { _id: 'c1', nom: 'X', pro_contact: false } },
    });
    expect(state.parties[0].linkedContacts.length).toBe(1); // Pour
    expect(state.parties[1].linkedContacts.length).toBe(0); // Contre
  });
});

describe('createPartieSlice SET_PARTIES_LINK_ALL_CONTRE', () => {
  test('ajoute un contact a toutes les parties Contre', () => {
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1', 'Pour'));
    state = addPartie(state, partieCreateReducer, partieCreateTypes, makePartie('p2', 'Contre'));
    state = partieCreateReducer(state, {
      type: partieCreateTypes.SET_LINK_CONTRE,
      payload: { contact: { _id: 'c1', nom: 'X', pro_contact: false } },
    });
    expect(state.parties[0].linkedContacts.length).toBe(0); // Pour
    expect(state.parties[1].linkedContacts.length).toBe(1); // Contre
  });
});

// ========================================================================
// partieCreate — Matchers: DELETE_ALL_POUR / CONTRE
// ========================================================================

describe('createPartieSlice DELETE_LINKED_AVOCAT_ALL_POUR', () => {
  test('supprime un avocat de toutes les parties Pour', () => {
    const partie = makePartie('p1', 'Pour', {
      linkedAvocats: [{ _id: 'a1', fromResponsable: false, isPostulant: true, isPlaidant: true }],
    });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    state = partieCreateReducer(state, {
      type: partieCreateTypes.DEL_AV_POUR,
      payload: { avocatId: 'a1' },
    });
    expect(state.parties[0].linkedAvocats.length).toBe(0);
  });
});

describe('createPartieSlice DELETE_LINKED_CONTACT_ALL_POUR', () => {
  test('supprime un contact de toutes les parties Pour', () => {
    const partie = makePartie('p1', 'Pour', { linkedContacts: [{ _id: 'c1' }] });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    state = partieCreateReducer(state, {
      type: partieCreateTypes.DEL_CT_POUR,
      payload: { contactId: 'c1' },
    });
    expect(state.parties[0].linkedContacts.length).toBe(0);
  });
});

describe('createPartieSlice DELETE_LINKED_AVOCAT_ALL_CONTRE', () => {
  test('supprime un avocat de toutes les parties Contre', () => {
    const partie = makePartie('p1', 'Contre', {
      linkedAvocats: [{ _id: 'a1', isPostulant: false }],
    });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    state = partieCreateReducer(state, {
      type: partieCreateTypes.DEL_AV_CONTRE,
      payload: { avocatId: 'a1' },
    });
    expect(state.parties[0].linkedAvocats.length).toBe(0);
  });
});

describe('createPartieSlice DELETE_LINKED_CONTACT_ALL_CONTRE', () => {
  test('supprime un contact de toutes les parties Contre', () => {
    const partie = makePartie('p1', 'Contre', { linkedContacts: [{ _id: 'c1' }] });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    state = partieCreateReducer(state, {
      type: partieCreateTypes.DEL_CT_CONTRE,
      payload: { contactId: 'c1' },
    });
    expect(state.parties[0].linkedContacts.length).toBe(0);
  });
});

// ========================================================================
// partieCreate — UPDATE_LINKED_AVOCATS_FOR_POUR_PARTIES
// ========================================================================

describe('createPartieSlice UPDATE_LINKED_AVOCATS_FOR_POUR_PARTIES', () => {
  test('met a jour les avocats responsables de toutes les parties Pour', () => {
    const partie = makePartie('p1', 'Pour', {
      linkedAvocats: [{ _id: 'old', fromResponsable: true, isPostulant: true, isPlaidant: true }],
    });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    state = partieCreateReducer(state, {
      type: partieCreateTypes.UPDATE_AV_POUR,
      payload: [{ _id: 'new', isAvocat: true, isPlaidant: true, isPostulant: true }],
    });
    const avocats = state.parties[0].linkedAvocats;
    expect(avocats.find(a => a._id === 'new')).toBeDefined();
    expect(avocats.find(a => a._id === 'new').fromResponsable).toBe(true);
  });
});

// ========================================================================
// partieCreate — contact update propagation
// ========================================================================

describe('createPartieSlice contact update propagation (create)', () => {
  test('UPDATE_CONTACT_SUCCESS met a jour linkedContacts', () => {
    const partie = makePartie('p1', 'Pour', {
      linkedContacts: [{ _id: 'c1', nom: 'Old' }],
    });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    state = partieCreateReducer(state, {
      type: 'UPDATE_CONTACT_SUCCESS',
      payload: { _id: 'c1', nom: 'New' },
    });
    expect(state.parties[0].linkedContacts[0].nom).toBe('New');
  });

  test('UPDATE_CONTACT_SUCCESS met a jour linkedAvocats (avocat)', () => {
    const partie = makePartie('p1', 'Pour', {
      linkedAvocats: [{ _id: 'a1', prenomOfficeUser: 'Old', nomOfficeUser: 'AV' }],
    });
    let state = addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, partie);
    state = partieCreateReducer(state, {
      type: 'UPDATE_CONTACT_SUCCESS',
      payload: { _id: 'a1', nom: 'NewAV', prenoms: 'NewP', pro_contact: true, type: 'Avocat' },
    });
    expect(state.parties[0].linkedAvocats[0].prenomOfficeUser).toBe('NewP');
    expect(state.parties[0].linkedAvocats[0].nomOfficeUser).toBe('NewAV');
  });
});

// ========================================================================
// partieCreate — Persistence localStorage
// ========================================================================

describe('createPartieSlice persistence localStorage', () => {
  test('persiste dans localStorage apres chaque action (sauf HYDRATE)', () => {
    addPartie(getBaseCreate(), partieCreateReducer, partieCreateTypes, makePartie('p1'));
    const calls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'partieData');
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });
});

// ========================================================================
// partieCreate — Action creators
// ========================================================================

describe('createPartieSlice action creators partieCreate', () => {
  test('setPartieLink retourne le bon type', () => {
    const action = partieCreateActions.setPartieLink('p1', { _id: 'c1' });
    expect(action.type).toBe('SET_PARTIE_LINK');
    expect(action.payload.idPartie).toBe('p1');
  });

  test('deletePartie retourne le bon type', () => {
    expect(partieCreateActions.deletePartie('p1').type).toBe('DELETE_PARTIE');
  });

  test('resetParties retourne le bon type', () => {
    expect(partieCreateActions.resetParties().type).toBe('RESET_PARTIES');
  });

  test('hydratePartiesFromDossier retourne le bon type', () => {
    const action = partieCreateActions.hydratePartiesFromDossier([], []);
    expect(action.type).toBe('HYDRATE_PARTIES_FROM_DOSSIER');
  });

  test('deleteLinkedContactAllPour accepte un objet ou un id', () => {
    const a1 = partieCreateActions.deleteLinkedContactAllPour({ _id: 'c1' });
    expect(a1.payload.contactId).toBe('c1');
    const a2 = partieCreateActions.deleteLinkedContactAllPour('c2');
    expect(a2.payload.contactId).toBe('c2');
  });
});

// ========================================================================
// partieCreate — Thunk setPartie
// ========================================================================

describe('createPartieSlice thunk setPartie (partieCreate)', () => {
  const baseGetState = {
    dossierInfos: {
      dossierData: {
        responsables: [
          { _id: 'resp1', isAvocat: true, prenomOfficeUser: 'J', nomOfficeUser: 'D', genre: 'Masculin' },
        ],
      },
    },
    officeUser: {
      officeUsers: [
        { _id: 'resp1', email: 'resp@test.com', address: 'addr', city: 'Paris', postalCode: '75000' },
      ],
    },
    login: { user: { _id: 'u1', firstName: 'Admin', lastName: 'Test', genre: 'M', email: 'admin@test.com' } },
    partieData: { parties: [] },
  };

  test('dispatch SET_PARTIE pour une partie Pour avec responsables', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => baseGetState);
    const contactData = { _id: 'c1', nom: 'Dupont', prenoms: 'Jean' };

    partieCreateActions.setPartie('Pour', contactData)(dispatch, getState);

    expect(dispatch).toHaveBeenCalledTimes(1);
    const action = dispatch.mock.calls[0][0];
    expect(action.type).toBe('SET_PARTIE');
    expect(action.payload.typePartie).toBe('Pour');
    expect(action.payload.linkedAvocats.length).toBeGreaterThanOrEqual(1);
  });

  test('dispatch SET_PARTIE pour une partie Contre (pas de responsables)', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => baseGetState);
    const contactData = { _id: 'c2', nom: 'Martin', prenoms: 'Sophie' };

    partieCreateActions.setPartie('Contre', contactData)(dispatch, getState);

    const action = dispatch.mock.calls[0][0];
    expect(action.payload.typePartie).toBe('Contre');
    // Pour 'Contre', fromResponsable est retire
    const hasFromResp = action.payload.linkedAvocats.some(a => a.fromResponsable);
    expect(hasFromResp).toBe(false);
  });

  test('utilise raisonSociale comme nomPartie', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => baseGetState);
    const contactData = { _id: 'c3', raisonSociale: 'SARL Test' };

    partieCreateActions.setPartie('Pour', contactData)(dispatch, getState);

    expect(dispatch.mock.calls[0][0].payload.nomPartie).toBe('SARL Test');
  });

  test('ne dispatch rien si contactData sans _id', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => baseGetState);

    partieCreateActions.setPartie('Pour', {})(dispatch, getState);

    expect(dispatch).not.toHaveBeenCalled();
  });

  test('utilise le user comme responsable fallback si pas de responsables', () => {
    const dispatch = jest.fn();
    const stateNoResp = {
      ...baseGetState,
      dossierInfos: { dossierData: { responsables: [] } },
    };
    const getState = jest.fn(() => stateNoResp);
    const contactData = { _id: 'c4', denomination: 'Mairie' };

    partieCreateActions.setPartie('Pour', contactData)(dispatch, getState);

    const avocats = dispatch.mock.calls[0][0].payload.linkedAvocats;
    expect(avocats.length).toBeGreaterThanOrEqual(1);
    expect(avocats[0].fromResponsable).toBe(true);
  });
});

// ========================================================================
// partieEdit — divergences specifiques
// ========================================================================

describe('createPartieSlice instance partieEdit divergences', () => {
  test('prefixe EDIT_ sur les types', () => {
    expect(partieEditTypes.SET).toBe('EDIT_SET_PARTIE');
    expect(partieEditTypes.DELETE).toBe('EDIT_DELETE_PARTIE');
    expect(partieEditTypes.RESET).toBe('EDIT_RESET_PARTIES');
  });

  test('EDIT_RESET ne persiste pas (skipPersistType)', () => {
    let state = addPartie(getBaseEdit(), partieEditReducer, partieEditTypes, makePartie('p1'));
    Storage.prototype.setItem.mockClear();
    partieEditReducer(state, { type: partieEditTypes.RESET });
    const calls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'partieEditData');
    expect(calls.length).toBe(0);
  });

  test('HYDRATE_EDIT_PARTIES_FROM_DOSSIER normalise les parties avec ObjectId', () => {
    const state = partieEditReducer(getBaseEdit(), {
      type: 'HYDRATE_EDIT_PARTIES_FROM_DOSSIER',
      payload: {
        pourParties: [{
          partieData: { _id: '507f1f77bcf86cd799439011', nom: 'A', prenoms: 'B' },
          nomPartie: 'A B',
          avocats: [{ _id: 'av1' }],
          contacts: [{ _id: 'ct1' }],
        }],
        contreParties: [],
      },
    });
    expect(state.parties.length).toBe(1);
    expect(state.parties[0].idPartie).toBe('507f1f77bcf86cd799439011');
    expect(state.parties[0].typePartie).toBe('Pour');
    expect(state.parties[0].linkedAvocats).toEqual([{ _id: 'av1' }]);
    expect(state.parties[0].linkedContacts).toEqual([{ _id: 'ct1' }]);
    expect(state.shouldPopulateNameFields).toBe(false);
  });

  test('HYDRATE_EDIT fallback idPartie si partieData manquant', () => {
    const state = partieEditReducer(getBaseEdit(), {
      type: 'HYDRATE_EDIT_PARTIES_FROM_DOSSIER',
      payload: {
        pourParties: [{
          idPartie: '507f1f77bcf86cd799439012',
          nomPartie: 'Fallback',
          avocats: [],
          contacts: [],
        }],
        contreParties: [],
      },
    });
    expect(state.parties[0].idPartie).toBe('507f1f77bcf86cd799439012');
    expect(state.parties[0].partieData).toEqual({});
  });

  test('onContactUpdate edit met a jour partieData si idPartie correspond', () => {
    const partie = makePartie('c1', 'Pour', { partieData: { nom: 'Old' } });
    let state = addPartie(getBaseEdit(), partieEditReducer, partieEditTypes, partie);
    state = partieEditReducer(state, {
      type: 'EDIT_UPDATE_CONTACT_SUCCESS',
      payload: { _id: 'c1', nom: 'NewName', prenoms: 'NewP' },
    });
    expect(state.parties[0].partieData.nom).toBe('NewName');
  });

  test('UPDATE_ENTITY_IN_DOSSIER_SUCCESS met a jour partieData et nomPartie', () => {
    const partie = makePartie('e1', 'Pour', { partieData: { raisonSociale: 'OldRS' } });
    let state = addPartie(getBaseEdit(), partieEditReducer, partieEditTypes, partie);
    state = partieEditReducer(state, {
      type: 'UPDATE_ENTITY_IN_DOSSIER_SUCCESS',
      payload: { updatedEntity: { _id: 'e1', raisonSociale: 'NewRS' } },
    });
    expect(state.parties[0].partieData.raisonSociale).toBe('NewRS');
    expect(state.parties[0].nomPartie).toBe('NewRS');
  });

  test('UPDATE_ENTITY_IN_DOSSIER_SUCCESS met a jour linkedContacts et linkedAvocats', () => {
    const partie = makePartie('e0', 'Pour', {
      linkedContacts: [{ _id: 'e2', nom: 'Old' }],
      linkedAvocats: [{ _id: 'e2', nomOfficeUser: 'OldAV' }],
    });
    let state = addPartie(getBaseEdit(), partieEditReducer, partieEditTypes, partie);
    state = partieEditReducer(state, {
      type: 'UPDATE_ENTITY_IN_DOSSIER_SUCCESS',
      payload: { updatedEntity: { _id: 'e2', nom: 'New', prenoms: 'P', email: 'e@e.com' } },
    });
    expect(state.parties[0].linkedContacts[0].nom).toBe('New');
    expect(state.parties[0].linkedAvocats[0].nomOfficeUser).toBe('New');
    expect(state.parties[0].linkedAvocats[0].prenomOfficeUser).toBe('P');
  });
});

// ========================================================================
// Shims — verification des re-exports
// ========================================================================

describe('partieSlice shim re-exports', () => {
  let partieSliceShim;
  beforeEach(() => {
    jest.isolateModules(() => {
      partieSliceShim = require('../partieSlice');
    });
  });

  test('exporte les constantes de type sans prefixe', () => {
    expect(partieSliceShim.SET_PARTIE).toBe('SET_PARTIE');
    expect(partieSliceShim.DELETE_PARTIE).toBe('DELETE_PARTIE');
    expect(partieSliceShim.RESET_PARTIES).toBe('RESET_PARTIES');
  });

  test('exporte les action creators', () => {
    expect(typeof partieSliceShim.setPartie).toBe('function');
    expect(typeof partieSliceShim.setPartieLink).toBe('function');
    expect(typeof partieSliceShim.resetParties).toBe('function');
  });

  test('exporte le reducer par defaut', () => {
    expect(typeof partieSliceShim.default).toBe('function');
  });
});

describe('partieEditSlice shim re-exports', () => {
  let partieEditShim;
  beforeEach(() => {
    jest.isolateModules(() => {
      partieEditShim = require('../partieEditSlice');
    });
  });

  test('exporte les constantes de type avec prefixe EDIT_', () => {
    expect(partieEditShim.EDIT_SET_PARTIE).toBe('EDIT_SET_PARTIE');
    expect(partieEditShim.EDIT_DELETE_PARTIE).toBe('EDIT_DELETE_PARTIE');
    expect(partieEditShim.EDIT_RESET_PARTIES).toBe('EDIT_RESET_PARTIES');
  });

  test('exporte les action creators edit', () => {
    expect(typeof partieEditShim.setPartie).toBe('function');
    expect(typeof partieEditShim.resetParties).toBe('function');
  });

  test('exporte le reducer par defaut', () => {
    expect(typeof partieEditShim.default).toBe('function');
  });
});
