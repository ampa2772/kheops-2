const path = require('path');
const { Worker } = require('worker_threads');

const {
  normalizeStructuredDocument,
} = require('./documentEditorFormat');
const { plainTextToStructuredDocument } = require('./documentPlainTextFormat');

const LEGACY_DOC_MIME = 'application/msword';
const LEGACY_DOC_MAGIC = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const MAX_LEGACY_DOC_BYTES = 8 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_BYTES = 5 * 1024 * 1024;
const DEFAULT_EXTRACTION_TIMEOUT_MS = 10000;

function legacyWordError(message, code, statusCode = 415) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizedMime(value) {
  return String(value || '').split(';')[0].trim().toLowerCase();
}

function isLegacyWordContent({ filename = '', mime = '' } = {}) {
  const name = String(filename || '');
  // Toute extension Word explicite prime sur le MIME : un `.doc` reste legacy
  // même si son fournisseur annonce par erreur le MIME OOXML, et un `.docx`
  // n'est jamais envoyé au convertisseur OLE malgré un MIME application/msword.
  if (/\.docx$/i.test(name)) return false;
  if (/\.doc$/i.test(name)) return true;
  return normalizedMime(mime) === LEGACY_DOC_MIME;
}

function assertLegacyWordBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw legacyWordError(
      'Le contenu original du document Word historique est indisponible.',
      'LEGACY_DOC_CONTENT_UNAVAILABLE',
      409,
    );
  }
  if (buffer.length > MAX_LEGACY_DOC_BYTES) {
    throw legacyWordError(
      'Ce document Word historique dépasse 8 Mo. Ouvrez-le avec Microsoft Word afin de préserver sa mise en page.',
      'LEGACY_DOC_TOO_LARGE',
      413,
    );
  }
  if (buffer.length < LEGACY_DOC_MAGIC.length
      || !buffer.subarray(0, LEGACY_DOC_MAGIC.length).equals(LEGACY_DOC_MAGIC)) {
    throw legacyWordError(
      'Ce fichier .doc n’est pas un document Word binaire valide. Les fichiers RTF ou HTML renommés en .doc doivent être ouverts avec leur application d’origine.',
      'INVALID_LEGACY_DOC',
    );
  }
}

function normalizeExtractedText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    // Word emploie notamment BEL comme séparateur de cellule et VT comme
    // saut de ligne dans certains anciens documents binaires.
    .replace(/\u0007/g, '\t')
    .replace(/\u000b/g, '\n')
    .replace(/\r\n?|\u2028|\u2029/g, '\n')
    .replace(/[\u0001-\u0006\u0008\u000e-\u001f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n');
}

function extractionFailure(code = 'INVALID_LEGACY_DOC') {
  if (code === 'LEGACY_DOC_CONVERSION_TIMEOUT') {
    return legacyWordError(
      'La conversion du document .doc a dépassé le délai de sécurité. L’original reste disponible et n’a pas été modifié.',
      code,
      422,
    );
  }
  return legacyWordError(
    'Le document .doc est endommagé ou utilise une variante Word historique non prise en charge. L’original reste disponible et n’a pas été modifié.',
    code,
  );
}

function extractInWorker(buffer, timeoutMs = DEFAULT_EXTRACTION_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(path.join(__dirname, 'documentLegacyWordWorker.js'), {
      workerData: { buffer },
      resourceLimits: {
        maxOldGenerationSizeMb: 96,
        maxYoungGenerationSizeMb: 16,
        stackSizeMb: 4,
      },
    });

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
      worker.terminate().catch(() => {});
    };

    const timer = setTimeout(() => {
      finish(() => reject(extractionFailure('LEGACY_DOC_CONVERSION_TIMEOUT')));
    }, Math.max(1000, Number(timeoutMs) || DEFAULT_EXTRACTION_TIMEOUT_MS));

    worker.once('message', (message) => {
      if (message?.ok && message.sections && typeof message.sections === 'object') {
        finish(() => resolve(message.sections));
      } else {
        finish(() => reject(extractionFailure()));
      }
    });
    worker.once('error', () => finish(() => reject(extractionFailure())));
    worker.once('exit', (code) => {
      if (!settled && code !== 0) finish(() => reject(extractionFailure()));
    });
  });
}

function withExtractionTimeout(operation, timeoutMs = DEFAULT_EXTRACTION_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(extractionFailure('LEGACY_DOC_CONVERSION_TIMEOUT')),
      Math.max(1, Number(timeoutMs) || DEFAULT_EXTRACTION_TIMEOUT_MS),
    );
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
}

function sectionBlock(value, label) {
  const text = normalizeExtractedText(value);
  if (!text.trim()) return null;
  return plainTextToStructuredDocument(text, label).blocks[0];
}

function cleanTitle(filename) {
  const basename = path.basename(String(filename || 'document.doc'))
    .replace(/[\\/\r\n"]/g, '_')
    .replace(/\.doc$/i, '')
    .slice(0, 240);
  return basename || 'Document Word historique';
}

function buildStructuredDocument(sections, filename) {
  const normalized = {
    body: normalizeExtractedText(sections?.body),
    headers: normalizeExtractedText(sections?.headers),
    footers: normalizeExtractedText(sections?.footers),
    footnotes: normalizeExtractedText(sections?.footnotes),
    endnotes: normalizeExtractedText(sections?.endnotes),
    annotations: normalizeExtractedText(sections?.annotations),
    textboxes: normalizeExtractedText(sections?.textboxes),
  };
  const aggregate = Object.values(normalized).join('\n');
  if (Buffer.byteLength(aggregate, 'utf8') > MAX_EXTRACTED_TEXT_BYTES) {
    throw legacyWordError(
      'Le texte extrait du document .doc dépasse 5 Mo. Utilisez Microsoft Word pour ce document volumineux.',
      'LEGACY_DOC_EXTRACTED_TEXT_TOO_LARGE',
      413,
    );
  }

  const appendices = [];
  if (normalized.textboxes.trim()) {
    appendices.push(`Zones de texte récupérées (position d’origine non conservée)\n${normalized.textboxes}`);
  }
  if (normalized.footnotes.trim()) appendices.push(`Notes de bas de page récupérées\n${normalized.footnotes}`);
  if (normalized.endnotes.trim()) appendices.push(`Notes de fin récupérées\n${normalized.endnotes}`);
  const body = [normalized.body, ...appendices].filter((value) => value.trim()).join('\n\n');
  const title = cleanTitle(filename);
  const structured = plainTextToStructuredDocument(body, title);
  structured.title = title;
  structured.documentType = 'legacy-word';
  structured.page.header = {
    blocks: [sectionBlock(normalized.headers, 'En-tête')].filter(Boolean),
  };
  structured.page.footer = {
    blocks: [sectionBlock(normalized.footers, 'Pied de page')].filter(Boolean),
  };
  structured.page.showPageNumbers = false;
  return { structured: normalizeStructuredDocument(structured), normalized };
}

async function convertLegacyWordBuffer(buffer, filename = 'document.doc', options = {}) {
  assertLegacyWordBuffer(buffer);
  let sections;
  try {
    sections = typeof options.extractor === 'function'
      ? await withExtractionTimeout(options.extractor(buffer), options.timeoutMs)
      : await extractInWorker(buffer, options.timeoutMs);
  } catch (error) {
    if (error?.code && /^LEGACY_DOC_/.test(error.code)) throw error;
    throw extractionFailure();
  }

  const { structured, normalized } = buildStructuredDocument(sections, filename);
  const warnings = [
    'Le fichier Word historique (.doc) a été converti en copie éditable .docx. L’original .doc est conservé sans modification.',
    'La mise en forme, les tableaux, les images, les champs, les révisions et les objets incorporés peuvent ne pas être reproduits fidèlement.',
  ];
  if (normalized.headers.trim() || normalized.footers.trim()) {
    warnings.push('Les en-têtes et pieds de page ont été récupérés comme texte ; leur mise en page d’origine peut différer.');
  }
  if (normalized.textboxes.trim()) {
    warnings.push('Le texte des zones de texte a été ajouté à la fin du document ; sa position d’origine n’est pas conservée.');
  }
  if (normalized.footnotes.trim() || normalized.endnotes.trim()) {
    warnings.push('Les notes ont été ajoutées à la fin du document ; leur numérotation et leur position d’origine peuvent différer.');
  }
  if (normalized.annotations.trim()) {
    warnings.push('Les commentaires Word sont détectés mais ne sont pas ajoutés au contenu éditable.');
  }

  return {
    compatibility: {
      level: 'partial',
      label: 'DOC historique converti',
      warnings,
      analyzedAt: new Date(),
    },
    converted: { messages: warnings.map((message) => ({ type: 'warning', message })) },
    structured,
  };
}

module.exports = {
  DEFAULT_EXTRACTION_TIMEOUT_MS,
  LEGACY_DOC_MAGIC,
  LEGACY_DOC_MIME,
  MAX_LEGACY_DOC_BYTES,
  assertLegacyWordBuffer,
  convertLegacyWordBuffer,
  isLegacyWordContent,
};
