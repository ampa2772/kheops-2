// Register.test.js — Tests du composant Register
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

// Mock authSlice — register est un thunk creator
const mockRegister = jest.fn();
jest.mock('../../../../redux/slices/authSlice', () => {
  const initialState = { user: null, isAuthenticated: false, error: null, loading: false };
  return {
    __esModule: true,
    default: (state = initialState) => state,
    register: (...args) => {
      mockRegister(...args);
      return () => Promise.resolve();
    },
  };
});

import { renderWithProviders } from '../../../../test-utils';
import Register from '../Register';

describe('Register', () => {
  const mockToggleRegister = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const renderRegister = (preloadedState = {}) => {
    return renderWithProviders(
      <Register toggleRegister={mockToggleRegister} />,
      {
        preloadedState: {
          login: { error: null, isAuthenticated: false, user: null, ...preloadedState.login },
          ...preloadedState,
        },
      }
    );
  };

  it('rend tous les champs du formulaire (7 inputs + genre)', () => {
    renderRegister();
    // 7 champs textuels
    expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Mot de passe')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Prénom')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Nom')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Adresse')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ville')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Code postal')).toBeInTheDocument();
    // Genre est un selecteur custom, pas un input
    expect(screen.getByText('Masculin')).toBeInTheDocument();
    expect(screen.getByText('Feminin')).toBeInTheDocument();
  });

  it('rend le bouton "S\'inscrire"', () => {
    renderRegister();
    expect(screen.getByText("S'inscrire")).toBeInTheDocument();
  });

  it('selectionne le genre Masculin au click et applique la classe selected', () => {
    renderRegister();
    const masculin = screen.getByText('Masculin');
    fireEvent.click(masculin);
    expect(masculin).toHaveClass('selected');
  });

  it('selectionne le genre Feminin au click', () => {
    renderRegister();
    const feminin = screen.getByText('Feminin');
    fireEvent.click(feminin);
    expect(feminin).toHaveClass('selected');
  });

  it('permet la saisie dans les champs textuels', async () => {
    renderRegister();
    const emailInput = screen.getByPlaceholderText('Email');
    await userEvent.type(emailInput, 'test@example.com');
    expect(emailInput).toHaveValue('test@example.com');
  });

  it('dispatch register au submit du formulaire', async () => {
    renderRegister();
    const emailInput = screen.getByPlaceholderText('Email');
    await userEvent.type(emailInput, 'test@example.com');

    const submitBtn = screen.getByText("S'inscrire");
    fireEvent.click(submitBtn);

    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({
        formData: expect.objectContaining({ email: 'test@example.com' }),
        navigate: expect.any(Function),
      })
    );
  });

  it('affiche une erreur Redux', () => {
    renderRegister({ login: { error: 'Email deja utilise' } });
    expect(screen.getByText('Email deja utilise')).toBeInTheDocument();
  });

  it('le bouton "Revenir a se connecter" appelle toggleRegister', () => {
    renderRegister();
    const btn = screen.getByText('Revenir à se connecter');
    fireEvent.click(btn);
    expect(mockToggleRegister).toHaveBeenCalledTimes(1);
  });
});
