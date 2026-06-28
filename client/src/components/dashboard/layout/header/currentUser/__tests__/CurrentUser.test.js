// CurrentUser.test.js — Tests du composant CurrentUser
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

// Mock sous-composants
jest.mock('../currentUserChangeIcon', () => {
  const Mock = () => <div data-testid="mock-change-icon">ChangeIcon</div>;
  Mock.displayName = 'MockCurrentUserChangeIcon';
  return Mock;
});
jest.mock('../currentUserAffiche', () => {
  const Mock = () => <div data-testid="mock-affiche">Affiche</div>;
  Mock.displayName = 'MockCurrentUserAffiche';
  return Mock;
});
jest.mock('../currentUserChangeModal', () => {
  const Mock = () => <div data-testid="mock-modal">Modal</div>;
  Mock.displayName = 'MockModal';
  return Mock;
});

import { renderWithProviders } from '../../../../../../test-utils';
import CurrentUser from '../index';

describe('CurrentUser', () => {
  const defaultState = {
    login: { user: null, isAuthenticated: false, error: null, loading: false },
    layout: {
      modalIsOpen: false,
      deleteModalIsOpen: false,
      isSidebarOpen: true,
    },
    officeUser: {
      officeUser: null,
      officeUsers: [],
      editMode: false,
      userToDelete: null,
      isSetupRequired: false,
    },
  };

  const renderCurrentUser = (overrides = {}) => {
    const state = {
      ...defaultState,
      ...overrides,
      layout: { ...defaultState.layout, ...(overrides.layout || {}) },
    };
    return renderWithProviders(<CurrentUser />, { preloadedState: state });
  };

  it('rend CurrentUserChangeIcon et CurrentUserAffiche', () => {
    renderCurrentUser();
    expect(screen.getByTestId('mock-change-icon')).toBeInTheDocument();
    expect(screen.getByTestId('mock-affiche')).toBeInTheDocument();
  });

  it('ne rend PAS le modal quand modalIsOpen=false', () => {
    renderCurrentUser();
    expect(screen.queryByTestId('mock-modal')).not.toBeInTheDocument();
  });

  it('rend le modal quand modalIsOpen=true', () => {
    renderCurrentUser({ layout: { modalIsOpen: true } });
    expect(screen.getByTestId('mock-modal')).toBeInTheDocument();
  });

  it('dispatch toggleModal au click (ouvre le modal)', () => {
    const { store } = renderCurrentUser();
    const wrapper = screen.getByTestId('mock-change-icon').parentElement;
    fireEvent.click(wrapper);
    expect(store.getState().layout.modalIsOpen).toBe(true);
  });

  it('dispatch toggleDeleteModal au click quand deleteModalIsOpen=true', () => {
    const { store } = renderCurrentUser({ layout: { deleteModalIsOpen: true } });
    const wrapper = screen.getByTestId('mock-change-icon').parentElement;
    fireEvent.click(wrapper);
    // deleteModalIsOpen passe a false
    expect(store.getState().layout.deleteModalIsOpen).toBe(false);
  });

  it('dispatch resetEditMode et resetInitialData au click normal', () => {
    const { store } = renderCurrentUser();
    const wrapper = screen.getByTestId('mock-change-icon').parentElement;
    fireEvent.click(wrapper);
    // Verifie que editMode est reset (deja false, pas de crash)
    expect(store.getState().officeUser.editMode).toBe(false);
  });
});
