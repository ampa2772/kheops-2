const os = require('os');
const { randomUUID } = require('crypto');
const OAuthMailAccount = require('../../models/Mail/OAuthMailAccount');
const MailSyncState = require('../../models/Mail/MailSyncState');
const MailSyncJob = require('../../models/Mail/MailSyncJob');
const ArchivedMailMessage = require('../../models/Mail/ArchivedMailMessage');
const { createMailProvider } = require('./providerFactory');
const {
  markSyncStarted,
  markHealthy,
  markError,
} = require('./oauthAccountService');
const { retryDelayMs } = require('./messageNormalization');

const DEFAULT_LEASE_MS = 2 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_PAGE_SIZE = 100;

function workerId() {
  return String(process.env.MAIL_WORKER_ID || `${os.hostname()}-${process.pid}`).slice(0, 200);
}

function safeError(error) {
  return {
    code: String(error?.code || error?.response?.data?.error?.code || error?.name || 'MAIL_SYNC_FAILED').slice(0, 120),
    message: String(error?.message || 'Échec de la synchronisation de messagerie.').slice(0, 1000),
    at: new Date(),
  };
}

function isRetryable(error) {
  const status = Number(error?.statusCode || error?.response?.status || 0);
  if (error?.retryable === false) return false;
  if (['MAIL_REAUTH_REQUIRED', 'AUTH_REQUIRED', 'AUTH_REFRESH_FAILED'].includes(error?.code)) return false;
  if ([400, 401, 403, 404, 409, 422].includes(status) && !error?.requiresFullSync) return false;
  return true;
}

function syncFolders(account) {
  if (account.provider === 'microsoft') return ['inbox', 'sentitems'];
  return ['mailbox'];
}

async function enqueueSync({
  account,
  accountId,
  tenantId,
  trigger = 'manual',
  forceFull = false,
  idempotencyKey,
}) {
  const resolvedAccountId = account?._id || accountId;
  const resolvedTenantId = account?.tenantId || tenantId;
  if (!resolvedAccountId || !resolvedTenantId) {
    throw Object.assign(new Error('Compte et cabinet requis pour synchroniser.'), {
      statusCode: 400,
      code: 'MAIL_SYNC_SCOPE_REQUIRED',
    });
  }
  const normalizedTrigger = ['manual', 'notification', 'renewal', 'catchup', 'initial'].includes(trigger)
    ? trigger
    : 'manual';
  const bucket = Math.floor(Date.now() / (normalizedTrigger === 'catchup' ? 5 * 60 * 1000 : 60 * 1000));
  const key = String(idempotencyKey || `${normalizedTrigger}:${resolvedAccountId}:${bucket}`).slice(0, 240);
  try {
    const job = await MailSyncJob.create({
      tenantId: resolvedTenantId,
      accountId: resolvedAccountId,
      trigger: normalizedTrigger,
      idempotencyKey: key,
      forceFull: Boolean(forceFull),
    });
    return { job, reused: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await MailSyncJob.findOne({
      tenantId: resolvedTenantId,
      accountId: resolvedAccountId,
      idempotencyKey: key,
    });
    return { job: existing, reused: true };
  }
}

async function claimNextJob({ owner = workerId(), leaseMs = DEFAULT_LEASE_MS, jobId = null } = {}) {
  const now = new Date();
  const query = {
    ...(jobId ? { _id: jobId } : {}),
    status: { $in: ['queued', 'failed'] },
    nextAttemptAt: { $lte: now },
    $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }],
  };
  return MailSyncJob.findOneAndUpdate(
    query,
    {
      $set: {
        status: 'running',
        leaseOwner: owner,
        leaseUntil: new Date(now.getTime() + leaseMs),
      },
      $inc: { attemptCount: 1 },
    },
    { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } },
  );
}

async function ensureState(account, folderKey) {
  return MailSyncState.findOneAndUpdate(
    { tenantId: account.tenantId, accountId: account._id, folderKey },
    {
      $setOnInsert: {
        provider: account.provider,
        cursor: null,
        continuation: null,
        initialSyncComplete: false,
      },
    },
    { upsert: true, new: true, runValidators: true },
  );
}

async function acquireStateLease(account, folderKey, owner, leaseMs) {
  await ensureState(account, folderKey);
  const now = new Date();
  return MailSyncState.findOneAndUpdate(
    {
      tenantId: account.tenantId,
      accountId: account._id,
      folderKey,
      $or: [
        { leaseUntil: null },
        { leaseUntil: { $lt: now } },
      ],
    },
    {
      $set: {
        leaseOwner: owner,
        leaseUntil: new Date(now.getTime() + leaseMs),
      },
    },
    { new: true },
  );
}

async function archiveSyncedMessage(message) {
  const identity = {
    tenantId: message.tenantId,
    accountId: message.accountId,
  };
  let existing = await ArchivedMailMessage.findOne({
    ...identity,
    providerMessageId: message.providerMessageId,
  });
  if (!existing && message.internetMessageId) {
    existing = await ArchivedMailMessage.findOne({
      ...identity,
      internetMessageId: message.internetMessageId,
    });
  }
  if (!existing && message.deduplicationFingerprint) {
    existing = await ArchivedMailMessage.findOne({
      ...identity,
      deduplicationFingerprint: message.deduplicationFingerprint,
    });
  }
  if (!existing) {
    try {
      return { row: await ArchivedMailMessage.create(message), created: true };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      existing = await ArchivedMailMessage.findOne({
        ...identity,
        $or: [
          { providerMessageId: message.providerMessageId },
          ...(message.internetMessageId ? [{ internetMessageId: message.internetMessageId }] : []),
          { deduplicationFingerprint: message.deduplicationFingerprint },
        ],
      });
      if (!existing) throw error;
    }
  }
  const preserved = {
    sourceSendOperationId: existing.sourceSendOperationId || message.sourceSendOperationId || null,
  };
  Object.assign(existing, message, preserved);
  await existing.save();
  return { row: existing, created: false };
}

async function applySyncPage(page) {
  let upserted = 0;
  let deleted = 0;
  for (const message of page.messages || []) {
    await archiveSyncedMessage(message);
    upserted += 1;
  }
  const deletedIds = [...new Set((page.deletedProviderIds || []).filter(Boolean).map(String))];
  if (deletedIds.length) {
    const result = await ArchivedMailMessage.updateMany(
      { accountId: page.accountId, providerMessageId: { $in: deletedIds }, isDeleted: false },
      { $set: { isDeleted: true, lastSyncedAt: new Date() } },
    );
    deleted = Number(result.modifiedCount || 0);
  }
  return { upserted, deleted };
}

async function syncFolder({ account, provider, folderKey, forceFull, owner, leaseMs, maxPages, pageSize }) {
  const state = await acquireStateLease(account, folderKey, owner, leaseMs);
  if (!state) {
    const error = new Error('Une synchronisation de cette boîte est déjà en cours.');
    error.code = 'MAIL_SYNC_LEASE_BUSY';
    error.retryable = true;
    throw error;
  }
  if (forceFull) {
    state.cursor = null;
    state.continuation = null;
    state.initialSyncComplete = false;
  }
  let totals = { upserted: 0, deleted: 0, pages: 0 };
  try {
    for (let index = 0; index < maxPages; index += 1) {
      const initial = !state.initialSyncComplete;
      let fullSyncPage = initial;
      let page;
      try {
        page = initial
          ? await provider.initialSync({
            account,
            continuation: state.continuation,
            folderKey,
            pageSize,
          })
          : await provider.incrementalSync({
            account,
            cursor: state.cursor,
            continuation: state.continuation,
            folderKey,
            pageSize,
          });
      } catch (error) {
        if (!error?.requiresFullSync) throw error;
        state.cursor = null;
        state.continuation = null;
        state.initialSyncComplete = false;
        await state.save();
        fullSyncPage = true;
        page = await provider.initialSync({ account, continuation: null, folderKey, pageSize });
      }
      page.accountId = account._id;
      const applied = await applySyncPage(page);
      totals = {
        upserted: totals.upserted + applied.upserted,
        deleted: totals.deleted + applied.deleted,
        pages: totals.pages + 1,
      };
      state.continuation = page.continuation || null;
      if (page.cursor) state.cursor = page.cursor;
      state.lastProcessedAt = new Date();
      state.failureCount = 0;
      state.lastErrorCode = null;
      state.leaseUntil = new Date(Date.now() + leaseMs);
      if (!state.continuation) {
        if (fullSyncPage) {
          state.initialSyncComplete = true;
          state.lastFullSyncAt = new Date();
        } else {
          state.lastIncrementalSyncAt = new Date();
        }
      }
      await state.save();
      if (!state.continuation) break;
    }
    return { ...totals, needsContinuation: Boolean(state.continuation) };
  } catch (error) {
    state.failureCount = Number(state.failureCount || 0) + 1;
    state.lastErrorCode = safeError(error).code;
    await state.save();
    throw error;
  } finally {
    await MailSyncState.updateOne(
      { _id: state._id, leaseOwner: owner },
      { $set: { leaseOwner: null, leaseUntil: null } },
    );
  }
}

async function syncAccount({
  account,
  forceFull = false,
  owner = workerId(),
  leaseMs = DEFAULT_LEASE_MS,
  maxPages = DEFAULT_MAX_PAGES,
  pageSize = DEFAULT_PAGE_SIZE,
}) {
  const provider = await createMailProvider(account);
  await markSyncStarted(account);
  const totals = { upserted: 0, deleted: 0, pages: 0, needsContinuation: false };
  try {
    const folders = provider.listSyncFolders
      ? await provider.listSyncFolders()
      : syncFolders(account);
    for (const folderKey of folders) {
      const result = await syncFolder({
        account,
        provider,
        folderKey,
        forceFull,
        owner,
        leaseMs,
        maxPages,
        pageSize,
      });
      totals.upserted += result.upserted;
      totals.deleted += result.deleted;
      totals.pages += result.pages;
      totals.needsContinuation ||= result.needsContinuation;
    }
    await markHealthy(account);
    return totals;
  } catch (error) {
    if (error?.code !== 'MAIL_SYNC_LEASE_BUSY') await markError(account, error);
    throw error;
  }
}

async function completeJob(job, result) {
  job.status = 'succeeded';
  job.leaseOwner = null;
  job.leaseUntil = null;
  job.result = {
    upserted: result.upserted,
    deleted: result.deleted,
    pages: result.pages,
    completedAt: new Date(),
  };
  job.lastError = { code: null, message: null, at: null };
  await job.save();
  return job;
}

async function failJob(job, error, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  const retryable = isRetryable(error) && Number(job.attemptCount || 0) < maxAttempts;
  job.status = retryable ? 'failed' : 'dead';
  job.leaseOwner = null;
  job.leaseUntil = null;
  job.nextAttemptAt = retryable
    ? new Date(Date.now() + retryDelayMs(job.attemptCount))
    : new Date();
  job.lastError = safeError(error);
  await job.save();
  return job;
}

async function runClaimedJob(job, options = {}) {
  const account = await OAuthMailAccount.findOne({
    _id: job.accountId,
    tenantId: job.tenantId,
    status: { $nin: ['disabled', 'disconnected'] },
  }).select('+encryptedRefreshToken +legacyTokenField');
  if (!account) {
    const error = Object.assign(new Error('Compte de messagerie indisponible.'), {
      code: 'MAIL_ACCOUNT_UNAVAILABLE',
      retryable: false,
    });
    await failJob(job, error, options.maxAttempts);
    throw error;
  }
  try {
    const result = await syncAccount({
      account,
      forceFull: job.forceFull,
      owner: job.leaseOwner || options.owner,
      leaseMs: options.leaseMs,
      maxPages: options.maxPages,
      pageSize: options.pageSize,
    });
    await completeJob(job, result);
    if (result.needsContinuation) {
      await enqueueSync({
        account,
        trigger: 'catchup',
        idempotencyKey: `continuation:${account._id}:${Date.now()}:${job._id}`,
      });
    }
    return { job, result };
  } catch (error) {
    await failJob(job, error, options.maxAttempts);
    throw error;
  }
}

async function runNextJob(options = {}) {
  const owner = options.owner || `${workerId()}-${randomUUID()}`;
  const job = await claimNextJob({ ...options, owner });
  if (!job) return null;
  return runClaimedJob(job, { ...options, owner });
}

async function resetExpiredLeases(now = new Date()) {
  const [jobs, states] = await Promise.all([
    MailSyncJob.updateMany(
      { status: 'running', leaseUntil: { $lt: now } },
      {
        $set: {
          status: 'failed',
          leaseOwner: null,
          leaseUntil: null,
          nextAttemptAt: now,
          lastError: {
            code: 'MAIL_SYNC_LEASE_EXPIRED',
            message: 'Le worker précédent a été interrompu ; la synchronisation va reprendre.',
            at: now,
          },
        },
      },
    ),
    MailSyncState.updateMany(
      { leaseUntil: { $lt: now } },
      { $set: { leaseOwner: null, leaseUntil: null } },
    ),
  ]);
  return { jobs: jobs.modifiedCount || 0, states: states.modifiedCount || 0 };
}

async function enqueueCatchups({ olderThanMs = 5 * 60 * 1000 } = {}) {
  const cutoff = new Date(Date.now() - olderThanMs);
  const accounts = await OAuthMailAccount.find({
    status: { $in: ['active', 'error'] },
    $or: [{ lastSuccessfulSyncAt: null }, { lastSuccessfulSyncAt: { $lt: cutoff } }],
  }).select('_id tenantId lastSuccessfulSyncAt');
  const results = [];
  for (const account of accounts) {
    results.push(await enqueueSync({
      account,
      trigger: account.lastSuccessfulSyncAt ? 'catchup' : 'initial',
    }));
  }
  return results;
}

module.exports = {
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_PAGES,
  DEFAULT_PAGE_SIZE,
  safeError,
  isRetryable,
  syncFolders,
  enqueueSync,
  claimNextJob,
  archiveSyncedMessage,
  applySyncPage,
  syncFolder,
  syncAccount,
  completeJob,
  failJob,
  runClaimedJob,
  runNextJob,
  resetExpiredLeases,
  enqueueCatchups,
};
