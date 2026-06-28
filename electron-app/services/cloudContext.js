// electron-app/services/cloudContext.js
//
// Helper source-agnostique pour determiner le service cloud actif
// (Google Drive ou OneDrive) selon l'authentification courante.
//
// Utilise par tous les services qui doivent uploader/telecharger/manipuler
// des fichiers cloud (docGenerator, fileUtils, socketHandlers, docUtils,
// invoiceGenerator, localFileWatcher).

const googleDriveService = require("./googleDriveService");
const oneDriveService = require("./oneDriveService");
const authService = require("./authService");
const microsoftAuthService = require("./microsoftAuthService");

/**
 * Renvoie le service cloud actif selon l'authentification courante :
 *   - Si un client Google Auth est disponible -> Google Drive
 *   - Sinon, si Microsoft (server flow) est initialise -> OneDrive
 *   - Sinon -> null (pas de cloud)
 *
 * S'occupe aussi de (re-)initialiser le service avec le bon authClient/tokenProvider
 * (idempotent grace aux caches internes des services).
 *
 * @returns {{ service: object, source: 'google'|'microsoft' } | null}
 */
function getCloudCtx() {
    const googleClient = authService.getGoogleAuthClient();
    if (googleClient) {
        googleDriveService.init(googleClient);
        return { service: googleDriveService, source: 'google' };
    }
    if (microsoftAuthService.isServerInitialized()) {
        oneDriveService.init(() => microsoftAuthService.getServerAccessToken());
        return { service: oneDriveService, source: 'microsoft' };
    }
    return null;
}

/**
 * Variante stricte : throw si aucune authentification cloud n'est disponible.
 * A utiliser dans les flows ou la presence du cloud est indispensable
 * (creation de document, suppression, duplication, etc.).
 *
 * @returns {{ service: object, source: 'google'|'microsoft' }}
 * @throws {Error} si aucune authentification cloud n'est disponible
 */
function requireCloudCtx() {
    const ctx = getCloudCtx();
    if (!ctx) {
        throw new Error("Authentification cloud requise (Google ou Microsoft).");
    }
    return ctx;
}

module.exports = {
    getCloudCtx,
    requireCloudCtx,
};
