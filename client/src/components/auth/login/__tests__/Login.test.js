// Login.test.js — Tests du composant Login
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

// Mock authSlice — login est un thunk creator
const mockLogin = jest.fn();
jest.mock('../../../../redux/slices/authSlice', () => {
  const initialState = { user: null, isAuthenticated: false, error: null, loading: false };
  return {
    __esModule: true,
    default: (state = initialState) => state, // reducer factice pour rootReducer
    login: (...args) => {
      mockLogin(...args);
      return () => Promise.resolve();
    },
  };
});

import { renderWithProviders } from '../../../../test-utils';
import Login from '../Login';

describe('Login', () => {
  const mockToggleRegister = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset window.electron
    delete window.electron;
  });

  const renderLogin = (preloadedState = {}, route = '/') => {
    return renderWithProviders(
      <Login toggleRegister={mockToggleRegister} />,
      {
        preloadedState: {
          login: { error: null, isAuthenticated: false, user: null, ...preloadedState.login },
          ...preloadedState,
        },
        route,
      }
    );
  };

  it('rend le champ email avec placeholder "vous@exemple.com"', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('vous@exemple.com')).toBeInTheDocument();
  });

  it('rend le bouton "Se connecter"', () => {
    renderLogin();
    expect(screen.getByText('Se connecter')).toBeInTheDocument();
  });

  it('rend le bouton Google OAuth', () => {
    renderLogin();
    expect(screen.getByText('Se connecter avec Google')).toBeInTheDocument();
  });

  it('rend le lien "Mot de passe oublié ?"', () => {
    renderLogin();
    expect(screen.getByText('Mot de passe oublié ?')).toBeInTheDocument();
  });

  it('rend le bouton "Créer nouveau compte" qui appelle toggleRegister', () => {
    renderLogin();
    const btn = screen.getByText('Créer nouveau compte');
    fireEvent.click(btn);
    expect(mockToggleRegister).toHaveBeenCalledTimes(1);
  });

  it('permet la saisie dans le champ email', async () => {
    renderLogin();
    const emailInput = screen.getByPlaceholderText('vous@exemple.com');
    await userEvent.type(emailInput, 'user@test.com');
    expect(emailInput).toHaveValue('user@test.com');
  });

  it('rend la checkbox "Se souvenir de moi"', () => {
    renderLogin();
    expect(screen.getByLabelText('Se souvenir de moi')).toBeInTheDocument();
  });

  it('dispatch login au submit du formulaire', async () => {
    renderLogin();
    const emailInput = screen.getByPlaceholderText('vous@exemple.com');
    await userEvent.type(emailInput, 'user@test.com');

    const submitBtn = screen.getByText('Se connecter');
    fireEvent.click(submitBtn);

    expect(mockLogin).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        formData: expect.objectContaining({ email: 'user@test.com' }),
        navigate: expect.any(Function),
      })
    );
  });

  it('affiche une erreur Redux quand state.login.error est defini', () => {
    renderLogin({ login: { error: 'Identifiants invalides' } });
    expect(screen.getByText('Identifiants invalides')).toBeInTheDocument();
  });

  it('affiche une erreur Google depuis les query params', () => {
    renderLogin({}, '/?error=google_user_not_found');
    expect(screen.getByText(/Aucun compte Kheops/)).toBeInTheDocument();
  });

  it('affiche l\'erreur generique pour une erreur OAuth inconnue', () => {
    // Pour un code d'erreur non reconnu, le composant affiche le message
    // fallback generique "Une erreur est survenue lors de la connexion."
    // (sans mention specifique du fournisseur Google/Microsoft).
    renderLogin({}, '/?error=unknown_error');
    expect(screen.getByText(/Une erreur est survenue lors de la connexion/)).toBeInTheDocument();
  });
});
