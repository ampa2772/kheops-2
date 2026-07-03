// Tests des accès aux pièces jointes IMAP du service mailAccountService :
// téléchargement (blob) et contenu pour aperçu (arraybuffer).

jest.mock('../apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import apiClient from '../apiClient';
import mailAccountService from '../mailAccountService';

afterEach(() => jest.clearAllMocks());

test('downloadAttachment → GET route IMAP en blob', async () => {
  apiClient.get.mockResolvedValue({ data: new Blob(['x']) });
  await mailAccountService.downloadAttachment('msg-1', 2);
  expect(apiClient.get).toHaveBeenCalledWith(
    '/api/mail/messages/msg-1/attachments/2',
    { responseType: 'blob' },
  );
});

test('getAttachmentContent → même route en arraybuffer (aperçu inline)', async () => {
  apiClient.get.mockResolvedValue({ data: new ArrayBuffer(8), headers: { 'content-type': 'image/png' } });
  const res = await mailAccountService.getAttachmentContent('msg-1', 0);
  expect(apiClient.get).toHaveBeenCalledWith(
    '/api/mail/messages/msg-1/attachments/0',
    { responseType: 'arraybuffer' },
  );
  expect(res.headers['content-type']).toBe('image/png');
});

test('l\'identifiant de message est encodé dans l\'URL', async () => {
  apiClient.get.mockResolvedValue({ data: new Blob(['x']) });
  await mailAccountService.downloadAttachment('acc/INBOX/42', 1);
  expect(apiClient.get).toHaveBeenCalledWith(
    '/api/mail/messages/acc%2FINBOX%2F42/attachments/1',
    { responseType: 'blob' },
  );
});
