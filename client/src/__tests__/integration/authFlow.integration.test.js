// authFlow.integration.test.js — Tests d'integration du flux d'authentification
import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';

// Mocks globaux requis par rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
jest.mock('../../services/apiClient', () => ({
  __esModule: true,
  default: {
    get: (...args) => mockApiGet(...args),
    post: (...args) => mockApiPost(...args),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  subscribeToEvent: jest.fn(),
  unsubscribeFromEvent: jest.fn(),
  default: { initSocket: jest.fn() },
}));

jest.mock('../../services/speechService', () => ({
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
  initializeSpeechSynthesis: jest.fn(),
}));

// Mock createPortal pour Tooltip
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node) => node,
}));

import { renderWithProviders } from '../../test-utils';
import Home from '../../components/home';
import Login from '../../components/auth/login/Login';
import NotFound from '../../components/redirection/NotFound';
import ResetPassword from '../../components/auth/ResetPassword/ResetPassword';

describe('Flux d authentification (integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    // Par defaut, verify-token echoue (pas de token)
    mockApiGet.mockRejectedValue(new Error('No token'));
  });

  // ===================== Page d'accueil (Login) =====================
  describe('page d accueil', () => {
    it('affiche le texte KHEOPS 2', () => {
      renderWithProviders(<Home />, { route: '/' });

      expect(screen.getByText('KHEOPS 2')).toBeInTheDocument();
    });

    it('affiche le formulaire de login par defaut', () => {
      renderWithProviders(<Home />, { route: '/' });

      expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
      expect(screen.getByText('Se connecter')).toBeInTheDocument();
    });

    it('affiche le bouton Se connecter avec Google', () => {
      renderWithProviders(<Home />, { route: '/' });

      expect(screen.getByText('Se connecter avec Google')).toBeInTheDocument();
    });

    it('affiche le lien Mot de passe oublie', () => {
      renderWithProviders(<Home />, { route: '/' });

      expect(screen.getByText('Mot de passe oublié ?')).toBeInTheDocument();
    });

    it('affiche la checkbox Se souvenir de moi', () => {
      renderWithProviders(<Home />, { route: '/' });

      expect(screen.getByLabelText('Se souvenir de moi')).toBeInTheDocument();
    });
  });

  // ===================== Saisie du formulaire =====================
  describe('saisie du formulaire', () => {
    it('permet de saisir un email', () => {
      renderWithProviders(<Home />, { route: '/' });

      const emailInput = screen.getByPlaceholderText('Email');
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

      expect(emailInput.value).toBe('test@example.com');
    });

    it('permet de cocher Se souvenir de moi', () => {
      renderWithProviders(<Home />, { route: '/' });

      const checkbox = screen.getByLabelText('Se souvenir de moi');
      fireEvent.click(checkbox);

      expect(checkbox.checked).toBe(true);
    });
  });

  // ===================== Basculement Login/Register =====================
  describe('basculement login / register', () => {
    it('basculer vers le formulaire inscription via Creer nouveau compte', () => {
      renderWithProviders(<Home />, { route: '/' });

      fireEvent.click(screen.getByText('Créer nouveau compte'));

      // Apres bascule, on devrait voir le formulaire register
      expect(screen.getByText("S'inscrire")).toBeInTheDocument();
    });

    it('revenir au login depuis le register', () => {
      renderWithProviders(<Home />, { route: '/' });

      // Aller vers register
      fireEvent.click(screen.getByText('Créer nouveau compte'));
      expect(screen.getByText("S'inscrire")).toBeInTheDocument();

      // Revenir au login
      fireEvent.click(screen.getByText('Revenir à se connecter'));
      expect(screen.getByText('Se connecter')).toBeInTheDocument();
    });
  });

  // ===================== Erreurs Google OAuth =====================
  describe('erreurs Google OAuth (query params)', () => {
    // On rend Login directement (pas Home) pour eviter le useEffect de verification de token
    // qui naviguerait et perdrait les query params
    const noop = () => {};

    it('affiche erreur google_auth_failed', () => {
      renderWithProviders(<Login toggleRegister={noop} />, {
        route: '/?error=google_auth_failed',
      });

      expect(screen.getByText("L'authentification Google a échoué ou a été refusée.")).toBeInTheDocument();
    });

    it('affiche erreur google_user_not_found', () => {
      renderWithProviders(<Login toggleRegister={noop} />, {
        route: '/?error=google_user_not_found',
      });

      expect(screen.getByText("Aucun compte Kheops n'est associé à cette adresse e-mail Google.")).toBeInTheDocument();
    });

    it('affiche erreur server_error', () => {
      renderWithProviders(<Login toggleRegister={noop} />, {
        route: '/?error=server_error',
      });

      expect(screen.getByText('Erreur serveur lors de l\'authentification Google.')).toBeInTheDocument();
    });
  });

  // ===================== Erreurs Redux login =====================
  describe('erreurs Redux affichees', () => {
    it('affiche erreur Redux si present dans le store', () => {
      renderWithProviders(<Home />, {
        route: '/',
        preloadedState: {
          login: {
            user: null,
            isAuthenticated: false,
            loading: false,
            error: 'Identifiants invalides',
            token: null,
          },
        },
      });

      expect(screen.getByText('Identifiants invalides')).toBeInTheDocument();
    });
  });

  // ===================== Page NotFound =====================
  describe('page non trouvee', () => {
    it('affiche le titre Page non trouvee', () => {
      renderWithProviders(<NotFound />);

      expect(screen.getByText('Page non trouvée')).toBeInTheDocument();
      expect(screen.getByText("La page que vous cherchez n'existe pas.")).toBeInTheDocument();
    });
  });

  // ===================== ResetPassword =====================
  describe('page reset password', () => {
    it('affiche le formulaire de reinitialisation', () => {
      renderWithProviders(<ResetPassword />, {
        route: '/reset-password',
      });

      expect(screen.getByText('Réinitialiser le mot de passe')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
      expect(screen.getByText('Envoyer le lien de réinitialisation')).toBeInTheDocument();
    });

    it('permet de saisir un email pour reset', () => {
      renderWithProviders(<ResetPassword />, {
        route: '/reset-password',
      });

      const emailInput = screen.getByPlaceholderText('Email');
      fireEvent.change(emailInput, { target: { value: 'reset@example.com' } });

      expect(emailInput.value).toBe('reset@example.com');
    });
  });
});
