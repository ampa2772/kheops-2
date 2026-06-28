// BoutonResizeBar.test.js — Tests du composant BoutonResizeBar
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';

// Mocks globaux requis par rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

import { renderWithProviders } from '../../../../../../test-utils';
import BoutonResizeBar from '../index';

describe('BoutonResizeBar', () => {
  const renderWithSidebarState = (isSidebarOpen = true) => {
    return renderWithProviders(<BoutonResizeBar />, {
      preloadedState: { layout: { isSidebarOpen } },
    });
  };

  it('rend une image avec role="button"', () => {
    renderWithSidebarState();
    const button = screen.getByRole('button');
    expect(button.tagName).toBe('IMG');
  });

  it('affiche alt "Fermer le menu" quand isSidebarOpen=true', () => {
    renderWithSidebarState(true);
    expect(screen.getByAltText('Fermer le menu')).toBeInTheDocument();
  });

  it('affiche alt "Ouvrir le menu" quand isSidebarOpen=false', () => {
    renderWithSidebarState(false);
    expect(screen.getByAltText('Ouvrir le menu')).toBeInTheDocument();
  });

  it('applique la classe "resizeBarIcon" quand isSidebarOpen=true', () => {
    renderWithSidebarState(true);
    const img = screen.getByRole('button');
    expect(img).toHaveClass('resizeBarIcon');
  });

  it('applique la classe "rotated" quand isSidebarOpen=false', () => {
    renderWithSidebarState(false);
    const img = screen.getByRole('button');
    expect(img).toHaveClass('rotated');
  });

  it('dispatch toggleSidebar au click', () => {
    const { store } = renderWithSidebarState(true);
    const button = screen.getByRole('button');

    fireEvent.click(button);

    // Le store devrait avoir bascule isSidebarOpen
    expect(store.getState().layout.isSidebarOpen).toBe(false);
  });

  it('dispatch toggleSidebar sur touche Enter', () => {
    const { store } = renderWithSidebarState(true);
    const button = screen.getByRole('button');

    fireEvent.keyDown(button, { key: 'Enter' });

    expect(store.getState().layout.isSidebarOpen).toBe(false);
  });

  it('dispatch toggleSidebar sur touche Space', () => {
    const { store } = renderWithSidebarState(true);
    const button = screen.getByRole('button');

    fireEvent.keyDown(button, { key: ' ' });

    expect(store.getState().layout.isSidebarOpen).toBe(false);
  });

  it('a l\'aria-label "Fermer le menu lateral" quand ouvert', () => {
    renderWithSidebarState(true);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Fermer le menu lateral');
  });

  it('a l\'aria-label "Ouvrir le menu lateral" quand ferme', () => {
    renderWithSidebarState(false);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Ouvrir le menu lateral');
  });

  it('a tabIndex=0 pour accessibilite clavier', () => {
    renderWithSidebarState();
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('tabindex', '0');
  });
});
