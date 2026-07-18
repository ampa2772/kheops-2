'use strict';

const REDACTED = '[REDACTED]';

/**
 * Retire les secrets des messages avant qu'ils ne soient affiches ou ecrits
 * dans un journal. La fonction accepte volontairement n'importe quelle valeur
 * afin que les chemins d'erreur puissent l'utiliser sans risque.
 */
function redactSecrets(value) {
    let message;
    try {
        message = typeof value === 'string' ? value : String(value ?? '');
    } catch (_error) {
        return '[UNPRINTABLE]';
    }

    return message
        // Parametres d'URL OAuth et jetons transmis dans le fragment.
        .replace(
            /([?&#](?:access_token|refresh_token|id_token|token|authorization_code|code|state|client_secret|api_key)=)([^&#\s]*)/gi,
            `$1${REDACTED}`
        )
        // Arguments de ligne de commande et paires cle=valeur hors URL.
        .replace(
            /(\b(?:access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|client[_-]?secret|api[_-]?key)\b\s*[:=]\s*)(["']?)([^\s,"';&]+)/gi,
            `$1$2${REDACTED}`
        )
        // En-tetes Authorization et autres occurrences "Bearer <jeton>".
        .replace(
            /(\bauthorization\b\s*[:=]\s*(?:bearer\s+)?)([^\s,;]+)/gi,
            `$1${REDACTED}`
        )
        .replace(/(\bbearer\s+)([A-Za-z0-9._~+/=-]+)/gi, `$1${REDACTED}`)
        // Filet de securite pour un JWT brut qui ne serait pas precede d'une cle.
        .replace(
            /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
            '[JWT_REDACTED]'
        );
}

module.exports = { redactSecrets, REDACTED };
