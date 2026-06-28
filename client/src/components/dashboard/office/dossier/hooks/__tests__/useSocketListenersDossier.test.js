// useSocketListenersDossier.test.js — Tests du hook dossier-specific useSocketListeners
import { renderHook } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Mocks socketService
const mockInitSocket = jest.fn();
const mockSubscribeToEvent = jest.fn();
const mockUnsubscribeFromEvent = jest.fn();

jest.mock('../../../../../../services/socketService', () => ({
  initSocket: (...args) => mockInitSocket(...args),
  subscribeToEvent: (...args) => mockSubscribeToEvent(...args),
  unsubscribeFromEvent: (...args) => mockUnsubscribeFromEvent(...args),
}));

// Mocks Redux actions
const mockAddDroppedDocumentToList = jest.fn().mockReturnValue({ type: 'ADD_DROPPED_DOC' });
const mockFetchAllDocumentsInDossier = jest.fn().mockReturnValue({ type: 'FETCH_ALL_DOCS' });

const currentDossierInitialState = { dossier: { _id: 'd1', nom: 'Dossier Test' }, documents: [], loading: false, error: null, documentTemplates: [] };

jest.mock('../../../../../../redux/slices/currentDossierSlice', () => ({
  __esModule: true,
  default: (state = currentDossierInitialState) => state,
  UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS: 'UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS',
  DELETE_DOSSIER_SUCCESS: 'DELETE_DOSSIER_SUCCESS',
  UPDATE_CURRENT_DOSSIER_SUCCESS: 'UPDATE_CURRENT_DOSSIER_SUCCESS',
  addDroppedDocumentToList: (...args) => {
    mockAddDroppedDocumentToList(...args);
    return { type: 'ADD_DROPPED_DOC' };
  },
  fetchAllDocumentsInDossier: (...args) => {
    mockFetchAllDocumentsInDossier(...args);
    return { type: 'FETCH_ALL_DOCS' };
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

import rootReducer from '../../../../../../redux/rootReducer';
import { useSocketListeners } from '../useSocketListeners';

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

describe('useSocketListeners (dossier)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('appelle initSocket au montage', () => {
    const wrapper = createWrapper();
    renderHook(() => useSocketListeners(), { wrapper });
    expect(mockInitSocket).toHaveBeenCalled();
  });

  it('subscribe aux 3 evenements au montage', () => {
    const wrapper = createWrapper();
    renderHook(() => useSocketListeners(), { wrapper });

    expect(mockSubscribeToEvent).toHaveBeenCalledWith('single_document_added', expect.any(Function));
    expect(mockSubscribeToEvent).toHaveBeenCalledWith('upload_error', expect.any(Function));
    expect(mockSubscribeToEvent).toHaveBeenCalledWith('document_operation_success', expect.any(Function));
  });

  it('unsubscribe aux 3 evenements au demontage', () => {
    const wrapper = createWrapper();
    const { unmount } = renderHook(() => useSocketListeners(), { wrapper });

    unmount();

    expect(mockUnsubscribeFromEvent).toHaveBeenCalledWith('single_document_added', expect.any(Function));
    expect(mockUnsubscribeFromEvent).toHaveBeenCalledWith('upload_error', expect.any(Function));
    expect(mockUnsubscribeFromEvent).toHaveBeenCalledWith('document_operation_success', expect.any(Function));
  });

  it('single_document_added dispatch addDroppedDocumentToList', () => {
    const wrapper = createWrapper();
    renderHook(() => useSocketListeners(), { wrapper });

    const call = mockSubscribeToEvent.mock.calls.find(c => c[0] === 'single_document_added');
    const handler = call[1];

    handler({ newDocMetadata: { _id: 'doc1', nomDocument: 'test.pdf' } });

    expect(mockAddDroppedDocumentToList).toHaveBeenCalledWith({ _id: 'doc1', nomDocument: 'test.pdf' });
  });

  it('upload_error logue l erreur', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = createWrapper();
    renderHook(() => useSocketListeners(), { wrapper });

    const call = mockSubscribeToEvent.mock.calls.find(c => c[0] === 'upload_error');
    const handler = call[1];

    handler({ message: 'Upload failed' });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('document_operation_success (non-delete) dispatch fetchAllDocumentsInDossier', () => {
    const wrapper = createWrapper();
    renderHook(() => useSocketListeners(), { wrapper });

    const call = mockSubscribeToEvent.mock.calls.find(c => c[0] === 'document_operation_success');
    const handler = call[1];

    handler({ type: 'rename-file' });

    expect(mockFetchAllDocumentsInDossier).toHaveBeenCalledWith('d1', 'test-token');
  });

  it('document_operation_success type delete-file ne dispatch rien', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const wrapper = createWrapper();
    renderHook(() => useSocketListeners(), { wrapper });

    const call = mockSubscribeToEvent.mock.calls.find(c => c[0] === 'document_operation_success');
    const handler = call[1];

    handler({ type: 'delete-file' });

    expect(mockFetchAllDocumentsInDossier).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
