function valueOf(doc, key) {
  return typeof doc?.get === 'function' ? doc.get(key) : doc?.[key];
}

function referenceToClient(reference) {
  if (!reference) return null;
  const fields = [
    'referenceId', 'targetVersionId', 'followLatest', 'referenceType', 'label',
    'pieceNumber', 'targetTitleSnapshot', 'status', 'createdAt', 'updatedAt',
  ];
  const result = { id: String(valueOf(reference, '_id')) };
  for (const field of fields) result[field] = valueOf(reference, field) ?? null;
  for (const field of ['sourceDossierId', 'sourceDocumentId', 'targetDossierId', 'targetDocumentId', 'targetSubfolderId', 'createdBy', 'updatedBy']) {
    const value = valueOf(reference, field);
    result[field] = value ? String(value) : null;
  }
  return result;
}

function buildReferenceBlock(reference) {
  const value = referenceToClient(reference);
  if (!value) throw new TypeError('Référence requise.');
  return {
    id: `reference-${value.referenceId}`,
    type: 'reference',
    referenceId: value.referenceId,
    targetDossierId: value.targetDossierId,
    targetDocumentId: value.targetDocumentId,
    targetVersionId: value.targetVersionId,
    followLatest: Boolean(value.followLatest),
    referenceType: value.referenceType || 'piece',
    label: value.label,
    pieceNumber: value.pieceNumber || '',
    status: value.status || 'active',
  };
}

function choosePinnedVersion(candidate, requestedVersionId, followLatest = false) {
  const versions = Array.isArray(candidate?.versions) ? candidate.versions : [];
  if (followLatest) return null;
  const versionId = String(requestedVersionId || candidate?.currentVersionId || versions[0]?.versionId || '');
  if (!versionId || !versions.some((version) => String(version.versionId) === versionId)) {
    const error = new Error('La version choisie de la pièce n’est plus disponible.');
    error.statusCode = 409;
    error.code = 'REFERENCE_VERSION_NOT_FOUND';
    throw error;
  }
  return versionId;
}

module.exports = { buildReferenceBlock, choosePinnedVersion, referenceToClient };
