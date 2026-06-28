// usePartieSearch.test.js — Tests du hook usePartieSearch
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Mock axios pour rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../../../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

// Mock des actions de recherche
const mockSearchContacts = jest.fn();
const mockSearchContactsLinkPartie = jest.fn();
const mockResetContactsLinkPartie = jest.fn().mockReturnValue({ type: 'RESET_CONTACTS_LINK' });

jest.mock('../../../../../../../redux/slices/allSearchSlice', () => ({
  searchContacts: (...args) => {
    mockSearchContacts(...args);
    return { type: 'SEARCH_CONTACTS' };
  },
  searchContactsLinkPartie: (...args) => {
    mockSearchContactsLinkPartie(...args);
    return { type: 'SEARCH_CONTACTS_LINK' };
  },
  resetContactsLinkPartie: (...args) => {
    mockResetContactsLinkPartie(...args);
    return { type: 'RESET_CONTACTS_LINK' };
  },
  // Reducers necessaires pour rootReducer
  allSearchReducer: (state = { loading: false, all: [], error: null, loadingDossiers: false, dossierResults: [], dossierError: null }) => state,
  linkedSearchReducer: (state = { loading: false, all: [], error: null }) => state,
  globalContactsSearchReducer: (state = { loadingAllUserContacts: false, allUserContactsResults: [], errorAllUserContacts: null }) => state,
}));

const mockSetSearchTerm = jest.fn().mockReturnValue({ type: 'SET_SEARCH_TERM' });
const mockSetSearchTermLinkPartie = jest.fn().mockReturnValue({ type: 'SET_SEARCH_TERM_LINK_PARTIE' });
const mockSetSearchTermLinkAllPour = jest.fn().mockReturnValue({ type: 'SET_SEARCH_TERM_LINK_ALL_POUR' });
const mockSetSearchTermLinkAllContre = jest.fn().mockReturnValue({ type: 'SET_SEARCH_TERM_LINK_ALL_CONTRE' });

jest.mock('../../../../../../../redux/slices/searchTermSlice', () => ({
  __esModule: true,
  default: (state = {
    searchTerm: '',
    searchTermLinkPartie: '',
    searchTermLinkAllPour: '',
    searchTermLinkAllContre: '',
    searchTermLinkDossier: '',
  }) => state,
  setSearchTerm: (...args) => {
    mockSetSearchTerm(...args);
    return { type: 'SET_SEARCH_TERM' };
  },
  setSearchTermLinkPartie: (...args) => {
    mockSetSearchTermLinkPartie(...args);
    return { type: 'SET_SEARCH_TERM_LINK_PARTIE' };
  },
  setSearchTermLinkAllPour: (...args) => {
    mockSetSearchTermLinkAllPour(...args);
    return { type: 'SET_SEARCH_TERM_LINK_ALL_POUR' };
  },
  setSearchTermLinkAllContre: (...args) => {
    mockSetSearchTermLinkAllContre(...args);
    return { type: 'SET_SEARCH_TERM_LINK_ALL_CONTRE' };
  },
}));

// Mock debounce pour execution immediate
jest.mock('lodash', () => ({
  ...jest.requireActual('lodash'),
  debounce: (fn) => {
    const debounced = (...args) => fn(...args);
    debounced.cancel = jest.fn();
    return debounced;
  },
}));

import rootReducer from '../../../../../../../redux/rootReducer';
import { usePartieSearch } from '../usePartieSearch';

const createWrapper = (preloadedState = {}) => {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      login: { user: null, isAuthenticated: false, error: null, loading: false },
      searchTerm: {
        searchTerm: '',
        searchTermLinkPartie: '',
        searchTermLinkAllPour: '',
        searchTermLinkAllContre: '',
        searchTermLinkDossier: '',
      },
      allSearchReducer: { loading: false, all: [], error: null, loadingDossiers: false, dossierResults: [], dossierError: null },
      linkedSearchReducer: { loading: false, all: [], error: null },
      ...preloadedState,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const Wrapper = ({ children }) => (
    <Provider store={store}>{children}</Provider>
  );
  return Wrapper;
};

const mockUser = { _id: 'u1', nom: 'TestUser' };
const mockToken = 'test-token-123';
const mockParties = [
  { idPartie: 'p1', _id: 'p1', nomPartie: 'Dupont' },
  { idPartie: 'p2', _id: 'p2', nomPartie: 'Martin' },
];

describe('usePartieSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===================== Retour du hook =====================
  describe('retour du hook', () => {
    it('retourne tous les etats et handlers attendus', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => usePartieSearch('create', mockParties, mockUser, mockToken),
        { wrapper }
      );

      // Termes de recherche
      expect(result.current).toHaveProperty('searchTerm');
      expect(result.current).toHaveProperty('searchTermLinkPartie');
      expect(result.current).toHaveProperty('searchTermLinkAllPour');
      expect(result.current).toHaveProperty('searchTermLinkAllContre');

      // Listes
      expect(result.current).toHaveProperty('allContacts');
      expect(result.current).toHaveProperty('allContactsLinkPartie');

      // Etats
      expect(result.current).toHaveProperty('loadingContacts');
      expect(result.current).toHaveProperty('loadingContactsLinkPartie');
      expect(result.current).toHaveProperty('showSuggestions');

      // Handlers
      expect(typeof result.current.handleSearchChange).toBe('function');
      expect(typeof result.current.handleSearchChangeLink).toBe('function');
      expect(typeof result.current.handleInputFocusLink).toBe('function');
      expect(typeof result.current.setShowSuggestions).toBe('function');
    });
  });

  // ===================== handleSearchChange =====================
  describe('handleSearchChange', () => {
    it('dispatch setSearchTerm avec la valeur de l input', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => usePartieSearch('create', mockParties, mockUser, mockToken),
        { wrapper }
      );

      act(() => {
        result.current.handleSearchChange({ target: { value: 'Dup' } });
      });

      expect(mockSetSearchTerm).toHaveBeenCalledWith('Dup');
    });

    it('appelle searchContacts avec le terme et les IDs des parties', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => usePartieSearch('create', mockParties, mockUser, mockToken),
        { wrapper }
      );

      act(() => {
        result.current.handleSearchChange({ target: { value: 'Martin' } });
      });

      // debounce est mocke pour execution immediate
      expect(mockSearchContacts).toHaveBeenCalledWith(
        'Martin',
        mockUser,
        mockToken,
        ['p1', 'p2']
      );
    });
  });

  // ===================== handleSearchChangeLink =====================
  describe('handleSearchChangeLink', () => {
    it('dispatch setSearchTermLinkPartie pour modalType single', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => usePartieSearch('create', mockParties, mockUser, mockToken),
        { wrapper }
      );

      act(() => {
        result.current.handleSearchChangeLink({ target: { value: 'avocat' } }, 'single');
      });

      expect(mockSetSearchTermLinkPartie).toHaveBeenCalledWith('avocat');
    });

    it('dispatch setSearchTermLinkAllPour pour modalType allPour', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => usePartieSearch('create', mockParties, mockUser, mockToken),
        { wrapper }
      );

      act(() => {
        result.current.handleSearchChangeLink({ target: { value: 'notaire' } }, 'allPour');
      });

      expect(mockSetSearchTermLinkAllPour).toHaveBeenCalledWith('notaire');
    });

    it('dispatch setSearchTermLinkAllContre pour modalType allContre', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => usePartieSearch('create', mockParties, mockUser, mockToken),
        { wrapper }
      );

      act(() => {
        result.current.handleSearchChangeLink({ target: { value: 'expert' } }, 'allContre');
      });

      expect(mockSetSearchTermLinkAllContre).toHaveBeenCalledWith('expert');
    });

    it('appelle searchContactsLinkPartie via debounce', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => usePartieSearch('create', mockParties, mockUser, mockToken),
        { wrapper }
      );

      act(() => {
        result.current.handleSearchChangeLink({ target: { value: 'test' } }, 'single');
      });

      expect(mockSearchContactsLinkPartie).toHaveBeenCalledWith('test', mockUser, mockToken);
    });
  });

  // ===================== handleInputFocusLink =====================
  describe('handleInputFocusLink', () => {
    it('affiche les suggestions si terme et resultats presents', () => {
      const wrapper = createWrapper({
        searchTerm: {
          searchTerm: '',
          searchTermLinkPartie: 'avocat',
          searchTermLinkAllPour: '',
          searchTermLinkAllContre: '',
          searchTermLinkDossier: '',
        },
        linkedSearchReducer: {
          loading: false,
          all: [{ _id: 'c1', nom: 'Contact' }],
          error: null,
        },
      });
      const { result } = renderHook(
        () => usePartieSearch('create', mockParties, mockUser, mockToken),
        { wrapper }
      );

      act(() => {
        result.current.handleInputFocusLink('single');
      });

      expect(result.current.showSuggestions).toBe(true);
    });

    it('masque les suggestions si pas de resultats', () => {
      const wrapper = createWrapper({
        searchTerm: {
          searchTerm: '',
          searchTermLinkPartie: 'xyz',
          searchTermLinkAllPour: '',
          searchTermLinkAllContre: '',
          searchTermLinkDossier: '',
        },
        linkedSearchReducer: {
          loading: false,
          all: [],
          error: null,
        },
      });
      const { result } = renderHook(
        () => usePartieSearch('create', mockParties, mockUser, mockToken),
        { wrapper }
      );

      act(() => {
        result.current.handleInputFocusLink('single');
      });

      expect(result.current.showSuggestions).toBe(false);
    });
  });

  // ===================== Etat initial =====================
  describe('etat initial', () => {
    it('showSuggestions est false au demarrage', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => usePartieSearch('create', mockParties, mockUser, mockToken),
        { wrapper }
      );

      expect(result.current.showSuggestions).toBe(false);
    });

    it('les termes de recherche sont vides au demarrage', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => usePartieSearch('create', mockParties, mockUser, mockToken),
        { wrapper }
      );

      expect(result.current.searchTerm).toBe('');
      expect(result.current.searchTermLinkPartie).toBe('');
      expect(result.current.searchTermLinkAllPour).toBe('');
      expect(result.current.searchTermLinkAllContre).toBe('');
    });
  });
});
