const zlib = require('zlib');

const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const MAX_ENTRY_NAME_BYTES = 1024;

const MAX_DOCX_ENTRIES = 2048;
const MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_DOCX_METADATA_BYTES = 2 * 1024 * 1024;

const REQUIRED_PARTS = Object.freeze([
  '[Content_Types].xml',
  '_rels/.rels',
  'word/document.xml',
]);

const WORD_MAIN_CONTENT_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml',
  'application/vnd.ms-word.document.macroEnabled.main+xml',
  'application/vnd.ms-word.template.macroEnabledTemplate.main+xml',
]);

function opcSecurityError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function invalidPackage() {
  return opcSecurityError(
    'Le fichier n’est pas un document DOCX valide.',
    'INVALID_DOCX',
    415,
  );
}

function unsafePackage() {
  return opcSecurityError(
    'La structure de ce document DOCX ne peut pas être traitée en sécurité.',
    'UNSAFE_DOCX_PACKAGE',
    415,
  );
}

function tooManyEntries() {
  return opcSecurityError(
    'Ce document DOCX contient trop d’éléments pour être traité en sécurité.',
    'DOCX_PACKAGE_TOO_COMPLEX',
    413,
  );
}

function expandedContentTooLarge() {
  return opcSecurityError(
    'Le contenu décompressé de ce document DOCX dépasse la limite de sécurité.',
    'DOCX_EXPANDED_TOO_LARGE',
    413,
  );
}

function positiveLimit(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readUInt16(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset + 2 > buffer.length) throw invalidPackage();
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer, offset) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset + 4 > buffer.length) throw invalidPackage();
  return buffer.readUInt32LE(offset);
}

function findEndOfCentralDirectory(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw invalidPackage();
  const minimum = Math.max(0, buffer.length - 22 - MAX_ZIP_COMMENT_BYTES);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (readUInt32(buffer, offset) !== END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = readUInt16(buffer, offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  throw invalidPackage();
}

function decodeEntryName(bytes, utf8) {
  // Les noms de parties OPC sont normalement ASCII ou UTF-8. Refuser les noms
  // ambigus est préférable à laisser deux parseurs ZIP les normaliser différemment.
  if (!utf8 && [...bytes].some((value) => value >= 0x80)) throw unsafePackage();
  const name = bytes.toString('utf8');
  if (!name || name.includes('\ufffd') || Buffer.byteLength(name, 'utf8') !== bytes.length) throw unsafePackage();
  return name;
}

function normalizeEntryName(name) {
  const value = String(name || '');
  if (!value
    || value.length > MAX_ENTRY_NAME_BYTES
    || /[\u0000-\u001f\u007f\\]/.test(value)
    || value.startsWith('/')
    || /^[a-z]:/i.test(value)) {
    throw unsafePackage();
  }
  const directory = value.endsWith('/');
  const segments = value.split('/');
  if (directory) segments.pop();
  if (!segments.length || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw unsafePackage();
  }
  return `${segments.join('/')}${directory ? '/' : ''}`;
}

function parseCentralDirectory(buffer, options = {}) {
  const maxEntries = positiveLimit(options.maxEntries, MAX_DOCX_ENTRIES);
  const maxEntryBytes = positiveLimit(
    options.maxEntryUncompressedBytes,
    MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES,
  );
  const maxTotalBytes = positiveLimit(
    options.maxTotalUncompressedBytes,
    MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES,
  );
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const diskNumber = readUInt16(buffer, eocdOffset + 4);
  const centralDiskNumber = readUInt16(buffer, eocdOffset + 6);
  const entriesOnDisk = readUInt16(buffer, eocdOffset + 8);
  const entryCount = readUInt16(buffer, eocdOffset + 10);
  const centralSize = readUInt32(buffer, eocdOffset + 12);
  const centralOffset = readUInt32(buffer, eocdOffset + 16);

  // ZIP64 et les archives multi-volumes ne sont pas nécessaires pour un DOCX
  // borné à quelques mégaoctets. Les refuser supprime plusieurs ambiguïtés.
  if (diskNumber !== 0 || centralDiskNumber !== 0 || entriesOnDisk !== entryCount
    || entryCount === 0 || entryCount === 0xffff
    || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw invalidPackage();
  }
  if (entryCount > maxEntries) throw tooManyEntries();
  if (centralOffset > eocdOffset || centralSize > eocdOffset - centralOffset) throw invalidPackage();

  const centralEnd = centralOffset + centralSize;
  const entries = [];
  const names = new Set();
  let cursor = centralOffset;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUInt32(buffer, cursor) !== CENTRAL_DIRECTORY_SIGNATURE) throw invalidPackage();
    const flags = readUInt16(buffer, cursor + 8);
    const compressionMethod = readUInt16(buffer, cursor + 10);
    const compressedSize = readUInt32(buffer, cursor + 20);
    const uncompressedSize = readUInt32(buffer, cursor + 24);
    const nameLength = readUInt16(buffer, cursor + 28);
    const extraLength = readUInt16(buffer, cursor + 30);
    const commentLength = readUInt16(buffer, cursor + 32);
    const startDisk = readUInt16(buffer, cursor + 34);
    const externalAttributes = readUInt32(buffer, cursor + 38);
    const localHeaderOffset = readUInt32(buffer, cursor + 42);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;

    if (!nameLength || nameLength > MAX_ENTRY_NAME_BYTES || recordEnd > centralEnd
      || startDisk !== 0 || compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw invalidPackage();
    }
    if (flags & 0x0001 || flags & 0x0040) throw unsafePackage();
    if (![0, 8].includes(compressionMethod)) throw unsafePackage();

    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = normalizeEntryName(decodeEntryName(nameBytes, Boolean(flags & 0x0800)));
    const comparisonName = name.toLocaleLowerCase('en-US');
    if (names.has(comparisonName)) throw unsafePackage();
    names.add(comparisonName);

    const unixMode = (externalAttributes >>> 16) & 0xf000;
    if (unixMode === 0xa000) throw unsafePackage();
    if (uncompressedSize > maxEntryBytes) throw expandedContentTooLarge();
    totalUncompressedBytes += uncompressedSize;
    if (!Number.isSafeInteger(totalUncompressedBytes) || totalUncompressedBytes > maxTotalBytes) {
      throw expandedContentTooLarge();
    }

    entries.push({
      name,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      dataStart: null,
      dataEnd: null,
    });
    cursor = recordEnd;
  }
  if (cursor !== centralEnd) throw invalidPackage();

  for (const entry of entries) {
    const offset = entry.localHeaderOffset;
    if (offset >= centralOffset || readUInt32(buffer, offset) !== LOCAL_FILE_HEADER_SIGNATURE) {
      throw invalidPackage();
    }
    const localFlags = readUInt16(buffer, offset + 6);
    const localMethod = readUInt16(buffer, offset + 8);
    const localNameLength = readUInt16(buffer, offset + 26);
    const localExtraLength = readUInt16(buffer, offset + 28);
    const localHeaderEnd = offset + 30 + localNameLength + localExtraLength;
    if (!localNameLength || localNameLength > MAX_ENTRY_NAME_BYTES || localHeaderEnd > centralOffset
      || localFlags !== entry.flags || localMethod !== entry.compressionMethod) {
      throw invalidPackage();
    }
    const localName = normalizeEntryName(decodeEntryName(
      buffer.subarray(offset + 30, offset + 30 + localNameLength),
      Boolean(localFlags & 0x0800),
    ));
    if (localName !== entry.name) throw unsafePackage();
    entry.dataStart = localHeaderEnd;
    entry.dataEnd = localHeaderEnd + entry.compressedSize;
    if (entry.dataEnd > centralOffset) throw invalidPackage();
    if (entry.compressionMethod === 0 && entry.compressedSize !== entry.uncompressedSize) {
      throw invalidPackage();
    }
  }

  const ranges = entries
    .map((entry) => [entry.localHeaderOffset, entry.dataEnd])
    .sort((left, right) => left[0] - right[0]);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index][0] < ranges[index - 1][1]) throw unsafePackage();
  }
  return { entries, totalUncompressedBytes };
}

function inflateEntry(buffer, entry, maximumBytes = MAX_DOCX_METADATA_BYTES) {
  const limit = positiveLimit(maximumBytes, MAX_DOCX_METADATA_BYTES);
  if (!entry || entry.uncompressedSize > limit) throw expandedContentTooLarge();
  const compressed = buffer.subarray(entry.dataStart, entry.dataEnd);
  try {
    const result = entry.compressionMethod === 0
      ? Buffer.from(compressed)
      : zlib.inflateRawSync(compressed, { maxOutputLength: limit });
    if (result.length !== entry.uncompressedSize || result.length > limit) throw invalidPackage();
    return result;
  } catch (error) {
    if (error?.code === 'DOCX_EXPANDED_TOO_LARGE') throw error;
    if (error?.code === 'INVALID_DOCX') throw error;
    throw invalidPackage();
  }
}

function xmlAttribute(tag, name) {
  const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (String(tag || '').match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*["']([^"']*)["']`, 'i')) || [])[1] || '';
}

function assertExpectedOpcTypes(buffer, entries, options = {}) {
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  if (REQUIRED_PARTS.some((name) => !byName.has(name))) throw invalidPackage();

  const metadataLimit = positiveLimit(options.maxMetadataBytes, MAX_DOCX_METADATA_BYTES);
  const contentTypes = inflateEntry(buffer, byName.get('[Content_Types].xml'), metadataLimit).toString('utf8');
  const contentTypeTags = contentTypes.match(/<(?:[a-z0-9_-]+:)?Override\b[^>]*\/?>/gi) || [];
  const documentOverride = contentTypeTags.find((tag) => xmlAttribute(tag, 'PartName') === '/word/document.xml');
  if (!documentOverride || !WORD_MAIN_CONTENT_TYPES.has(xmlAttribute(documentOverride, 'ContentType'))) {
    throw invalidPackage();
  }

  const rootRelationships = inflateEntry(buffer, byName.get('_rels/.rels'), metadataLimit).toString('utf8');
  const relationshipTags = rootRelationships.match(/<(?:[a-z0-9_-]+:)?Relationship\b[^>]*\/?>/gi) || [];
  const officeRelationship = relationshipTags.find((tag) => /\/officeDocument$/i.test(xmlAttribute(tag, 'Type')));
  const target = xmlAttribute(officeRelationship, 'Target').replace(/^\.?\//, '');
  if (target !== 'word/document.xml') throw invalidPackage();
}

function assertSafeDocxPackage(buffer, options = {}) {
  try {
    const parsed = parseCentralDirectory(buffer, options);
    assertExpectedOpcTypes(buffer, parsed.entries, options);
    return {
      entryCount: parsed.entries.length,
      totalUncompressedBytes: parsed.totalUncompressedBytes,
    };
  } catch (error) {
    if (error?.code && [
      'INVALID_DOCX',
      'UNSAFE_DOCX_PACKAGE',
      'DOCX_PACKAGE_TOO_COMPLEX',
      'DOCX_EXPANDED_TOO_LARGE',
    ].includes(error.code)) {
      throw error;
    }
    throw invalidPackage();
  }
}

module.exports = {
  MAX_DOCX_ENTRIES,
  MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES,
  MAX_DOCX_METADATA_BYTES,
  MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES,
  assertSafeDocxPackage,
};
