const { requestJson, capabilities } = require('./common');
const { AIError } = require('../errors');

class OpenAIAdapter {
  constructor({ fetchImpl = global.fetch, baseUrl = 'https://api.openai.com/v1', providerName = 'openai' } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.provider = providerName;
  }

  describeCapabilities() {
    return capabilities({ streaming: 'available', structuredOutput: 'available', files: 'limited', images: 'limited' });
  }

  async listModels({ apiKey }) {
    const { payload } = await requestJson(this.fetch, this.provider, `${this.baseUrl}/models`, {
      method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    }, 15000);
    return (payload.data || []).map((entry) => entry.id).filter(Boolean);
  }

  async generate({ apiKey, model, systemInstruction, userContent, maxOutputTokens = 4096, temperature = 0.2 }) {
    const { payload, requestId } = await requestJson(this.fetch, this.provider, `${this.baseUrl}/responses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        instructions: systemInstruction,
        input: userContent,
        max_output_tokens: maxOutputTokens,
        store: false,
      }),
    });
    const text = payload.output_text
      || (payload.output || []).flatMap((item) => item.content || []).filter((item) => item.type === 'output_text').map((item) => item.text).join('')
      || '';
    if (!text.trim()) throw new AIError('AI_PROVIDER_EMPTY_RESPONSE', 'Le fournisseur a renvoyé une réponse vide.', { statusCode: 502, retryable: true });
    return {
      text,
      usage: {
        inputTokens: Number(payload.usage?.input_tokens || 0),
        outputTokens: Number(payload.usage?.output_tokens || 0),
        cachedInputTokens: Number(payload.usage?.input_tokens_details?.cached_tokens || 0),
        reasoningTokens: Number(payload.usage?.output_tokens_details?.reasoning_tokens || 0),
      },
      providerRequestId: payload.id || requestId,
      nativeCitations: [],
    };
  }

  async testConnection({ apiKey, model }) {
    // Vérification de métadonnées uniquement : aucune génération facturable.
    const { payload } = await requestJson(this.fetch, this.provider, `${this.baseUrl}/models/${encodeURIComponent(model)}`, {
      method: 'GET', headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    }, 15000);
    if (!payload.id) {
      throw new AIError('AI_PROVIDER_MODEL_NOT_AVAILABLE', 'Le modèle demandé n’est pas disponible pour cette connexion.', { statusCode: 400, retryable: false });
    }
    return { ok: true, model, capabilities: this.describeCapabilities(), verification: 'model_access', generationTested: false };
  }
}

module.exports = OpenAIAdapter;
