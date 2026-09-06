const { TextDecoder } = require('util');
const { isDocxBuffer } = require('./documentCompatibilityService');
const { DOCX_MIME } = require('./documentContentService');
const MAX_EXTERNAL_DOCUMENT_BYTES = 25 * 1024 * 1024;
const MAX_EXTERNAL_TEXT_BYTES = 5 * 1024 * 1024;
const TEXT_MIME = 'text/plain';

function assertEditableDocx({ filename, buffer, size }) {
  if (!/\.docx$/i.test(String(filename || ''))) {
    const err = new Error('Seuls les documents Word .docx peuvent être ouverts dans cet éditeur. Téléchargez les autres formats.');
    err.statusCode = 415;
    err.code = 'DOCX_REQUIRED';
    throw err;
  }
  const effectiveSize = Number(size) || buffer?.length || 0;
  if (effectiveSize > MAX_EXTERNAL_DOCUMENT_BYTES) {
    const err = new Error('Ce document dépasse la limite de 25 Mo pour une édition en ligne.');
    err.statusCode = 413;
    err.code = 'DOCUMENT_TOO_LARGE';
    throw err;
  }
  if (buffer && !isDocxBuffer(buffer)) {
    const err = new Error('Le fichier ne contient pas un document DOCX valide. Le document original reste inchangé.');
    err.statusCode = 415;
    err.code = 'INVALID_DOCX';
    throw err;
  }
}

function safeFilename(value, fallback) {
  const name = String(value || fallback || 'document.docx').replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  return /\.docx$/i.test(name) ? name : `${name}.docx`;
}

function safeTextFilename(value, fallback) {
  const name = String(value || fallback || 'document.txt').replace(/[\\/:*?"<>|\r\n]/g, '_').trim();
  if (/\.txt$/i.test(name)) return name;
  const withoutExtension = name.replace(/\.[^.]+$/, '');
  return `${withoutExtension || 'document'}.txt`;
}

function sourceFormat({ filename, mime } = {}) {
  const name = String(filename || '').trim().toLowerCase();
  const type = String(mime || '').split(';')[0].trim().toLowerCase();
  if (/\.txt$/i.test(name) || type === TEXT_MIME) return 'txt';
  if (/\.docx$/i.test(name) || type === DOCX_MIME) return 'docx';
  return null;
}

function normalizePlainTextBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    const err = new Error('Le contenu du fichier texte est indisponible.');
    err.statusCode = 400;
    err.code = 'MISSING_TEXT_BUFFER';
    throw err;
  }
  if (buffer.length > MAX_EXTERNAL_TEXT_BYTES) {
    const err = new Error('Ce fichier texte dépasse la limite de 5 Mo pour une édition en ligne.');
    err.statusCode = 413;
    err.code = 'TEXT_DOCUMENT_TOO_LARGE';
    throw err;
  }
  if (buffer.includes(0)) {
    const err = new Error('Ce fichier contient des données binaires et ne peut pas être traité comme du texte.');
    err.statusCode = 415;
    err.code = 'INVALID_TEXT_CONTENT';
    throw err;
  }
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return Buffer.from(decoded.replace(/^\uFEFF/, ''), 'utf8');
  } catch (_error) {
    const err = new Error('Le fichier texte doit être encodé en UTF-8. Le document original reste inchangé.');
    err.statusCode = 415;
    err.code = 'INVALID_TEXT_ENCODING';
    throw err;
  }
}

function assertEditableText({ filename, mime, buffer, size }) {
  const type = String(mime || '').split(';')[0].trim().toLowerCase();
  if (!/\.txt$/i.test(String(filename || '')) && type !== TEXT_MIME) {
    const err = new Error('Seuls les fichiers texte .txt peuvent utiliser ce parcours.');
    err.statusCode = 415;
    err.code = 'TXT_REQUIRED';
    throw err;
  }
  if (type && ![TEXT_MIME, 'application/octet-stream'].includes(type)) {
    const err = new Error('Le type de contenu ne correspond pas à un fichier texte brut.');
    err.statusCode = 415;
    err.code = 'INVALID_TEXT_MIME';
    throw err;
  }
  const effectiveSize = Number(size) || buffer?.length || 0;
  if (effectiveSize > MAX_EXTERNAL_TEXT_BYTES) {
    const err = new Error('Ce fichier texte dépasse la limite de 5 Mo pour une édition en ligne.');
    err.statusCode = 413;
    err.code = 'TEXT_DOCUMENT_TOO_LARGE';
    throw err;
  }
  return buffer ? normalizePlainTextBuffer(buffer) : null;
}

module.exports = { DOCX_MIME, TEXT_MIME, assertEditableDocx, assertEditableText, sourceFormat, safeFilename, safeTextFilename };
