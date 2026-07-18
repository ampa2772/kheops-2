const crypto = require('crypto');
const AITask = require('../../models/AI/AITask');
const AITaskEvent = require('../../models/AI/AITaskEvent');
const AIArtifact = require('../../models/AI/AIArtifact');
const AIBudgetReservation = require('../../models/AI/AIBudgetReservation');
const { loadUsableConnection, recordConnectionSuccess, recordConnectionFailure } = require('./connectionService');
const { createSecretProvider } = require('./secretProvider');
const { AIGateway } = require('./gateway');
const { buildContext, citedAnchors } = require('./contextService');
const { getPrompt, renderPrompt, normalizeTaskType } = require('./promptRegistry');
const { estimateRequest, getCatalogueEntry, calculateCost, ledgerRates } = require('./catalogueService');
const budgetService = require('./budgetService');
const { createResponseArtifact } = require('./artifactService');
const { getTenantRole } = require('./tenantRoleService');
const { redactSecrets } = require('./redaction');
const { AIError } = require('./errors');
const aiAudit = require('./auditService');

const TERMINAL = new Set(['cancelled', 'succeeded', 'failed', 'blocked_budget']);
const CLAIMABLE = ['queued', 'retry_wait'];

function taskLeaseMs(env = process.env) {
  return Math.max(30000, Math.min(30 * 60 * 1000, Number(env.AI_TASK_LEASE_MS || 15 * 60 * 1000)));
}

function contentRetentionDays(connection, env = process.env) {
  const connectionDays = Number(connection?.rules?.retentionDays || 30);
  const globalDays = Number(env.AI_CONTENT_RETENTION_DAYS || 30);
  return Math.max(1, Math.min(3650, connectionDays, globalDays));
}

function workerConcurrency(env = process.env) {
  return Math.max(1, Math.min(10, Number(env.AI_TASK_CONCURRENCY || 1)));
}

function pricingSnapshot(entry) {
  return {
    catalogueVersion: entry.version,
    currency: entry.currency,
    inputPerMillion: entry.inputPerMillion,
    outputPerMillion: entry.outputPerMillion,
    cachedInputPerMillion: entry.cachedInputPerMillion ?? null,
    dimensionRates: entry.dimensionRates || {},
    minimumCharge: entry.minimumCharge || 0,
  };
}

async function pricingEntryForTask(task) {
  if (task.pricingSnapshot?.catalogueVersion) {
    return {
      version: task.pricingSnapshot.catalogueVersion,
      currency: task.pricingSnapshot.currency,
      inputPerMillion: task.pricingSnapshot.inputPerMillion,
      outputPerMillion: task.pricingSnapshot.outputPerMillion,
      cachedInputPerMillion: task.pricingSnapshot.cachedInputPerMillion,
      dimensionRates: task.pricingSnapshot.dimensionRates || {},
      minimumCharge: task.pricingSnapshot.minimumCharge,
    };
  }
  return getCatalogueEntry(task.provider, task.model, { tenantId: task.tenantId });
}

function publicTask(task) {
  const value = task?.toObject ? task.toObject() : { ...(task || {}) };
  delete value.leaseOwner;
  delete value.leaseUntil;
  delete value.__v;
  return { ...value, id: String(value._id || value.id), taskId: String(value._id || value.id) };
}

async function publishEvent(taskId, type, payload = {}) {
  const task = await AITask.findOneAndUpdate(
    { _id: taskId }, { $inc: { eventSequence: 1 } }, { new: true, select: 'tenantId eventSequence retentionUntil' },
  );
  if (!task) return null;
  return AITaskEvent.create({
    tenantId: task.tenantId, taskId, sequence: task.eventSequence, type,
    payload: redactSecrets(payload), retentionUntil: task.retentionUntil,
  });
}

async function preflight({ tenantId, userId, matterId, input }) {
  if (input.humanValidationRequired === false) throw new AIError('AI_HUMAN_VALIDATION_REQUIRED', 'La validation humaine ne peut pas être désactivée.', { statusCode: 400 });
  if (String(input.userInstruction || '').length > 30000) throw new AIError('AI_INSTRUCTION_TOO_LONG', 'L’instruction dépasse 30 000 caractères.', { statusCode: 413 });
  const connection = await loadUsableConnection({ tenantId, userId, connectionId: input.connectionId });
  const taskType = normalizeTaskType(input.taskType);
  const model = input.model || connection.defaultModel;
  const gateway = new AIGateway();
  gateway.assertModelAllowed(connection, model);
  const promptTemplate = await getPrompt(taskType, tenantId);
  const context = await buildContext({
    tenantId, matterId, manifest: input.contextManifest || {},
    instruction: input.userInstruction || '', taskType,
    allowConfidentialByPolicy: connection.rules?.allowConfidentialDocuments === true,
  });
  const userContent = renderPrompt(promptTemplate, { context: context.contextText, instruction: input.userInstruction || '' });
  const maxOutputTokens = Math.min(
    Number(input.maxOutputTokens || connection.rules?.maxOutputTokens || 4096),
    Number(connection.rules?.maxOutputTokens || 4096),
  );
  const estimate = await estimateRequest({ tenantId, provider: connection.provider, model, inputText: `${promptTemplate.systemInstruction}\n${userContent}`, maxOutputTokens });
  const policy = await budgetService.getOrCreatePolicy({ tenantId, userId, connection });
  const budget = await budgetService.budgetPreview({ policy, amount: estimate.cost });
  const actorRole = await getTenantRole(tenantId, userId);
  const canOverride = (budget.policy.overrideRoles || []).includes(actorRole);
  const softAuthorized = !budget.softExceeded || (input.budgetOverride === true && canOverride);
  return {
    connection,
    taskType,
    model,
    promptTemplate,
    context,
    maxOutputTokens,
    estimate,
    policy: budget.policy,
    public: {
      ok: !budget.hardExceeded && softAuthorized,
      provider: connection.provider,
      model,
      taskType,
      context: {
        requestedDocuments: context.requestedDocuments,
        selectedCharacters: context.selectedCharacters,
        sources: context.anchors,
        warnings: context.warnings,
      },
      estimatedUsage: estimate.usage,
      estimatedCost: estimate.cost,
      currency: estimate.currency,
      catalogueVersion: estimate.catalogueVersion,
      budget: {
        id: String(budget.policy._id),
        hardExceeded: budget.hardExceeded,
        softExceeded: budget.softExceeded,
        overrideRequired: budget.softExceeded,
        canOverride,
        actorRole,
        projectedDaily: budget.daily,
        projectedMonthly: budget.monthly,
        projectedPeriod: budget.period,
        periodExceeded: budget.periodExceeded,
        periodType: budget.policy.periodType || null,
        periodLimit: budget.policy.periodLimit ?? null,
        remaining: budget.policy.periodLimit == null
          ? null
          : Math.max(0, Number(budget.policy.periodLimit) - Number(budget.period || 0)),
        hardDailyLimit: budget.policy.hardDailyLimit,
        hardMonthlyLimit: budget.policy.hardMonthlyLimit,
        perTaskLimit: budget.policy.perTaskLimit,
        overrideRoles: budget.policy.overrideRoles,
      },
      humanValidationRequired: true,
    },
  };
}

async function createTask({ tenantId, userId, matterId, input, idempotencyKey }) {
  if (!idempotencyKey) throw new AIError('AI_IDEMPOTENCY_KEY_REQUIRED', 'Une clé d’idempotence est obligatoire pour créer une tâche.', { statusCode: 400 });
  const normalizedKey = String(idempotencyKey).trim().slice(0, 200);
  const existing = await AITask.findOne({ tenantId, userId, idempotencyKey: normalizedKey });
  if (existing) return { task: existing, reused: true };
  const check = await preflight({ tenantId, userId, matterId, input });
  const taskId = new (require('mongoose').Types.ObjectId)();
  const retentionDays = contentRetentionDays(check.connection);
  let task;
  try {
    task = await AITask.create({
      _id: taskId, tenantId, matterId, userId,
      connectionId: check.connection._id, provider: check.connection.provider, model: check.model,
      taskType: check.taskType, status: 'queued', idempotencyKey: normalizedKey,
      contextManifest: input.contextManifest || {},
      promptTemplateId: check.promptTemplate.templateId, promptVersion: check.promptTemplate.version,
      userInstruction: input.userInstruction || '', estimatedUsage: check.estimate.usage,
      pricingSnapshot: pricingSnapshot(check.estimate.entry),
      estimatedCost: check.estimate.cost, currency: check.estimate.currency,
      budgetOverrideAuthorized: input.budgetOverride === true,
      sourceAnchors: check.context.anchors,
      retentionUntil: new Date(Date.now() + retentionDays * 86400000),
      maxAttempts: Number(process.env.AI_TASK_MAX_ATTEMPTS || 3),
    });
  } catch (err) {
    if (err?.code === 11000) {
      const raced = await AITask.findOne({ tenantId, userId, idempotencyKey: normalizedKey });
      if (raced) return { task: raced, reused: true };
    }
    throw err;
  }
  try {
    const actorRole = await getTenantRole(tenantId, userId);
    const reservation = await budgetService.reserve({
      policy: check.policy, taskId, tenantId, userId, matterId,
      connectionId: check.connection._id, amount: check.estimate.cost,
      currency: check.estimate.currency, model: check.model,
      override: input.budgetOverride === true, actorRole,
    });
    task = await AITask.findOneAndUpdate(
      { _id: taskId, status: 'queued' },
      { $set: { status: 'budget_reserved', budgetReservationId: reservation._id } },
      { new: true },
    );
    await publishEvent(taskId, 'status', { status: 'budget_reserved', message: 'Budget réservé.' });
    task = await AITask.findOneAndUpdate(
      { _id: taskId, status: 'budget_reserved' }, { $set: { status: 'queued', availableAt: new Date() } }, { new: true },
    );
    await publishEvent(taskId, 'status', { status: 'queued', message: 'Tâche mise en file durable.' });
    return { task, reused: false };
  } catch (err) {
    await AITask.updateOne({ _id: taskId }, { $set: { status: 'blocked_budget', errorCode: err.code || 'AI_BUDGET_ERROR', errorMessage: err.message, completedAt: new Date() } });
    await publishEvent(taskId, 'error', { status: 'blocked_budget', code: err.code || 'AI_BUDGET_ERROR', message: err.message });
    throw err;
  }
}

async function claimNextTask(workerId = `worker-${process.pid}-${crypto.randomUUID()}`, leaseMs = taskLeaseMs()) {
  const now = new Date();
  return AITask.findOneAndUpdate(
    {
      status: { $in: CLAIMABLE }, availableAt: { $lte: now },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
    },
    {
      $set: { status: 'preparing', leaseOwner: workerId, leaseUntil: new Date(now.getTime() + leaseMs), startedAt: now },
      $inc: { attempts: 1 },
    },
    { new: true, sort: { availableAt: 1, createdAt: 1 } },
  );
}

async function cancellationRequested(taskId) {
  const task = await AITask.findById(taskId).select('status cancellationRequestedAt').lean();
  return !task || task.status === 'cancel_requested' || task.status === 'cancelled';
}

async function finishCancelled(task, { settleActual = null } = {}) {
  if (settleActual) await settleActual();
  else if (task.budgetReservationId) await budgetService.release({ reservationId: task.budgetReservationId });
  await AITask.updateOne(
    { _id: task._id, status: { $nin: ['succeeded', 'failed'] } },
    { $set: { status: 'cancelled', completedAt: new Date(), leaseOwner: null, leaseUntil: null } },
  );
  await publishEvent(task._id, 'done', { status: 'cancelled', message: 'Tâche annulée. Aucun artefact n’a été créé.' });
  await aiAudit.record({
    tenantId: task.tenantId, actorUserId: task.userId, action: 'task.cancelled',
    resourceType: 'AITask', resourceId: task._id, matterId: task.matterId, taskId: task._id,
    provider: task.provider, model: task.model,
    details: { usageSettled: Boolean(settleActual), artifactCreated: false },
  });
}

async function runClaimedTask(task, { secretProvider = createSecretProvider(), gateway = new AIGateway() } = {}) {
  let providerResult = null;
  let activeConnection = null;
  let providerCallStarted = false;
  let providerCallSucceeded = false;
  const leaseDuration = taskLeaseMs();
  const heartbeat = setInterval(() => {
    AITask.updateOne(
      { _id: task._id, leaseOwner: task.leaseOwner, status: { $in: ['preparing', 'running', 'streaming'] } },
      { $set: { leaseUntil: new Date(Date.now() + leaseDuration) } },
    ).catch(() => {});
  }, Math.max(10000, Math.floor(leaseDuration / 3)));
  heartbeat.unref?.();
  try {
    await publishEvent(task._id, 'status', { status: 'preparing', progress: 10, message: 'Vérification des droits et de la connexion.' });
    if (await cancellationRequested(task._id)) return finishCancelled(task);
    const connection = await loadUsableConnection({ tenantId: task.tenantId, userId: task.userId, connectionId: task.connectionId });
    activeConnection = connection;
    let reservation = task.budgetReservationId ? await AIBudgetReservation.findById(task.budgetReservationId) : null;
    if (reservation?.state === 'active') {
      reservation = await budgetService.renew({ reservationId: reservation._id });
    } else {
      const policy = await budgetService.getOrCreatePolicy({ tenantId: task.tenantId, userId: task.userId, connection });
      reservation = await budgetService.reserve({
        policy, taskId: task._id, tenantId: task.tenantId, userId: task.userId,
        matterId: task.matterId, connectionId: connection._id,
        amount: task.estimatedCost, currency: task.currency, model: task.model,
        override: task.budgetOverrideAuthorized === true, actorRole: await getTenantRole(task.tenantId, task.userId),
      });
      task.budgetReservationId = reservation._id;
      await AITask.updateOne({ _id: task._id, status: 'preparing' }, { $set: { budgetReservationId: reservation._id } });
    }
    if (!reservation || reservation.state !== 'active') throw new AIError('AI_BUDGET_RESERVATION_REQUIRED', 'Aucun appel fournisseur ne peut démarrer sans réservation budgétaire active.', { statusCode: 503 });
    const apiKey = await secretProvider.access({ tenantId: task.tenantId, secretRef: connection.secretRef });
    await publishEvent(task._id, 'status', { status: 'preparing', progress: 25, message: 'Extraction et recherche des passages pertinents.' });
    const context = await buildContext({
      tenantId: task.tenantId, matterId: task.matterId, manifest: task.contextManifest,
      instruction: task.userInstruction, taskType: task.taskType,
      allowConfidentialByPolicy: connection.rules?.allowConfidentialDocuments === true,
    });
    if (await cancellationRequested(task._id)) return finishCancelled(task);
    const prompt = await getPrompt(task.taskType, task.tenantId);
    const userContent = renderPrompt(prompt, { context: context.contextText, instruction: task.userInstruction });
    await AITask.updateOne(
      { _id: task._id, status: 'preparing' },
      { $set: { status: 'running', sourceAnchors: context.anchors, leaseUntil: new Date(Date.now() + leaseDuration) } },
    );
    await publishEvent(task._id, 'status', { status: 'running', progress: 45, message: `Appel sécurisé à ${task.provider}.` });
    await aiAudit.record({
      tenantId: task.tenantId, actorUserId: task.userId, action: 'task.provider_call',
      resourceType: 'AITask', resourceId: task._id, matterId: task.matterId, taskId: task._id,
      provider: task.provider, model: task.model,
      details: { taskType: task.taskType, sourceCount: context.anchors.length, estimatedCost: task.estimatedCost },
    });
    providerCallStarted = true;
    providerResult = await gateway.generate(connection, apiKey, {
      model: task.model, systemInstruction: prompt.systemInstruction, userContent,
      maxOutputTokens: task.estimatedUsage?.outputTokens || connection.rules?.maxOutputTokens,
    });
    providerCallSucceeded = true;
    await recordConnectionSuccess({ tenantId: task.tenantId, connectionId: task.connectionId }).catch(() => {});
    const pricingEntry = await pricingEntryForTask(task);
    const hasOfficialCost = Number.isFinite(Number(providerResult.usage?.officialCost))
      && Number(providerResult.usage.officialCost) >= 0;
    const actualCostNature = hasOfficialCost ? 'official' : 'calculated';
    const actualCost = calculateCost(pricingEntry, providerResult.usage);
    task.actualUsage = providerResult.usage;
    task.actualCost = actualCost;
    task.actualCostNature = actualCostNature;
    task.providerRequestId = providerResult.providerRequestId;
    const settleActual = async () => {
      if (!task.budgetReservationId) return;
      await budgetService.settle({
        reservationId: task.budgetReservationId, actualAmount: actualCost,
        usage: providerResult.usage, pricing: ledgerRates(pricingEntry, actualCostNature), task,
      });
    };
    if (await cancellationRequested(task._id)) return finishCancelled(task, { settleActual });
    await AITask.updateOne(
      { _id: task._id, status: 'running' },
      { $set: { status: 'streaming', actualUsage: providerResult.usage, actualCost, actualCostNature, providerRequestId: providerResult.providerRequestId } },
    );
    await publishEvent(task._id, 'usage', { usage: providerResult.usage, actualCost, currency: task.currency });
    const chunks = String(providerResult.text || '').match(/[\s\S]{1,800}/g) || [''];
    for (let i = 0; i < chunks.length; i += 1) {
      if (await cancellationRequested(task._id)) return finishCancelled(task, { settleActual });
      await publishEvent(task._id, 'delta', { text: chunks[i], index: i, total: chunks.length, progress: 55 + Math.round((i + 1) / chunks.length * 30) });
    }
    const cited = citedAnchors(providerResult.text, context.anchors);
    if (context.anchors.length && !cited.length) {
      await publishEvent(task._id, 'warning', { code: 'AI_RESULT_WITHOUT_EXPLICIT_CITATION', message: 'La réponse ne contient pas de référence [S…] explicite. Vérification humaine renforcée requise.' });
    }
    if (await cancellationRequested(task._id)) return finishCancelled(task, { settleActual });
    await settleActual();
    // La transition terminale est atomique face à cancelTask. Dès qu’elle
    // réussit, l’annulation n’est plus acceptée et l’artefact peut être créé.
    const completed = await AITask.findOneAndUpdate(
      { _id: task._id, status: 'streaming', cancellationRequestedAt: null },
      {
        $set: {
          status: 'succeeded', actualUsage: providerResult.usage, actualCost, actualCostNature,
          providerRequestId: providerResult.providerRequestId,
          resultPreview: String(providerResult.text || '').slice(0, 4000),
          completedAt: new Date(), leaseOwner: null, leaseUntil: null,
        },
      },
      { new: true },
    );
    if (!completed) return finishCancelled(task, { settleActual: async () => {} });
    const citationWarnings = context.anchors.length && !cited.length ? ['AI_RESULT_WITHOUT_EXPLICIT_CITATION'] : [];
    const artifact = await createResponseArtifact({
      task: completed, text: providerResult.text, sourceAnchors: cited,
      contextSourceAnchors: context.anchors, warnings: citationWarnings,
    });
    await AITask.updateOne({ _id: task._id, status: 'succeeded' }, { $addToSet: { resultArtifactIds: artifact._id } });
    await publishEvent(task._id, 'artifact', { artifactId: String(artifact._id), type: 'response', validationStatus: artifact.validationStatus });
    await publishEvent(task._id, 'done', { status: 'succeeded', progress: 100, message: 'Brouillon IA prêt à être validé.' });
    await aiAudit.record({
      tenantId: task.tenantId, actorUserId: task.userId, action: 'task.completed',
      resourceType: 'AITask', resourceId: task._id, matterId: task.matterId, taskId: task._id,
      provider: task.provider, model: task.model,
      details: { taskType: task.taskType, sourceCount: context.anchors.length, actualUsage: providerResult.usage, actualCost, currency: task.currency, artifactId: artifact._id },
    });
    return completed;
  } catch (err) {
    if (providerCallStarted && !providerCallSucceeded && activeConnection) {
      await recordConnectionFailure({ tenantId: task.tenantId, connectionId: task.connectionId, error: err }).catch(() => {});
    }
    const latest = await AITask.findById(task._id);
    if (latest?.status === 'succeeded') {
      await publishEvent(task._id, 'warning', { code: 'AI_ARTIFACT_PERSISTENCE_PENDING', message: 'Le résultat est terminé mais son artefact doit être repris.' });
      throw err;
    }
    if (latest?.status === 'cancel_requested' || latest?.status === 'cancelled') return finishCancelled(task);
    const retryable = err.retryable === true && Number(task.attempts || 0) < Number(task.maxAttempts || 3);
    if (retryable) {
      const delay = Math.min(60000, 1000 * (2 ** Math.max(0, Number(task.attempts || 1) - 1)));
      await AITask.updateOne(
        { _id: task._id, status: { $nin: [...TERMINAL] } },
        { $set: { status: 'retry_wait', availableAt: new Date(Date.now() + delay), errorCode: err.code || 'AI_RETRYABLE_ERROR', errorMessage: err.message, leaseOwner: null, leaseUntil: null } },
      );
      await publishEvent(task._id, 'warning', { status: 'retry_wait', code: err.code || 'AI_RETRYABLE_ERROR', retryInMs: delay });
      return null;
    }
    if (task.budgetReservationId) await budgetService.release({ reservationId: task.budgetReservationId }).catch(() => {});
    await AITask.updateOne(
      { _id: task._id, status: { $nin: [...TERMINAL] } },
      { $set: { status: 'failed', errorCode: err.code || 'AI_TASK_FAILED', errorMessage: err.message, completedAt: new Date(), leaseOwner: null, leaseUntil: null } },
    );
    await publishEvent(task._id, 'error', { status: 'failed', code: err.code || 'AI_TASK_FAILED', message: err.message });
    await aiAudit.record({
      tenantId: task.tenantId, actorUserId: task.userId, action: 'task.failed',
      resourceType: 'AITask', resourceId: task._id, matterId: task.matterId, taskId: task._id,
      provider: task.provider, model: task.model, outcome: 'failure',
      details: { code: err.code || 'AI_TASK_FAILED', retryable: err.retryable === true, attempts: task.attempts },
    });
    throw err;
  } finally {
    clearInterval(heartbeat);
  }
}

async function runNextTask(options = {}) {
  const task = await claimNextTask(options.workerId, options.leaseMs);
  if (!task) return null;
  return runClaimedTask(task, options);
}

async function cancelTask({ tenantId, userId, taskId }) {
  const task = await AITask.findOne({ _id: taskId, tenantId });
  if (!task) throw new AIError('AI_TASK_NOT_FOUND', 'Tâche IA introuvable.', { statusCode: 404 });
  if (TERMINAL.has(task.status)) {
    if (task.status === 'succeeded') throw new AIError('AI_TASK_ALREADY_COMPLETED', 'La tâche est déjà terminée et ne peut plus être annulée.', { statusCode: 409 });
    return task;
  }
  const immediate = ['queued', 'budget_reserved', 'retry_wait'].includes(task.status);
  const nextStatus = immediate ? 'cancelled' : 'cancel_requested';
  const updated = await AITask.findOneAndUpdate(
    { _id: taskId, tenantId, status: { $nin: [...TERMINAL] } },
    { $set: { status: nextStatus, cancellationRequestedAt: new Date(), ...(immediate ? { completedAt: new Date(), leaseOwner: null, leaseUntil: null } : {}) } },
    { new: true },
  );
  if (immediate && task.budgetReservationId) await budgetService.release({ reservationId: task.budgetReservationId });
  await publishEvent(taskId, 'status', { status: nextStatus, message: immediate ? 'Tâche annulée.' : 'Annulation demandée.' });
  return updated;
}

async function resumeExpiredLeases(now = new Date()) {
  const expired = await AITask.find({
    status: { $in: ['preparing', 'running', 'streaming', 'cancel_requested'] },
    leaseUntil: { $lte: now },
  }).select('_id status budgetReservationId').lean();
  for (const task of expired) {
    if (task.status === 'cancel_requested') {
      if (task.budgetReservationId) await budgetService.release({ reservationId: task.budgetReservationId }).catch(() => {});
      await AITask.updateOne({ _id: task._id, status: 'cancel_requested' }, { $set: { status: 'cancelled', completedAt: now, leaseOwner: null, leaseUntil: null } });
      await publishEvent(task._id, 'done', { status: 'cancelled', recovered: true });
    } else {
      await AITask.updateOne(
        { _id: task._id, leaseUntil: { $lte: now }, status: task.status },
        { $set: { status: 'retry_wait', availableAt: now, leaseOwner: null, leaseUntil: null } },
      );
      await publishEvent(task._id, 'warning', { status: 'retry_wait', code: 'AI_WORKER_LEASE_EXPIRED' });
    }
  }
  return expired.length;
}

async function repairSucceededArtifacts(limit = 20) {
  const tasks = await AITask.find({ status: 'succeeded', resultArtifactIds: { $size: 0 } }).limit(limit);
  let repaired = 0;
  for (const task of tasks) {
    const events = await AITaskEvent.find({ taskId: task._id, type: 'delta' }).sort({ sequence: 1 }).lean();
    const text = events.map((event) => event.payload?.text || '').join('');
    if (!text) continue;
    const cited = citedAnchors(text, task.sourceAnchors || []);
    const artifact = await createResponseArtifact({
      task, text, sourceAnchors: cited, contextSourceAnchors: task.sourceAnchors || [],
      warnings: (task.sourceAnchors || []).length && !cited.length ? ['AI_RESULT_WITHOUT_EXPLICIT_CITATION'] : [],
    });
    await AITask.updateOne({ _id: task._id }, { $addToSet: { resultArtifactIds: artifact._id } });
    repaired += 1;
  }
  return repaired;
}

let workerTimer = null;
let workerCycleRunning = false;
function startWorkerLoop({ intervalMs = Number(process.env.AI_WORKER_POLL_MS || 3000) } = {}) {
  if (workerTimer) return workerTimer;
  workerTimer = setInterval(async () => {
    if (workerCycleRunning) return;
    workerCycleRunning = true;
    try {
      await resumeExpiredLeases();
      await budgetService.releaseExpired();
      await repairSucceededArtifacts();
      await Promise.all(Array.from({ length: workerConcurrency() }, () => runNextTask()));
    } catch (err) {
      console.error('[AI worker]', err.code || err.name || 'ERROR');
    } finally {
      workerCycleRunning = false;
    }
  }, intervalMs);
  workerTimer.unref?.();
  return workerTimer;
}

function stopWorkerLoop() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}

function workerStatus() {
  return {
    running: Boolean(workerTimer),
    cycleRunning: workerCycleRunning,
  };
}

module.exports = {
  TERMINAL,
  publicTask,
  publishEvent,
  preflight,
  createTask,
  claimNextTask,
  runClaimedTask,
  runNextTask,
  cancelTask,
  resumeExpiredLeases,
  repairSucceededArtifacts,
  startWorkerLoop,
  stopWorkerLoop,
  workerStatus,
  taskLeaseMs,
  contentRetentionDays,
  workerConcurrency,
  pricingSnapshot,
  pricingEntryForTask,
};
