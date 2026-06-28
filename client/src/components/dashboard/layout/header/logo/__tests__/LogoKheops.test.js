// LogoKheops.test.js — Tests du composant LogoKheops (header)
import React from 'react';
import { render, screen } from '@testing-library/react';
import LogoKheops from '../index';

describe('LogoKheops', () => {
  it('se rend sans crash', () => {
    const { container } = render(<LogoKheops />);
    expect(container.firstChild).toBeTruthy();
  });

  it('affiche une image avec alt="Kheops 2"', () => {
    render(<LogoKheops />);
    const img = screen.getByAltText('Kheops 2');
    expect(img).toBeInTheDocument();
    expect(img.tagName).toBe('IMG');
  });

  it('applique la classe "logo-wrapper" au conteneur', () => {
    const { container } = render(<LogoKheops />);
    expect(container.querySelector('.logo-wrapper')).toBeInTheDocument();
  });

  it('applique la classe "logo" a l\'image', () => {
    render(<LogoKheops />);
    const img = screen.getByAltText('Kheops 2');
    expect(img).toHaveClass('logo');
  });
});
