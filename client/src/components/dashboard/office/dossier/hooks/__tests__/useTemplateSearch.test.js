// useTemplateSearch.test.js — Tests du hook useTemplateSearch
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Mocks Redux actions
const mockFetchDocumentTemplates = jest.fn().mockReturnValue({ type: 'FETCH_TEMPLATES' });
const mockCreateDocumentInDossier = jest.fn().mockReturnValue({ type: 'CREATE_DOC' });

const currentDossierInitialState = { dossier: { _id: 'd1', nom: 'Dossier Test' }, documents: [], loading: false, error: null, documentTemplates: [] };

jest.mock('../../../../../../redux/slices/currentDossierSlice', () => ({
  __esModule: true,
  default: (state = currentDossierInitialState) => state,
  UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS: 'UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS',
  DELETE_DOSSIER_SUCCESS: 'DELETE_DOSSIER_SUCCESS',
  UPDATE_CURRENT_DOSSIER_SUCCESS: 'UPDATE_CURRENT_DOSSIER_SUCCESS',
  fetchDocumentTemplates: (...args) => {
    mockFetchDocumentTemplates(...args);
    return { type: 'FETCH_TEMPLATES' };
  },
  createDocumentInDossier: (...args) => {
    mockCreateDocumentInDossier(...args);
    return { type: 'CREATE_DOC' };
  },
}));

// Mocks globaux pour rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

import rootReducer from '../../../../../../redux/rootReducer';
import { useTemplateSearch } from '../useTemplateSearch';

const createWrapper = (preloadedState = {}) => {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      login: { user: { _id: 'u1', nom: 'TestUser' }, isAuthenticated: true, error: null, loading: false, token: 'test-token' },
      currentDossier: {
        dossier: { _id: 'd1', nom: 'Dossier Test' },
        documents: [],
        loading: false,
        error: null,
        documentTemplates: [],
      },
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

describe('useTemplateSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===================== Retour du hook =====================
  describe('retour du hook', () => {
    it('retourne tous les etats et handlers attendus', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useTemplateSearch(), { wrapper });

      expect(result.current).toHaveProperty('searchTerm');
      expect(result.current).toHaveProperty('showList');
      expect(result.current).toHaveProperty('loadingTemplates');
      expect(result.current).toHaveProperty('documentTemplates');
      expect(result.current).toHaveProperty('selectedTemplate');
      expect(result.current).toHaveProperty('showReceiverModal');
      expect(typeof result.current.handleSearchChange).toBe('function');
      expect(typeof result.current.handleTemplateClick).toBe('function');
      expect(typeof result.current.handleFocus).toBe('function');
    });
  });

  // ===================== Chargement initial =====================
  describe('chargement initial', () => {
    it('dispatch fetchDocumentTemplates au montage si templates vides', () => {
      const wrapper = createWrapper();
      renderHook(() => useTemplateSearch(), { wrapper });

      expect(mockFetchDocumentTemplates).toHaveBeenCalledWith('');
    });

    it('ne dispatch pas fetchDocumentTemplates si templates deja charges', () => {
      const wrapper = createWrapper({
        currentDossier: {
          dossier: { _id: 'd1', nom: 'Dossier Test' },
          documents: [],
          loading: false,
          error: null,
          documentTemplates: [{ _id: 't1', name: 'Template' }],
        },
      });
      renderHook(() => useTemplateSearch(), { wrapper });

      expect(mockFetchDocumentTemplates).not.toHaveBeenCalled();
    });
  });

  // ===================== handleSearchChange =====================
  describe('handleSearchChange', () => {
    it('met a jour le searchTerm', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useTemplateSearch(), { wrapper });

      act(() => {
        result.current.handleSearchChange({ target: { value: 'contrat' } });
      });

      expect(result.current.searchTerm).toBe('contrat');
    });

    it('affiche la liste si le terme n est pas vide', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useTemplateSearch(), { wrapper });

      act(() => {
        result.current.handleSearchChange({ target: { value: 'contrat' } });
      });

      expect(result.current.showList).toBe(true);
    });

    it('masque la liste si le terme est vide', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useTemplateSearch(), { wrapper });

      act(() => {
        result.current.handleSearchChange({ target: { value: 'contrat' } });
      });
      expect(result.current.showList).toBe(true);

      act(() => {
        result.current.handleSearchChange({ target: { value: '' } });
      });
      expect(result.current.showList).toBe(false);
    });

    it('dispatch fetchDocumentTemplates avec debounce de 300ms', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useTemplateSearch(), { wrapper });

      mockFetchDocumentTemplates.mockClear();

      act(() => {
        result.current.handleSearchChange({ target: { value: 'contrat' } });
      });

      // Pas encore dispatche
      expect(mockFetchDocumentTemplates).not.toHaveBeenCalled();

      // Avance le timer
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(mockFetchDocumentTemplates).toHaveBeenCalledWith('contrat');
    });
  });

  // ===================== handleTemplateClick =====================
  describe('handleTemplateClick', () => {
    it('dispatch createDocumentInDossier pour categorie allDos', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useTemplateSearch(), { wrapper });

      const template = { name: 'Modele A', categorie: 'allDos', templateFileName: 'modele_a.docx' };

      act(() => {
        result.current.handleTemplateClick(template);
      });

      expect(mockCreateDocumentInDossier).toHaveBeenCalledWith(
        'd1', 'modele_a.docx', 'test-token',
        expect.objectContaining({ _id: 'u1' }),
        [], 'allDos', 'Modele A', null
      );
    });

    it('ouvre la modale receiver pour categorie non-allDos', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useTemplateSearch(), { wrapper });

      const template = { name: 'Courrier', categorie: 'courrier', templateFileName: 'courrier.docx' };

      act(() => {
        result.current.handleTemplateClick(template);
      });

      expect(mockCreateDocumentInDossier).not.toHaveBeenCalled();
      expect(result.current.showReceiverModal).toBe(true);
      expect(result.current.selectedTemplate).toBeTruthy();
      expect(result.current.selectedTemplate.name).toBe('Courrier');
    });

    it('ferme la liste et vide le searchTerm apres selection', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useTemplateSearch(), { wrapper });

      // D'abord ouvrir la liste
      act(() => {
        result.current.handleSearchChange({ target: { value: 'test' } });
      });

      // Cliquer sur un template
      act(() => {
        result.current.handleTemplateClick({ name: 'Test', categorie: 'allDos', templateFileName: 'test.docx' });
      });

      expect(result.current.searchTerm).toBe('');
      expect(result.current.showList).toBe(false);
    });
  });

  // ===================== handleFocus =====================
  describe('handleFocus', () => {
    it('affiche la liste si le searchTerm n est pas vide', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useTemplateSearch(), { wrapper });

      // Definir un terme de recherche
      act(() => {
        result.current.handleSearchChange({ target: { value: 'modele' } });
      });

      // Cacher la liste manuellement (simule perte de focus)
      // puis focus → affiche les resultats
      act(() => {
        result.current.handleFocus();
      });

      expect(result.current.showList).toBe(true);
    });

    it('n affiche pas la liste si le searchTerm est vide', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useTemplateSearch(), { wrapper });

      act(() => {
        result.current.handleFocus();
      });

      expect(result.current.showList).toBe(false);
    });
  });
});
