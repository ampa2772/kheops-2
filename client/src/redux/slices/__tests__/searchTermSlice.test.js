// Tests unitaires — searchTermSlice.js
import reducer, {
  setSearchTerm,
  setSearchTermLinkPartie,
  setSearchTermLinkAllPour,
  setSearchTermLinkAllContre,
  setSearchTermLinkDossier,
} from '../searchTermSlice';

const initialState = {
  searchTerm: '',
  searchTermLinkPartie: '',
  searchTermLinkAllPour: '',
  searchTermLinkAllContre: '',
  searchTermLinkDossier: '',
};

describe('searchTermSlice etat initial', () => {
  test('retourne l etat initial par defaut', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state).toEqual(initialState);
  });
});

describe('searchTermSlice RTK reducers', () => {
  test('setSearchTerm definit searchTerm', () => {
    const state = reducer(initialState, setSearchTerm('dupont'));
    expect(state.searchTerm).toBe('dupont');
  });

  test('setSearchTermLinkPartie definit searchTermLinkPartie', () => {
    const state = reducer(initialState, setSearchTermLinkPartie('martin'));
    expect(state.searchTermLinkPartie).toBe('martin');
  });

  test('setSearchTermLinkAllPour definit searchTermLinkAllPour', () => {
    const state = reducer(initialState, setSearchTermLinkAllPour('avocat'));
    expect(state.searchTermLinkAllPour).toBe('avocat');
  });

  test('setSearchTermLinkAllContre definit searchTermLinkAllContre', () => {
    const state = reducer(initialState, setSearchTermLinkAllContre('defendeur'));
    expect(state.searchTermLinkAllContre).toBe('defendeur');
  });

  test('setSearchTermLinkDossier definit searchTermLinkDossier', () => {
    const state = reducer(initialState, setSearchTermLinkDossier('dossier123'));
    expect(state.searchTermLinkDossier).toBe('dossier123');
  });
});

describe('searchTermSlice extraReducers string compat', () => {
  test('SET_SEARCH_TERM definit searchTerm', () => {
    const state = reducer(initialState, { type: 'SET_SEARCH_TERM', payload: 'test' });
    expect(state.searchTerm).toBe('test');
  });

  test('SET_SEARCH_TERM_LINK_PARTIE definit searchTermLinkPartie', () => {
    const state = reducer(initialState, { type: 'SET_SEARCH_TERM_LINK_PARTIE', payload: 'partie1' });
    expect(state.searchTermLinkPartie).toBe('partie1');
  });

  test('SET_SEARCH_TERM_LINK_ALL_POUR definit searchTermLinkAllPour', () => {
    const state = reducer(initialState, { type: 'SET_SEARCH_TERM_LINK_ALL_POUR', payload: 'pour1' });
    expect(state.searchTermLinkAllPour).toBe('pour1');
  });

  test('SET_SEARCH_TERM_LINK_ALL_CONTRE definit searchTermLinkAllContre', () => {
    const state = reducer(initialState, { type: 'SET_SEARCH_TERM_LINK_ALL_CONTRE', payload: 'contre1' });
    expect(state.searchTermLinkAllContre).toBe('contre1');
  });

  test('SET_SEARCH_TERM_LINK_DOSSIER definit searchTermLinkDossier', () => {
    const state = reducer(initialState, { type: 'SET_SEARCH_TERM_LINK_DOSSIER', payload: 'doss1' });
    expect(state.searchTermLinkDossier).toBe('doss1');
  });
});

describe('searchTermSlice isolation', () => {
  test('un reducer ne modifie pas les autres champs', () => {
    const state = reducer(initialState, setSearchTerm('xyz'));
    expect(state.searchTerm).toBe('xyz');
    expect(state.searchTermLinkPartie).toBe('');
    expect(state.searchTermLinkAllPour).toBe('');
    expect(state.searchTermLinkAllContre).toBe('');
    expect(state.searchTermLinkDossier).toBe('');
  });
});
