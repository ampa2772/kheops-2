const { requestJson, capabilities } = require('./common');
const { AIError } = require('../errors');

class AnthropicAdapter {
  constructor({ fetchImpl = global.fetch, baseUrl = 'https://api.anthropic.com/v1' } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.provider = 'anthropic';
  }

  describeCapabilities() {
    return capabilities({ streaming: 'available', structuredOutput: 'limited', files: 'limited', images: 'available' });
  }

  async listModels({ apiKey }) {
    const { payload } = await requestJson(this.fetch, this.provider, `${this.baseUrl}/models`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', Accept: 'application/json' },
    }, 15000);
    return (payload.data || []).map((entry) => entry.id).filter(Boolean);
  }

  async generate({ apiKey, model, systemInstruction, userContent, maxOutputTokens = 4096, temperature = 0.2 }) {
    const { payload, requestId } = await requestJson(this.fetch, this.provider, `${this.baseUrl}/messages`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system: systemInstruction,
        messages: [{ role: 'user', content: userContent }],
        max_tokens: maxOutputTokens,
        temperature,
      }),
    });
    const text = (payload.content || []).filter((entry) => entry.type === 'text').map((entry) => entry.text).join('');
    if (!text.trim()) throw new AIError('AI_PROVIDER_EMPTY_RESPONSE', 'Le fournisseur a renvoyé une réponse vide.', { statusCode: 502, retryable: true });
    return {
      text,
      usage: {
        inputTokens: Number(payload.usage?.input_tokens || 0),
        outputTokens: Number(payload.usage?.output_tokens || 0),
        cachedInputTokens: Number(payload.usage?.cache_read_input_tokens || 0),
        cacheWriteTokens: Number(payload.usage?.cache_creation_input_tokens || 0),
      },
      providerRequestId: payload.id || requestId,
      nativeCitations: [],
    };
  }

  async testConnection({ apiKey, model }) {
    const result = await this.generate({
      apiKey, model, systemInstruction: 'Test technique de connexion.', userContent: 'Réponds uniquement OK.', maxOutputTokens: 8, temperature: 0,
    });
    return { ok: true, model, capabilities: this.describeCapabilities(), providerRequestId: result.providerRequestId };
  }
}

module.exports = AnthropicAdapter;
