const mockConsent = {
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
};

jest.mock('../../../models/AI/AICostNoticeConsent', () => mockConsent);

const costNotice = require('../costNoticeService');
const { normalizeUsageDimensions } = require('../usageDimensions');
const { calculateCost, normalizeDimensionRates } = require('../catalogueService');

describe('notice de coûts et compteurs IA extensibles', () => {
  beforeEach(() => jest.clearAllMocks());

  test('une ancienne version de notice requiert une nouvelle confirmation', () => {
    expect(costNotice.publicNotice({
      noticeVersion: 'ancienne',
      noticeHash: costNotice.COST_NOTICE_HASH,
      acceptedAt: new Date(),
    })).toMatchObject({ accepted: false, requiresAcceptance: true, acceptedVersion: 'ancienne' });
  });

  test('conserve la version, l’empreinte et la date lors de la confirmation', async () => {
    mockConsent.findOneAndUpdate.mockResolvedValue({
      noticeVersion: costNotice.COST_NOTICE_VERSION,
      noticeHash: costNotice.COST_NOTICE_HASH,
      acceptedAt: new Date('2026-07-11T10:00:00.000Z'),
      revokedAt: null,
    });
    const result = await costNotice.acceptNotice({
      tenantId: 'tenant', userId: 'user', version: costNotice.COST_NOTICE_VERSION,
    });
    expect(result).toMatchObject({ accepted: true, version: costNotice.COST_NOTICE_VERSION });
    expect(mockConsent.findOneAndUpdate).toHaveBeenCalledWith(
      { tenantId: 'tenant', userId: 'user' },
      expect.objectContaining({ $set: expect.objectContaining({ noticeHash: costNotice.COST_NOTICE_HASH }) }),
      expect.objectContaining({ upsert: true, runValidators: true }),
    );
  });

  test('assainit et borne les dimensions d’usage sans conserver de texte arbitraire', () => {
    expect(normalizeUsageDimensions({
      inputTokens: 10,
      reasoningTokens: 7,
      media: { audioSeconds: 2.5, label: 'secret' },
      toolCalls: 3,
      negative: -2,
      'clé invalide': 8,
    })).toEqual({ reasoningTokens: 7, 'media.audioSeconds': 2.5, toolCalls: 3 });
  });

  test('calcule les dimensions au tarif versionné et privilégie un coût officiel valide', () => {
    const entry = {
      inputPerMillion: 1,
      outputPerMillion: 2,
      cachedInputPerMillion: 0.5,
      minimumCharge: 0,
      dimensionRates: {
        reasoningTokens: { amount: 10, unit: 'per_million' },
        images: { amount: 0.02, unit: 'per_unit' },
      },
    };
    expect(normalizeDimensionRates(entry.dimensionRates)).toEqual(entry.dimensionRates);
    expect(calculateCost(entry, {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      reasoningTokens: 1_000_000,
      images: 2,
    })).toBe(13.04);
    expect(calculateCost(entry, { officialCost: 1.23, inputTokens: 999999999 })).toBe(1.23);
  });
});
