// HoverToSpeak.test.js — Tests du composant HoverToSpeak
import React from 'react';
import { screen, fireEvent } from '@testing-library/react';

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

import { renderWithProviders } from '../../../test-utils';
import HoverToSpeak from '../HoverToSpeak';
import { speak, stopSpeaking } from '../../../services/speechService';

describe('HoverToSpeak', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderComponent = (speechEnabled = true, text = 'Texte a lire') => {
    return renderWithProviders(
      <HoverToSpeak textToSpeak={text}>
        <span>Contenu enfant</span>
      </HoverToSpeak>,
      {
        preloadedState: {
          login: { user: { isSpeechEnabled: speechEnabled } },
        },
      }
    );
  };

  it('rend les children', () => {
    renderComponent();
    expect(screen.getByText('Contenu enfant')).toBeInTheDocument();
  });

  it('appelle speak() apres 500ms au mouseEnter quand isSpeechEnabled=true', () => {
    renderComponent(true, 'Bonjour');
    const wrapper = screen.getByText('Contenu enfant').parentElement;

    fireEvent.mouseEnter(wrapper);
    expect(speak).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    expect(speak).toHaveBeenCalledWith('Bonjour');
    expect(speak).toHaveBeenCalledTimes(1);
  });

  it('n\'appelle PAS speak() avant 500ms', () => {
    renderComponent(true, 'Test');
    const wrapper = screen.getByText('Contenu enfant').parentElement;

    fireEvent.mouseEnter(wrapper);
    jest.advanceTimersByTime(400);
    expect(speak).not.toHaveBeenCalled();
  });

  it('appelle stopSpeaking() au mouseLeave quand isSpeechEnabled=true', () => {
    renderComponent(true, 'Test');
    const wrapper = screen.getByText('Contenu enfant').parentElement;

    fireEvent.mouseEnter(wrapper);
    jest.advanceTimersByTime(500);
    fireEvent.mouseLeave(wrapper);

    expect(stopSpeaking).toHaveBeenCalledTimes(1);
  });

  it('annule le timer au mouseLeave avant expiration', () => {
    renderComponent(true, 'Test');
    const wrapper = screen.getByText('Contenu enfant').parentElement;

    fireEvent.mouseEnter(wrapper);
    jest.advanceTimersByTime(200); // pas encore expire
    fireEvent.mouseLeave(wrapper);

    jest.advanceTimersByTime(500); // avancer au-dela
    expect(speak).not.toHaveBeenCalled(); // timer annule
  });

  it('ne fait rien au mouseEnter quand isSpeechEnabled=false', () => {
    renderComponent(false, 'Ne devrait pas parler');
    const wrapper = screen.getByText('Contenu enfant').parentElement;

    fireEvent.mouseEnter(wrapper);
    jest.advanceTimersByTime(1000);

    expect(speak).not.toHaveBeenCalled();
  });

  it('ne fait rien au mouseLeave quand isSpeechEnabled=false', () => {
    renderComponent(false);
    const wrapper = screen.getByText('Contenu enfant').parentElement;

    fireEvent.mouseLeave(wrapper);
    expect(stopSpeaking).not.toHaveBeenCalled();
  });

  it('rend un div wrapper avec display inline-block', () => {
    renderComponent();
    const wrapper = screen.getByText('Contenu enfant').parentElement;
    expect(wrapper.style.display).toBe('inline-block');
  });
});
