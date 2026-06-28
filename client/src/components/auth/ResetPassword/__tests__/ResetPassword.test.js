// ResetPassword.test.js — Tests du composant ResetPassword
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mocks globaux requis par rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

// Mock authSlice — sendResetPasswordRequest est un thunk creator
const mockSendResetPasswordRequest = jest.fn();
jest.mock('../../../../redux/slices/authSlice', () => {
  const initialState = { user: null, isAuthenticated: false, error: null, loading: false, successSendResetPasswordMail: false };
  return {
    __esModule: true,
    default: (state = initialState) => state,
    sendResetPasswordRequest: (...args) => {
      mockSendResetPasswordRequest(...args);
      return () => Promise.resolve();
    },
  };
});

import { renderWithProviders } from '../../../../test-utils';
import ResetPassword from '../ResetPassword';

describe('ResetPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderResetPassword = (preloadedState = {}) => {
    return renderWithProviders(<ResetPassword />, {
      preloadedState: {
        login: {
          error: null,
          isAuthenticated: false,
          user: null,
          successSendResetPasswordMail: false,
          ...preloadedState.login,
        },
        ...preloadedState,
      },
    });
  };

  it('rend le titre "Réinitialiser le mot de passe"', () => {
    renderResetPassword();
    expect(screen.getByText('Réinitialiser le mot de passe')).toBeInTheDocument();
  });

  it('rend le champ email avec placeholder', () => {
    renderResetPassword();
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
  });

  it('rend le bouton de soumission', () => {
    renderResetPassword();
    expect(screen.getByText('Envoyer le lien de réinitialisation')).toBeInTheDocument();
  });

  it('permet la saisie dans le champ email', async () => {
    renderResetPassword();
    const emailInput = screen.getByPlaceholderText('Email');
    await userEvent.type(emailInput, 'user@test.com');
    expect(emailInput).toHaveValue('user@test.com');
  });

  it('dispatch sendResetPasswordRequest au submit', async () => {
    renderResetPassword();
    const emailInput = screen.getByPlaceholderText('Email');
    await userEvent.type(emailInput, 'user@test.com');

    const submitBtn = screen.getByText('Envoyer le lien de réinitialisation');
    fireEvent.click(submitBtn);

    expect(mockSendResetPasswordRequest).toHaveBeenCalledWith('user@test.com');
  });
});
