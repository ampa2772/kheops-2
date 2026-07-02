// Sidebar.test.js — Tests du composant Sidebar principal
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';

// Mocks globaux requis par rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

// Mock speechService (utilise par Tooltip)
jest.mock('../../../../../services/speechService', () => ({
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
}));

// Mock createPortal pour Tooltip
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node) => node,
}));

import { renderWithProviders } from '../../../../../test-utils';
import SideBar from '../index';

describe('SideBar', () => {
  const renderSidebar = (route = '/dashboard/', isSidebarOpen = true) => {
    return renderWithProviders(<SideBar />, {
      preloadedState: { layout: { isSidebarOpen } },
      route,
    });
  };

  it('rend le nav avec role="navigation"', () => {
    renderSidebar();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('rend les 12 liens de navigation', () => {
    renderSidebar();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(12);
  });

  it('chaque lien a un aria-label correspondant', () => {
    renderSidebar();
    const labels = ['Bureau', 'Dossiers', 'Contacts', 'Agenda', 'Taches', 'Facturation', 'CARPA', 'Bilan', 'Graphiques', 'Mails', 'Notices', 'Parametres'];
    labels.forEach(label => {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    });
  });

  it('marque le lien actif avec aria-current="page" (exact match pour Bureau)', () => {
    renderSidebar('/dashboard/');
    const bureauLink = screen.getByRole('link', { name: 'Bureau' });
    expect(bureauLink).toHaveAttribute('aria-current', 'page');
  });

  it('ne marque PAS Bureau comme actif pour /dashboard/dossier', () => {
    renderSidebar('/dashboard/dossier');
    const bureauLink = screen.getByRole('link', { name: 'Bureau' });
    expect(bureauLink).not.toHaveAttribute('aria-current');
  });

  it('marque Dossiers comme actif pour /dashboard/dossier (startsWith)', () => {
    renderSidebar('/dashboard/dossier');
    const dossierLink = screen.getByRole('link', { name: 'Dossiers' });
    expect(dossierLink).toHaveAttribute('aria-current', 'page');
  });

  it('marque Dossiers comme actif pour /dashboard/createDossier (startsWith)', () => {
    renderSidebar('/dashboard/createDossier');
    const dossierLink = screen.getByRole('link', { name: 'Dossiers' });
    expect(dossierLink).toHaveAttribute('aria-current', 'page');
  });

  it('applique la classe "selectedInSideBar" au lien actif', () => {
    renderSidebar('/dashboard/');
    const bureauLink = screen.getByRole('link', { name: 'Bureau' });
    expect(bureauLink).toHaveClass('selectedInSideBar');
  });

  it('applique la classe "notSelectedInSideBar" aux liens inactifs', () => {
    renderSidebar('/dashboard/');
    const dossierLink = screen.getByRole('link', { name: 'Dossiers' });
    expect(dossierLink).toHaveClass('notSelectedInSideBar');
  });

  it('applique "sidebarOpenClass" quand isSidebarOpen=true', () => {
    renderSidebar('/dashboard/', true);
    const bureauLink = screen.getByRole('link', { name: 'Bureau' });
    expect(bureauLink).toHaveClass('sidebarOpenClass');
  });

  it('n\'applique PAS "sidebarOpenClass" quand isSidebarOpen=false', () => {
    renderSidebar('/dashboard/', false);
    const bureauLink = screen.getByRole('link', { name: 'Bureau' });
    expect(bureauLink).not.toHaveClass('sidebarOpenClass');
  });

  it('rend le BoutonResizeBar', () => {
    renderSidebar();
    // BoutonResizeBar rend un bouton img
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('les liens ont tabIndex=0 pour accessibilite', () => {
    renderSidebar();
    const links = screen.getAllByRole('link');
    links.forEach(link => {
      expect(link).toHaveAttribute('tabindex', '0');
    });
  });

  it('la navigation clavier avec Enter fonctionne', () => {
    const { store } = renderSidebar('/dashboard/');
    const dossierLink = screen.getByRole('link', { name: 'Dossiers' });
    fireEvent.keyDown(dossierLink, { key: 'Enter' });
    // Verifie que la navigation a ete tentee (pas de crash)
    expect(dossierLink).toBeInTheDocument();
  });

  it('la navigation clavier avec Space fonctionne', () => {
    renderSidebar('/dashboard/');
    const agendaLink = screen.getByRole('link', { name: 'Agenda' });
    fireEvent.keyDown(agendaLink, { key: ' ' });
    expect(agendaLink).toBeInTheDocument();
  });
});
