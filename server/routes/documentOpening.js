// Preferences et disponibilite des modes d'ouverture documentaires.
//
// Ce routeur ne lance aucun editeur : il expose uniquement un contrat fiable au
// client. En particulier, le compagnon Word vit sur l'ordinateur de
// l'utilisateur et ne peut donc pas etre sonde depuis Cloud Run.

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const sanitizeFilename = require('sanitize-filename');
const { TextDecoder } = require('util');
const auth = require('../middlewares/middleware-auth');
const requireTenant = require('../middlewares/requireTenant');
const User = require('../models/App_Users/User');
const Tenant = require('../models/Cabinet/Tenant');
const Membership = require('../models/Cabinet/Membership');
const Dossier = require('../models/Folder/Dossier');
const { ensureDocOwnership } = require('../utils/ownershipHelpers');
const { getStorageProviderConfig } = require('../services/storage');
const googleDriveClient = require('../services/storage/googleDriveClient');
const oneDriveClient = require('../services/storage/oneDriveClient');
const { resolveDocumentContent } = require('../services/documentContentService');
const { analyzeDocx, isDocxBuffer } = require('../services/documentCompatibilityService');

const router = express.Router();

const OPENING_MODES = Object.freeze([
  'automatic',
  'ask',
  'kheops',
  'word_desktop',
  'word_web',
  'google_docs',
]);
const EDITOR_MODES = Object.freeze([
  'kheops',
  'word_desktop',
  'word_web',
  'google_docs',
]);
const BROWSER_PREVIEW_MODE = 'browser_preview';
const TEXT_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
const PDF_MIME = 'application/pdf';
const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');
const SAFE_RASTER_FORMATS = Object.freeze({
  png: Object.freeze({
    mime: 'image/png',
    extensions: Object.freeze(['.png']),
    signature: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  }),
  jpeg: Object.freeze({
    mime: 'image/jpeg',
    extensions: Object.freeze(['.jpg', '.jpeg']),
    signature: Buffer.from([0xff, 0xd8, 0xff]),
  }),
  gif: Object.freeze({
    mime: 'image/gif',
    extensions: Object.freeze(['.gif']),
    signatures: Object.freeze([Buffer.from('GIF87a', 'ascii'), Buffer.from('GIF89a', 'ascii')]),
  }),
  webp: Object.freeze({
    mime: 'image/webp',
    extensions: Object.freeze(['.webp']),
  }),
});
const UNSAFE_BROWSER_IMAGE_EXTENSIONS = Object.freeze(['.svg', '.svgz', '.html', '.htm', '.xhtml']);
const UNSAFE_BROWSER_IMAGE_MIMES = Object.freeze(['image/svg+xml', 'text/html', 'application/xhtml+xml']);
const STORAGE_PROVIDERS = Object.freeze([
  'managed_gcs',
  'google_drive',
  'onedrive',
  'sharepoint',
]);

function defaultPreference() {
  return {
    mode: 'ask',
    rememberChoice: false,
    lastUsedMode: null,
    externalTransferConsents: {
      googleDrive: false,
      oneDrive: false,
    },
    updatedAt: null,
    configured: false,
  };
}

function toClientPreference(raw) {
  if (!raw) return defaultPreference();
  const plain = typeof raw.toObject === 'function' ? raw.toObject() : raw;
  const mode = OPENING_MODES.includes(plain.mode) ? plain.mode : 'ask';
  const lastUsedMode = EDITOR_MODES.includes(plain.lastUsedMode)
    ? plain.lastUsedMode
    : null;
  return {
    mode,
    rememberChoice: plain.rememberChoice === true,
    lastUsedMode,
    externalTransferConsents: {
      googleDrive: plain.externalTransferConsents?.googleDrive === true,
      oneDrive: plain.externalTransferConsents?.oneDrive === true,
    },
    updatedAt: plain.updatedAt || null,
    // Les valeurs par defaut du schema ne signifient pas qu'un choix a deja
    // ete fait. `updatedAt` n'est pose que par l'endpoint PUT.
    configured: Boolean(plain.updatedAt),
  };
}

function inputError(field, message, code = 'INVALID_DOCUMENT_OPENING_PREFERENCE') {
  const err = new Error(message);
  err.statusCode = 400;
  err.code = code;
  err.field = field;
  return err;
}

function buildPreferenceUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw inputError('body', 'Une preference doit etre fournie.');
  }

  const set = {};
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(body, 'mode')) {
    if (!OPENING_MODES.includes(body.mode)) {
      throw inputError('mode', `Mode invalide. Valeurs acceptees : ${OPENING_MODES.join(', ')}.`);
    }
    set['documentOpening.mode'] = body.mode;
    // PUT /preferences est une memorisation. Si le client ne precise pas la
    // case a cocher, un mode concret/automatique devient durable par defaut.
    if (!Object.prototype.hasOwnProperty.call(body, 'rememberChoice')) {
      set['documentOpening.rememberChoice'] = body.mode !== 'ask';
    }
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'rememberChoice')) {
    if (typeof body.rememberChoice !== 'boolean') {
      throw inputError('rememberChoice', 'rememberChoice doit etre un booleen.');
    }
    set['documentOpening.rememberChoice'] = body.rememberChoice;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'lastUsedMode')) {
    if (body.lastUsedMode !== null && !EDITOR_MODES.includes(body.lastUsedMode)) {
      throw inputError('lastUsedMode', 'lastUsedMode doit designer un editeur disponible.');
    }
    set['documentOpening.lastUsedMode'] = body.lastUsedMode;
    changed = true;
  }

  const consentInput = body.externalTransferConsents || body.consents;
  if (consentInput !== undefined) {
    if (!consentInput || typeof consentInput !== 'object' || Array.isArray(consentInput)) {
      throw inputError('externalTransferConsents', 'Les consentements doivent etre un objet.');
    }
    for (const provider of ['googleDrive', 'oneDrive']) {
      if (!Object.prototype.hasOwnProperty.call(consentInput, provider)) continue;
      if (typeof consentInput[provider] !== 'boolean') {
        throw inputError(
          `externalTransferConsents.${provider}`,
          `Le consentement ${provider} doit etre un booleen.`,
        );
      }
      set[`documentOpening.externalTransferConsents.${provider}`] = consentInput[provider];
      changed = true;
    }
  }

  if (!changed) {
    throw inputError('body', 'Aucun champ de preference reconnu.');
  }

  set['documentOpening.updatedAt'] = new Date();
  return set;
}

function defaultPolicy() {
  return {
    allowPersonalClouds: true,
    requireProfessionalMicrosoftAccount: false,
    allowedProviders: [...STORAGE_PROVIDERS],
    forceMethod: null,
    allowGoogleConversion: false,
    requireKheopsVersion: true,
    deleteExternalCopyAfterSync: false,
    updatedAt: null,
  };
}

function toClientPolicy(raw) {
  if (!raw) return defaultPolicy();
  const plain = typeof raw.toObject === 'function' ? raw.toObject() : raw;
  const allowedProviders = Array.isArray(plain.allowedProviders)
    ? [...new Set(plain.allowedProviders.filter((value) => STORAGE_PROVIDERS.includes(value)))]
    : [...STORAGE_PROVIDERS];
  return {
    allowPersonalClouds: plain.allowPersonalClouds !== false,
    requireProfessionalMicrosoftAccount: plain.requireProfessionalMicrosoftAccount === true,
    allowedProviders,
    forceMethod: EDITOR_MODES.includes(plain.forceMethod) ? plain.forceMethod : null,
    allowGoogleConversion: plain.allowGoogleConversion === true,
    requireKheopsVersion: plain.requireKheopsVersion !== false,
    deleteExternalCopyAfterSync: plain.deleteExternalCopyAfterSync === true,
    updatedAt: plain.updatedAt || null,
  };
}

function buildPolicyUpdate(body, userId) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw inputError('body', 'Une politique documentaire doit etre fournie.', 'INVALID_DOCUMENT_POLICY');
  }
  const set = {};
  let changed = false;

  for (const field of [
    'allowPersonalClouds',
    'requireProfessionalMicrosoftAccount',
    'allowGoogleConversion',
    'requireKheopsVersion',
    'deleteExternalCopyAfterSync',
  ]) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    if (typeof body[field] !== 'boolean') {
      throw inputError(field, `${field} doit etre un booleen.`, 'INVALID_DOCUMENT_POLICY');
    }
    set[`documentPolicy.${field}`] = body[field];
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'allowedProviders')) {
    if (!Array.isArray(body.allowedProviders)) {
      throw inputError(
        'allowedProviders',
        'allowedProviders doit etre une liste.',
        'INVALID_DOCUMENT_POLICY',
      );
    }
    const values = [...new Set(body.allowedProviders)];
    if (values.some((value) => !STORAGE_PROVIDERS.includes(value))) {
      throw inputError(
        'allowedProviders',
        `Fournisseurs acceptes : ${STORAGE_PROVIDERS.join(', ')}.`,
        'INVALID_DOCUMENT_POLICY',
      );
    }
    set['documentPolicy.allowedProviders'] = values;
    changed = true;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'forceMethod')) {
    if (body.forceMethod !== null && !EDITOR_MODES.includes(body.forceMethod)) {
      throw inputError(
        'forceMethod',
        `Methode forcee invalide. Valeurs acceptees : ${EDITOR_MODES.join(', ')} ou null.`,
        'INVALID_DOCUMENT_POLICY',
      );
    }
    set['documentPolicy.forceMethod'] = body.forceMethod;
    changed = true;
  }

  if (!changed) {
    throw inputError('body', 'Aucun champ de politique reconnu.', 'INVALID_DOCUMENT_POLICY');
  }
  set['documentPolicy.updatedAt'] = new Date();
  set['documentPolicy.updatedBy'] = userId;
  return set;
}

async function canAdministerPolicy(userId, tenant) {
  if (!tenant) return false;
  if (String(tenant.ownerUserId) === String(userId)) return true;
  const admin = await Membership.findOne({
    tenantId: tenant._id,
    userId,
    role: 'admin',
    status: 'active',
  }).select('_id').lean();
  return Boolean(admin);
}

function routeError(res, err) {
  const status = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
  return res.status(status).json({
    error: err.code || (status === 400 ? 'INVALID_DOCUMENT_OPENING_PREFERENCE' : 'DOCUMENT_OPENING_ERROR'),
    message: status >= 500 ? "Impossible de charger les methodes d'ouverture." : err.message,
    ...(err.field ? { field: err.field } : {}),
  });
}

function userQuery(userId, fields) {
  return User.findById(userId).select(fields).lean();
}

function tenantQuery(tenantId, fields) {
  return Tenant.findById(tenantId).select(fields).lean();
}

router.get('/preferences', auth, async (req, res) => {
  try {
    const user = await userQuery(req.user, 'documentOpening');
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });
    }
    return res.json({ preference: toClientPreference(user.documentOpening) });
  } catch (err) {
    return routeError(res, err);
  }
});

router.put('/preferences', auth, async (req, res) => {
  try {
    const set = buildPreferenceUpdate(req.body);
    const user = await User.findByIdAndUpdate(
      req.user,
      { $set: set },
      { new: true, runValidators: true },
    ).select('documentOpening').lean();

    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });
    }
    return res.json({ preference: toClientPreference(user.documentOpening) });
  } catch (err) {
    return routeError(res, err);
  }
});

router.delete('/preferences', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user,
      { $unset: { documentOpening: 1 } },
      { new: true },
    ).select('_id').lean();

    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });
    }
    return res.json({ ok: true, preference: defaultPreference() });
  } catch (err) {
    return routeError(res, err);
  }
});

// Politique commune au cabinet. Tout membre peut la consulter afin que le
// client explique les options indisponibles ; seul le proprietaire ou un
// Membership admin actif peut la modifier.
router.get('/policy', auth, requireTenant, async (req, res) => {
  try {
    const tenant = await tenantQuery(req.tenantId, '_id ownerUserId documentPolicy');
    if (!tenant) {
      return res.status(404).json({ error: 'TENANT_NOT_FOUND', message: 'Cabinet introuvable.' });
    }
    return res.json({
      policy: toClientPolicy(tenant.documentPolicy),
      canManage: await canAdministerPolicy(req.user, tenant),
    });
  } catch (err) {
    return routeError(res, err);
  }
});

router.put('/policy', auth, requireTenant, async (req, res) => {
  try {
    const tenant = await tenantQuery(req.tenantId, '_id ownerUserId');
    if (!tenant) {
      return res.status(404).json({ error: 'TENANT_NOT_FOUND', message: 'Cabinet introuvable.' });
    }
    if (!(await canAdministerPolicy(req.user, tenant))) {
      return res.status(403).json({
        error: 'DOCUMENT_POLICY_FORBIDDEN',
        message: 'Seul le proprietaire ou un administrateur du cabinet peut modifier cette politique.',
      });
    }

    const set = buildPolicyUpdate(req.body, req.user);
    const updated = await Tenant.findByIdAndUpdate(
      req.tenantId,
      { $set: set },
      { new: true, runValidators: true },
    ).select('documentPolicy').lean();
    return res.json({ policy: toClientPolicy(updated?.documentPolicy), canManage: true });
  } catch (err) {
    return routeError(res, err);
  }
});

function embeddedDocument(dossier, documentId) {
  const documents = dossier?.dossier?.documents;
  if (!Array.isArray(documents)) return null;
  return documents.find((document) => String(document._id) === String(documentId)) || null;
}

async function accessibleDocument(req, res) {
  const access = await ensureDocOwnership(req, res, req.params.docId);
  if (!access?.ok) return null;
  return {
    dossierId: access.dossierId,
    tenantId: access.tenantId || req.tenantId,
    documentId: new mongoose.Types.ObjectId(String(req.params.docId)),
  };
}

function normalizedMime(value) {
  return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function isPlainTextFormat(filename, mimeType) {
  return /\.txt$/i.test(String(filename || '').trim())
    || normalizedMime(mimeType) === 'text/plain';
}

function isPdfFormat(filename, mimeType) {
  return /\.pdf$/i.test(String(filename || '').trim())
    || normalizedMime(mimeType) === PDF_MIME;
}

function hasPdfSignature(buffer) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= PDF_SIGNATURE.length
    && buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
}

function safePdfFilename(value, fallback) {
  const basename = path.basename(String(value || ''));
  const sanitized = sanitizeFilename(basename).replace(/[\r\n]/g, '').trim();
  const safeBase = sanitized || fallback;
  return /\.pdf$/i.test(safeBase) ? safeBase : `${safeBase}.pdf`;
}

function bufferStartsWith(buffer, signature) {
  return Buffer.isBuffer(buffer)
    && buffer.length >= signature.length
    && buffer.subarray(0, signature.length).equals(signature);
}

function rasterFormatFromExtension(filename) {
  const extension = path.extname(String(filename || '').trim()).toLowerCase();
  return Object.entries(SAFE_RASTER_FORMATS)
    .find(([, format]) => format.extensions.includes(extension))?.[0] || null;
}

function rasterFormatFromMime(mimeType) {
  const mime = normalizedMime(mimeType);
  return Object.entries(SAFE_RASTER_FORMATS)
    .find(([, format]) => format.mime === mime)?.[0] || null;
}

function rasterFormatFromSignature(buffer) {
  if (bufferStartsWith(buffer, SAFE_RASTER_FORMATS.png.signature)) return 'png';
  if (bufferStartsWith(buffer, SAFE_RASTER_FORMATS.jpeg.signature)) return 'jpeg';
  if (SAFE_RASTER_FORMATS.gif.signatures.some((signature) => bufferStartsWith(buffer, signature))) return 'gif';
  if (Buffer.isBuffer(buffer)
      && buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

function inspectSafeRasterImage(filename, mimeType, buffer) {
  const extension = path.extname(String(filename || '').trim()).toLowerCase();
  const mime = normalizedMime(mimeType);
  if (UNSAFE_BROWSER_IMAGE_EXTENSIONS.includes(extension)
      || UNSAFE_BROWSER_IMAGE_MIMES.includes(mime)) {
    return { error: 'IMAGE_PREVIEW_UNSAFE_FORMAT' };
  }
  const extensionFormat = rasterFormatFromExtension(filename);
  const mimeFormat = rasterFormatFromMime(mimeType);
  if (!extensionFormat && !mimeFormat) return { error: 'IMAGE_PREVIEW_UNSUPPORTED_FORMAT' };
  if (extensionFormat && mimeFormat && extensionFormat !== mimeFormat) {
    return { error: 'IMAGE_PREVIEW_METADATA_MISMATCH' };
  }
  const declaredFormat = extensionFormat || mimeFormat;
  const actualFormat = rasterFormatFromSignature(buffer);
  if (!actualFormat || actualFormat !== declaredFormat) {
    return { error: 'IMAGE_PREVIEW_INVALID_CONTENT' };
  }
  return { format: actualFormat, ...SAFE_RASTER_FORMATS[actualFormat] };
}

function safeRasterFilename(value, fallback, format) {
  const basename = path.basename(String(value || ''));
  const sanitized = sanitizeFilename(basename).replace(/[\r\n]/g, '').trim();
  const safeBase = sanitized || fallback;
  if (format.extensions.some((extension) => safeBase.toLowerCase().endsWith(extension))) return safeBase;
  const parsed = path.parse(safeBase);
  return `${parsed.name || 'image'}${format.extensions[0]}`;
}

// Lecture seule authentifiee des fichiers texte. Le contenu est renvoye comme
// texte brut (jamais comme HTML) apres le meme controle d'appartenance que les
// preferences documentaires. Ce mode n'est volontairement pas une preference.
router.get('/documents/:docId/text-preview', auth, requireTenant, async (req, res) => {
  try {
    const access = await accessibleDocument(req, res);
    if (!access) return undefined;
    const dossier = await Dossier.findOne({
      _id: access.dossierId,
      'dossier.documents._id': access.documentId,
    }).select('dossier.documents').lean();
    const document = embeddedDocument(dossier, access.documentId);
    if (!document) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable.' });
    }

    const content = await resolveDocumentContent({
      tenantId: access.tenantId,
      dossierId: access.dossierId,
      documentId: String(access.documentId),
      fallbackFilename: document.nomDocument,
    });
    if (!content?.buffer) {
      return res.status(404).json({ error: 'DOCUMENT_CONTENT_NOT_FOUND', message: 'Contenu du document introuvable.' });
    }
    const filename = content.filename || document.nomDocument || `${access.documentId}.txt`;
    if (!isPlainTextFormat(filename, content.mime)) {
      return res.status(415).json({
        error: 'TEXT_PREVIEW_UNSUPPORTED_FORMAT',
        message: 'La lecture interne est reservee aux fichiers texte .txt.',
      });
    }
    if (content.buffer.length > TEXT_PREVIEW_MAX_BYTES) {
      return res.status(413).json({
        error: 'TEXT_PREVIEW_TOO_LARGE',
        message: 'Ce fichier texte depasse la limite de lecture interne de 5 Mo. Telechargez-le pour le consulter.',
      });
    }
    if (content.buffer.includes(0)) {
      return res.status(415).json({
        error: 'TEXT_PREVIEW_BINARY_CONTENT',
        message: "Ce fichier contient des donnees binaires et ne peut pas etre affiche comme du texte.",
      });
    }

    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(content.buffer);
    } catch (_error) {
      return res.status(415).json({
        error: 'TEXT_PREVIEW_ENCODING_UNSUPPORTED',
        message: "L'encodage de ce fichier texte n'est pas pris en charge. Utilisez un fichier UTF-8.",
      });
    }

    const responseBuffer = Buffer.from(text, 'utf8');
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': String(responseBuffer.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'X-Document-Read-Only': 'true',
    });
    return res.status(200).send(responseBuffer);
  } catch (err) {
    return routeError(res, err);
  }
});

// Consultation PDF authentifiee dans le lecteur natif du navigateur. La route
// ne publie aucune URL de stockage : elle lit la version autorisee, valide sa
// signature avant de forcer un MIME PDF et la sert uniquement en inline.
router.get('/documents/:docId/pdf-preview', auth, requireTenant, async (req, res) => {
  try {
    const access = await accessibleDocument(req, res);
    if (!access) return undefined;
    const dossier = await Dossier.findOne({
      _id: access.dossierId,
      'dossier.documents._id': access.documentId,
    }).select('dossier.documents').lean();
    const document = embeddedDocument(dossier, access.documentId);
    if (!document) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable.' });
    }

    const content = await resolveDocumentContent({
      tenantId: access.tenantId,
      dossierId: access.dossierId,
      documentId: String(access.documentId),
      fallbackFilename: document.nomDocument,
    });
    if (!content?.buffer) {
      return res.status(404).json({ error: 'DOCUMENT_CONTENT_NOT_FOUND', message: 'Contenu du document introuvable.' });
    }
    const filename = content.filename || document.nomDocument || `${access.documentId}.pdf`;
    if (!isPdfFormat(filename, content.mime)) {
      return res.status(415).json({
        error: 'PDF_PREVIEW_UNSUPPORTED_FORMAT',
        message: 'La consultation directe est reservee aux fichiers PDF.',
      });
    }
    if (!hasPdfSignature(content.buffer)) {
      return res.status(415).json({
        error: 'PDF_PREVIEW_INVALID_CONTENT',
        message: "Ce fichier ne contient pas un document PDF valide et ne peut pas etre ouvert dans le navigateur.",
      });
    }

    const responseFilename = safePdfFilename(filename, `${access.documentId}.pdf`);
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': PDF_MIME,
      'Content-Length': String(content.buffer.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(responseFilename)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    return res.status(200).send(content.buffer);
  } catch (err) {
    return routeError(res, err);
  }
});

// Consultation directe des seules images raster dont le navigateur peut
// assurer un rendu passif. SVG et HTML sont toujours refuses car ils peuvent
// contenir du code actif ; les quatre formats acceptes sont controles par leur
// extension/MIME puis par leurs octets magiques avant de forcer le MIME final.
router.get('/documents/:docId/image-preview', auth, requireTenant, async (req, res) => {
  try {
    const access = await accessibleDocument(req, res);
    if (!access) return undefined;
    const dossier = await Dossier.findOne({
      _id: access.dossierId,
      'dossier.documents._id': access.documentId,
    }).select('dossier.documents').lean();
    const document = embeddedDocument(dossier, access.documentId);
    if (!document) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable.' });
    }

    const content = await resolveDocumentContent({
      tenantId: access.tenantId,
      dossierId: access.dossierId,
      documentId: String(access.documentId),
      fallbackFilename: document.nomDocument,
    });
    if (!content?.buffer) {
      return res.status(404).json({ error: 'DOCUMENT_CONTENT_NOT_FOUND', message: 'Contenu du document introuvable.' });
    }
    const filename = content.filename || document.nomDocument || `${access.documentId}.img`;
    const inspection = inspectSafeRasterImage(filename, content.mime, content.buffer);
    if (!inspection.format) {
      const messages = {
        IMAGE_PREVIEW_UNSAFE_FORMAT: 'Les contenus SVG et HTML ne peuvent pas etre ouverts directement pour des raisons de securite.',
        IMAGE_PREVIEW_UNSUPPORTED_FORMAT: 'Ce format d’image ne peut pas etre ouvert directement dans le navigateur.',
        IMAGE_PREVIEW_METADATA_MISMATCH: "L'extension et le type de cette image sont incoherents.",
        IMAGE_PREVIEW_INVALID_CONTENT: "Le contenu de ce fichier ne correspond pas a une image raster valide.",
      };
      return res.status(415).json({
        error: inspection.error,
        message: messages[inspection.error],
      });
    }

    const responseFilename = safeRasterFilename(
      filename,
      `${access.documentId}${inspection.extensions[0]}`,
      inspection,
    );
    res.set({
      'Cache-Control': 'private, no-store',
      'Content-Type': inspection.mime,
      'Content-Length': String(content.buffer.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(responseFilename)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    return res.status(200).send(content.buffer);
  } catch (err) {
    return routeError(res, err);
  }
});

// Preference propre a un document. Elle ne modifie jamais la preference
// generale et reste soumise a une eventuelle methode forcee par le cabinet.
router.get('/documents/:docId', auth, async (req, res) => {
  try {
    const access = await accessibleDocument(req, res);
    if (!access) return undefined;
    const dossier = await Dossier.findOne({
      _id: access.dossierId,
      'dossier.documents._id': access.documentId,
    }).select('dossier.documents').lean();
    const document = embeddedDocument(dossier, access.documentId);
    if (!document) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable.' });
    }
    const openingMode = OPENING_MODES.includes(document.openingMode) ? document.openingMode : null;
    return res.json({
      documentId: String(access.documentId),
      openingMode,
      configured: openingMode !== null,
    });
  } catch (err) {
    return routeError(res, err);
  }
});

router.put('/documents/:docId', auth, async (req, res) => {
  try {
    const openingMode = req.body?.openingMode ?? req.body?.mode;
    if (!OPENING_MODES.includes(openingMode)) {
      throw inputError(
        'openingMode',
        `Mode invalide. Valeurs acceptees : ${OPENING_MODES.join(', ')}.`,
        'INVALID_DOCUMENT_OPENING_MODE',
      );
    }
    const access = await accessibleDocument(req, res);
    if (!access) return undefined;
    const dossier = await Dossier.findOneAndUpdate(
      { _id: access.dossierId, 'dossier.documents._id': access.documentId },
      { $set: { 'dossier.documents.$.openingMode': openingMode } },
      { new: true, runValidators: true },
    ).select('dossier.documents').lean();
    if (!dossier) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable.' });
    }
    return res.json({ documentId: String(access.documentId), openingMode, configured: true });
  } catch (err) {
    return routeError(res, err);
  }
});

router.delete('/documents/:docId', auth, async (req, res) => {
  try {
    const access = await accessibleDocument(req, res);
    if (!access) return undefined;
    const dossier = await Dossier.findOneAndUpdate(
      { _id: access.dossierId, 'dossier.documents._id': access.documentId },
      { $unset: { 'dossier.documents.$.openingMode': 1 } },
      { new: true },
    ).select('_id').lean();
    if (!dossier) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable.' });
    }
    return res.json({
      ok: true,
      documentId: String(access.documentId),
      openingMode: null,
      configured: false,
    });
  } catch (err) {
    return routeError(res, err);
  }
});

async function safeConnectionProbe(configured, probe, userId) {
  if (!configured) return false;
  try {
    return (await probe(userId)) === true;
  } catch (_) {
    return false;
  }
}

function methodAvailability(available, reason, extras = {}) {
  return {
    available,
    reason: reason || null,
    ...extras,
  };
}

function compatibilityLabel(level) {
  if (level === 'complete') return 'Compatibilité complète';
  if (level === 'partial') return 'Compatibilité partielle';
  if (level === 'complex') return 'Document complexe';
  return 'Compatibilité non analysée';
}

async function inspectDocumentCompatibility({ tenantId, dossierId, documentId, fallbackFilename }) {
  if (!tenantId || !dossierId || !documentId) return null;
  try {
    const content = await resolveDocumentContent({
      tenantId,
      dossierId,
      documentId,
      fallbackFilename,
    });
    if (!content?.buffer || !isDocxBuffer(content.buffer)) return null;
    const result = analyzeDocx(content.buffer);
    return {
      ...result,
      label: compatibilityLabel(result.level),
      analyzed: true,
      recommendationReason: result.level === 'complex' ? 'COMPLEX_DOCUMENT_WORD_RECOMMENDED' : null,
    };
  } catch (_) {
    // L'analyse guide le choix mais ne doit jamais empêcher l'ouverture. En
    // cas de copie absente ou momentanément inaccessible, les replis habituels
    // restent disponibles et l'éditeur réanalysera le DOCX à l'import.
    return null;
  }
}

function chooseRecommendation(
  preference,
  methods,
  storageProvider,
  forceMethod = null,
  compatibility = null,
  legacyWord = false,
) {
  if (EDITOR_MODES.includes(forceMethod)) return forceMethod;
  const preferred = preference.mode;
  if (EDITOR_MODES.includes(preferred) && methods[preferred]?.available !== false) {
    return preferred;
  }
  // En mode automatique, Word Desktop reste le choix le plus fidèle pour un
  // ancien .doc. Son état `null` demande encore au client de vérifier le
  // compagnon. Une préférence Kheops explicite a déjà été honorée ci-dessus.
  if (legacyWord && methods.word_desktop?.available !== false) return 'word_desktop';
  // Un DOCX complexe passe avant les habitudes non explicites : Word conserve
  // plus fidèlement les champs, objets et mises en page avancées. L'état
  // `null` de Word Desktop signifie que le contrôle local reste à faire.
  if (compatibility?.level === 'complex') {
    if (methods.word_desktop?.available !== false) return 'word_desktop';
    if (methods.word_web?.available === true) return 'word_web';
  }
  if (EDITOR_MODES.includes(preference.lastUsedMode)
      && methods[preference.lastUsedMode]?.available === true) {
    return preference.lastUsedMode;
  }
  if (storageProvider === 'google_drive' && methods.google_docs.available) return 'google_docs';
  if (['onedrive', 'sharepoint'].includes(storageProvider) && methods.word_web.available) {
    return 'word_web';
  }
  if (methods.kheops?.available === true) return 'kheops';
  return EDITOR_MODES.find((mode) => methods[mode]?.available === true) || null;
}

router.get('/availability', auth, requireTenant, async (req, res) => {
  try {
    let effectiveTenantId = req.tenantId;
    let documentScope = null;
    if (req.query?.documentId) {
      const own = await ensureDocOwnership(req, res, req.query.documentId);
      if (!own.ok) return;
      effectiveTenantId = own.tenantId;
      documentScope = own;
    }
    // Les jetons sont lus uniquement pour en deduire leur presence. Ils ne sont
    // jamais inclus, meme partiellement, dans la reponse HTTP.
    const [user, storageConfig, tenant] = await Promise.all([
      userQuery(
        req.user,
        'documentOpening googleDriveRefreshToken googleRefreshToken googleDriveAccount.accountType googleDriveAccount.disconnectedAt microsoftOneDriveRefreshToken microsoftRefreshToken microsoftOneDriveAccount.accountType microsoftOneDriveAccount.disconnectedAt sharePoint.enabled sharePoint.driveId',
      ),
      getStorageProviderConfig(effectiveTenantId),
      tenantQuery(effectiveTenantId, 'documentPolicy'),
    ]);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'Utilisateur introuvable.' });
    }

    const googleConfigured = Boolean(user.googleDriveRefreshToken
      || (user.googleRefreshToken && !user.googleDriveAccount?.disconnectedAt));
    const microsoftConfigured = Boolean(user.microsoftOneDriveRefreshToken
      || (user.microsoftRefreshToken && !user.microsoftOneDriveAccount?.disconnectedAt));
    const [googleConnected, microsoftConnected] = await Promise.all([
      safeConnectionProbe(googleConfigured, googleDriveClient.isConnected, req.user),
      safeConnectionProbe(microsoftConfigured, oneDriveClient.isConnected, req.user),
    ]);

    const googleReason = googleConnected
      ? null
      : (googleConfigured ? 'GOOGLE_CONNECTION_UNAVAILABLE' : 'GOOGLE_ACCOUNT_REQUIRED');
    const microsoftReason = microsoftConnected
      ? null
      : (microsoftConfigured ? 'MICROSOFT_CONNECTION_UNAVAILABLE' : 'MICROSOFT_ACCOUNT_REQUIRED');

    const policy = toClientPolicy(tenant?.documentPolicy);
    const googleAccountProfessional = user.googleDriveAccount?.accountType === 'organization';
    const microsoftAccountProfessional = user.microsoftOneDriveAccount?.accountType === 'organization';
    const googleAllowed = policy.allowedProviders.includes('google_drive')
      && (policy.allowPersonalClouds || googleAccountProfessional);
    const microsoftAllowed = policy.allowedProviders.includes('onedrive')
      && (policy.allowPersonalClouds || microsoftAccountProfessional)
      && (!policy.requireProfessionalMicrosoftAccount || microsoftAccountProfessional);

    const methods = {
      kheops: methodAvailability(true, null),
      word_desktop: methodAvailability(null, 'COMPANION_CHECK_REQUIRED', {
        // Le client doit remplacer cet etat indetermine par le resultat du ping
        // signe vers le service local du compagnon.
        requiresClientCheck: true,
      }),
      word_web: methodAvailability(microsoftAllowed && microsoftConnected,
        microsoftAllowed ? microsoftReason : 'METHOD_FORBIDDEN_BY_POLICY', {
        allowedByPolicy: microsoftAllowed,
        requiresConnection: !microsoftConnected,
        connectUrl: null,
      }),
      google_docs: methodAvailability(googleAllowed && googleConnected,
        googleAllowed ? googleReason : 'METHOD_FORBIDDEN_BY_POLICY', {
        allowedByPolicy: googleAllowed,
        requiresConnection: !googleConnected,
        connectUrl: null,
      }),
    };

    const fileName = String(req.query?.fileName || '').trim().toLowerCase();
    const mimeType = normalizedMime(req.query?.mimeType);
    const formatKnown = Boolean(fileName || mimeType);
    const hasExplicitDocxExtension = /\.docx$/i.test(fileName);
    const hasExplicitLegacyDocExtension = /\.doc$/i.test(fileName);
    // Une extension Word explicite est la source de vérité. Le MIME ne sert de
    // repli que lorsqu'aucune extension .doc/.docx reconnue n'est présente :
    // certains stockages historiques conservent en effet un MIME obsolète.
    const isDocx = hasExplicitDocxExtension
      || (!hasExplicitLegacyDocExtension
        && mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    const isLegacyDoc = hasExplicitLegacyDocExtension
      || (!hasExplicitDocxExtension && mimeType === 'application/msword');
    const isPlainText = isPlainTextFormat(fileName, mimeType);
    if (formatKnown && !isDocx) {
      for (const mode of ['kheops', 'word_web', 'google_docs']) {
        methods[mode] = {
          ...methods[mode],
          available: false,
          reason: 'DOCX_REQUIRED',
        };
      }
      if (!isLegacyDoc) {
        methods.word_desktop = {
          ...methods.word_desktop,
          available: false,
          requiresClientCheck: false,
          reason: 'WORD_DOCUMENT_REQUIRED',
        };
      }
    }
    if (isLegacyDoc) {
      methods.kheops = {
        ...methods.kheops,
        available: true,
        reason: null,
        label: 'Éditeur Kheops',
        description: 'Convertissez le document Word historique en copie éditable .docx. Le fichier .doc original reste conservé.',
        conversionRequired: true,
        conversionTarget: 'docx',
        originalPreserved: true,
      };
    }
    if (isPlainText) {
      methods[BROWSER_PREVIEW_MODE] = methodAvailability(true, null, {
        applicable: true,
        readOnly: true,
        label: 'Lire dans Kheops 2',
        description: 'Consultez le fichier texte dans le navigateur, sans modifier son contenu.',
      });
      methods.kheops = {
        ...methods.kheops,
        available: true,
        reason: null,
        label: 'Éditeur texte Kheops',
        description: 'Modifiez le fichier texte dans Kheops 2 tout en conservant son format .txt.',
      };
      methods.word_desktop = {
        ...methods.word_desktop,
        available: false,
        requiresClientCheck: false,
        reason: 'TXT_NATIVE_COMPANION_UNAVAILABLE',
        label: "Application texte native de l'ordinateur",
        description: "L'ouverture synchronisée avec Bloc-notes ou une application native n'est pas encore disponible.",
      };
      methods.word_web = {
        ...methods.word_web,
        available: false,
        requiresConnection: false,
        reason: 'TXT_WORD_ONLINE_IMPORT_REQUIRED',
        label: 'Word pour le web',
        description: "Word pour le web nécessite d'abord une copie Word .docx du fichier texte.",
      };
      methods.google_docs = {
        ...methods.google_docs,
        available: googleAllowed && googleConnected && policy.allowGoogleConversion,
        requiresConnection: policy.allowGoogleConversion && googleAllowed && !googleConnected,
        reason: !policy.allowGoogleConversion
          ? 'TXT_GOOGLE_CONVERSION_DISABLED'
          : (googleAllowed ? googleReason : 'METHOD_FORBIDDEN_BY_POLICY'),
        label: 'Google Docs',
        description: 'Importez explicitement une copie du fichier texte dans Google Docs.',
      };
    }

    if (policy.forceMethod) {
      for (const mode of EDITOR_MODES) {
        if (mode === policy.forceMethod) {
          methods[mode].enforcedByPolicy = true;
          continue;
        }
        methods[mode] = {
          ...methods[mode],
          available: false,
          reason: 'CABINET_METHOD_ENFORCED',
          enforcedByPolicy: true,
        };
      }
    }
    const userPreference = toClientPreference(user.documentOpening);
    let documentMode = null;
    if (documentScope) {
      const scopedDossier = await Dossier.findById(documentScope.dossierId).select('dossier.documents').lean();
      const scopedDocument = embeddedDocument(scopedDossier, req.query.documentId);
      if (OPENING_MODES.includes(scopedDocument?.openingMode)) documentMode = scopedDocument.openingMode;
    }
    const preference = documentMode
      ? { ...userPreference, mode: documentMode, documentMode, userMode: userPreference.mode, configured: true }
      : userPreference;
    const storageProvider = String(storageConfig?.provider || 'managed_gcs');
    const compatibility = documentScope
      ? await inspectDocumentCompatibility({
        tenantId: effectiveTenantId,
        dossierId: documentScope.dossierId,
        documentId: req.query.documentId,
        fallbackFilename: req.query.fileName,
      })
      : null;
    const restrictions = [];
    if (!policy.allowPersonalClouds) restrictions.push('PERSONAL_CLOUDS_DISABLED');
    if (policy.forceMethod) restrictions.push('METHOD_ENFORCED');

    return res.json({
      preference,
      userPreference,
      documentPreference: {
        documentId: documentScope ? String(req.query.documentId) : null,
        mode: documentMode,
        configured: documentMode !== null,
      },
      methods,
      recommendedMode: isPlainText
        ? BROWSER_PREVIEW_MODE
        : chooseRecommendation(
          preference,
          methods,
          storageProvider,
          policy.forceMethod,
          compatibility,
          isLegacyDoc,
        ),
      ...(isPlainText ? {
        format: {
          kind: 'text',
          extension: 'txt',
          mimeType: mimeType || 'text/plain',
          readOnlyPreview: true,
        },
      } : isLegacyDoc ? {
        format: {
          kind: 'legacy-word',
          extension: 'doc',
          mimeType: mimeType || 'application/msword',
          conversionRequired: true,
          conversionTarget: 'docx',
          originalPreserved: true,
        },
      } : {}),
      compatibility,
      connections: {
        google: { configured: googleConfigured, connected: googleConnected },
        microsoft: { configured: microsoftConfigured, connected: microsoftConnected },
      },
      policy: {
        ...policy,
        storageProvider,
        // Alias explicite conserve pour les clients qui parlent d'enforcedMode.
        enforcedMode: policy.forceMethod,
        restrictions,
        sharePointEnabled: Boolean(user.sharePoint?.enabled && user.sharePoint?.driveId),
      },
    });
  } catch (err) {
    return routeError(res, err);
  }
});

module.exports = router;
module.exports._private = {
  OPENING_MODES,
  EDITOR_MODES,
  defaultPreference,
  toClientPreference,
  buildPreferenceUpdate,
  defaultPolicy,
  toClientPolicy,
  buildPolicyUpdate,
  chooseRecommendation,
  compatibilityLabel,
  inspectDocumentCompatibility,
  embeddedDocument,
};
