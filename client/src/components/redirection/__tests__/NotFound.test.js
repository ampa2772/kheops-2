// NotFound.test.js — Tests du composant NotFound
import React from 'react';
import { render, screen } from '@testing-library/react';
import NotFound from '../NotFound';

describe('NotFound', () => {
  it('se rend sans crash', () => {
    const { container } = render(<NotFound />);
    expect(container.firstChild).toBeTruthy();
  });

  it('affiche le titre "Page non trouvée"', () => {
    render(<NotFound />);
    expect(screen.getByText('Page non trouvée')).toBeInTheDocument();
  });

  it('affiche le message descriptif', () => {
    render(<NotFound />);
    expect(screen.getByText("La page que vous cherchez n'existe pas.")).toBeInTheDocument();
  });

  it('rend un h1 pour le titre', () => {
    render(<NotFound />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Page non trouvée');
  });
});
