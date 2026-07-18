const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const auth = require('../middlewares/middleware-auth');
const requireTenant = require('../middlewares/requireTenant');
const { requireFeature } = require('../config/featureFlags');
const { ensureDossierOwnership, ensureDocOwnership } = require('../utils/ownershipHelpers');
const { ROLES } = require('../services/cabinetRoles');
const { getTenantRole } = require('../services/ai/tenantRoleService');
const AIProviderConnection = require('../models/AI/AIProviderConnection');
const AIBudgetPolicy = require('../models/AI/AIBudgetPolicy');
const AIUsageLedgerEntry = require('../models/AI/AIUsageLedgerEntry');
const AITask = require('../models/AI/AITask');
const AITaskEvent = require('../models/AI/AITaskEvent');
const AIArtifact = require('../models/AI/AIArtifact');
const AICatalogueEntry = require('../models/AI/AICatalogueEntry');
const costNoticeService = require('../services/ai/costNoticeService');
const { normalizeDimensionRates } = require('../services/ai/catalogueService');
const connectionService = require('../services/ai/connectionService');
const taskService = require('../services/ai/taskService');
const artifactService = require('../services/ai/artifactService');
const budgetService = require('../services/ai/budgetService');
const { AIGateway } = require('../services/ai/gateway');
const {
  detectProviderHint,
  buildModelDiscovery,
} = require('../services/ai/modelDiscoveryService');
const { listBuiltIns } = require('../services/ai/promptRegistry');
const audit = require('../services/ai/auditService');
const { AIError, publicAIError } = require('../services/ai/errors');

const router = express.Router();
const MANAGER_ROLES = [ROLES.OWNER, ROLES.ADMIN];

async function providerDescriptors() {
  const gateway = new AIGateway();
  const providers = [];
  for (const provider of ['openai', 'anthropic', 'gemini']) {
    const adapter = await gateway.adapter(provider);
    providers.push({ id: provider, capabilities: adapter.describeCapabilities(), models: [], modelDiscovery: 'after-connection' });
  }
  if (process.env.AI_COMPATIBLE_BASE_URL_ALLOWLIST) providers.push({ id: 'openai-compatible', capabilities: { text: 'available', streaming: 'limited' }, models: [], modelDiscovery: 'configured-by-admin', advanced: true });
  return providers;
}

function publicTaskResult(task, artifact) {
  const text = typeof artifact?.content?.text === 'string' ? artifact.content.text : '';
  return {
    taskId: String(task._id), artifactId: String(artifact._id), title: artifact.title,
    text, sourceAnchors: artifact.sourceAnchors || [],
    content: artifact.content, sources: artifact.sourceAnchors || [],
    validationStatus: artifact.validationStatus, createdAt: artifact.createdAt,
    actualUsage: task.actualUsage || {}, actualCost: task.actualCost,
    actualCostNature: task.actualCostNature || (task.actualCost == null ? null : 'calculated'),
    currency: task.currency,
  };
}

function canManageBudgetPolicy(policy, userId, role) {
  if (MANAGER_ROLES.includes(role)) return true;
  return policy?.scopeType === 'user' && String(policy.scopeId) === String(userId);
}

function secureEquals(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

// Point d'entrée destiné à Cloud Scheduler/Tasks ou à un worker séparé. Il ne
// dépend pas d'un JWT utilisateur et ne renvoie aucun contenu confidentiel.
router.post('/ai/internal/worker/run-one', requireFeature('aiAssistant'), async (req, res, next) => {
  try {
    const expected = process.env.AI_WORKER_TOKEN;
    if (!expected) throw new AIError('AI_WORKER_NOT_CONFIGURED', 'Le worker IA n’est pas configuré.', { statusCode: 503 });
    if (!secureEquals(req.headers['x-ai-worker-token'], expected)) throw new AIError('AI_WORKER_FORBIDDEN', 'Accès worker refusé.', { statusCode: 403 });
    const result = await taskService.runNextTask({ workerId: `http-${process.pid}-${crypto.randomUUID()}` });
    return res.json({ processed: Boolean(result), taskId: result?._id ? String(result._id) : null, status: result?.status || null });
  } catch (err) { return next(err); }
});

router.use(
  ['/ai', '/matters/:matterId/ai', '/documents/:id/ai'],
  auth,
  requireTenant,
  requireFeature('aiAssistant'),
);

function assertObjectId(value, label = 'identifiant') {
  if (!mongoose.Types.ObjectId.isValid(String(value || ''))) throw new AIError('AI_ID_INVALID', `${label} invalide.`, { statusCode: 400 });
}

async function assertManager(tenantId, userId) {
  const role = await getTenantRole(tenantId, userId);
  if (!MANAGER_ROLES.includes(role)) throw new AIError('AI_ADMIN_REQUIRED', 'Seul un propriétaire ou administrateur peut effectuer cette opération.', { statusCode: 403 });
  return role;
}

function normalizeTaskBody(body = {}) {
  const context = body.context || {};
  const sourceList = Array.isArray(context.sources) ? context.sources : [];
  const direct = body.contextManifest || {};
  const documentIds = [...new Set([
    ...(direct.documentIds || []),
    ...sourceList.map((source) => source.documentId).filter(Boolean),
  ].map(String))];
  const requestedVersions = { ...(direct.requestedVersions || {}) };
  const currentVersionMarkers = new Set(['current', 'latest', 'courante', 'courant']);
  for (const source of sourceList) {
    if (!source.documentId || !source.version) continue;
    const version = String(source.version).trim();
    if (!currentVersionMarkers.has(version.toLowerCase())) requestedVersions[String(source.documentId)] = version;
  }
  for (const [documentId, version] of Object.entries(requestedVersions)) {
    if (currentVersionMarkers.has(String(version).trim().toLowerCase())) delete requestedVersions[documentId];
  }
  const selection = context.selection ?? direct.selectedText;
  const selectedText = typeof selection === 'string' ? selection : (selection?.text || null);
  return {
    taskType: body.taskType,
    userInstruction: body.userInstruction ?? body.prompt ?? '',
    connectionId: body.connectionId,
    model: body.model || null,
    maxOutputTokens: body.maxOutputTokens,
    humanValidationRequired: body.humanValidationRequired !== false,
    budgetOverride: body.budgetOverride === true,
    contextManifest: {
      documentIds,
      currentDocumentId: direct.currentDocumentId || selection?.documentId || null,
      selectedText,
      excludedDocumentIds: direct.excludedDocumentIds || [],
      includeMatterData: direct.includeMatterData === true || Boolean(context.metadata || context.contacts || context.timeline || context.notes),
      includeTimeline: direct.includeTimeline === true || Boolean(context.timeline),
      includeContacts: direct.includeContacts === true || Boolean(context.contacts),
      includeNotes: direct.includeNotes === true || Boolean(context.notes),
      includeMetadata: direct.includeMetadata === true || Boolean(context.metadata),
      includeAllVersions: direct.includeAllVersions === true || context.versions === true || context.versions === 'all',
      requestedVersions,
      redactionCategories: direct.redactionCategories || body.redactionCategories || [],
      allowConfidentialDocuments: direct.allowConfidentialDocuments === true || body.allowConfidentialDocuments === true,
      maxCharacters: direct.maxCharacters || body.maxContextCharacters || 200000,
    },
  };
}

async function loadTaskAndAssertMatter(req, res) {
  assertObjectId(req.params.id, 'Tâche');
  const task = await AITask.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!task) throw new AIError('AI_TASK_NOT_FOUND', 'Tâche IA introuvable.', { statusCode: 404 });
  if (!(await ensureDossierOwnership(req, res, task.matterId))) return null;
  return task;
}

router.get('/ai/providers', async (_req, res, next) => {
  try {
    const providers = await providerDescriptors();
    return res.json({ providers, tasks: listBuiltIns(), catalogueVersioning: true });
  } catch (err) { return next(err); }
});

router.get('/ai/cost-notice', async (req, res, next) => {
  try {
    return res.json({ notice: await costNoticeService.getNotice({ tenantId: req.tenantId, userId: req.user }) });
  } catch (err) { return next(err); }
});

router.put('/ai/cost-notice/consent', async (req, res, next) => {
  try {
    if (req.body?.accepted !== true) {
      throw new AIError('AI_COST_NOTICE_ACCEPTANCE_REQUIRED', 'La confirmation explicite de la notice est requise.', { statusCode: 400 });
    }
    const notice = await costNoticeService.acceptNotice({
      tenantId: req.tenantId,
      userId: req.user,
      version: req.body?.version,
      source: 'settings',
    });
    await audit.record({
      tenantId: req.tenantId,
      actorUserId: req.user,
      action: 'cost_notice.accept',
      resourceType: 'AICostNotice',
      resourceId: notice.version,
      details: { version: notice.version, acceptedAt: notice.acceptedAt },
    }, req);
    return res.json({ notice });
  } catch (err) { return next(err); }
});

router.post('/ai/providers/detect', async (req, res, next) => {
  try {
    // Cette détection examine uniquement le format en mémoire. Elle ne contacte
    // jamais plusieurs fournisseurs avec le même secret.
    return res.json(detectProviderHint(req.body?.apiKey));
  } catch (err) { return next(err); }
});

router.post('/ai/providers/:provider/discover-models', async (req, res, next) => {
  try {
    const provider = String(req.params.provider || '');
    if (provider === 'openai-compatible') await assertManager(req.tenantId, req.user);
    if (!req.body?.apiKey) throw new AIError('AI_SECRET_REQUIRED', 'La clé API est obligatoire pour découvrir les modèles.', { statusCode: 400 });
    const gateway = new AIGateway();
    const modelIds = await gateway.listModels({ provider, baseUrl: req.body?.baseUrl || null }, req.body.apiKey);
    const discovery = buildModelDiscovery(provider, modelIds, {
      requiredCapabilities: Array.isArray(req.body?.requiredCapabilities) ? req.body.requiredCapabilities : ['text'],
    });
    await audit.record({
      tenantId: req.tenantId, actorUserId: req.user, action: 'provider.discover_models',
      resourceType: 'AIProvider', resourceId: provider, provider,
      details: { modelCount: discovery.models.length, discoveryVersion: discovery.discoveryVersion },
    }, req);
    return res.json({ ...discovery, cached: false });
  } catch (err) { return next(err); }
});

router.get('/ai/connections', async (req, res, next) => {
  try {
    const connections = await connectionService.listConnections({
      tenantId: req.tenantId, userId: req.user, includeInactive: req.query.includeInactive === 'true',
    });
    return res.json({ connections });
  } catch (err) { return next(err); }
});

router.post('/ai/connections', async (req, res, next) => {
  try {
    await costNoticeService.assertCurrentConsent({ tenantId: req.tenantId, userId: req.user });
    const connection = await connectionService.createConnection({ tenantId: req.tenantId, userId: req.user, body: req.body || {} });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'connection.create', resourceType: 'AIProviderConnection', resourceId: connection.id, provider: connection.provider, details: { ownerType: connection.ownerType, defaultModel: connection.defaultModel } }, req);
    return res.status(201).json({ connection });
  } catch (err) { return next(err); }
});

router.post('/ai/connections/:id/test', async (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'Connexion');
    const result = await connectionService.testConnection({ tenantId: req.tenantId, userId: req.user, connectionId: req.params.id });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'connection.test', resourceType: 'AIProviderConnection', resourceId: req.params.id, provider: result.connection.provider, outcome: 'success' }, req);
    return res.json(result);
  } catch (err) {
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'connection.test', resourceType: 'AIProviderConnection', resourceId: req.params.id, outcome: 'failure', details: { code: err.code } }, req);
    return next(err);
  }
});

router.get('/ai/connections/:id/models', async (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'Connexion');
    const connection = await connectionService.loadConnectionForManagement({
      tenantId: req.tenantId, userId: req.user, connectionId: req.params.id,
    });
    return res.json({ ...connectionService.publicModelCache(connection), cached: true });
  } catch (err) { return next(err); }
});

router.post('/ai/connections/:id/refresh-models', async (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'Connexion');
    const result = await connectionService.refreshConnectionModels({
      tenantId: req.tenantId,
      userId: req.user,
      connectionId: req.params.id,
      force: req.body?.force === true,
      requiredCapabilities: Array.isArray(req.body?.requiredCapabilities) ? req.body.requiredCapabilities : ['text'],
    });
    await audit.record({
      tenantId: req.tenantId, actorUserId: req.user, action: 'connection.refresh_models',
      resourceType: 'AIProviderConnection', resourceId: req.params.id, provider: result.provider,
      details: { modelCount: result.models.length, cached: result.cached, discoveryVersion: result.discoveryVersion },
    }, req);
    return res.json(result);
  } catch (err) { return next(err); }
});

router.patch('/ai/connections/:id', async (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'Connexion');
    const connection = await connectionService.updateConnection({ tenantId: req.tenantId, userId: req.user, connectionId: req.params.id, changes: req.body || {} });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'connection.update', resourceType: 'AIProviderConnection', resourceId: req.params.id, provider: connection.provider, details: { fields: Object.keys(req.body || {}).filter((key) => key !== 'apiKey') } }, req);
    return res.json({ connection });
  } catch (err) { return next(err); }
});

router.post('/ai/connections/:id/rotate', async (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'Connexion');
    const result = await connectionService.rotateSecret({ tenantId: req.tenantId, userId: req.user, connectionId: req.params.id, apiKey: req.body?.apiKey });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'connection.rotate', resourceType: 'AIProviderConnection', resourceId: req.params.id, provider: result.connection.provider }, req);
    return res.json(result);
  } catch (err) { return next(err); }
});

for (const [path, status] of [['suspend', 'suspended'], ['resume', 'active']]) {
  router.post(`/ai/connections/:id/${path}`, async (req, res, next) => {
    try {
      assertObjectId(req.params.id, 'Connexion');
      const connection = await connectionService.updateConnection({ tenantId: req.tenantId, userId: req.user, connectionId: req.params.id, changes: { status } });
      await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: `connection.${path}`, resourceType: 'AIProviderConnection', resourceId: req.params.id, provider: connection.provider }, req);
      return res.json({ connection });
    } catch (err) { return next(err); }
  });
}

async function revokeRoute(req, res, next) {
  try {
    assertObjectId(req.params.id, 'Connexion');
    const result = await connectionService.revokeConnection({ tenantId: req.tenantId, userId: req.user, connectionId: req.params.id });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'connection.revoke', resourceType: 'AIProviderConnection', resourceId: req.params.id }, req);
    return res.json(result);
  } catch (err) { return next(err); }
}
router.post('/ai/connections/:id/revoke', revokeRoute);
router.delete('/ai/connections/:id', revokeRoute);

router.post('/matters/:matterId/ai/preflight', async (req, res, next) => {
  try {
    assertObjectId(req.params.matterId, 'Dossier');
    if (!(await ensureDossierOwnership(req, res, req.params.matterId))) return undefined;
    const result = await taskService.preflight({ tenantId: req.tenantId, userId: req.user, matterId: req.params.matterId, input: normalizeTaskBody(req.body) });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'task.preflight', resourceType: 'Dossier', resourceId: req.params.matterId, matterId: req.params.matterId, provider: result.public.provider, model: result.public.model, details: { taskType: result.public.taskType, sourceCount: result.public.context.sources.length, estimatedCost: result.public.estimatedCost } }, req);
    return res.json(result.public);
  } catch (err) { return next(err); }
});

router.post('/matters/:matterId/ai/tasks', async (req, res, next) => {
  try {
    assertObjectId(req.params.matterId, 'Dossier');
    if (!(await ensureDossierOwnership(req, res, req.params.matterId))) return undefined;
    const input = normalizeTaskBody(req.body);
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey || req.body?.clientRequestId || crypto.randomUUID();
    const { task, reused } = await taskService.createTask({ tenantId: req.tenantId, userId: req.user, matterId: req.params.matterId, input, idempotencyKey });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: reused ? 'task.reuse' : 'task.create', resourceType: 'AITask', resourceId: task._id, matterId: task.matterId, taskId: task._id, provider: task.provider, model: task.model, details: { taskType: task.taskType, estimatedCost: task.estimatedCost, idempotentReplay: reused } }, req);
    if (!reused && process.env.AI_INLINE_WORKER !== 'false') setImmediate(() => taskService.runNextTask().catch((err) => console.error('[AI inline worker]', err.code || err.name || 'ERROR')));
    return res.status(reused ? 200 : 202).json({ ...taskService.publicTask(task), reused, idempotencyKey: String(idempotencyKey) });
  } catch (err) { return next(err); }
});

router.get('/ai/tasks/:id', async (req, res, next) => {
  try {
    const task = await loadTaskAndAssertMatter(req, res);
    if (!task) return undefined;
    return res.json(taskService.publicTask(task));
  } catch (err) { return next(err); }
});

router.get('/ai/tasks/:id/events', async (req, res, next) => {
  try {
    const task = await loadTaskAndAssertMatter(req, res);
    if (!task) return undefined;
    const after = Math.max(0, Number(req.query.after || 0));
    const limit = Math.max(1, Math.min(200, Number(req.query.limit || 100)));
    const events = await AITaskEvent.find({ tenantId: req.tenantId, taskId: task._id, sequence: { $gt: after } }).sort({ sequence: 1 }).limit(limit).lean();
    return res.json({
      taskId: String(task._id), status: task.status, events,
      nextAfter: events.length ? events[events.length - 1].sequence : after,
      terminal: taskService.TERMINAL.has(task.status),
    });
  } catch (err) { return next(err); }
});

router.get('/ai/tasks/:id/result', async (req, res, next) => {
  try {
    const task = await loadTaskAndAssertMatter(req, res);
    if (!task) return undefined;
    if (task.status !== 'succeeded') throw new AIError('AI_TASK_NOT_READY', 'Le résultat complet n’est pas encore disponible.', { statusCode: 409 });
    const artifact = await AIArtifact.findOne({ tenantId: req.tenantId, taskId: task._id, type: 'response', version: 1 }).lean();
    if (!artifact) throw new AIError('AI_ARTIFACT_NOT_FOUND', 'Le résultat doit être repris par le worker.', { statusCode: 503, retryable: true });
    return res.json(publicTaskResult(task, artifact));
  } catch (err) { return next(err); }
});

router.post('/ai/tasks/:id/cancel', async (req, res, next) => {
  try {
    const existing = await loadTaskAndAssertMatter(req, res);
    if (!existing) return undefined;
    const task = await taskService.cancelTask({ tenantId: req.tenantId, userId: req.user, taskId: existing._id });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'task.cancel', resourceType: 'AITask', resourceId: task._id, matterId: task.matterId, taskId: task._id, provider: task.provider, model: task.model }, req);
    return res.json(taskService.publicTask(task));
  } catch (err) { return next(err); }
});

router.post('/ai/tasks/:id/create-document', async (req, res, next) => {
  try {
    const task = await loadTaskAndAssertMatter(req, res);
    if (!task) return undefined;
    const artifact = await artifactService.createKheopsDraft({
      tenantId: req.tenantId, userId: req.user, taskId: task._id, title: req.body?.title,
      options: {
        type: req.body?.type, language: req.body?.language,
        visibility: req.body?.visibility, editor: req.body?.editor,
        includeSources: req.body?.includeSources, versionComment: req.body?.versionComment,
      },
    });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'artifact.create_document', resourceType: 'AIArtifact', resourceId: artifact._id, matterId: task.matterId, taskId: task._id, provider: task.provider, model: task.model, details: { documentId: artifact.documentId, validationStatus: artifact.validationStatus } }, req);
    return res.status(201).json({
      artifactId: String(artifact._id), documentId: String(artifact.documentId), title: artifact.title,
      status: artifact.validationStatus, notice: 'Brouillon IA — à valider',
      optionsEffective: artifact.content?.generationOptions || {},
    });
  } catch (err) { return next(err); }
});

router.post('/documents/:id/ai/apply-proposal', async (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'Document');
    const ownership = await ensureDocOwnership(req, res, req.params.id);
    if (!ownership.ok) return undefined;
    assertObjectId(req.body?.artifactId, 'Artefact');
    const result = await artifactService.applyProposal({ tenantId: req.tenantId, userId: req.user, targetMatterId: ownership.dossierId, documentId: req.params.id, artifactId: req.body.artifactId, proposalText: req.body.proposalText, mode: req.body.mode, expectedRevision: req.body.expectedRevision });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'artifact.apply_proposal', resourceType: 'Document', resourceId: req.params.id, matterId: ownership.dossierId, details: { artifactId: req.body.artifactId, mode: req.body.mode, partial: req.body.proposalText != null, revision: result.revision } }, req);
    return res.json(result);
  } catch (err) { return next(err); }
});

router.post('/documents/:id/ai/validate', async (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'Document');
    const ownership = await ensureDocOwnership(req, res, req.params.id);
    if (!ownership.ok) return undefined;
    const artifact = await artifactService.validateAIDraft({ tenantId: req.tenantId, userId: req.user, documentId: req.params.id, decision: req.body?.decision, comment: req.body?.comment });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'artifact.human_validation', resourceType: 'AIArtifact', resourceId: artifact._id, matterId: ownership.dossierId, taskId: artifact.taskId, details: { documentId: req.params.id, decision: req.body?.decision, commentPresent: Boolean(req.body?.comment) } }, req);
    return res.json({ artifactId: String(artifact._id), documentId: String(artifact.documentId), validationStatus: artifact.validationStatus, validatedAt: artifact.validatedAt });
  } catch (err) { return next(err); }
});

router.get('/ai/budgets', async (req, res, next) => {
  try {
    const role = await getTenantRole(req.tenantId, req.user);
    const filter = MANAGER_ROLES.includes(role)
      ? { tenantId: req.tenantId }
      : { tenantId: req.tenantId, $or: [{ scopeType: 'tenant' }, { scopeType: 'user', scopeId: req.user }] };
    const policies = await AIBudgetPolicy.find(filter).lean();
    return res.json({
      budgets: policies.map((policy) => ({
        ...budgetService.publicBudget(policy),
        canEdit: canManageBudgetPolicy(policy, req.user, role),
      })),
      role,
    });
  } catch (err) { return next(err); }
});

router.put('/ai/budgets/:id', async (req, res, next) => {
  try {
    assertObjectId(req.params.id, 'Budget');
    const existing = await AIBudgetPolicy.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!existing) throw new AIError('AI_BUDGET_NOT_FOUND', 'Politique budgétaire introuvable.', { statusCode: 404 });
    const role = await getTenantRole(req.tenantId, req.user);
    if (!canManageBudgetPolicy(existing, req.user, role)) {
      throw new AIError('AI_BUDGET_FORBIDDEN', 'Vous ne pouvez modifier que votre budget personnel.', { statusCode: 403 });
    }
    const allowed = ['name', 'currency', 'timezone', 'softDailyLimit', 'hardDailyLimit', 'softMonthlyLimit', 'hardMonthlyLimit', 'perTaskLimit', 'warningThresholds', 'actionAtLimit', 'overrideRoles', 'forbiddenModels', 'enabled', 'periodType', 'periodLimit', 'customPeriodDays'];
    if (!MANAGER_ROLES.includes(role)) {
      for (const adminOnly of ['currency', 'overrideRoles', 'forbiddenModels', 'enabled']) {
        if (req.body?.[adminOnly] !== undefined) throw new AIError('AI_BUDGET_FIELD_ADMIN_ONLY', `Le champ ${adminOnly} est réservé à l’administration.`, { statusCode: 403 });
      }
    }
    const set = { updatedBy: req.user };
    for (const key of allowed) if (req.body?.[key] !== undefined) set[key] = req.body[key];
    const simpleBudgetRequested = req.body?.periodType !== undefined
      || req.body?.periodLimit !== undefined
      || req.body?.customPeriodDays !== undefined;
    if (simpleBudgetRequested) {
      const periodType = req.body?.periodType ?? existing.periodType ?? 'month';
      const rawPeriodLimit = req.body?.periodLimit !== undefined ? req.body.periodLimit : existing.periodLimit;
      const periodLimit = Number(rawPeriodLimit);
      const customPeriodDays = req.body?.customPeriodDays !== undefined
        ? Number(req.body.customPeriodDays)
        : Number(existing.customPeriodDays || 30);
      if (!['day', 'week', 'month', 'custom'].includes(periodType)) {
        throw new AIError('AI_BUDGET_PERIOD_INVALID', 'La période budgétaire est invalide.', { statusCode: 400 });
      }
      if (rawPeriodLimit == null || rawPeriodLimit === '' || !Number.isFinite(periodLimit) || periodLimit < 0) {
        throw new AIError('AI_BUDGET_PERIOD_LIMIT_REQUIRED', 'Un plafond valide est obligatoire pour la période budgétaire.', { statusCode: 400 });
      }
      if (!Number.isInteger(customPeriodDays) || customPeriodDays < 1 || customPeriodDays > 365) {
        throw new AIError('AI_BUDGET_CUSTOM_PERIOD_INVALID', 'La période personnalisée doit contenir entre 1 et 365 jours.', { statusCode: 400 });
      }
      set.periodType = periodType;
      set.periodLimit = periodLimit;
      set.customPeriodDays = customPeriodDays;
      // Le mode simple remplace les anciens doubles plafonds jour+mois. Les
      // champs historiques restent lisibles pour les anciennes politiques.
      set.hardDailyLimit = null;
      set.hardMonthlyLimit = null;
      set.softDailyLimit = null;
      set.softMonthlyLimit = null;
    }
    if (simpleBudgetRequested) {
      set.periodAnchorAt = new Date();
      set['counters.periodKey'] = null;
      set['counters.periodSpent'] = 0;
      set['counters.periodReserved'] = 0;
      set['counters.periodStartedAt'] = null;
      set['counters.periodEndsAt'] = null;
    }
    const budget = await AIBudgetPolicy.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId }, { $set: set }, { new: true, runValidators: true });
    if (!budget) throw new AIError('AI_BUDGET_NOT_FOUND', 'Politique budgétaire introuvable.', { statusCode: 404 });
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'budget.update', resourceType: 'AIBudgetPolicy', resourceId: budget._id, details: { fields: Object.keys(set).filter((key) => key !== 'updatedBy') } }, req);
    return res.json({ budget: budgetService.publicBudget(budget) });
  } catch (err) { return next(err); }
});

router.get('/ai/usage', async (req, res, next) => {
  try {
    const role = await getTenantRole(req.tenantId, req.user);
    const filter = { tenantId: req.tenantId };
    if (!MANAGER_ROLES.includes(role)) filter.userId = new mongoose.Types.ObjectId(String(req.user));
    if (req.query.userId && MANAGER_ROLES.includes(role)) { assertObjectId(req.query.userId, 'Utilisateur'); filter.userId = new mongoose.Types.ObjectId(String(req.query.userId)); }
    if (req.query.matterId) { assertObjectId(req.query.matterId, 'Dossier'); filter.matterId = new mongoose.Types.ObjectId(String(req.query.matterId)); }
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
    const [entries, totals] = await Promise.all([
      AIUsageLedgerEntry.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      AIUsageLedgerEntry.aggregate([{ $match: filter }, { $group: { _id: '$currency', totalCost: { $sum: '$totalCost' }, inputTokens: { $sum: '$inputTokens' }, outputTokens: { $sum: '$outputTokens' }, tasks: { $sum: 1 } } }]),
    ]);
    return res.json({ entries, totals });
  } catch (err) { return next(err); }
});

router.get('/ai/catalogue', async (_req, res, next) => {
  try {
    await assertManager(_req.tenantId, _req.user);
    return res.json({ entries: await AICatalogueEntry.find({ tenantId: _req.tenantId, active: true }).sort({ provider: 1, model: 1, effectiveFrom: -1 }).lean() });
  }
  catch (err) { return next(err); }
});

router.put('/ai/catalogue/:provider/:model', async (req, res, next) => {
  try {
    await assertManager(req.tenantId, req.user);
    const version = String(req.body?.version || new Date().toISOString());
    const entry = await AICatalogueEntry.findOneAndUpdate(
      { tenantId: req.tenantId, provider: req.params.provider, model: req.params.model, version },
      {
        $set: {
          label: req.body?.label || req.params.model, currency: req.body?.currency || 'EUR',
          tenantId: req.tenantId,
          inputPerMillion: req.body?.inputPerMillion, outputPerMillion: req.body?.outputPerMillion,
          cachedInputPerMillion: req.body?.cachedInputPerMillion ?? null,
          dimensionRates: normalizeDimensionRates(req.body?.dimensionRates),
          minimumCharge: req.body?.minimumCharge || 0, capabilities: req.body?.capabilities || {},
          effectiveFrom: req.body?.effectiveFrom || new Date(), effectiveUntil: req.body?.effectiveUntil || null,
          active: req.body?.active !== false, source: req.body?.source || 'administration',
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    await audit.record({ tenantId: req.tenantId, actorUserId: req.user, action: 'catalogue.update', resourceType: 'AICatalogueEntry', resourceId: entry._id, provider: entry.provider, model: entry.model, details: { version: entry.version } }, req);
    return res.json({ entry });
  } catch (err) { return next(err); }
});

router.use((err, req, res, _next) => {
  const normalized = publicAIError(err);
  if (!(err instanceof AIError)) console.error('[AI route]', err.code || err.name || 'ERROR');
  return res.status(normalized.statusCode).json(normalized.body);
});

module.exports = router;
module.exports._normalizeTaskBody = normalizeTaskBody;
module.exports._secureEquals = secureEquals;
module.exports._providerDescriptors = providerDescriptors;
module.exports._publicTaskResult = publicTaskResult;
module.exports._canManageBudgetPolicy = canManageBudgetPolicy;
