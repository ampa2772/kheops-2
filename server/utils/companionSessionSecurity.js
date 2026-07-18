const crypto = require('crypto');

const COMPANION_PREVIOUS_JTI_GRACE_SECONDS = 60;

function hashCompanionJti(jti) {
  if (typeof jti !== 'string' || !jti) return null;
  return crypto.createHash('sha256').update(jti, 'utf8').digest('hex');
}

function companionSessionId(claims) {
  const value = claims?.companionSessionId;
  return typeof value === 'string' && value ? value : null;
}

function hasAnyStatefulCompanionClaim(claims) {
  return claims?.companionSessionId != null
    || claims?.companionSessionAbsoluteExp != null
    || claims?.jti != null;
}

function hasCompleteStatefulCompanionClaims(claims) {
  const purpose = claims?.companionPurpose;
  return Boolean(
    companionSessionId(claims)
      && typeof claims?.jti === 'string'
      && claims.jti
      && Number.isFinite(Number(claims?.companionSessionAbsoluteExp))
      && (purpose === 'mirror' || purpose === 'word')
      && (purpose !== 'word'
        || (typeof claims?.companionDocId === 'string' && claims.companionDocId)),
  );
}

function companionClaimUserId(claims) {
  const value = claims?.id ?? claims?.user?.id ?? claims?.user?._id ?? claims?.user;
  return value == null ? null : String(value);
}

module.exports = {
  COMPANION_PREVIOUS_JTI_GRACE_SECONDS,
  hashCompanionJti,
  companionSessionId,
  hasAnyStatefulCompanionClaim,
  hasCompleteStatefulCompanionClaims,
  companionClaimUserId,
};
