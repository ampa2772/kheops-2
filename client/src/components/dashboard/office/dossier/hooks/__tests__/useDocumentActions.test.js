// useDocumentActions.test.js — Tests du hook useDocumentActions
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Mocks Redux actions
const mockDuplicateDocument = jest.fn().mockReturnValue({ type: 'DUPLICATE_DOC' });
const mockRenameDocument = jest.fn().mockReturnValue({ type: 'RENAME_DOC' });
const mockDeleteDocument = jest.fn().mockReturnValue({ type: 'DELETE_DOC' });
const mockCreateSubfolder = jest.fn().mockReturnValue({ type: 'CREATE_SUBFOLDER' });
const mockUpdateSubfolder = jest.fn().mockReturnValue({ type: 'UPDATE_SUBFOLDER' });
const mockDeleteSubfolder = jest.fn().mockReturnValue({ type: 'DELETE_SUBFOLDER' });
const mockMoveDocToSubfolder = jest.fn().mockReturnValue({ type: 'MOVE_DOC' });

const currentDossierInitialState = { dossier: { _id: 'd1', nom: 'Dossier Test' }, documents: [], loading: false, error: null, documentTemplates: [] };

jest.mock('../../../../../../redux/slices/currentDossierSlice', () => ({
  __esModule: true,
  default: (state = currentDossierInitialState) => state,
  UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS: 'UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS',
  DELETE_DOSSIER_SUCCESS: 'DELETE_DOSSIER_SUCCESS',
  UPDATE_CURRENT_DOSSIER_SUCCESS: 'UPDATE_CURRENT_DOSSIER_SUCCESS',
  duplicateDocumentInDossier: (...args) => {
    mockDuplicateDocument(...args);
    return { type: 'DUPLICATE_DOC' };
  },
  renameDocumentInDossier: (...args) => {
    mockRenameDocument(...args);
    return { type: 'RENAME_DOC' };
  },
  deleteDocumentInDossier: (...args) => {
    mockDeleteDocument(...args);
    return { type: 'DELETE_DOC' };
  },
  createSubfolder: (...args) => {
    mockCreateSubfolder(...args);
    return { type: 'CREATE_SUBFOLDER' };
  },
  updateSubfolder: (...args) => {
    mockUpdateSubfolder(...args);
    return { type: 'UPDATE_SUBFOLDER' };
  },
  deleteSubfolder: (...args) => {
    mockDeleteSubfolder(...args);
    return { type: 'DELETE_SUBFOLDER' };
  },
  moveDocumentToSubfolder: (...args) => {
    mockMoveDocToSubfolder(...args);
    return { type: 'MOVE_DOC' };
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
import { useDocumentActions } from '../useDocumentActions';

const createWrapper = (preloadedState = {}) => {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      login: { user: null, isAuthenticated: false, error: null, loading: false, token: 'test-token' },
      currentDossier: { dossier: { _id: 'd1', nom: 'Dossier Test' }, documents: [], loading: false, error: null, documentTemplates: [] },
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

const mockDoc = { _id: 'doc1', nomDocument: 'rapport.pdf' };
const mockSubfolder = { _id: 'sf1', name: 'Sous-dossier 1' };

describe('useDocumentActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===================== Retour du hook =====================
  describe('retour du hook', () => {
    it('retourne tous les handlers et etats attendus', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      // Etats
      expect(result.current).toHaveProperty('miniModalItemId');
      expect(result.current).toHaveProperty('renamingItemId');
      expect(result.current).toHaveProperty('renameValue');
      expect(result.current).toHaveProperty('showConfirmDelete');

      // Handlers
      expect(typeof result.current.handleDuplicateDocument).toBe('function');
      expect(typeof result.current.handleRenameDocument).toBe('function');
      expect(typeof result.current.validateRename).toBe('function');
      expect(typeof result.current.confirmDeleteItem).toBe('function');
      expect(typeof result.current.handleDeleteItem).toBe('function');
      expect(typeof result.current.cancelDelete).toBe('function');
      expect(typeof result.current.handleCreateSubfolder).toBe('function');
      expect(typeof result.current.handleMoveDocumentToSubfolder).toBe('function');
    });
  });

  // ===================== handleDuplicateDocument =====================
  describe('handleDuplicateDocument', () => {
    it('dispatch duplicateDocumentInDossier avec dossierId, doc et token', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      act(() => {
        result.current.handleDuplicateDocument(mockDoc);
      });

      expect(mockDuplicateDocument).toHaveBeenCalledWith('d1', mockDoc, 'test-token');
    });

    it('ferme le miniModal apres duplication', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      // Ouvre un miniModal d'abord
      act(() => {
        result.current.setMiniModalItemId('doc1');
      });
      expect(result.current.miniModalItemId).toBe('doc1');

      act(() => {
        result.current.handleDuplicateDocument(mockDoc);
      });
      expect(result.current.miniModalItemId).toBeNull();
    });
  });

  // ===================== handleRenameDocument =====================
  describe('handleRenameDocument', () => {
    it('initialise le renommage avec le nom sans extension', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      act(() => {
        result.current.handleRenameDocument(mockDoc);
      });

      expect(result.current.renamingItemId).toBe('doc1');
      expect(result.current.renameValue).toBe('rapport');
    });
  });

  // ===================== validateRename =====================
  describe('validateRename', () => {
    it('dispatch renameDocumentInDossier pour un document', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      // Initialise le renommage
      act(() => {
        result.current.handleRenameDocument(mockDoc);
      });

      // Change le nom
      act(() => {
        result.current.setRenameValue('nouveau-nom');
      });

      // Valide
      act(() => {
        result.current.validateRename(mockDoc, 'document');
      });

      expect(mockRenameDocument).toHaveBeenCalledWith('d1', mockDoc, 'nouveau-nom', null, 'test-token');
      expect(result.current.renamingItemId).toBeNull();
    });

    it('dispatch updateSubfolder pour un sous-dossier', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      // Initialise le renommage du sous-dossier
      act(() => {
        result.current.handleRenameSubfolder(mockSubfolder);
      });

      // Change le nom
      act(() => {
        result.current.setRenameValue('Nouveau sous-dossier');
      });

      // Valide
      act(() => {
        result.current.validateRename(mockSubfolder, 'subfolder');
      });

      expect(mockUpdateSubfolder).toHaveBeenCalledWith('d1', 'sf1', { name: 'Nouveau sous-dossier' }, 'test-token');
    });

    it('ne dispatch rien si le nom est vide', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      act(() => {
        result.current.setRenameValue('  ');
      });

      act(() => {
        result.current.validateRename(mockDoc, 'document');
      });

      expect(mockRenameDocument).not.toHaveBeenCalled();
    });
  });

  // ===================== Suppression =====================
  describe('suppression', () => {
    it('confirmDeleteItem ouvre le dialogue de confirmation', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      act(() => {
        result.current.confirmDeleteItem(mockDoc, 'document');
      });

      expect(result.current.showConfirmDelete).toBe(true);
      expect(result.current.itemToDelete).toEqual({ item: mockDoc, type: 'document' });
    });

    it('handleDeleteItem dispatch deleteDocumentInDossier pour un document', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      // Prepare la suppression
      act(() => {
        result.current.confirmDeleteItem(mockDoc, 'document');
      });

      // Confirme
      act(() => {
        result.current.handleDeleteItem();
      });

      expect(mockDeleteDocument).toHaveBeenCalledWith('d1', mockDoc, 'test-token');
      expect(result.current.showConfirmDelete).toBe(false);
    });

    it('handleDeleteItem dispatch deleteSubfolder pour un sous-dossier', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      act(() => {
        result.current.confirmDeleteItem(mockSubfolder, 'subfolder');
      });

      act(() => {
        result.current.handleDeleteItem();
      });

      expect(mockDeleteSubfolder).toHaveBeenCalledWith('d1', 'sf1', 'test-token');
    });

    it('cancelDelete ferme le dialogue de confirmation', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      act(() => {
        result.current.confirmDeleteItem(mockDoc, 'document');
      });
      expect(result.current.showConfirmDelete).toBe(true);

      act(() => {
        result.current.cancelDelete();
      });

      expect(result.current.showConfirmDelete).toBe(false);
      expect(result.current.itemToDelete).toBeNull();
    });
  });

  // ===================== Sous-dossier =====================
  describe('sous-dossiers', () => {
    it('handleCreateSubfolder dispatch createSubfolder', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      act(() => {
        result.current.handleCreateSubfolder('Nouveau dossier');
      });

      expect(mockCreateSubfolder).toHaveBeenCalledWith('d1', 'Nouveau dossier', 'test-token');
    });

    it('handleMoveDocumentToSubfolder dispatch moveDocumentToSubfolder', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDocumentActions(), { wrapper });

      act(() => {
        result.current.handleMoveDocumentToSubfolder('doc1', 'sf1');
      });

      expect(mockMoveDocToSubfolder).toHaveBeenCalledWith('d1', 'doc1', 'sf1', 'test-token');
    });
  });
});
