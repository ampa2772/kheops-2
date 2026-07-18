const { requestJson, capabilities } = require('./common');
const { AIError } = require('../errors');

class GeminiAdapter {
  constructor({ fetchImpl = global.fetch, baseUrl = 'https://generativelanguage.googleapis.com/v1beta' } = {}) {
    this.fetch = fetchImpl;
    this.baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.provider = 'gemini';
  }

  describeCapabilities() {
    return capabilities({ streaming: 'available', structuredOutput: 'available', files: 'limited', images: 'available' });
  }

  async listModels({ apiKey }) {
    const { payload } = await requestJson(this.fetch, this.provider, `${this.baseUrl}/models`, {
      method: 'GET', headers: { 'x-goog-api-key': apiKey, Accept: 'application/json' },
    }, 15000);
    return (payload.models || []).map((entry) => String(entry.name || '').replace(/^models\//, '')).filter(Boolean);
  }

  async generate({ apiKey, model, systemInstruction, userContent, maxOutputTokens = 4096, temperature = 0.2 }) {
    const endpoint = `${this.baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
    const { payload, requestId } = await requestJson(this.fetch, this.provider, endpoint, {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: { maxOutputTokens, temperature },
      }),
    });
    const blockedReason = payload.promptFeedback?.blockReason;
    const finishReason = payload.candidates?.[0]?.finishReason;
    if (blockedReason || ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII'].includes(finishReason)) {
      throw new AIError('AI_PROVIDER_CONTENT_BLOCKED', 'Le fournisseur a bloqué la réponse selon sa politique de sécurité.', { statusCode: 422, retryable: false, details: { reason: blockedReason || finishReason } });
    }
    const parts = payload.candidates?.[0]?.content?.parts || [];
    const text = parts.map((part) => part.text || '').join('');
    if (!text.trim()) throw new AIError('AI_PROVIDER_EMPTY_RESPONSE', 'Le fournisseur a renvoyé une réponse vide.', { statusCode: 502, retryable: true });
    return {
      text,
      usage: {
        inputTokens: Number(payload.usageMetadata?.promptTokenCount || 0),
        // Les jetons de raisonnement sont facturables sur les modèles qui les
        // exposent ; on les inclut prudemment dans la sortie budgétaire.
        outputTokens: Number(payload.usageMetadata?.candidatesTokenCount || 0)
          + Number(payload.usageMetadata?.thoughtsTokenCount || 0),
        cachedInputTokens: Number(payload.usageMetadata?.cachedContentTokenCount || 0),
        thoughtsTokens: Number(payload.usageMetadata?.thoughtsTokenCount || 0),
      },
      providerRequestId: payload.responseId || requestId,
      nativeCitations: payload.candidates?.[0]?.citationMetadata?.citationSources || [],
    };
  }

  async testConnection({ apiKey, model }) {
    const result = await this.generate({
      apiKey, model, systemInstruction: 'Test technique de connexion.', userContent: 'Réponds uniquement OK.', maxOutputTokens: 8, temperature: 0,
    });
    return { ok: true, model, capabilities: this.describeCapabilities(), providerRequestId: result.providerRequestId };
  }
}

module.exports = GeminiAdapter;
