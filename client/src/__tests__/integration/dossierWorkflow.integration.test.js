// dossierWorkflow.integration.test.js — Tests d'integration du workflow dossier
import React from 'react';
import { screen } from '@testing-library/react';

// Mocks globaux requis par rootReducer
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
  subscribeToEvent: jest.fn(),
  unsubscribeFromEvent: jest.fn(),
  uploadDroppedFile: jest.fn(),
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
import NotFound from '../../components/redirection/NotFound';

// State complet pour un utilisateur authentifie
const fullAuthenticatedState = {
  login: {
    user: { _id: 'u1', firstName: 'Jean', lastName: 'Dupont', email: 'jean@test.com', highContrastMode: false },
    isAuthenticated: true,
    error: null,
    loading: false,
    token: 'test-token',
  },
};

describe('Workflow dossier (integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ===================== Page NotFound =====================
  describe('route inconnue', () => {
    it('affiche Page non trouvee', () => {
      renderWithProviders(<NotFound />, { route: '/route-inexistante' });

      expect(screen.getByText('Page non trouvée')).toBeInTheDocument();
    });

    it('affiche le heading de niveau 1', () => {
      renderWithProviders(<NotFound />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page non trouvée');
    });

    it('affiche le message explicatif', () => {
      renderWithProviders(<NotFound />);

      expect(screen.getByText("La page que vous cherchez n'existe pas.")).toBeInTheDocument();
    });
  });

  // ===================== Etat authentifie =====================
  describe('etat d authentification', () => {
    it('un utilisateur non-authentifie a isAuthenticated false', () => {
      const nonAuthState = {
        login: {
          user: null,
          isAuthenticated: false,
          error: null,
          loading: false,
          token: null,
        },
      };

      const { store } = renderWithProviders(<div>test</div>, {
        preloadedState: nonAuthState,
      });

      expect(store.getState().login.isAuthenticated).toBe(false);
      expect(store.getState().login.user).toBeNull();
    });

    it('un utilisateur authentifie a le bon etat dans le store', () => {
      const { store } = renderWithProviders(<div>test</div>, {
        preloadedState: fullAuthenticatedState,
      });

      expect(store.getState().login.isAuthenticated).toBe(true);
      expect(store.getState().login.user._id).toBe('u1');
      expect(store.getState().login.user.firstName).toBe('Jean');
    });
  });

  // ===================== Store Redux coherence =====================
  describe('coherence du store Redux', () => {
    it('le store contient les slices attendus', () => {
      const { store } = renderWithProviders(<div>test</div>, {
        preloadedState: fullAuthenticatedState,
      });

      const state = store.getState();
      expect(state).toHaveProperty('login');
      expect(state).toHaveProperty('layout');
      expect(state).toHaveProperty('currentDossier');
      expect(state).toHaveProperty('officeUser');
      expect(state).toHaveProperty('partieData');
      expect(state).toHaveProperty('partieEditData');
      expect(state).toHaveProperty('agenda');
    });

    it('currentDossier initialise correctement avec donnees', () => {
      const stateWithDossier = {
        ...fullAuthenticatedState,
        currentDossier: {
          dossier: { _id: 'd1', nom: 'Dossier Test', reference: 'REF-001' },
          documents: [
            { _id: 'doc1', nomDocument: 'rapport.pdf' },
            { _id: 'doc2', nomDocument: 'contrat.docx' },
          ],
          loading: false,
          error: null,
          documentTemplates: [],
        },
      };

      const { store } = renderWithProviders(<div>test</div>, {
        preloadedState: stateWithDossier,
      });

      const { currentDossier } = store.getState();
      expect(currentDossier.dossier._id).toBe('d1');
      expect(currentDossier.documents).toHaveLength(2);
      expect(currentDossier.documents[0].nomDocument).toBe('rapport.pdf');
    });

    it('notifications initialisees vides par defaut', () => {
      const { store } = renderWithProviders(<div>test</div>, {
        preloadedState: fullAuthenticatedState,
      });

      const { layout } = store.getState();
      expect(layout.notificationCount).toBe(0);
      expect(layout.notifications.list).toEqual([]);
    });

    it('notifications avec des donnees', () => {
      const stateWithNotifs = {
        ...fullAuthenticatedState,
        layout: {
          isSidebarOpen: true,
          searchBarMetrics: { distanceFromTop: 0, distanceFromLeft: 0, elementWidth: 0, elementHeight: 0 },
          notificationCount: 3,
          notifications: {
            list: [
              { _id: 'n1', message: 'Nouveau document', isRead: false },
              { _id: 'n2', message: 'Dossier modifie', isRead: false },
              { _id: 'n3', message: 'Archive', isRead: true },
            ],
            loading: false,
            error: null,
            nextPageToken: null,
            hasMore: true,
            lastFetched: null,
            detail: null,
            detailLoading: false,
            detailError: null,
          },
        },
      };

      const { store } = renderWithProviders(<div>test</div>, {
        preloadedState: stateWithNotifs,
      });

      const { layout } = store.getState();
      expect(layout.notificationCount).toBe(3);
      expect(layout.notifications.list).toHaveLength(3);
    });

    it('agenda slice existe dans le store', () => {
      const { store } = renderWithProviders(<div>test</div>, {
        preloadedState: fullAuthenticatedState,
      });

      expect(store.getState()).toHaveProperty('agenda');
    });

    it('last25Dossiers slice existe dans le store', () => {
      const { store } = renderWithProviders(<div>test</div>, {
        preloadedState: fullAuthenticatedState,
      });

      expect(store.getState()).toHaveProperty('last25Dossiers');
    });
  });
});
