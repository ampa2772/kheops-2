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
const jwt = require('jsonwebtoken');
const multer = require('multer');
const auth = require('../middlewares/middleware-auth');
const { getFileStorage } = require('../services/fileStorage');
const { ensureDocOwnership } = require('../utils/ownershipHelpers');

const DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const COMPANION_TOKEN_TTL = '8h';

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
function docxStorageKey(docId) {
  const safe = String(docId).replace(/[^a-zA-Z0-9_-]/g, '_');
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
// POST /api/word/companion/session
// Emet un jeton de session compagnon court (JWT standard { id: userId }), que le
// web relaie au compagnon local. Compatible avec le middleware `auth`.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/companion/session', auth, (req, res) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ error: 'Configuration serveur incomplete.' });
  const companionToken = jwt.sign(
    { id: String(req.user), companion: true },
    secret,
    { expiresIn: COMPANION_TOKEN_TTL }
  );
  // Origine que le compagnon devra appeler. En hebergement mono-origine,
  // FRONTEND_URL == l'API. Fallback sur l'origine de la requete.
  const backendBaseUrl = process.env.FRONTEND_URL
    || `${req.protocol}://${req.get('host')}`;
  res.json({ companionToken, expiresIn: COMPANION_TOKEN_TTL, backendBaseUrl });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/word/companion/whoami
// Permet au compagnon de revalider son jeton (le compagnon n'a aucun secret).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/companion/whoami', auth, (req, res) => {
  res.json({ ok: true, userId: String(req.user) });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/word/:docId/download
// Fournit le .docx du document (depuis le stockage GCS/local).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:docId/download', auth, async (req, res) => {
  try {
    const { docId } = req.params;
    const own = await ensureDocOwnership(req, res, docId);
    if (!own.ok) return;

    const storage = getFileStorage();
    const key = docxStorageKey(docId);
    if (!(await storage.exists(key))) {
      return res.status(404).json({
        error: 'docx-not-found',
        message: 'Aucun .docx serveur pour ce document. '
          + '(Seam Phase 5 : generation/stockage serveur des .docx a brancher sur docxStorageKey.)',
      });
    }
    const buffer = await storage.read(key);
    res.setHeader('Content-Type', DOCX_CONTENT_TYPE);
    res.setHeader('Content-Disposition', `attachment; filename="${docId}.docx"`);
    return res.send(buffer);
  } catch (err) {
    console.error('[word/download] Erreur:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/word/:docId/sync   (multipart, champ "file")
// Recoit la version modifiee du .docx et l'ecrit dans le stockage.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:docId/sync', auth, upload.single('file'), async (req, res) => {
  try {
    const { docId } = req.params;
    const own = await ensureDocOwnership(req, res, docId);
    if (!own.ok) return;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Fichier manquant (champ "file").' });
    }
    const storage = getFileStorage();
    const key = docxStorageKey(docId);
    await storage.save(key, req.file.buffer, { contentType: DOCX_CONTENT_TYPE });
    return res.json({ ok: true, key, size: req.file.size, savedAt: Date.now() });
  } catch (err) {
    console.error('[word/sync] Erreur:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/word/:docId/generate
// Génère le .docx du document à partir d'un MODÈLE (templates/<name>.docx) + des
// variables de fusion, et l'écrit sous documents/<docId>.docx (servi ensuite par
// /download et ouvert dans Word par le compagnon). Phase 5 — seam comblé.
//
// Body : { templateName, variables, header, signatureText, signatureImageBase64, fontOptions }
// (le frontend fournit `variables`/`header`/signature comme l'ancien flux Electron
//  fournissait clientData ; l'assemblage serveur riche — presentationParties/barreaux —
//  est un increment ultérieur, cf. AI_COORDINATION.md PHASE5).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:docId/generate', auth, async (req, res) => {
  try {
    const { docId } = req.params;
    const own = await ensureDocOwnership(req, res, docId);
    if (!own.ok) return;

    const { templateName, variables, clientData, header, signatureText, signatureImageBase64, fontOptions } = req.body || {};
    if (!templateName) {
      return res.status(400).json({ error: 'templateName requis.' });
    }

    // Variables de fusion : soit fournies directement (`variables`), soit assemblées
    // CÔTÉ SERVEUR à partir des données du dossier (`clientData` = { dossier, recipients, userProfile }).
    const { buildDocumentVariables } = require('../services/docx/variables');
    const effectiveVariables = (variables && Object.keys(variables).length > 0)
      ? variables
      : (clientData ? buildDocumentVariables(clientData) : {});
    // En-tête / signature / police : explicites, sinon dérivés du profil avocat.
    const profile = (clientData && clientData.userProfile) || null;
    const effHeader = header || (profile && profile.header) || '';
    const effSignatureText = signatureText || (profile && profile.signature) || '';
    const effSignatureImg = signatureImageBase64 || (profile && profile.signatureImage) || '';
    const effFont = fontOptions || (profile ? {
      fontFamily: profile.headerFontFamily,
      fontSize: profile.headerFontSize,
      fontWeight: profile.headerFontWeight,
      textAlign: profile.headerTextAlign,
    } : {});

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
      header: effHeader,
      signatureText: effSignatureText,
      signatureImageBase64: effSignatureImg,
      fontOptions: effFont,
    });

    const key = docxStorageKey(docId);
    await storage.save(key, out, { contentType: DOCX_CONTENT_TYPE });
    return res.json({ ok: true, key, size: out.length, generatedAt: Date.now() });
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
    const key = docxStorageKey(docId);
    await storage.save(key, out, { contentType: DOCX_CONTENT_TYPE });
    return res.json({ ok: true, key, size: out.length, generatedAt: Date.now() });
  } catch (err) {
    console.error('[word/create-blank] Erreur:', err.message);
    return res.status(500).json({ error: 'blank-creation-failed', message: err.message });
  }
});

// Helpers purs exposés pour les tests unitaires (sanitisation des clés de
// stockage → anti-path-traversal). Voir routes/__tests__/wordRoute.test.js.
router._private = { docxStorageKey, templateStorageKey };

module.exports = router;
