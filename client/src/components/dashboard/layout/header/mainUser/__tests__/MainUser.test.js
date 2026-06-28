// MainUser.test.js — Tests du composant MainUser
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

// Mock speechService
jest.mock('../../../../../../services/speechService', () => ({
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
}));

// Mock createPortal pour le modal
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node) => node,
}));

// Mock sous-composants
jest.mock('../mainUserInfos', () => {
  const Mock = () => <div data-testid="mock-user-infos">UserInfos</div>;
  Mock.displayName = 'MockMainUserInfos';
  return Mock;
});
jest.mock('../mainUserIcon', () => {
  const Mock = () => <div data-testid="mock-user-icon">UserIcon</div>;
  Mock.displayName = 'MockMainUserIcon';
  return Mock;
});
jest.mock('../mainUserModal', () => {
  const Mock = ({ position }) => (
    <div data-testid="mock-user-modal">
      Modal (top: {position?.top}, right: {position?.right})
    </div>
  );
  Mock.displayName = 'MockMainUserModal';
  return Mock;
});

import { render, screen as rtlScreen } from '@testing-library/react';
import MainUser from '../index';

describe('MainUser', () => {
  it('rend MainUserInfos et MainUserIcon', () => {
    render(<MainUser />);
    expect(screen.getByTestId('mock-user-infos')).toBeInTheDocument();
    expect(screen.getByTestId('mock-user-icon')).toBeInTheDocument();
  });

  it('ne rend PAS le modal par defaut', () => {
    render(<MainUser />);
    expect(screen.queryByTestId('mock-user-modal')).not.toBeInTheDocument();
  });

  it('ouvre le modal au click sur main-user', () => {
    render(<MainUser />);
    const mainUserDiv = screen.getByTestId('mock-user-infos').parentElement;
    fireEvent.click(mainUserDiv);
    expect(screen.getByTestId('mock-user-modal')).toBeInTheDocument();
  });

  it('ferme le modal au second click', () => {
    render(<MainUser />);
    const mainUserDiv = screen.getByTestId('mock-user-infos').parentElement;
    // Ouvrir
    fireEvent.click(mainUserDiv);
    expect(screen.getByTestId('mock-user-modal')).toBeInTheDocument();
    // Fermer
    fireEvent.click(mainUserDiv);
    expect(screen.queryByTestId('mock-user-modal')).not.toBeInTheDocument();
  });

  it('ferme le modal au click exterieur', () => {
    render(<MainUser />);
    const mainUserDiv = screen.getByTestId('mock-user-infos').parentElement;
    // Ouvrir
    fireEvent.click(mainUserDiv);
    expect(screen.getByTestId('mock-user-modal')).toBeInTheDocument();
    // Click a l'exterieur (sur document.body)
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('mock-user-modal')).not.toBeInTheDocument();
  });

  it('ne ferme PAS le modal au click a l\'interieur du modal', () => {
    render(<MainUser />);
    const mainUserDiv = screen.getByTestId('mock-user-infos').parentElement;
    // Ouvrir
    fireEvent.click(mainUserDiv);
    const modal = screen.getByTestId('mock-user-modal');
    expect(modal).toBeInTheDocument();
    // Click a l'interieur du modal
    fireEvent.mouseDown(modal);
    expect(screen.getByTestId('mock-user-modal')).toBeInTheDocument();
  });

  it('applique la classe main-user au conteneur clickable', () => {
    render(<MainUser />);
    const mainUserDiv = screen.getByTestId('mock-user-infos').parentElement;
    expect(mainUserDiv).toHaveClass('main-user');
  });
});
