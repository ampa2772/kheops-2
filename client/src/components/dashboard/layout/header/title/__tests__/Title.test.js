// Title.test.js — Tests du composant Title (header)
import React from 'react';
import { render, screen } from '@testing-library/react';
import Title from '../index';

describe('Title', () => {
  it('rend le titre "KHEOPS 2" dans un h1', () => {
    render(<Title />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('KHEOPS 2');
  });

  it('applique la classe CSS "title"', () => {
    render(<Title />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveClass('title');
  });
});
