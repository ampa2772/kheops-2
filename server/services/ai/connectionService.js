const AIProviderConnection = require('../../models/AI/AIProviderConnection');
const AIBudgetPolicy = require('../../models/AI/AIBudgetPolicy');
const { ROLES } = require('../cabinetRoles');
const { getTenantRole } = require('./tenantRoleService');
const { createSecretProvider } = require('./secretProvider');
const { AIGateway } = require('./gateway');
const { AIError } = require('./errors');
const {
  buildModelDiscovery,
  cacheIsFresh,
} = require('./modelDiscoveryService');

const MANAGER_ROLES = [ROLES.OWNER, ROLES.ADMIN];

const BUDGET_FIELDS = [
  'softDailyLimit', 'hardDailyLimit', 'softMonthlyLimit', 'hardMonthlyLimit',
  'perTaskLimit', 'warningThresholds', 'actionAtLimit',
  'periodType', 'periodLimit', 'customPeriodDays',
];

function normalizeAllowedModels(defaultModel, allowedModels) {
  const normalizedDefault = String(defaultModel || '').trim();
  if (!normalizedDefault) throw new AIError('AI_MODEL_REQUIRED', 'Le modèle par défaut est obligatoire.', { statusCode: 400 });
  if (normalizedDefault.length > 200) throw new AIError('AI_MODEL_INVALID', 'Le nom du modèle est trop long.', { statusCode: 400 });
  const source = Array.isArray(allowedModels) && allowedModels.length ? allowedModels : [normalizedDefault];
  if (source.length > 100) throw new AIError('AI_MODEL_ALLOWLIST_TOO_LARGE', 'Au maximum 100 modèles peuvent être autorisés.', { statusCode: 400 });
  const normalized = [...new Set(source.map((model) => String(model).trim()).filter(Boolean))];
  if (normalized.some((model) => model.length > 200)) throw new AIError('AI_MODEL_INVALID', 'Un nom de modèle est trop long.', { statusCode: 400 });
  if (!normalized.includes(normalizedDefault)) throw new AIError('AI_DEFAULT_MODEL_FORBIDDEN', 'Le modèle par défaut doit être présent dans les modèles autorisés.', { statusCode: 400 });
  return normalized;
}

async function ensureDefaultBudgetPolicy({ tenantId, userId, ownerType, budget = {} }) {
  const scopeType = ownerType === 'cabinet' ? 'tenant' : 'user';
  const scopeId = ownerType === 'cabinet' ? null : userId;
  const set = { updatedBy: userId };
  for (const field of BUDGET_FIELDS) {
    if (budget[field] === undefined) continue;
    if (/Limit$/.test(field) && budget[field] !== null && (!Number.isFinite(Number(budget[field])) || Number(budget[field]) < 0)) {
      throw new AIError('AI_BUDGET_VALUE_INVALID', `La valeur ${field} est invalide.`, { statusCode: 400 });
    }
    set[field] = budget[field];
  }
  if (set.periodType && !['day', 'week', 'month', 'custom'].includes(set.periodType)) {
    throw new AIError('AI_BUDGET_PERIOD_INVALID', 'La période budgétaire est invalide.', { statusCode: 400 });
  }
  if (set.customPeriodDays !== undefined && (!Number.isInteger(Number(set.customPeriodDays)) || Number(set.customPeriodDays) < 1 || Number(set.customPeriodDays) > 365)) {
    throw new AIError('AI_BUDGET_CUSTOM_PERIOD_INVALID', 'La période personnalisée doit contenir entre 1 et 365 jours.', { statusCode: 400 });
  }
  const simpleBudgetRequested = set.periodType !== undefined
    || set.periodLimit !== undefined
    || set.customPeriodDays !== undefined;
  if (simpleBudgetRequested) {
    if (set.periodLimit == null || String(set.periodLimit).trim() === ''
      || !Number.isFinite(Number(set.periodLimit)) || Number(set.periodLimit) < 0) {
      throw new AIError('AI_BUDGET_PERIOD_LIMIT_REQUIRED', 'Un plafond valide est obligatoire pour la période budgétaire.', { statusCode: 400 });
    }
    set.periodLimit = Number(set.periodLimit);
    set.customPeriodDays = Number(set.customPeriodDays || 30);
    set.periodAnchorAt = new Date();
    // Le parcours simplifié applique un seul plafond de période. Les anciens
    // plafonds jour+mois ne doivent pas continuer à bloquer en arrière-plan.
    set.hardDailyLimit = null;
    set.hardMonthlyLimit = null;
    set.softDailyLimit = null;
    set.softMonthlyLimit = null;
  }
  const setOnInsert = {
    tenantId, scopeType, scopeId,
    name: ownerType === 'cabinet' ? 'Budget IA du cabinet' : 'Budget IA personnel',
    currency: budget.currency === 'USD' ? 'USD' : 'EUR',
    hardDailyLimit: Number(process.env.AI_DEFAULT_DAILY_LIMIT || 5),
    hardMonthlyLimit: Number(process.env.AI_DEFAULT_MONTHLY_LIMIT || 50),
    perTaskLimit: Number(process.env.AI_DEFAULT_PER_TASK_LIMIT || 10),
    periodType: 'month',
    periodLimit: null,
    customPeriodDays: 30,
    periodAnchorAt: new Date(),
    createdBy: userId,
  };
  for (const field of Object.keys(set)) delete setOnInsert[field];
  return AIBudgetPolicy.findOneAndUpdate(
    { tenantId, scopeType, scopeId },
    {
      $set: set,
      $setOnInsert: setOnInsert,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
  );
}

function publicConnection(doc) {
  const value = doc?.toObject ? doc.toObject() : { ...(doc || {}) };
  delete value.secretRef;
  delete value.baseUrl;
  const secretCleanupPending = Array.isArray(value.pendingSecretCleanupRefs) && value.pendingSecretCleanupRefs.length > 0;
  delete value.pendingSecretCleanupRefs;
  delete value.__v;
  return { ...value, id: String(value._id || value.id), secretCleanupPending };
}

async function assertCanManageConnection(tenantId, userId, connectionOrOwnerType) {
  const ownerType = typeof connectionOrOwnerType === 'string' ? connectionOrOwnerType : connectionOrOwnerType.ownerType;
  const ownerId = typeof connectionOrOwnerType === 'object' ? connectionOrOwnerType.ownerId : null;
  if (ownerType === 'user') {
    if (ownerId && String(ownerId) !== String(userId)) throw new AIError('AI_CONNECTION_FORBIDDEN', 'Cette connexion personnelle appartient à un autre utilisateur.', { statusCode: 403 });
    return;
  }
  const role = await getTenantRole(tenantId, userId);
  if (!MANAGER_ROLES.includes(role)) throw new AIError('AI_CONNECTION_ADMIN_REQUIRED', 'Seul un administrateur du cabinet peut gérer cette connexion.', { statusCode: 403 });
}

async function canUseConnection(connection, userId) {
  if (connection.status !== 'active') return false;
  if (connection.ownerType === 'user') return String(connection.ownerId) === String(userId);
  const allowedUsers = (connection.permittedUserIds || []).map(String);
  if (allowedUsers.length && !allowedUsers.includes(String(userId))) return false;
  const allowedRoles = connection.permittedRoles || [];
  if (!allowedRoles.length) return true;
  return allowedRoles.includes(await getTenantRole(connection.tenantId, userId));
}

async function listConnections({ tenantId, userId, includeInactive = false }) {
  const docs = await AIProviderConnection.find({
    tenantId,
    status: includeInactive ? { $ne: 'revoked' } : 'active',
    $or: [{ ownerType: 'user', ownerId: userId }, { ownerType: 'cabinet' }],
  }).lean();
  const visible = [];
  const role = await getTenantRole(tenantId, userId);
  for (const doc of docs) {
    const isPersonalOwner = doc.ownerType === 'user' && String(doc.ownerId) === String(userId);
    const isCabinetManager = doc.ownerType === 'cabinet' && MANAGER_ROLES.includes(role);
    if (isPersonalOwner || isCabinetManager || await canUseConnection(doc, userId)) visible.push(publicConnection(doc));
  }
  return visible;
}

async function createConnection({ tenantId, userId, body, secretProvider = createSecretProvider(), gateway = new AIGateway() }) {
  const ownerType = body.ownerType === 'cabinet' ? 'cabinet' : 'user';
  await assertCanManageConnection(tenantId, userId, ownerType);
  if (body.provider === 'openai-compatible') await assertCanManageConnection(tenantId, userId, 'cabinet');
  if (!body.apiKey) throw new AIError('AI_SECRET_REQUIRED', 'La clé API est obligatoire.', { statusCode: 400 });
  const allowedModels = normalizeAllowedModels(body.defaultModel, body.allowedModels);
  const draft = {
    provider: body.provider,
    defaultModel: String(body.defaultModel),
    allowedModels,
    rules: body.rules || {},
    baseUrl: body.baseUrl || null,
  };
  const capabilities = await gateway.capabilities(draft);
  const stored = await secretProvider.store({ tenantId, secret: body.apiKey, createdBy: userId });
  try {
    const doc = await AIProviderConnection.create({
      tenantId,
      ownerType,
      ownerId: ownerType === 'user' ? userId : tenantId,
      provider: body.provider,
      displayName: body.displayName || `${body.provider} — ${String(body.defaultModel)}`,
      secretRef: stored.secretRef,
      fingerprint: stored.fingerprint,
      status: 'pending',
      allowedModels: draft.allowedModels,
      defaultModel: draft.defaultModel,
      discoveredModels: draft.allowedModels.map((id) => ({ id, label: id, capabilities: { text: true }, recommended: id === draft.defaultModel })),
      recommendedModel: draft.defaultModel,
      modelsDiscoverySource: 'configured',
      capabilities,
      permittedUserIds: body.permittedUserIds || [],
      permittedRoles: body.permittedRoles || [],
      policyId: body.policyId || null,
      rules: body.rules || {},
      baseUrl: draft.baseUrl,
      reviewAt: body.reviewAt || null,
      createdBy: userId,
    });
    try {
      const policy = await ensureDefaultBudgetPolicy({ tenantId, userId, ownerType, budget: body.budget || {} });
      doc.policyId = policy._id;
      await doc.save();
    } catch (err) {
      await AIProviderConnection.deleteOne({ _id: doc._id, tenantId }).catch(() => {});
      await secretProvider.destroy({ tenantId, secretRef: stored.secretRef }).catch(() => {});
      throw err;
    }
    return publicConnection(doc);
  } catch (err) {
    await secretProvider.destroy({ tenantId, secretRef: stored.secretRef }).catch(() => {});
    throw err;
  }
}

async function loadConnectionForManagement({ tenantId, userId, connectionId }) {
  const doc = await AIProviderConnection.findOne({ _id: connectionId, tenantId }).select('+secretRef +baseUrl +pendingSecretCleanupRefs');
  if (!doc) throw new AIError('AI_CONNECTION_NOT_FOUND', 'Connexion IA introuvable.', { statusCode: 404 });
  await assertCanManageConnection(tenantId, userId, doc);
  return doc;
}

async function loadUsableConnection({ tenantId, userId, connectionId }) {
  const doc = await AIProviderConnection.findOne({ _id: connectionId, tenantId }).select('+secretRef +baseUrl +pendingSecretCleanupRefs');
  if (!doc || !(await canUseConnection(doc, userId))) {
    throw new AIError('AI_CONNECTION_FORBIDDEN', 'Cette connexion IA n’est pas accessible.', { statusCode: 403 });
  }
  return doc;
}

async function testConnection({ tenantId, userId, connectionId, secretProvider = createSecretProvider(), gateway = new AIGateway() }) {
  const doc = await loadConnectionForManagement({ tenantId, userId, connectionId });
  const apiKey = await secretProvider.access({ tenantId, secretRef: doc.secretRef });
  try {
    const result = await gateway.testConnection(doc, apiKey);
    doc.status = 'active';
    doc.lastValidatedAt = new Date();
    doc.lastErrorCode = null;
    doc.consecutiveFailures = 0;
    doc.capabilities = result.capabilities;
    await doc.save();
    return { ...result, connection: publicConnection(doc) };
  } catch (err) {
    doc.status = 'error';
    doc.lastErrorCode = err.code || 'AI_PROVIDER_ERROR';
    doc.consecutiveFailures = Number(doc.consecutiveFailures || 0) + 1;
    await doc.save();
    throw err;
  }
}

function publicModelCache(connection) {
  const value = connection?.toObject ? connection.toObject() : { ...(connection || {}) };
  const modelOptions = (value.discoveredModels || []).map((item) => ({
    id: String(item.id),
    label: item.label || String(item.id),
    capabilities: item.capabilities || { text: true },
    recommended: item.recommended === true || String(item.id) === String(value.recommendedModel || ''),
  }));
  return {
    provider: value.provider,
    models: modelOptions.map((item) => item.id),
    modelOptions,
    recommendedModel: value.recommendedModel || modelOptions.find((item) => item.recommended)?.id || null,
    refreshedAt: value.modelsRefreshedAt || null,
    discoveryVersion: value.modelsDiscoveryVersion || null,
    source: value.modelsDiscoverySource || 'configured',
  };
}

async function refreshConnectionModels({
  tenantId,
  userId,
  connectionId,
  force = false,
  requiredCapabilities = ['text'],
  secretProvider = createSecretProvider(),
  gateway = new AIGateway(),
  now = new Date(),
  env = process.env,
}) {
  const doc = await loadConnectionForManagement({ tenantId, userId, connectionId });
  if (!force && cacheIsFresh(doc, { now, env })) {
    return { ...publicModelCache(doc), cached: true, connection: publicConnection(doc) };
  }
  const apiKey = await secretProvider.access({ tenantId, secretRef: doc.secretRef });
  const modelIds = await gateway.listModels(doc, apiKey);
  const discovery = buildModelDiscovery(doc.provider, modelIds, { requiredCapabilities, now });
  doc.discoveredModels = discovery.modelOptions;
  doc.recommendedModel = discovery.recommendedModel;
  doc.modelsRefreshedAt = discovery.refreshedAt;
  doc.modelsDiscoverySource = 'provider';
  doc.modelsDiscoveryVersion = discovery.discoveryVersion;
  await doc.save();
  return { ...discovery, cached: false, connection: publicConnection(doc) };
}

async function updateConnection({ tenantId, userId, connectionId, changes }) {
  const doc = await loadConnectionForManagement({ tenantId, userId, connectionId });
  const allowed = ['displayName', 'defaultModel', 'allowedModels', 'rules', 'permittedUserIds', 'permittedRoles', 'policyId', 'reviewAt'];
  for (const key of allowed) if (changes[key] !== undefined) doc[key] = changes[key];
  if (changes.status !== undefined) {
    if (!['active', 'suspended'].includes(changes.status)) throw new AIError('AI_CONNECTION_STATUS_INVALID', 'État de connexion invalide.', { statusCode: 400 });
    doc.status = changes.status;
  }
  doc.allowedModels = normalizeAllowedModels(doc.defaultModel, doc.allowedModels);
  await doc.save();
  return publicConnection(doc);
}

async function rotateSecret({ tenantId, userId, connectionId, apiKey, secretProvider = createSecretProvider(), gateway = new AIGateway() }) {
  const doc = await loadConnectionForManagement({ tenantId, userId, connectionId });
  const previous = doc.secretRef;
  const stored = await secretProvider.store({ tenantId, secret: apiKey, createdBy: userId });
  let test;
  try {
    test = await gateway.testConnection(doc, apiKey);
  } catch (err) {
    await secretProvider.destroy({ tenantId, secretRef: stored.secretRef }).catch(() => {});
    throw err;
  }
  doc.secretRef = stored.secretRef;
  doc.fingerprint = stored.fingerprint;
  doc.status = 'active';
  doc.lastValidatedAt = new Date();
  doc.lastErrorCode = null;
  doc.consecutiveFailures = 0;
  doc.capabilities = test.capabilities || doc.capabilities;
  doc.pendingSecretCleanupRefs = [...new Set([...(doc.pendingSecretCleanupRefs || []), previous])];
  try {
    await doc.save();
  } catch (err) {
    await secretProvider.destroy({ tenantId, secretRef: stored.secretRef }).catch(() => {});
    throw err;
  }
  try {
    await secretProvider.destroy({ tenantId, secretRef: previous });
    doc.pendingSecretCleanupRefs = (doc.pendingSecretCleanupRefs || []).filter((ref) => ref !== previous);
    await doc.save();
  } catch (_) {
    // La nouvelle clé est active. La référence chiffrée à nettoyer est gardée
    // côté serveur afin qu'une rotation/révocation suivante puisse réessayer.
  }
  return { connection: publicConnection(doc), test };
}

async function revokeConnection({ tenantId, userId, connectionId, secretProvider = createSecretProvider() }) {
  const doc = await loadConnectionForManagement({ tenantId, userId, connectionId });
  const previous = doc.secretRef;
  // Suspendre d'abord ferme immédiatement les nouveaux appels, tout en gardant
  // la référence nécessaire à une reprise si le coffre est indisponible.
  doc.status = 'suspended';
  await doc.save();
  const refs = [...new Set([previous, ...(doc.pendingSecretCleanupRefs || [])])];
  for (const ref of refs) await secretProvider.destroy({ tenantId, secretRef: ref });
  doc.status = 'revoked';
  doc.revokedAt = new Date();
  doc.secretRef = `destroyed://${doc._id}`;
  doc.pendingSecretCleanupRefs = [];
  await doc.save();
  return { ok: true, id: String(doc._id), status: 'revoked' };
}

async function recordConnectionSuccess({ tenantId, connectionId }) {
  await AIProviderConnection.updateOne(
    { _id: connectionId, tenantId, status: { $ne: 'revoked' } },
    { $set: { lastUsedAt: new Date(), lastErrorCode: null, consecutiveFailures: 0 } },
  );
}

async function recordConnectionFailure({ tenantId, connectionId, error }) {
  const doc = await AIProviderConnection.findOneAndUpdate(
    { _id: connectionId, tenantId, status: { $nin: ['revoked', 'suspended'] } },
    { $set: { lastUsedAt: new Date(), lastErrorCode: error?.code || 'AI_PROVIDER_ERROR' }, $inc: { consecutiveFailures: 1 } },
    { new: true },
  );
  if (doc && (doc.consecutiveFailures >= 3 || error?.code === 'AI_PROVIDER_KEY_INVALID')) {
    await AIProviderConnection.updateOne(
      { _id: doc._id, tenantId, status: 'active' },
      { $set: { status: 'error' } },
    );
  }
}

module.exports = {
  publicConnection,
  canUseConnection,
  listConnections,
  createConnection,
  loadConnectionForManagement,
  loadUsableConnection,
  testConnection,
  publicModelCache,
  refreshConnectionModels,
  updateConnection,
  rotateSecret,
  revokeConnection,
  ensureDefaultBudgetPolicy,
  recordConnectionSuccess,
  recordConnectionFailure,
  normalizeAllowedModels,
};
