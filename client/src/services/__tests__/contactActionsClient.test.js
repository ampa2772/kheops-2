import apiClient from '../apiClient';
import contactActionsClient from '../contactActionsClient';

jest.mock('../apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

describe('contactActionsClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('charge le contexte cloisonné du contact', async () => {
    apiClient.get.mockResolvedValue({ data: { contact: { id: 'c-1' }, dossiers: [] } });
    await contactActionsClient.getContext('c/1');
    expect(apiClient.get).toHaveBeenCalledWith('/api/contact-actions/c%2F1/context');
  });

  it('fige la clé du brouillon de courrier dans l’en-tête', async () => {
    apiClient.post.mockResolvedValue({ data: { letter: { documentId: 'doc-1' } } });
    await contactActionsClient.createLetter('c-1', { dossierId: 'd-1', idempotencyKey: 'letter-key' });
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/contact-actions/c-1/letters',
      expect.objectContaining({ dossierId: 'd-1', idempotencyKey: 'letter-key' }),
      { headers: { 'Idempotency-Key': 'letter-key' } },
    );
  });
});
