// Tests du service compagnon (mode web).
// On mocke apiClient (pour ne pas tirer le store/axios reel) et fetch.

jest.mock('../../apiClient', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import {
  detectCompanion,
  getPresence,
  getCompanionInstallerUrl,
  getCompanionInstallerInfo,
  COMPANION_BASE,
  COMPANION_HEADER,
} from '../companionClient';

describe('companionClient.detectCompanion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    delete global.fetch;
  });

  test('compagnon present : /health repond app=kheops-companion -> true + presence "present"', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, app: 'kheops-companion', version: '1.0.0' }),
    });

    const present = await detectCompanion();

    expect(present).toBe(true);
    expect(getPresence()).toBe('present');
    // L'appel cible bien le loopback avec l'en-tete anti-CSRF.
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe(`${COMPANION_BASE}/health`);
    expect(opts.headers[COMPANION_HEADER]).toBe('1');
  });

  test('compagnon absent : fetch rejette (port ferme) -> false + presence "absent"', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Failed to fetch'));

    const present = await detectCompanion();

    expect(present).toBe(false);
    expect(getPresence()).toBe('absent');
  });

  test('reponse inattendue (autre app) -> false', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, app: 'autre-chose' }),
    });
    const present = await detectCompanion();
    expect(present).toBe(false);
    expect(getPresence()).toBe('absent');
  });
});

describe('companionClient.getCompanionInstallerUrl', () => {
  const setPlatform = (platform) => {
    Object.defineProperty(window.navigator, 'userAgentData', {
      configurable: true,
      value: { platform },
    });
  };

  afterEach(() => {
    try { delete window.__KHEOPS_CONFIG__; } catch (_e) {}
    try { delete window.navigator.userAgentData; } catch (_e) {}
  });

  test('URL par defaut = installeur du COMPAGNON (et non l ancien installeur complet)', () => {
    setPlatform('Windows');
    const url = getCompanionInstallerUrl();
    expect(url).toMatch(/KHEOPS2-Companion-Setup\.exe$/);
    expect(url).not.toMatch(/KHEOPS2-Setup\.exe$/);
  });

  test('surcouche runtime via window.__KHEOPS_CONFIG__', () => {
    setPlatform('Windows');
    window.__KHEOPS_CONFIG__ = { companionInstallerUrl: 'https://example.test/Companion.exe' };
    expect(getCompanionInstallerUrl()).toBe('https://example.test/Companion.exe');
  });

  test('macOS ne reçoit jamais le faux installateur .exe Windows', () => {
    setPlatform('macOS');
    window.__KHEOPS_CONFIG__ = { companionInstallerUrl: 'https://example.test/Companion.exe' };
    const installer = getCompanionInstallerInfo();
    expect(installer.platform).toBe('macos');
    expect(installer.available).toBe(false);
    expect(installer.url).toBeNull();
    expect(installer.unavailableReason).toMatch(/macOS/i);
  });

  test('macOS utilise uniquement son artefact explicitement configuré', () => {
    setPlatform('macOS');
    window.__KHEOPS_CONFIG__ = {
      companionInstallerUrl: 'https://example.test/Companion.exe',
      companionInstallerUrlMacos: 'https://example.test/Companion.dmg',
    };
    const installer = getCompanionInstallerInfo();
    expect(installer.available).toBe(true);
    expect(installer.url).toBe('https://example.test/Companion.dmg');
    expect(installer.fileName).toMatch(/\.dmg$/i);
  });
});
