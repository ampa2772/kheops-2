import {
  isElectron,
  hasElectronAPI,
  getElectron,
  getElectronAPI,
  getElectronCrypto,
} from '../electronBridge';

describe('electronBridge — detection Electron / mode web', () => {
  afterEach(() => {
    delete window.electron;
    delete window.electronAPI;
  });

  describe('mode web (aucun pont IPC)', () => {
    test('isElectron() = false', () => {
      expect(isElectron()).toBe(false);
    });
    test('hasElectronAPI() = false', () => {
      expect(hasElectronAPI()).toBe(false);
    });
    test('les accesseurs renvoient null sans planter', () => {
      expect(getElectron()).toBeNull();
      expect(getElectronAPI()).toBeNull();
      expect(getElectronCrypto()).toBeNull();
    });
  });

  describe('mode Electron', () => {
    test('isElectron() = true quand window.electron present', () => {
      window.electron = {};
      expect(isElectron()).toBe(true);
      expect(getElectron()).toBe(window.electron);
    });
    test('getElectronCrypto() renvoie le module crypto quand present', () => {
      const crypto = { encryptString: jest.fn() };
      window.electron = { crypto };
      expect(getElectronCrypto()).toBe(crypto);
    });
    test('getElectronCrypto() = null si window.electron sans crypto', () => {
      window.electron = {};
      expect(getElectronCrypto()).toBeNull();
    });
    test('hasElectronAPI()/getElectronAPI() suivent window.electronAPI', () => {
      const api = { loginGoogle: jest.fn() };
      window.electronAPI = api;
      expect(hasElectronAPI()).toBe(true);
      expect(getElectronAPI()).toBe(api);
    });
  });
});
