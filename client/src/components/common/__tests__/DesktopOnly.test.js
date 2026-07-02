import React from 'react';
import { render, screen } from '@testing-library/react';
import DesktopOnly from '../DesktopOnly';

describe('DesktopOnly', () => {
  afterEach(() => {
    delete window.electron;
  });

  test('rend les enfants en mode Electron', () => {
    window.electron = {};
    render(
      <DesktopOnly>
        <span>desktop-feature</span>
      </DesktopOnly>
    );
    expect(screen.queryByText('desktop-feature')).toBeTruthy();
  });

  test('ne rend rien en mode web (fallback null par defaut)', () => {
    render(
      <DesktopOnly>
        <span>desktop-feature</span>
      </DesktopOnly>
    );
    expect(screen.queryByText('desktop-feature')).toBeNull();
  });

  test('rend le fallback en mode web', () => {
    render(
      <DesktopOnly fallback={<span>web-fallback</span>}>
        <span>desktop-feature</span>
      </DesktopOnly>
    );
    expect(screen.queryByText('desktop-feature')).toBeNull();
    expect(screen.queryByText('web-fallback')).toBeTruthy();
  });
});
