const crypto = require('crypto');
const mongoose = require('mongoose');
const path = require('path');

const DocumentPublicationArtifact = require('../models/Documents/DocumentPublicationArtifact');
const DocumentHistory = require('../models/Storage/DocumentHistory');
const { getFileStorage } = require('./fileStorage');
const { readStructuredVersion } = require('./documentHistoryService');
const {
  PDF_MIME,
  renderStructuredDocumentPdf,
} = require('./pdf/documentPdfRenderer');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SUPPORTED_FORMATS = new Set(['docx', 'pdf']);
const RENDERER_VERSION = 'pdf-lib-v1';

function publicationError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizePublicationFormats(input) {
  const source = Array.isArray(input) ? input : (input ? [input] : ['docx', 'pdf']);
  const expanded = source.flatMap((value) => (
    String(value || '').trim().toLowerCase() === 'both'
      ? ['docx', 'pdf']
      : [String(value || '').trim().toLowerCase()]
  ));
  const formats = [...new Set(expanded.filter(Boolean))];
  if (!formats.length) throw publicationError('PUBLICATION_FORMAT_REQUIRED', 'Choisissez au moins un format de publication.');
  const unsupported = formats.filter((format) => !SUPPORTED_FORMATS.has(format));
  if (unsupported.length) {
    throw publicationError(
      'UNSUPPORTED_PUBLICATION_FORMAT',
      `Formats de publication disponibles : docx, pdf ou both. Format inconnu : ${unsupported.join(', ')}.`,
    );
  }
  return formats;
}

function cleanBasename(filename) {
  return path.basename(String(filename || 'document'))
    .replace(/[\\/\r\n"]/g, '_')
    .replace(/\.(?:docx|pdf)$/i, '')
    .slice(0, 220) || 'document';
}

function safeSegment(value, fallback = 'unknown') {
  return String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 220) || fallback;
}

function checksumOf(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function publicationStorageKey({ tenantId, dossierId, documentId, versionId, format, checksum }) {
  return [
    'publication-artifacts',
    'tenants', safeSegment(tenantId, 'tenant'),
    'dossiers', safeSegment(dossierId, 'dossier'),
    'documents', safeSegment(documentId, 'document'),
    'versions', safeSegment(versionId, 'version'),
    safeSegment(format, 'format'),
    `${safeSegment(checksum, 'checksum')}.${format}`,
  ].join('/');
}

function identityFilter({ tenantId, dossierId, documentId, versionId, format }) {
  return { tenantId, dossierId, documentId, versionId: String(versionId), format };
}

function valueOf(record) {
  return record?.toObject ? record.toObject() : record;
}

function assertArtifactMatches(record, expected) {
  const value = valueOf(record) || {};
  if (
    String(value.checksum) !== String(expected.checksum)
    || String(value.sourceChecksum) !== String(expected.sourceChecksum)
    || Number(value.size) !== Number(expected.size)
    || String(value.mime) !== String(expected.mime)
  ) {
    throw publicationError(
      'PUBLICATION_ARTIFACT_CONFLICT',
      'Un artefact différent existe déjà pour cette version et ce format. Aucun fichier existant n’a été remplacé.',
      409,
    );
  }
  return value;
}

async function verifyArtifactBlob(record) {
  const value = valueOf(record);
  const storage = getFileStorage();
  if (!value?.storageKey || !(await storage.exists(value.storageKey))) {
    throw publicationError(
      'PUBLICATION_ARTIFACT_BLOB_MISSING',
      'Le fichier de publication immuable est indisponible. Préparez une nouvelle version documentaire.',
      409,
    );
  }
  const buffer = await storage.read(value.storageKey);
  if (checksumOf(buffer) !== String(value.checksum)) {
    throw publicationError(
      'PUBLICATION_ARTIFACT_CHECKSUM_MISMATCH',
      'Le fichier de publication ne correspond plus à son empreinte immuable.',
      409,
    );
  }
  return buffer;
}

async function persistPublicationArtifact({
  tenantId,
  dossierId,
  documentId,
  versionId,
  revision = null,
  format,
  mime,
  filename,
  buffer,
  sourceChecksum,
  createdBy,
  renderer = null,
}) {
  if (!Buffer.isBuffer(buffer)) {
    throw publicationError('PUBLICATION_BUFFER_REQUIRED', 'Le contenu de publication est indisponible.', 500);
  }
  const filter = identityFilter({ tenantId, dossierId, documentId, versionId, format });
  const checksum = checksumOf(buffer);
  const expected = { checksum, sourceChecksum, size: buffer.length, mime };
  const existing = await DocumentPublicationArtifact.findOne(filter);
  if (existing) {
    assertArtifactMatches(existing, expected);
    await verifyArtifactBlob(existing);
    return { artifact: existing, reused: true };
  }

  const storageKey = publicationStorageKey({
    tenantId, dossierId, documentId, versionId, format, checksum,
  });
  const storage = getFileStorage();
  let wroteBlob = false;
  if (await storage.exists(storageKey)) {
    const orphan = await storage.read(storageKey);
    if (checksumOf(orphan) !== checksum) {
      throw publicationError(
        'PUBLICATION_ARTIFACT_STORAGE_CONFLICT',
        'La clé de stockage immuable contient déjà un fichier différent.',
        409,
      );
    }
  } else {
    await storage.save(storageKey, buffer, { contentType: mime });
    wroteBlob = true;
  }
  try {
    const artifact = await DocumentPublicationArtifact.create({
      ...filter,
      revision,
      mime,
      filename,
      storageKey,
      checksum,
      sourceChecksum,
      size: buffer.length,
      renderer,
      createdBy,
    });
    return { artifact, reused: false };
  } catch (error) {
    if (error?.code !== 11000) {
      if (wroteBlob) await storage.delete(storageKey).catch(() => {});
      throw error;
    }
    const raced = await DocumentPublicationArtifact.findOne(filter);
    if (!raced) throw error;
    const racedValue = assertArtifactMatches(raced, expected);
    if (wroteBlob && String(racedValue.storageKey) !== storageKey) await storage.delete(storageKey).catch(() => {});
    await verifyArtifactBlob(raced);
    return { artifact: raced, reused: true };
  }
}

function artifactToClient(record, { documentId = null, requested = true } = {}) {
  const value = valueOf(record);
  if (!value) return { requested, ready: false };
  const resolvedDocumentId = documentId || value.documentId;
  const artifactId = String(value._id);
  return {
    requested,
    ready: true,
    artifactId,
    format: value.format,
    versionId: String(value.versionId),
    mime: value.mime,
    filename: value.filename,
    size: value.size,
    checksum: value.checksum,
    sourceChecksum: value.sourceChecksum,
    downloadUrl: `/api/document-editor/${encodeURIComponent(String(resolvedDocumentId))}/publications/${encodeURIComponent(artifactId)}/download`,
  };
}

async function preparePublicationArtifacts({
  tenantId,
  dossierId,
  documentId,
  versionId,
  revision = null,
  formats,
  title,
  structuredDocument,
  createdBy,
}) {
  const requested = normalizePublicationFormats(formats);
  const history = await DocumentHistory.findOne({ tenantId, dossierId, documentId });
  if (!history) {
    throw publicationError('PUBLICATION_HISTORY_NOT_FOUND', 'La version documentaire gelée est introuvable.', 404);
  }
  const version = history.versions.find((candidate) => String(candidate.versionId) === String(versionId));
  if (!version?.storageKey) {
    throw publicationError('PUBLICATION_VERSION_NOT_FOUND', 'La version documentaire exacte est introuvable.', 404);
  }
  const storage = getFileStorage();
  if (!(await storage.exists(version.storageKey))) {
    throw publicationError('PUBLICATION_VERSION_BLOB_MISSING', 'Le DOCX de la version exacte est indisponible.', 409);
  }
  const docxBuffer = await storage.read(version.storageKey);
  const sourceChecksum = checksumOf(docxBuffer);
  if (version.checksum && sourceChecksum !== String(version.checksum)) {
    throw publicationError('PUBLICATION_VERSION_CHECKSUM_MISMATCH', 'Le DOCX gelé ne correspond plus à son empreinte.', 409);
  }

  const basename = cleanBasename(title || version.filename);
  const results = {};
  const reused = [];
  if (requested.includes('docx')) {
    const saved = await persistPublicationArtifact({
      tenantId,
      dossierId,
      documentId,
      versionId,
      revision,
      format: 'docx',
      mime: version.mime || DOCX_MIME,
      filename: `${basename}.docx`,
      buffer: docxBuffer,
      sourceChecksum,
      createdBy,
    });
    results.docx = artifactToClient(saved.artifact, { documentId });
    reused.push(saved.reused);
  }

  if (requested.includes('pdf')) {
    const exactStructuredDocument = await readStructuredVersion(history, versionId)
      || structuredDocument;
    if (!exactStructuredDocument || typeof exactStructuredDocument !== 'object') {
      throw publicationError(
        'PUBLICATION_STRUCTURED_VERSION_REQUIRED',
        'Le contenu structuré exact de cette version est indisponible pour produire le PDF.',
        409,
      );
    }
    if (version.structuredChecksum) {
      const actualStructuredChecksum = checksumOf(Buffer.from(JSON.stringify(exactStructuredDocument), 'utf8'));
      if (actualStructuredChecksum !== String(version.structuredChecksum)) {
        throw publicationError(
          'PUBLICATION_STRUCTURED_CHECKSUM_MISMATCH',
          'Le contenu structuré ne correspond plus à la version documentaire gelée.',
          409,
        );
      }
    }
    const pdfBuffer = await renderStructuredDocumentPdf(exactStructuredDocument);
    const saved = await persistPublicationArtifact({
      tenantId,
      dossierId,
      documentId,
      versionId,
      revision,
      format: 'pdf',
      mime: PDF_MIME,
      filename: `${basename}.pdf`,
      buffer: pdfBuffer,
      sourceChecksum,
      createdBy,
      renderer: RENDERER_VERSION,
    });
    results.pdf = artifactToClient(saved.artifact, { documentId });
    reused.push(saved.reused);
  }

  return {
    artifacts: {
      docx: requested.includes('docx') ? results.docx : { requested: false, ready: false },
      pdf: requested.includes('pdf') ? results.pdf : { requested: false, ready: false },
    },
    reused: reused.length > 0 && reused.every(Boolean),
  };
}

async function resolvePublicationArtifact({
  tenantId,
  dossierId,
  documentId = null,
  versionId = null,
  format = null,
  artifactId = null,
}) {
  if (!artifactId && (!documentId || !versionId || !format)) return null;
  const filter = { tenantId, dossierId };
  if (documentId) filter.documentId = String(documentId);
  if (versionId) filter.versionId = String(versionId);
  if (format) filter.format = String(format).toLowerCase();
  if (artifactId) {
    if (!mongoose.Types.ObjectId.isValid(String(artifactId))) return null;
    filter._id = String(artifactId);
  }
  return DocumentPublicationArtifact.findOne(filter);
}

async function readPublicationArtifact(scope) {
  const artifact = await resolvePublicationArtifact(scope);
  if (!artifact) return null;
  const buffer = await verifyArtifactBlob(artifact);
  return { artifact, buffer };
}

module.exports = {
  DOCX_MIME,
  PDF_MIME,
  RENDERER_VERSION,
  SUPPORTED_FORMATS,
  normalizePublicationFormats,
  publicationError,
  publicationStorageKey,
  persistPublicationArtifact,
  preparePublicationArtifacts,
  artifactToClient,
  resolvePublicationArtifact,
  readPublicationArtifact,
  checksumOf,
};
