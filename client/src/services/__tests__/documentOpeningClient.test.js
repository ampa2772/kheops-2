import apiClient from '../apiClient';
import { detectCompanion, detectDesktopPlatform } from '../companion/companionClient';
import { isElectron } from '../electronBridge';
import {
  getDocumentOpeningAvailability,
  getDocumentOpeningPreference,
  getDocumentOpeningPreferences,
  getBrowserDocumentPreview,
  getTextDocumentPreview,
  resetDocumentOpeningPreference,
  resetDocumentOpeningPreferences,
  updateDocumentOpeningPreference,
  updateDocumentOpeningPreferences,
} from '../documentOpeningClient';
import { resolveDocumentOpeningDecision } from '../../constants/documentOpening';

jest.mock('../apiClient', () => ({
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));
jest.mock('../companion/companionClient', () => ({
  detectCompanion: jest.fn(),
  detectDesktopPlatform: jest.fn(),
}));
jest.mock('../electronBridge', () => ({ isElectron: jest.fn() }));

describe('documentOpeningClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isElectron.mockReturnValue(false);
    detectDesktopPlatform.mockReturnValue('windows');
  });

  it('lit, écrit et réinitialise la préférence via le contrat API', async () => {
    apiClient.get.mockResolvedValueOnce({ data: { preference: { mode: 'google_docs' } } });
    apiClient.put.mockResolvedValueOnce({ data: { preference: { mode: 'automatic' } } });
    apiClient.delete.mockResolvedValueOnce({ data: { preference: { mode: 'ask' } } });

    await expect(getDocumentOpeningPreferences()).resolves.toMatchObject({ mode: 'google_docs' });
    await expect(updateDocumentOpeningPreferences({ mode: 'automatic' })).resolves.toMatchObject({ mode: 'automatic' });
    await expect(resetDocumentOpeningPreferences()).resolves.toMatchObject({ mode: 'ask' });

    expect(apiClient.get).toHaveBeenCalledWith('/api/document-opening/preferences');
    expect(apiClient.put).toHaveBeenCalledWith('/api/document-opening/preferences', { mode: 'automatic' });
    expect(apiClient.delete).toHaveBeenCalledWith('/api/document-opening/preferences');
  });

  it('complète la disponibilité Word locale en sondant le compagnon', async () => {
    apiClient.get.mockResolvedValue({
      data: {
        preference: { mode: 'automatic' },
        methods: {
          kheops: { available: true },
          word_desktop: { available: null, requiresClientCheck: true },
          word_web: { available: false },
          google_docs: { available: true },
        },
        recommendedMode: 'google_docs',
      },
    });
    detectCompanion.mockResolvedValue(false);

    const result = await getDocumentOpeningAvailability({ documentId: 'doc-1', fileName: 'Acte.docx' });

    expect(apiClient.get).toHaveBeenCalledWith('/api/document-opening/availability', {
      params: { documentId: 'doc-1', fileName: 'Acte.docx' },
    });
    expect(detectCompanion).toHaveBeenCalledTimes(1);
    expect(result.methods.word_desktop.available).toBe(false);
    expect(result.methods.word_desktop.reason).toMatch(/compagnon/i);
  });

  it('lit, écrit et réinitialise une préférence propre au document sans appeler le défaut global', async () => {
    apiClient.get.mockResolvedValueOnce({ data: { documentId: 'doc/1', openingMode: 'kheops', configured: true } });
    apiClient.put.mockResolvedValueOnce({ data: { documentId: 'doc/1', openingMode: 'word_web', configured: true } });
    apiClient.delete.mockResolvedValueOnce({ data: { documentId: 'doc/1', openingMode: null, configured: false } });

    await expect(getDocumentOpeningPreference('doc/1')).resolves.toMatchObject({ openingMode: 'kheops' });
    await expect(updateDocumentOpeningPreference('doc/1', 'word_web')).resolves.toMatchObject({ openingMode: 'word_web' });
    await expect(resetDocumentOpeningPreference('doc/1')).resolves.toMatchObject({ configured: false });

    const path = '/api/document-opening/documents/doc%2F1';
    expect(apiClient.get).toHaveBeenCalledWith(path);
    expect(apiClient.put).toHaveBeenCalledWith(path, { openingMode: 'word_web' });
    expect(apiClient.delete).toHaveBeenCalledWith(path);
  });

  it('utilise directement le pont Electron lorsqu’il sait ouvrir le document', async () => {
    window.electron = { openDocument: jest.fn() };
    isElectron.mockReturnValue(true);
    apiClient.get.mockResolvedValue({
      data: {
        methods: {
          kheops: { available: true },
          word_desktop: { available: null, requiresClientCheck: true },
          word_web: { available: false },
          google_docs: { available: false },
        },
      },
    });

    const result = await getDocumentOpeningAvailability();
    expect(result.methods.word_desktop.available).toBe(true);
    expect(detectCompanion).not.toHaveBeenCalled();
    delete window.electron;
  });

  it('recommande Word pour le web après un contrôle local négatif sur un DOCX complexe', async () => {
    apiClient.get.mockResolvedValue({
      data: {
        preference: { mode: 'automatic' },
        methods: {
          kheops: { available: true },
          word_desktop: { available: null, requiresClientCheck: true },
          word_web: { available: true },
          google_docs: { available: true },
        },
        compatibility: { level: 'complex', warnings: ['Macros détectées.'] },
        recommendedMode: 'word_desktop',
      },
    });
    detectCompanion.mockResolvedValue(false);

    const result = await getDocumentOpeningAvailability({ documentId: 'doc-1' });

    expect(result.methods.word_desktop.available).toBe(false);
    expect(result.recommendedMode).toBe('word_web');
  });

  test.each([
    ['windows', true, 'kheops', 'kheops', true],
    ['windows', false, 'kheops', 'kheops', false],
    ['macos', false, 'kheops', 'kheops', false],
    ['windows', true, 'automatic', 'word_desktop', true],
    ['windows', false, 'automatic', 'kheops', false],
    ['macos', false, 'automatic', 'kheops', false],
  ])(
    'respecte la matrice DOCX sur %s (compagnon=%s, préférence=%s)',
    async (platform, companionAvailable, preferenceMode, expectedMode, desktopAvailable) => {
      detectDesktopPlatform.mockReturnValue(platform);
      apiClient.get.mockResolvedValue({
        data: {
          preference: { mode: preferenceMode, configured: true },
          format: { extension: '.docx', kind: 'word' },
          methods: {
            kheops: { available: true },
            word_desktop: { available: null, requiresClientCheck: true },
            word_web: { available: false },
            google_docs: { available: false },
          },
          compatibility: { level: 'complex', warnings: ['Macros détectées.'] },
          recommendedMode: 'word_desktop',
        },
      });
      detectCompanion.mockResolvedValue(companionAvailable);

      const result = await getDocumentOpeningAvailability({
        documentId: 'doc-matrix',
        fileName: 'Conclusions.docx',
      });
      const decision = resolveDocumentOpeningDecision({
        availability: result,
        preference: result.preference,
      });

      expect(result.methods.word_desktop.available).toBe(desktopAvailable);
      expect(result.recommendedMode).toBe(expectedMode);
      expect(decision).toEqual({ action: 'open', mode: expectedMode });
      expect(detectCompanion).toHaveBeenCalledTimes(platform === 'windows' ? 1 : 0);
    },
  );

  test.each([
    ['windows', true],
    ['windows', false],
    ['macos', true],
  ])(
    'garde Kheops en automatique pour un DOCX simple sur %s (réponse compagnon=%s)',
    async (platform, companionAnswer) => {
      detectDesktopPlatform.mockReturnValue(platform);
      detectCompanion.mockResolvedValue(companionAnswer);
      apiClient.get.mockResolvedValue({
        data: {
          preference: { mode: 'automatic', configured: true },
          format: { extension: 'docx', kind: 'word' },
          methods: {
            kheops: { available: true },
            word_desktop: { available: null, requiresClientCheck: true },
            word_web: { available: false },
            google_docs: { available: false },
          },
          compatibility: { level: 'complete', warnings: [] },
          recommendedMode: 'kheops',
        },
      });

      const result = await getDocumentOpeningAvailability({
        documentId: `docx-simple-${platform}-${companionAnswer}`,
        fileName: 'Courrier simple.docx',
      });
      const decision = resolveDocumentOpeningDecision({
        availability: result,
        preference: result.preference,
      });

      expect(result.recommendedMode).toBe('kheops');
      expect(decision).toEqual({ action: 'open', mode: 'kheops' });
      expect(detectCompanion).toHaveBeenCalledTimes(platform === 'windows' ? 1 : 0);
    },
  );

  test.each([
    ['windows', true],
    ['windows', false],
    ['macos', true],
  ])(
    'ouvre toujours un ancien DOC avec Kheops sur %s (réponse compagnon=%s)',
    async (platform, companionAnswer) => {
      detectDesktopPlatform.mockReturnValue(platform);
      detectCompanion.mockResolvedValue(companionAnswer);
      apiClient.get.mockResolvedValue({
        data: {
          preference: { mode: 'kheops', configured: true },
          format: {
            extension: 'doc',
            kind: 'legacy-word',
            conversionRequired: true,
            conversionTarget: 'docx',
            originalPreserved: true,
          },
          methods: {
            kheops: {
              available: true,
              conversionRequired: true,
              conversionTarget: 'docx',
              originalPreserved: true,
            },
            word_desktop: { available: null, requiresClientCheck: true },
            word_web: { available: false },
            google_docs: { available: false },
          },
          compatibility: { level: 'partial', warnings: ['Conversion contrôlée.'] },
          recommendedMode: 'word_desktop',
        },
      });

      const result = await getDocumentOpeningAvailability({
        documentId: `doc-kheops-${platform}-${companionAnswer}`,
        fileName: 'Conclusions historiques.doc',
      });
      const decision = resolveDocumentOpeningDecision({
        availability: result,
        preference: result.preference,
      });

      expect(result.recommendedMode).toBe('kheops');
      expect(result.methods.kheops).toEqual(expect.objectContaining({
        available: true,
        conversionRequired: true,
        originalPreserved: true,
      }));
      expect(decision).toEqual({ action: 'open', mode: 'kheops' });
      expect(detectCompanion).toHaveBeenCalledTimes(platform === 'windows' ? 1 : 0);
    },
  );

  test.each([
    ['windows', true, 'word_desktop'],
    ['windows', false, 'kheops'],
    ['macos', true, 'kheops'],
  ])(
    'applique le repli automatique DOC sur %s (réponse compagnon=%s)',
    async (platform, companionAnswer, expectedMode) => {
      detectDesktopPlatform.mockReturnValue(platform);
      detectCompanion.mockResolvedValue(companionAnswer);
      apiClient.get.mockResolvedValue({
        data: {
          preference: { mode: 'automatic', configured: true },
          format: {
            extension: 'doc',
            kind: 'legacy-word',
            conversionRequired: true,
            conversionTarget: 'docx',
            originalPreserved: true,
          },
          methods: {
            kheops: {
              available: true,
              conversionRequired: true,
              originalPreserved: true,
            },
            word_desktop: { available: null, requiresClientCheck: true },
            word_web: { available: false },
            google_docs: { available: false },
          },
          compatibility: { level: 'partial', warnings: ['Conversion contrôlée.'] },
          recommendedMode: 'word_desktop',
        },
      });

      const result = await getDocumentOpeningAvailability({
        documentId: `doc-auto-${platform}-${companionAnswer}`,
        fileName: 'Conclusions historiques.doc',
      });
      const decision = resolveDocumentOpeningDecision({
        availability: result,
        preference: result.preference,
      });

      expect(result.recommendedMode).toBe(expectedMode);
      expect(decision).toEqual({ action: 'open', mode: expectedMode });
      expect(detectCompanion).toHaveBeenCalledTimes(platform === 'windows' ? 1 : 0);
    },
  );

  test.each([
    ['Conclusions.docx', 'windows', true, 'word_desktop', 'open'],
    ['Conclusions.docx', 'windows', false, 'word_desktop', 'choose'],
    ['Conclusions.docx', 'macos', true, 'word_desktop', 'choose'],
    ['Conclusions historiques.doc', 'windows', true, 'word_desktop', 'open'],
    ['Conclusions historiques.doc', 'windows', false, 'word_desktop', 'choose'],
    ['Conclusions historiques.doc', 'macos', true, 'word_desktop', 'choose'],
  ])(
    'n’autorise Word Desktop pour %s sur %s que si le compagnon Windows est disponible',
    async (fileName, platform, companionAnswer, preferenceMode, expectedAction) => {
      const legacy = /\.doc$/i.test(fileName);
      detectDesktopPlatform.mockReturnValue(platform);
      detectCompanion.mockResolvedValue(companionAnswer);
      apiClient.get.mockResolvedValue({
        data: {
          preference: { mode: preferenceMode, configured: true },
          format: legacy
            ? { extension: 'doc', kind: 'legacy-word', conversionRequired: true }
            : { extension: 'docx', kind: 'word' },
          methods: {
            kheops: { available: true, ...(legacy ? { conversionRequired: true } : {}) },
            word_desktop: { available: null, requiresClientCheck: true },
            word_web: { available: false },
            google_docs: { available: false },
          },
          compatibility: { level: legacy ? 'partial' : 'complete', warnings: [] },
          recommendedMode: 'word_desktop',
        },
      });

      const result = await getDocumentOpeningAvailability({
        documentId: `doc-${platform}-${legacy ? 'legacy' : 'modern'}`,
        fileName,
      });
      const decision = resolveDocumentOpeningDecision({
        availability: result,
        preference: result.preference,
      });

      const wordAvailable = platform === 'windows' && companionAnswer;
      expect(result.methods.word_desktop.available).toBe(wordAvailable);
      if (expectedAction === 'open') {
        expect(decision).toEqual({ action: 'open', mode: 'word_desktop' });
      } else {
        expect(decision).toMatchObject({
          action: 'choose',
          reason: 'preferred_unavailable',
          unavailableMode: 'word_desktop',
          suggestedMode: 'kheops',
        });
      }
      expect(detectCompanion).toHaveBeenCalledTimes(platform === 'windows' ? 1 : 0);
    },
  );

  it('ne contourne jamais une interdiction du cabinet avec un compagnon présent', async () => {
    isElectron.mockReturnValue(true);
    window.electron = { openDocument: jest.fn() };
    apiClient.get.mockResolvedValue({
      data: {
        methods: {
          kheops: { available: true },
          word_desktop: {
            available: false,
            requiresClientCheck: true,
            reason: 'CABINET_METHOD_ENFORCED',
          },
          word_web: { available: false },
          google_docs: { available: false },
        },
      },
    });

    const result = await getDocumentOpeningAvailability();
    expect(result.methods.word_desktop.available).toBe(false);
    expect(result.methods.word_desktop.reason).toMatch(/cabinet impose/i);
    expect(detectCompanion).not.toHaveBeenCalled();
    delete window.electron;
  });

  it('refuse un mode inconnu avant tout appel réseau', async () => {
    await expect(updateDocumentOpeningPreferences({ mode: 'paint' })).rejects.toThrow(/inconnue/i);
    expect(apiClient.put).not.toHaveBeenCalled();
  });

  it('récupère l’aperçu TXT comme Blob authentifié sans URL publique', async () => {
    const blob = new Blob(['Bonjour'], { type: 'text/plain' });
    const controller = new AbortController();
    apiClient.get.mockResolvedValueOnce({
      data: blob,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-document-read-only': 'true' },
    });

    await expect(getTextDocumentPreview('doc/1', { signal: controller.signal })).resolves.toEqual({
      blob,
      contentType: 'text/plain; charset=utf-8',
      readOnly: true,
    });
    expect(apiClient.get).toHaveBeenCalledWith(
      '/api/document-opening/documents/doc%2F1/text-preview',
      { responseType: 'blob', signal: controller.signal },
    );
  });

  test.each([
    ['pdf', 'pdf-preview', 'application/pdf'],
    ['image', 'image-preview', 'image/png'],
  ])('récupère l aperçu %s via la route authentifiée dédiée', async (kind, suffix, contentType) => {
    const blob = new Blob(['contenu'], { type: contentType });
    const controller = new AbortController();
    apiClient.get.mockResolvedValueOnce({
      data: blob,
      headers: {
        'content-type': contentType,
        'content-disposition': 'inline; filename="preuve"',
      },
    });

    await expect(getBrowserDocumentPreview('doc/1', kind, { signal: controller.signal }))
      .resolves.toEqual({
        blob,
        contentType,
        contentDisposition: 'inline; filename="preuve"',
      });
    expect(apiClient.get).toHaveBeenCalledWith(
      `/api/document-opening/documents/doc%2F1/${suffix}`,
      { responseType: 'blob', signal: controller.signal },
    );
  });

  it('refuse localement un type d aperçu inconnu', async () => {
    await expect(getBrowserDocumentPreview('doc-1', 'html')).rejects.toThrow(/inconnu/i);
    expect(apiClient.get).not.toHaveBeenCalled();
  });
});
