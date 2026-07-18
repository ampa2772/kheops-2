jest.mock('../../middlewares/middleware-auth', () => (req, _res, next) => next());

const mockEnsureDocOwnership = jest.fn();
jest.mock('../../utils/ownershipHelpers', () => ({
  ensureDocOwnership: (...args) => mockEnsureDocOwnership(...args),
}));

const mockAccountSort = jest.fn();
const mockAccountFindOne = jest.fn(() => ({ sort: mockAccountSort }));
jest.mock('../../models/Mail/OAuthMailAccount', () => ({
  findOne: (...args) => mockAccountFindOne(...args),
}));

const mockListAccounts = jest.fn();
jest.mock('../../services/mail/oauthAccountService', () => ({
  listAccounts: (...args) => mockListAccounts(...args),
}));

const mockCreateSendOperation = jest.fn();
const mockClaimNextOperation = jest.fn();
const mockRunClaimedOperation = jest.fn();
jest.mock('../../services/mail/mailSendService', () => ({
  createSendOperation: (...args) => mockCreateSendOperation(...args),
  claimNextOperation: (...args) => mockClaimNextOperation(...args),
  runClaimedOperation: (...args) => mockRunClaimedOperation(...args),
  publicOperation: (operation) => operation,
}));

jest.mock('../../utils/auditLogger', () => ({ create: jest.fn() }));

const router = require('../documentMail');

function sendHandler() {
  const layer = router.stack.find((item) => item.route?.path === '/:id/send-by-email' && item.route.methods.post);
  if (!layer) throw new Error('Route documentMail introuvable');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function responseMock() {
  return {
    statusCode: 200,
    status: jest.fn(function status(code) { this.statusCode = code; return this; }),
    json: jest.fn(function json(payload) { this.payload = payload; return this; }),
  };
}

describe('documentMail — artefacts de publication exacts', () => {
  const userId = '64f0a1b2c3d4e5f6a7b8c9d0';
  const tenantId = '64f0a1b2c3d4e5f6a7b8c9d1';
  const dossierId = '64f0a1b2c3d4e5f6a7b8c9d2';
  const documentId = '64f0a1b2c3d4e5f6a7b8c9d3';
  const account = { _id: '64f0a1b2c3d4e5f6a7b8c9d4', tenantId, provider: 'google', email: 'cabinet@example.fr' };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureDocOwnership.mockResolvedValue({ ok: true, tenantId, dossierId });
    mockListAccounts.mockResolvedValue([]);
    mockAccountSort.mockResolvedValue(account);
    mockCreateSendOperation.mockResolvedValue({
      reused: false,
      operation: { _id: 'operation-1', status: 'reconciled', provider: 'google', attachments: [] },
    });
    mockClaimNextOperation.mockResolvedValue(null);
  });

  test('accepte both et transmet deux artefacts de la même version exacte', async () => {
    const req = {
      params: { id: documentId }, user: userId,
      body: {
        versionId: 'v-12', formats: 'both',
        to: 'client@example.fr', subject: 'Conclusions', bodyText: 'Veuillez trouver ci-joint.',
        idempotencyKey: 'mail-v12',
      },
      get: jest.fn(() => null),
    };
    const res = responseMock();
    const next = jest.fn();

    await sendHandler()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(mockCreateSendOperation).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      account,
      payload: expect.objectContaining({
        dossierId,
        documentId,
        documentVersionId: 'v-12',
        attachments: [
          { documentId, versionId: 'v-12', format: 'docx' },
          { documentId, versionId: 'v-12', format: 'pdf' },
        ],
      }),
    }));
    expect(res.statusCode).toBe(201);
  });

  test('accepte explicitement les identifiants d’artefact sans changer de version', async () => {
    const artifactIds = ['64f0a1b2c3d4e5f6a7b8c9e1', '64f0a1b2c3d4e5f6a7b8c9e2'];
    const req = {
      params: { id: documentId }, user: userId,
      body: {
        versionId: 'v-12', artifactIds,
        to: 'client@example.fr', bodyText: 'Pièces jointes exactes', idempotencyKey: 'mail-artifacts-v12',
      },
      get: jest.fn(() => null),
    };
    const res = responseMock();

    await sendHandler()(req, res, jest.fn());

    expect(mockCreateSendOperation.mock.calls[0][0].payload.attachments).toEqual([
      { artifactId: artifactIds[0], documentId, versionId: 'v-12' },
      { artifactId: artifactIds[1], documentId, versionId: 'v-12' },
    ]);
  });

  test('refuse tout envoi sans version documentaire exacte', async () => {
    const req = {
      params: { id: documentId }, user: userId,
      body: { formats: 'pdf', to: 'client@example.fr' },
      get: jest.fn(() => null),
    };
    const res = responseMock();

    await sendHandler()(req, res, jest.fn());

    expect(res.statusCode).toBe(400);
    expect(res.payload.error).toBe('MAIL_DOCUMENT_VERSION_REQUIRED');
    expect(mockCreateSendOperation).not.toHaveBeenCalled();
  });
});
