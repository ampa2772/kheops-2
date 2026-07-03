// Tests du téléchargement navigateur des documents Word
// (GET /api/word/:docId/download → blob → enregistrement fichier).

jest.mock('../apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import apiClient from '../apiClient';
import { downloadWordDocument, classifyWordDownloadError } from '../wordDocumentClient';

beforeEach(() => {
  window.URL.createObjectURL = jest.fn(() => 'blob:fausse-adresse');
  window.URL.revokeObjectURL = jest.fn();
});
afterEach(() => jest.clearAllMocks());

test('télécharge le blob et déclenche l\'enregistrement sous le bon nom', async () => {
  const blob = new Blob(['contenu'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  apiClient.get.mockResolvedValue({ data: blob });
  const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  await downloadWordDocument('doc-1', 'Courrier.docx');

  expect(apiClient.get).toHaveBeenCalledWith('/api/word/doc-1/download', { responseType: 'blob' });
  expect(window.URL.createObjectURL).toHaveBeenCalledWith(blob);
  expect(clickSpy).toHaveBeenCalled();
  clickSpy.mockRestore();
});

test('sans nom fourni → nom par défaut <docId>.docx', async () => {
  apiClient.get.mockResolvedValue({ data: new Blob(['x']) });
  let capturedDownload = null;
  const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    capturedDownload = this.download;
  });

  await downloadWordDocument('doc-2');

  expect(capturedDownload).toBe('doc-2.docx');
  clickSpy.mockRestore();
});

test('l\'erreur réseau remonte à l\'appelant (pas d\'enregistrement)', async () => {
  apiClient.get.mockRejectedValue({ response: { status: 500 } });
  await expect(downloadWordDocument('doc-3')).rejects.toBeDefined();
  expect(window.URL.createObjectURL).not.toHaveBeenCalled();
});

describe('classifyWordDownloadError', () => {
  test('404 → message « pas encore de fichier serveur » (héritage ancien système)', () => {
    const r = classifyWordDownloadError({ response: { status: 404 } });
    expect(r.code).toBe('DOCX_ABSENT');
    expect(r.message).toMatch(/pas encore de fichier/);
  });
  test('403 → accès refusé', () => {
    expect(classifyWordDownloadError({ response: { status: 403 } }).code).toBe('ACCES_REFUSE');
  });
  test('panne quelconque → message générique', () => {
    expect(classifyWordDownloadError(new Error('offline')).code).toBe('TELECHARGEMENT_ECHOUE');
  });
});
