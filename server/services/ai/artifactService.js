const crypto = require('crypto');
const mongoose = require('mongoose');
const AIArtifact = require('../../models/AI/AIArtifact');
const AITask = require('../../models/AI/AITask');
const Dossier = require('../../models/Folder/Dossier');
const DocumentEditorState = require('../../models/DocumentEditor/DocumentEditorState');
const DocumentEditorRevision = require('../../models/DocumentEditor/DocumentEditorRevision');
const { createDefaultDocument, normalizeStructuredDocument } = require('../documentEditorFormat');
const { AIError } = require('./errors');

function fingerprint(content) {
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

function markdownBlocks(text) {
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    blocks.push({
      id: `ai-p-${crypto.randomBytes(6).toString('hex')}`,
      type: 'paragraph', runs: [{ text: paragraph.join(' ').trim(), marks: {} }], align: 'left',
    });
    paragraph = [];
  };
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      blocks.push({ id: `ai-h-${crypto.randomBytes(6).toString('hex')}`, type: 'heading', level: heading[1].length, runs: [{ text: heading[2], marks: {} }], align: 'left' });
      continue;
    }
    const list = line.match(/^([-*]|\d+[.)])\s+(.+)$/);
    if (list) {
      flush();
      blocks.push({ id: `ai-li-${crypto.randomBytes(6).toString('hex')}`, type: 'list-item', ordered: /^\d/.test(list[1]), level: 0, runs: [{ text: list[2], marks: {} }], align: 'left' });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks.length ? blocks : [{ id: `ai-p-${crypto.randomBytes(6).toString('hex')}`, type: 'paragraph', runs: [{ text: '', marks: {} }], align: 'left' }];
}

function structuredFromText(title, text) {
  const document = createDefaultDocument(title);
  document.blocks = markdownBlocks(text);
  return normalizeStructuredDocument(document);
}

function normalizeDocumentOptions(options = {}) {
  const editorMap = {
    kheops: 'kheops', word: 'word_desktop', word_desktop: 'word_desktop',
    word_web: 'word_web', google_docs: 'google_docs', automatic: 'automatic', ask: 'ask',
  };
  const language = String(options.language || 'fr-FR').slice(0, 20);
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(language)) throw new AIError('AI_DOCUMENT_LANGUAGE_INVALID', 'Langue de document invalide.', { statusCode: 400 });
  const visibility = options.visibility || 'matter';
  if (visibility !== 'matter') throw new AIError('AI_DOCUMENT_VISIBILITY_UNSUPPORTED', 'Cette version crée uniquement des documents visibles dans leur dossier.', { statusCode: 400 });
  const editorKey = String(options.editor || 'kheops').replace(/-/g, '_');
  const editor = editorMap[editorKey] || null;
  if (!editor) throw new AIError('AI_DOCUMENT_EDITOR_INVALID', 'Éditeur de destination invalide.', { statusCode: 400 });
  return {
    type: String(options.type || 'document').trim().slice(0, 64) || 'document',
    language,
    visibility,
    editor,
    includeSources: options.includeSources !== false,
    versionComment: String(options.versionComment || '').trim().slice(0, 1000),
  };
}

async function createResponseArtifact({ task, text, sourceAnchors, contextSourceAnchors = [], warnings = [] }) {
  const content = {
    format: 'markdown', text, notice: 'Brouillon IA — à valider',
    contextSourceAnchors, warnings,
  };
  return AIArtifact.findOneAndUpdate(
    { taskId: task._id, type: 'response', version: 1 },
    {
      $setOnInsert: {
        tenantId: task.tenantId, matterId: task.matterId, taskId: task._id,
        type: 'response', title: 'Réponse de l’assistant IA', content,
        sourceAnchors, requestedBy: task.userId,
        validationStatus: 'ai_draft_pending_validation', fingerprint: fingerprint(content),
        retentionUntil: task.retentionUntil,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function createKheopsDraft({ tenantId, userId, taskId, title, options = {} }) {
  const task = await AITask.findOne({ _id: taskId, tenantId, status: 'succeeded' });
  if (!task) throw new AIError('AI_TASK_NOT_READY', 'La tâche IA n’est pas terminée.', { statusCode: 409 });
  const response = await AIArtifact.findOne({ taskId, tenantId, type: 'response', version: 1 });
  if (!response) throw new AIError('AI_ARTIFACT_NOT_FOUND', 'Le résultat de la tâche est introuvable.', { statusCode: 404 });
  const existing = await AIArtifact.findOne({ taskId, tenantId, type: 'document', version: 1 });
  if (existing) return existing;
  const generationOptions = normalizeDocumentOptions(options);
  const dossier = await Dossier.findOne({ _id: task.matterId, tenantId });
  if (!dossier) throw new AIError('AI_MATTER_NOT_FOUND', 'Dossier introuvable.', { statusCode: 404 });
  const documentId = new mongoose.Types.ObjectId();
  const safeTitle = String(title || `Brouillon IA — ${task.taskType}`).trim().slice(0, 240);
  const sourceAppendix = generationOptions.includeSources && (response.sourceAnchors || []).length
    ? `\n\n## Sources à vérifier\n${response.sourceAnchors.map((source) => `- [${source.sourceId}] ${source.label || 'Source'}${source.versionId ? ` — version ${source.versionId}` : ''}`).join('\n')}`
    : '';
  const structuredDocument = structuredFromText(safeTitle, `${response.content?.text || ''}${sourceAppendix}`);
  // L'état éditeur est créé avant la référence dans le dossier. Si le second
  // write échoue, il est supprimé afin de ne laisser aucun document orphelin.
  await DocumentEditorState.create({
    tenantId, documentId, structuredDocument, revision: 1, status: 'draft',
    compatibility: { level: 'native', label: 'Brouillon IA — à valider', warnings: [], analyzedAt: new Date() },
    canonical: { checksum: null, historyVersionId: null, source: 'ai', syncedAt: null, pending: true },
    lastSavedBy: userId, lastSavedAt: new Date(),
  });
  let createdArtifactId = null;
  try {
    const updated = await Dossier.updateOne(
      { _id: task.matterId, tenantId, 'dossier.documents._id': { $ne: documentId } },
      {
        $push: {
          'dossier.documents': {
            _id: documentId, nomDocument: safeTitle, dateCreation: new Date(),
            categorie: 'Brouillon IA — à valider', userId,
            openingMode: generationOptions.editor,
            subfolderId: null, subfolderName: null,
          },
        },
      },
    );
    if (!updated.modifiedCount) throw new AIError('AI_DOCUMENT_CREATE_FAILED', 'Le brouillon n’a pas pu être ajouté au dossier.', { statusCode: 409 });
  } catch (err) {
    await DocumentEditorState.deleteOne({ tenantId, documentId }).catch(() => {});
    throw err;
  }
  try {
    const content = {
      format: 'kheops-structured-v1', structuredDocument,
      notice: 'Brouillon IA — à valider', generationOptions,
    };
    const artifact = await AIArtifact.create({
      tenantId, matterId: task.matterId, taskId, type: 'document', title: safeTitle,
      content, sourceAnchors: response.sourceAnchors, documentId, version: 1,
      requestedBy: userId, validationStatus: 'ai_draft_pending_validation',
      fingerprint: fingerprint(content), retentionUntil: task.retentionUntil,
    });
    createdArtifactId = artifact._id;
    await DocumentEditorRevision.create({
      tenantId, documentId, revision: 1, structuredDocument,
      reason: 'ai_proposal',
      comment: `Génération IA — tâche ${taskId} — artefact ${artifact._id}${generationOptions.versionComment ? ` — ${generationOptions.versionComment}` : ''}`.slice(0, 500),
      savedBy: userId,
    });
    await AITask.updateOne({ _id: taskId, tenantId }, { $addToSet: { resultArtifactIds: artifact._id } });
    return artifact;
  } catch (err) {
    await Promise.all([
      DocumentEditorState.deleteOne({ tenantId, documentId }).catch(() => {}),
      DocumentEditorRevision.deleteMany({ tenantId, documentId }).catch(() => {}),
      ...(createdArtifactId ? [AIArtifact.deleteOne({ _id: createdArtifactId, tenantId }).catch(() => {})] : []),
      Dossier.updateOne({ _id: task.matterId, tenantId }, { $pull: { 'dossier.documents': { _id: documentId } } }).catch(() => {}),
    ]);
    if (err?.code === 11000) return AIArtifact.findOne({ taskId, tenantId, type: 'document', version: 1 });
    throw err;
  }
}

function artifactText(artifact) {
  return artifact?.content?.text
    || artifact?.content?.structuredDocument?.blocks?.flatMap((block) => block.runs || []).map((run) => run.text || '').join('\n')
    || '';
}

async function applyProposal({ tenantId, userId, targetMatterId, documentId, artifactId, proposalText = null, mode = 'append', expectedRevision }) {
  if (!['append', 'replace-document'].includes(mode)) throw new AIError('AI_PROPOSAL_MODE_INVALID', 'Mode d’insertion non pris en charge.', { statusCode: 400 });
  const artifact = await AIArtifact.findOne({ _id: artifactId, tenantId });
  if (!artifact) throw new AIError('AI_ARTIFACT_NOT_FOUND', 'Proposition IA introuvable.', { statusCode: 404 });
  if (!targetMatterId || String(artifact.matterId) !== String(targetMatterId)) {
    throw new AIError('AI_ARTIFACT_MATTER_MISMATCH', 'Une proposition IA ne peut pas être appliquée dans un autre dossier.', { statusCode: 403 });
  }
  const fullProposal = artifactText(artifact);
  let effectiveProposal = fullProposal;
  if (proposalText != null) {
    effectiveProposal = String(proposalText);
    if (!effectiveProposal || effectiveProposal.length > 250000 || !fullProposal.includes(effectiveProposal)) {
      throw new AIError('AI_PROPOSAL_EXCERPT_INVALID', 'Le passage accepté doit provenir exactement de la proposition IA.', { statusCode: 400 });
    }
  }
  const state = await DocumentEditorState.findOne({ tenantId, documentId });
  if (!state) throw new AIError('AI_DOCUMENT_STATE_NOT_FOUND', 'Ce document ne peut pas recevoir la proposition.', { statusCode: 404 });
  if (['approved', 'signed', 'archived'].includes(state.status)) throw new AIError('AI_DOCUMENT_IMMUTABLE', 'Un document approuvé, signé ou archivé ne peut pas être modifié par l’IA.', { statusCode: 409 });
  if (Number(expectedRevision) !== Number(state.revision)) throw new AIError('AI_DOCUMENT_REVISION_CONFLICT', 'Le document a changé. Rechargez-le avant d’appliquer la proposition.', { statusCode: 409, details: { currentRevision: state.revision } });
  const previous = state.structuredDocument;
  const proposalBlocks = markdownBlocks(effectiveProposal);
  const next = normalizeStructuredDocument({
    ...previous,
    blocks: mode === 'replace-document' ? proposalBlocks : [...(previous.blocks || []), ...proposalBlocks],
  });
  const updated = await DocumentEditorState.findOneAndUpdate(
    { _id: state._id, tenantId, documentId, revision: state.revision, status: { $nin: ['approved', 'signed', 'archived'] } },
    {
      $set: { structuredDocument: next, lastSavedBy: userId, lastSavedAt: new Date(), 'canonical.pending': true },
      $inc: { revision: 1 },
    },
    { new: true },
  );
  if (!updated) throw new AIError('AI_DOCUMENT_REVISION_CONFLICT', 'Le document a changé. La proposition n’a pas été appliquée.', { statusCode: 409 });
  await DocumentEditorRevision.findOneAndUpdate(
    { tenantId, documentId, revision: updated.revision },
    {
      $setOnInsert: {
        tenantId, documentId, revision: updated.revision, structuredDocument: next,
        reason: 'ai_proposal', comment: `Proposition IA${proposalText != null ? ' (extrait)' : ''} — artefact ${artifact._id} — tâche ${artifact.taskId}`.slice(0, 500), savedBy: userId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return { documentId: String(documentId), revision: updated.revision, status: updated.status };
}

async function validateAIDraft({ tenantId, userId, documentId, decision, comment = '' }) {
  if (!['approved-by-human', 'rejected-by-human'].includes(decision)) throw new AIError('AI_VALIDATION_DECISION_INVALID', 'Décision de validation invalide.', { statusCode: 400 });
  const targetStatus = decision === 'approved-by-human' ? 'validated' : 'rejected';
  const validationUpdate = {
    $set: {
      validationStatus: targetStatus, validatedBy: userId, validatedAt: new Date(),
      'content.validationComment': String(comment).slice(0, 1000),
    },
  };
  const artifact = await AIArtifact.findOneAndUpdate(
    { tenantId, documentId, type: 'document', validationStatus: 'ai_draft_pending_validation' },
    validationUpdate,
    { new: true },
  );
  if (!artifact) throw new AIError('AI_DRAFT_NOT_PENDING', 'Ce document n’est pas un brouillon IA en attente de validation.', { statusCode: 409 });
  const visibleCategory = targetStatus === 'validated'
    ? 'Document IA validé par un humain'
    : 'Brouillon IA rejeté par un humain';
  const dossierUpdate = await Dossier.updateOne(
    {
      _id: artifact.matterId, tenantId,
      'dossier.documents': { $elemMatch: { _id: documentId, categorie: 'Brouillon IA — à valider' } },
    },
    { $set: { 'dossier.documents.$.categorie': visibleCategory } },
  );
  if (!dossierUpdate.modifiedCount) {
    await AIArtifact.updateOne(
      { _id: artifact._id, validationStatus: targetStatus, validatedBy: userId, validatedAt: artifact.validatedAt },
      { $set: { validationStatus: 'ai_draft_pending_validation', validatedBy: null, validatedAt: null }, $unset: { 'content.validationComment': 1 } },
    ).catch(() => {});
    throw new AIError('AI_DRAFT_DOCUMENT_STATE_CONFLICT', 'Le statut visible du brouillon a changé. Rechargez le dossier.', { statusCode: 409 });
  }
  if (targetStatus === 'validated') {
    try {
      const retained = await AIArtifact.updateOne(
        { _id: artifact._id, validationStatus: 'validated', validatedBy: userId },
        { $unset: { retentionUntil: 1 } },
      );
      if (!retained.matchedCount) throw new Error('artifact-validation-race');
    } catch (_) {
      await Promise.all([
        Dossier.updateOne(
          { _id: artifact.matterId, tenantId, 'dossier.documents._id': documentId },
          { $set: { 'dossier.documents.$.categorie': 'Brouillon IA — à valider' } },
        ).catch(() => {}),
        AIArtifact.updateOne(
          { _id: artifact._id, validationStatus: 'validated', validatedBy: userId },
          { $set: { validationStatus: 'ai_draft_pending_validation', validatedBy: null, validatedAt: null, retentionUntil: artifact.retentionUntil || new Date(Date.now() + 30 * 86400000) }, $unset: { 'content.validationComment': 1 } },
        ).catch(() => {}),
      ]);
      throw new AIError('AI_DRAFT_RETENTION_UPDATE_FAILED', 'La validation n’a pas pu préserver durablement la provenance. Réessayez.', { statusCode: 503 });
    }
    await DocumentEditorState.updateOne(
      { tenantId, documentId, status: 'draft' },
      { $set: { status: 'review', lastSavedBy: userId, lastSavedAt: new Date() } },
    );
  }
  return artifact;
}

module.exports = {
  markdownBlocks,
  structuredFromText,
  normalizeDocumentOptions,
  createResponseArtifact,
  createKheopsDraft,
  applyProposal,
  validateAIDraft,
};
