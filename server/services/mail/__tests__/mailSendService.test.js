const mockResolvePublicationArtifact = jest.fn();
jest.mock('../../documentPublicationService', () => ({
  resolvePublicationArtifact: (...args) => mockResolvePublicationArtifact(...args),
}));

const mockStorage = { exists: jest.fn(), read: jest.fn() };
jest.mock('../../fileStorage', () => ({ getFileStorage: () => mockStorage }));

const send = require('../mailSendService');

describe('mailSendService — validation avant outbox', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.exists.mockResolvedValue(true);
  });

  test('exige une clé idempotente stable', () => {
    expect(send.normalizedIdempotencyKey(' operation-1 ')).toBe('operation-1');
    expect(() => send.normalizedIdempotencyKey('')).toThrow(/idempotence/);
    expect(() => send.normalizedIdempotencyKey('x'.repeat(241))).toThrow(/idempotence/);
  });

  test('normalise et valide les destinataires', () => {
    expect(send.validateRecipients('Alice <a@example.fr>, b@example.fr', 'to', true)).toEqual([
      { name: 'Alice', email: 'a@example.fr' },
      { name: '', email: 'b@example.fr' },
    ]);
    expect(() => send.validateRecipients('pas-une-adresse', 'to', true)).toThrow(/destinataire/);
  });

  test('ne relance pas les erreurs fonctionnelles de pièce jointe', () => {
    expect(send.retryableSendError({ statusCode: 413 })).toBe(false);
    expect(send.retryableSendError({ response: { status: 503 } })).toBe(true);
    expect(send.retryableSendError({ retryable: false })).toBe(false);
  });

  test('fige un artefact PDF exact dans la portée cabinet+dossier+document+version', async () => {
    mockResolvePublicationArtifact.mockResolvedValue({
      _id: '64f0a1b2c3d4e5f6a7b8c9d1',
      tenantId: '64f0a1b2c3d4e5f6a7b8c9d2',
      dossierId: '64f0a1b2c3d4e5f6a7b8c9d3',
      documentId: '64f0a1b2c3d4e5f6a7b8c9d4',
      versionId: 'v-exacte',
      format: 'pdf',
      filename: 'Conclusions.pdf',
      mime: 'application/pdf',
      storageKey: 'publication-artifacts/exact.pdf',
      size: 2048,
      checksum: 'a'.repeat(64),
    });

    const frozen = await send.freezeDocumentAttachments({
      tenantId: '64f0a1b2c3d4e5f6a7b8c9d2',
      dossierId: '64f0a1b2c3d4e5f6a7b8c9d3',
      requested: [{
        documentId: '64f0a1b2c3d4e5f6a7b8c9d4',
        versionId: 'v-exacte',
        format: 'pdf',
      }],
    });

    expect(mockResolvePublicationArtifact).toHaveBeenCalledWith({
      tenantId: '64f0a1b2c3d4e5f6a7b8c9d2',
      dossierId: '64f0a1b2c3d4e5f6a7b8c9d3',
      documentId: '64f0a1b2c3d4e5f6a7b8c9d4',
      versionId: 'v-exacte',
      format: 'pdf',
      artifactId: null,
    });
    expect(frozen).toEqual([expect.objectContaining({
      artifactId: '64f0a1b2c3d4e5f6a7b8c9d1',
      versionId: 'v-exacte',
      format: 'pdf',
      checksum: 'a'.repeat(64),
    })]);
  });

  test('refuse de substituer une version non préparée au format demandé', async () => {
    mockResolvePublicationArtifact.mockResolvedValue(null);
    await expect(send.freezeDocumentAttachments({
      tenantId: '64f0a1b2c3d4e5f6a7b8c9d2',
      dossierId: '64f0a1b2c3d4e5f6a7b8c9d3',
      requested: [{
        documentId: '64f0a1b2c3d4e5f6a7b8c9d4',
        versionId: 'v-exacte',
        format: 'docx',
      }],
    })).rejects.toMatchObject({ code: 'MAIL_PUBLICATION_ARTIFACT_NOT_FOUND', statusCode: 409 });
  });

  test('refuse une sélection par format sans document et version exacts', async () => {
    await expect(send.freezeDocumentAttachments({
      tenantId: '64f0a1b2c3d4e5f6a7b8c9d2',
      dossierId: '64f0a1b2c3d4e5f6a7b8c9d3',
      requested: [{ format: 'pdf' }],
    })).rejects.toMatchObject({ code: 'MAIL_PUBLICATION_SCOPE_REQUIRED', statusCode: 400 });
    expect(mockResolvePublicationArtifact).not.toHaveBeenCalled();
  });

  test('n’expose jamais la clé de stockage interne dans le contrat public', () => {
    const result = send.publicOperation({
      _id: 'operation-1',
      attachments: [{
        artifactId: '64f0a1b2c3d4e5f6a7b8c9d1',
        documentId: '64f0a1b2c3d4e5f6a7b8c9d4',
        versionId: 'v-exacte',
        storageKey: 'publication-artifacts/secret.pdf',
        filename: 'Conclusions.pdf',
      }],
    });
    expect(result.attachments[0]).not.toHaveProperty('storageKey');
    expect(result.attachments[0]).toMatchObject({ versionId: 'v-exacte', filename: 'Conclusions.pdf' });
  });
});
