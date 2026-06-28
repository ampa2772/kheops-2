// ResetPasswordToken.test.js — Tests du composant ResetPasswordToken
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Mock authSlice — updatePassword est un thunk creator
const mockUpdatePassword = jest.fn();
jest.mock('../../../redux/slices/authSlice', () => {
  const initialState = { user: null, isAuthenticated: false, error: null, loading: false };
  return {
    __esModule: true,
    default: (state = initialState) => state,
    updatePassword: (...args) => {
      mockUpdatePassword(...args);
      return () => Promise.resolve();
    },
  };
});

import rootReducer from '../../../redux/rootReducer';
import ResetPasswordToken from '../ResetPasswordToken';

describe('ResetPasswordToken', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderWithRoute = (tokenValue = 'reset-token-123') => {
    const store = configureStore({
      reducer: rootReducer,
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({ serializableCheck: false }),
    });

    return render(
      <Provider store={store}>
        <MemoryRouter initialEntries={[`/reset-password/${tokenValue}`]}>
          <Routes>
            <Route path="/reset-password/:token" element={<ResetPasswordToken />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
  };

  it('rend le titre "Réinitialisation du mot de passe"', () => {
    renderWithRoute();
    expect(screen.getByText('Réinitialisation du mot de passe')).toBeInTheDocument();
  });

  it('rend le champ de mot de passe', () => {
    renderWithRoute();
    expect(screen.getByPlaceholderText('Nouveau mot de passe')).toBeInTheDocument();
  });

  it('rend le bouton de soumission', () => {
    renderWithRoute();
    expect(screen.getByText('Réinitialiser le mot de passe')).toBeInTheDocument();
  });

  it('permet la saisie du nouveau mot de passe', async () => {
    renderWithRoute();
    const passwordInput = screen.getByPlaceholderText('Nouveau mot de passe');
    await userEvent.type(passwordInput, 'MonNouveauMotDePasse');
    expect(passwordInput).toHaveValue('MonNouveauMotDePasse');
  });

  it('dispatch updatePassword avec le mot de passe et le token au submit', async () => {
    renderWithRoute('mon-token-special');
    const passwordInput = screen.getByPlaceholderText('Nouveau mot de passe');
    await userEvent.type(passwordInput, 'NouveauMDP123');

    const submitBtn = screen.getByText('Réinitialiser le mot de passe');
    fireEvent.click(submitBtn);

    expect(mockUpdatePassword).toHaveBeenCalledWith(
      'NouveauMDP123',
      'mon-token-special',
      expect.any(Function) // navigate
    );
  });

  it('le champ mot de passe est de type "password"', () => {
    renderWithRoute();
    const input = screen.getByPlaceholderText('Nouveau mot de passe');
    expect(input).toHaveAttribute('type', 'password');
  });
});
