// GoogleCallbackHandler.test.js — Tests du composant GoogleCallbackHandler
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Mocks globaux requis par rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

// Mock authSlice — loadUser est un thunk creator
const mockLoadUser = jest.fn();
jest.mock('../../../redux/slices/authSlice', () => {
  const initialState = { user: null, isAuthenticated: false, error: null, loading: false };
  return {
    __esModule: true,
    default: (state = initialState) => state,
    loadUser: (...args) => mockLoadUser(...args),
  };
});

import rootReducer from '../../../redux/rootReducer';
import GoogleCallbackHandler from '../GoogleCallbackHandler';

describe('GoogleCallbackHandler', () => {
  let originalConsole;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Spy localStorage
    jest.spyOn(Storage.prototype, 'clear').mockImplementation();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation();
    jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    // Setup window.electron
    window.electron = { authReady: jest.fn() };
    // Silence console.log/error in this component
    originalConsole = { ...console };
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    Storage.prototype.clear.mockRestore();
    Storage.prototype.setItem.mockRestore();
    Storage.prototype.getItem.mockRestore();
    delete window.electron;
    console.log.mockRestore();
    console.error.mockRestore();
  });

  const renderWithRoute = (queryString = '?token=mon-jwt-token') => {
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    return {
      store,
      ...render(
        <Provider store={store}>
          <MemoryRouter initialEntries={[`/auth/google/callback${queryString}`]}>
            <Routes>
              <Route path="/auth/google/callback" element={<GoogleCallbackHandler />} />
            </Routes>
          </MemoryRouter>
        </Provider>
      ),
    };
  };

  it('affiche le spinner de chargement initial', () => {
    mockLoadUser.mockReturnValue(jest.fn(() => Promise.resolve()));
    renderWithRoute();
    expect(screen.getByText('Connexion en cours...')).toBeInTheDocument();
  });

  it('affiche le message de traitement Google', () => {
    mockLoadUser.mockReturnValue(jest.fn(() => Promise.resolve()));
    renderWithRoute();
    expect(screen.getByText("Traitement de l'authentification Google")).toBeInTheDocument();
  });

  it('clear localStorage et set token quand token present dans URL', async () => {
    mockLoadUser.mockReturnValue(jest.fn(() => Promise.resolve()));
    renderWithRoute('?token=abc123');

    await waitFor(() => {
      expect(Storage.prototype.clear).toHaveBeenCalled();
      expect(Storage.prototype.setItem).toHaveBeenCalledWith('token', 'abc123');
    });
  });

  it('dispatch loadUser avec token quand present', async () => {
    mockLoadUser.mockReturnValue(jest.fn(() => Promise.resolve()));
    renderWithRoute('?token=abc123');

    await waitFor(() => {
      expect(mockLoadUser).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'abc123',
          rememberMe: true,
          navigate: expect.any(Function),
        })
      );
    });
  });

  it('appelle window.electron.authReady apres loadUser reussi', async () => {
    mockLoadUser.mockReturnValue(jest.fn(() => Promise.resolve()));
    renderWithRoute('?token=abc123');

    await waitFor(() => {
      expect(window.electron.authReady).toHaveBeenCalled();
    });
  });

  it('affiche une erreur si aucun token dans URL', async () => {
    renderWithRoute('');

    await waitFor(() => {
      expect(screen.getByText("Aucun token d'authentification reçu.")).toBeInTheDocument();
    });
  });

  it('affiche une erreur si loadUser echoue', async () => {
    mockLoadUser.mockReturnValue(jest.fn(() => Promise.reject(new Error('Auth failed'))));
    renderWithRoute('?token=abc123');

    await waitFor(() => {
      expect(screen.getByText('Erreur lors de la connexion. Veuillez réessayer.')).toBeInTheDocument();
    });
  });

  it('appelle window.electron.authReady meme en cas d\'erreur', async () => {
    mockLoadUser.mockReturnValue(jest.fn(() => Promise.reject(new Error('Fail'))));
    renderWithRoute('?token=abc123');

    await waitFor(() => {
      expect(window.electron.authReady).toHaveBeenCalled();
    });
  });

  it('fonctionne sans window.electron (mode web)', async () => {
    delete window.electron;
    mockLoadUser.mockReturnValue(jest.fn(() => Promise.resolve()));
    renderWithRoute('?token=abc123');

    await waitFor(() => {
      expect(mockLoadUser).toHaveBeenCalled();
    });
    // Pas de crash
    expect(screen.getByText('Connexion en cours...')).toBeInTheDocument();
  });
});
