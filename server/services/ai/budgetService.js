const mongoose = require('mongoose');
const AIBudgetPolicy = require('../../models/AI/AIBudgetPolicy');
const AIBudgetReservation = require('../../models/AI/AIBudgetReservation');
const AIUsageLedgerEntry = require('../../models/AI/AIUsageLedgerEntry');
const { normalizeUsageDimensions } = require('./usageDimensions');
const AITask = require('../../models/AI/AITask');
const { AIError } = require('./errors');

function periodKeys(date = new Date(), timezone = 'Europe/Paris') {
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('fr-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  } catch (_) {
    throw new AIError('AI_BUDGET_TIMEZONE_INVALID', 'Le fuseau horaire de la politique IA est invalide.', { statusCode: 500 });
  }
  return { dayKey: `${parts.year}-${parts.month}-${parts.day}`, monthKey: `${parts.year}-${parts.month}` };
}

function localParts(date, timezone) {
  try {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  } catch (_) {
    throw new AIError('AI_BUDGET_TIMEZONE_INVALID', 'Le fuseau horaire de la politique IA est invalide.', { statusCode: 500 });
  }
}

// Convertit un minuit de calendrier dans le fuseau du budget vers UTC sans
// dépendance native supplémentaire. Deux itérations couvrent aussi le DST.
function zonedMidnight(year, month, day, timezone) {
  const desired = Date.UTC(year, month - 1, day, 0, 0, 0);
  let timestamp = desired;
  for (let index = 0; index < 3; index += 1) {
    const actual = localParts(new Date(timestamp), timezone);
    const rendered = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    timestamp += desired - rendered;
  }
  return new Date(timestamp);
}

function calendarDatePlusDays(parts, amount) {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

function simplePeriodWindow(policy, now = new Date()) {
  const timezone = policy.timezone || 'Europe/Paris';
  const type = ['day', 'week', 'month', 'custom'].includes(policy.periodType) ? policy.periodType : 'month';
  if (type === 'custom') {
    const customPeriodDays = Math.max(1, Math.min(365, Number(policy.customPeriodDays || 30)));
    const duration = customPeriodDays * 86400000;
    const candidateAnchor = policy.periodAnchorAt || policy.counters?.periodStartedAt || now;
    const parsedAnchor = new Date(candidateAnchor);
    const anchor = Number.isNaN(parsedAnchor.getTime()) ? new Date(now) : parsedAnchor;
    const index = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / duration));
    const startedAt = new Date(anchor.getTime() + index * duration);
    const endsAt = new Date(startedAt.getTime() + duration);
    return { type, key: `custom:${startedAt.toISOString()}`, startedAt, endsAt, customPeriodDays };
  }

  const parts = localParts(now, timezone);
  let startDate = { year: parts.year, month: parts.month, day: parts.day };
  let endDate;
  if (type === 'week') {
    const utcDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
    const sinceMonday = (utcDay + 6) % 7;
    startDate = calendarDatePlusDays(startDate, -sinceMonday);
    endDate = calendarDatePlusDays(startDate, 7);
  } else if (type === 'month') {
    startDate = { year: parts.year, month: parts.month, day: 1 };
    const next = new Date(Date.UTC(parts.year, parts.month, 1));
    endDate = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: 1 };
  } else {
    endDate = calendarDatePlusDays(startDate, 1);
  }
  const startedAt = zonedMidnight(startDate.year, startDate.month, startDate.day, timezone);
  const endsAt = zonedMidnight(endDate.year, endDate.month, endDate.day, timezone);
  const key = `${type}:${startDate.year}-${String(startDate.month).padStart(2, '0')}-${String(startDate.day).padStart(2, '0')}`;
  return { type, key, startedAt, endsAt, customPeriodDays: Number(policy.customPeriodDays || 30) };
}

function simplePeriodSummary(policy, now = new Date()) {
  const explicit = policy.periodLimit != null;
  const fallbackType = policy.hardMonthlyLimit != null ? 'month' : 'day';
  const periodType = explicit ? (policy.periodType || 'month') : fallbackType;
  const limit = explicit
    ? Number(policy.periodLimit)
    : Number(periodType === 'day' ? policy.hardDailyLimit : policy.hardMonthlyLimit);
  const window = simplePeriodWindow({ ...policy, periodType }, now);
  const countersCurrent = explicit
    ? policy.counters?.periodKey === window.key
    : true;
  const spent = explicit
    ? (countersCurrent ? Number(policy.counters?.periodSpent || 0) : 0)
    : Number(periodType === 'day' ? policy.counters?.dailySpent || 0 : policy.counters?.monthlySpent || 0);
  const reserved = explicit
    ? (countersCurrent ? Number(policy.counters?.periodReserved || 0) : 0)
    : Number(periodType === 'day' ? policy.counters?.dailyReserved || 0 : policy.counters?.monthlyReserved || 0);
  const finiteLimit = Number.isFinite(limit) ? limit : null;
  return {
    periodType,
    customPeriodDays: window.customPeriodDays,
    limit: finiteLimit,
    spent,
    reserved,
    remaining: finiteLimit == null ? null : Math.max(0, finiteLimit - spent - reserved),
    startedAt: window.startedAt,
    nextResetAt: window.endsAt,
    periodKey: window.key,
    explicitlyConfigured: explicit,
  };
}

async function getOrCreatePolicy({ tenantId, userId, connection }) {
  const candidates = [];
  if (connection.policyId) candidates.push({ _id: connection.policyId, tenantId, enabled: true });
  candidates.push({ tenantId, scopeType: 'connection', scopeId: connection._id, enabled: true });
  candidates.push({ tenantId, scopeType: 'user', scopeId: userId, enabled: true });
  candidates.push({ tenantId, scopeType: 'tenant', scopeId: null, enabled: true });
  for (const filter of candidates) {
    const found = await AIBudgetPolicy.findOne(filter);
    if (found) return found;
  }
  return AIBudgetPolicy.findOneAndUpdate(
    { tenantId, scopeType: 'tenant', scopeId: null },
    {
      $setOnInsert: {
        tenantId, scopeType: 'tenant', scopeId: null, name: 'Budget IA du cabinet',
        currency: process.env.AI_PRICING_CURRENCY === 'USD' ? 'USD' : 'EUR',
        hardDailyLimit: Number(process.env.AI_DEFAULT_DAILY_LIMIT || 5),
        hardMonthlyLimit: Number(process.env.AI_DEFAULT_MONTHLY_LIMIT || 50),
        perTaskLimit: Number(process.env.AI_DEFAULT_PER_TASK_LIMIT || 10),
        createdBy: userId, updatedBy: userId,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

async function resetPeriodCounters(policy, now = new Date()) {
  const keys = periodKeys(now, policy.timezone);
  const dayChanged = policy.counters?.dayKey !== keys.dayKey;
  const monthChanged = policy.counters?.monthKey !== keys.monthKey;
  const hasSimplePeriod = policy.periodLimit != null;
  const simpleWindow = hasSimplePeriod ? simplePeriodWindow(policy, now) : null;
  const simplePeriodChanged = hasSimplePeriod && policy.counters?.periodKey !== simpleWindow.key;
  if (!dayChanged && !monthChanged && !simplePeriodChanged) {
    return { policy, ...keys, periodKey: simpleWindow?.key || null, simpleWindow };
  }
  const set = { 'counters.dayKey': keys.dayKey, 'counters.monthKey': keys.monthKey };
  if (dayChanged) {
    set['counters.dailySpent'] = 0;
    set['counters.dailyReserved'] = 0;
  }
  if (monthChanged) {
    set['counters.monthlySpent'] = 0;
    set['counters.monthlyReserved'] = 0;
  }
  if (simplePeriodChanged) {
    set['counters.periodKey'] = simpleWindow.key;
    set['counters.periodSpent'] = 0;
    set['counters.periodReserved'] = 0;
    set['counters.periodStartedAt'] = simpleWindow.startedAt;
    set['counters.periodEndsAt'] = simpleWindow.endsAt;
  }
  const refreshed = await AIBudgetPolicy.findOneAndUpdate(
    {
      _id: policy._id,
      'counters.dayKey': policy.counters?.dayKey || null,
      'counters.monthKey': policy.counters?.monthKey || null,
      ...(hasSimplePeriod ? { 'counters.periodKey': policy.counters?.periodKey || null } : {}),
    },
    { $set: set },
    { new: true },
  );
  return {
    policy: refreshed || await AIBudgetPolicy.findById(policy._id),
    ...keys,
    periodKey: simpleWindow?.key || null,
    simpleWindow,
  };
}

function reservationFilter(policyId, amount, keys, taskId) {
  const policy = typeof policyId === 'object' ? policyId : { _id: policyId };
  const clauses = [
    { $lte: [amount, { $ifNull: ['$perTaskLimit', Number.MAX_SAFE_INTEGER] }] },
    {
      $lte: [
        { $add: [{ $ifNull: ['$counters.dailySpent', 0] }, { $ifNull: ['$counters.dailyReserved', 0] }, amount] },
        { $ifNull: ['$hardDailyLimit', Number.MAX_SAFE_INTEGER] },
      ],
    },
    {
      $lte: [
        { $add: [{ $ifNull: ['$counters.monthlySpent', 0] }, { $ifNull: ['$counters.monthlyReserved', 0] }, amount] },
        { $ifNull: ['$hardMonthlyLimit', Number.MAX_SAFE_INTEGER] },
      ],
    },
  ];
  if (policy.periodLimit != null) {
    clauses.push({
      $lte: [
        { $add: [{ $ifNull: ['$counters.periodSpent', 0] }, { $ifNull: ['$counters.periodReserved', 0] }, amount] },
        '$periodLimit',
      ],
    });
  }
  return {
    _id: policy._id,
    enabled: true,
    'counters.dayKey': keys.dayKey,
    'counters.monthKey': keys.monthKey,
    'activeReservations.taskId': { $ne: taskId },
    ...(policy.periodLimit != null ? { 'counters.periodKey': keys.periodKey } : {}),
    $expr: { $and: clauses },
  };
}

function projectedBudget(policy, amount) {
  const daily = Number(policy.counters?.dailySpent || 0) + Number(policy.counters?.dailyReserved || 0) + amount;
  const monthly = Number(policy.counters?.monthlySpent || 0) + Number(policy.counters?.monthlyReserved || 0) + amount;
  const softExceeded = (policy.softDailyLimit != null && daily > policy.softDailyLimit)
    || (policy.softMonthlyLimit != null && monthly > policy.softMonthlyLimit);
  const period = Number(policy.counters?.periodSpent || 0) + Number(policy.counters?.periodReserved || 0) + amount;
  const periodExceeded = policy.periodLimit != null && period > Number(policy.periodLimit);
  const hardExceeded = amount > Number(policy.perTaskLimit ?? Number.MAX_SAFE_INTEGER)
    || daily > Number(policy.hardDailyLimit ?? Number.MAX_SAFE_INTEGER)
    || monthly > Number(policy.hardMonthlyLimit ?? Number.MAX_SAFE_INTEGER)
    || periodExceeded;
  return { daily, monthly, period, periodExceeded, softExceeded, hardExceeded };
}

async function budgetPreview({ policy: initialPolicy, amount, now = new Date() }) {
  const { policy } = await resetPeriodCounters(initialPolicy, now);
  return { policy, ...projectedBudget(policy, amount) };
}

async function reserve({ policy: initialPolicy, taskId, tenantId, userId, matterId, connectionId, amount, currency, model, override = false, actorRole = null, now = new Date(), ttlMs = Number(process.env.AI_BUDGET_RESERVATION_TTL_MS || 60 * 60 * 1000) }) {
  const existing = await AIBudgetReservation.findOne({ taskId });
  if (existing && ['active', 'settling', 'settled'].includes(existing.state)) return existing;
  if (!Number.isFinite(amount) || amount < 0) throw new AIError('AI_BUDGET_ESTIMATE_INVALID', 'Estimation budgétaire invalide.', { statusCode: 400 });
  let { policy, dayKey, monthKey, periodKey } = await resetPeriodCounters(initialPolicy, now);
  if (policy.currency !== currency) throw new AIError('AI_BUDGET_CURRENCY_MISMATCH', 'La devise du catalogue ne correspond pas à celle du budget.', { statusCode: 409 });
  if ((policy.forbiddenModels || []).includes(model)) throw new AIError('AI_MODEL_BLOCKED_BY_BUDGET', 'Ce modèle est interdit par la politique budgétaire.', { statusCode: 403 });
  const projection = projectedBudget(policy, amount);
  if (projection.hardExceeded) {
    throw new AIError('AI_BUDGET_LIMIT_REACHED', 'Le plafond IA autorisé est atteint. Aucun appel fournisseur n’a été lancé.', { statusCode: 402 });
  }
  if (projection.softExceeded) {
    const authorized = override && (policy.overrideRoles || []).includes(actorRole);
    if (!authorized) {
      throw new AIError('AI_BUDGET_SOFT_LIMIT_OVERRIDE_REQUIRED', 'La limite souple est dépassée. Une autorisation explicite est nécessaire.', {
        statusCode: 409,
        details: { overrideRoles: policy.overrideRoles || [], projectedDaily: projection.daily, projectedMonthly: projection.monthly },
      });
    }
  }
  const reservationId = existing?._id || new mongoose.Types.ObjectId();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const reservationInc = {
    'counters.dailyReserved': amount,
    'counters.monthlyReserved': amount,
    ...(policy.periodLimit != null ? { 'counters.periodReserved': amount } : {}),
  };
  const activeReservation = {
    reservationId, taskId, amount, dayKey, monthKey,
    ...(policy.periodLimit != null ? { periodKey } : {}),
    expiresAt,
  };
  const updated = await AIBudgetPolicy.findOneAndUpdate(
    reservationFilter(policy, amount, { dayKey, monthKey, periodKey }, taskId),
    {
      $inc: reservationInc,
      $push: { activeReservations: activeReservation },
    },
    { new: true },
  );
  if (!updated) {
    throw new AIError('AI_BUDGET_LIMIT_REACHED', 'Le plafond IA autorisé est atteint. Aucun appel fournisseur n’a été lancé.', {
      statusCode: 402,
      details: {
        perTaskLimit: policy.perTaskLimit,
        hardDailyLimit: policy.hardDailyLimit,
        hardMonthlyLimit: policy.hardMonthlyLimit,
      },
    });
  }
  try {
    return await AIBudgetReservation.findOneAndUpdate(
      { taskId },
      {
        $setOnInsert: {
          _id: reservationId, tenantId, policyId: policy._id, taskId, userId,
          matterId, connectionId, amount, currency, dayKey, monthKey,
          periodKey: policy.periodLimit != null ? periodKey : null,
          expiresAt,
        },
        $set: {
          state: 'active', amount, currency, dayKey, monthKey,
          periodKey: policy.periodLimit != null ? periodKey : null,
          expiresAt, actualAmount: null, settledAt: null, releasedAt: null,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    await AIBudgetPolicy.updateOne(
      { _id: policy._id, 'activeReservations.reservationId': reservationId },
      {
        $inc: {
          'counters.dailyReserved': -amount,
          'counters.monthlyReserved': -amount,
          ...(policy.periodLimit != null ? { 'counters.periodReserved': -amount } : {}),
        },
        $pull: { activeReservations: { reservationId } },
      },
    ).catch(() => {});
    throw err;
  }
}

function settlementCounterUpdate(policy, reservation, actualAmount) {
  const inc = {};
  if (policy.counters?.dayKey === reservation.dayKey) {
    inc['counters.dailyReserved'] = -reservation.amount;
    inc['counters.dailySpent'] = actualAmount;
  }
  if (policy.counters?.monthKey === reservation.monthKey) {
    inc['counters.monthlyReserved'] = -reservation.amount;
    inc['counters.monthlySpent'] = actualAmount;
  }
  if (reservation.periodKey && policy.counters?.periodKey === reservation.periodKey) {
    inc['counters.periodReserved'] = -reservation.amount;
    inc['counters.periodSpent'] = actualAmount;
  }
  return inc;
}

async function settle({ reservationId, actualAmount, usage, pricing, task }) {
  let reservation = await AIBudgetReservation.findOneAndUpdate(
    { _id: reservationId, state: 'active' },
    { $set: { state: 'settling', actualAmount } },
    { new: true },
  );
  if (!reservation) reservation = await AIBudgetReservation.findById(reservationId);
  if (!reservation) throw new AIError('AI_BUDGET_RESERVATION_NOT_FOUND', 'Réservation budgétaire introuvable.', { statusCode: 500 });
  if (reservation.state === 'settled') return reservation;
  if (reservation.state !== 'settling') throw new AIError('AI_BUDGET_RESERVATION_STATE', 'Cette réservation ne peut pas être régularisée.', { statusCode: 409 });
  const policy = await AIBudgetPolicy.findById(reservation.policyId).select('+activeReservations');
  const inc = settlementCounterUpdate(policy, reservation, actualAmount);
  await AIBudgetPolicy.updateOne(
    { _id: policy._id, 'activeReservations.reservationId': reservation._id },
    { ...(Object.keys(inc).length ? { $inc: inc } : {}), $pull: { activeReservations: { reservationId: reservation._id } } },
  );
  await AIUsageLedgerEntry.findOneAndUpdate(
    { taskId: task._id, measurement: 'actual' },
    {
      $setOnInsert: {
        tenantId: task.tenantId, taskId: task._id, reservationId: reservation._id,
        userId: task.userId, matterId: task.matterId, connectionId: task.connectionId,
        provider: task.provider, model: task.model, operation: task.taskType,
        inputTokens: usage.inputTokens || 0, outputTokens: usage.outputTokens || 0,
        cachedInputTokens: usage.cachedInputTokens || 0, currency: task.currency,
        usageDimensions: normalizeUsageDimensions(usage),
        catalogueVersion: pricing.catalogueVersion,
        inputUnitCost: pricing.inputUnitCost, outputUnitCost: pricing.outputUnitCost,
        dimensionUnitCosts: pricing.dimensionUnitCosts || {},
        totalCost: actualAmount, measurement: 'actual', costNature: pricing.costNature || 'calculated',
        providerRequestId: task.providerRequestId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  reservation = await AIBudgetReservation.findOneAndUpdate(
    { _id: reservation._id, state: 'settling' },
    { $set: { state: 'settled', actualAmount, settledAt: new Date() } },
    { new: true },
  );
  return reservation;
}

async function release({ reservationId, state = 'released' }) {
  let reservation = await AIBudgetReservation.findOneAndUpdate(
    { _id: reservationId, state: 'active' },
    { $set: { state: 'releasing' } },
    { new: true },
  );
  if (!reservation) reservation = await AIBudgetReservation.findById(reservationId);
  if (!reservation || ['released', 'expired', 'settled'].includes(reservation.state)) return reservation;
  const policy = await AIBudgetPolicy.findById(reservation.policyId).select('+activeReservations');
  if (policy) {
    const inc = settlementCounterUpdate(policy, reservation, 0);
    await AIBudgetPolicy.updateOne(
      { _id: policy._id, 'activeReservations.reservationId': reservation._id },
      { ...(Object.keys(inc).length ? { $inc: inc } : {}), $pull: { activeReservations: { reservationId: reservation._id } } },
    );
  }
  return AIBudgetReservation.findOneAndUpdate(
    { _id: reservation._id, state: 'releasing' },
    { $set: { state, releasedAt: new Date() } },
    { new: true },
  );
}

async function renew({ reservationId, ttlMs = Number(process.env.AI_BUDGET_RESERVATION_TTL_MS || 60 * 60 * 1000), now = new Date() }) {
  const expiresAt = new Date(now.getTime() + ttlMs);
  const reservation = await AIBudgetReservation.findOneAndUpdate(
    { _id: reservationId, state: 'active' },
    { $set: { expiresAt } },
    { new: true },
  );
  if (!reservation) return null;
  const policyUpdate = await AIBudgetPolicy.updateOne(
    { _id: reservation.policyId, 'activeReservations.reservationId': reservation._id },
    { $set: { 'activeReservations.$.expiresAt': expiresAt } },
  );
  if (!policyUpdate.matchedCount) {
    throw new AIError('AI_BUDGET_RESERVATION_INCONSISTENT', 'La réservation budgétaire doit être réparée avant l’appel fournisseur.', { statusCode: 503 });
  }
  return reservation;
}

async function releaseExpired(now = new Date()) {
  const expired = await AIBudgetReservation.find({ state: 'active', expiresAt: { $lte: now } }).select('_id taskId').lean();
  for (const item of expired) {
    const task = await AITask.findById(item.taskId).select('status retentionUntil').lean();
    if (task && !['cancelled', 'failed', 'succeeded', 'blocked_budget'].includes(task.status)) {
      await renew({ reservationId: item._id, now });
    } else {
      await release({ reservationId: item._id, state: 'expired' });
    }
  }
  return expired.length;
}

function publicBudget(policy) {
  const value = policy?.toObject ? policy.toObject() : { ...policy };
  delete value.activeReservations;
  const summary = simplePeriodSummary(value);
  return {
    ...value,
    summary,
    remaining: summary.remaining,
    spent: summary.spent,
    reserved: summary.reserved,
    nextResetAt: summary.nextResetAt,
  };
}

module.exports = {
  periodKeys,
  simplePeriodWindow,
  simplePeriodSummary,
  getOrCreatePolicy,
  resetPeriodCounters,
  projectedBudget,
  budgetPreview,
  reservationFilter,
  reserve,
  settle,
  release,
  renew,
  releaseExpired,
  publicBudget,
};
