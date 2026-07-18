import apiClient from '../apiClient';
import {
  googleConnectUrl,
  microsoftConnectUrl,
  sharePointConnectUrl,
} from '../storageClient';

jest.mock('../apiClient', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

describe('consentements de stockage dédiés', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each([
    ['Google Drive', googleConnectUrl, '/api/auth/google/connect-url'],
    ['OneDrive', microsoftConnectUrl, '/api/auth/microsoft/connect-url'],
    ['SharePoint', sharePointConnectUrl, '/api/auth/microsoft/sharepoint-connect-url'],
  ])('%s utilise son endpoint authentifié dédié', async (_label, connect, endpoint) => {
    apiClient.post.mockResolvedValueOnce({ data: { authorizationUrl: `https://identity.test/${encodeURIComponent(endpoint)}` } });

    await expect(connect()).resolves.toMatch(/^https:\/\/identity\.test\//);
    expect(apiClient.post).toHaveBeenCalledWith(endpoint);
  });

  test('refuse une réponse OAuth dépourvue d’adresse', async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    await expect(microsoftConnectUrl()).rejects.toThrow(/adresse de connexion/i);
  });
});

