// Tests A16 — attach-to-matter refuse les PJ trop grosses / de type dangereux
// AVANT tout upload de stockage (défense mémoire + intégrité).

const mongoose = require('mongoose');

function loadHandlerWithAttachment(attachment, { maxBytes } = {}) {
  jest.resetModules();
  if (maxBytes != null) process.env.STORAGE_MAX_ATTACHMENT_BYTES = String(maxBytes);
  else delete process.env.STORAGE_MAX_ATTACHMENT_BYTES;

  const accountId = new mongoose.Types.ObjectId();
  const tenantId = new mongoose.Types.ObjectId();
  const ownerUserId = new mongoose.Types.ObjectId();

  const account = { _id: accountId, tenantId, ownerUserId, encryptedPassword: 'mailenc:v1:x', username: 'u', email: 'u@x' };
  const query = { select: jest.fn().mockResolvedValue(account), then: (r, j) => Promise.resolve(account).then(r, j) };
  jest.doMock('../../models/Mail/MailAccount', () => {
    function MailAccount() {}
    MailAccount.SECURITY_MODES = ['ssl_tls', 'starttls', 'none'];
    MailAccount.findOne = jest.fn(() => query);
    return MailAccount;
  });
  jest.doMock('../../models/Storage/StoredDocument', () => function StoredDocument() {});

  const ensureDossierOwnership = jest.fn().mockResolvedValue(true);
  jest.doMock('../../utils/ownershipHelpers', () => ({ ensureDossierOwnership }));
  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../middlewares/requireTenant', () => (req, res, next) => next());
  jest.doMock('../../services/mail/credentialCrypto', () => ({ decrypt: jest.fn(() => 'pw'), encrypt: jest.fn() }));
  jest.doMock('../../services/mail/imapClient', () => ({
    decodeMessageId: jest.fn(() => ({ accountId: String(accountId), folder: 'INBOX', uid: 10 })),
    getMessage: jest.fn().mockResolvedValue({ attachments: [attachment] }),
  }));
  jest.doMock('../../services/mail/smtpClient', () => ({}));
  jest.doMock('../../services/mail/presets', () => ({ listPresets: jest.fn(() => []) }));

  const uploadVersion = jest.fn();
  jest.doMock('../../services/storage', () => ({
    getStorageProvider: jest.fn().mockResolvedValue({ createVersionId: () => 'v1', uploadVersion, deleteVersion: jest.fn() }),
    resolveTenantId: jest.fn(() => tenantId),
    toTenantObjectId: jest.fn(() => ownerUserId),
    assertUploadCompleted: jest.fn(), // A4 : no-op
  }));
  const reserveQuota = jest.fn().mockResolvedValue({ usedBytes: 0 });
  class QuotaExceededError extends Error {}
  jest.doMock('../../services/storage/quota', () => ({
    QuotaExceededError, reserveQuota, releaseQuota: jest.fn(), getUsage: jest.fn().mockResolvedValue({ usedBytes: 0 }),
  }));

  const router = require('../mailAccounts');
  const layer = router.stack.find((l) => l.route?.path === '/messages/:id/attach-to-matter');
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  return { handler, uploadVersion, reserveQuota, ownerUserId };
}

function fakeReqRes(dossierId) {
  const req = {
    user: 'userA',
    params: { id: 'encoded' },
    body: { dossierId: String(dossierId), attachmentIndex: 0 },
    method: 'POST',
    originalUrl: '/api/mail/messages/encoded/attach-to-matter',
  };
  const res = {
    statusCode: 200,
    status: jest.fn(function (c) { this.statusCode = c; return this; }),
    json: jest.fn(function (p) { this.payload = p; return this; }),
  };
  return { req, res };
}

async function settle(handler, req, res) {
  await handler(req, res);
  for (let i = 0; i < 50 && res.status.mock.calls.length === 0; i++) {
    await new Promise((r) => setImmediate(r));
  }
}

const DOSSIER = new mongoose.Types.ObjectId().toString();
const b64 = (s) => Buffer.from(s).toString('base64');

afterEach(() => { delete process.env.STORAGE_MAX_ATTACHMENT_BYTES; });

test('🔒 type dangereux (.exe) → 415, aucun upload', async () => {
  const { handler, uploadVersion, reserveQuota } = loadHandlerWithAttachment({
    index: 0, filename: 'virus.exe', mime: 'application/x-msdownload', size: 3, contentBase64: b64('abc'),
  });
  const { req, res } = fakeReqRes(DOSSIER);
  await settle(handler, req, res);
  expect(res.status).toHaveBeenCalledWith(415);
  expect(reserveQuota).not.toHaveBeenCalled(); // rejet AVANT toute réservation
  expect(uploadVersion).not.toHaveBeenCalled();
});

test('🔒 taille annoncée > limite → 413, aucun upload', async () => {
  const { handler, uploadVersion, assertWithinQuota } = loadHandlerWithAttachment(
    { index: 0, filename: 'gros.pdf', mime: 'application/pdf', size: 10, contentBase64: b64('0123456789') },
    { maxBytes: 5 },
  );
  const { req, res } = fakeReqRes(DOSSIER);
  await settle(handler, req, res);
  expect(res.status).toHaveBeenCalledWith(413);
  expect(uploadVersion).not.toHaveBeenCalled();
});

test('🔒 taille réelle décodée > limite même si métadonnée absente → 413', async () => {
  // size non fourni → le contrôle précoce passe, mais buffer.length (10) > 5.
  const { handler, uploadVersion } = loadHandlerWithAttachment(
    { index: 0, filename: 'gros.pdf', mime: 'application/pdf', contentBase64: b64('0123456789') },
    { maxBytes: 5 },
  );
  const { req, res } = fakeReqRes(DOSSIER);
  await settle(handler, req, res);
  expect(res.status).toHaveBeenCalledWith(413);
  expect(uploadVersion).not.toHaveBeenCalled();
});

test('PDF normal sous la limite → atteint l\'upload (policy laisse passer)', async () => {
  const { handler, uploadVersion, reserveQuota } = loadHandlerWithAttachment(
    { index: 0, filename: 'acte.pdf', mime: 'application/pdf', size: 3, contentBase64: b64('abc') },
  );
  uploadVersion.mockResolvedValue({ storageKey: 'k', size: 3, mime: 'application/pdf', filename: 'acte.pdf' });
  const { req, res } = fakeReqRes(DOSSIER);
  await settle(handler, req, res);
  // La politique a laissé passer : quota réservé + upload tenté.
  expect(reserveQuota).toHaveBeenCalled();
  expect(uploadVersion).toHaveBeenCalled();
});
