const StoredDocument = require('../models/Storage/StoredDocument');
const DocumentHistory = require('../models/Storage/DocumentHistory');
const { getFileStorage } = require('./fileStorage');
const { getProviderForStorageKey } = require('./storage');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MIME = 'application/msword';
const TEXT_MIME = 'text/plain';

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function canonicalExtension({ filename = '', mime = '' } = {}) {
  const name = String(filename || '');
  const normalizedMime = String(mime || '').split(';')[0].trim().toLowerCase();
  // L'extension explicite prime sur un MIME historique erroné. Certains
  // anciens stockages ont par exemple conservé application/msword pour un
  // véritable .docx ; la clé ne doit alors surtout pas redevenir .doc.
  if (/\.txt$/i.test(name)) return '.txt';
  if (/\.docx$/i.test(name)) return '.docx';
  if (/\.doc$/i.test(name)) return '.doc';
  if (normalizedMime === TEXT_MIME) {
    return '.txt';
  }
  if (normalizedMime === DOC_MIME) return '.doc';
  return '.docx';
}

function canonicalMime(file = {}) {
  const extension = canonicalExtension(file);
  if (extension === '.txt') return TEXT_MIME;
  if (extension === '.doc') return DOC_MIME;
  return DOCX_MIME;
}

function canonicalStorageKey(docId, tenantId = null, dossierId = null, file = {}) {
  const documentSegment = safeSegment(docId);
  const extension = canonicalExtension(file);
  if (tenantId && dossierId) {
    return `tenants/${safeSegment(tenantId)}/dossiers/${safeSegment(dossierId)}/documents/${documentSegment}${extension}`;
  }
  if (tenantId) return `tenants/${safeSegment(tenantId)}/documents/${documentSegment}${extension}`;
  // Lecture legacy uniquement. Toutes les nouvelles écritures transmettent le
  // contexte tenant+dossier afin d'empêcher une collision inter-cabinets.
  return `documents/${documentSegment}${extension}`;
}

function contentTypeForKey(key) {
  if (/\.txt$/i.test(String(key || ''))) return TEXT_MIME;
  if (/\.doc$/i.test(String(key || ''))) return DOC_MIME;
  return DOCX_MIME;
}

async function resolveDocumentContent({ tenantId, dossierId, documentId, fallbackFilename }) {
  const storage = getFileStorage();
  // L'historique central est la source de vérité dès qu'il existe. Cela évite
  // qu'une panne entre l'écriture de la version et la copie canonique serve une
  // ancienne version depuis une autre route.
  const history = await DocumentHistory.findOne({ tenantId, dossierId, documentId }).lean();
  const current = history?.versions?.find((version) => String(version.versionId) === String(history.currentVersionId));
  if (current?.storageKey && await storage.exists(current.storageKey)) {
    const filename = current.filename || fallbackFilename || `${documentId}.docx`;
    let structuredDocument = current.structuredDocument || null;
    if (!structuredDocument && current.structuredStorageKey && await storage.exists(current.structuredStorageKey)) {
      try {
        structuredDocument = JSON.parse((await storage.read(current.structuredStorageKey)).toString('utf8'));
      } catch (_error) {
        // Le document exact reste lisible. L'appelant pourra reconstruire un modèle
        // structuré par conversion et signaler sa compatibilité.
        structuredDocument = null;
      }
    }
    return {
      buffer: await storage.read(current.storageKey),
      filename,
      mime: canonicalMime({ filename, mime: current.mime }),
      source: 'document-history',
      versionId: current.versionId,
      structuredDocument,
    };
  }
  const canonicalKeys = [
    canonicalStorageKey(documentId, tenantId, dossierId, { filename: fallbackFilename }),
    canonicalStorageKey(documentId, tenantId, dossierId, { filename: `${documentId}.docx` }),
    canonicalStorageKey(documentId, tenantId, dossierId, { filename: `${documentId}.doc` }),
    canonicalStorageKey(documentId, tenantId, dossierId, { filename: `${documentId}.txt` }),
  ].filter((key, index, values) => values.indexOf(key) === index);
  const canonicalKey = await canonicalKeys.reduce(async (foundPromise, key) => {
    const found = await foundPromise;
    if (found) return found;
    return (await storage.exists(key)) ? key : null;
  }, Promise.resolve(null));
  if (canonicalKey) {
    const mime = contentTypeForKey(canonicalKey);
    const extension = canonicalExtension({ filename: canonicalKey, mime });
    const fallbackExtension = fallbackFilename
      ? canonicalExtension({ filename: fallbackFilename })
      : null;
    return {
      buffer: await storage.read(canonicalKey),
      filename: fallbackFilename && fallbackExtension === extension
        ? fallbackFilename
        : `${documentId}${extension}`,
      mime,
      source: 'canonical',
    };
  }

  // Migration paresseuse de la clé historique après contrôle d'appartenance.
  const legacyKeys = [
    canonicalStorageKey(documentId, null, null, { filename: fallbackFilename }),
    canonicalStorageKey(documentId),
    canonicalStorageKey(documentId, null, null, { filename: `${documentId}.doc` }),
    canonicalStorageKey(documentId, null, null, { filename: `${documentId}.txt` }),
  ].filter((key, index, values) => values.indexOf(key) === index);
  const legacyKey = await legacyKeys.reduce(async (foundPromise, key) => {
    const found = await foundPromise;
    if (found) return found;
    return (await storage.exists(key)) ? key : null;
  }, Promise.resolve(null));
  if (tenantId && dossierId && legacyKey) {
    const buffer = await storage.read(legacyKey);
    const mime = contentTypeForKey(legacyKey);
    const extension = canonicalExtension({ filename: legacyKey, mime });
    const migratedKey = canonicalStorageKey(documentId, tenantId, dossierId, {
      filename: `${documentId}${extension}`,
      mime,
    });
    const fallbackExtension = fallbackFilename
      ? canonicalExtension({ filename: fallbackFilename })
      : null;
    await storage.save(migratedKey, buffer, { contentType: mime });
    return {
      buffer,
      filename: fallbackFilename && fallbackExtension === extension
        ? fallbackFilename
        : `${documentId}${extension}`,
      mime,
      source: 'canonical-legacy-migrated',
    };
  }

  const storedFilter = { tenantId, documentId, deletedAt: null };
  if (dossierId) storedFilter.dossierId = dossierId;
  const stored = await StoredDocument.findOne(storedFilter);
  const version = stored?.versions?.find((v) => String(v.versionId) === String(stored.currentVersionId))
    || stored?.versions?.[stored.versions.length - 1];
  if (!version?.storageKey) return null;
  const provider = await getProviderForStorageKey(stored.tenantId || tenantId, version.storageKey);
  const filename = version.filename || fallbackFilename || `${documentId}.docx`;
  return {
    buffer: await provider.downloadVersion({ storageKey: version.storageKey }),
    filename,
    mime: canonicalMime({ filename, mime: version.mime }),
    source: 'stored-document',
  };
}

async function saveCanonicalDocument(documentId, buffer, mime = DOCX_MIME, { tenantId, dossierId, filename } = {}) {
  if (!tenantId || !dossierId) {
    const err = new Error('Contexte tenantId+dossierId requis pour enregistrer le document canonique.');
    err.statusCode = 400;
    err.code = 'DOCUMENT_SCOPE_REQUIRED';
    throw err;
  }
  const file = { filename, mime };
  const key = canonicalStorageKey(documentId, tenantId, dossierId, file);
  await getFileStorage().save(key, buffer, { contentType: canonicalMime(file) });
  return key;
}

module.exports = {
  DOC_MIME,
  DOCX_MIME,
  TEXT_MIME,
  canonicalExtension,
  canonicalMime,
  canonicalStorageKey,
  resolveDocumentContent,
  saveCanonicalDocument,
};
