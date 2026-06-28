// Mock currentDossierSlice exports (string constants)
jest.mock('../currentDossierSlice', () => ({
  UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS: 'UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS',
  DELETE_DOSSIER_SUCCESS: 'DELETE_DOSSIER_SUCCESS',
  UPDATE_CURRENT_DOSSIER_SUCCESS: 'UPDATE_CURRENT_DOSSIER_SUCCESS',
}));

jest.mock('../../../services/apiClient');

import reducer from '../last25DossiersSlice';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation();
});

afterEach(() => {
  console.error.mockRestore();
});

const defaultInitialState = {
  loading: false,
  lastDossiers: [],
  error: null,
  fetchAttempted: false,
};

const makeDossier = (id, extra = {}) => ({
  _id: id,
  nom_dossier: `Dossier ${id}`,
  dossier: { documents: [], parties: { pour: [], contre: [] } },
  ...extra,
});

// --- Reducer Tests ---

describe('last25DossiersSlice reducer', () => {
  test('retourne l état initial par défaut', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state).toHaveProperty('lastDossiers');
    expect(state).toHaveProperty('loading');
  });

  // Fetch lifecycle
  test('FETCH_LAST_25_DOSSIERS_REQUEST met loading=true, fetchAttempted=true', () => {
    const state = reducer(defaultInitialState, { type: 'FETCH_LAST_25_DOSSIERS_REQUEST' });
    expect(state.loading).toBe(true);
    expect(state.fetchAttempted).toBe(true);
    expect(state.error).toBeNull();
  });

  test('FETCH_LAST_25_DOSSIERS_SUCCESS définit lastDossiers', () => {
    const dossiers = [makeDossier('d1'), makeDossier('d2')];
    const state = reducer(defaultInitialState, { type: 'FETCH_LAST_25_DOSSIERS_SUCCESS', payload: dossiers });
    expect(state.lastDossiers).toHaveLength(2);
    expect(state.loading).toBe(false);
  });

  test('FETCH_LAST_25_DOSSIERS_ERROR définit l erreur', () => {
    const state = reducer(defaultInitialState, { type: 'FETCH_LAST_25_DOSSIERS_ERROR', payload: 'err' });
    expect(state.error).toBe('err');
    expect(state.loading).toBe(false);
  });

  // MOVE_DOSSIER_TO_TOP
  test('MOVE_DOSSIER_TO_TOP déplace le dossier en tête et déduplique', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1'), makeDossier('d2'), makeDossier('d3')] };
    const state = reducer(prev, { type: 'MOVE_DOSSIER_TO_TOP', payload: makeDossier('d3') });
    expect(state.lastDossiers[0]._id).toBe('d3');
    expect(state.lastDossiers).toHaveLength(3);
  });

  test('MOVE_DOSSIER_TO_TOP ajoute un nouveau dossier en tête', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1')] };
    const state = reducer(prev, { type: 'MOVE_DOSSIER_TO_TOP', payload: makeDossier('d2') });
    expect(state.lastDossiers[0]._id).toBe('d2');
    expect(state.lastDossiers).toHaveLength(2);
  });

  test('MOVE_DOSSIER_TO_TOP tronque à 25 éléments', () => {
    const dossiers = Array.from({ length: 25 }, (_, i) => makeDossier(`d${i}`));
    const prev = { ...defaultInitialState, lastDossiers: dossiers };
    const state = reducer(prev, { type: 'MOVE_DOSSIER_TO_TOP', payload: makeDossier('new') });
    expect(state.lastDossiers).toHaveLength(25);
    expect(state.lastDossiers[0]._id).toBe('new');
  });

  test('MOVE_DOSSIER_TO_TOP ignore payload null', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1')] };
    const state = reducer(prev, { type: 'MOVE_DOSSIER_TO_TOP', payload: null });
    expect(state.lastDossiers).toHaveLength(1);
  });

  test('MOVE_DOSSIER_TO_TOP ignore payload sans _id', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1')] };
    const state = reducer(prev, { type: 'MOVE_DOSSIER_TO_TOP', payload: { nom: 'test' } });
    expect(state.lastDossiers).toHaveLength(1);
  });

  // UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS
  test('UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS supprime le document par docId', () => {
    const dossier = makeDossier('d1', {
      dossier: { documents: [{ _id: 'doc1' }, { _id: 'doc2' }] },
    });
    const prev = { ...defaultInitialState, lastDossiers: [dossier] };
    const state = reducer(prev, {
      type: 'UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS',
      payload: { dossierId: 'd1', docId: 'doc1' },
    });
    expect(state.lastDossiers[0].dossier.documents).toHaveLength(1);
    expect(state.lastDossiers[0].dossier.documents[0]._id).toBe('doc2');
  });

  test('UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS ignore dossierId inconnu', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1')] };
    const state = reducer(prev, {
      type: 'UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS',
      payload: { dossierId: 'xxx', docId: 'doc1' },
    });
    expect(state.lastDossiers).toHaveLength(1);
  });

  // DELETE_DOSSIER_SUCCESS
  test('DELETE_DOSSIER_SUCCESS supprime le dossier', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1'), makeDossier('d2')] };
    const state = reducer(prev, { type: 'DELETE_DOSSIER_SUCCESS', payload: { dossierId: 'd1' } });
    expect(state.lastDossiers).toHaveLength(1);
    expect(state.lastDossiers[0]._id).toBe('d2');
  });

  // SUBFOLDER_ACTION_SUCCESS
  test('SUBFOLDER_ACTION_SUCCESS remplace le dossier à l index correspondant', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1'), makeDossier('d2')] };
    const updated = { ...makeDossier('d1'), nom_dossier: 'Updated' };
    const state = reducer(prev, { type: 'SUBFOLDER_ACTION_SUCCESS', payload: updated });
    expect(state.lastDossiers[0].nom_dossier).toBe('Updated');
  });

  test('SUBFOLDER_ACTION_SUCCESS ignore si dossier non trouvé', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1')] };
    const state = reducer(prev, { type: 'SUBFOLDER_ACTION_SUCCESS', payload: makeDossier('xxx') });
    expect(state.lastDossiers).toHaveLength(1);
    expect(state.lastDossiers[0]._id).toBe('d1');
  });

  // UPDATE_CURRENT_DOSSIER
  test('UPDATE_CURRENT_DOSSIER remplace le dossier', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1')] };
    const updated = { ...makeDossier('d1'), nom_dossier: 'Updated' };
    const state = reducer(prev, { type: 'UPDATE_CURRENT_DOSSIER', payload: updated });
    expect(state.lastDossiers[0].nom_dossier).toBe('Updated');
  });

  // UPDATE_CURRENT_DOSSIER_SUCCESS
  test('UPDATE_CURRENT_DOSSIER_SUCCESS remplace le dossier', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1')] };
    const updated = { ...makeDossier('d1'), nom_dossier: 'Synced' };
    const state = reducer(prev, { type: 'UPDATE_CURRENT_DOSSIER_SUCCESS', payload: updated });
    expect(state.lastDossiers[0].nom_dossier).toBe('Synced');
  });

  test('UPDATE_CURRENT_DOSSIER_SUCCESS ignore payload null', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1')] };
    const state = reducer(prev, { type: 'UPDATE_CURRENT_DOSSIER_SUCCESS', payload: null });
    expect(state.lastDossiers).toHaveLength(1);
  });

  test('UPDATE_CURRENT_DOSSIER_SUCCESS ignore payload sans _id', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1')] };
    const state = reducer(prev, { type: 'UPDATE_CURRENT_DOSSIER_SUCCESS', payload: { nom: 'test' } });
    expect(state.lastDossiers).toHaveLength(1);
  });

  // SET_SELECTED_ENTITY
  test('SET_SELECTED_ENTITY met à jour partieData dans pour/contre', () => {
    const dossier = makeDossier('d1', {
      dossier: {
        documents: [],
        parties: {
          pour: [{ partieData: { _id: 'ent1', nom: 'Old' }, avocats: [], contacts: [] }],
          contre: [],
        },
      },
    });
    const prev = { ...defaultInitialState, lastDossiers: [dossier] };
    const entity = { _id: 'ent1', nom: 'New' };
    const state = reducer(prev, { type: 'SET_SELECTED_ENTITY', payload: entity });
    expect(state.lastDossiers[0].dossier.parties.pour[0].partieData.nom).toBe('New');
  });

  test('SET_SELECTED_ENTITY met à jour les avocats', () => {
    const dossier = makeDossier('d1', {
      dossier: {
        documents: [],
        parties: {
          pour: [{ partieData: { _id: 'x' }, avocats: [{ _id: 'av1', nom: 'Old' }], contacts: [] }],
          contre: [],
        },
      },
    });
    const prev = { ...defaultInitialState, lastDossiers: [dossier] };
    const state = reducer(prev, { type: 'SET_SELECTED_ENTITY', payload: { _id: 'av1', nom: 'Updated' } });
    expect(state.lastDossiers[0].dossier.parties.pour[0].avocats[0].nom).toBe('Updated');
  });

  test('SET_SELECTED_ENTITY met à jour les contacts', () => {
    const dossier = makeDossier('d1', {
      dossier: {
        documents: [],
        parties: {
          pour: [],
          contre: [{ partieData: { _id: 'x' }, avocats: [], contacts: [{ _id: 'c1', nom: 'Old' }] }],
        },
      },
    });
    const prev = { ...defaultInitialState, lastDossiers: [dossier] };
    const state = reducer(prev, { type: 'SET_SELECTED_ENTITY', payload: { _id: 'c1', nom: 'Updated' } });
    expect(state.lastDossiers[0].dossier.parties.contre[0].contacts[0].nom).toBe('Updated');
  });

  test('SET_SELECTED_ENTITY ignore payload sans _id', () => {
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1')] };
    const state = reducer(prev, { type: 'SET_SELECTED_ENTITY', payload: { nom: 'test' } });
    expect(state.lastDossiers).toHaveLength(1);
  });

  test('SET_SELECTED_ENTITY ignore dossier sans parties', () => {
    const dossier = { _id: 'd1', dossier: { documents: [] } };
    const prev = { ...defaultInitialState, lastDossiers: [dossier] };
    // Should not throw
    const state = reducer(prev, { type: 'SET_SELECTED_ENTITY', payload: { _id: 'ent1' } });
    expect(state.lastDossiers).toHaveLength(1);
  });

  // Auth cleanup
  test('LOGOUT supprime localStorage et retourne l état par défaut', () => {
    const spy = jest.spyOn(Storage.prototype, 'removeItem');
    const prev = { ...defaultInitialState, lastDossiers: [makeDossier('d1')] };
    const state = reducer(prev, { type: 'LOGOUT' });
    expect(state).toEqual(defaultInitialState);
    expect(spy).toHaveBeenCalledWith('lastDossiersState');
    spy.mockRestore();
  });

  test('AUTH_ERROR supprime localStorage et retourne l état par défaut', () => {
    const spy = jest.spyOn(Storage.prototype, 'removeItem');
    const state = reducer({ ...defaultInitialState, lastDossiers: [makeDossier('d1')] }, { type: 'AUTH_ERROR' });
    expect(state).toEqual(defaultInitialState);
    expect(spy).toHaveBeenCalledWith('lastDossiersState');
    spy.mockRestore();
  });
});

// --- localStorage Wrapper ---

describe('last25DossiersSlice localStorage persistence', () => {
  test('FETCH_LAST_25_DOSSIERS_SUCCESS déclenche setItem', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem');
    reducer(defaultInitialState, { type: 'FETCH_LAST_25_DOSSIERS_SUCCESS', payload: [makeDossier('d1')] });
    expect(spy).toHaveBeenCalledWith('lastDossiersState', expect.any(String));
    spy.mockRestore();
  });

  test('MOVE_DOSSIER_TO_TOP déclenche setItem', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem');
    reducer(defaultInitialState, { type: 'MOVE_DOSSIER_TO_TOP', payload: makeDossier('d1') });
    expect(spy).toHaveBeenCalledWith('lastDossiersState', expect.any(String));
    spy.mockRestore();
  });

  test('action non-persistée ne déclenche PAS setItem', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem');
    reducer(defaultInitialState, { type: 'FETCH_LAST_25_DOSSIERS_REQUEST' });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
