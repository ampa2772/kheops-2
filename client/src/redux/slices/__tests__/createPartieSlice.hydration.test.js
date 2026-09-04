// Hydratation des anciens snapshots, changement de compte et brouillon
// corrompu — createPartieSlice.js

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
});

const loadSlice = (storedDrafts = {}) => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => (
    Object.prototype.hasOwnProperty.call(storedDrafts, key) ? storedDrafts[key] : null
  ));
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation();
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation();
  let mod;
  jest.isolateModules(() => { mod = require('../createPartieSlice'); });
  return mod;
};

describe('HYDRATE_EDIT_PARTIES_FROM_DOSSIER — alias historiques', () => {
  test('fusionne avocats/linkedAvocats et contacts/linkedContacts sans doublon', () => {
    const { partieEditReducer } = loadSlice();
    const state = partieEditReducer(undefined, {
      type: 'HYDRATE_EDIT_PARTIES_FROM_DOSSIER',
      payload: {
        pourParties: [{
          idPartie: '507f1f77bcf86cd799439011',
          nomPartie: 'Ancien dossier',
          partieData: { _id: '507f1f77bcf86cd799439011', nom: 'Ancien' },
          avocats: [{ _id: 'av-canonique', isAvocat: true, isPlaidant: true }],
          linkedAvocats: [
            { _id: 'av-canonique', isAvocat: true },
            { _id: 'av-legacy', isAvocat: true, isPostulant: true },
          ],
          contacts: [{ _id: 'ct-canonique', nom: 'Canonique' }],
          linkedContacts: [{ _id: 'ct-legacy', nom: 'Historique' }, { _id: 'ct-canonique', nom: 'Doublon' }],
        }],
        contreParties: [],
      },
    });
    const [partie] = state.parties;
    expect(partie.linkedAvocats.map((a) => a._id)).toEqual(['av-canonique', 'av-legacy']);
    // La copie canonique prime sur l'alias (roles conserves).
    expect(partie.linkedAvocats[0]).toMatchObject({ isPlaidant: true });
    expect(partie.linkedContacts.map((c) => c._id)).toEqual(['ct-canonique', 'ct-legacy']);
    expect(partie.linkedContacts[0]).toMatchObject({ nom: 'Canonique' });
  });

  test('un snapshot sans aucune relation donne des tableaux vides', () => {
    const { partieEditReducer } = loadSlice();
    const state = partieEditReducer(undefined, {
      type: 'HYDRATE_EDIT_PARTIES_FROM_DOSSIER',
      payload: { pourParties: [], contreParties: [{ idPartie: '507f1f77bcf86cd799439012', nomPartie: 'Adverse' }] },
    });
    expect(state.parties[0]).toMatchObject({ typePartie: 'Contre', linkedAvocats: [], linkedContacts: [] });
  });
});

describe('changement de compte sans deconnexion (retour OAuth)', () => {
  test('SESSION_USER_CHANGED purge les deux brouillons et ne les re-ecrit pas', () => {
    const { partieCreateReducer, partieCreateTypes, partieEditReducer, partieEditTypes } = loadSlice();
    const partie = { idPartie: 'p1', nomPartie: 'P', partieData: {}, typePartie: 'Pour', linkedContacts: [{ _id: 'c1' }], linkedAvocats: [] };
    const createState = partieCreateReducer(partieCreateReducer(undefined, { type: '@@INIT' }), { type: partieCreateTypes.SET, payload: partie });
    const editState = partieEditReducer(partieEditReducer(undefined, { type: '@@INIT' }), { type: partieEditTypes.SET, payload: partie });
    Storage.prototype.setItem.mockClear();
    const action = { type: 'SESSION_USER_CHANGED', payload: { previousUserId: 'u1', userId: 'u2' } };
    expect(partieCreateReducer(createState, action).parties).toEqual([]);
    expect(partieEditReducer(editState, action).parties).toEqual([]);
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('partieData');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('partieEditData');
    expect(Storage.prototype.setItem).not.toHaveBeenCalled();
  });
});

describe('brouillon localStorage corrompu', () => {
  test('un JSON invalide ne casse pas le chargement et est supprime', () => {
    const { partieCreateReducer } = loadSlice({ partieData: '{"parties": [' });
    const state = partieCreateReducer(undefined, { type: '@@INIT' });
    expect(state).toEqual({ parties: [], shouldPopulateNameFields: true });
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('partieData');
  });

  test('un JSON valide mais sans tableau parties est ignore', () => {
    const { partieEditReducer } = loadSlice({ partieEditData: '{"foo": 1}' });
    const state = partieEditReducer(undefined, { type: '@@INIT' });
    expect(state.parties).toEqual([]);
  });

  test('un brouillon valide est restaure', () => {
    const { partieCreateReducer } = loadSlice({ partieData: JSON.stringify({ parties: [{ idPartie: 'p9', nomPartie: 'Brouillon', partieData: {}, typePartie: 'Pour', linkedContacts: [], linkedAvocats: [] }], shouldPopulateNameFields: false }) });
    const state = partieCreateReducer(undefined, { type: '@@INIT' });
    expect(state.parties.map((p) => p.idPartie)).toEqual(['p9']);
    expect(state.shouldPopulateNameFields).toBe(false);
  });
});
