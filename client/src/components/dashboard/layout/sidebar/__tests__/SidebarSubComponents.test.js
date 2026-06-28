// SidebarSubComponents.test.js — Tests des sous-composants de la sidebar
// Teste un echantillon representatif : OfficeHomeLinkIcon, OfficeHomeLinkTitle, OfficeHomeLink, DossierLink
import React from 'react';
import { render, screen } from '@testing-library/react';

// Mocks globaux requis par rootReducer (via test-utils)
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

import { renderWithProviders } from '../../../../../test-utils';

// --- Composants Icon et Title (purs, sans Redux) ---
import OfficeHomeLinkIcon from '../officeHomeLink/officeHomeLinkIcon';
import OfficeHomeLinkTitle from '../officeHomeLink/officeHomeLinkTitle';

// --- Composants parents (avec Redux : useSelector) ---
import OfficeHomeLink from '../officeHomeLink';
import OfficeDossierLink from '../dossierLink';

describe('Sidebar — sous-composants', () => {
  describe('OfficeHomeLinkIcon', () => {
    it('rend une image avec alt="boutonHome"', () => {
      render(<OfficeHomeLinkIcon />);
      const img = screen.getByAltText('boutonHome');
      expect(img).toBeInTheDocument();
      expect(img.tagName).toBe('IMG');
    });

    it('applique la classe "boutonSideBar"', () => {
      render(<OfficeHomeLinkIcon />);
      const img = screen.getByAltText('boutonHome');
      expect(img).toHaveClass('boutonSideBar');
    });
  });

  describe('OfficeHomeLinkTitle', () => {
    it('affiche le texte "Bureau"', () => {
      render(<OfficeHomeLinkTitle />);
      expect(screen.getByText('Bureau')).toBeInTheDocument();
    });
  });

  describe('OfficeHomeLink (parent)', () => {
    it('rend Icon + Title quand isSidebarOpen=true', () => {
      renderWithProviders(<OfficeHomeLink />, {
        preloadedState: { layout: { isSidebarOpen: true } },
      });
      // Icon toujours present
      expect(screen.getByAltText('boutonHome')).toBeInTheDocument();
      // Title present quand sidebar ouverte
      expect(screen.getByText('Bureau')).toBeInTheDocument();
    });

    it('rend seulement Icon quand isSidebarOpen=false', () => {
      renderWithProviders(<OfficeHomeLink />, {
        preloadedState: { layout: { isSidebarOpen: false } },
      });
      expect(screen.getByAltText('boutonHome')).toBeInTheDocument();
      expect(screen.queryByText('Bureau')).not.toBeInTheDocument();
    });

    it('applique la classe "boutonConteneur"', () => {
      const { container } = renderWithProviders(<OfficeHomeLink />, {
        preloadedState: { layout: { isSidebarOpen: true } },
      });
      expect(container.querySelector('.boutonConteneur')).toBeInTheDocument();
    });
  });

  describe('OfficeDossierLink (pattern identique)', () => {
    it('rend Icon + Title quand isSidebarOpen=true', () => {
      renderWithProviders(<OfficeDossierLink />, {
        preloadedState: { layout: { isSidebarOpen: true } },
      });
      expect(screen.getByText('Dossiers')).toBeInTheDocument();
    });

    it('masque le Title quand isSidebarOpen=false', () => {
      renderWithProviders(<OfficeDossierLink />, {
        preloadedState: { layout: { isSidebarOpen: false } },
      });
      expect(screen.queryByText('Dossiers')).not.toBeInTheDocument();
    });
  });
});
