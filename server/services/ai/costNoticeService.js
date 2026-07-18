const crypto = require('crypto');
const AICostNoticeConsent = require('../../models/AI/AICostNoticeConsent');
const { AIError } = require('./errors');

const COST_NOTICE_VERSION = '2026-07-11-v1';
const COST_NOTICE_TEXT = [
  'Kheops 2 utilise les compteurs d’usage transmis par l’API du fournisseur, lorsqu’ils sont disponibles,',
  'puis applique la grille tarifaire enregistrée pour le modèle utilisé. Certains fournisseurs ou certaines',
  'fonctions peuvent exposer un coût officiel ; dans les autres cas, le montant affiché par Kheops est un',
  'calcul ou une estimation. Les tarifs et les règles peuvent évoluer. La facture et le tableau de bord du',
  'fournisseur restent la référence officielle. Le budget Kheops ne s’applique qu’aux requêtes envoyées depuis Kheops 2.',
].join(' ');
const COST_NOTICE_HASH = crypto.createHash('sha256').update(COST_NOTICE_TEXT, 'utf8').digest('hex');

function publicNotice(consent) {
  const accepted = Boolean(consent
    && !consent.revokedAt
    && consent.noticeVersion === COST_NOTICE_VERSION
    && consent.noticeHash === COST_NOTICE_HASH);
  return {
    version: COST_NOTICE_VERSION,
    text: COST_NOTICE_TEXT,
    hash: COST_NOTICE_HASH,
    accepted,
    acceptedAt: accepted ? consent.acceptedAt : null,
    acceptedVersion: consent?.noticeVersion || null,
    requiresAcceptance: !accepted,
  };
}

async function getNotice({ tenantId, userId }) {
  const consent = await AICostNoticeConsent.findOne({ tenantId, userId }).lean();
  return publicNotice(consent);
}

async function acceptNotice({ tenantId, userId, version, source = 'settings' }) {
  if (String(version || '') !== COST_NOTICE_VERSION) {
    throw new AIError('AI_COST_NOTICE_VERSION_STALE', 'La notice a été mise à jour. Relisez-la avant de confirmer.', { statusCode: 409 });
  }
  const consent = await AICostNoticeConsent.findOneAndUpdate(
    { tenantId, userId },
    {
      $set: {
        noticeVersion: COST_NOTICE_VERSION,
        noticeHash: COST_NOTICE_HASH,
        acceptedAt: new Date(),
        revokedAt: null,
        source: source === 'api' ? 'api' : 'settings',
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return publicNotice(consent);
}

async function assertCurrentConsent({ tenantId, userId }) {
  const notice = await getNotice({ tenantId, userId });
  if (!notice.accepted) {
    throw new AIError('AI_COST_NOTICE_CONSENT_REQUIRED', 'Confirmez la notice de transparence sur les coûts avant de connecter un fournisseur.', { statusCode: 428 });
  }
  return notice;
}

module.exports = {
  COST_NOTICE_VERSION,
  COST_NOTICE_TEXT,
  COST_NOTICE_HASH,
  publicNotice,
  getNotice,
  acceptNotice,
  assertCurrentConsent,
};
