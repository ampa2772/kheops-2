const express = require('express');
const crypto = require('crypto');
const auth = require('../middlewares/middleware-auth');
const { ensureContactOwnership, ensureDossierOwnership } = require('../utils/ownershipHelpers');
const { resolveTenantId } = require('../services/tenantService');
const communications = require('../services/contactCommunicationService');
const { listAccounts } = require('../services/mail/oauthAccountService');
const audit = require('../utils/auditLogger');
const mailComposition = require('../services/mail/mailCompositionService');
const ContactLetterOperation = require('../models/Documents/ContactLetterOperation');

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function contextFor(req) {
  const [contact, dossiers, accounts] = await Promise.all([
    communications.loadContact(req.params.id),
    communications.linkedDossiers({ userId: req.user, contactId: req.params.id }),
    listAccounts({ userId: req.user }),
  ]);
  return { contact, dossiers, accounts };
}

router.get('/:id/context', auth, asyncRoute(async (req, res) => {
  if (!(await ensureContactOwnership(req, res, req.params.id))) return;
  const context = await contextFor(req);
  res.json(context);
}));

router.post('/:id/email-drafts', auth, asyncRoute(async (req, res) => {
  if (!(await ensureContactOwnership(req, res, req.params.id))) return;
  const context = await contextFor(req);
  const dossier = req.body?.dossierId
    ? context.dossiers.find((item) => item.id === String(req.body.dossierId))
    : (context.dossiers.length === 1 ? context.dossiers[0] : null);
  if (req.body?.dossierId && !dossier) return res.status(403).json({ error: 'DOSSIER_NOT_ACCESSIBLE' });
  const account = context.accounts.find((item) => item.isDefault) || context.accounts[0] || null;
  const tenantId = await resolveTenantId(req.user);
  const signature = await mailComposition.resolveSignature({
    tenantId,
    userId: req.user,
    accountId: account?.id || null,
  });
  const draft = mailComposition.appendSignature({
    idempotencyKey: `contact-email:${req.params.id}:${crypto.randomUUID()}`,
    contactId: req.params.id,
    contactIds: [req.params.id],
    to: context.contact.emails,
    accountId: account?.id || null,
    dossierId: dossier?.id || null,
    subject: dossier?.reference ? `Dossier ${dossier.reference}` : '',
    bodyText: '',
    bodyHtml: '',
  }, signature);
  audit.create(req, 'mailDraft', draft.idempotencyKey, {
    contactId: req.params.id,
    dossierId: draft.dossierId,
    addressCount: draft.to.length,
  });
  res.status(201).json({ draft, ...context });
}));

router.post('/:id/letters', auth, asyncRoute(async (req, res) => {
  if (!(await ensureContactOwnership(req, res, req.params.id))) return;
  if (!(await ensureDossierOwnership(req, res, req.body?.dossierId))) return;
  const tenantId = await resolveTenantId(req.user);
  const idempotencyKey = String(req.get('Idempotency-Key') || req.body?.idempotencyKey || '').trim();
  if (!idempotencyKey || idempotencyKey.length > 240) {
    return res.status(400).json({
      error: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Une clé d’idempotence est requise pour créer le courrier sans doublon.',
    });
  }
  let operation;
  try {
    operation = await ContactLetterOperation.create({
      tenantId,
      userId: req.user,
      contactId: req.params.id,
      dossierId: req.body.dossierId,
      idempotencyKey,
      status: 'preparing',
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    operation = await ContactLetterOperation.findOne({ tenantId, userId: req.user, idempotencyKey });
    if (operation?.status === 'created') {
      return res.json({
        letter: {
          ...operation.result.toObject(),
          documentId: String(operation.result.documentId),
          dossierId: String(operation.dossierId),
          storedDocumentId: String(operation.result.storedDocumentId),
          status: 'draft',
        },
        reused: true,
      });
    }
    if (operation?.status === 'preparing') {
      return res.status(409).json({
        error: 'LETTER_CREATION_IN_PROGRESS',
        message: 'Ce courrier est déjà en cours de création.',
      });
    }
    operation.status = 'preparing';
    operation.lastError = { code: null, at: null };
    await operation.save();
  }
  const contact = await communications.loadContact(req.params.id);
  let letter;
  try {
    letter = await communications.createLetter({
      tenantId,
      userId: req.user,
      dossierId: req.body.dossierId,
      contact,
      payload: { ...req.body, idempotencyKey },
    });
    operation.status = 'created';
    operation.result = {
      documentId: letter.documentId,
      storedDocumentId: letter.storedDocumentId,
      versionId: letter.versionId,
      title: letter.title,
      filename: letter.filename,
      editor: letter.editor,
    };
    await operation.save();
  } catch (error) {
    operation.status = 'failed';
    operation.lastError = { code: String(error?.code || error?.name || 'LETTER_CREATION_FAILED').slice(0, 120), at: new Date() };
    await operation.save();
    throw error;
  }
  audit.create(req, 'contactLetter', letter.documentId, {
    contactId: req.params.id,
    dossierId: letter.dossierId,
    versionId: letter.versionId,
    editor: letter.editor,
  });
  res.status(201).json({ letter, reused: false });
}));

module.exports = router;
