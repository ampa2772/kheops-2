// speechService.test.js — Tests du service de synthese vocale

// Le service importe desormais le store Redux (import store from '../redux/store'),
// qui tire toute l'arborescence Redux (authSlice -> axios en ESM non transforme par Jest).
// On mocke le store pour isoler le service et eviter l'erreur de transform axios.
// getState() n'est utilise que par les handlers globaux mouseover/focusin, non testes ici.
jest.mock('../../redux/store', () => ({
  __esModule: true,
  default: {
    getState: jest.fn(() => ({ login: { user: { isSpeechEnabled: false } } })),
  },
}));

// Mock de window.speechSynthesis AVANT l'import du module
const mockSpeak = jest.fn();
const mockCancel = jest.fn();
const mockGetVoices = jest.fn().mockReturnValue([]);
const mockAddEventListener = jest.fn();
const mockRemoveEventListener = jest.fn();

// On doit definir speechSynthesis avant le require du module
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: mockSpeak,
    cancel: mockCancel,
    getVoices: mockGetVoices,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
  },
  writable: true,
  configurable: true,
});

// Mock SpeechSynthesisUtterance
global.SpeechSynthesisUtterance = jest.fn().mockImplementation((text) => ({
  text,
  lang: '',
  rate: 1,
  pitch: 1,
  volume: 1,
}));

describe('speechService', () => {
  let speechService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-import a chaque test pour un etat propre
    jest.isolateModules(() => {
      speechService = require('../speechService');
    });
  });

  // ===================== speak =====================
  describe('speak', () => {
    it('cree un SpeechSynthesisUtterance avec le texte', () => {
      speechService.speak('Bonjour');
      expect(global.SpeechSynthesisUtterance).toHaveBeenCalledWith('Bonjour');
    });

    it('appelle speechSynthesis.speak', () => {
      speechService.speak('Bonjour');
      expect(mockSpeak).toHaveBeenCalled();
    });

    it('ne fait rien si le texte est null', () => {
      speechService.speak(null);
      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('ne fait rien si le texte est vide', () => {
      speechService.speak('');
      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('appelle cancel avant de parler (stopSpeaking)', () => {
      speechService.speak('Bonjour');
      expect(mockCancel).toHaveBeenCalled();
      // cancel est appele avant speak
      const cancelOrder = mockCancel.mock.invocationCallOrder[0];
      const speakOrder = mockSpeak.mock.invocationCallOrder[0];
      expect(cancelOrder).toBeLessThan(speakOrder);
    });

    it('remplace " c/ " par " contre " dans le texte', () => {
      speechService.speak('Dupont c/ Martin');
      expect(global.SpeechSynthesisUtterance).toHaveBeenCalledWith('Dupont contre Martin');
    });
  });

  // ===================== stopSpeaking =====================
  describe('stopSpeaking', () => {
    it('appelle speechSynthesis.cancel()', () => {
      speechService.stopSpeaking();
      expect(mockCancel).toHaveBeenCalled();
    });
  });

  // ===================== initializeSpeechSynthesis =====================
  describe('initializeSpeechSynthesis', () => {
    it('appelle getVoices', () => {
      speechService.initializeSpeechSynthesis();
      expect(mockGetVoices).toHaveBeenCalled();
    });

    it('ajoute un listener voiceschanged', () => {
      speechService.initializeSpeechSynthesis();
      expect(mockAddEventListener).toHaveBeenCalledWith('voiceschanged', expect.any(Function));
    });
  });

  // ===================== useHoverToSpeak =====================
  describe('useHoverToSpeak', () => {
    it('retourne onMouseEnter et onMouseLeave', () => {
      const handlers = speechService.useHoverToSpeak('Texte', true);
      expect(handlers).toHaveProperty('onMouseEnter');
      expect(handlers).toHaveProperty('onMouseLeave');
      expect(typeof handlers.onMouseEnter).toBe('function');
      expect(typeof handlers.onMouseLeave).toBe('function');
    });

    it('onMouseEnter avec isEnabled=true appelle speak', () => {
      const handlers = speechService.useHoverToSpeak('Texte test', true);
      handlers.onMouseEnter();
      expect(mockSpeak).toHaveBeenCalled();
    });

    it('onMouseLeave avec isEnabled=true appelle stopSpeaking (cancel)', () => {
      const handlers = speechService.useHoverToSpeak('Texte test', true);
      handlers.onMouseLeave();
      expect(mockCancel).toHaveBeenCalled();
    });

    it('onMouseEnter avec isEnabled=false ne fait rien', () => {
      const handlers = speechService.useHoverToSpeak('Texte test', false);
      handlers.onMouseEnter();
      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('onMouseLeave avec isEnabled=false ne fait rien', () => {
      const handlers = speechService.useHoverToSpeak('Texte test', false);
      handlers.onMouseLeave();
      // cancel n'est appele que par speak() ou stopSpeaking() directement
      // Avec isEnabled=false, handleMouseLeave ne fait rien
      expect(mockCancel).not.toHaveBeenCalled();
    });
  });
});
