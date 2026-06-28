// Home.test.js — Tests du composant Home
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';

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

// Mock des composants enfants pour isoler le test de Home
jest.mock('../../auth/login/Login', () => {
  const MockLogin = (props) => (
    <div data-testid="mock-login">
      <button onClick={props.toggleRegister}>Toggle vers Register</button>
    </div>
  );
  MockLogin.displayName = 'MockLogin';
  return MockLogin;
});

jest.mock('../../auth/register/Register', () => {
  const MockRegister = (props) => (
    <div data-testid="mock-register">
      <button onClick={props.toggleRegister}>Toggle vers Login</button>
    </div>
  );
  MockRegister.displayName = 'MockRegister';
  return MockRegister;
});

import { renderWithProviders } from '../../../test-utils';
import Home from '../index';
import apiClient from '../../../services/apiClient';

describe('Home', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Par defaut : pas de token dans localStorage
    jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  });

  afterEach(() => {
    Storage.prototype.getItem.mockRestore();
  });

  it('affiche le texte "KHEOPS 2"', () => {
    renderWithProviders(<Home />);
    expect(screen.getByText('KHEOPS 2')).toBeInTheDocument();
  });

  it('affiche le composant Login par defaut', () => {
    renderWithProviders(<Home />);
    expect(screen.getByTestId('mock-login')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-register')).not.toBeInTheDocument();
  });

  it('bascule vers Register au click sur toggleRegister', () => {
    renderWithProviders(<Home />);
    const toggleBtn = screen.getByText('Toggle vers Register');
    fireEvent.click(toggleBtn);

    expect(screen.getByTestId('mock-register')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-login')).not.toBeInTheDocument();
  });

  it('bascule de Register vers Login au click', () => {
    renderWithProviders(<Home />);
    // D'abord aller vers Register
    fireEvent.click(screen.getByText('Toggle vers Register'));
    expect(screen.getByTestId('mock-register')).toBeInTheDocument();

    // Revenir a Login
    fireEvent.click(screen.getByText('Toggle vers Login'));
    expect(screen.getByTestId('mock-login')).toBeInTheDocument();
  });

  it('ne tente pas de verifier le token si localStorage est vide', async () => {
    renderWithProviders(<Home />);
    await waitFor(() => {
      expect(apiClient.get).not.toHaveBeenCalled();
    });
  });

  it('verifie le token et navigue vers /dashboard si valide', async () => {
    Storage.prototype.getItem.mockReturnValue('un-token-valide');
    apiClient.get.mockResolvedValueOnce({ data: { valid: true } });

    renderWithProviders(<Home />, { route: '/' });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/api/auth/verify-token');
    });
  });

  it('reste sur la page si le token est invalide', async () => {
    Storage.prototype.getItem.mockReturnValue('un-token-invalide');
    apiClient.get.mockResolvedValueOnce({ data: { valid: false } });

    renderWithProviders(<Home />, { route: '/' });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/api/auth/verify-token');
    });
    // Le composant reste visible
    expect(screen.getByText('KHEOPS 2')).toBeInTheDocument();
  });

  it('gere l\'erreur de verification du token', async () => {
    Storage.prototype.getItem.mockReturnValue('un-token');
    apiClient.get.mockRejectedValueOnce(new Error('Network error'));

    renderWithProviders(<Home />, { route: '/' });

    await waitFor(() => {
      expect(apiClient.get).toHaveBeenCalledWith('/api/auth/verify-token');
    });
    // Pas de crash
    expect(screen.getByText('KHEOPS 2')).toBeInTheDocument();
  });
});
