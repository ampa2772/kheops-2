import apiClient from '../apiClient';
import mailSyncClient from '../mailSyncClient';

jest.mock('../apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

describe('mailSyncClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('envoie la même clé d’idempotence dans le corps et l’en-tête', async () => {
    apiClient.post.mockResolvedValue({ data: { operation: { id: 'op-1' } } });
    await mailSyncClient.sendMessage({ to: ['client@example.fr'], idempotencyKey: 'stable-123' });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/mail-sync/messages/send',
      expect.objectContaining({ idempotencyKey: 'stable-123' }),
      { headers: { 'Idempotency-Key': 'stable-123' } },
    );
  });

  it('utilise le contrat documentaire pour envoyer des artefacts immuables', async () => {
    const payload = {
      dossierId: 'd1', versionId: 'v7', artifactIds: ['a-docx', 'a-pdf'], idempotencyKey: 'document-stable-7',
    };
    apiClient.post.mockResolvedValue({ data: { operation: { id: 'op-document' } } });
    await mailSyncClient.sendDocumentMessage('doc/7', payload);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/documents/doc%2F7/send-by-email',
      payload,
      { headers: { 'Idempotency-Key': 'document-stable-7' } },
    );
  });

  it('utilise les flux OAuth dédiés à la messagerie', async () => {
    apiClient.post.mockResolvedValue({ data: { authorizationUrl: 'https://accounts.example/consent' } });
    await expect(mailSyncClient.getConnectUrl('microsoft')).resolves.toBe('https://accounts.example/consent');
    expect(apiClient.post).toHaveBeenCalledWith('/api/auth/microsoft/mail-connect-url');
  });

  it('refuse un fournisseur inconnu sans appel réseau', async () => {
    await expect(mailSyncClient.getConnectUrl('imap')).rejects.toThrow('inconnu');
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it('télécharge une pièce archivée en conservant son nom UTF-8', async () => {
    const blob = new Blob(['preuve'], { type: 'application/pdf' });
    apiClient.get.mockResolvedValue({
      data: blob,
      headers: {
        'content-disposition': "attachment; filename=preuve.pdf; filename*=UTF-8''Pi%C3%A8ce%20sign%C3%A9e.pdf",
        'content-type': 'application/pdf',
      },
    });
    await expect(mailSyncClient.downloadAttachment('m/1', 2)).resolves.toEqual({
      blob,
      filename: 'Pièce signée.pdf',
      mime: 'application/pdf',
    });
    expect(apiClient.get).toHaveBeenCalledWith('/api/mail-sync/messages/m%2F1/attachments/2', { responseType: 'blob' });
  });

  it('normalise les dossiers et les trois familles de contacts pour le classement', async () => {
    apiClient.get
      .mockResolvedValueOnce({ data: [{ _id: 'd1', reference: '2026-001', dossier: { dossier: { nom: 'Martin c/ Durand' } } }] })
      .mockResolvedValueOnce({ data: {
        physiques: [{ _id: 'c1', prenoms: 'Alice', nom: 'Martin', email: 'alice@example.fr' }],
        organisationsPrivees: [{ _id: 'c2', raisonSociale: 'Acme' }],
        organisationsPubliques: [{ _id: 'c3', denomination: 'Mairie' }],
      } });
    const candidates = await mailSyncClient.listMatterCandidates();
    expect(candidates.dossiers[0]).toEqual({ id: 'd1', reference: '2026-001', name: 'Martin c/ Durand' });
    expect(candidates.contacts.map((item) => item.displayName)).toEqual(['Alice Martin', 'Acme', 'Mairie']);
  });
});
