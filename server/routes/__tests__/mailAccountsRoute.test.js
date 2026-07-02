const mongoose = require('mongoose');

describe('mailAccounts route helpers', () => {
  function loadRoute() {
    jest.resetModules();
    jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
    jest.doMock('../../models/Mail/MailAccount', () => {
      function MailAccount() {}
      MailAccount.SECURITY_MODES = ['ssl_tls', 'starttls', 'none'];
      MailAccount.findOne = jest.fn();
      MailAccount.find = jest.fn();
      return MailAccount;
    });
    return require('../mailAccounts');
  }

  test('normalizeAccountPayload accepte les aliases de securite et ne garde pas de plaintext hors payload', () => {
    const route = loadRoute();
    const payload = route._private.normalizeAccountPayload({
      email: ' USER@EXAMPLE.COM ',
      displayName: 'User',
      password: 'secret',
      imap: { host: 'imap.example.com', port: '993', security: 'SSL/TLS' },
      smtp: { host: 'smtp.example.com', port: 587, security: 'START-TLS' },
    });

    expect(payload).toMatchObject({
      email: 'user@example.com',
      username: 'user@example.com',
      imap: { host: 'imap.example.com', port: 993, security: 'ssl_tls' },
      smtp: { host: 'smtp.example.com', port: 587, security: 'starttls' },
    });
    expect(payload.password).toBe('secret');
  });

  test('sanitizeAccount ne renvoie jamais encryptedPassword et signale TLS none', () => {
    const route = loadRoute();
    const account = {
      _id: new mongoose.Types.ObjectId(),
      tenantId: new mongoose.Types.ObjectId(),
      ownerUserId: new mongoose.Types.ObjectId(),
      type: 'imap',
      email: 'u@example.com',
      displayName: 'U',
      username: 'u@example.com',
      imap: { host: 'imap.example.com', port: 143, security: 'none' },
      smtp: { host: 'smtp.example.com', port: 25, security: 'none' },
      encryptedPassword: 'mailenc:v1:secret',
      status: 'untested',
      toObject() {
        return { ...this };
      },
    };

    const sanitized = route._private.sanitizeAccount(account);
    expect(sanitized.encryptedPassword).toBeUndefined();
    expect(JSON.stringify(sanitized)).not.toContain('mailenc:v1:secret');
    expect(sanitized.warnings).toEqual(['IMAP sans TLS configure.', 'SMTP sans TLS configure.']);
  });
});
