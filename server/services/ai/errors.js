class AIError extends Error {
  constructor(code, message, { statusCode = 500, retryable = false, details = null } = {}) {
    super(message);
    this.name = 'AIError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.details = details;
  }
}

function publicAIError(err) {
  const known = err instanceof AIError;
  return {
    statusCode: known ? err.statusCode : 500,
    body: {
      error: known ? err.code : 'AI_INTERNAL_ERROR',
      message: known ? err.message : "Le service d'intelligence artificielle a rencontré une erreur.",
      retryable: known ? err.retryable : false,
      ...(known && err.details ? { details: err.details } : {}),
    },
  };
}

module.exports = { AIError, publicAIError };
