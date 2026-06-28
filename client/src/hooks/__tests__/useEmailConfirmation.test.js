// useEmailConfirmation.test.js — Tests du hook de confirmation email
import { renderHook, act } from '@testing-library/react';

// Mock des actions Redux
const mockVerifyEmailToken = jest.fn();
const mockLoadUser = jest.fn();
const mockCreateOfficeUser = jest.fn();

jest.mock('../../redux/slices/authSlice', () => ({
  __esModule: true,
  verifyEmailToken: (...args) => {
    mockVerifyEmailToken(...args);
    return () => Promise.resolve(true); // thunk qui retourne true (token valide)
  },
  loadUser: (...args) => {
    mockLoadUser(...args);
    return () => Promise.resolve();
  },
}));

jest.mock('../../redux/slices/officeUserSlice', () => ({
  __esModule: true,
  createOfficeUser: (...args) => {
    mockCreateOfficeUser(...args);
    return () => Promise.resolve();
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
jest.mock('../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import rootReducer from '../../redux/rootReducer';
import useEmailConfirmation from '../useEmailConfirmation';

const createWrapper = () => {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      login: { user: null, isAuthenticated: false, error: null, loading: false, token: null },
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

describe('useEmailConfirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('dispatch verifyEmailToken avec le token', async () => {
    const wrapper = createWrapper();
    renderHook(() => useEmailConfirmation('mon-token-123'), { wrapper });

    // Attendre que les effets async se resolvent
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockVerifyEmailToken).toHaveBeenCalledWith('mon-token-123');
  });

  it('dispatch createOfficeUser apres verification', async () => {
    const wrapper = createWrapper();
    renderHook(() => useEmailConfirmation('token-valide'), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockCreateOfficeUser).toHaveBeenCalled();
  });

  it('dispatch loadUser apres createOfficeUser', async () => {
    const wrapper = createWrapper();
    renderHook(() => useEmailConfirmation('token-valide'), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    expect(mockLoadUser).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'token-valide',
        rememberMe: false,
      })
    );
  });

  it('ne dispatch rien si le token est null', async () => {
    const wrapper = createWrapper();
    renderHook(() => useEmailConfirmation(null), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockVerifyEmailToken).not.toHaveBeenCalled();
    expect(mockCreateOfficeUser).not.toHaveBeenCalled();
  });

  it('ne dispatch rien si le token est undefined', async () => {
    const wrapper = createWrapper();
    renderHook(() => useEmailConfirmation(undefined), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockVerifyEmailToken).not.toHaveBeenCalled();
  });
});
