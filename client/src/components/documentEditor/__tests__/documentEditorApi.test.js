import apiClient from '../../../services/apiClient';

import { reconvertEditorOriginal } from '../documentEditorApi';

jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
  },
}));

describe('documentEditorApi.reconvertEditorOriginal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('appelle la route de reconversion avec la révision attendue', async () => {
    apiClient.post.mockResolvedValue({ data: { revision: 9 } });

    await expect(reconvertEditorOriginal('document ancien/1', 8)).resolves.toEqual({ revision: 9 });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/document-editor/document%20ancien%2F1/reconvert-original',
      { expectedRevision: 8 },
    );
  });

  test('transmet le brouillon local lorsqu’il doit être archivé', async () => {
    const localDraft = { blocks: [{ type: 'paragraph', runs: [{ text: 'Brouillon' }] }] };
    apiClient.post.mockResolvedValue({ data: { revision: 10 } });

    await reconvertEditorOriginal('document-2', 9, localDraft);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/document-editor/document-2/reconvert-original',
      { expectedRevision: 9, localDraft },
    );
  });
});
