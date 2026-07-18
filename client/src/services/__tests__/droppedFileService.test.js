import apiClient from '../apiClient';
import { uploadStoredDocument } from '../storageClient';
import {
  filesFromDrop,
  isExternalFileDrag,
  MAX_DROPPED_FILE_BYTES,
  uploadDroppedFileWeb,
  validateDroppedFile,
} from '../droppedFileService';

jest.mock('../apiClient', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('../storageClient', () => ({
  uploadStoredDocument: jest.fn(),
}));

describe('droppedFileService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reconnait un depot de fichiers natif et stabilise la FileList', () => {
    const first = new File(['contenu'], 'Piece.pdf', { type: 'application/pdf' });
    const second = new File(['contenu'], 'Photo.jpg', { type: 'image/jpeg' });
    const transfer = {
      types: { 0: 'text/plain', 1: 'Files', length: 2 },
      files: { 0: first, 1: second, length: 2 },
    };

    expect(isExternalFileDrag(transfer)).toBe(true);
    expect(filesFromDrop(transfer)).toEqual([first, second]);
    expect(isExternalFileDrag({ types: ['text/plain'] })).toBe(false);
  });

  it('refuse avant tout appel reseau un executable ou un fichier de plus de 100 Mo', async () => {
    const executable = new File(['danger'], 'piece.PS1', { type: 'text/plain' });
    const oversized = {
      name: 'Archives.zip',
      type: 'application/zip',
      size: MAX_DROPPED_FILE_BYTES + 1,
    };

    expect(() => validateDroppedFile(executable)).toThrow(/scripts sont refusés/i);
    expect(() => validateDroppedFile(oversized)).toThrow(/100 Mo/i);
    await expect(uploadDroppedFileWeb(executable, 'dossier-1')).rejects.toThrow(/scripts sont refusés/i);
    expect(apiClient.post).not.toHaveBeenCalled();
    expect(uploadStoredDocument).not.toHaveBeenCalled();
  });

  it('cree la fiche, envoie les octets puis synchronise un document Word', async () => {
    const file = new File(['word'], 'Courrier.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const document = { _id: 'doc-1', nomDocument: 'Courrier.docx', categorie: 'dropped' };
    apiClient.post
      .mockResolvedValueOnce({ data: { newDocMetadata: document } })
      .mockResolvedValueOnce({ data: { ok: true } });
    uploadStoredDocument.mockResolvedValue({ document: { id: 'stored-1' } });

    await expect(uploadDroppedFileWeb(file, 'dossier-1', 'sous-dossier-1')).resolves.toEqual(document);

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/fusion/createDroppedDocumentMetadata', {
      dossierId: 'dossier-1',
      originalFileName: 'Courrier.docx',
      subfolderId: 'sous-dossier-1',
    });
    expect(uploadStoredDocument).toHaveBeenCalledWith(file, {
      dossierId: 'dossier-1',
      documentId: 'doc-1',
    });
    expect(apiClient.post.mock.calls[1][0]).toBe('/api/word/doc-1/sync');
  });

  it('supprime la fiche temporaire si le stockage autoritatif refuse les octets', async () => {
    const file = new File(['pdf'], 'Piece.pdf', { type: 'application/pdf' });
    apiClient.post
      .mockResolvedValueOnce({ data: { newDocMetadata: { _id: 'doc-2', nomDocument: 'Piece.pdf' } } })
      .mockResolvedValueOnce({ data: { ok: true } });
    uploadStoredDocument.mockRejectedValue({
      response: { status: 413, data: { message: 'Quota du cabinet depasse.' } },
    });

    await expect(uploadDroppedFileWeb(file, 'dossier-2')).rejects.toThrow(/Quota du cabinet depasse/i);
    expect(apiClient.post).toHaveBeenNthCalledWith(2, '/api/fusion/deleteDocument', {
      dossierId: 'dossier-2',
      docId: 'doc-2',
    });
  });
});
