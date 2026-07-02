// server/services/attachmentPolicy.js
//
// Politique commune de validation des PIÈCES JOINTES (A15 chat, A16 attach-to-matter) :
//   - plafond de TAILLE par fichier (protège la mémoire + le stockage/quota),
//   - refus des TYPES dangereux (exécutables / scripts).
//
// Volontairement partagé pour garantir une règle unique côté chat ET côté mail.
// Les erreurs portent un `statusCode` exploitable par les handlers d'erreur
// existants (handleMailError / handleStorageError).

const path = require('path');

// 25 Mo par défaut (aligné sur la limite Gmail utilisée ailleurs). Configurable.
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function maxAttachmentBytes() {
  const v = Number(process.env.STORAGE_MAX_ATTACHMENT_BYTES);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_BYTES;
}

// Extensions et types MIME d'exécutables/scripts refusés à l'attache.
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'com', 'scr', 'bat', 'cmd', 'pif', 'msi', 'msp', 'cpl', 'jar',
  'js', 'jse', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'sh', 'app',
  'apk', 'dll', 'sys', 'scf', 'lnk', 'reg', 'hta', 'gadget', 'msc',
]);
const BLOCKED_MIME = new Set([
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-dosexec',
  'application/x-sh',
  'application/x-bat',
  'application/x-executable',
  'application/vnd.microsoft.portable-executable',
  'application/x-msi',
]);

function extensionOf(filename) {
  return path.extname(String(filename || '')).replace(/^\./, '').toLowerCase();
}

function tooLargeError(size, max) {
  const err = new Error(
    `Pièce jointe trop volumineuse (${size} octets) : la limite est de ${max} octets.`,
  );
  err.statusCode = 413;
  err.code = 'ATTACHMENT_TOO_LARGE';
  err.addBytes = size;
  err.quotaBytes = max;
  return err;
}

function blockedTypeError(filename, mime) {
  const err = new Error(
    `Type de fichier non autorisé (${extensionOf(filename) || mime || 'inconnu'}) : les exécutables et scripts sont refusés.`,
  );
  err.statusCode = 415;
  err.code = 'ATTACHMENT_TYPE_BLOCKED';
  return err;
}

/**
 * Vérifie la taille seule. `size` peut venir d'une métadonnée (avant décodage)
 * ou de buffer.length (autoritatif). Lève une erreur 413 si dépassement.
 */
function assertAttachmentSize(size, { maxBytes } = {}) {
  const max = maxBytes || maxAttachmentBytes();
  if (Number.isFinite(Number(size)) && Number(size) > max) {
    throw tooLargeError(Number(size), max);
  }
}

/**
 * Vérifie type ET taille. Lève 415 (type) ou 413 (taille).
 * @param {{filename?:string, mime?:string, size?:number}} attachment
 */
function assertAttachmentAllowed(attachment = {}, { maxBytes } = {}) {
  const { filename, mime, size } = attachment;
  assertAttachmentSize(size, { maxBytes });
  const ext = extensionOf(filename);
  if (ext && BLOCKED_EXTENSIONS.has(ext)) throw blockedTypeError(filename, mime);
  if (mime && BLOCKED_MIME.has(String(mime).toLowerCase())) throw blockedTypeError(filename, mime);
}

module.exports = {
  DEFAULT_MAX_BYTES,
  BLOCKED_EXTENSIONS,
  BLOCKED_MIME,
  maxAttachmentBytes,
  extensionOf,
  assertAttachmentSize,
  assertAttachmentAllowed,
};
