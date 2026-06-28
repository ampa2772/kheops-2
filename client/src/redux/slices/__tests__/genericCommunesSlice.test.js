// Tests unitaires — genericCommunesSlice.js

jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import apiClient from '../../../services/apiClient';
import {
  fetchCommunesGeneric,
  resetCommunesGeneric,
  communesContactReducer,
  communesNotaireReducer,
  communesNaissanceContactReducer,
  communesPersonneChargeReducer,
  communesNaissancePCReducer,
  communesPersonneChargeUPReducer,
  communesNaissancePersonneChargeUPReducer,
  communesPMReducer,
  communesPMPReducer,
} from '../genericCommunesSlice';

const initialState = {
  communes: [],
  currentPage: 1,
  totalPages: Infinity,
};

// --- Factory tests (prefixe CONTACT) ---

describe('genericCommunesSlice factory (prefixe CONTACT)', () => {
  const reducer = communesContactReducer;

  test('retourne l etat initial par defaut', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state).toEqual(initialState);
  });

  test('CONTACT_SET_COMMUNES definit les communes', () => {
    const communes = [{ nom_commune: 'Paris' }, { nom_commune: 'Lyon' }];
    const state = reducer(initialState, { type: 'CONTACT_SET_COMMUNES', payload: communes });
    expect(state.communes).toEqual(communes);
  });

  test('CONTACT_SET_PAGINATION met a jour currentPage et totalPages', () => {
    const state = reducer(initialState, {
      type: 'CONTACT_SET_PAGINATION',
      payload: { currentPage: 3, totalPages: 10 },
    });
    expect(state.currentPage).toBe(3);
    expect(state.totalPages).toBe(10);
  });

  test('CONTACT_RESET_COMMUNES remet a l etat initial', () => {
    const modified = { communes: [{ nom: 'X' }], currentPage: 5, totalPages: 20 };
    const state = reducer(modified, { type: 'CONTACT_RESET_COMMUNES' });
    expect(state).toEqual(initialState);
  });

  test('action d un autre prefixe ne modifie pas l etat', () => {
    const state = reducer(initialState, { type: 'PM_SET_COMMUNES', payload: [{ nom: 'X' }] });
    expect(state.communes).toEqual([]);
  });
});

// --- Thunk fetchCommunesGeneric ---

describe('genericCommunesSlice thunk fetchCommunesGeneric', () => {
  let dispatch;

  beforeEach(() => {
    dispatch = jest.fn();
    apiClient.get.mockReset();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  test('dispatch SET_COMMUNES et SET_PAGINATION en cas de succes avec resultats', async () => {
    apiClient.get.mockResolvedValue({
      data: {
        communes: [{ nom_commune: 'Paris' }],
        totalPages: 5,
        currentPage: 1,
      },
    });
    await fetchCommunesGeneric({ query: 'Paris', page: 1, limit: 20, prefix: 'CONTACT' })(dispatch);

    expect(apiClient.get).toHaveBeenCalledWith('/api/folder/communes', {
      params: { nom_commune: 'Paris', page: 1, limit: 20 },
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CONTACT_SET_COMMUNES',
      payload: [{ nom_commune: 'Paris' }],
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'CONTACT_SET_PAGINATION',
      payload: { totalPages: 5, currentPage: 1 },
    });
  });

  test('dispatch RESET_COMMUNES quand aucun resultat', async () => {
    apiClient.get.mockResolvedValue({
      data: { communes: [], totalPages: 0, currentPage: 1 },
    });
    await fetchCommunesGeneric({ query: 'zzz', prefix: 'PM' })(dispatch);

    expect(dispatch).toHaveBeenCalledWith({ type: 'PM_RESET_COMMUNES' });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'PM_SET_PAGINATION',
      payload: { totalPages: 0, currentPage: 1 },
    });
  });

  test('normalise la cedille et l apostrophe dans la query', async () => {
    apiClient.get.mockResolvedValue({
      data: { communes: [{ nom_commune: 'Francais' }], totalPages: 1, currentPage: 1 },
    });
    await fetchCommunesGeneric({ query: "Fran\u00e7ais l'est", prefix: 'CONTACT' })(dispatch);

    expect(apiClient.get).toHaveBeenCalledWith('/api/folder/communes', {
      params: { nom_commune: 'Francais l est', page: 1, limit: 20 },
    });
  });

  test('gere une erreur API sans crash', async () => {
    apiClient.get.mockRejectedValue(new Error('Network'));
    await fetchCommunesGeneric({ query: 'test', prefix: 'CONTACT' })(dispatch);

    expect(console.error).toHaveBeenCalled();
    // Pas de dispatch en cas d'erreur
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// --- Action creator resetCommunesGeneric ---

describe('genericCommunesSlice resetCommunesGeneric', () => {
  test('retourne le bon type avec le prefixe', () => {
    const action = resetCommunesGeneric('PM');
    expect(action).toEqual({ type: 'PM_RESET_COMMUNES' });
  });

  test('retourne le bon type pour CONTACT', () => {
    const action = resetCommunesGeneric('CONTACT');
    expect(action).toEqual({ type: 'CONTACT_RESET_COMMUNES' });
  });
});

// --- Verification des 9 instances ---

describe('genericCommunesSlice instances', () => {
  const instances = [
    { name: 'communesContactReducer', reducer: communesContactReducer, prefix: 'CONTACT' },
    { name: 'communesNotaireReducer', reducer: communesNotaireReducer, prefix: 'NOTAIRE_MARIAGE' },
    { name: 'communesNaissanceContactReducer', reducer: communesNaissanceContactReducer, prefix: 'NAISSANCE_CONTACT' },
    { name: 'communesPersonneChargeReducer', reducer: communesPersonneChargeReducer, prefix: 'PERSONNE_CHARGE' },
    { name: 'communesNaissancePCReducer', reducer: communesNaissancePCReducer, prefix: 'NAISSANCE_PC' },
    { name: 'communesPersonneChargeUPReducer', reducer: communesPersonneChargeUPReducer, prefix: 'PERSONNE_CHARGEUP' },
    { name: 'communesNaissancePersonneChargeUPReducer', reducer: communesNaissancePersonneChargeUPReducer, prefix: 'NAISSANCE_PCUP' },
    { name: 'communesPMReducer', reducer: communesPMReducer, prefix: 'PM' },
    { name: 'communesPMPReducer', reducer: communesPMPReducer, prefix: 'PMP' },
  ];

  instances.forEach(({ name, reducer, prefix }) => {
    test(`${name} repond a ${prefix}_SET_COMMUNES`, () => {
      const payload = [{ nom_commune: 'Test' }];
      const state = reducer(initialState, { type: `${prefix}_SET_COMMUNES`, payload });
      expect(state.communes).toEqual(payload);
    });
  });
});
