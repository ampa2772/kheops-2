// useSocketListeners.test.js — Tests du hook global useSocketListeners
import { renderHook } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';

// Mocks socketService
const mockInitSocket = jest.fn();
const mockSubscribeToEvent = jest.fn();
const mockUnsubscribeFromEvent = jest.fn();

jest.mock('../../services/socketService', () => ({
  initSocket: (...args) => mockInitSocket(...args),
  subscribeToEvent: (...args) => mockSubscribeToEvent(...args),
  unsubscribeFromEvent: (...args) => mockUnsubscribeFromEvent(...args),
}));

// Mocks Redux actions
const mockFetchNotifications = jest.fn().mockReturnValue({ type: 'FETCH_NOTIFICATIONS' });
const mockCloseNotificationsModal = jest.fn().mockReturnValue({ type: 'CLOSE_NOTIFICATIONS_MODAL' });
const mockSetCurrentDossier = jest.fn().mockReturnValue({ type: 'SET_CURRENT_DOSSIER' });

const currentDossierInitialState = { dossier: null, documents: [], loading: false, error: null, documentTemplates: [] };

jest.mock('../../redux/slices/currentDossierSlice', () => ({
  __esModule: true,
  default: (state = currentDossierInitialState) => state,
  updateCurrentDossierFromSocket: jest.fn(),
  MOVE_DOSSIER_TO_TOP: 'MOVE_DOSSIER_TO_TOP',
  UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS: 'UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS',
  DELETE_DOSSIER_SUCCESS: 'DELETE_DOSSIER_SUCCESS',
  UPDATE_CURRENT_DOSSIER_SUCCESS: 'UPDATE_CURRENT_DOSSIER_SUCCESS',
  setCurrentDossier: (...args) => {
    mockSetCurrentDossier(...args);
    return { type: 'SET_CURRENT_DOSSIER' };
  },
}));

jest.mock('../../redux/slices/layoutSlice', () => ({
  fetchNotifications: (...args) => {
    mockFetchNotifications(...args);
    return { type: 'FETCH_NOTIFICATIONS' };
  },
  closeNotificationsModal: (...args) => {
    mockCloseNotificationsModal(...args);
    return { type: 'CLOSE_NOTIFICATIONS_MODAL' };
  },
}));

// Mocks globaux pour rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import rootReducer from '../../redux/rootReducer';
import { useSocketListeners } from '../useSocketListeners';

const createWrapper = () => {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      login: { user: null, isAuthenticated: false, error: null, loading: false },
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const Wrapper = ({ children }) => (
    <Provider store={store}>
      <MemoryRouter>{children}</MemoryRouter>
    </Provider>
  );
  return Wrapper;
};

describe('useSocketListeners (global)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('appelle initSocket au montage', () => {
    const wrapper = createWrapper();
    renderHook(() => useSocketListeners(), { wrapper });
    expect(mockInitSocket).toHaveBeenCalled();
  });

  it('subscribe aux evenements document_operation_success et error', () => {
    const wrapper = createWrapper();
    renderHook(() => useSocketListeners(), { wrapper });

    expect(mockSubscribeToEvent).toHaveBeenCalledWith('document_operation_success', expect.any(Function));
    expect(mockSubscribeToEvent).toHaveBeenCalledWith('document_operation_error', expect.any(Function));
  });

  it('unsubscribe au demontage (cleanup)', () => {
    const wrapper = createWrapper();
    const { unmount } = renderHook(() => useSocketListeners(), { wrapper });

    unmount();

    expect(mockUnsubscribeFromEvent).toHaveBeenCalledWith('document_operation_success', expect.any(Function));
    expect(mockUnsubscribeFromEvent).toHaveBeenCalledWith('document_operation_error', expect.any(Function));
  });

  it('success handler avec send-email-to-dossier + dossier dispatch 3 actions', () => {
    const wrapper = createWrapper();
    renderHook(() => useSocketListeners(), { wrapper });

    // Recupere le handler success
    const successCall = mockSubscribeToEvent.mock.calls.find(c => c[0] === 'document_operation_success');
    const handleSuccess = successCall[1];

    // Simule un succes avec dossier
    handleSuccess({ type: 'send-email-to-dossier', dossier: { _id: 'd1', nom: 'Dossier 1' } });

    expect(mockSetCurrentDossier).toHaveBeenCalledWith({ _id: 'd1', nom: 'Dossier 1' });
    expect(mockCloseNotificationsModal).toHaveBeenCalled();
    expect(mockFetchNotifications).toHaveBeenCalledWith(null);
  });

  it('success handler send-email-to-dossier sans dossier dispatch fetchNotifications', () => {
    const wrapper = createWrapper();
    renderHook(() => useSocketListeners(), { wrapper });

    const successCall = mockSubscribeToEvent.mock.calls.find(c => c[0] === 'document_operation_success');
    const handleSuccess = successCall[1];

    // send-email-to-dossier sans dossier
    handleSuccess({ type: 'send-email-to-dossier' });

    // setCurrentDossier ne devrait PAS etre appele car pas de data.dossier
    expect(mockSetCurrentDossier).not.toHaveBeenCalled();
    // Mais fetchNotifications devrait etre appele
    expect(mockFetchNotifications).toHaveBeenCalledWith(null);
  });

  it('error handler logue l erreur dans la console', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const wrapper = createWrapper();
    renderHook(() => useSocketListeners(), { wrapper });

    const errorCall = mockSubscribeToEvent.mock.calls.find(c => c[0] === 'document_operation_error');
    const handleError = errorCall[1];

    handleError({ type: 'upload', message: 'Erreur de fichier' });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
