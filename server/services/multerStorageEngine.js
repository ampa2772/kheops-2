// server/services/multerStorageEngine.js
//
// Moteur de stockage multer branche sur la couche fileStorage (Phase 4).
//
// Permet a n'importe quelle route d'upload d'ecrire ses fichiers via
// l'abstraction (disque local par defaut, GCS si configure) SANS connaitre le
// backend. Le buffer est accumule en memoire puis confie a storage.save() ; la
// cle resultante est posee sur req.file.storageKey (et fusionnee dans req.file
// par multer). _removeFile gere le nettoyage en cas d'erreur de la requete.
//
// Usage :
//   const upload = multer({
//     storage: createStorageEngine({
//       storage: chatStorage,
//       keyFn: (req, file) => `chat/${yyyymm()}/${stamp()}__${safe(file.originalname)}`,
//     }),
//     limits: { fileSize: 25 * 1024 * 1024 },
//   });

const { getFileStorage } = require('./fileStorage');

/**
 * @param {object} opts
 * @param {(req, file) => string} opts.keyFn  calcule la cle de stockage
 * @param {object} [opts.storage]             adaptateur fileStorage (defaut: getFileStorage())
 */
function createStorageEngine({ keyFn, storage } = {}) {
    if (typeof keyFn !== 'function') {
        throw new Error('createStorageEngine: keyFn (req, file) => key est requis.');
    }
    const store = storage || getFileStorage();

    return {
        _handleFile(req, file, cb) {
            const chunks = [];
            file.stream.on('data', (chunk) => chunks.push(chunk));
            file.stream.on('error', cb);
            file.stream.on('end', () => {
                let key;
                try {
                    key = keyFn(req, file);
                } catch (e) {
                    return cb(e);
                }
                const buffer = Buffer.concat(chunks);
                Promise.resolve(store.save(key, buffer, { contentType: file.mimetype }))
                    .then(() => cb(null, {
                        storageKey: key,
                        storageKind: store.kind,
                        size: buffer.length,
                    }))
                    .catch(cb);
            });
        },
        _removeFile(req, file, cb) {
            const key = file.storageKey;
            if (!key) return cb(null);
            Promise.resolve(store.delete(key)).then(() => cb(null)).catch(cb);
        },
    };
}

module.exports = { createStorageEngine };
