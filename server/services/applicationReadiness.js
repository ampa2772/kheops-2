const { getFileStorage } = require('./fileStorage');

const DEFAULT_TIMEOUT_MS = 10000;

function hosted(env = process.env) {
  return env.KHEOPS_HOSTED === 'true';
}

function initialState(env = process.env) {
  const isHosted = hosted(env);
  return {
    startupReady: !isHosted,
    gcsRequired: isHosted,
    gcsChecked: !isHosted,
    gcsReady: !isHosted,
  };
}

let state = initialState();

function timeoutMs(env) {
  const value = Number(env.GCS_READINESS_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 250 && value <= 60000
    ? value
    : DEFAULT_TIMEOUT_MS;
}

function withTimeout(promise, milliseconds) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error('GCS readiness timeout');
      error.code = 'GCS_READINESS_TIMEOUT';
      reject(error);
    }, milliseconds);
    timer.unref?.();
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Reinitialise l'etat avant la sequence de demarrage. Hors hebergement, GCS
 * n'est pas une dependance obligatoire et le comportement Electron/local reste
 * donc strictement inchange.
 */
function beginStartup(env = process.env) {
  state = initialState(env);
  state.startupReady = false;
}

function markStartupReady() {
  state.startupReady = true;
}

/**
 * Controle GCS sans lire/ecrire/lister d'objet. L'adaptateur effectue seulement
 * getMetadata() sur le bucket puis signe une URL V4 pour une cle reservee et
 * inexistante. Toute erreur est reduite a un booleen dans l'etat public.
 */
async function checkHostedGcs({
  env = process.env,
  storageFactory = getFileStorage,
  logger = console,
} = {}) {
  if (!hosted(env)) {
    state.gcsRequired = false;
    state.gcsChecked = true;
    state.gcsReady = true;
    return true;
  }

  state.gcsRequired = true;
  state.gcsChecked = true;
  state.gcsReady = false;

  if (!env.GCS_BUCKET) {
    logger.error?.('[Readiness] GCS indisponible: GCS_BUCKET_MISSING');
    return false;
  }

  try {
    const storage = storageFactory();
    if (storage?.kind !== 'gcs' || typeof storage.checkReadiness !== 'function') {
      throw Object.assign(new Error('Adaptateur GCS invalide.'), { code: 'GCS_ADAPTER_INVALID' });
    }
    const result = await withTimeout(
      Promise.resolve().then(() => storage.checkReadiness()),
      timeoutMs(env),
    );
    state.gcsReady = result?.metadata === true && result?.signing === true;
    if (!state.gcsReady) throw Object.assign(new Error('Controle GCS incomplet.'), { code: 'GCS_CHECK_INCOMPLETE' });
    logger.log?.('[Readiness] GCS pret (metadonnees et signature validees).');
    return true;
  } catch (error) {
    state.gcsReady = false;
    // Ne pas journaliser l'URL signee, le bucket ou une reponse fournisseur.
    logger.error?.(`[Readiness] GCS indisponible: ${error?.code || error?.name || 'ERROR'}`);
    return false;
  }
}

function snapshot({
  buildRequired = false,
  buildReady = false,
  aiWorkerRequired = false,
  aiWorkerRunning = false,
  syncWorkerRequired = false,
  syncWorkerRunning = false,
  mailWorkerRequired = false,
  mailWorkerRunning = false,
} = {}) {
  const gcsReady = !state.gcsRequired || (state.gcsChecked && state.gcsReady);
  const aiWorkerReady = !aiWorkerRequired || aiWorkerRunning === true;
  const documentSyncWorkerReady = !syncWorkerRequired || syncWorkerRunning === true;
  const mailWorkerReady = !mailWorkerRequired || mailWorkerRunning === true;
  const ready = {
    build: !buildRequired || buildReady === true,
    startup: state.startupReady === true,
    gcs: gcsReady,
    aiWorker: aiWorkerReady,
    documentSyncWorker: documentSyncWorkerReady,
    mailWorker: mailWorkerReady,
  };
  return {
    ok: Object.values(ready).every(Boolean),
    ready,
  };
}

// Reserve aux tests unitaires : aucune donnee de diagnostic sensible n'est
// rendue publique et le serveur de production ne l'appelle pas.
function resetForTests(env = process.env) {
  state = initialState(env);
}

module.exports = {
  beginStartup,
  markStartupReady,
  checkHostedGcs,
  snapshot,
  resetForTests,
};
