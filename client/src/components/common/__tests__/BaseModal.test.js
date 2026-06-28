// BaseModal.test.js — Tests du composant BaseModal
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BaseModal from '../BaseModal';

describe('BaseModal', () => {
  // --- Rendu conditionnel ---
  it('ne rend rien quand isOpen=false', () => {
    const { container } = render(
      <BaseModal isOpen={false} onClose={jest.fn()}>
        <p>Contenu</p>
      </BaseModal>
    );
    expect(container.firstChild).toBeNull();
  });

  it('rend l\'overlay et les children quand isOpen=true', () => {
    render(
      <BaseModal isOpen={true} onClose={jest.fn()}>
        <p>Contenu modal</p>
      </BaseModal>
    );
    expect(screen.getByText('Contenu modal')).toBeInTheDocument();
  });

  it('isOpen est true par defaut (prop optionnelle)', () => {
    render(
      <BaseModal onClose={jest.fn()}>
        <p>Visible par defaut</p>
      </BaseModal>
    );
    expect(screen.getByText('Visible par defaut')).toBeInTheDocument();
  });

  // --- Classes CSS ---
  it('applique la classe k-modal-overlay sur l\'overlay', () => {
    const { container } = render(
      <BaseModal onClose={jest.fn()}>
        <p>Test</p>
      </BaseModal>
    );
    expect(container.querySelector('.k-modal-overlay')).toBeInTheDocument();
  });

  it('applique overlayClassName en plus de k-modal-overlay', () => {
    const { container } = render(
      <BaseModal onClose={jest.fn()} overlayClassName="mon-overlay-custom">
        <p>Test</p>
      </BaseModal>
    );
    const overlay = container.firstChild;
    expect(overlay).toHaveClass('k-modal-overlay');
    expect(overlay).toHaveClass('mon-overlay-custom');
  });

  it('applique contentClassName sur le div de contenu', () => {
    const { container } = render(
      <BaseModal onClose={jest.fn()} contentClassName="mon-contenu">
        <p>Test</p>
      </BaseModal>
    );
    expect(container.querySelector('.mon-contenu')).toBeInTheDocument();
  });

  it('n\'applique pas de classe sur le div de contenu si contentClassName est vide', () => {
    const { container } = render(
      <BaseModal onClose={jest.fn()}>
        <p>Test</p>
      </BaseModal>
    );
    const overlay = container.querySelector('.k-modal-overlay');
    const contentDiv = overlay.firstChild;
    expect(contentDiv.className).toBeFalsy();
  });

  // --- Click outside / inside ---
  it('appelle onClose au clic a l\'exterieur du contenu', () => {
    const onClose = jest.fn();
    const { container } = render(
      <BaseModal onClose={onClose}>
        <p>Contenu interne</p>
      </BaseModal>
    );
    // Click sur l'overlay (exterieur du contenu)
    const overlay = container.querySelector('.k-modal-overlay');
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('n\'appelle PAS onClose au clic a l\'interieur du contenu', () => {
    const onClose = jest.fn();
    render(
      <BaseModal onClose={onClose}>
        <p>Contenu interne</p>
      </BaseModal>
    );
    const contenu = screen.getByText('Contenu interne');
    fireEvent.mouseDown(contenu);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ne crash pas au clic exterieur sans onClose', () => {
    const { container } = render(
      <BaseModal>
        <p>Sans onClose</p>
      </BaseModal>
    );
    const overlay = container.querySelector('.k-modal-overlay');
    // Ne devrait pas throw
    expect(() => fireEvent.mouseDown(overlay)).not.toThrow();
  });

  // --- Children ---
  it('rend les children passes en props', () => {
    render(
      <BaseModal onClose={jest.fn()}>
        <div data-testid="child-1">Premier enfant</div>
        <div data-testid="child-2">Second enfant</div>
      </BaseModal>
    );
    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
  });

  // --- Nettoyage event listener ---
  it('retire l\'event listener mousedown au demontage', () => {
    const addSpy = jest.spyOn(document, 'addEventListener');
    const removeSpy = jest.spyOn(document, 'removeEventListener');

    const { unmount } = render(
      <BaseModal onClose={jest.fn()}>
        <p>Test cleanup</p>
      </BaseModal>
    );

    expect(addSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('n\'attache pas d\'event listener quand isOpen=false', () => {
    const addSpy = jest.spyOn(document, 'addEventListener');

    render(
      <BaseModal isOpen={false} onClose={jest.fn()}>
        <p>Ferme</p>
      </BaseModal>
    );

    // addEventListener n'est pas appele pour mousedown (car isOpen=false → return null)
    const mousedownCalls = addSpy.mock.calls.filter(([event]) => event === 'mousedown');
    expect(mousedownCalls).toHaveLength(0);

    addSpy.mockRestore();
  });
});
