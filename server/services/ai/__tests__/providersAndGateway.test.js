const OpenAIAdapter = require('../providers/openai');
const AnthropicAdapter = require('../providers/anthropic');
const GeminiAdapter = require('../providers/gemini');
const { validateCompatibleBaseUrl } = require('../gateway');

function response(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    json: async () => payload,
  };
}

describe('native fetch provider adapters', () => {
  test('normalizes OpenAI Responses output and usage', async () => {
    const fetchImpl = jest.fn(async (_url, options) => response({ id: 'resp-1', output_text: 'Bonjour [S1]', usage: { input_tokens: 12, output_tokens: 4, input_tokens_details: { cached_tokens: 2 } } }));
    const result = await new OpenAIAdapter({ fetchImpl }).generate({ apiKey: 'secret-openai', model: 'model-a', systemInstruction: 'system', userContent: 'question' });
    expect(result).toMatchObject({ text: 'Bonjour [S1]', usage: { inputTokens: 12, outputTokens: 4, cachedInputTokens: 2 } });
    const request = fetchImpl.mock.calls[0][1];
    expect(request.headers.Authorization).toBe('Bearer secret-openai');
    expect(request.body).not.toContain('secret-openai');
    expect(JSON.parse(request.body).store).toBe(false);
  });

  test('normalizes Anthropic and Gemini outputs', async () => {
    const anthropicFetch = jest.fn(async () => response({ id: 'msg-1', content: [{ type: 'text', text: 'Claude' }], usage: { input_tokens: 3, output_tokens: 2 } }));
    await expect(new AnthropicAdapter({ fetchImpl: anthropicFetch }).generate({ apiKey: 'a-secret', model: 'claude', systemInstruction: 's', userContent: 'u' }))
      .resolves.toMatchObject({ text: 'Claude', usage: { inputTokens: 3, outputTokens: 2 } });
    const geminiFetch = jest.fn(async () => response({ candidates: [{ content: { parts: [{ text: 'Gemini' }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 6, thoughtsTokenCount: 2 } }));
    await expect(new GeminiAdapter({ fetchImpl: geminiFetch }).generate({ apiKey: 'g-secret', model: 'gemini', systemInstruction: 's', userContent: 'u' }))
      .resolves.toMatchObject({ text: 'Gemini', usage: { inputTokens: 5, outputTokens: 8, thoughtsTokens: 2 } });
  });

  test('maps invalid credentials to a non-retryable public error', async () => {
    const fetchImpl = jest.fn(async () => response({ error: { type: 'authentication_error' } }, 401));
    await expect(new AnthropicAdapter({ fetchImpl }).generate({ apiKey: 'bad-key', model: 'x', systemInstruction: 's', userContent: 'u' }))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_KEY_INVALID', retryable: false, statusCode: 400 });
  });

  test('OpenAI-compatible URL allowlist still blocks private DNS targets', async () => {
    await expect(validateCompatibleBaseUrl('https://allowed.example/v1', {
      env: { AI_COMPATIBLE_BASE_URL_ALLOWLIST: 'allowed.example' },
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    })).rejects.toMatchObject({ code: 'AI_PROVIDER_BASE_URL_PRIVATE' });
  });

  test('rejects empty and safety-blocked provider responses', async () => {
    await expect(new OpenAIAdapter({ fetchImpl: jest.fn(async () => response({ output_text: '', usage: {} })) }).generate({ apiKey: 'x', model: 'm', systemInstruction: 's', userContent: 'u' }))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_EMPTY_RESPONSE' });
    await expect(new GeminiAdapter({ fetchImpl: jest.fn(async () => response({ promptFeedback: { blockReason: 'SAFETY' }, candidates: [] })) }).generate({ apiKey: 'x', model: 'm', systemInstruction: 's', userContent: 'u' }))
      .rejects.toMatchObject({ code: 'AI_PROVIDER_CONTENT_BLOCKED', retryable: false });
  });
});
