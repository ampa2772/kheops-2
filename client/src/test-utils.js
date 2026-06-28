// test-utils.js — Helper de rendu pour les tests de composants React
// Fournit renderWithProviders : wrapping Provider (Redux) + MemoryRouter (React Router)

import React from 'react';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import rootReducer from './redux/rootReducer';

/**
 * renderWithProviders — Rend un composant React avec Provider Redux et MemoryRouter.
 *
 * @param {ReactElement} ui — Le composant a rendre
 * @param {Object} options
 * @param {Object} options.preloadedState — Etat initial du store Redux
 * @param {Object} options.store — Store custom (sinon cree automatiquement)
 * @param {string} options.route — Route initiale pour MemoryRouter (defaut: '/')
 * @param {Object} options.routerProps — Props supplementaires pour MemoryRouter
 * @returns {{ store, ...renderResult }}
 */
export function renderWithProviders(ui, {
  preloadedState = {},
  store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  }),
  route = '/',
  routerProps = {},
  ...renderOptions
} = {}) {
  function Wrapper({ children }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]} {...routerProps}>
          {children}
        </MemoryRouter>
      </Provider>
    );
  }
  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
}

// Re-export tout de @testing-library/react pour import unique
export * from '@testing-library/react';
