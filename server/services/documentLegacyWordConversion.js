const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const {
  assertLegacyWordBuffer,
} = require('./documentLegacyWordFormat');

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DEFAULT_CONVERSION_TIMEOUT_MS = 25000;
const MAX_CONVERTED_DOCX_BYTES = 16 * 1024 * 1024;
const MAX_PROCESS_OUTPUT_BYTES = 512 * 1024;
const DEFAULT_QUEUE_LIMIT = 4;

function integerBetween(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function conversionError(message, code, statusCode = 422) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function createConversionGate({ concurrency = 1, queueLimit = DEFAULT_QUEUE_LIMIT } = {}) {
  const maximumActive = integerBetween(concurrency, 1, 2, 1);
  const maximumQueued = integerBetween(queueLimit, 0, 16, DEFAULT_QUEUE_LIMIT);
  let active = 0;
  const queue = [];

  function acquire() {
    if (active < maximumActive) {
      active += 1;
      return Promise.resolve();
    }
    if (queue.length >= maximumQueued) {
      return Promise.reject(conversionError(
        'Le service de conversion des documents Word est momentanément occupé. Réessayez dans quelques instants.',
        'LEGACY_DOC_CONVERSION_BUSY',
        503,
      ));
    }
    return new Promise((resolve) => queue.push(resolve));
  }

  function release() {
    const next = queue.shift();
    if (next) {
      // Le créneau actif est transmis directement au premier appel en attente.
      next();
      return;
    }
    active = Math.max(0, active - 1);
  }

  return {
    async run(operation) {
      await acquire();
      try {
        return await operation();
      } finally {
        release();
      }
    },
    snapshot() {
      return { active, queued: queue.length, concurrency: maximumActive, queueLimit: maximumQueued };
    },
  };
}

const defaultGate = createConversionGate({
  concurrency: integerBetween(process.env.LEGACY_DOC_CONVERSION_CONCURRENCY, 1, 2, 1),
  queueLimit: integerBetween(process.env.LEGACY_DOC_CONVERSION_QUEUE_LIMIT, 0, 16, DEFAULT_QUEUE_LIMIT),
});

function safeConvertedFilename(filename) {
  const basename = path.basename(String(filename || 'document.doc'))
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/\.doc$/i, '')
    .slice(0, 220);
  return `${basename || 'document'}.docx`;
}

function conversionEnvironment(tempRoot) {
  const allowed = [
    'PATH',
    'LD_LIBRARY_PATH',
    'LANG',
    'LC_ALL',
    'TZ',
    'SYSTEMROOT',
    'WINDIR',
    'COMSPEC',
    'PATHEXT',
  ];
  const env = {};
  allowed.forEach((key) => {
    if (process.env[key]) env[key] = process.env[key];
  });
  return {
    ...env,
    HOME: tempRoot,
    TMPDIR: tempRoot,
    TMP: tempRoot,
    TEMP: tempRoot,
    XDG_CACHE_HOME: path.join(tempRoot, 'cache'),
    XDG_CONFIG_HOME: path.join(tempRoot, 'config'),
    SAL_USE_VCLPLUGIN: 'svp',
  };
}

function execFileRunner(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      timeout: options.timeoutMs,
      maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
      windowsHide: true,
      shell: false,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function runLibreOffice({
  runner,
  command,
  args,
  cwd,
  env,
  timeoutMs,
}) {
  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(conversionError(
        'La conversion du document .doc a dépassé le délai de sécurité. L’original reste disponible et n’a pas été modifié.',
        'LEGACY_DOC_CONVERSION_TIMEOUT',
        422,
      ));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => runner(command, args, {
        cwd,
        env,
        signal: controller.signal,
        timeoutMs,
        shell: false,
        maxBuffer: MAX_PROCESS_OUTPUT_BYTES,
      })),
      timeout,
    ]);
  } catch (error) {
    if (timedOut || error?.code === 'ETIMEDOUT' || (error?.killed && error?.signal)) {
      throw conversionError(
        'La conversion du document .doc a dépassé le délai de sécurité. L’original reste disponible et n’a pas été modifié.',
        'LEGACY_DOC_CONVERSION_TIMEOUT',
        422,
      );
    }
    if (error?.code === 'ENOENT') {
      throw conversionError(
        'Le convertisseur LibreOffice n’est pas disponible sur ce serveur. L’original reste disponible et n’a pas été modifié.',
        'LEGACY_DOC_CONVERTER_UNAVAILABLE',
        503,
      );
    }
    throw conversionError(
      'LibreOffice n’a pas pu convertir ce document Word historique. L’original reste disponible et n’a pas été modifié.',
      'LEGACY_DOC_CONVERSION_FAILED',
      422,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readConvertedOutput(outputPath, maximumBytes) {
  let info;
  try {
    info = await fs.promises.lstat(outputPath);
  } catch (_error) {
    throw conversionError(
      'LibreOffice n’a produit aucun document DOCX exploitable. L’original reste disponible et n’a pas été modifié.',
      'LEGACY_DOC_CONVERSION_FAILED',
      422,
    );
  }
  if (!info.isFile() || info.isSymbolicLink() || info.size <= 0) {
    throw conversionError(
      'LibreOffice n’a produit aucun document DOCX exploitable. L’original reste disponible et n’a pas été modifié.',
      'LEGACY_DOC_CONVERSION_FAILED',
      422,
    );
  }
  if (info.size > maximumBytes) {
    throw conversionError(
      'Le document DOCX produit dépasse la limite de sécurité de 16 Mo. L’original reste disponible et n’a pas été modifié.',
      'LEGACY_DOC_CONVERTED_TOO_LARGE',
      413,
    );
  }
  const buffer = await fs.promises.readFile(outputPath);
  if (buffer.length > maximumBytes) {
    throw conversionError(
      'Le document DOCX produit dépasse la limite de sécurité de 16 Mo. L’original reste disponible et n’a pas été modifié.',
      'LEGACY_DOC_CONVERTED_TOO_LARGE',
      413,
    );
  }
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw conversionError(
      'LibreOffice a produit un document DOCX invalide. L’original reste disponible et n’a pas été modifié.',
      'LEGACY_DOC_CONVERSION_FAILED',
      422,
    );
  }
  return buffer;
}

async function performConversion(buffer, filename, options) {
  let tempRoot = null;
  try {
    tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'kheops-doc-conversion-'));
    const inputDir = path.join(tempRoot, 'input');
    const outputDir = path.join(tempRoot, 'output');
    const profileDir = path.join(tempRoot, 'libreoffice-profile');
    await Promise.all([
      fs.promises.mkdir(inputDir, { recursive: true }),
      fs.promises.mkdir(outputDir, { recursive: true }),
      fs.promises.mkdir(profileDir, { recursive: true }),
      fs.promises.mkdir(path.join(tempRoot, 'cache'), { recursive: true }),
      fs.promises.mkdir(path.join(tempRoot, 'config'), { recursive: true }),
    ]);

    // Un nom constant et neutre évite que le nom fourni par l’utilisateur ne
    // devienne un argument interprété par LibreOffice. Le répertoire est unique.
    const inputPath = path.join(inputDir, 'source.doc');
    const outputPath = path.join(outputDir, 'source.docx');
    await fs.promises.writeFile(inputPath, buffer, { flag: 'wx', mode: 0o600 });

    const args = [
      `-env:UserInstallation=${pathToFileURL(profileDir).href}`,
      '--headless',
      '--nologo',
      '--nodefault',
      '--norestore',
      '--nolockcheck',
      '--convert-to',
      'docx:Office Open XML Text',
      '--outdir',
      outputDir,
      inputPath,
    ];
    await runLibreOffice({
      runner: options.runner || execFileRunner,
      command: options.command || process.env.LIBREOFFICE_BIN || 'soffice',
      args,
      cwd: tempRoot,
      env: conversionEnvironment(tempRoot),
      timeoutMs: integerBetween(options.timeoutMs, 10, DEFAULT_CONVERSION_TIMEOUT_MS, DEFAULT_CONVERSION_TIMEOUT_MS),
    });

    const convertedBuffer = await readConvertedOutput(
      outputPath,
      integerBetween(options.maxOutputBytes, 4, MAX_CONVERTED_DOCX_BYTES, MAX_CONVERTED_DOCX_BYTES),
    );
    return {
      buffer: convertedBuffer,
      filename: safeConvertedFilename(filename),
      mime: DOCX_MIME,
      converter: 'libreoffice',
    };
  } catch (error) {
    if (error?.code && /^LEGACY_DOC_/.test(error.code)) throw error;
    throw conversionError(
      'Le service n’a pas pu préparer la conversion de ce document Word historique. L’original reste disponible et n’a pas été modifié.',
      'LEGACY_DOC_CONVERSION_FAILED',
      422,
    );
  } finally {
    if (tempRoot) await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function convertLegacyWordToDocx(buffer, filename = 'document.doc', options = {}) {
  // Réutilise strictement les garde-fous OLE et 8 Mio du convertisseur legacy.
  assertLegacyWordBuffer(buffer);
  const gate = options.gate || defaultGate;
  return gate.run(() => performConversion(buffer, filename, options));
}

module.exports = {
  DEFAULT_CONVERSION_TIMEOUT_MS,
  DEFAULT_QUEUE_LIMIT,
  DOCX_MIME,
  MAX_CONVERTED_DOCX_BYTES,
  convertLegacyWordToDocx,
  createConversionGate,
  execFileRunner,
};
