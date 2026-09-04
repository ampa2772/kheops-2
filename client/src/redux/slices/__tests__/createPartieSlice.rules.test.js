// Regles metier des parties (responsables internes, changement de camp,
// fin de session, resynchronisation serveur) — createPartieSlice.js

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

let partieCreateReducer, partieCreateTypes, partieCreateActions;
let partieEditReducer, partieEditTypes, partieEditActions;
let reconcileResponsablesForPour;

beforeEach(() => {
  jest.isolateModules(() => {
    const mod = require('../createPartieSlice');
    partieCreateReducer = mod.partieCreateReducer;
    partieCreateTypes = mod.partieCreateTypes;
    partieCreateActions = mod.partieCreateActions;
    partieEditReducer = mod.partieEditReducer;
    partieEditTypes = mod.partieEditTypes;
    partieEditActions = mod.partieEditActions;
    reconcileResponsablesForPour = mod.reconcileResponsablesForPour;
  });
});

const getBaseCreate = () => partieCreateReducer(undefined, { type: '@@INIT' });
const getBaseEdit = () => partieEditReducer(undefined, { type: '@@INIT' });
const responsable = (id, extras = {}) => ({
  _id: id, nomOfficeUser: `Resp ${id}`, prenomOfficeUser: 'R', isAvocat: true, fromResponsable: true,
  isPlaidant: true, isPostulant: false, ...extras,
});
const externe = (id, extras = {}) => ({
  _id: id, nomOfficeUser: `Ext ${id}`, prenomOfficeUser: 'E', isAvocat: true, fromResponsable: false,
  isPlaidant: true, isPostulant: false, ...extras,
});
const stateWithParty = (reducer, types, partie) => reducer(reducer(undefined, { type: '@@INIT' }), { type: types.SET, payload: partie });

const twoResponsablesState = {
  dossierInfos: {
    dossierData: {
      responsables: [
        { _id: 'r1', isAvocat: true, prenomOfficeUser: 'A', nomOfficeUser: 'Un', genre: 'Masculin' },
        { _id: 'r2', isAvocat: true, prenomOfficeUser: 'B', nomOfficeUser: 'Deux', genre: 'Feminin' },
      ],
    },
  },
  officeUser: { officeUsers: [] },
  login: { user: { _id: 'u1', firstName: 'Admin', lastName: 'Test', genre: 'M', email: 'a@t.fr' } },
  partieData: { parties: [] },
};

describe('reconcileResponsablesForPour (regle serveur reproduite cote client)', () => {
  test('sans postulant externe, exactement un responsable est postulant et tous restent plaidants', () => {
    const out = reconcileResponsablesForPour([responsable('r1'), responsable('r2'), externe('e1')]);
    expect(out.filter((a) => a.fromResponsable && a.isPostulant)).toHaveLength(1);
    expect(out.filter((a) => a.fromResponsable).every((a) => a.isPlaidant)).toBe(true);
  });

  test('conserve le responsable deja postulant plutot que le premier', () => {
    const out = reconcileResponsablesForPour([responsable('r1'), responsable('r2', { isPostulant: true })]);
    expect(out.find((a) => a._id === 'r2').isPostulant).toBe(true);
    expect(out.find((a) => a._id === 'r1').isPostulant).toBe(false);
  });

  test('un avocat externe postulant retire le role postulant a tous les responsables', () => {
    const out = reconcileResponsablesForPour([responsable('r1', { isPostulant: true }), externe('e1', { isPostulant: true })]);
    expect(out.find((a) => a._id === 'r1').isPostulant).toBe(false);
    expect(out.find((a) => a._id === 'r1').isPlaidant).toBe(true);
    expect(out.find((a) => a._id === 'e1').isPostulant).toBe(true);
  });

  test('un responsable rendu non plaidant est remis plaidant (les responsables restent plaidants)', () => {
    const out = reconcileResponsablesForPour([responsable('r1', { isPlaidant: false })]);
    expect(out[0]).toMatchObject({ isPlaidant: true, isPostulant: true });
  });
});

describe('thunk setPartie — changement de camp et responsables', () => {
  test('une partie CONTRE ne conserve pas les responsables internes comme avocats adverses', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => twoResponsablesState);
    const fromPour = [responsable('r1', { isPostulant: true }), externe('e1', { isPostulant: false })];

    partieCreateActions.setPartie('Contre', { _id: 'c1', nom: 'Adverse' }, [], fromPour)(dispatch, getState);

    const avocats = dispatch.mock.calls[0][0].payload.linkedAvocats;
    expect(avocats.map((a) => a._id)).toEqual(['e1']);
  });

  test('aller-retour Pour → Contre → Pour : les responsables reviennent, un seul postulant, l externe conserve ses roles', () => {
    const getState = jest.fn(() => twoResponsablesState);
    const dispatchPour1 = jest.fn();
    partieCreateActions.setPartie('Pour', { _id: 'c1', nom: 'Client' }, [], [externe('e1', { isPlaidant: true })])(dispatchPour1, getState);
    const pour1 = dispatchPour1.mock.calls[0][0].payload.linkedAvocats;
    expect(pour1.filter((a) => a.fromResponsable)).toHaveLength(2);
    expect(pour1.filter((a) => a.fromResponsable && a.isPostulant)).toHaveLength(1);

    const dispatchContre = jest.fn();
    partieCreateActions.setPartie('Contre', { _id: 'c1', nom: 'Client' }, [], pour1)(dispatchContre, getState);
    const contre = dispatchContre.mock.calls[0][0].payload.linkedAvocats;
    expect(contre.map((a) => a._id)).toEqual(['e1']);

    const dispatchPour2 = jest.fn();
    partieCreateActions.setPartie('Pour', { _id: 'c1', nom: 'Client' }, [], contre)(dispatchPour2, getState);
    const pour2 = dispatchPour2.mock.calls[0][0].payload.linkedAvocats;
    expect(pour2.filter((a) => a.fromResponsable)).toHaveLength(2);
    expect(pour2.filter((a) => a.fromResponsable && a.isPostulant)).toHaveLength(1);
    expect(pour2.find((a) => a._id === 'e1')).toMatchObject({ isPlaidant: true, isPostulant: false });
  });

  test('avec deux responsables, un seul devient postulant (plus "tous postulants")', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => twoResponsablesState);
    partieCreateActions.setPartie('Pour', { _id: 'c1', nom: 'Client' })(dispatch, getState);
    const avocats = dispatch.mock.calls[0][0].payload.linkedAvocats;
    expect(avocats).toHaveLength(2);
    expect(avocats.filter((a) => a.isPostulant)).toHaveLength(1);
    expect(avocats.every((a) => a.isPlaidant)).toBe(true);
  });

  test('un externe postulant fourni desactive le postulant des responsables', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => twoResponsablesState);
    partieCreateActions.setPartie('Pour', { _id: 'c1', nom: 'Client' }, [], [externe('e1', { isPostulant: true })])(dispatch, getState);
    const avocats = dispatch.mock.calls[0][0].payload.linkedAvocats;
    expect(avocats.filter((a) => a.fromResponsable).every((a) => a.isPostulant === false)).toBe(true);
    expect(avocats.find((a) => a._id === 'e1').isPostulant).toBe(true);
  });
});

describe('TOGGLE_AVOCAT_PROPERTY sur les responsables (partie Pour)', () => {
  const partyWithTwoResp = () => ({
    idPartie: 'p1', nomPartie: 'P', partieData: {}, typePartie: 'Pour', linkedContacts: [],
    linkedAvocats: [responsable('r1', { isPostulant: true }), responsable('r2')],
  });

  test('rendre r2 postulant retire le role a r1 (un seul responsable postulant)', () => {
    const state = stateWithParty(partieCreateReducer, partieCreateTypes, partyWithTwoResp());
    const next = partieCreateReducer(state, partieCreateActions.toggleAvocatProperty('p1', 'r2', 'isPostulant'));
    const avocats = next.parties[0].linkedAvocats;
    expect(avocats.find((a) => a._id === 'r2').isPostulant).toBe(true);
    expect(avocats.find((a) => a._id === 'r1').isPostulant).toBe(false);
  });

  test('retirer le seul postulant interne sans postulant externe le restaure (jamais zero postulant)', () => {
    const state = stateWithParty(partieEditReducer, partieEditTypes, partyWithTwoResp());
    const next = partieEditReducer(state, partieEditActions.toggleAvocatProperty('p1', 'r1', 'isPostulant'));
    const avocats = next.parties[0].linkedAvocats;
    expect(avocats.filter((a) => a.isPostulant)).toHaveLength(1);
    // Ordre stable : c'est le premier responsable (r1) qui redevient postulant,
    // exactement comme la reconciliation serveur (aucune bascule vers r2).
    expect(avocats.map((a) => a._id)).toEqual(['r1', 'r2']);
    expect(avocats[0]).toMatchObject({ _id: 'r1', isPostulant: true, isPlaidant: true });
    expect(avocats[1]).toMatchObject({ _id: 'r2', isPostulant: false });
  });

  test('un responsable reste plaidant meme si l utilisateur bascule le role', () => {
    const state = stateWithParty(partieCreateReducer, partieCreateTypes, partyWithTwoResp());
    const next = partieCreateReducer(state, partieCreateActions.toggleAvocatProperty('p1', 'r1', 'isPlaidant'));
    expect(next.parties[0].linkedAvocats.find((a) => a._id === 'r1').isPlaidant).toBe(true);
  });

  test('un externe qui devient postulant retire le postulant aux responsables ; l inverse le restaure', () => {
    const party = partyWithTwoResp();
    party.linkedAvocats.push(externe('e1'));
    let state = stateWithParty(partieCreateReducer, partieCreateTypes, party);
    state = partieCreateReducer(state, partieCreateActions.toggleAvocatProperty('p1', 'e1', 'isPostulant'));
    expect(state.parties[0].linkedAvocats.filter((a) => a.fromResponsable && a.isPostulant)).toHaveLength(0);
    state = partieCreateReducer(state, partieCreateActions.toggleAvocatProperty('p1', 'e1', 'isPostulant'));
    expect(state.parties[0].linkedAvocats.filter((a) => a.fromResponsable && a.isPostulant)).toHaveLength(1);
  });
});

describe('fin de session : le brouillon de parties est purge', () => {
  test.each(['auth/logout', 'LOGOUT', 'AUTH_ERROR', 'ACCOUNT_DELETED'])('%s vide partieData et supprime la cle localStorage', (type) => {
    const state = stateWithParty(partieCreateReducer, partieCreateTypes, { idPartie: 'p1', nomPartie: 'P', partieData: {}, typePartie: 'Pour', linkedContacts: [], linkedAvocats: [] });
    expect(state.parties).toHaveLength(1);
    Storage.prototype.setItem.mockClear();
    Storage.prototype.removeItem.mockClear();
    const next = partieCreateReducer(state, { type });
    expect(next.parties).toEqual([]);
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('partieData');
    // Rien n'est re-ecrit apres la purge (c'etait le bug : brouillon transmis au compte suivant).
    expect(Storage.prototype.setItem.mock.calls.filter((c) => c[0] === 'partieData')).toHaveLength(0);
  });

  test('auth/logout purge aussi partieEditData', () => {
    const state = stateWithParty(partieEditReducer, partieEditTypes, { idPartie: 'p1', nomPartie: 'P', partieData: {}, typePartie: 'Contre', linkedContacts: [], linkedAvocats: [] });
    Storage.prototype.setItem.mockClear();
    const next = partieEditReducer(state, { type: 'auth/logout' });
    expect(next.parties).toEqual([]);
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('partieEditData');
    expect(Storage.prototype.setItem.mock.calls.filter((c) => c[0] === 'partieEditData')).toHaveLength(0);
  });
});

describe('SYNC_PARTIE_RELATIONS — resynchronisation depuis la reponse serveur', () => {
  test('remplace les relations de la partie ciblee uniquement', () => {
    let state = getBaseEdit();
    state = partieEditReducer(state, { type: partieEditTypes.SET, payload: { idPartie: 'p1', nomPartie: 'P1', partieData: {}, typePartie: 'Pour', linkedContacts: [{ _id: 'old' }], linkedAvocats: [] } });
    state = partieEditReducer(state, { type: partieEditTypes.SET, payload: { idPartie: 'p2', nomPartie: 'P2', partieData: {}, typePartie: 'Contre', linkedContacts: [{ _id: 'keep' }], linkedAvocats: [] } });
    const next = partieEditReducer(state, partieEditActions.syncPartieRelations('p1', {
      avocats: [responsable('r1', { isPostulant: true })],
      contacts: [{ _id: 'c9', nom: 'Serveur' }],
    }));
    expect(next.parties[0].linkedAvocats.map((a) => a._id)).toEqual(['r1']);
    expect(next.parties[0].linkedContacts.map((c) => c._id)).toEqual(['c9']);
    expect(next.parties[1].linkedContacts.map((c) => c._id)).toEqual(['keep']);
  });

  test('ignore une partie inconnue et les tableaux absents', () => {
    let state = getBaseCreate();
    state = partieCreateReducer(state, { type: partieCreateTypes.SET, payload: { idPartie: 'p1', nomPartie: 'P1', partieData: {}, typePartie: 'Pour', linkedContacts: [{ _id: 'x' }], linkedAvocats: [] } });
    const same = partieCreateReducer(state, partieCreateActions.syncPartieRelations('inconnue', { avocats: [], contacts: [] }));
    expect(same.parties[0].linkedContacts).toHaveLength(1);
    const partial = partieCreateReducer(state, partieCreateActions.syncPartieRelations('p1', { avocats: [externe('e1')] }));
    expect(partial.parties[0].linkedContacts).toHaveLength(1);
    expect(partial.parties[0].linkedAvocats).toHaveLength(1);
  });

  test('les types sont prefixes correctement', () => {
    expect(partieCreateActions.syncPartieRelations('p', {}).type).toBe('SYNC_PARTIE_RELATIONS');
    expect(partieEditActions.syncPartieRelations('p', {}).type).toBe('EDIT_SYNC_PARTIE_RELATIONS');
  });
});
