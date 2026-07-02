// Title.test.js — Tests du composant Title (header)
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Title from '../index';

// Le composant Title dérive désormais son libellé du pathname via useLocation()
// (react-router v6). Il doit donc être rendu dans un contexte Router.
// Sur la route "/dashboard", le titre attendu est "KHEOPS 2".
const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Title />
    </MemoryRouter>
  );

describe('Title', () => {
  it('rend le titre "KHEOPS 2" dans un h1', () => {
    renderAt('/dashboard');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('KHEOPS 2');
  });

  it('applique la classe CSS "title"', () => {
    renderAt('/dashboard');
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('title');
  });
});
