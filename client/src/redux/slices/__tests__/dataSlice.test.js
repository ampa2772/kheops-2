jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import apiClient from '../../../services/apiClient';
import reducer, {
  setMatchingProfessions,
  resetMatchingProfessions,
  setMatchingPays,
  resetMatchingPays,
  setMatchingNationalites,
  resetMatchingNationalites,
  fetchProfessions,
  fetchPays,
  fetchNationalites,
  fetchDefaultContact,
} from '../dataSlice';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation();
});

afterEach(() => {
  console.error.mockRestore();
});

// --- Reducer Tests ---

describe('dataSlice reducer', () => {
  const initialState = { matchingPaysNaissance: [], matchingProfessions: [], matchingNationalities: [] };

  test('retourne l état initial par défaut', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  // String types (extraReducers)
  test('SET_MATCHING_PROFESSIONS définit le tableau', () => {
    const state = reducer(initialState, { type: 'SET_MATCHING_PROFESSIONS', payload: ['Avocat', 'Notaire'] });
    expect(state.matchingProfessions).toEqual(['Avocat', 'Notaire']);
  });

  test('RESET_MATCHING_PROFESSIONS vide le tableau', () => {
    const prev = { ...initialState, matchingProfessions: ['Avocat'] };
    const state = reducer(prev, { type: 'RESET_MATCHING_PROFESSIONS' });
    expect(state.matchingProfessions).toEqual([]);
  });

  test('SET_MATCHING_PAYS définit le tableau', () => {
    const state = reducer(initialState, { type: 'SET_MATCHING_PAYS', payload: [{ name: 'France' }] });
    expect(state.matchingPaysNaissance).toEqual([{ name: 'France' }]);
  });

  test('RESET_MATCHING_PAYS vide le tableau', () => {
    const prev = { ...initialState, matchingPaysNaissance: [{ name: 'France' }] };
    const state = reducer(prev, { type: 'RESET_MATCHING_PAYS' });
    expect(state.matchingPaysNaissance).toEqual([]);
  });

  test('SET_MATCHING_NATIONALITES définit le tableau', () => {
    const state = reducer(initialState, { type: 'SET_MATCHING_NATIONALITES', payload: ['Française'] });
    expect(state.matchingNationalities).toEqual(['Française']);
  });

  test('RESET_MATCHING_NATIONALITES vide le tableau', () => {
    const prev = { ...initialState, matchingNationalities: ['Française'] };
    const state = reducer(prev, { type: 'RESET_MATCHING_NATIONALITES' });
    expect(state.matchingNationalities).toEqual([]);
  });

  // RTK actions (reducers)
  test('action RTK setMatchingProfessions fonctionne', () => {
    const state = reducer(initialState, setMatchingProfessions(['Médecin']));
    expect(state.matchingProfessions).toEqual(['Médecin']);
  });

  test('action RTK resetMatchingProfessions fonctionne', () => {
    const prev = { ...initialState, matchingProfessions: ['Médecin'] };
    const state = reducer(prev, resetMatchingProfessions());
    expect(state.matchingProfessions).toEqual([]);
  });

  test('action RTK setMatchingPays fonctionne', () => {
    const state = reducer(initialState, setMatchingPays(['Belgique']));
    expect(state.matchingPaysNaissance).toEqual(['Belgique']);
  });

  test('action RTK setMatchingNationalites fonctionne', () => {
    const state = reducer(initialState, setMatchingNationalites(['Belge']));
    expect(state.matchingNationalities).toEqual(['Belge']);
  });
});

// --- Thunk Tests ---

describe('dataSlice thunks', () => {
  let dispatch;

  beforeEach(() => {
    dispatch = jest.fn();
  });

  // fetchProfessions
  describe('fetchProfessions', () => {
    test('dispatch SET_MATCHING_PROFESSIONS en cas de succès avec résultats', async () => {
      apiClient.get.mockResolvedValue({ data: [{ name: 'Avocat' }, { name: 'Notaire' }] });
      await fetchProfessions('avo')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_MATCHING_PROFESSIONS', payload: ['Avocat', 'Notaire'] });
    });

    test('dispatch RESET_MATCHING_PROFESSIONS quand l API retourne un tableau vide', async () => {
      apiClient.get.mockResolvedValue({ data: [] });
      await fetchProfessions('xyz')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_MATCHING_PROFESSIONS' });
    });

    test('dispatch RESET_MATCHING_PROFESSIONS quand la query est vide', async () => {
      await fetchProfessions('   ')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_MATCHING_PROFESSIONS' });
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    test('dispatch FETCH_PROFESSIONS_ERROR en cas d erreur API', async () => {
      const err = new Error('Network error');
      apiClient.get.mockRejectedValue(err);
      await fetchProfessions('avo')(dispatch);
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'FETCH_PROFESSIONS_ERROR' }));
    });
  });

  // fetchPays
  describe('fetchPays', () => {
    test('dispatch SET_MATCHING_PAYS en cas de succès', async () => {
      apiClient.get.mockResolvedValue({ data: [{ name: 'France' }] });
      await fetchPays('fra')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_MATCHING_PAYS', payload: [{ name: 'France' }] });
    });

    test('dispatch RESET_MATCHING_PAYS quand résultat vide', async () => {
      apiClient.get.mockResolvedValue({ data: [] });
      await fetchPays('xyz')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_MATCHING_PAYS' });
    });

    test('dispatch FETCH_PAYS_ERROR en cas d erreur', async () => {
      apiClient.get.mockRejectedValue(new Error('err'));
      await fetchPays('fra')(dispatch);
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'FETCH_PAYS_ERROR' }));
    });
  });

  // fetchNationalites
  describe('fetchNationalites', () => {
    test('dispatch SET_MATCHING_NATIONALITES en cas de succès', async () => {
      apiClient.get.mockResolvedValue({ data: ['Française', 'Belge'] });
      await fetchNationalites('fra')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_MATCHING_NATIONALITES', payload: ['Française', 'Belge'] });
    });

    test('dispatch RESET_MATCHING_NATIONALITES quand résultat vide', async () => {
      apiClient.get.mockResolvedValue({ data: [] });
      await fetchNationalites('xyz')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_MATCHING_NATIONALITES' });
    });

    test('dispatch FETCH_NATIONALITES_ERROR en cas d erreur', async () => {
      apiClient.get.mockRejectedValue(new Error('err'));
      await fetchNationalites('fra')(dispatch);
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'FETCH_NATIONALITES_ERROR' }));
    });
  });

  // fetchDefaultContact
  describe('fetchDefaultContact', () => {
    test('dispatch REQUEST puis SUCCESS en cas de succès', async () => {
      apiClient.post.mockResolvedValue({ data: { _id: 'c1', nom: 'Contact par défaut' } });
      await fetchDefaultContact('defaultId')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_DEFAULT_CONTACT_REQUEST' });
      expect(dispatch).toHaveBeenCalledWith({
        type: 'FETCH_DEFAULT_CONTACT_SUCCESS',
        payload: { _id: 'c1', nom: 'Contact par défaut' },
      });
    });

    test('dispatch REQUEST puis FAILURE en cas d erreur', async () => {
      apiClient.post.mockRejectedValue(new Error('API error'));
      await fetchDefaultContact('defaultId')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_DEFAULT_CONTACT_REQUEST' });
      expect(dispatch).toHaveBeenCalledWith({
        type: 'FETCH_DEFAULT_CONTACT_FAILURE',
        payload: 'API error',
      });
    });
  });
});
