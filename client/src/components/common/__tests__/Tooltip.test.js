// Tooltip.test.js — Tests du composant Tooltip
import React from 'react';
import { screen, fireEvent, act } from '@testing-library/react';

// Mocks globaux requis par rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

// Mock speechService
jest.mock('../../../services/speechService', () => ({
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
}));

// Mock createPortal pour rendre le tooltip dans le meme arbre DOM
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node) => node,
}));

import { renderWithProviders } from '../../../test-utils';
import Tooltip from '../Tooltip';
import { speak, stopSpeaking } from '../../../services/speechService';

describe('Tooltip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderTooltip = (props = {}, speechEnabled = false) => {
    const defaultProps = {
      text: 'Mon tooltip',
      children: <button>Bouton</button>,
      ...props,
    };
    return renderWithProviders(
      <Tooltip {...defaultProps} />,
      {
        preloadedState: {
          login: { user: { isSpeechEnabled: speechEnabled } },
        },
      }
    );
  };

  // --- Rendu conditionnel ---
  it('rend seulement les children quand disabled=true', () => {
    renderTooltip({ disabled: true });
    expect(screen.getByText('Bouton')).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('rend seulement les children quand text est vide', () => {
    renderTooltip({ text: '' });
    expect(screen.getByText('Bouton')).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('rend seulement les children quand text est null', () => {
    renderTooltip({ text: null });
    expect(screen.getByText('Bouton')).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  // --- Wrapper et structure ---
  it('rend le wrapper k-tooltip-wrapper quand actif', () => {
    const { container } = renderTooltip({ text: 'Info' });
    expect(container.querySelector('.k-tooltip-wrapper')).toBeInTheDocument();
  });

  it('ajoute aria-describedby aux children via cloneElement', () => {
    renderTooltip({ text: 'Info' });
    const button = screen.getByText('Bouton');
    expect(button).toHaveAttribute('aria-describedby');
  });

  it('rend un element avec role="tooltip"', () => {
    renderTooltip({ text: 'Info' });
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('le tooltip contient le texte fourni', () => {
    renderTooltip({ text: 'Aide contextuelle' });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Aide contextuelle');
  });

  // --- Visibilite avec timer ---
  it('le tooltip devient visible au mouseEnter apres le delai', () => {
    renderTooltip({ text: 'Info', showDelay: 300 });
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    fireEvent.mouseEnter(wrapper);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveClass('k-tooltip--visible');
  });

  it('le tooltip se masque au mouseLeave', () => {
    renderTooltip({ text: 'Info', showDelay: 300 });
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });

    fireEvent.mouseLeave(wrapper);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).not.toHaveClass('k-tooltip--visible');
  });

  // --- Positionnement ---
  it('applique la classe de positionnement par defaut (top)', () => {
    renderTooltip({ text: 'Info' });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveClass('k-tooltip--top');
  });

  it('applique la classe de positionnement "bottom"', () => {
    renderTooltip({ text: 'Info', position: 'bottom' });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveClass('k-tooltip--bottom');
  });

  // --- Speech integration ---
  it('appelle speak() au mouseEnter quand isSpeechEnabled=true', () => {
    renderTooltip({ text: 'Info lecture' }, true);
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    fireEvent.mouseEnter(wrapper);
    expect(speak).toHaveBeenCalledWith('Info lecture');
  });

  it('utilise speechText au lieu de text si fourni', () => {
    renderTooltip({ text: 'Info', speechText: 'Texte vocal alternatif' }, true);
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    fireEvent.mouseEnter(wrapper);
    expect(speak).toHaveBeenCalledWith('Texte vocal alternatif');
  });

  it('appelle stopSpeaking() au mouseLeave quand isSpeechEnabled=true', () => {
    renderTooltip({ text: 'Info' }, true);
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    fireEvent.mouseLeave(wrapper);
    expect(stopSpeaking).toHaveBeenCalled();
  });

  it('le tooltip se masque au click sur le wrapper', () => {
    renderTooltip({ text: 'Info', showDelay: 300 });
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toHaveClass('k-tooltip--visible');

    fireEvent.click(wrapper);
    expect(screen.getByRole('tooltip')).not.toHaveClass('k-tooltip--visible');
  });

  it('n\'appelle PAS speak() quand isSpeechEnabled=false', () => {
    renderTooltip({ text: 'Info' }, false);
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    fireEvent.mouseEnter(wrapper);
    expect(speak).not.toHaveBeenCalled();
  });

  // --- Click lock (correctif race condition re-render) ---

  it('ne reaffiche PAS le tooltip si mouseEnter survient juste apres un click (race condition re-render)', () => {
    renderTooltip({ text: 'Info', showDelay: 300 });
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    // 1. Hover -> tooltip visible
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toHaveClass('k-tooltip--visible');

    // 2. Click -> tooltip masque, verrou active
    fireEvent.click(wrapper);
    expect(screen.getByRole('tooltip')).not.toHaveClass('k-tooltip--visible');

    // 3. Simuler race condition : mouseEnter se declenche apres re-render React
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });

    // Le tooltip doit rester masque car le verrou est actif
    expect(screen.getByRole('tooltip')).not.toHaveClass('k-tooltip--visible');
  });

  it('reaffiche le tooltip normalement apres click + mouseLeave + mouseEnter', () => {
    renderTooltip({ text: 'Info', showDelay: 300 });
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    // 1. Hover -> tooltip visible
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toHaveClass('k-tooltip--visible');

    // 2. Click -> tooltip masque, verrou active
    fireEvent.click(wrapper);
    expect(screen.getByRole('tooltip')).not.toHaveClass('k-tooltip--visible');

    // 3. Mouse quitte l'element -> verrou desactive
    fireEvent.mouseLeave(wrapper);

    // 4. Mouse revient -> tooltip doit reapparaitre normalement
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toHaveClass('k-tooltip--visible');
  });

  it('le click lock empeche speak() lors du mouseEnter post-click', () => {
    renderTooltip({ text: 'Info vocale' }, true);
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    // Click pour activer le verrou
    fireEvent.click(wrapper);
    speak.mockClear();

    // Simuler race condition : mouseEnter pendant le verrou
    fireEvent.mouseEnter(wrapper);

    // speak() ne doit PAS etre appele car show() retourne immediatement
    expect(speak).not.toHaveBeenCalled();
  });

  it('le click lock est independant entre clics multiples', () => {
    renderTooltip({ text: 'Info', showDelay: 300 });
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    // Premier cycle : click -> mouseLeave -> mouseEnter -> fonctionne
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });
    fireEvent.click(wrapper);
    fireEvent.mouseLeave(wrapper);
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toHaveClass('k-tooltip--visible');

    // Deuxieme cycle : click -> mouseEnter (sans leave) -> reste masque
    fireEvent.click(wrapper);
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).not.toHaveClass('k-tooltip--visible');

    // Puis leave + re-enter -> fonctionne a nouveau
    fireEvent.mouseLeave(wrapper);
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toHaveClass('k-tooltip--visible');
  });

  // --- document.mousemove (correctif overlay bloquant onMouseLeave) ---

  it('enregistre un listener document.mousemove apres le click', () => {
    const addSpy = jest.spyOn(document, 'addEventListener');
    renderTooltip({ text: 'Info', showDelay: 300 });
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    fireEvent.click(wrapper);

    expect(addSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    addSpy.mockRestore();
  });

  it('le mousemove en dehors du wrapper deverrouille le click lock (simule overlay)', () => {
    renderTooltip({ text: 'Info', showDelay: 300 });
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    // Mock getBoundingClientRect pour le wrapper
    wrapper.getBoundingClientRect = jest.fn(() => ({
      top: 10, bottom: 40, left: 10, right: 60, width: 50, height: 30,
    }));

    // 1. Hover -> tooltip visible
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toHaveClass('k-tooltip--visible');

    // 2. Click -> tooltip masque, verrou active, listener mousemove enregistre
    fireEvent.click(wrapper);
    expect(screen.getByRole('tooltip')).not.toHaveClass('k-tooltip--visible');

    // 3. Simuler un mousemove EN DEHORS du wrapper (comme si overlay bloquait mouseLeave)
    fireEvent.mouseMove(document, { clientX: 200, clientY: 200 });

    // 4. Le verrou doit etre desactive, mouseEnter doit fonctionner
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).toHaveClass('k-tooltip--visible');
  });

  it('le mousemove a l\'interieur du wrapper maintient le click lock actif', () => {
    renderTooltip({ text: 'Info', showDelay: 300 });
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    // Mock getBoundingClientRect pour le wrapper
    wrapper.getBoundingClientRect = jest.fn(() => ({
      top: 10, bottom: 40, left: 10, right: 60, width: 50, height: 30,
    }));

    // 1. Hover -> tooltip visible
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });

    // 2. Click -> tooltip masque, verrou active
    fireEvent.click(wrapper);
    expect(screen.getByRole('tooltip')).not.toHaveClass('k-tooltip--visible');

    // 3. Simuler un mousemove A L'INTERIEUR du wrapper
    fireEvent.mouseMove(document, { clientX: 30, clientY: 25 });

    // 4. Le verrou doit rester actif, mouseEnter ne doit pas reafficher
    fireEvent.mouseEnter(wrapper);
    act(() => { jest.advanceTimersByTime(300); });
    expect(screen.getByRole('tooltip')).not.toHaveClass('k-tooltip--visible');
  });

  it('retire le listener document.mousemove au demontage', () => {
    const removeSpy = jest.spyOn(document, 'removeEventListener');
    const { unmount } = renderTooltip({ text: 'Info', showDelay: 300 });
    const wrapper = screen.getByText('Bouton').closest('.k-tooltip-wrapper');

    // Click pour enregistrer le listener
    fireEvent.click(wrapper);
    removeSpy.mockClear();

    // Demonter le composant
    unmount();

    // Le listener doit avoir ete retire
    expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    removeSpy.mockRestore();
  });
});
