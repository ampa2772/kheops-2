// dashboardNavigation.integration.test.js — Tests d'integration de la navigation Dashboard
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';

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
import SideBar from '../../components/dashboard/layout/sidebar';

// State de base pour un utilisateur authentifie
const authenticatedState = {
  login: {
    user: { _id: 'u1', firstName: 'Jean', lastName: 'Dupont', email: 'jean@test.com' },
    isAuthenticated: true,
    error: null,
    loading: false,
    token: 'test-token',
  },
};

describe('Navigation Dashboard (integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===================== Sidebar rendering =====================
  describe('sidebar rendering', () => {
    it('rend la navigation principale avec role="navigation"', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/',
      });

      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('rend les 8 liens de navigation', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/',
      });

      const links = screen.getAllByRole('link');
      expect(links.length).toBe(8);
    });

    it('chaque lien a un aria-label correspondant', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/',
      });

      const labels = ['Bureau', 'Dossiers', 'Agenda', 'Taches', 'Facturation', 'Graphiques', 'Mails', 'Parametres'];
      labels.forEach(label => {
        expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
      });
    });
  });

  // ===================== Active state =====================
  describe('etat actif des liens', () => {
    it('Bureau est actif sur /dashboard/', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/',
      });

      const bureauLink = screen.getByRole('link', { name: 'Bureau' });
      expect(bureauLink).toHaveAttribute('aria-current', 'page');
    });

    it('Dossiers est actif sur /dashboard/dossier', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/dossier',
      });

      const dossiersLink = screen.getByRole('link', { name: 'Dossiers' });
      expect(dossiersLink).toHaveAttribute('aria-current', 'page');
    });

    it('Agenda est actif sur /dashboard/agenda', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/agenda',
      });

      const agendaLink = screen.getByRole('link', { name: 'Agenda' });
      expect(agendaLink).toHaveAttribute('aria-current', 'page');
    });

    it('les autres liens ne sont pas actifs quand Bureau est actif', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/',
      });

      const dossiersLink = screen.getByRole('link', { name: 'Dossiers' });
      expect(dossiersLink).not.toHaveAttribute('aria-current');
    });

    it('Dossiers aussi actif sur /dashboard/createDossier (startsWith)', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/createDossier',
      });

      const dossiersLink = screen.getByRole('link', { name: 'Dossiers' });
      expect(dossiersLink).toHaveAttribute('aria-current', 'page');
    });
  });

  // ===================== Sidebar fermee =====================
  describe('sidebar fermee', () => {
    it('rend la sidebar meme quand fermee', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: false } },
        route: '/dashboard/',
      });

      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
    });

    it('n applique pas sidebarOpenClass quand sidebar fermee', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: false } },
        route: '/dashboard/',
      });

      const links = screen.getAllByRole('link');
      links.forEach(link => {
        expect(link.className).not.toContain('sidebarOpenClass');
      });
    });

    it('applique sidebarOpenClass quand sidebar ouverte', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/',
      });

      const links = screen.getAllByRole('link');
      links.forEach(link => {
        expect(link.className).toContain('sidebarOpenClass');
      });
    });
  });

  // ===================== Accessibilite =====================
  describe('accessibilite', () => {
    it('navigation a un aria-label Menu principal', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/',
      });

      const nav = screen.getByRole('navigation');
      expect(nav).toHaveAttribute('aria-label', 'Menu principal');
    });

    it('les items sont focusables (tabIndex=0)', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/',
      });

      const links = screen.getAllByRole('link');
      links.forEach(link => {
        expect(link).toHaveAttribute('tabindex', '0');
      });
    });

    it('navigation clavier avec Enter ne crash pas', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/',
      });

      const dossiersLink = screen.getByRole('link', { name: 'Dossiers' });
      fireEvent.keyDown(dossiersLink, { key: 'Enter', code: 'Enter' });

      expect(dossiersLink).toBeInTheDocument();
    });

    it('navigation clavier avec Space ne crash pas', () => {
      renderWithProviders(<SideBar />, {
        preloadedState: { ...authenticatedState, layout: { isSidebarOpen: true } },
        route: '/dashboard/',
      });

      const agendaLink = screen.getByRole('link', { name: 'Agenda' });
      fireEvent.keyDown(agendaLink, { key: ' ', code: 'Space' });

      expect(agendaLink).toBeInTheDocument();
    });
  });
});
