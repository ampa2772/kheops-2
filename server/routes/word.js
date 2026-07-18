// server/routes/word.js
//
// Routes backend pour le flux "Ouvrir dans Word" pilote par le COMPAGNON mince.
//
// Principe de securite : le compagnon ne detient AUCUN secret et ne touche ni a
// MongoDB ni a Google Drive. Il recoit un JETON DE SESSION COMPAGNON court
// (emis ici apres login), s'authentifie avec, et passe par ces routes pour :
//   - recuperer le .docx (download) ;
//   - re-uploader la version modifiee (sync) ;
//   - (les verrous passent par /api/document-locks/* deja existant).
//
// Toutes les routes sont protegees par le middleware JWT `auth` (le jeton
// compagnon est un JWT standard { id: userId }, donc accepte tel quel) et par un
// controle d'appartenance du document (ensureDocOwnership).

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const auth = require('../middlewares/middleware-auth');
const CompanionSession = require('../models/App_Users/CompanionSession');
const User = require('../models/App_Users/User');
const { getFileStorage } = require('../services/fileStorage');
const { ensureDocOwnership, ensureDossierOwnership } = require('../utils/ownershipHelpers');
const {
  COMPANION_PREVIOUS_JTI_GRACE_SECONDS,
  hashCompanionJti,
  companionClaimUserId,
  companionSessionId,
  hasAnyStatefulCompanionClaim,
  hasCompleteStatefulCompanionClaims,
} = require('../utils/companionSessionSecurity');

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_CONTENT_TYPE = 'application/msword';
const COMPANION_TOKEN_TTL = '8h';
const COMPANION_TOKEN_TTL_SECONDS = 8 * 60 * 60;
const COMPANION_SESSION_MAX_SECONDS = 14 * 24 * 60 * 60;

function optionalDocumentText(value, maxLength = 2000) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function resolveDocumentGenerationOptions(_payload = {}, profile = null) {
  const saved = profile && typeof profile === 'object' ? profile : {};
  return {
    // Les réglages documentaires viennent exclusivement du profil associé au
    // JWT. Le navigateur ne peut ni usurper ceux d'un autre utilisateur ni
    // réinjecter une ancienne copie Redux.
    header: optionalDocumentText(saved.header),
    signatureText: optionalDocumentText(saved.signature),
    signatureImageBase64: optionalDocumentText(saved.signatureImage, 700000),
    fontOptions: {
      fontFamily: optionalDocumentText(saved.headerFontFamily, 80) || undefined,
      fontSize: Number.isFinite(Number(saved.headerFontSize)) ? Number(saved.headerFontSize) : undefined,
      fontWeight: optionalDocumentText(saved.headerFontWeight, 20) || undefined,
      textAlign: optionalDocumentText(saved.headerTextAlign, 20) || undefined,
    },
  };
}

function requestAuthToken(req) {
  const header = req.get?.('authorization')
    || req.get?.('Authorization')
    || req.get?.('x-auth-token')
    || req.headers?.authorization
    || req.headers?.['x-auth-token'];
  if (!header) return null;
  const value = String(header).trim();
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, '').trim() : value;
}

function verifiedRequestClaims(req, secret) {
  if (req.authClaims) return req.authClaims;
  const token = requestAuthToken(req);
  if (!token) return null;
  try { return jwt.verify(token, secret); }
  catch (_) { return null; }
}

function issueCompanionToken({
  secret,
  userId,
  sessionId,
  absoluteExpiresAtSeconds,
  jti,
  purpose,
  docId = null,
}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const remainingSeconds = Math.floor(Number(absoluteExpiresAtSeconds) - nowSeconds);
  if (!Number.isFinite(remainingSeconds) || remainingSeconds <= 0) return null;
  const expiresInSeconds = Math.min(COMPANION_TOKEN_TTL_SECONDS, remainingSeconds);
  const expiresAtSeconds = nowSeconds + expiresInSeconds;
  const companionToken = jwt.sign(
    {
      id: String(userId),
      companion: true,
      companionSessionId: sessionId,
      companionSessionAbsoluteExp: Number(absoluteExpiresAtSeconds),
      companionPurpose: purpose,
      ...(docId ? { companionDocId: String(docId) } : {}),
    },
    secret,
    { expiresIn: expiresInSeconds, jwtid: jti },
  );
  return {
    companionToken,
    expiresInSeconds,
    expiresAt: expiresAtSeconds * 1000,
    sessionAbsoluteExpiresAt: Number(absoluteExpiresAtSeconds) * 1000,
  };
}

function requestUserId(req) {
  const value = req.user?.id ?? req.user?._id ?? req.user;
  return value == null ? null : String(value);
}

function companionWordUploadDescriptor(file, docId) {
  const rawName = typeof file?.originalname === 'string' ? file.originalname : '';
  const basename = rawName.split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim();
  const normalizedMime = String(file?.mimetype || '').split(';')[0].trim().toLowerCase();
  let extension;
  if (/\.docx$/i.test(basename)) extension = '.docx';
  else if (/\.doc$/i.test(basename)) extension = '.doc';
  else if (normalizedMime === DOC_CONTENT_TYPE) extension = '.doc';
  else if (normalizedMime === DOCX_CONTENT_TYPE) extension = '.docx';

  if (!extension) {
    const error = new Error('Le compagnon Word accepte uniquement les documents .doc ou .docx.');
    error.code = 'WORD_DOCUMENT_REQUIRED';
    error.statusCode = 415;
    throw error;
  }

  const stem = (basename || String(docId || 'document'))
    .replace(/\.docx?$/i, '')
    .trim() || String(docId || 'document');
  return {
    filename: `${stem}${extension}`,
    mime: extension === '.doc' ? DOC_CONTENT_TYPE : DOCX_CONTENT_TYPE,
  };
}

function companionSessionResponse(req, issued) {
  const backendBaseUrl = process.env.FRONTEND_URL
    || `${req.protocol}://${req.get('host')}`;
  return {
    ...issued,
    expiresIn: COMPANION_TOKEN_TTL,
    backendBaseUrl,
    userId: requestUserId(req),
  };
}

function companionSessionExpired(res) {
  return res.status(401).json({
    error: 'COMPANION_SESSION_EXPIRED',
    message: 'La session du compagnon doit etre relancee depuis Kheops 2.',
  });
}

// Upload en memoire : un .docx reste petit. Limite de securite a 25 Mo.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ─────────────────────────────────────────────────────────────────────────────
// SEAM D'INTEGRATION (Phase 5 — stockage serveur des .docx).
// Convention de cle de stockage du .docx d'un document. A ALIGNER avec la
// generation/migration serveur des documents Word (actuellement la generation
// .docx vit encore dans l'app Electron via Google Drive). Tant que les .docx ne
// sont pas ecrits ici, /download renvoie 404 explicite.
// ─────────────────────────────────────────────────────────────────────────────
function docxStorageKey(docId, tenantId = null, dossierId = null) {
  const safe = String(docId).replace(/[^a-zA-Z0-9_-]/g, '_');
  if (tenantId && dossierId) {
    const safeTenant = String(tenantId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeDossier = String(dossierId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `tenants/${safeTenant}/dossiers/${safeDossier}/documents/${safe}.docx`;
  }
  return `documents/${safe}.docx`;
}

// Clé de stockage d'un MODÈLE .docx (Phase 5). Les modèles doivent être présents
// sous le préfixe `templates/` du stockage (GCS). Provisioning des modèles =
// étape ops/migration (aujourd'hui ils vivent encore dans Google Drive côté Electron).
function templateStorageKey(name) {
  const safe = String(name).replace(/[^a-zA-Z0-9_.-]/g, '_');
  const withExt = /\.docx$/i.test(safe) ? safe : `${safe}.docx`;
  return `templates/${withExt}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resout les OCTETS d'un document (meme priorite que /download) : flux Word
// (documents/<docId>.docx) puis repli StoredDocument (quel que soit le provider).
// Renvoie { buffer, filename } ou null si aucun octet serveur. Utilise par
// l'export texte du dossier. Ne leve pas sur "absent" (renvoie null).
// ─────────────────────────────────────────────────────────────────────────────
async function resolveDocumentBytes(tenantId, dossierId, docId) {
  const { resolveDocumentContent } = require('../services/documentContentService');
  return resolveDocumentContent({ tenantId, dossierId, documentId: docId, fallbackFilename: `${docId}.docx` });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/word/text-export/:dossierId
// EXPORT TEXTE COMPLET du dossier (mode WEB). Remplace l'ancienne fonction de
// l'agent de bureau (qui lisait le disque local + poussait la progression via
// socket.io). Ici : on recupere les octets de chaque document via le stockage
// serveur, on extrait le texte (docx/pdf/txt) et on renvoie le TXT assemble.
// Reponse JSON { txtContent, fileName, total, errorCount } : le client declenche
// le telechargement du .txt cote navigateur.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/text-export/:dossierId', auth, async (req, res) => {
  try {
    const { dossierId } = req.params;
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    const Dossier = require('../models/Folder/Dossier');
    const { resolveTenantId } = require('../services/tenantService');
    const { generateFullTextExport } = require('../services/documentTextExport');

    const dossierData = await Dossier.findById(dossierId).lean();
    if (!dossierData) {
      return res.status(404).json({ error: 'DOSSIER_NOT_FOUND', message: 'Dossier introuvable.' });
    }
    const tenantId = dossierData.tenantId || await resolveTenantId(req.user);

    const fetchBytes = async (docId) => {
      try { return await resolveDocumentBytes(tenantId, dossierId, docId); }
      catch (_e) { return null; }
    };

    const result = await generateFullTextExport(dossierData, fetchBytes);
    return res.json(result);
  } catch (err) {
    console.error('[word/text-export] Erreur:', err.message);
    return res.status(500).json({ error: 'TEXT_EXPORT_FAILED', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/word/companion/session
// Emet un jeton de session compagnon court (JWT standard { id: userId }), que le
// web relaie au compagnon local. Un compagnon deja authentifie peut appeler le
// meme endpoint AVANT l'expiration pour effectuer une rotation transparente.
// La chaine de rotations reste bornee a 14 jours et ne contient aucun jeton de
// fournisseur Google/Microsoft.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/companion/session', auth, async (req, res) => {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return res.status(500).json({ error: 'Configuration serveur incomplete.' });

    const claims = verifiedRequestClaims(req, secret);
    const userId = companionClaimUserId(claims);
    const authenticatedUserId = requestUserId(req);
    if (!claims || !userId) {
      return res.status(401).json({ error: 'USER_JWT_REQUIRED' });
    }
    if (userId !== authenticatedUserId) {
      return res.status(403).json({ error: 'COMPANION_SESSION_USER_MISMATCH' });
    }

    const now = new Date();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const rotatingCompanionSession = claims.companion === true;

    if (rotatingCompanionSession && hasAnyStatefulCompanionClaim(claims)) {
      if (!hasCompleteStatefulCompanionClaims(claims)) {
        return res.status(401).json({ error: 'COMPANION_SESSION_CLAIMS_INVALID' });
      }
      if (Number(claims.companionSessionAbsoluteExp) <= nowSeconds) {
        return companionSessionExpired(res);
      }

      const sessionId = companionSessionId(claims);
      const oldJtiHash = hashCompanionJti(claims.jti);
      const newJti = crypto.randomUUID();
      const newJtiHash = hashCompanionJti(newJti);
      const previousValidUntil = new Date(
        now.getTime() + COMPANION_PREVIOUS_JTI_GRACE_SECONDS * 1000,
      );

      // Compare-and-swap : seul le jti COURANT peut tourner la session. Le jti
      // precedent reste valable 60 s dans le middleware pour laisser finir les
      // requetes deja en vol, mais il ne correspond jamais a ce filtre et ne
      // peut donc pas effectuer une seconde rotation.
      const rotated = await CompanionSession.findOneAndUpdate(
        {
          sessionId,
          userId,
          currentJtiHash: oldJtiHash,
          revokedAt: null,
          absoluteExpiresAt: { $gt: now },
        },
        {
          $set: {
            currentJtiHash: newJtiHash,
            previousJtiHash: oldJtiHash,
            previousValidUntil,
          },
        },
        { new: true },
      );
      if (!rotated) {
        return res.status(401).json({
          error: 'COMPANION_SESSION_ROTATION_REJECTED',
          message: 'Ce jeton a deja ete remplace ou la session a ete revoquee.',
        });
      }

      const absoluteExpiresAtSeconds = Math.floor(
        new Date(rotated.absoluteExpiresAt).getTime() / 1000,
      );
      const issued = issueCompanionToken({
        secret,
        userId,
        sessionId,
        absoluteExpiresAtSeconds,
        jti: newJti,
        purpose: rotated.purpose,
        docId: rotated.docId || null,
      });
      if (!issued) return companionSessionExpired(res);
      return res.json(companionSessionResponse(req, issued));
    }

    // JWT utilisateur, ou migration d'un compagnon 1.0.5 sans claims de
    // session : creation d'une nouvelle chaine bornee a 14 jours.
    const requestedDocId = typeof req.body?.docId === 'string' && req.body.docId.trim()
      ? req.body.docId.trim()
      : null;
    const requestedPurpose = req.body?.purpose;
    if (requestedPurpose === 'word' && !requestedDocId) {
      return res.status(400).json({ error: 'COMPANION_SESSION_DOC_ID_REQUIRED' });
    }
    if (rotatingCompanionSession
      && requestedPurpose !== 'mirror'
      && !(requestedPurpose === 'word' && requestedDocId)) {
      // Un legacy sans intention ne doit pas devenir silencieusement une
      // capacite globale de 14 jours. Le client 1.0.6 transmet explicitement
      // son usage lors de cette unique migration.
      return res.status(400).json({ error: 'COMPANION_SESSION_PURPOSE_REQUIRED' });
    }
    const purpose = requestedPurpose === 'word' || requestedDocId ? 'word' : 'mirror';
    const sessionId = crypto.randomUUID();
    const jti = crypto.randomUUID();
    const absoluteExpiresAtSeconds = nowSeconds + COMPANION_SESSION_MAX_SECONDS;
    const absoluteExpiresAt = new Date(absoluteExpiresAtSeconds * 1000);
    await CompanionSession.create({
      sessionId,
      userId,
      purpose,
      docId: requestedDocId,
      currentJtiHash: hashCompanionJti(jti),
      previousJtiHash: null,
      previousValidUntil: null,
      absoluteExpiresAt,
      revokedAt: null,
    });
    const issued = issueCompanionToken({
      secret,
      userId,
      sessionId,
      absoluteExpiresAtSeconds,
      jti,
      purpose,
      docId: requestedDocId,
    });
    if (!issued) return companionSessionExpired(res);
    return res.json(companionSessionResponse(req, issued));
  } catch (err) {
    console.error('[word/companion/session] Erreur:', err.message);
    return res.status(500).json({ error: 'COMPANION_SESSION_FAILED' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/word/companion/whoami
// Permet au compagnon de revalider son jeton (le compagnon n'a aucun secret).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/companion/whoami', auth, (req, res) => {
  const claims = verifiedRequestClaims(req, process.env.JWT_SECRET);
  res.json({
    ok: true,
    userId: requestUserId(req),
    companion: claims?.companion === true,
    sessionId: companionSessionId(claims),
    purpose: claims?.companionPurpose || null,
    docId: claims?.companionDocId || null,
    expiresAt: Number.isFinite(Number(claims?.exp)) ? Number(claims.exp) * 1000 : null,
    sessionAbsoluteExpiresAt: Number.isFinite(Number(claims?.companionSessionAbsoluteExp))
      ? Number(claims.companionSessionAbsoluteExp) * 1000
      : null,
  });
});

// Revoque uniquement la session presentee. Un ancien jeton sans session Mongo
// ne peut rien cibler et reste simplement borne par son `exp` historique.
router.post('/companion/revoke', auth, async (req, res) => {
  try {
    const claims = verifiedRequestClaims(req, process.env.JWT_SECRET);
    if (claims?.companion !== true) {
      return res.status(403).json({ error: 'COMPANION_JWT_REQUIRED' });
    }
    if (!hasAnyStatefulCompanionClaim(claims)) {
      return res.json({ ok: true, revoked: false, legacy: true });
    }
    if (!hasCompleteStatefulCompanionClaims(claims)) {
      return res.status(401).json({ error: 'COMPANION_SESSION_CLAIMS_INVALID' });
    }
    const userId = companionClaimUserId(claims);
    if (userId !== requestUserId(req)) {
      return res.status(403).json({ error: 'COMPANION_SESSION_USER_MISMATCH' });
    }
    const result = await CompanionSession.updateOne(
      {
        sessionId: companionSessionId(claims),
        userId,
        revokedAt: null,
      },
      { $set: { revokedAt: new Date() } },
    );
    return res.json({ ok: true, revoked: Number(result.modifiedCount || 0) > 0 });
  } catch (err) {
    console.error('[word/companion/revoke] Erreur:', err.message);
    return res.status(500).json({ error: 'COMPANION_REVOKE_FAILED' });
  }
});

// Revoque toutes les sessions du compte. Cette operation exige expressement
// un JWT UTILISATEUR : un jeton compagnon, meme valide, ne peut jamais couper
// les autres postes du compte.
router.post('/companion/revoke-all', auth, async (req, res) => {
  try {
    const claims = verifiedRequestClaims(req, process.env.JWT_SECRET);
    if (!claims || claims.companion === true) {
      return res.status(403).json({ error: 'USER_JWT_REQUIRED' });
    }
    const userId = companionClaimUserId(claims);
    if (!userId || userId !== requestUserId(req)) {
      return res.status(403).json({ error: 'COMPANION_SESSION_USER_MISMATCH' });
    }
    const result = await CompanionSession.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    return res.json({ ok: true, revokedCount: Number(result.modifiedCount || 0) });
  } catch (err) {
    console.error('[word/companion/revoke-all] Erreur:', err.message);
    return res.status(500).json({ error: 'COMPANION_REVOKE_ALL_FAILED' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/word/mirror/manifest
// MANIFESTE DU MIROIR LOCAL (Phase 2 « rangement coherent »). Le COMPAGNON
// l'appelle (jeton compagnon) pour savoir quoi materialiser dans
// C:\Files_Clients\Kheops2\Dossiers\<nom lisible>. Le miroir n'est actif QUE
// pour les comptes dont le provider d'upload est managed_gcs (stockage interne,
// invisible autrement) : les comptes OneDrive/Google/SharePoint ont deja leur
// propre client de synchronisation officiel. Exception explicite : l'ancienne
// application Electron peut envoyer `?client=electron`. Elle utilise alors ce
// miroir backend pour TOUS les providers afin de ne plus recevoir de refresh
// token Google/Microsoft. L'appel compagnon par defaut reste strictement
// inchange.
// NB : route declaree AVANT '/:docId/download' pour ne pas etre avalee par le
// parametre :docId.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/mirror/manifest', auth, async (req, res) => {
  try {
    const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
    const Dossier = require('../models/Folder/Dossier');
    const { getUploadProvider, toTenantObjectId } = require('../services/storage');
    const { resolveTenantId } = require('../services/tenantService');
    const { readableMatterFolder } = require('../services/storage/matterFolderName');

    const tenantId = await resolveTenantId(req.user);
    const provider = await getUploadProvider(toTenantObjectId(tenantId), req.user);
    const electronMirrorRequested = req.query?.client === 'electron';
    const mirrorEnabled = !!provider
      && (provider.name === 'managed_gcs' || electronMirrorRequested);
    if (!mirrorEnabled) {
      return res.json({ mirrorEnabled: false, dossiers: [] });
    }

    const links = await UserDossier.find({ user: req.user }).select('dossier').lean();
    const ids = links.map((l) => l.dossier);
    const dossiers = await Dossier.find({ _id: { $in: ids } })
      .select('reference dossier.dossier.nom dossier.documents')
      .lean();

    const manifest = dossiers.map((d) => ({
      dossierId: String(d._id),
      label: readableMatterFolder(d?.dossier?.dossier?.nom, d.reference),
      documents: (d?.dossier?.documents || []).map((doc) => ({
        docId: String(doc._id),
        name: doc.nomDocument || `${doc._id}.docx`,
        subfolder: doc.subfolderName || null,
      })),
    }));

    return res.json({ mirrorEnabled: true, root: ['Kheops2', 'Dossiers'], dossiers: manifest });
  } catch (err) {
    console.error('[word/mirror/manifest] Erreur:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/word/:docId/download
// Fournit le .docx du document, dans l'ordre :
//   1. documents/<docId>.docx (flux Word serveur : genere/create-blank/sync) ;
//   2. REPLI : le stockage DOCUMENTAIRE (StoredDocument) — documents deposes
//      (drag & drop) ou herites de l'ancien flux, dont l'octet vit sous une cle
//      tenants/... (stockage interne) ou onedrive:/sharepoint:/googledrive:
//      (cloud PAR UTILISATEUR). Sans ce repli, ces documents renvoyaient 404 et
//      « Ouvrir dans Word » echouait silencieusement (bug vu en prod 2026-07-06 :
//      Conclusion.docx du 01/07 introuvable -> Word ne s'ouvrait jamais).
// NB : apres la 1re sauvegarde Word, /sync ecrit documents/<docId>.docx, qui
// reprend la priorite (les editions Word restent donc persistantes).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:docId/download', auth, async (req, res) => {
  try {
    const { docId } = req.params;
    const own = await ensureDocOwnership(req, res, docId);
    if (!own.ok) return;

    try {
      let content = null;
      if (own.tenantId) {
        content = await resolveDocumentBytes(own.tenantId, own.dossierId, docId);
      } else {
        // Compatibilité des anciens intégrateurs/tests qui ne retournaient pas
        // encore tenantId depuis ensureDocOwnership. Le chemin de production
        // moderne passe toujours par la branche cloisonnée ci-dessus.
        const storage = getFileStorage();
        const legacyKey = docxStorageKey(docId);
        if (await storage.exists(legacyKey)) {
          content = {
            buffer: await storage.read(legacyKey),
            filename: `${docId}.docx`,
            mime: DOCX_CONTENT_TYPE,
          };
        } else {
          const StoredDocument = require('../models/Storage/StoredDocument');
          const { getProviderForStorageKey } = require('../services/storage');
          const stored = await StoredDocument.findOne({ documentId: docId, deletedAt: null }).lean();
          const version = stored?.versions?.find((item) => String(item.versionId) === String(stored.currentVersionId))
            || stored?.versions?.[stored.versions.length - 1];
          if (version?.storageKey) {
            const provider = await getProviderForStorageKey(stored.tenantId, version.storageKey);
            content = {
              buffer: await provider.downloadVersion({ storageKey: version.storageKey }),
              filename: version.filename || `${docId}.docx`,
              mime: version.mime || DOCX_CONTENT_TYPE,
            };
          }
        }
      }
      if (content) {
        const filename = String(content.filename || `${docId}.docx`).replace(/[\r\n"]/g, '_');
        // Le compagnon conserve cette précondition pendant toute la session
        // Word. Les documents hérités sans historique reçoivent une empreinte
        // déterministe : deux sessions parties du même fichier peuvent ainsi
        // être départagées dès la première synchronisation concurrente.
        const { checksumOf } = require('../services/documentHistoryService');
        const baseVersionId = content.versionId || `sha256:${checksumOf(content.buffer)}`;
        res.setHeader('Content-Type', content.mime || DOCX_CONTENT_TYPE);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
        res.setHeader('X-Kheops-Base-Version-Id', baseVersionId);
        return res.send(content.buffer);
      }
    } catch (fallbackErr) {
      // Le repli ne doit jamais transformer un 404 propre en 500 : on journalise
      // et on retombe sur le 404 explicite ci-dessous.
      console.error('[word/download] Repli stockage documentaire en erreur:', fallbackErr.message);
    }

    return res.status(404).json({
      error: 'docx-not-found',
      message: 'Aucun .docx serveur pour ce document (ni flux Word, ni stockage documentaire).',
    });
  } catch (err) {
    console.error('[word/download] Erreur:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/word/:docId/sync   (multipart, champ "file")
// Recoit la version Word modifiee (.doc ou .docx) et l'ecrit sans changer son
// extension ni son type MIME.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:docId/sync', auth, upload.single('file'), async (req, res) => {
  try {
    const { docId } = req.params;
    const own = await ensureDocOwnership(req, res, docId);
    if (!own.ok) return;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Fichier manquant (champ "file").' });
    }
    const uploadedWordFile = companionWordUploadDescriptor(req.file, docId);
    const { saveVersion } = require('../services/documentHistoryService');
    const tenantId = own.tenantId;
    const recorded = await saveVersion({
      tenantId,
      dossierId: own.dossierId,
      documentId: docId,
      userId: req.user,
      buffer: req.file.buffer,
      filename: uploadedWordFile.filename,
      mime: uploadedWordFile.mime,
      editor: 'word_desktop',
      origin: 'companion',
      comment: req.body?.comment || 'Synchronisation depuis Microsoft Word',
      status: req.body?.status || 'draft',
      baseVersionId: req.body?.baseVersionId || null,
      requireBaseVersion: true,
    });
    if (recorded.conflict) {
      return res.status(409).json({
        error: 'DOCUMENT_VERSION_CONFLICT',
        message: 'Une version plus récente existe déjà. Les deux versions ont été conservées.',
        savedConflictVersionId: recorded.version.versionId,
        currentVersionId: recorded.history.currentVersionId,
        baseVersionId: req.body?.baseVersionId || null,
      });
    }
    const { saveCanonicalDocument } = require('../services/documentContentService');
    let key = null;
    let canonicalSynced = true;
    let warning = null;
    try {
      key = await saveCanonicalDocument(docId, req.file.buffer, uploadedWordFile.mime, {
        tenantId: own.tenantId,
        dossierId: own.dossierId,
        filename: uploadedWordFile.filename,
      });
    } catch (canonicalErr) {
      // L'historique immuable est la source de vérité et la route de lecture le
      // consulte en premier. Une panne de cette copie dérivée ne doit donc pas
      // faire croire au compagnon que l'enregistrement a échoué : il réessaierait
      // avec l'ancienne baseVersionId et créerait un faux conflit alors que la
      // nouvelle version est déjà courante.
      canonicalSynced = false;
      warning = 'La version est enregistrée, mais la copie de lecture rapide sera reconstruite ultérieurement.';
      console.warn('[word/sync] Copie canonique non mise à jour:', canonicalErr.message);
    }
    return res.json({
      ok: true,
      key,
      size: req.file.size,
      savedAt: Date.now(),
      versionId: recorded.version.versionId,
      deduplicated: recorded.deduplicated,
      canonicalSynced,
      warning,
      filename: uploadedWordFile.filename,
      mime: uploadedWordFile.mime,
    });
  } catch (err) {
    console.error('[word/sync] Erreur:', err.message);
    return res.status(err.statusCode || 500).json({ error: err.code || err.message, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/word/:docId/generate
// Génère le .docx du document à partir d'un MODÈLE (templates/<name>.docx) + des
// variables de fusion, et l'écrit sous documents/<docId>.docx (servi ensuite par
// /download et ouvert dans Word par le compagnon). Phase 5 — seam comblé.
//
// Body : { templateName, variables?, clientData? }
// Les données de fusion métier peuvent venir du client, mais l'en-tête et la
// signature sont toujours relus depuis le profil associé au JWT côté serveur.
// Une copie de profil présente dans clientData est remplacée avant assemblage.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:docId/generate', auth, async (req, res) => {
  try {
    const { docId } = req.params;
    const own = await ensureDocOwnership(req, res, docId);
    if (!own.ok) return;

    const { templateName, variables, clientData } = req.body || {};
    if (!templateName) {
      return res.status(400).json({ error: 'templateName requis.' });
    }

    const profile = await User.findById(requestUserId(req))
      .select('firstName lastName city barreau header signature signatureImage headerFontFamily headerFontSize headerFontWeight headerTextAlign signatureScale')
      .lean();
    if (!profile) {
      return res.status(404).json({
        error: 'user-profile-not-found',
        message: 'Le profil utilisateur associé à cette session est introuvable.',
      });
    }

    // Variables de fusion : soit fournies directement (`variables`), soit assemblées
    // CÔTÉ SERVEUR à partir du dossier et du profil authentifié. Toute copie de
    // profil transmise par le navigateur est volontairement remplacée.
    const { buildDocumentVariables } = require('../services/docx/variables');
    const authoritativeClientData = clientData
      ? { ...clientData, userProfile: profile }
      : null;
    const effectiveVariables = (variables && Object.keys(variables).length > 0)
      ? variables
      : (authoritativeClientData ? buildDocumentVariables(authoritativeClientData) : {});
    const decorations = resolveDocumentGenerationOptions({}, profile);

    const storage = getFileStorage();
    const templateKey = templateStorageKey(templateName);
    if (!(await storage.exists(templateKey))) {
      return res.status(404).json({
        error: 'template-not-found',
        message: `Modèle introuvable dans le stockage : ${templateKey}. `
          + 'Les modèles .docx doivent être présents sous le préfixe templates/ (provisioning à faire).',
      });
    }
    const templateBuffer = await storage.read(templateKey);

    const { generateDocx } = require('../services/docx/docxGenerator');
    const out = await generateDocx({
      templateBuffer,
      variables: effectiveVariables,
      header: decorations.header,
      signatureText: decorations.signatureText,
      signatureImageBase64: decorations.signatureImageBase64,
      fontOptions: decorations.fontOptions,
    });

    const key = docxStorageKey(docId, own.tenantId, own.dossierId);
    await storage.save(key, out, { contentType: DOCX_CONTENT_TYPE });
    let versionId = null;
    try {
      const { saveVersion } = require('../services/documentHistoryService');
      const recorded = await saveVersion({
        tenantId: own.tenantId,
        dossierId: own.dossierId,
        documentId: docId,
        userId: req.user,
        buffer: out,
        filename: `${docId}.docx`,
        mime: DOCX_CONTENT_TYPE,
        editor: 'system',
        origin: 'template-generation',
        comment: `Génération depuis le modèle ${templateName}`,
      });
      versionId = recorded.version.versionId;
    } catch (historyErr) {
      console.warn('[word/generate] Historique non bloquant:', historyErr.message);
    }
    return res.json({ ok: true, key, size: out.length, generatedAt: Date.now(), versionId });
  } catch (err) {
    console.error('[word/generate] Erreur:', err.message);
    // Erreurs de rendu (template invalide, tags) → 422 ; sinon 500.
    const status = /template|docx|render|tag|zip/i.test(err.message || '') ? 422 : 500;
    return res.status(status).json({ error: 'generation-failed', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/word/:docId/create-blank
// Fabrique un .docx VIERGE côté serveur et l'écrit sous documents/<docId>.docx.
// Pendant web du bouton « Document vierge » (l'app de bureau copiait un
// blank.docx local). Aucun modèle provisionné requis : le squelette OOXML est
// généré en mémoire (docxGenerator.buildBlankDocxBuffer).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:docId/create-blank', auth, async (req, res) => {
  try {
    const { docId } = req.params;
    const own = await ensureDocOwnership(req, res, docId);
    if (!own.ok) return;

    const { buildBlankDocxBuffer } = require('../services/docx/docxGenerator');
    const out = buildBlankDocxBuffer();

    const storage = getFileStorage();
    const key = docxStorageKey(docId, own.tenantId, own.dossierId);
    await storage.save(key, out, { contentType: DOCX_CONTENT_TYPE });
    let versionId = null;
    try {
      const { saveVersion } = require('../services/documentHistoryService');
      const recorded = await saveVersion({
        tenantId: own.tenantId,
        dossierId: own.dossierId,
        documentId: docId,
        userId: req.user,
        buffer: out,
        filename: `${docId}.docx`,
        mime: DOCX_CONTENT_TYPE,
        editor: 'system',
        origin: 'blank-document',
        comment: 'Création du document vierge',
      });
      versionId = recorded.version.versionId;
    } catch (historyErr) {
      console.warn('[word/create-blank] Historique non bloquant:', historyErr.message);
    }
    return res.json({ ok: true, key, size: out.length, generatedAt: Date.now(), versionId });
  } catch (err) {
    console.error('[word/create-blank] Erreur:', err.message);
    return res.status(500).json({ error: 'blank-creation-failed', message: err.message });
  }
});

// Helpers purs exposés pour les tests unitaires (sanitisation des clés de
// stockage → anti-path-traversal). Voir routes/__tests__/wordRoute.test.js.
router._private = {
  companionWordUploadDescriptor,
  docxStorageKey,
  templateStorageKey,
  resolveDocumentGenerationOptions,
};

module.exports = router;
