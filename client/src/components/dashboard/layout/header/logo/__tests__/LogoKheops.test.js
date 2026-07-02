// LogoKheops.test.js — Tests du composant LogoKheops (header)
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LogoKheops from '../index';

// Le composant utilise useNavigate() : il doit être rendu dans un Router.
const renderWithRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('LogoKheops', () => {
  it('se rend sans crash', () => {
    const { container } = renderWithRouter(<LogoKheops />);
    expect(container.firstChild).toBeTruthy();
  });

  it('affiche une image avec alt="Kheops 2"', () => {
    renderWithRouter(<LogoKheops />);
    const img = screen.getByAltText('Kheops 2');
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
  });

  it('applique la classe "logo-wrapper" au conteneur', () => {
    const { container } = renderWithRouter(<LogoKheops />);
    expect(container.querySelector('.logo-wrapper')).toBeInTheDocument();
  });

  it('applique la classe "logo" a l\'image', () => {
    renderWithRouter(<LogoKheops />);
    const img = screen.getByAltText('Kheops 2');
    expect(img).toHaveClass('logo');
  });
});
