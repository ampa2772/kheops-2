import apiClient from '../apiClient';
import {
  createAITask,
  getAITaskResult,
  isAITaskTerminal,
  normalizeAITaskStatus,
  pollAITask,
  preflightAITask,
} from '../aiClient';

jest.mock('../apiClient', () => ({ get: jest.fn(), post: jest.fn() }));

describe('aiClient', () => {
  beforeEach(() => jest.clearAllMocks());

  test('normalise les statuts backend snake_case et détecte les terminaux', () => {
    expect(normalizeAITaskStatus('budget_reserved')).toBe('reserved');
    expect(normalizeAITaskStatus('retry_wait')).toBe('retry-wait');
    expect(normalizeAITaskStatus('succeeded')).toBe('completed');
    expect(isAITaskTerminal('succeeded')).toBe(true);
    expect(isAITaskTerminal('blocked_budget')).toBe(true);
    expect(isAITaskTerminal('running')).toBe(false);
  });

  test('utilise les routes de préflight et de création séparées', async () => {
    apiClient.post.mockResolvedValue({ data: { data: { ok: true } } });
    await preflightAITask('matter 1', { taskType: 'summary' });
    await createAITask('matter 1', { taskType: 'summary' });
    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/matters/matter%201/ai/preflight', { taskType: 'summary' }, { signal: undefined });
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/api/matters/matter%201/ai/tasks', { taskType: 'summary' }, {
      signal: undefined,
      headers: { 'Idempotency-Key': expect.stringMatching(/^ai-|^[0-9a-f-]{20,}$/i) },
    });
  });

  test('le polling s’arrête sur succeeded et publie le dernier état', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: { status: 'running' } })
      .mockResolvedValueOnce({ data: { status: 'succeeded', result: { text: 'Terminé' } } });
    const events = [];
    const result = await pollAITask('task-1', { intervalMs: 0, maxIntervalMs: 0, onEvent: (event) => events.push(event) });
    expect(result.result.text).toBe('Terminé');
    expect(apiClient.get).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(2);
  });

  test('le polling authentifié restitue les deltas durables avant l’état final', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: { status: 'running', eventSequence: 2 } })
      .mockResolvedValueOnce({ data: {
        events: [
          { sequence: 1, type: 'delta', payload: { text: 'Bonjour ' } },
          { sequence: 2, type: 'citation', payload: { citation: { documentId: 'doc-1', page: 3 } } },
        ],
        nextAfter: 2,
      } })
      .mockResolvedValueOnce({ data: { status: 'succeeded', eventSequence: 2 } });

    const events = [];
    await pollAITask('task-1', { intervalMs: 0, maxIntervalMs: 0, onEvent: (event) => events.push(event) });

    expect(apiClient.get).toHaveBeenNthCalledWith(2, '/api/ai/tasks/task-1/events', {
      signal: undefined,
      params: { after: 0, limit: 200 },
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'delta', text: 'Bonjour ', sequence: 1 }),
      expect.objectContaining({ type: 'citation', citation: { documentId: 'doc-1', page: 3 }, sequence: 2 }),
    ]));
  });

  test('charge séparément le résultat complet et ses sources', async () => {
    apiClient.get.mockResolvedValue({ data: { text: 'Texte complet', sourceAnchors: [{ documentId: 'doc-1', page: 4 }] } });
    await expect(getAITaskResult('task-1')).resolves.toEqual({ text: 'Texte complet', sourceAnchors: [{ documentId: 'doc-1', page: 4 }] });
    expect(apiClient.get).toHaveBeenCalledWith('/api/ai/tasks/task-1/result', { signal: undefined });
  });
});
