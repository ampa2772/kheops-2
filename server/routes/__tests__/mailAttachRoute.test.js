const mongoose = require('mongoose');

describe('mail attach-to-matter route', () => {
  test('importe une piece jointe IMAP vers StoredDocument via le provider storage', async () => {
    jest.resetModules();

    const tenantId = new mongoose.Types.ObjectId();
    const ownerUserId = new mongoose.Types.ObjectId();
    const accountId = new mongoose.Types.ObjectId();
    const dossierId = new mongoose.Types.ObjectId();
    const account = {
      _id: accountId,
      tenantId,
      ownerUserId,
      encryptedPassword: 'mailenc:v1:blob',
      imap: { host: 'imap.example.com', port: 993, security: 'ssl_tls' },
      smtp: { host: 'smtp.example.com', port: 465, security: 'ssl_tls' },
      username: 'u@example.com',
      email: 'u@example.com',
    };
    const query = {
      select: jest.fn().mockResolvedValue(account),
      then: (resolve, reject) => Promise.resolve(account).then(resolve, reject),
    };
    const findOne = jest.fn(() => query);
    jest.doMock('../../models/Mail/MailAccount', () => {
      function MailAccount() {}
      MailAccount.SECURITY_MODES = ['ssl_tls', 'starttls', 'none'];
      MailAccount.findOne = findOne;
      return MailAccount;
    });

    const save = jest.fn().mockResolvedValue(undefined);
    const storedDocs = [];
    jest.doMock('../../models/Storage/StoredDocument', () => function StoredDocument(data) {
      Object.assign(this, data);
      this._id = new mongoose.Types.ObjectId();
      this.save = save;
      this.toObject = () => ({
        _id: this._id,
        tenantId: this.tenantId,
        dossierId: this.dossierId,
        documentId: this.documentId,
        currentVersionId: this.currentVersionId,
        versions: this.versions,
      });
      storedDocs.push(this);
    });

    const ensureDossierOwnership = jest.fn().mockResolvedValue(true);
    jest.doMock('../../utils/ownershipHelpers', () => ({ ensureDossierOwnership }));
    jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
    jest.doMock('../../services/mail/credentialCrypto', () => ({
      decrypt: jest.fn(() => 'plain-password'),
      encrypt: jest.fn(),
    }));
    jest.doMock('../../services/mail/imapClient', () => ({
      decodeMessageId: jest.fn(() => ({ accountId: String(accountId), folder: 'INBOX', uid: 10 })),
      getMessage: jest.fn().mockResolvedValue({
        attachments: [{
          index: 0,
          filename: 'piece.pdf',
          mime: 'application/pdf',
          contentBase64: Buffer.from('pdf-content').toString('base64'),
        }],
      }),
    }));
    jest.doMock('../../services/mail/smtpClient', () => ({}));
    jest.doMock('../../services/mail/presets', () => ({ listPresets: jest.fn(() => []) }));

    const uploadVersion = jest.fn().mockResolvedValue({
      storageKey: 'tenants/t/matters/m/documents/d/versions/v/piece.pdf',
      size: Buffer.from('pdf-content').length,
      mime: 'application/pdf',
      filename: 'piece.pdf',
    });
    const provider = {
      createVersionId: jest.fn(() => 'version-1'),
      uploadVersion,
      deleteVersion: jest.fn(),
    };
    const reserveQuota = jest.fn().mockResolvedValue({ usedBytes: 11, quotaBytes: 100 });
    const releaseQuota = jest.fn().mockResolvedValue({ usedBytes: 0 });
    const getUsage = jest.fn().mockResolvedValue({ usedBytes: 11, quotaBytes: 100 });
    jest.doMock('../../services/storage', () => ({
      getStorageProvider: jest.fn().mockResolvedValue(provider),
      resolveTenantId: jest.fn(() => tenantId),
      toTenantObjectId: jest.fn(() => ownerUserId),
      assertUploadCompleted: jest.fn(), // A4 : no-op (provider de test non per-user)
    }));
    class QuotaExceededError extends Error {}
    jest.doMock('../../services/storage/quota', () => ({
      QuotaExceededError,
      reserveQuota,
      releaseQuota,
      getUsage,
    }));

    const router = require('../mailAccounts');
    const layer = router.stack.find((entry) => entry.route?.path === '/messages/:id/attach-to-matter');
    const handler = layer.route.stack[layer.route.stack.length - 1].handle;

    const req = {
      user: String(ownerUserId),
      params: { id: 'encoded-message-id' },
      body: { dossierId: String(dossierId), attachmentIndex: 0 },
      method: 'POST',
      originalUrl: '/api/mail/messages/encoded-message-id/attach-to-matter',
    };
    const res = {
      statusCode: 200,
      status: jest.fn(function status(code) {
        this.statusCode = code;
        return this;
      }),
      json: jest.fn(function json(payload) {
        this.payload = payload;
        return this;
      }),
    };

    await handler(req, res);

    expect(ensureDossierOwnership.mock.calls[0][0]).toBe(req);
    expect(ensureDossierOwnership.mock.calls[0][1]).toBe(res);
    expect(String(ensureDossierOwnership.mock.calls[0][2])).toBe(String(dossierId));
    const accountQuery = findOne.mock.calls[0][0];
    expect(String(accountQuery._id)).toBe(String(accountId));
    expect(String(accountQuery.tenantId)).toBe(String(tenantId));
    expect(String(accountQuery.ownerUserId)).toBe(String(ownerUserId));
    expect(reserveQuota).toHaveBeenCalledWith(tenantId, Buffer.from('pdf-content').length);
    const uploadPayload = uploadVersion.mock.calls[0][0];
    expect(String(uploadPayload.tenantId)).toBe(String(tenantId));
    expect(String(uploadPayload.matterId)).toBe(String(dossierId));
    expect(uploadPayload.versionId).toBe('version-1');
    expect(uploadPayload.filename).toBe('piece.pdf');
    expect(uploadPayload.buffer).toEqual(Buffer.from('pdf-content'));
    expect(uploadPayload.mime).toBe('application/pdf');
    expect(save).toHaveBeenCalled();
    expect(getUsage).toHaveBeenCalled();
    expect(releaseQuota).not.toHaveBeenCalled(); // succès → pas de rollback
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.payload.document.versions[0]).toMatchObject({
      versionId: 'version-1',
      filename: 'piece.pdf',
      mime: 'application/pdf',
    });
    expect(storedDocs).toHaveLength(1);
  });
});
