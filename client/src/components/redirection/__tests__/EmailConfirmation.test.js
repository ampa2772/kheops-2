// EmailConfirmation.test.js — Tests du composant EmailConfirmation
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock axios (ESM) requis par authSlice via rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));

// Mock apiClient
jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

// Mock socketService
jest.mock('../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import rootReducer from '../../../redux/rootReducer';

// Mock du hook useEmailConfirmation
const mockUseEmailConfirmation = jest.fn();
jest.mock('../../../hooks/useEmailConfirmation', () => ({
  __esModule: true,
  default: (token) => mockUseEmailConfirmation(token),
}));

import EmailConfirmation from '../EmailConfirmation';

// Helper : rend EmailConfirmation dans un contexte de route avec parametre :token
function renderWithRoute(tokenValue = 'abc123') {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/confirm/${tokenValue}`]}>
        <Routes>
          <Route path="/confirm/:token" element={<EmailConfirmation />} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
}

describe('EmailConfirmation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('se rend sans crash', () => {
    const { container } = renderWithRoute();
    expect(container.firstChild).toBeTruthy();
  });

  it('affiche le titre "Confirmation de l\'e-mail"', () => {
    renderWithRoute();
    expect(screen.getByText("Confirmation de l'e-mail")).toBeInTheDocument();
  });

  it('affiche le message de patience', () => {
    renderWithRoute();
    expect(screen.getByText(/Votre e-mail est en cours de confirmation/)).toBeInTheDocument();
  });

  it('appelle useEmailConfirmation avec le token de la route', () => {
    renderWithRoute('mon-token-xyz');
    expect(mockUseEmailConfirmation).toHaveBeenCalledWith('mon-token-xyz');
  });

  it('rend un h1 pour le titre', () => {
    renderWithRoute();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent("Confirmation de l'e-mail");
  });
});
