import {
  DOCUMENT_OPENING_MODES,
  getAvailableDocumentOpeningActions,
  isDocumentPreferenceMode,
  chooseRecommendedDocumentEditor,
  normalizeDocumentOpeningAvailability,
  normalizeDocumentOpeningPreference,
  resolveDocumentOpeningDecision,
} from '../documentOpening';

const availability = (overrides = {}) => ({
  preference: { mode: 'ask', rememberChoice: false },
  methods: {
    kheops: { available: true },
    word_desktop: { available: false, reason: 'Compagnon absent.' },
    word_web: { available: true },
    google_docs: { available: false, reason: 'Google non connecté.' },
    ...overrides,
  },
  recommendedMode: 'word_web',
});

describe('documentOpening constants', () => {
  it('normalise les enveloppes de préférence du backend', () => {
    expect(normalizeDocumentOpeningPreference({ preference: { mode: 'google_docs', lastUsedMode: 'kheops' } }))
      .toMatchObject({ mode: 'google_docs', lastUsedMode: 'kheops' });
    expect(normalizeDocumentOpeningPreference({ mode: 'ancien_mode' }).mode).toBe('ask');
  });

  it('préserve available=null tant que le contrôle client est en attente', () => {
    const result = normalizeDocumentOpeningAvailability(availability({
      word_desktop: { available: null, requiresClientCheck: true },
    }));
    expect(result.methods.word_desktop).toMatchObject({
      available: null,
      requiresClientCheck: true,
      reason: null,
    });
  });

  it('traduit les codes techniques du serveur en explications lisibles', () => {
    const result = normalizeDocumentOpeningAvailability(availability({
      google_docs: { available: false, reason: 'GOOGLE_ACCOUNT_REQUIRED' },
    }));
    expect(result.methods.google_docs.reasonCode).toBe('GOOGLE_ACCOUNT_REQUIRED');
    expect(result.methods.google_docs.reason).toMatch(/connectez votre compte google drive/i);
  });

  it('expose séparément la préférence globale et celle du document', () => {
    const result = normalizeDocumentOpeningAvailability({
      ...availability(),
      preference: { mode: 'word_web', documentMode: 'word_web' },
      userPreference: { mode: 'google_docs', configured: true },
      documentPreference: { documentId: 'doc-1', mode: 'word_web', configured: true },
    });
    expect(result.preference.mode).toBe('word_web');
    expect(result.userPreference.mode).toBe('google_docs');
    expect(result.documentPreference).toEqual(expect.objectContaining({
      documentId: 'doc-1',
      mode: 'word_web',
      configured: true,
    }));
  });

  it('ouvre la méthode recommandée en mode automatique', () => {
    expect(resolveDocumentOpeningDecision({
      preference: { mode: DOCUMENT_OPENING_MODES.AUTOMATIC },
      availability: availability(),
    })).toEqual({ action: 'open', mode: 'word_web' });
  });

  it('recommande Word pour le web si Word Desktop est absent sur un document complexe', () => {
    const result = chooseRecommendedDocumentEditor({
      ...availability(),
      recommendedMode: 'word_desktop',
      compatibility: { level: 'complex', warnings: ['Macros détectées.'] },
    });
    expect(result).toBe('word_web');
  });

  it('ne remplace jamais un choix explicite Kheops par Word sur un DOCX complexe', () => {
    const result = chooseRecommendedDocumentEditor({
      ...availability({
        word_desktop: { available: true },
        word_web: { available: true },
      }),
      preference: { mode: 'kheops', configured: true },
      recommendedMode: 'word_desktop',
      compatibility: { level: 'complex', warnings: ['Macros détectées.'] },
    });

    expect(result).toBe('kheops');
  });

  it('honore Kheops pour un ancien .doc dès que le serveur le rend disponible', () => {
    const legacyDocAvailability = {
      ...availability({
        kheops: { available: true, conversionRequired: true },
        word_desktop: { available: true },
        word_web: { available: false },
        google_docs: { available: false },
      }),
      format: { extension: '.doc', kind: 'word_legacy' },
      preference: { mode: 'kheops', configured: true },
      recommendedMode: 'word_desktop',
    };

    expect(resolveDocumentOpeningDecision({
      availability: legacyDocAvailability,
      preference: legacyDocAvailability.preference,
    })).toEqual({ action: 'open', mode: 'kheops' });
  });

  it('affiche le choix lorsque la préférence demande toujours', () => {
    expect(resolveDocumentOpeningDecision({
      preference: { mode: DOCUMENT_OPENING_MODES.ASK },
      availability: availability(),
    })).toMatchObject({ action: 'choose', reason: 'preference_ask', suggestedMode: 'word_web' });
  });

  it('ouvre directement l’unique méthode après une réinitialisation', () => {
    const onlyKheops = availability({
      word_desktop: { available: false },
      word_web: { available: false },
      google_docs: { available: false },
    });
    expect(resolveDocumentOpeningDecision({
      preference: { mode: DOCUMENT_OPENING_MODES.ASK, configured: false },
      availability: onlyKheops,
    })).toEqual({ action: 'open', mode: 'kheops' });
  });

  it('propose un repli lisible lorsque la méthode habituelle est indisponible', () => {
    expect(resolveDocumentOpeningDecision({
      preference: { mode: DOCUMENT_OPENING_MODES.WORD_DESKTOP },
      availability: availability(),
    })).toMatchObject({
      action: 'choose',
      reason: 'preferred_unavailable',
      unavailableMode: 'word_desktop',
      message: 'Compagnon absent.',
      suggestedMode: 'word_web',
    });
  });

  it('honore un choix ponctuel disponible sans remplacer la préférence', () => {
    expect(resolveDocumentOpeningDecision({
      preference: { mode: DOCUMENT_OPENING_MODES.KHEOPS },
      availability: availability(),
      requestedMode: DOCUMENT_OPENING_MODES.WORD_WEB,
    })).toEqual({ action: 'open', mode: 'word_web' });
  });

  it('expose la lecture navigateur TXT comme action ponctuelle non mémorisable', () => {
    const textAvailability = {
      preference: { mode: 'automatic', configured: true },
      format: { kind: 'text', readOnlyPreview: true },
      methods: {
        browser_preview: { available: true, applicable: true, readOnly: true },
        kheops: { available: true, label: 'Éditeur texte Kheops' },
        word_desktop: { available: false, reason: 'TXT_NATIVE_COMPANION_UNAVAILABLE' },
        word_web: { available: false, reason: 'TXT_WORD_ONLINE_IMPORT_REQUIRED' },
        google_docs: { available: false, reason: 'TXT_GOOGLE_CONVERSION_DISABLED' },
      },
      recommendedMode: 'browser_preview',
    };

    const normalized = normalizeDocumentOpeningAvailability(textAvailability);
    expect(getAvailableDocumentOpeningActions(normalized)).toEqual(['browser_preview', 'kheops']);
    expect(normalized.methods.word_desktop.reason).toMatch(/compagnon actuel/i);
    expect(isDocumentPreferenceMode('browser_preview')).toBe(false);
    expect(resolveDocumentOpeningDecision({
      preference: { mode: 'automatic', configured: true },
      availability: textAvailability,
    })).toEqual({ action: 'open', mode: 'browser_preview' });
    expect(resolveDocumentOpeningDecision({
      preference: { mode: 'ask', configured: false },
      availability: textAvailability,
    })).toMatchObject({ action: 'choose', reason: 'preference_ask', suggestedMode: 'browser_preview' });
  });
});
