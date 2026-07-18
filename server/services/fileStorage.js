// server/services/fileStorage.js
//
// Couche de stockage de fichiers AGNOSTIQUE (Phase 4 — hebergement web).
//
// Deux adaptateurs derriere une meme interface, choisis par variables d'env :
//   - LocalDiskStorage : disque local (DEFAUT). Comportement historique,
//     utilise par l'app Electron / le dev. Aucun changement par defaut.
//   - GcsStorage : Google Cloud Storage (europe-west1). Active UNIQUEMENT si
//     GCS_BUCKET est defini. @google-cloud/storage est charge en LAZY REQUIRE
//     (seulement a l'instanciation de l'adaptateur GCS) : le chemin local par
//     defaut ne depend donc jamais de ce package et ne plante pas s'il est
//     absent.
//
// Principe : la base ne stocke que la CLE (key) du fichier ; les octets vivent
// dans le stockage. getSignedUrl() fournit un acces temporaire en mode cloud.
//
// Interface commune :
//   save(key, buffer, { contentType }) -> Promise<{ key }>
//   read(key)                          -> Promise<Buffer>
//   exists(key)                        -> Promise<boolean>
//   delete(key)                        -> Promise<void>
//   getSignedUrl(key, { expiresInSec, action }) -> Promise<string>
//   checkReadiness()                   -> Promise<{ metadata, signing }>
//   kind : 'local' | 'gcs'

const path = require('path');
const fs = require('fs');
const os = require('os');
const fsp = fs.promises;

// Cle reservee au controle de signature. Aucun objet n'est cree a cet endroit :
// GCS peut signer une URL pour une cle inexistante, ce qui permet de verifier
// les droits de signature sans lire, ecrire ou lister un document utilisateur.
const GCS_READINESS_PROBE_KEY = '__kheops_readiness__/signed-url-probe';

// Empeche le path traversal : pas de '..', pas de chemin absolu. Normalise les
// backslashes Windows en '/'.
function sanitizeKey(key) {
    const norm = String(key == null ? '' : key).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!norm) throw new Error('Cle de fichier vide.');
    if (norm.split('/').some((seg) => seg === '..')) {
        throw new Error(`Cle de fichier invalide (path traversal): ${key}`);
    }
    return norm;
}

class LocalDiskStorage {
    constructor({ root }) {
        this.kind = 'local';
        this.root = root;
    }
    _full(key) {
        return path.join(this.root, sanitizeKey(key));
    }
    async save(key, buffer, _opts = {}) {
        const full = this._full(key);
        await fsp.mkdir(path.dirname(full), { recursive: true });
        await fsp.writeFile(full, buffer);
        return { key: sanitizeKey(key) };
    }
    async read(key) {
        return fsp.readFile(this._full(key));
    }
    async exists(key) {
        try {
            await fsp.access(this._full(key));
            return true;
        } catch (_e) {
            return false;
        }
    }
    async delete(key) {
        try {
            await fsp.unlink(this._full(key));
        } catch (e) {
            if (e.code !== 'ENOENT') throw e; // supprimer un fichier deja absent = succes
        }
    }
    // En local il n'y a pas d'URL signee : on renvoie un chemin d'API relatif
    // (a servir par une route applicative authentifiee). L'app Electron, elle,
    // lit le fichier directement par son chemin disque.
    async getSignedUrl(key /*, _opts */) {
        return `/api/files/${sanitizeKey(key)}`;
    }
}

class GcsStorage {
    constructor({ bucket, keyFilename, projectId, signedUrlExpiresSec }) {
        this.kind = 'gcs';
        this.bucketName = bucket;
        this.signedUrlExpiresSec = signedUrlExpiresSec || 3600;
        // LAZY REQUIRE : uniquement quand GCS est reellement utilise. Si le
        // package n'est pas installe, on leve une erreur explicite (au lieu de
        // planter tout le serveur au demarrage du chemin local).
        let Storage;
        try {
            ({ Storage } = require('@google-cloud/storage'));
        } catch (e) {
            throw new Error(
                "GCS_BUCKET est defini mais le package '@google-cloud/storage' n'est pas installe. "
                + "Lancez `npm install @google-cloud/storage` dans server/."
            );
        }
        this._storage = new Storage({ projectId, keyFilename });
        this._bucket = this._storage.bucket(bucket);
    }
    _file(key) {
        return this._bucket.file(sanitizeKey(key));
    }
    async save(key, buffer, opts = {}) {
        await this._file(key).save(buffer, {
            resumable: false,
            contentType: opts.contentType || 'application/octet-stream',
            metadata: opts.contentType ? { contentType: opts.contentType } : undefined,
        });
        return { key: sanitizeKey(key) };
    }
    async read(key) {
        const [buf] = await this._file(key).download();
        return buf;
    }
    async exists(key) {
        const [ok] = await this._file(key).exists();
        return ok;
    }
    async delete(key) {
        try {
            await this._file(key).delete();
        } catch (e) {
            if (e.code !== 404) throw e; // deja absent = succes
        }
    }
    async getSignedUrl(key, opts = {}) {
        const ttl = (opts.expiresInSec || this.signedUrlExpiresSec) * 1000;
        const [url] = await this._file(key).getSignedUrl({
            version: 'v4',
            action: opts.action || 'read',
            expires: Date.now() + ttl,
        });
        return url;
    }
    async checkReadiness({ expiresInSec = 60 } = {}) {
        // getMetadata() valide l'existence du bucket et le droit de le
        // consulter. Cela ne liste ni ne lit aucun objet.
        const [metadata] = await this._bucket.getMetadata();
        if (!metadata || typeof metadata !== 'object') {
            throw new Error('Metadonnees du bucket GCS indisponibles.');
        }

        // La generation V4 exerce aussi la capacite de signature du compte de
        // service (locale ou via IAM signBlob selon les credentials). L'URL est
        // volontairement jetee et ne doit jamais etre exposee par le healthcheck.
        const signedUrl = await this.getSignedUrl(GCS_READINESS_PROBE_KEY, {
            action: 'read',
            expiresInSec,
        });
        if (typeof signedUrl !== 'string' || !signedUrl.startsWith('https://')) {
            throw new Error('Signature GCS indisponible.');
        }
        return { metadata: true, signing: true };
    }
}

// Racine de stockage local par defaut (writable et persistante). Surcharger
// via FILE_STORAGE_LOCAL_ROOT.
function defaultLocalRoot() {
    const base = process.env.APPDATA
        || (process.env.HOME ? path.join(process.env.HOME, '.kheops2') : null)
        || path.join(os.homedir(), 'Kheops2');
    return path.join(base, 'Kheops2', 'files');
}

// Resout le choix d'adaptateur a partir de l'environnement, SANS rien
// instancier (pur, testable). GCS prioritaire si GCS_BUCKET est defini.
function resolveStorageConfig(env = process.env) {
    if (env.GCS_BUCKET) {
        return {
            kind: 'gcs',
            options: {
                bucket: env.GCS_BUCKET,
                keyFilename: env.GCS_KEY_FILE || env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
                projectId: env.GCS_PROJECT_ID || undefined,
                signedUrlExpiresSec: Number(env.GCS_SIGNED_URL_TTL_SEC) || 3600,
            },
        };
    }
    return {
        kind: 'local',
        options: { root: env.FILE_STORAGE_LOCAL_ROOT || defaultLocalRoot() },
    };
}

// Construit un adaptateur (non mis en cache) a partir de l'env — utile pour les
// tests ou un stockage dedie.
function buildFileStorage(env = process.env) {
    const cfg = resolveStorageConfig(env);
    return cfg.kind === 'gcs'
        ? new GcsStorage(cfg.options)
        : new LocalDiskStorage(cfg.options);
}

// Singleton par defaut pour l'application.
let _instance = null;
function getFileStorage() {
    if (!_instance) _instance = buildFileStorage(process.env);
    return _instance;
}

module.exports = {
    getFileStorage,
    buildFileStorage,
    resolveStorageConfig,
    sanitizeKey,
    GCS_READINESS_PROBE_KEY,
    LocalDiskStorage,
    GcsStorage,
};
