// useDragAndDrop.test.js — Tests du hook useDragAndDrop
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Mock socketService
const mockUploadDroppedFile = jest.fn();

jest.mock('../../../../../../services/socketService', () => ({
  uploadDroppedFile: (...args) => mockUploadDroppedFile(...args),
  initSocket: jest.fn(),
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

import rootReducer from '../../../../../../redux/rootReducer';
import { useDragAndDrop } from '../useDragAndDrop';

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

// Helper pour creer un mock event de drag/drop
const createDragEvent = (overrides = {}) => ({
  preventDefault: jest.fn(),
  dataTransfer: {
    types: ['Files'],
    files: [],
    ...overrides.dataTransfer,
  },
  currentTarget: { contains: jest.fn().mockReturnValue(false) },
  relatedTarget: null,
  ...overrides,
});

describe('useDragAndDrop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadDroppedFile.mockResolvedValue({ success: true });
  });

  // ===================== Retour du hook =====================
  describe('retour du hook', () => {
    it('retourne tous les handlers et etats attendus', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDragAndDrop(), { wrapper });

      expect(result.current).toHaveProperty('isDraggingOver');
      expect(result.current).toHaveProperty('isUploading');
      expect(result.current).toHaveProperty('uploadError');
      expect(typeof result.current.handleDragOver).toBe('function');
      expect(typeof result.current.handleDragEnter).toBe('function');
      expect(typeof result.current.handleDragLeave).toBe('function');
      expect(typeof result.current.handleDrop).toBe('function');
      expect(typeof result.current.setUploadError).toBe('function');
      expect(typeof result.current.setIsUploading).toBe('function');
    });
  });

  // ===================== isDraggingOver =====================
  describe('isDraggingOver', () => {
    it('est false par defaut', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDragAndDrop(), { wrapper });
      expect(result.current.isDraggingOver).toBe(false);
    });

    it('passe a true sur dragOver avec fichier', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDragAndDrop(), { wrapper });

      act(() => {
        result.current.handleDragOver(createDragEvent());
      });

      expect(result.current.isDraggingOver).toBe(true);
    });

    it('passe a false sur dragLeave (quand le curseur quitte la zone)', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDragAndDrop(), { wrapper });

      // Active le drag
      act(() => {
        result.current.handleDragOver(createDragEvent());
      });
      expect(result.current.isDraggingOver).toBe(true);

      // Quitte la zone
      act(() => {
        result.current.handleDragLeave(createDragEvent());
      });
      expect(result.current.isDraggingOver).toBe(false);
    });
  });

  // ===================== handleDrop =====================
  describe('handleDrop', () => {
    it('previent le comportement par defaut', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDragAndDrop(), { wrapper });

      const event = createDragEvent({
        dataTransfer: { types: ['Files'], files: [new File(['test'], 'test.pdf', { type: 'application/pdf' })] },
      });

      await act(async () => {
        await result.current.handleDrop(event);
      });

      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('appelle uploadDroppedFile avec le fichier, dossierId et token', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDragAndDrop(), { wrapper });

      const file = new File(['contenu'], 'document.pdf', { type: 'application/pdf' });
      const event = createDragEvent({
        dataTransfer: { types: ['Files'], files: [file] },
      });

      await act(async () => {
        await result.current.handleDrop(event);
      });

      expect(mockUploadDroppedFile).toHaveBeenCalledWith(file, 'd1', 'test-token');
    });

    it('ne fait rien si aucun fichier dans l event', async () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDragAndDrop(), { wrapper });

      const event = createDragEvent({
        dataTransfer: { types: ['Files'], files: [] },
      });

      await act(async () => {
        await result.current.handleDrop(event);
      });

      expect(mockUploadDroppedFile).not.toHaveBeenCalled();
    });

    it('gere les erreurs d upload', async () => {
      mockUploadDroppedFile.mockRejectedValue(new Error('Echec upload'));
      const wrapper = createWrapper();
      const { result } = renderHook(() => useDragAndDrop(), { wrapper });

      const file = new File(['contenu'], 'test.pdf');
      const event = createDragEvent({
        dataTransfer: { types: ['Files'], files: [file] },
      });

      await act(async () => {
        await result.current.handleDrop(event);
      });

      expect(result.current.uploadError).toBe('Echec upload');
      expect(result.current.isUploading).toBe(false);
    });

    it('ne tente pas l upload si pas de dossier courant', async () => {
      const wrapper = createWrapper({
        currentDossier: { dossier: null, documents: [], loading: false, error: null, documentTemplates: [] },
      });
      const { result } = renderHook(() => useDragAndDrop(), { wrapper });

      const file = new File(['contenu'], 'test.pdf');
      const event = createDragEvent({
        dataTransfer: { types: ['Files'], files: [file] },
      });

      await act(async () => {
        await result.current.handleDrop(event);
      });

      expect(mockUploadDroppedFile).not.toHaveBeenCalled();
    });
  });
});
