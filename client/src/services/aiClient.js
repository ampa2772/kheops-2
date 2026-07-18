import apiClient from './apiClient';

export const AI_TERMINAL_STATES = Object.freeze([
  'completed',
  'completed-partially',
  'partially-completed',
  'cancelled',
  'failed',
  'blocked-budget',
  'blocked-security',
  'awaiting-human-validation',
]);

const TERMINAL = new Set(AI_TERMINAL_STATES);

export function normalizeAITaskStatus(status) {
  const normalized = String(status || '').trim().toLowerCase().replace(/_/g, '-');
  const aliases = {
    succeeded: 'completed',
    success: 'completed',
    'budget-reserved': 'reserved',
    'blocked-by-budget': 'blocked-budget',
    'blocked-by-security': 'blocked-security',
    'awaiting-validation': 'awaiting-human-validation',
    'human-validation-required': 'awaiting-human-validation',
    'partial-success': 'partially-completed',
  };
  return aliases[normalized] || normalized;
}

function dataOf(response) {
  const data = response?.data ?? response;
  return data?.data ?? data;
}

function taskOf(response) {
  const data = dataOf(response);
  return data?.task ? { ...data.task, reused: Boolean(data.reused) } : data;
}

export function isAITaskTerminal(status) {
  return TERMINAL.has(normalizeAITaskStatus(status));
}

export function getAIErrorMessage(error, fallback = 'La tâche IA n’a pas pu être exécutée.') {
  const code = error?.response?.data?.error || error?.response?.data?.code || error?.code;
  const explicit = error?.response?.data?.message;
  if (explicit) return explicit;
  const messages = {
    AI_KEY_INVALID: 'La clé de connexion est invalide ou a été révoquée.',
    AI_BILLING_REQUIRED: 'Le compte du fournisseur ne permet pas la facturation API.',
    AI_MODEL_UNAVAILABLE: 'Le modèle choisi est momentanément indisponible.',
    AI_RATE_LIMITED: 'Le fournisseur reçoit trop de demandes. Réessayez dans un instant.',
    AI_CONTEXT_TOO_LARGE: 'Le périmètre choisi est trop volumineux. Réduisez les sources.',
    AI_DOCUMENT_UNREADABLE: 'Un document sélectionné ne peut pas être lu en toute sécurité.',
    AI_BUDGET_EXCEEDED: 'Le budget IA restant ne permet pas de lancer cette tâche.',
    AI_FORBIDDEN: 'Vous n’avez pas l’autorisation d’utiliser cette connexion ou ces sources.',
    AI_TIMEOUT: 'La tâche a dépassé le délai autorisé.',
    ERR_CANCELED: 'La tâche a été annulée.',
  };
  return messages[code] || error?.message || fallback;
}

export async function listAIProviders() {
  return dataOf(await apiClient.get('/api/ai/providers'));
}

export async function listAIConnections() {
  return dataOf(await apiClient.get('/api/ai/connections'));
}

export async function listAIBudgets(params = {}) {
  return dataOf(await apiClient.get('/api/ai/budgets', { params }));
}

export async function preflightAITask(matterId, payload, options = {}) {
  if (!matterId) throw new Error('Un dossier est nécessaire pour contrôler la tâche IA.');
  const data = dataOf(await apiClient.post(`/api/matters/${encodeURIComponent(matterId)}/ai/preflight`, payload, { signal: options.signal }));
  return data?.public || data;
}

export async function createAITask(matterId, payload, options = {}) {
  if (!matterId) throw new Error('Un dossier est nécessaire pour créer une tâche IA.');
  const idempotencyKey = options.idempotencyKey
    || payload?.idempotencyKey
    || (window.crypto?.randomUUID?.() ?? `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return taskOf(await apiClient.post(`/api/matters/${encodeURIComponent(matterId)}/ai/tasks`, payload, {
    signal: options.signal,
    headers: { 'Idempotency-Key': idempotencyKey },
  }));
}

export async function getAITask(taskId, options = {}) {
  return taskOf(await apiClient.get(`/api/ai/tasks/${encodeURIComponent(taskId)}`, { signal: options.signal }));
}

export async function getAITaskEvents(taskId, { after = 0, limit = 200, signal } = {}) {
  return dataOf(await apiClient.get(`/api/ai/tasks/${encodeURIComponent(taskId)}/events`, {
    signal,
    params: { after, limit },
  }));
}

export async function getAITaskResult(taskId, options = {}) {
  return dataOf(await apiClient.get(`/api/ai/tasks/${encodeURIComponent(taskId)}/result`, { signal: options.signal }));
}

export async function cancelAITask(taskId, options = {}) {
  return dataOf(await apiClient.post(`/api/ai/tasks/${encodeURIComponent(taskId)}/cancel`, {}, { signal: options.signal }));
}

export async function createDocumentFromAITask(taskId, payload, options = {}) {
  return dataOf(await apiClient.post(`/api/ai/tasks/${encodeURIComponent(taskId)}/create-document`, {
    status: 'ai-draft-pending-validation',
    ...payload,
  }, { signal: options.signal }));
}

export async function applyAIProposal(documentId, payload, options = {}) {
  return dataOf(await apiClient.post(`/api/documents/${encodeURIComponent(documentId)}/ai/apply-proposal`, payload, { signal: options.signal }));
}

export async function validateAIDraft(documentId, payload = {}, options = {}) {
  return dataOf(await apiClient.post(`/api/documents/${encodeURIComponent(documentId)}/ai/validate`, {
    decision: 'approved-by-human',
    ...payload,
  }, { signal: options.signal }));
}

function abortableDelay(duration, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      return;
    }
    const timer = setTimeout(resolve, duration);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    }, { once: true });
  });
}

export async function pollAITask(taskId, {
  signal,
  onEvent,
  intervalMs = 900,
  maxIntervalMs = 3500,
} = {}) {
  let interval = intervalMs;
  let after = 0;
  let eventsAvailable = true;
  while (!signal?.aborted) {
    const task = await getAITask(taskId, { signal });

    // Les workers publient des deltas, citations et avertissements dans une
    // file d'événements durable. On les relit avec l'authentification Axios :
    // cela fonctionne même lorsque EventSource ne peut pas porter le JWT.
    // Si une ancienne version du serveur n'expose pas cette route, le suivi
    // d'état historique continue sans faire échouer la tâche.
    const targetSequence = Math.max(0, Number(task?.eventSequence || 0));
    while (eventsAvailable && after < targetSequence && !signal?.aborted) {
      try {
        const page = await getAITaskEvents(taskId, { after, limit: 200, signal });
        const events = Array.isArray(page?.events) ? page.events : [];
        for (const event of events) {
          const sequence = Math.max(0, Number(event?.sequence || 0));
          onEvent?.({
            type: event?.type || 'message',
            ...(event?.payload && typeof event.payload === 'object' ? event.payload : {}),
            sequence,
          });
          after = Math.max(after, sequence);
        }
        after = Math.max(after, Number(page?.nextAfter || after));
        if (events.length === 0 || events.length < 200) break;
      } catch (eventError) {
        if (signal?.aborted || eventError?.name === 'AbortError' || eventError?.code === 'ERR_CANCELED') throw eventError;
        eventsAvailable = false;
      }
    }

    onEvent?.({ type: 'task', task });
    if (isAITaskTerminal(task?.status || task?.state)) return task;
    await abortableDelay(interval, signal);
    interval = Math.min(maxIntervalMs, Math.round(interval * 1.25));
  }
  throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

function resolveEventsUrl(task) {
  const candidate = task?.eventsUrl || task?.streamUrl || task?.links?.events;
  if (!candidate) return '';
  try {
    return new URL(candidate, window.location.origin).toString();
  } catch (_error) {
    return '';
  }
}

/**
 * Observe une tâche via SSE lorsque le serveur remet une URL éphémère, puis
 * retombe automatiquement sur le polling authentifié Axios si le flux n'est
 * pas disponible. Aucune clé fournisseur n'est jamais transmise ici.
 */
export function observeAITask(taskOrId, options = {}) {
  const taskId = typeof taskOrId === 'string'
    ? taskOrId
    : taskOrId?.taskId || taskOrId?.id || taskOrId?._id;
  if (!taskId) return Promise.reject(new Error('Identifiant de tâche IA absent.'));

  const eventsUrl = typeof taskOrId === 'object' ? resolveEventsUrl(taskOrId) : '';
  if (!eventsUrl || typeof EventSource !== 'function') return pollAITask(taskId, options);

  return new Promise((resolve, reject) => {
    let settled = false;
    let fallbackStarted = false;
    const source = new EventSource(eventsUrl, { withCredentials: true });

    const close = () => {
      source.close();
      options.signal?.removeEventListener('abort', onAbort);
    };
    const finish = (task) => {
      if (settled) return;
      settled = true;
      close();
      resolve(task);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      close();
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    };
    const parse = (event, fallbackType) => {
      try {
        const payload = JSON.parse(event.data);
        return payload?.type ? payload : { type: fallbackType, ...payload };
      } catch (_error) {
        return { type: fallbackType, delta: event.data };
      }
    };
    const deliver = (event, type = 'message') => {
      const payload = parse(event, type);
      options.onEvent?.(payload);
      const task = payload.task || payload.data || payload;
      if (isAITaskTerminal(task?.status || task?.state)) finish(task);
    };

    source.onmessage = (event) => deliver(event);
    ['task', 'status', 'delta', 'citation', 'usage', 'artifact', 'warning', 'done', 'completed', 'failed', 'error', 'cancelled'].forEach((type) => {
      source.addEventListener(type, (event) => deliver(event, type));
    });
    source.onerror = async () => {
      if (settled || fallbackStarted) return;
      fallbackStarted = true;
      close();
      try {
        const task = await pollAITask(taskId, options);
        finish(task);
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      }
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const aiClient = {
  listProviders: listAIProviders,
  listConnections: listAIConnections,
  listBudgets: listAIBudgets,
  preflight: preflightAITask,
  createTask: createAITask,
  getTask: getAITask,
  getTaskResult: getAITaskResult,
  observeTask: observeAITask,
  cancelTask: cancelAITask,
  createDocument: createDocumentFromAITask,
  applyProposal: applyAIProposal,
  validateDraft: validateAIDraft,
};

export default aiClient;
