// Tests du mode WEB de createDocumentInDossier :
//   - génération serveur appelée avec les bonnes données ;
//   - échec du compagnon NON bloquant (le document reste créé) ;
//   - échec de la GÉNÉRATION → marche arrière (fiche fantôme retirée) + erreur claire.

jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../services/socketService', () => ({
  initSocket: jest.fn(() => ({ emit: jest.fn(), connected: false })),
}));
jest.mock('../../../services/companion/companionClient', () => ({
  openDocumentInWord: jest.fn(),
  triggerCompanionInstall: jest.fn(),
  isCompanionAvailable: jest.fn(),
}));

import apiClient from '../../../services/apiClient';
import { openDocumentInWord } from '../../../services/companion/companionClient';
import { createDocumentInDossier, createBlankDocument, DELETE_DOCUMENT_SUCCESS } from '../currentDossierSlice';

const DOC_ID = 'doc-123';
const DOSSIER_ID = 'dossier-1';
const metadataResponse = {
  data: {
    doc: { _id: DOC_ID, nomDocument: 'Courrier.docx' },
    dossier: { _id: DOSSIER_ID, dossier: { documents: [{ _id: DOC_ID }] } },
  },
};

beforeEach(() => {
  delete window.electron; // mode web pur
});
afterEach(() => jest.clearAllMocks());

test('web : métadonnées puis génération serveur avec les données du dossier', async () => {
  apiClient.post
    .mockResolvedValueOnce(metadataResponse) // /api/fusion/createDocument
    .mockResolvedValueOnce({ data: { ok: true } }); // /api/word/:id/generate
  openDocumentInWord.mockResolvedValue({});

  const dispatch = jest.fn();
  await createDocumentInDossier(DOSSIER_ID, 'Courrier', 'jwt', { id: 'U1' }, [], 'selectOneDestinataire', 'Courrier.docx')(dispatch);

  expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/fusion/createDocument', expect.objectContaining({
    dossierId: DOSSIER_ID, templateFileName: 'Courrier',
  }));
  expect(apiClient.post).toHaveBeenNthCalledWith(2, `/api/word/${DOC_ID}/generate`, expect.objectContaining({
    templateName: 'Courrier',
    clientData: expect.objectContaining({ userProfile: { id: 'U1' } }),
  }));
});

test('web : compagnon absent → NON bloquant, le document reste créé', async () => {
  apiClient.post
    .mockResolvedValueOnce(metadataResponse)
    .mockResolvedValueOnce({ data: { ok: true } });
  openDocumentInWord.mockRejectedValue(new Error('compagnon absent'));

  const dispatch = jest.fn();
  await expect(
    createDocumentInDossier(DOSSIER_ID, 'Courrier', 'jwt', {}, [], '', 'Courrier.docx')(dispatch)
  ).resolves.toBeDefined();
  // Aucune marche arrière : pas d'appel deleteDocument
  const deleteCalls = apiClient.post.mock.calls.filter(([url]) => url === '/api/fusion/deleteDocument');
  expect(deleteCalls).toHaveLength(0);
});

test('🔒 web : échec de génération → marche arrière (fiche retirée) + erreur claire', async () => {
  apiClient.post
    .mockResolvedValueOnce(metadataResponse) // création fiche OK
    .mockRejectedValueOnce({ response: { data: { message: 'Modèle introuvable dans le stockage : templates/X.docx.' } } }) // generate KO
    .mockResolvedValueOnce({ data: { ok: true } }); // rollback deleteDocument OK

  const dispatch = jest.fn();
  await expect(
    createDocumentInDossier(DOSSIER_ID, 'X', 'jwt', {}, [], '', 'X.docx')(dispatch)
  ).rejects.toThrow('Modèle introuvable');

  const deleteCall = apiClient.post.mock.calls.find(([url]) => url === '/api/fusion/deleteDocument');
  expect(deleteCall).toBeDefined();
  expect(deleteCall[1]).toEqual({ dossierId: DOSSIER_ID, docId: DOC_ID });
  expect(dispatch).toHaveBeenCalledWith({ type: DELETE_DOCUMENT_SUCCESS, payload: { docId: DOC_ID } });
  // Le compagnon n'est jamais sollicité pour un document non généré
  expect(openDocumentInWord).not.toHaveBeenCalled();
});

test('web : même la marche arrière en panne ne masque pas l\'erreur d\'origine', async () => {
  apiClient.post
    .mockResolvedValueOnce(metadataResponse)
    .mockRejectedValueOnce(new Error('génération KO'))
    .mockRejectedValueOnce(new Error('rollback KO'));

  const dispatch = jest.fn();
  await expect(
    createDocumentInDossier(DOSSIER_ID, 'X', 'jwt', {}, [], '', 'X.docx')(dispatch)
  ).rejects.toThrow(/génération du document a échoué/);
});

// ============================================================
// createBlankDocument — document vierge en mode web
// ============================================================
describe('createBlankDocument (mode web)', () => {
  test('fiche puis fabrication serveur du .docx vierge', async () => {
    apiClient.post
      .mockResolvedValueOnce(metadataResponse) // /api/fusion/createDocument
      .mockResolvedValueOnce({ data: { ok: true } }); // /api/word/:id/create-blank

    const dispatch = jest.fn();
    await createBlankDocument(DOSSIER_ID, null)(dispatch);

    expect(apiClient.post).toHaveBeenNthCalledWith(1, '/api/fusion/createDocument', expect.objectContaining({
      dossierId: DOSSIER_ID, templateFileName: 'blank.docx', finalDocumentName: 'Document.docx',
    }));
    expect(apiClient.post).toHaveBeenNthCalledWith(2, `/api/word/${DOC_ID}/create-blank`);
  });

  test('🔒 fabrication en échec → marche arrière (fiche retirée) + erreur claire', async () => {
    apiClient.post
      .mockResolvedValueOnce(metadataResponse) // fiche OK
      .mockRejectedValueOnce({ response: { data: { message: 'stockage indisponible' } } }) // create-blank KO
      .mockResolvedValueOnce({ data: { ok: true } }); // rollback OK

    const dispatch = jest.fn();
    await expect(createBlankDocument(DOSSIER_ID, null)(dispatch)).rejects.toThrow('stockage indisponible');

    const deleteCall = apiClient.post.mock.calls.find(([url]) => url === '/api/fusion/deleteDocument');
    expect(deleteCall).toBeDefined();
    expect(deleteCall[1]).toEqual({ dossierId: DOSSIER_ID, docId: DOC_ID });
    expect(dispatch).toHaveBeenCalledWith({ type: DELETE_DOCUMENT_SUCCESS, payload: { docId: DOC_ID } });
  });

  test('mode Electron inchangé : IPC appelé, pas de route create-blank', async () => {
    window.electron = { handleBlankDocumentCreation: jest.fn().mockResolvedValue({ success: true }) };
    apiClient.post.mockResolvedValueOnce(metadataResponse);

    const dispatch = jest.fn();
    await createBlankDocument(DOSSIER_ID, null)(dispatch);

    expect(window.electron.handleBlankDocumentCreation).toHaveBeenCalledWith({
      docId: DOC_ID, fileName: 'Courrier.docx',
    });
    const blankCalls = apiClient.post.mock.calls.filter(([url]) => url.includes('create-blank'));
    expect(blankCalls).toHaveLength(0);
  });
});
