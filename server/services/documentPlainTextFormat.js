const { TextDecoder } = require('util');

const { createDefaultDocument, normalizeStructuredDocument } = require('./documentEditorFormat');

const TEXT_MIME = 'text/plain';
const MAX_PLAIN_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_RUN_CHARS = 50000;

const WINDOWS_1252_DECODE = Object.freeze({
  0x80: '\u20ac', 0x82: '\u201a', 0x83: '\u0192', 0x84: '\u201e',
  0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02c6',
  0x89: '\u2030', 0x8a: '\u0160', 0x8b: '\u2039', 0x8c: '\u0152',
  0x8e: '\u017d', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201c',
  0x94: '\u201d', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '\u02dc', 0x99: '\u2122', 0x9a: '\u0161', 0x9b: '\u203a',
  0x9c: '\u0153', 0x9e: '\u017e', 0x9f: '\u0178',
});
const WINDOWS_1252_ENCODE = new Map(
  Object.entries(WINDOWS_1252_DECODE).map(([byte, character]) => [character, Number(byte)]),
);

function plainTextError(message, code, statusCode = 415) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function cleanFilename(value, fallback = 'document.txt') {
  const safe = String(value || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 240);
  return /\.txt$/i.test(safe) ? safe : `${safe.replace(/\.[^.]+$/, '') || 'document'}.txt`;
}

function isPlainTextContent({ filename = '', mime = '' } = {}) {
  const baseMime = String(mime || '').split(';')[0].trim().toLowerCase();
  return /\.txt$/i.test(String(filename || '')) || baseMime === TEXT_MIME;
}

function assertPlainTextSize(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw plainTextError('Le contenu texte original est indisponible.', 'TEXT_CONTENT_UNAVAILABLE', 409);
  }
  if (buffer.length > MAX_PLAIN_TEXT_BYTES) {
    throw plainTextError(
      'Ce fichier texte dépasse 5 Mo. Téléchargez-le ou ouvrez-le avec une application adaptée.',
      'TEXT_DOCUMENT_TOO_LARGE',
      413,
    );
  }
}

function assertTextCharacters(value) {
  if (value.includes('\u0000')) {
    throw plainTextError('Ce fichier contient des octets binaires et ne peut pas être modifié comme texte brut.', 'BINARY_TEXT_FILE');
  }
  let controlCount = 0;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 && code !== 9 && code !== 10 && code !== 12 && code !== 13) controlCount += 1;
  }
  if (controlCount > Math.max(4, Math.floor(value.length * 0.01))) {
    throw plainTextError('Ce fichier contient trop de caractères de contrôle pour être un texte brut.', 'BINARY_TEXT_FILE');
  }
}

function decodeWindows1252(buffer) {
  let result = '';
  for (const byte of buffer) {
    if (WINDOWS_1252_DECODE[byte]) result += WINDOWS_1252_DECODE[byte];
    else result += String.fromCharCode(byte);
  }
  return result;
}

function detectLineEndings(value) {
  const crlf = (value.match(/\r\n/g) || []).length;
  const withoutCrlf = value.replace(/\r\n/g, '');
  const lf = (withoutCrlf.match(/\n/g) || []).length;
  const cr = (withoutCrlf.match(/\r/g) || []).length;
  const used = [crlf && 'crlf', lf && 'lf', cr && 'cr'].filter(Boolean);
  const lineEnding = [
    ['crlf', crlf],
    ['lf', lf],
    ['cr', cr],
  ].sort((left, right) => right[1] - left[1])[0][1]
    ? [['crlf', crlf], ['lf', lf], ['cr', cr]].sort((left, right) => right[1] - left[1])[0][0]
    : 'lf';
  return { lineEnding, mixedLineEndings: used.length > 1 };
}

function decodePlainTextBuffer(buffer, { filename = 'document.txt', mime = TEXT_MIME } = {}) {
  assertPlainTextSize(buffer);
  let encoding = 'utf8';
  let bom = false;
  let body = buffer;
  let text;

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    bom = true;
    body = buffer.subarray(3);
  } else if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    encoding = 'utf16le';
    bom = true;
    body = buffer.subarray(2);
  } else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    encoding = 'utf16be';
    bom = true;
    body = buffer.subarray(2);
  }

  if (encoding === 'utf16le') {
    if (body.length % 2) throw plainTextError('Le fichier UTF-16 LE est tronqué.', 'INVALID_TEXT_ENCODING');
    text = body.toString('utf16le');
  } else if (encoding === 'utf16be') {
    if (body.length % 2) throw plainTextError('Le fichier UTF-16 BE est tronqué.', 'INVALID_TEXT_ENCODING');
    const littleEndian = Buffer.allocUnsafe(body.length);
    for (let index = 0; index < body.length; index += 2) {
      littleEndian[index] = body[index + 1];
      littleEndian[index + 1] = body[index];
    }
    text = littleEndian.toString('utf16le');
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    } catch (_error) {
      encoding = 'windows-1252';
      bom = false;
      text = decodeWindows1252(body);
    }
  }

  assertTextCharacters(text);
  const endings = detectLineEndings(text);
  const normalizedText = text.replace(/\r\n|\r/g, '\n');
  return {
    text: normalizedText,
    fileFormat: {
      kind: 'text',
      filename: cleanFilename(filename),
      mime: TEXT_MIME,
      encoding,
      bom,
      lineEnding: endings.lineEnding,
      mixedLineEndings: endings.mixedLineEndings,
      finalNewline: normalizedText.endsWith('\n'),
    },
    compatibility: {
      level: 'native',
      label: 'Texte brut (.txt)',
      warnings: endings.mixedLineEndings
        ? ['Le fichier mélangeait plusieurs fins de ligne. Les prochaines sauvegardes utiliseront la convention dominante.']
        : [],
      analyzedAt: new Date(),
    },
  };
}

function normalizePlainText(value) {
  if (typeof value !== 'string') {
    throw plainTextError('Le contenu texte brut est requis.', 'PLAIN_TEXT_REQUIRED', 400);
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_PLAIN_TEXT_BYTES) {
    throw plainTextError('Ce fichier texte dépasse 5 Mo.', 'TEXT_DOCUMENT_TOO_LARGE', 413);
  }
  assertTextCharacters(value);
  return value.replace(/\r\n|\r/g, '\n');
}

function splitRuns(value) {
  if (!value) return [{ text: '', marks: {} }];
  const runs = [];
  for (let index = 0; index < value.length; index += MAX_RUN_CHARS) {
    runs.push({ text: value.slice(index, index + MAX_RUN_CHARS), marks: {} });
  }
  return runs;
}

function plainTextToStructuredDocument(value, title = 'Document sans titre') {
  const text = normalizePlainText(value);
  const document = createDefaultDocument(String(title || 'Document sans titre').replace(/\.txt$/i, ''));
  document.documentType = 'plain-text';
  document.page.showPageNumbers = false;
  document.page.header = { blocks: [] };
  document.page.footer = { blocks: [] };
  document.blocks = [{
    id: 'plain-text-root',
    type: 'paragraph',
    runs: splitRuns(text),
    align: 'left',
    indent: 0,
    spacing: { line: 1, before: 0, after: 0 },
  }];
  return normalizeStructuredDocument(document);
}

function structuredDocumentToPlainText(document) {
  const blocks = Array.isArray(document?.blocks) ? document.blocks : [];
  const textBlocks = blocks.map((block) => {
    if (!block || !['paragraph', 'heading', 'list-item'].includes(block.type)) {
      throw plainTextError(
        'Le mode texte brut ne peut pas enregistrer de tableau, image, saut de page ou référence structurée.',
        'TEXT_MODE_RICH_CONTENT',
        409,
      );
    }
    return (Array.isArray(block.runs) ? block.runs : []).map((run) => String(run?.text || '')).join('');
  });
  return normalizePlainText(textBlocks.join('\n'));
}

function normalizeTextFileFormat(value = {}, fallback = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    kind: 'text',
    filename: cleanFilename(source.filename || base.filename || 'document.txt'),
    mime: TEXT_MIME,
    encoding: ['utf8', 'utf16le', 'utf16be', 'windows-1252'].includes(source.encoding)
      ? source.encoding
      : (['utf8', 'utf16le', 'utf16be', 'windows-1252'].includes(base.encoding) ? base.encoding : 'utf8'),
    bom: source.bom === undefined ? Boolean(base.bom) : Boolean(source.bom),
    lineEnding: ['lf', 'crlf', 'cr'].includes(source.lineEnding)
      ? source.lineEnding
      : (['lf', 'crlf', 'cr'].includes(base.lineEnding) ? base.lineEnding : 'lf'),
    mixedLineEndings: Boolean(source.mixedLineEndings),
    finalNewline: Boolean(source.finalNewline),
  };
}

function encodeWindows1252(value) {
  const bytes = [];
  for (const character of value) {
    const point = character.codePointAt(0);
    if (WINDOWS_1252_ENCODE.has(character)) bytes.push(WINDOWS_1252_ENCODE.get(character));
    else if ((point >= 0 && point <= 0x7f) || (point >= 0xa0 && point <= 0xff)) bytes.push(point);
    else {
      throw plainTextError(
        `Le caractère « ${character} » n’existe pas dans l’encodage Windows-1252 d’origine. Enregistrez le fichier en UTF-8 avant de l’ajouter.`,
        'TEXT_ENCODING_UNREPRESENTABLE',
        422,
      );
    }
  }
  return Buffer.from(bytes);
}

function encodePlainTextBuffer(value, fileFormat = {}) {
  const text = normalizePlainText(value);
  const format = normalizeTextFileFormat({ ...fileFormat, finalNewline: text.endsWith('\n') }, fileFormat);
  const separator = format.lineEnding === 'crlf' ? '\r\n' : (format.lineEnding === 'cr' ? '\r' : '\n');
  const encodedText = separator === '\n' ? text : text.replace(/\n/g, separator);
  let buffer;
  if (format.encoding === 'utf16le') {
    buffer = Buffer.from(encodedText, 'utf16le');
    if (format.bom) buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), buffer]);
  } else if (format.encoding === 'utf16be') {
    const littleEndian = Buffer.from(encodedText, 'utf16le');
    buffer = Buffer.allocUnsafe(littleEndian.length);
    for (let index = 0; index < littleEndian.length; index += 2) {
      buffer[index] = littleEndian[index + 1];
      buffer[index + 1] = littleEndian[index];
    }
    if (format.bom) buffer = Buffer.concat([Buffer.from([0xfe, 0xff]), buffer]);
  } else if (format.encoding === 'windows-1252') {
    buffer = encodeWindows1252(encodedText);
  } else {
    buffer = Buffer.from(encodedText, 'utf8');
    if (format.bom) buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), buffer]);
  }
  if (buffer.length > MAX_PLAIN_TEXT_BYTES) {
    throw plainTextError('Ce fichier texte dépasse 5 Mo.', 'TEXT_DOCUMENT_TOO_LARGE', 413);
  }
  return { buffer, fileFormat: format };
}

module.exports = {
  MAX_PLAIN_TEXT_BYTES,
  TEXT_MIME,
  decodePlainTextBuffer,
  encodePlainTextBuffer,
  isPlainTextContent,
  normalizePlainText,
  normalizeTextFileFormat,
  plainTextToStructuredDocument,
  structuredDocumentToPlainText,
};
