const crypto = require('crypto');
const express = require('express');
const mammoth = require('mammoth');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');

const auth = require('../middlewares/middleware-auth');
const requireTenant = require('../middlewares/requireTenant');
const DocumentEditorOriginal = require('../models/DocumentEditor/DocumentEditorOriginal');
const DocumentEditorRevision = require('../models/DocumentEditor/DocumentEditorRevision');
const DocumentEditorState = require('../models/DocumentEditor/DocumentEditorState');
const DocumentEditorComment = require('../models/DocumentEditor/DocumentEditorComment');
const DocumentReference = require('../models/DocumentEditor/DocumentReference');
const DocumentTemplate = require('../models/DocumentEditor/DocumentTemplate');
const DocumentHistory = require('../models/Storage/DocumentHistory');
const StoredDocument = require('../models/Storage/StoredDocument');
const Dossier = require('../models/Folder/Dossier');
const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
const { getAccessibleUserIds } = require('../services/cabinetAccess');
const { resolveTenantId } = require('../services/tenantService');
const audit = require('../utils/auditLogger');
const { ensureCabinetRole, getCabinetRole, ROLES } = require('../services/cabinetRoles');
const { resolveDocumentContent, saveCanonicalDocument } = require('../services/documentContentService');
const { saveVersion: saveHistoryVersion } = require('../services/documentHistoryService');
const {
  applyTemplateToDocument,
  createTemplateVersion,
  normalizeDocumentType,
  resolveTemplate,
  templateToClient,
} = require('../services/documentTemplateService');
const {
  buildReferenceBlock,
  choosePinnedVersion,
  referenceToClient,
} = require('../services/documentReferenceService');
const {
  normalizePublicationFormats,
  preparePublicationArtifacts,
  readPublicationArtifact,
} = require('../services/documentPublicationService');
const {
  analyzeDocx,
  applyDocxPresentation,
  createDocxBuffer,
  documentCounts,
  documentToHtml,
  mammothHtmlToStructured,
  normalizeStoredDocumentForClient,
  normalizeStructuredDocument,
} = require('../services/documentEditorFormat');
const {
  TEXT_MIME,
  decodePlainTextBuffer,
  encodePlainTextBuffer,
  isPlainTextContent,
  normalizePlainText,
  normalizeTextFileFormat,
  plainTextToStructuredDocument,
  structuredDocumentToPlainText,
} = require('../services/documentPlainTextFormat');
const {
  LEGACY_DOC_MIME,
  convertLegacyWordBuffer,
  isLegacyWordContent,
} = require('../services/documentLegacyWordFormat');
const {
  convertLegacyWordToDocx,
} = require('../services/documentLegacyWordConversion');
const {
  assertSafeDocxPackage,
} = require('../services/documentOpcSecurity');

const router = express.Router();
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
const MAX_DOCUMENT_JSON_BYTES = 6 * 1024 * 1024;
const DOCUMENT_STATUSES = new Set([
  'draft', 'review', 'corrections_requested', 'approved', 'validated',
  'ready_to_send', 'sent', 'signed', 'archived',
]);
const PROTECTED_DOCUMENT_STATUSES = new Set(['validated', 'ready_to_send', 'sent', 'signed', 'archived']);
const STATUS_TRANSITIONS = Object.freeze({
  draft: new Set(['review']),
  review: new Set(['draft', 'corrections_requested', 'validated']),
  corrections_requested: new Set(['draft', 'review']),
  validated: new Set(['corrections_requested', 'ready_to_send', 'signed', 'archived']),
  ready_to_send: new Set(['corrections_requested', 'sent', 'signed', 'archived']),
  sent: new Set(['signed', 'archived']),
  signed: new Set(['archived']),
  archived: new Set([]),
});

function normalizeDocumentStatus(value, fallback = 'draft') {
  return DOCUMENT_STATUSES.has(value) ? value : fallback;
}

async function assertStatusTransition(req, stored, currentStatus, requestedStatus) {
  if (requestedStatus == null || requestedStatus === '') return;
  const next = requestedStatus === 'approved' ? 'validated' : String(requestedStatus);
  const current = currentStatus === 'approved' ? 'validated' : normalizeDocumentStatus(currentStatus);
  if (!DOCUMENT_STATUSES.has(next) && next !== 'validated') {
    const error = new Error('Statut documentaire inconnu.');
    error.statusCode = 400;
    error.code = 'DOCUMENT_STATUS_INVALID';
    throw error;
  }
  if (next === current) return;
  if (!STATUS_TRANSITIONS[current]?.has(next)) {
    const error = new Error(`Transition de statut interdite : ${current} vers ${next}.`);
    error.statusCode = 409;
    error.code = 'DOCUMENT_STATUS_TRANSITION_FORBIDDEN';
    throw error;
  }
  if (PROTECTED_DOCUMENT_STATUSES.has(current) || PROTECTED_DOCUMENT_STATUSES.has(next)) {
    const isDocumentOwner = String(stored?.ownerUserId || '') === String(userObjectId(req));
    const role = await getCabinetRole(userObjectId(req));
    if (!isDocumentOwner && ![ROLES.OWNER, ROLES.ADMIN].includes(role)) {
      const error = new Error('Seul le responsable du document ou un administrateur peut valider ou modifier un statut final.');
      error.statusCode = 403;
      error.code = 'DOCUMENT_STATUS_ROLE_FORBIDDEN';
      throw error;
    }
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
});

router.use(auth, requireTenant);

function objectId(value, label = 'Document') {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) {
    const err = new Error(`${label} invalide.`);
    err.statusCode = 400;
    err.code = 'INVALID_ID';
    throw err;
  }
  return new mongoose.Types.ObjectId(String(value));
}

function userObjectId(req) {
  const raw = req.user && typeof req.user === 'object'
    ? (req.user._id || req.user.id || req.user.user)
    : req.user;
  return objectId(raw, 'Utilisateur');
}

function scopeTenantId(req) {
  return req.documentTenantId || req.tenantId;
}

function cleanFilename(value, fallback = 'document.docx') {
  const filename = path.basename(String(value || fallback)).replace(/[\\/\r\n"]/g, '_');
  return filename.slice(0, 240) || fallback;
}

function docxFileFormat(filename = 'document.docx') {
  const safeName = cleanFilename(filename, 'document.docx');
  return {
    kind: 'docx',
    filename: /\.docx$/i.test(safeName) ? safeName : `${safeName.replace(/\.[^.]+$/, '') || 'document'}.docx`,
    mime: DOCX_MIME,
  };
}

function stateFileFormat(state, fallbackFilename = 'document.docx') {
  const raw = state?.fileFormat?.toObject?.() || state?.fileFormat || {};
  if (raw.kind === 'text') return normalizeTextFileFormat(raw, { filename: fallbackFilename });
  return docxFileFormat(raw.filename || fallbackFilename);
}

function isTextEditorState(state) {
  return stateFileFormat(state).kind === 'text';
}

function plainTextFromState(state) {
  return structuredDocumentToPlainText(state?.structuredDocument || {});
}

function textModeUnavailable(message) {
  const err = new Error(message);
  err.statusCode = 409;
  err.code = 'TEXT_MODE_RICH_FEATURE_UNAVAILABLE';
  return err;
}

function attachmentDisposition(filename) {
  const safe = cleanFilename(filename);
  const ascii = safe.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(safe).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function responseError(res, err) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'FILE_TOO_LARGE', message: 'Le fichier DOCX dépasse la limite de 8 Mo.' });
  }
  if (err && err.code === 11000) {
    return res.status(409).json({ error: 'REVISION_CONFLICT', message: 'Une autre modification a été enregistrée. Rechargez le document avant de continuer.' });
  }
  const status = Number(err && err.statusCode) || 500;
  if (status >= 500) console.error('[documentEditor]', err);
  const payload = {
    error: (err && err.code) || 'DOCUMENT_EDITOR_ERROR',
    message: (err && err.message) || 'Erreur de l’Éditeur Kheops.',
  };
  if (err && err.code === 'EDITOR_STATE_STALE') {
    payload.editorRevision = err.editorRevision;
    payload.reloadAvailable = true;
  }
  return res.status(status).json(payload);
}

function receiveDocx(req, res, next) {
  return upload.single('file')(req, res, (err) => {
    if (err) return responseError(res, err);
    return next();
  });
}

async function resolveAccessibleDocument(req, requestedId) {
  const id = objectId(requestedId);
  const stored = await StoredDocument.findOne({
    tenantId: req.tenantId,
    deletedAt: null,
    $or: [{ _id: id }, { documentId: id }],
  }).select('_id tenantId documentId dossierId ownerUserId currentVersionId versions').lean();
  if (!stored) {
    // Les documents générés historiquement existent comme sous-documents du
    // Dossier avant d'avoir un conteneur StoredDocument. L'Éditeur Kheops doit
    // aussi pouvoir les ouvrir, avec le même contrôle d'appartenance cabinet.
    const accessibleUsers = await getAccessibleUserIds(req.user);
    const links = await UserDossier.find({ user: { $in: accessibleUsers } }).select('dossier user').lean();
    const dossierIds = links.map((link) => link.dossier);
    const dossier = await Dossier.findOne({
      _id: { $in: dossierIds },
      'dossier.documents._id': id,
    }).select('_id tenantId').lean();
    if (!dossier) {
      const err = new Error('Document introuvable dans ce cabinet.');
      err.statusCode = 404;
      err.code = 'DOCUMENT_NOT_FOUND';
      throw err;
    }
    let documentTenantId = dossier.tenantId || null;
    if (!documentTenantId) {
      const owningLink = links.find((link) => String(link.dossier) === String(dossier._id) && link.user);
      if (owningLink) {
        documentTenantId = await resolveTenantId(owningLink.user);
        if (documentTenantId) {
          // Migration paresseuse des dossiers historiques afin qu'un membre
          // partagé ne crée jamais une seconde copie sous son propre tenant.
          await Dossier.updateOne(
            { _id: dossier._id, $or: [{ tenantId: null }, { tenantId: { $exists: false } }] },
            { $set: { tenantId: documentTenantId } },
          ).catch(() => {});
        }
      }
    }
    req.documentTenantId = documentTenantId || req.tenantId;
    return {
      stored: { tenantId: req.documentTenantId, dossierId: dossier._id, documentId: id, versions: [], currentVersionId: null },
      documentId: id,
    };
  }
  req.documentTenantId = stored.tenantId || req.tenantId;
  return {
    stored,
    // documentId est stable même si le client envoie l'identifiant du
    // conteneur StoredDocument au lieu de l'identifiant documentaire métier.
    documentId: objectId(stored.documentId || stored._id),
  };
}

async function synchronizeCanonical({
  req,
  stored,
  documentId,
  structuredDocument,
  createVersion = false,
  reason = 'manual',
  comment = '',
  status = 'draft',
  baseVersionId = null,
  sourceBuffer = null,
  sourceFilename = null,
  sourceMime = null,
  fileFormat = null,
  plainText = null,
  operationKey = null,
}) {
  const normalizedFormat = fileFormat?.kind === 'text'
    ? normalizeTextFileFormat(fileFormat, { filename: sourceFilename })
    : docxFileFormat(sourceFilename || fileFormat?.filename || `${structuredDocument.title || 'document'}.docx`);
  const textMode = normalizedFormat.kind === 'text';
  const encodedText = textMode && !sourceBuffer
    ? encodePlainTextBuffer(
      plainText == null ? structuredDocumentToPlainText(structuredDocument) : plainText,
      normalizedFormat,
    )
    : null;
  const buffer = sourceBuffer || encodedText?.buffer || createDocxBuffer(structuredDocument);
  const filename = sourceFilename
    || normalizedFormat.filename
    || `${structuredDocument.title || 'document'}${textMode ? '.txt' : '.docx'}`;
  const mime = sourceMime || (textMode ? TEXT_MIME : DOCX_MIME);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const tenantId = stored.tenantId || scopeTenantId(req);
  const dossierSupportsHistory = stored.dossierId
    && mongoose.Types.ObjectId.isValid(String(stored.dossierId));
  let result = null;

  // L'historique central est la source de vérité de toutes les routes de
  // lecture (réouverture Kheops, Word, Google Docs...). Il doit donc recevoir
  // chaque autosauvegarde modifiée, et pas uniquement les points de contrôle
  // créés manuellement. saveVersion déduplique déjà un nouvel essai strictement
  // identique, ce qui évite d'empiler des versions sans changement réel.
  //
  // On écrit l'historique AVANT la copie canonique dérivée : si le processus ou
  // le stockage secondaire tombe ensuite, aucune route ne peut servir une
  // ancienne version en la prenant pour la version courante.
  if (dossierSupportsHistory) {
    result = await saveHistoryVersion({
      tenantId,
      dossierId: stored.dossierId,
      documentId,
      userId: userObjectId(req),
      buffer,
      filename,
      mime,
      editor: 'kheops',
      origin: reason === 'import' ? 'import' : 'kheops',
      comment: String(comment || '').slice(0, 1000),
      status: status === 'approved'
        ? 'validated'
        : (DOCUMENT_STATUSES.has(status) ? status : 'draft'),
      baseVersionId,
      structuredDocument,
      operationKey,
    });
    if (result.conflict) {
      return {
        canonicalSynced: false,
        canonicalCopySynced: false,
        checksum: null,
        history: {
          versionId: result.version && result.version.versionId,
          conflict: true,
          deduplicated: Boolean(result.deduplicated),
        },
        message: 'Le brouillon est conservé comme version en conflit ; la version centrale courante n’a pas été remplacée.',
      };
    }
  }

  let canonicalCopySynced = true;
  try {
    await saveCanonicalDocument(documentId, buffer, mime, {
      tenantId,
      dossierId: stored.dossierId,
      filename,
    });
  } catch (err) {
    // Quand l'historique a été enregistré, cette copie n'est qu'un cache de
    // lecture. La version durable reste immédiatement accessible et ne doit
    // pas être réenregistrée (ce qui risquerait de fabriquer un faux conflit).
    if (!result) throw err;
    canonicalCopySynced = false;
    console.warn('[documentEditor] Copie canonique dérivée non mise à jour :', err.message);
    audit.failure(req, 'UPDATE', 'documentEditorCanonicalCopy', documentId, err.code || 'canonical-copy-failed');
  }

  return {
    // Ce champ historique signifie que le contenu central résolu par les
    // routes d'ouverture est à jour. Avec un historique courant, cela reste
    // vrai même si sa copie canonique dérivée doit être reconstruite.
    canonicalSynced: true,
    canonicalCopySynced,
    checksum,
    history: result ? {
      versionId: result.version && result.version.versionId,
      filename: result.version && result.version.filename,
      mime: result.version && result.version.mime,
      checksum: result.version && result.version.checksum,
      conflict: false,
      deduplicated: Boolean(result.deduplicated),
      idempotent: Boolean(result.idempotent),
      checkpoint: Boolean(createVersion),
    } : null,
  };
}

async function safeSynchronizeCanonical(options) {
  try {
    return await synchronizeCanonical(options);
  } catch (err) {
    // L'état structuré vient déjà d'être sauvegardé avec contrôle de révision.
    // Une panne du stockage de fichiers ne doit donc pas faire croire au
    // navigateur que le brouillon est perdu (un nouvel essai provoquerait un
    // faux conflit). On renvoie un avertissement explicite et l'autosave
    // suivant pourra reprendre la synchronisation canonique.
    console.error('[documentEditor] Synchronisation documentaire centrale impossible :', err.message);
    audit.failure(
      options.req,
      'UPDATE',
      'documentEditorCanonical',
      options.documentId,
      err.code || 'canonical-sync-failed',
    );
    return {
      canonicalSynced: false,
      checksum: null,
      history: null,
      message: 'Le brouillon est enregistré, mais sa copie centrale reste à synchroniser.',
    };
  }
}

function stateJson(state, revisions = []) {
  if (!state) return null;
  const value = state.toObject ? state.toObject() : state;
  const structuredDocument = normalizeStoredDocumentForClient(value.structuredDocument);
  const fileFormat = stateFileFormat(value, value.original?.filename || `${structuredDocument?.title || 'document'}.docx`);
  const textContent = fileFormat.kind === 'text'
    ? structuredDocumentToPlainText(structuredDocument)
    : null;
  return {
    id: String(value._id),
    documentId: String(value.documentId),
    document: structuredDocument,
    fileFormat,
    ...(fileFormat.kind === 'text' ? { textContent } : {}),
    revision: value.revision,
    status: value.status,
    documentType: value.documentType || structuredDocument?.documentType || 'generic',
    templateBinding: value.templateBinding || structuredDocument?.templateBinding || null,
    localOverrides: value.localOverrides || structuredDocument?.localOverrides || {},
    compatibility: value.compatibility,
    original: value.original ? {
      checksum: value.original.checksum || null,
      filename: value.original.filename || null,
      mime: value.original.mime || null,
      importedAt: value.original.importedAt || null,
      available: Boolean(value.original.ref),
    } : null,
    canonical: value.canonical ? {
      historyVersionId: value.canonical.historyVersionId || null,
      source: value.canonical.source || null,
      syncedAt: value.canonical.syncedAt || null,
      pending: Boolean(value.canonical.pending),
    } : { pending: false },
    lastSavedAt: value.lastSavedAt,
    lastSavedBy: value.lastSavedBy ? String(value.lastSavedBy) : null,
    counts: documentCounts(structuredDocument),
    revisions: revisions.map((item) => ({
      revision: item.revision,
      reason: item.reason,
      comment: item.comment || '',
      savedAt: item.savedAt,
      savedBy: item.savedBy ? String(item.savedBy) : null,
      status: item.status || null,
      restoredFromRevision: item.restoredFromRevision || null,
    })),
  };
}

function assignCanonical(state, canonical) {
  if (!state) return;
  if (typeof state.set === 'function') state.set('canonical', canonical);
  else state.canonical = canonical;
}

async function commitCanonicalFingerprint(state, sync, source = 'kheops') {
  if (!state || !sync || !sync.canonicalSynced || !sync.checksum) return state;
  const canonical = {
    checksum: sync.checksum,
    historyVersionId: sync.history?.versionId || null,
    source,
    syncedAt: new Date(),
    pending: false,
  };
  await DocumentEditorState.updateOne(
    { _id: state._id, revision: state.revision },
    { $set: { canonical } },
  );
  assignCanonical(state, canonical);
  return state;
}

function staleStateError(state, reason = 'Le fichier central a été modifié par un autre éditeur.') {
  const err = new Error(`${reason} Rechargez sa version actuelle avant de continuer dans l’Éditeur Kheops.`);
  err.statusCode = 409;
  err.code = 'EDITOR_STATE_STALE';
  err.editorRevision = Number(state && state.revision) || 0;
  return err;
}

async function verifyCanonicalFreshness(req, stored, documentId, state) {
  const current = (stored.versions || []).find((version) => String(version.versionId) === String(stored.currentVersionId))
    || (stored.versions || [])[stored.versions.length - 1];
  const content = await resolveDocumentContent({
    tenantId: stored.tenantId || scopeTenantId(req),
    dossierId: stored.dossierId,
    documentId,
    fallbackFilename: current && current.filename,
  });
  const canonical = state.canonical || {};
  if (!content || !content.buffer) {
    if (canonical.pending) return { syncPending: true };
    throw staleStateError(state, 'La copie centrale du document n’est plus disponible.');
  }
  const actualChecksum = crypto.createHash('sha256').update(content.buffer).digest('hex');
  if (canonical.checksum) {
    if (canonical.checksum !== actualChecksum) throw staleStateError(state);
    return { syncPending: Boolean(canonical.pending), actualChecksum };
  }

  // Migration des premiers états créés avant l'ajout de l'empreinte. On ne
  // leur fait confiance que si le canonique correspond soit à l'original
  // conservé, soit au DOCX déterministe régénéré depuis le modèle structuré.
  const format = stateFileFormat(state, content.filename);
  const generatedBuffer = format.kind === 'text'
    ? encodePlainTextBuffer(plainTextFromState(state), format).buffer
    : createDocxBuffer(state.structuredDocument);
  const generatedChecksum = crypto.createHash('sha256')
    .update(generatedBuffer)
    .digest('hex');
  const originalChecksum = state.original && state.original.checksum;
  if (actualChecksum !== generatedChecksum && actualChecksum !== originalChecksum) {
    throw staleStateError(state);
  }
  const migrated = {
    checksum: actualChecksum,
    historyVersionId: null,
    source: content.source || 'canonical',
    syncedAt: new Date(),
    pending: false,
  };
  await DocumentEditorState.updateOne(
    { _id: state._id, revision: state.revision },
    { $set: { canonical: migrated } },
  );
  assignCanonical(state, migrated);
  return { syncPending: false, actualChecksum };
}

function validateDocumentPayload(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    const err = new Error('Le modèle structuré du document est requis.');
    err.statusCode = 400;
    err.code = 'DOCUMENT_REQUIRED';
    throw err;
  }
  const bytes = Buffer.byteLength(JSON.stringify(document), 'utf8');
  if (bytes > MAX_DOCUMENT_JSON_BYTES) {
    const err = new Error('Le document éditable dépasse la limite de 6 Mo. Utilisez Word pour ce document complexe.');
    err.statusCode = 413;
    err.code = 'DOCUMENT_TOO_LARGE';
    throw err;
  }
  return normalizeStructuredDocument(document);
}

async function convertDocxBuffer(buffer, filename) {
  // PizZip et Mammoth ne doivent jamais recevoir une archive ambiguë, chiffrée
  // ou dont les tailles décompressées dépassent les budgets du service.
  assertSafeDocxPackage(buffer);
  const compatibility = analyzeDocx(buffer);
  if (compatibility.warnings[0] === 'Le fichier n’est pas un document DOCX valide.') {
    const err = new Error(compatibility.warnings[0]);
    err.statusCode = 415;
    err.code = 'INVALID_DOCX';
    throw err;
  }
  const converted = await mammoth.convertToHtml({ buffer }, {
    convertImage: mammoth.images.imgElement((image) => image.read('base64').then((data) => ({
      src: `data:${image.contentType};base64,${data}`,
    }))),
  });
  const title = cleanFilename(filename, 'document.docx').replace(/\.docx$/i, '');
  const structured = applyDocxPresentation(buffer, mammothHtmlToStructured(converted.value, title));
  return {
    compatibility,
    converted,
    structured: validateDocumentPayload(structured),
    fileFormat: docxFileFormat(filename),
    textContent: null,
  };
}

const LEGACY_WORD_VALIDATION_ERRORS = new Set([
  'LEGACY_DOC_CONTENT_UNAVAILABLE',
  'LEGACY_DOC_TOO_LARGE',
  'INVALID_LEGACY_DOC',
]);

function appendConversionWarning(converted, warning) {
  return {
    ...(converted || {}),
    messages: [
      ...((converted && Array.isArray(converted.messages)) ? converted.messages : []),
      { type: 'warning', message: warning },
    ],
  };
}

function legacyCompatibility(compatibility, warning, { fallback = false } = {}) {
  const current = compatibility && typeof compatibility === 'object' ? compatibility : {};
  const warnings = [
    ...(Array.isArray(current.warnings) ? current.warnings : []),
    warning,
  ].filter((value, index, values) => value && values.indexOf(value) === index);
  return {
    ...current,
    level: fallback || current.level !== 'complex' ? 'partial' : 'complex',
    label: fallback ? 'DOC historique — repli textuel' : 'DOC historique converti',
    warnings,
    analyzedAt: current.analyzedAt || new Date(),
  };
}

async function convertLegacyWordRich(content) {
  const docx = await convertLegacyWordToDocx(content.buffer, content.filename);
  const rich = await convertDocxBuffer(docx.buffer, docx.filename);
  const warning = 'Le fichier Word historique (.doc) a été converti en DOCX par LibreOffice avant son ouverture. L’original .doc est conservé sans modification.';
  return {
    ...rich,
    compatibility: legacyCompatibility(rich.compatibility, warning),
    converted: appendConversionWarning(rich.converted, warning),
    structured: { ...rich.structured, documentType: 'legacy-word' },
    fileFormat: docxFileFormat(docx.filename),
    textContent: null,
  };
}

async function convertLegacyWordWithFallback(content) {
  try {
    return await convertLegacyWordRich(content);
  } catch (error) {
    if (LEGACY_WORD_VALIDATION_ERRORS.has(error?.code)) throw error;

    // Un convertisseur absent, occupé, expiré ou un DOCX intermédiaire non
    // exploitable ne prive jamais l’utilisateur du contenu : le parseur texte
    // historique reste disponible, mais la dégradation est annoncée clairement.
    const fallback = await convertLegacyWordBuffer(content.buffer, content.filename);
    const warning = 'La conversion de mise en page par LibreOffice est indisponible ou a échoué. Un repli textuel a été utilisé : les tableaux, alignements, images et sauts de page peuvent être perdus.';
    return {
      ...fallback,
      compatibility: legacyCompatibility(fallback.compatibility, warning, { fallback: true }),
      converted: appendConversionWarning(fallback.converted, warning),
      fileFormat: docxFileFormat(content.filename),
      textContent: null,
    };
  }
}

async function convertResolvedContent(content) {
  if (isPlainTextContent(content)) {
    const decoded = decodePlainTextBuffer(content.buffer, content);
    return {
      compatibility: decoded.compatibility,
      converted: { messages: [] },
      structured: validateDocumentPayload(plainTextToStructuredDocument(decoded.text, content.filename)),
      fileFormat: decoded.fileFormat,
      textContent: decoded.text,
    };
  }
  if (isLegacyWordContent(content)) {
    return convertLegacyWordWithFallback(content);
  }
  if (content?.structuredDocument && typeof content.structuredDocument === 'object') {
    assertSafeDocxPackage(content.buffer);
    return {
      compatibility: analyzeDocx(content.buffer),
      converted: { messages: [] },
      structured: validateDocumentPayload(content.structuredDocument),
      fileFormat: docxFileFormat(content.filename),
      textContent: null,
    };
  }
  return convertDocxBuffer(content.buffer, content.filename);
}

function isEditableCanonicalContent(content) {
  return isPlainTextContent(content)
    || isLegacyWordContent(content)
    || /\.docx$/i.test(content?.filename || '')
    || content?.mime === DOCX_MIME;
}

function canonicalContentMime(content) {
  if (content?.mime) return content.mime;
  if (isPlainTextContent(content)) return TEXT_MIME;
  if (isLegacyWordContent(content)) return LEGACY_DOC_MIME;
  return DOCX_MIME;
}

async function preserveOriginal({ req, documentId, buffer, filename, mime = DOCX_MIME }) {
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error('Le contenu original du document est indisponible.');
    err.statusCode = 409;
    err.code = 'ORIGINAL_CONTENT_UNAVAILABLE';
    throw err;
  }
  if (buffer.length > MAX_IMPORT_BYTES) {
    const err = new Error('Ce document dépasse 8 Mo. Ouvrez-le dans Microsoft Word afin de préserver sa mise en page.');
    err.statusCode = 413;
    err.code = 'DOCUMENT_TOO_LARGE_FOR_EDITOR';
    throw err;
  }
  const safeName = cleanFilename(filename, 'document.docx');
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const originalDoc = await DocumentEditorOriginal.findOneAndUpdate(
    { tenantId: scopeTenantId(req), documentId, checksum },
    {
      $setOnInsert: {
        tenantId: scopeTenantId(req),
        documentId,
        checksum,
        filename: safeName,
        mime: mime || DOCX_MIME,
        size: buffer.length,
        data: buffer,
        importedBy: userObjectId(req),
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
  return {
    ref: originalDoc._id,
    checksum,
    filename: safeName,
    mime: mime || DOCX_MIME,
    importedAt: originalDoc.importedAt || new Date(),
  };
}

async function bootstrapFromCanonical(req, stored, documentId) {
  const current = (stored.versions || []).find((version) => String(version.versionId) === String(stored.currentVersionId))
    || (stored.versions || [])[stored.versions.length - 1];
  const content = await resolveDocumentContent({
    tenantId: stored.tenantId || scopeTenantId(req),
    dossierId: stored.dossierId,
    documentId,
    fallbackFilename: current && current.filename,
  });
  if (!content || !content.buffer) return null;
  if (!isEditableCanonicalContent(content)) {
    const err = new Error('Ce format ne peut pas être modifié dans l’Éditeur Kheops. Utilisez l’application adaptée ou téléchargez le fichier.');
    err.statusCode = 415;
    err.code = 'UNSUPPORTED_EDITOR_FORMAT';
    throw err;
  }

  // Ordre volontaire : 1) préserver les octets exacts, 2) convertir,
  // 3) créer l'état éditable. Ainsi, même si Mammoth ou MongoDB échoue ensuite,
  // le fichier qui existait avant l'ouverture n'est jamais écrasé.
  const original = await preserveOriginal({
    req,
    documentId,
    buffer: content.buffer,
    filename: content.filename,
    mime: canonicalContentMime(content),
  });
  const { compatibility, structured, fileFormat } = await convertResolvedContent(content);
  try {
    const state = await DocumentEditorState.create({
      tenantId: scopeTenantId(req),
      documentId,
      structuredDocument: structured,
      revision: 1,
      status: 'draft',
      compatibility,
      original,
      fileFormat,
      canonical: {
        checksum: original.checksum,
        historyVersionId: null,
        source: content.source || 'canonical',
        syncedAt: new Date(),
        pending: false,
      },
      lastSavedBy: userObjectId(req),
      lastSavedAt: new Date(),
    });
    audit.create(req, 'documentEditorBootstrap', documentId, {
      source: content.source,
      filename: content.filename,
      checksum: original.checksum,
      originalPreserved: true,
      canonicalOverwritten: false,
    });
    return state;
  } catch (err) {
    // Deux ouvertures simultanées peuvent tenter le bootstrap. La contrainte
    // unique tenant/document départage les deux ; on retourne l'état gagnant.
    if (err && err.code === 11000) {
      return DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId });
    }
    throw err;
  }
}

async function persistDocument({
  req,
  canonicalId,
  document,
  expectedRevision,
  status,
  compatibility,
  original,
  createVersion = false,
  reason = 'manual',
  comment = '',
  documentType,
  templateBinding,
  localOverrides,
  fileFormat,
}) {
  const normalized = validateDocumentPayload(document);
  const existing = await DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId: canonicalId });
  const currentRevision = existing ? Number(existing.revision || 0) : 0;
  if (expectedRevision !== undefined && expectedRevision !== null && Number(expectedRevision) !== currentRevision) {
    const err = new Error('Le document a été modifié ailleurs. Rechargez-le avant d’enregistrer vos changements.');
    err.statusCode = 409;
    err.code = 'REVISION_CONFLICT';
    err.currentRevision = currentRevision;
    throw err;
  }
  const nextRevision = currentRevision + 1;
  const userId = userObjectId(req);
  const normalizedFileFormat = fileFormat?.kind === 'text'
    ? normalizeTextFileFormat(fileFormat, existing?.fileFormat)
    : (fileFormat ? docxFileFormat(fileFormat.filename) : stateFileFormat(existing, `${normalized.title}.docx`));
  let saved;
  if (!existing) {
    saved = await DocumentEditorState.create({
      tenantId: scopeTenantId(req),
      documentId: canonicalId,
      structuredDocument: normalized,
      revision: nextRevision,
      status: normalizeDocumentStatus(status),
      documentType: normalizeDocumentType(documentType || normalized.documentType),
      templateBinding: templateBinding || normalized.templateBinding || undefined,
      localOverrides: localOverrides || normalized.localOverrides || undefined,
      compatibility: compatibility || undefined,
      original: original || undefined,
      canonical: { checksum: null, pending: true },
      fileFormat: normalizedFileFormat,
      lastSavedBy: userId,
      lastSavedAt: new Date(),
    });
  } else {
    const set = {
      structuredDocument: normalized,
      lastSavedBy: userId,
      lastSavedAt: new Date(),
      'canonical.pending': true,
    };
    if (DOCUMENT_STATUSES.has(status)) set.status = status;
    if (documentType || normalized.documentType) set.documentType = normalizeDocumentType(documentType || normalized.documentType);
    if (templateBinding || normalized.templateBinding) set.templateBinding = templateBinding || normalized.templateBinding;
    if (localOverrides || normalized.localOverrides) set.localOverrides = localOverrides || normalized.localOverrides;
    if (compatibility) set.compatibility = compatibility;
    if (original) set.original = original;
    if (fileFormat) set.fileFormat = normalizedFileFormat;
    saved = await DocumentEditorState.findOneAndUpdate(
      { _id: existing._id, revision: currentRevision },
      { $set: set, $inc: { revision: 1 } },
      { new: true, runValidators: true },
    );
    if (!saved) {
      const err = new Error('Le document a été modifié ailleurs. Rechargez-le avant d’enregistrer vos changements.');
      err.statusCode = 409;
      err.code = 'REVISION_CONFLICT';
      throw err;
    }
  }
  if (createVersion) {
    await DocumentEditorRevision.create({
      tenantId: scopeTenantId(req),
      documentId: canonicalId,
      revision: nextRevision,
      structuredDocument: normalized,
      reason: ['manual', 'import', 'validation', 'ai_proposal', 'template', 'status', 'restore', 'comment'].includes(reason) ? reason : 'manual',
      comment: String(comment || '').slice(0, 500),
      savedBy: userId,
      status: normalizeDocumentStatus(status, saved.status || 'draft'),
    });
  }
  return saved;
}

function commentToClient(comment) {
  const value = typeof comment?.toObject === 'function' ? comment.toObject() : comment;
  return {
    id: String(value._id),
    parentId: value.parentId ? String(value.parentId) : null,
    body: value.body,
    anchor: value.anchor || {},
    mentions: (value.mentions || []).map(String),
    status: value.status,
    createdBy: value.createdBy ? String(value.createdBy) : null,
    resolvedBy: value.resolvedBy ? String(value.resolvedBy) : null,
    resolvedAt: value.resolvedAt || null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

async function buildReferenceCandidates(req, stored, documentId) {
  const dossierId = stored.dossierId;
  if (!dossierId) return [];
  const dossier = await Dossier.findById(dossierId).select('_id dossier.documents subfolders').lean();
  const documents = (dossier?.dossier?.documents || []).filter((document) => String(document._id) !== String(documentId));
  const ids = documents.map((document) => document._id);
  if (!ids.length) return [];
  const tenantId = stored.tenantId || scopeTenantId(req);
  const [histories, storedDocuments] = await Promise.all([
    DocumentHistory.find({ tenantId, dossierId, documentId: { $in: ids } }).lean(),
    StoredDocument.find({ tenantId, dossierId, documentId: { $in: ids }, deletedAt: null })
      .select('documentId versions currentVersionId').lean(),
  ]);
  const historyByDocument = new Map(histories.map((history) => [String(history.documentId), history]));
  const storedByDocument = new Map(storedDocuments.map((document) => [String(document.documentId), document]));
  const subfolderById = new Map((dossier?.subfolders || []).map((folder) => [String(folder._id), folder.name]));
  return documents.map((document) => {
    const history = historyByDocument.get(String(document._id));
    const storedDocument = storedByDocument.get(String(document._id));
    const rawVersions = history?.versions?.length ? history.versions : (storedDocument?.versions || []);
    const currentVersionId = history?.currentVersionId || storedDocument?.currentVersionId || null;
    return {
      documentId: String(document._id),
      dossierId: String(dossierId),
      title: document.nomDocument || 'Document sans titre',
      type: document.categorie || 'document',
      date: document.dateCreation || null,
      subfolderId: document.subfolderId ? String(document.subfolderId) : null,
      subfolderName: document.subfolderId ? (subfolderById.get(String(document.subfolderId)) || document.subfolderName || '') : '',
      pieceNumber: document.pieceNumber || '',
      currentVersionId,
      versions: rawVersions.map((version) => ({
        versionId: String(version.versionId),
        createdAt: version.createdAt || null,
        status: version.status || 'draft',
        editor: version.editor || null,
        filename: version.filename || document.nomDocument || 'document',
      })).reverse(),
    };
  });
}

// -------------------------------------------------------------------------
// Modèles documentaires versionnés
// -------------------------------------------------------------------------
router.get('/templates', async (req, res) => {
  try {
    const filter = { tenantId: req.tenantId };
    if (req.query.documentType) filter.documentType = { $in: [normalizeDocumentType(req.query.documentType), 'generic'] };
    if (req.query.includeArchived !== 'true') filter.active = true;
    const rows = await DocumentTemplate.find(filter).sort({ templateKey: 1, version: -1 }).lean();
    const latestOnly = req.query.allVersions !== 'true';
    const seen = new Set();
    const templates = rows.filter((row) => {
      if (!latestOnly) return true;
      if (seen.has(row.templateKey)) return false;
      seen.add(row.templateKey);
      return true;
    }).map(templateToClient);
    return res.json({ templates });
  } catch (err) {
    return responseError(res, err);
  }
});

router.get('/templates/resolve', async (req, res) => {
  try {
    const template = await resolveTemplate({
      tenantId: req.tenantId,
      context: {
        documentType: req.query.documentType,
        jurisdiction: req.query.jurisdiction,
        team: req.query.team,
        responsibleLawyerId: req.query.responsibleLawyerId,
        language: req.query.language,
        tags: String(req.query.tags || '').split(',').filter(Boolean),
      },
    });
    return res.json({ template: templateToClient(template) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.post('/templates', async (req, res) => {
  try {
    if (!(await ensureCabinetRole(req, res, [ROLES.OWNER, ROLES.ADMIN], 'Seul un administrateur peut créer un modèle documentaire partagé.'))) return undefined;
    const template = await createTemplateVersion({ tenantId: req.tenantId, userId: userObjectId(req), payload: req.body || {} });
    audit.create(req, 'document-template', template._id, { templateKey: template.templateKey, version: template.version });
    return res.status(201).json({ template: templateToClient(template) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.post('/templates/:templateKey/versions', async (req, res) => {
  try {
    if (!(await ensureCabinetRole(req, res, [ROLES.OWNER, ROLES.ADMIN], 'Seul un administrateur peut versionner un modèle documentaire partagé.'))) return undefined;
    const template = await createTemplateVersion({
      tenantId: req.tenantId,
      userId: userObjectId(req),
      payload: req.body || {},
      key: req.params.templateKey,
    });
    audit.create(req, 'document-template-version', template._id, { templateKey: template.templateKey, version: template.version });
    return res.status(201).json({ template: templateToClient(template) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.patch('/templates/:templateKey/versions/:version', async (req, res) => {
  try {
    if (!(await ensureCabinetRole(req, res, [ROLES.OWNER, ROLES.ADMIN], 'Seul un administrateur peut activer ou archiver un modèle partagé.'))) return undefined;
    const active = req.body?.active;
    if (typeof active !== 'boolean') return res.status(400).json({ error: 'ACTIVE_REQUIRED', message: 'Le statut actif du modèle est requis.' });
    const template = await DocumentTemplate.findOneAndUpdate(
      { tenantId: req.tenantId, templateKey: req.params.templateKey, version: Number(req.params.version) },
      { $set: { active } },
      { new: true, runValidators: true },
    );
    if (!template) return res.status(404).json({ error: 'TEMPLATE_NOT_FOUND', message: 'Modèle introuvable.' });
    audit.update(req, 'document-template-version', template._id, { active });
    return res.json({ template: templateToClient(template) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.post('/:documentId/template/apply', async (req, res) => {
  try {
    const { documentId, stored } = await resolveAccessibleDocument(req, req.params.documentId);
    let current = await DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId });
    if (!current) current = await bootstrapFromCanonical(req, stored, documentId);
    if (!current) return res.status(404).json({ error: 'EDITOR_STATE_NOT_FOUND', message: 'Ouvrez d’abord ce document dans l’Éditeur Kheops.' });
    if (isTextEditorState(current)) {
      throw textModeUnavailable('Les modèles avec mise en forme ne peuvent pas être appliqués à un fichier TXT. Le fichier restera en texte brut.');
    }
    if (Number(req.body?.expectedRevision) !== Number(current.revision)) {
      return res.status(409).json({ error: 'REVISION_CONFLICT', message: 'Le document a changé. Rechargez-le avant d’appliquer le modèle.', currentRevision: current.revision });
    }
    await verifyCanonicalFreshness(req, stored, documentId, current);
    const template = req.body?.templateKey
      ? await DocumentTemplate.findOne({
        tenantId: scopeTenantId(req),
        templateKey: req.body.templateKey,
        ...(req.body.version ? { version: Number(req.body.version) } : {}),
        active: true,
      }).sort({ version: -1 })
      : await resolveTemplate({ tenantId: scopeTenantId(req), context: req.body?.context || { documentType: current.documentType } });
    if (!template) return res.status(404).json({ error: 'TEMPLATE_NOT_FOUND', message: 'Aucun modèle applicable n’a été trouvé.' });
    const localOverrides = { ...(current.localOverrides?.toObject?.() || current.localOverrides || {}), ...(req.body?.localOverrides || {}) };
    const applied = applyTemplateToDocument(current.structuredDocument, template, {
      sections: req.body?.sections,
      localOverrides,
    });
    const binding = { templateKey: template.templateKey, version: template.version, appliedAt: new Date(), appliedBy: userObjectId(req) };
    const state = await persistDocument({
      req,
      canonicalId: documentId,
      document: applied,
      expectedRevision: current.revision,
      status: current.status,
      createVersion: true,
      reason: 'template',
      comment: `Modèle ${template.name} v${template.version} appliqué`,
      documentType: template.documentType,
      templateBinding: binding,
      localOverrides,
    });
    const sync = await safeSynchronizeCanonical({
      req, stored, documentId, structuredDocument: state.structuredDocument,
      createVersion: true, reason: 'template', comment: `Modèle ${template.name} v${template.version} appliqué`, status: state.status,
      fileFormat: stateFileFormat(state),
    });
    await commitCanonicalFingerprint(state, sync, 'template');
    audit.update(req, 'document-template-application', documentId, { templateKey: template.templateKey, version: template.version, sections: req.body?.sections || null });
    return res.json({ ok: true, template: templateToClient(template), ...stateJson(state), sync });
  } catch (err) {
    return responseError(res, err);
  }
});

// -------------------------------------------------------------------------
// Références structurées manuelles vers les pièces du même dossier
// -------------------------------------------------------------------------
router.get('/:documentId/reference-candidates', async (req, res) => {
  try {
    const { documentId, stored } = await resolveAccessibleDocument(req, req.params.documentId);
    let candidates = await buildReferenceCandidates(req, stored, documentId);
    const query = String(req.query.q || '').trim().toLocaleLowerCase('fr');
    if (query) candidates = candidates.filter((candidate) => `${candidate.title} ${candidate.type} ${candidate.pieceNumber} ${candidate.subfolderName}`.toLocaleLowerCase('fr').includes(query));
    if (req.query.type) candidates = candidates.filter((candidate) => candidate.type === req.query.type);
    if (req.query.subfolderId) candidates = candidates.filter((candidate) => candidate.subfolderId === req.query.subfolderId);
    return res.json({ candidates: candidates.slice(0, 300) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.get('/:documentId/references', async (req, res) => {
  try {
    const { documentId } = await resolveAccessibleDocument(req, req.params.documentId);
    const rows = await DocumentReference.find({ tenantId: scopeTenantId(req), sourceDocumentId: documentId }).sort({ createdAt: 1 }).lean();
    return res.json({ references: rows.map(referenceToClient) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.post('/:documentId/references', async (req, res) => {
  try {
    const { documentId, stored } = await resolveAccessibleDocument(req, req.params.documentId);
    const candidates = await buildReferenceCandidates(req, stored, documentId);
    const candidate = candidates.find((item) => item.documentId === String(req.body?.targetDocumentId));
    if (!candidate) return res.status(404).json({ error: 'REFERENCE_TARGET_NOT_FOUND', message: 'La pièce n’est pas accessible dans ce dossier.' });
    const followLatest = Boolean(req.body?.followLatest || candidate.versions.length === 0);
    const targetVersionId = choosePinnedVersion(candidate, req.body?.targetVersionId, followLatest);
    const userId = userObjectId(req);
    const created = await DocumentReference.create({
      tenantId: scopeTenantId(req),
      sourceDossierId: stored.dossierId,
      sourceDocumentId: documentId,
      targetDossierId: stored.dossierId,
      targetDocumentId: candidate.documentId,
      targetVersionId,
      followLatest,
      referenceType: req.body?.referenceType || 'piece',
      label: String(req.body?.label || (candidate.pieceNumber ? `Pièce n° ${candidate.pieceNumber}` : candidate.title)).slice(0, 300),
      pieceNumber: String(req.body?.pieceNumber || candidate.pieceNumber || '').slice(0, 80),
      targetSubfolderId: candidate.subfolderId,
      targetTitleSnapshot: candidate.title,
      createdBy: userId,
      updatedBy: userId,
    });
    audit.create(req, 'document-reference', created._id, { sourceDocumentId: String(documentId), targetDocumentId: candidate.documentId, targetVersionId });
    return res.status(201).json({ reference: referenceToClient(created), block: buildReferenceBlock(created) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.get('/:documentId/references/:referenceId/open', async (req, res) => {
  try {
    const { documentId } = await resolveAccessibleDocument(req, req.params.documentId);
    const reference = await DocumentReference.findOne({ tenantId: scopeTenantId(req), sourceDocumentId: documentId, referenceId: req.params.referenceId });
    if (!reference) return res.status(404).json({ error: 'REFERENCE_NOT_FOUND', message: 'Référence introuvable.' });
    const targetExists = await Dossier.exists({ _id: reference.targetDossierId, 'dossier.documents._id': reference.targetDocumentId });
    if (!targetExists) {
      reference.status = 'broken';
      await reference.save();
      return res.status(410).json({ error: 'REFERENCE_BROKEN', message: 'La pièce référencée n’existe plus dans le dossier.' });
    }
    const history = await DocumentHistory.findOne({
      tenantId: scopeTenantId(req),
      dossierId: reference.targetDossierId,
      documentId: reference.targetDocumentId,
    }).lean();
    let storedTarget = null;
    let resolvedVersionId = reference.followLatest ? history?.currentVersionId : reference.targetVersionId;
    if (!history || (reference.followLatest && !resolvedVersionId)) {
      storedTarget = await StoredDocument.findOne({
        tenantId: scopeTenantId(req), dossierId: reference.targetDossierId,
        documentId: reference.targetDocumentId, deletedAt: null,
      }).select('currentVersionId versions.versionId').lean();
      if (reference.followLatest) resolvedVersionId = storedTarget?.currentVersionId || null;
    }
    if (!reference.followLatest) {
      const available = history?.versions?.some((version) => String(version.versionId) === String(resolvedVersionId))
        || storedTarget?.versions?.some((version) => String(version.versionId) === String(resolvedVersionId));
      if (!available) {
        reference.status = 'broken';
        await reference.save();
        return res.status(410).json({ error: 'REFERENCE_VERSION_BROKEN', message: 'La version figée de cette pièce n’est plus disponible.' });
      }
    }
    return res.json({
      reference: referenceToClient(reference),
      target: {
        documentId: String(reference.targetDocumentId),
        dossierId: String(reference.targetDossierId),
        versionId: resolvedVersionId || null,
        downloadUrl: resolvedVersionId
          ? `/api/document-history/${reference.targetDocumentId}/versions/${encodeURIComponent(resolvedVersionId)}/download`
          : null,
      },
    });
  } catch (err) {
    return responseError(res, err);
  }
});

router.patch('/:documentId/references/:referenceId', async (req, res) => {
  try {
    const { documentId, stored } = await resolveAccessibleDocument(req, req.params.documentId);
    const reference = await DocumentReference.findOne({
      tenantId: scopeTenantId(req), sourceDocumentId: documentId, referenceId: req.params.referenceId,
    });
    if (!reference) return res.status(404).json({ error: 'REFERENCE_NOT_FOUND' });
    if (req.body?.label !== undefined) reference.label = String(req.body.label).slice(0, 300);
    if (req.body?.status && ['active', 'broken', 'denied'].includes(req.body.status)) reference.status = req.body.status;
    if (req.body?.followLatest !== undefined || req.body?.targetVersionId !== undefined) {
      const candidates = await buildReferenceCandidates(req, stored, documentId);
      const candidate = candidates.find((item) => item.documentId === String(reference.targetDocumentId));
      if (!candidate) return res.status(404).json({ error: 'REFERENCE_TARGET_NOT_FOUND', message: 'La pièce n’est plus accessible dans ce dossier.' });
      const followLatest = req.body?.followLatest !== undefined ? Boolean(req.body.followLatest) : Boolean(reference.followLatest);
      reference.followLatest = followLatest;
      reference.targetVersionId = choosePinnedVersion(
        candidate,
        req.body?.targetVersionId !== undefined ? req.body.targetVersionId : reference.targetVersionId,
        followLatest,
      );
      reference.status = 'active';
    }
    reference.updatedBy = userObjectId(req);
    await reference.save();
    audit.update(req, 'document-reference', reference._id, {
      targetVersionId: reference.targetVersionId,
      followLatest: reference.followLatest,
      status: reference.status,
    });
    return res.json({ reference: referenceToClient(reference), block: buildReferenceBlock(reference) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.delete('/:documentId/references/:referenceId', async (req, res) => {
  try {
    const { documentId } = await resolveAccessibleDocument(req, req.params.documentId);
    const removed = await DocumentReference.findOneAndDelete({ tenantId: scopeTenantId(req), sourceDocumentId: documentId, referenceId: req.params.referenceId });
    if (!removed) return res.status(404).json({ error: 'REFERENCE_NOT_FOUND' });
    audit.update(req, 'document-reference', removed._id, { deleted: true });
    return res.json({ ok: true });
  } catch (err) {
    return responseError(res, err);
  }
});

// -------------------------------------------------------------------------
// Commentaires simples et réponses
// -------------------------------------------------------------------------
router.get('/:documentId/comments', async (req, res) => {
  try {
    const { documentId } = await resolveAccessibleDocument(req, req.params.documentId);
    const filter = { tenantId: scopeTenantId(req), documentId };
    if (req.query.status && ['open', 'resolved'].includes(req.query.status)) filter.status = req.query.status;
    const comments = await DocumentEditorComment.find(filter).sort({ createdAt: 1 }).lean();
    return res.json({ comments: comments.map(commentToClient) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.post('/:documentId/comments', async (req, res) => {
  try {
    const { documentId, stored } = await resolveAccessibleDocument(req, req.params.documentId);
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'COMMENT_BODY_REQUIRED', message: 'Le commentaire ne peut pas être vide.' });
    const parentId = req.body?.parentId && mongoose.Types.ObjectId.isValid(String(req.body.parentId))
      ? objectId(req.body.parentId, 'Commentaire parent')
      : null;
    if (parentId) {
      const parentExists = await DocumentEditorComment.exists({
        _id: parentId, tenantId: scopeTenantId(req), documentId,
      });
      if (!parentExists) return res.status(404).json({ error: 'COMMENT_PARENT_NOT_FOUND', message: 'Le commentaire parent n’appartient pas à ce document.' });
    }
    const mentions = (Array.isArray(req.body?.mentions) ? req.body.mentions : [])
      .filter((id) => mongoose.Types.ObjectId.isValid(String(id))).slice(0, 50);
    const comment = await DocumentEditorComment.create({
      tenantId: scopeTenantId(req), documentId, dossierId: stored.dossierId,
      parentId,
      body,
      anchor: {
        blockId: req.body?.anchor?.blockId || null,
        start: Number.isFinite(Number(req.body?.anchor?.start)) ? Number(req.body.anchor.start) : null,
        end: Number.isFinite(Number(req.body?.anchor?.end)) ? Number(req.body.anchor.end) : null,
        quote: String(req.body?.anchor?.quote || '').slice(0, 1000),
      },
      mentions,
      createdBy: userObjectId(req),
    });
    audit.create(req, 'document-comment', comment._id, { documentId: String(documentId), parentId: comment.parentId || null });
    return res.status(201).json({ comment: commentToClient(comment) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.patch('/:documentId/comments/:commentId', async (req, res) => {
  try {
    const { documentId } = await resolveAccessibleDocument(req, req.params.documentId);
    const set = {};
    if (req.body?.body !== undefined) {
      const body = String(req.body.body).trim();
      if (!body) return res.status(400).json({ error: 'COMMENT_BODY_REQUIRED' });
      set.body = body;
    }
    if (req.body?.status && ['open', 'resolved'].includes(req.body.status)) {
      set.status = req.body.status;
      set.resolvedAt = req.body.status === 'resolved' ? new Date() : null;
      set.resolvedBy = req.body.status === 'resolved' ? userObjectId(req) : null;
    }
    const comment = await DocumentEditorComment.findOneAndUpdate(
      { _id: objectId(req.params.commentId, 'Commentaire'), tenantId: scopeTenantId(req), documentId },
      { $set: set },
      { new: true, runValidators: true },
    );
    if (!comment) return res.status(404).json({ error: 'COMMENT_NOT_FOUND' });
    audit.update(req, 'document-comment', comment._id, { status: comment.status });
    return res.json({ comment: commentToClient(comment) });
  } catch (err) {
    return responseError(res, err);
  }
});

// Interface serveur destinée aux intégrations de publication (notamment la
// messagerie). Elle fige d'abord une version immuable avec précondition de
// révision et clé d'idempotence, puis décrit honnêtement les artefacts prêts.
// Aucun envoi d'e-mail n'est effectué par cette route.
router.post('/:documentId/publications/prepare', async (req, res) => {
  try {
    const operationKey = (typeof req.get === 'function' && req.get('Idempotency-Key'))
      || req.body?.operationKey
      || null;
    if (!operationKey || !String(operationKey).trim()) {
      return res.status(400).json({
        error: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Une clé Idempotency-Key est requise pour préparer une publication sans créer de doublon.',
      });
    }
    const normalizedOperationKey = String(operationKey).trim();
    if (normalizedOperationKey.length > 180) {
      return res.status(400).json({
        error: 'IDEMPOTENCY_KEY_INVALID',
        message: 'La clé Idempotency-Key ne doit pas dépasser 180 caractères.',
      });
    }
    if (req.body?.expectedRevision === undefined || req.body?.expectedRevision === null) {
      return res.status(400).json({
        error: 'EXPECTED_REVISION_REQUIRED',
        message: 'La révision exacte du document est requise avant de préparer sa publication.',
      });
    }
    const formats = normalizePublicationFormats(req.body?.formats || req.body?.format);
    const { documentId, stored } = await resolveAccessibleDocument(req, req.params.documentId);
    let state = await DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId });
    if (!state) state = await bootstrapFromCanonical(req, stored, documentId);
    if (!state) {
      return res.status(404).json({
        error: 'EDITOR_STATE_NOT_FOUND',
        message: 'Ce document ne possède pas encore de contenu publiable.',
      });
    }
    const expectedRevision = Number(req.body.expectedRevision);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      return res.status(400).json({ error: 'INVALID_EXPECTED_REVISION', message: 'La révision attendue est invalide.' });
    }
    if (expectedRevision !== Number(state.revision)) {
      return res.status(409).json({
        error: 'REVISION_CONFLICT',
        message: 'Le document a changé. Rechargez sa dernière révision avant de préparer la publication.',
        currentRevision: state.revision,
      });
    }
    await verifyCanonicalFreshness(req, stored, documentId, state);
    const sync = await safeSynchronizeCanonical({
      req,
      stored,
      documentId,
      structuredDocument: state.structuredDocument,
      createVersion: true,
      reason: 'publication',
      comment: String(req.body?.comment || 'Version exacte gelée pour publication').slice(0, 500),
      status: state.status,
      baseVersionId: state.canonical?.historyVersionId || stored.currentVersionId || null,
      operationKey: normalizedOperationKey,
      fileFormat: stateFileFormat(state),
      plainText: isTextEditorState(state) ? plainTextFromState(state) : null,
    });
    if (!sync.canonicalSynced || !sync.history?.versionId) {
      const err = new Error(sync.message || 'La version exacte n’a pas pu être gelée dans l’historique documentaire.');
      err.statusCode = 503;
      err.code = 'PUBLICATION_FREEZE_FAILED';
      throw err;
    }
    await commitCanonicalFingerprint(state, sync, 'publication');
    const version = {
      versionId: sync.history.versionId,
      filename: sync.history.filename || stateFileFormat(state).filename,
      mime: sync.history.mime || stateFileFormat(state).mime,
      checksum: sync.history.checksum || sync.checksum,
    };
    const publication = await preparePublicationArtifacts({
      tenantId: scopeTenantId(req),
      dossierId: stored.dossierId,
      documentId,
      versionId: version.versionId,
      revision: state.revision,
      formats,
      title: state.structuredDocument?.title,
      structuredDocument: state.structuredDocument,
      createdBy: userObjectId(req),
    });
    const artifacts = publication.artifacts;
    const idempotent = Boolean(
      (sync.history.deduplicated || sync.history.idempotent)
      && publication.reused
    );
    audit.create(req, 'document-publication', documentId, {
      revision: state.revision,
      versionId: version.versionId,
      formats,
      operationKey: normalizedOperationKey,
      pdfReady: Boolean(artifacts.pdf.ready),
    });
    return res.status(idempotent ? 200 : 201).json({
      ok: true,
      documentId: String(documentId),
      revision: state.revision,
      operationKey: normalizedOperationKey,
      frozenVersion: version,
      artifacts,
      idempotent,
    });
  } catch (err) {
    audit.failure(req, 'CREATE', 'document-publication', req.params.documentId, err.code || 'publication-prepare-failed');
    return responseError(res, err);
  }
});

// Téléchargement authentifié d'un artefact immuable. L'identifiant seul ne
// suffit jamais : cabinet, dossier et document sont tous recroisés après le
// contrôle d'accès au document demandé dans l'URL.
router.get('/:documentId/publications/:artifactId/download', async (req, res) => {
  try {
    const { documentId, stored } = await resolveAccessibleDocument(req, req.params.documentId);
    const found = await readPublicationArtifact({
      tenantId: scopeTenantId(req),
      dossierId: stored.dossierId,
      documentId,
      artifactId: req.params.artifactId,
    });
    if (!found) {
      return res.status(404).json({
        error: 'PUBLICATION_ARTIFACT_NOT_FOUND',
        message: 'Artefact de publication introuvable pour ce document.',
      });
    }
    const artifact = found.artifact.toObject ? found.artifact.toObject() : found.artifact;
    res.setHeader('Content-Type', artifact.mime || 'application/octet-stream');
    res.setHeader('Content-Length', String(found.buffer.length));
    res.setHeader('Content-Disposition', attachmentDisposition(artifact.filename || `document.${artifact.format || 'bin'}`));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('ETag', `"sha256-${artifact.checksum}"`);
    audit.log({
      action: 'READ',
      entityType: 'document-publication',
      entityId: artifact._id,
      extra: {
        documentId: String(documentId),
        dossierId: String(stored.dossierId),
        versionId: artifact.versionId,
        format: artifact.format,
      },
    }, req);
    return res.send(found.buffer);
  } catch (err) {
    audit.failure(req, 'READ', 'document-publication', req.params.artifactId, err.code || 'publication-download-failed');
    return responseError(res, err);
  }
});

// Analyse ponctuelle avant import. Aucun fichier ni contenu n'est conservé.
router.post('/compatibility', receiveDocx, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'FILE_REQUIRED', message: 'Sélectionnez un fichier DOCX.' });
    }
    assertSafeDocxPackage(req.file.buffer);
    return res.json({ compatibility: analyzeDocx(req.file.buffer) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.get('/:documentId', async (req, res) => {
  try {
    const { documentId, stored } = await resolveAccessibleDocument(req, req.params.documentId);
    let state = await DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId });
    if (!state) state = await bootstrapFromCanonical(req, stored, documentId);
    if (!state) return res.json({ exists: false, documentId: String(documentId) });
    const freshness = await verifyCanonicalFreshness(req, stored, documentId, state);
    const revisions = await DocumentEditorRevision.find({ tenantId: scopeTenantId(req), documentId })
      .select('revision reason comment savedAt savedBy status restoredFromRevision')
      .sort({ revision: -1 })
      .limit(30)
      .lean();
    return res.json({ exists: true, ...stateJson(state, revisions), syncPending: Boolean(freshness.syncPending) });
  } catch (err) {
    return responseError(res, err);
  }
});

router.put('/:documentId', async (req, res) => {
  try {
    const { documentId, stored } = await resolveAccessibleDocument(req, req.params.documentId);
    let currentState = await DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId });
    if (currentState) {
      const requestedRevision = req.body && req.body.expectedRevision;
      if (requestedRevision !== undefined && requestedRevision !== null
        && Number(requestedRevision) !== Number(currentState.revision)) {
        const err = new Error('Le document a été modifié ailleurs. Rechargez-le avant d’enregistrer vos changements.');
        err.statusCode = 409;
        err.code = 'REVISION_CONFLICT';
        err.currentRevision = currentState.revision;
        throw err;
      }
      // Vérification juste avant l'écriture : couvre aussi une modification
      // externe survenue pendant que la modale Kheops était ouverte.
      await verifyCanonicalFreshness(req, stored, documentId, currentState);
    } else {
      currentState = await bootstrapFromCanonical(req, stored, documentId);
      if (currentState) {
        const err = new Error('Le document existant vient d’être importé en toute sécurité. Rechargez-le avant d’enregistrer.');
        err.statusCode = 409;
        err.code = 'EDITOR_BOOTSTRAP_REQUIRED';
        throw err;
      }
    }
    await assertStatusTransition(
      req,
      stored,
      currentState?.status || 'draft',
      req.body && req.body.status,
    );
    const currentFormat = stateFileFormat(currentState);
    const requestedPlainText = currentFormat.kind === 'text'
      ? normalizePlainText(req.body && req.body.plainText)
      : null;
    const documentPayload = currentFormat.kind === 'text'
      ? plainTextToStructuredDocument(
        requestedPlainText,
        req.body?.document?.title || currentState?.structuredDocument?.title || currentFormat.filename,
      )
      : (req.body && req.body.document);
    const nextFileFormat = currentFormat.kind === 'text'
      ? normalizeTextFileFormat({
        ...currentFormat,
        mixedLineEndings: false,
        finalNewline: requestedPlainText.endsWith('\n'),
      }, currentFormat)
      : currentFormat;
    const state = await persistDocument({
      req,
      canonicalId: documentId,
      document: documentPayload,
      expectedRevision: req.body && req.body.expectedRevision,
      status: req.body && req.body.status,
      createVersion: Boolean(req.body && req.body.createVersion),
      reason: req.body && req.body.reason,
      comment: req.body && req.body.comment,
      documentType: req.body && req.body.documentType,
      templateBinding: req.body && req.body.templateBinding,
      localOverrides: req.body && req.body.localOverrides,
      fileFormat: nextFileFormat,
    });
    const sync = await safeSynchronizeCanonical({
      req,
      stored,
      documentId,
      structuredDocument: state.structuredDocument,
      createVersion: Boolean(req.body && req.body.createVersion),
      reason: req.body && req.body.reason,
      comment: req.body && req.body.comment,
      status: state.status,
      baseVersionId: req.body && req.body.baseVersionId,
      fileFormat: stateFileFormat(state),
      plainText: requestedPlainText,
    });
    await commitCanonicalFingerprint(state, sync, 'kheops');
    audit.update(req, 'documentEditor', documentId, {
      revision: state.revision,
      checkpoint: Boolean(req.body && req.body.createVersion),
      editor: 'kheops',
    });
    return res.json({ ok: true, ...stateJson(state), sync });
  } catch (err) {
    if (err && err.code === 'REVISION_CONFLICT') {
      return res.status(409).json({ error: err.code, message: err.message, currentRevision: err.currentRevision });
    }
    audit.failure(req, 'UPDATE', 'documentEditor', req.params.documentId, err.code || 'save-failed');
    return responseError(res, err);
  }
});

// Recharge explicitement le modèle Kheops depuis la copie canonique après une
// modification Word/Google ou une promotion d'historique. L'ancien modèle est
// conservé comme révision avant remplacement ; le DOCX externe exact devient
// un nouvel original téléchargeable. Aucun octet canonique n'est réécrit ici.
router.post('/:documentId/reload-canonical', async (req, res) => {
  try {
    const { documentId, stored } = await resolveAccessibleDocument(req, req.params.documentId);
    const state = await DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId });
    if (!state) {
      return res.status(404).json({ error: 'EDITOR_STATE_NOT_FOUND', message: 'Aucun brouillon Kheops à recharger.' });
    }
    const expected = req.body && req.body.expectedRevision;
    if (expected !== undefined && expected !== null && Number(expected) !== Number(state.revision)) {
      return res.status(409).json({
        error: 'REVISION_CONFLICT',
        message: 'Le brouillon Kheops a changé. Rechargez la page avant de continuer.',
        currentRevision: state.revision,
      });
    }
    const localDraft = req.body && req.body.localDraft
      ? validateDocumentPayload(req.body.localDraft)
      : null;
    const current = (stored.versions || []).find((version) => String(version.versionId) === String(stored.currentVersionId))
      || (stored.versions || [])[stored.versions.length - 1];
    const content = await resolveDocumentContent({
      tenantId: stored.tenantId || scopeTenantId(req),
      dossierId: stored.dossierId,
      documentId,
      fallbackFilename: current && current.filename,
    });
    if (!content || !content.buffer) throw staleStateError(state, 'La copie centrale du document n’est plus disponible.');
    if (!isEditableCanonicalContent(content)) {
      const err = new Error('La nouvelle version n’est ni un document Word (.doc ou .docx), ni un fichier texte brut modifiable dans l’Éditeur Kheops.');
      err.statusCode = 415;
      err.code = 'UNSUPPORTED_EDITOR_FORMAT';
      throw err;
    }
    const original = await preserveOriginal({
      req,
      documentId,
      buffer: content.buffer,
      filename: content.filename,
      mime: canonicalContentMime(content),
    });
    const { compatibility, structured, fileFormat } = await convertResolvedContent(content);
    const archivedRevision = localDraft ? state.revision + 1 : state.revision;
    try {
      await DocumentEditorRevision.create({
        tenantId: scopeTenantId(req),
        documentId,
        revision: archivedRevision,
        structuredDocument: localDraft || state.structuredDocument,
        reason: 'import',
        comment: localDraft
          ? 'Brouillon local non enregistré conservé avant rechargement d’une modification externe'
          : 'Copie Kheops conservée avant rechargement d’une modification externe',
        savedBy: userObjectId(req),
      });
    } catch (revisionError) {
      // Un doublon de la révision serveur historique est bénin. En revanche,
      // ne jamais absorber un doublon du brouillon DOM : sans preuve de son
      // archivage exact, le rechargement doit s'arrêter.
      if (!revisionError || revisionError.code !== 11000 || localDraft) throw revisionError;
    }
    const canonical = {
      checksum: original.checksum,
      historyVersionId: null,
      source: content.source || 'canonical-external',
      syncedAt: new Date(),
      pending: false,
    };
    const updated = await DocumentEditorState.findOneAndUpdate(
      { _id: state._id, revision: state.revision },
      {
        $set: {
          structuredDocument: structured,
          status: 'draft',
          documentType: normalizeDocumentType(structured.documentType),
          templateBinding: structured.templateBinding || null,
          localOverrides: structured.localOverrides || {},
          compatibility,
          original,
          canonical,
          fileFormat,
          lastSavedBy: userObjectId(req),
          lastSavedAt: new Date(),
        },
        $inc: { revision: localDraft ? 2 : 1 },
      },
      { new: true, runValidators: true },
    );
    if (!updated) {
      const err = new Error('Le brouillon Kheops a changé pendant le rechargement. Réessayez.');
      err.statusCode = 409;
      err.code = 'REVISION_CONFLICT';
      throw err;
    }
    audit.update(req, 'documentEditorReload', documentId, {
      previousRevision: state.revision,
      newRevision: updated.revision,
      source: content.source,
      checksum: original.checksum,
      previousStructuredStatePreserved: true,
      unsavedLocalDraftPreserved: Boolean(localDraft),
    });
    return res.json({
      ok: true,
      ...stateJson(updated),
      syncPending: false,
      unsavedLocalDraftPreserved: Boolean(localDraft),
    });
  } catch (err) {
    return responseError(res, err);
  }
});

// Les états DOC créés avant la conversion structurée restent volontairement
// inchangés jusqu'à une action explicite. Cette route reconstruit leur modèle
// éditable depuis les octets originaux conservés, archive d'abord l'état
// courant (et le brouillon DOM éventuel), puis marque le canonique comme en
// attente. Elle ne réécrit donc jamais le fichier central sans un Enregistrer
// ultérieur de l'utilisateur.
router.post('/:documentId/reconvert-original', async (req, res) => {
  try {
    const { documentId } = await resolveAccessibleDocument(req, req.params.documentId);
    const state = await DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId });
    if (!state) {
      return res.status(404).json({ error: 'EDITOR_STATE_NOT_FOUND', message: 'Aucun brouillon Kheops à reconvertir.' });
    }
    const expected = req.body && req.body.expectedRevision;
    if (expected !== undefined && expected !== null && Number(expected) !== Number(state.revision)) {
      return res.status(409).json({
        error: 'REVISION_CONFLICT',
        message: 'Le brouillon Kheops a changé. Rechargez la page avant de continuer.',
        currentRevision: state.revision,
      });
    }
    if (!state.original?.ref) {
      return res.status(404).json({ error: 'ORIGINAL_NOT_FOUND', message: 'Le document .doc original conservé est introuvable.' });
    }

    const original = await DocumentEditorOriginal.findOne({
      _id: state.original.ref,
      tenantId: scopeTenantId(req),
      documentId,
    });
    if (!original) {
      return res.status(404).json({ error: 'ORIGINAL_NOT_FOUND', message: 'Le document .doc original conservé est introuvable.' });
    }
    const originalContent = {
      buffer: Buffer.isBuffer(original.data) ? original.data : Buffer.from(original.data || []),
      filename: original.filename,
      mime: original.mime,
    };
    if (!isLegacyWordContent(originalContent)) {
      return res.status(415).json({
        error: 'LEGACY_DOC_REQUIRED',
        message: 'La reconversion depuis l’original est réservée aux anciens documents Word au format .doc.',
      });
    }

    const localDraft = req.body && req.body.localDraft
      ? validateDocumentPayload(req.body.localDraft)
      : null;
    // Contrairement au bootstrap, une reconversion demandée pour améliorer la
    // fidélité ne doit jamais remplacer le modèle existant par le repli textuel.
    // Si LibreOffice est indisponible, l'état courant demeure donc intact.
    const { compatibility, structured, fileFormat } = await convertLegacyWordRich(originalContent);
    const archivedRevision = localDraft ? state.revision + 1 : state.revision;
    try {
      await DocumentEditorRevision.create({
        tenantId: scopeTenantId(req),
        documentId,
        revision: archivedRevision,
        structuredDocument: localDraft || state.structuredDocument,
        reason: 'import',
        comment: localDraft
          ? 'Brouillon local non enregistré conservé avant reconversion du DOC original'
          : 'Copie Kheops conservée avant reconversion du DOC original',
        savedBy: userObjectId(req),
      });
    } catch (revisionError) {
      if (!revisionError || revisionError.code !== 11000 || localDraft) throw revisionError;
    }

    const canonicalValue = state.canonical?.toObject
      ? state.canonical.toObject()
      : { ...(state.canonical || {}) };
    const updated = await DocumentEditorState.findOneAndUpdate(
      { _id: state._id, revision: state.revision },
      {
        $set: {
          structuredDocument: structured,
          status: 'draft',
          documentType: normalizeDocumentType(structured.documentType),
          templateBinding: structured.templateBinding || null,
          localOverrides: structured.localOverrides || {},
          compatibility,
          fileFormat,
          canonical: { ...canonicalValue, pending: true },
          lastSavedBy: userObjectId(req),
          lastSavedAt: new Date(),
        },
        $inc: { revision: localDraft ? 2 : 1 },
      },
      { new: true, runValidators: true },
    );
    if (!updated) {
      const err = new Error('Le brouillon Kheops a changé pendant la reconversion. Réessayez.');
      err.statusCode = 409;
      err.code = 'REVISION_CONFLICT';
      throw err;
    }
    audit.update(req, 'documentEditorOriginalReconversion', documentId, {
      previousRevision: state.revision,
      newRevision: updated.revision,
      originalChecksum: original.checksum,
      originalPreserved: true,
      canonicalOverwritten: false,
      previousStructuredStatePreserved: true,
      unsavedLocalDraftPreserved: Boolean(localDraft),
    });
    return res.json({
      ok: true,
      ...stateJson(updated),
      syncPending: true,
      originalReconverted: true,
      unsavedLocalDraftPreserved: Boolean(localDraft),
    });
  } catch (err) {
    audit.failure(req, 'UPDATE', 'documentEditorOriginalReconversion', req.params.documentId, err.code || 'reconversion-failed');
    return responseError(res, err);
  }
});

router.post('/:documentId/import', receiveDocx, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'FILE_REQUIRED', message: 'Sélectionnez un fichier DOCX.' });
    }
    const filename = cleanFilename(req.file.originalname);
    if (!/\.docx$/i.test(filename)) {
      return res.status(415).json({ error: 'DOCX_REQUIRED', message: 'Seuls les documents .docx peuvent être importés.' });
    }
    const { documentId, stored } = await resolveAccessibleDocument(req, req.params.documentId);
    const currentState = await DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId });
    if (currentState && isTextEditorState(currentState)) {
      throw textModeUnavailable('Un fichier Word ne peut pas remplacer silencieusement un fichier TXT. Créez un nouveau document DOCX pour conserver les deux formats.');
    }
    // Même garantie que lors du bootstrap : l'original exact est durablement
    // conservé avant de produire ou d'enregistrer le modèle éditable.
    const original = await preserveOriginal({
      req,
      documentId,
      buffer: req.file.buffer,
      filename,
      mime: DOCX_MIME,
    });
    const { compatibility, converted, structured } = await convertDocxBuffer(req.file.buffer, filename);
    const checksum = original.checksum;
    const state = await persistDocument({
      req,
      canonicalId: documentId,
      document: structured,
      expectedRevision: req.body && req.body.expectedRevision,
      compatibility,
      original,
      createVersion: true,
      reason: 'import',
      comment: 'Import du document Word original',
      fileFormat: docxFileFormat(filename),
    });
    const sync = await safeSynchronizeCanonical({
      req,
      stored,
      documentId,
      structuredDocument: state.structuredDocument,
      createVersion: true,
      reason: 'import',
      comment: 'Import du document Word original',
      status: state.status,
      baseVersionId: req.body && req.body.baseVersionId,
      sourceBuffer: req.file.buffer,
      sourceFilename: filename,
      sourceMime: DOCX_MIME,
      fileFormat: docxFileFormat(filename),
    });
    await commitCanonicalFingerprint(state, sync, 'import');
    audit.create(req, 'documentEditorImport', documentId, {
      filename,
      checksum,
      compatibility: compatibility.level,
      originalPreserved: true,
    });
    return res.status(201).json({
      ok: true,
      ...stateJson(state),
      sync,
      conversionMessages: (converted.messages || []).map((message) => message.message),
    });
  } catch (err) {
    audit.failure(req, 'CREATE', 'documentEditorImport', req.params.documentId, err.code || 'import-failed');
    return responseError(res, err);
  }
});

router.get('/:documentId/compatibility', async (req, res) => {
  try {
    const { documentId } = await resolveAccessibleDocument(req, req.params.documentId);
    const state = await DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId })
      .select('compatibility original')
      .lean();
    if (!state) return res.json({ compatibility: { level: 'native', label: 'Document Kheops', warnings: [] }, original: null });
    return res.json({ compatibility: state.compatibility, original: state.original || null });
  } catch (err) {
    return responseError(res, err);
  }
});

router.get('/:documentId/original', async (req, res) => {
  try {
    const { documentId } = await resolveAccessibleDocument(req, req.params.documentId);
    const state = await DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId }).select('original').lean();
    if (!state || !state.original || !state.original.ref) {
      return res.status(404).json({ error: 'ORIGINAL_NOT_FOUND', message: 'Aucun document original conservé.' });
    }
    const original = await DocumentEditorOriginal.findOne({
      _id: state.original.ref,
      tenantId: scopeTenantId(req),
      documentId,
    }).lean();
    if (!original) return res.status(404).json({ error: 'ORIGINAL_NOT_FOUND', message: 'Document original introuvable.' });
    res.setHeader('Content-Type', original.mime || DOCX_MIME);
    res.setHeader('Content-Disposition', attachmentDisposition(original.filename));
    res.setHeader('X-Content-SHA256', original.checksum);
    return res.send(original.data);
  } catch (err) {
    return responseError(res, err);
  }
});

router.get('/:documentId/export', async (req, res) => {
  try {
    const { documentId } = await resolveAccessibleDocument(req, req.params.documentId);
    const state = await DocumentEditorState.findOne({ tenantId: scopeTenantId(req), documentId }).lean();
    if (!state) return res.status(404).json({ error: 'EDITOR_STATE_NOT_FOUND', message: 'Ce document n’a pas encore été enregistré dans l’Éditeur Kheops.' });
    const format = String(req.query.format || 'docx').toLowerCase();
    const fileFormat = stateFileFormat(state);
    const basename = cleanFilename(state.structuredDocument.title || 'document', 'document').replace(/\.(?:docx|txt|html|json)$/i, '');
    if (format === 'txt') {
      if (fileFormat.kind !== 'text') {
        return res.status(409).json({ error: 'TEXT_EXPORT_REQUIRES_TEXT_DOCUMENT', message: 'L’export TXT fidèle est réservé aux fichiers ouverts en mode texte brut.' });
      }
      const encoded = encodePlainTextBuffer(plainTextFromState(state), fileFormat);
      res.setHeader('Content-Type', TEXT_MIME);
      res.setHeader('Content-Disposition', attachmentDisposition(fileFormat.filename || `${basename}.txt`));
      return res.send(encoded.buffer);
    }
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', attachmentDisposition(`${basename}.kheops.json`));
      return res.send(JSON.stringify(state.structuredDocument, null, 2));
    }
    if (format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', attachmentDisposition(`${basename}.html`));
      return res.send(documentToHtml(state.structuredDocument));
    }
    if (format !== 'docx') {
      return res.status(400).json({ error: 'UNSUPPORTED_FORMAT', message: 'Formats disponibles : docx, txt, html, json.' });
    }
    if (fileFormat.kind === 'text') {
      return res.status(409).json({
        error: 'TEXT_DOCUMENT_STAYS_TEXT',
        message: 'Ce fichier est un TXT. Utilisez « Télécharger le fichier texte » pour éviter toute conversion silencieuse en DOCX.',
      });
    }
    const buffer = createDocxBuffer(state.structuredDocument);
    res.setHeader('Content-Type', DOCX_MIME);
    res.setHeader('Content-Disposition', attachmentDisposition(`${basename}.docx`));
    return res.send(buffer);
  } catch (err) {
    return responseError(res, err);
  }
});

module.exports = router;
