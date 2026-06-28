// FullScreenLoader.test.js — Tests du composant FullScreenLoader
import React from 'react';
import { render, screen } from '@testing-library/react';
import FullScreenLoader from '../FullScreenLoader';

describe('FullScreenLoader', () => {
  it('se rend sans crash', () => {
    const { container } = render(<FullScreenLoader />);
    expect(container.firstChild).toBeTruthy();
  });

  it('affiche l\'overlay avec la classe fs-loader__overlay', () => {
    const { container } = render(<FullScreenLoader />);
    expect(container.querySelector('.fs-loader__overlay')).toBeInTheDocument();
  });

  it('affiche le spinner avec la classe fs-loader__spinner', () => {
    const { container } = render(<FullScreenLoader />);
    expect(container.querySelector('.fs-loader__spinner')).toBeInTheDocument();
  });

  it('ne rend aucun texte visible', () => {
    const { container } = render(<FullScreenLoader />);
    expect(container.textContent).toBe('');
  });
});
