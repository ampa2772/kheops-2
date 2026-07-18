// Tests — migration de l'heritage Google Drive (Files_Clients -> Kheops2/Dossiers).
// Drive et les modeles sont mockes : on valide la LOGIQUE (deplacement, ownership,
// correspondance sans ambiguite, no-op propre), pas les appels reseau.

const mockFindFolderByName = jest.fn();
const mockListChildren = jest.fn();
const mockEnsureFolderPathForUser = jest.fn();
const mockEnsureChildFolderForUser = jest.fn();
const mockMoveItem = jest.fn();
const mockRenameItem = jest.fn();
const mockStoredCreate = jest.fn();
const mockStoredFindOne = jest.fn();
const mockUserDossierFind = jest.fn();
const mockDossierFindById = jest.fn();

jest.mock('../googleDriveClient', () => ({
  findFolderByName: (...a) => mockFindFolderByName(...a),
  listChildren: (...a) => mockListChildren(...a),
  ensureFolderPathForUser: (...a) => mockEnsureFolderPathForUser(...a),
  ensureChildFolderForUser: (...a) => mockEnsureChildFolderForUser(...a),
  moveItem: (...a) => mockMoveItem(...a),
  renameItem: (...a) => mockRenameItem(...a),
}));
jest.mock('../../../models/Storage/StoredDocument', () => ({
  create: (...a) => mockStoredCreate(...a),
  findOne: (...a) => mockStoredFindOne(...a),
}));
jest.mock('../../../models/Folder/modelsLiaisons/UserDossier', () => ({ find: (...a) => mockUserDossierFind(...a) }));
jest.mock('../../../models/Folder/Dossier', () => ({ findById: (...a) => mockDossierFindById(...a) }));
jest.mock('../../tenantService', () => ({ resolveTenantId: jest.fn().mockResolvedValue('TENANT1') }));

function chain(result) {
  const obj = { select: () => obj, lean: () => Promise.resolve(result) };
  return obj;
}

const { migrateLegacyDriveForUser, archiveLegacyDrive } = require('../legacyDriveMigrator');

const FOLDER = 'application/vnd.google-apps.folder';
const DOSSIER_ID = '69c404a005c8e9ca29680665';

beforeEach(() => {
  jest.clearAllMocks();
  mockStoredFindOne.mockReturnValue(chain(null)); // pas de bytes connus par defaut
  mockStoredCreate.mockResolvedValue({});
  mockEnsureFolderPathForUser.mockResolvedValue({ folderId: 'TARGET_ROOT' });
  mockEnsureChildFolderForUser.mockResolvedValue('TARGET_SUB');
  mockMoveItem.mockResolvedValue({ ok: true });
});

test('pas de Files_Clients → no-op propre', async () => {
  mockFindFolderByName.mockResolvedValue(null);
  const r = await migrateLegacyDriveForUser('userA');
  expect(r.skipped).toBe('files-clients-introuvable');
  expect(mockMoveItem).not.toHaveBeenCalled();
});

test('deplace + enregistre un fichier correspondant sans ambiguite', async () => {
  mockFindFolderByName.mockResolvedValue('LEGACY_ROOT');
  mockUserDossierFind.mockReturnValue(chain([{ dossier: DOSSIER_ID }]));
  mockListChildren
    .mockResolvedValueOnce([{ id: 'LEG_DOS', name: DOSSIER_ID, mimeType: FOLDER }]) // enfants de Files_Clients
    .mockResolvedValueOnce([{ id: 'F1', name: 'Facture.docx', mimeType: 'application/x-docx', size: '13515' }]); // fichiers du dossier
  mockDossierFindById.mockReturnValue(chain({
    _id: DOSSIER_ID,
    reference: '202610',
    dossier: {
      dossier: { nom: 'Delmont c/ Abily' },
      documents: [{ _id: 'DOCENTRY1', nomDocument: 'Facture.docx', subfolderName: null }],
    },
  }));

  const r = await migrateLegacyDriveForUser('userA');

  // La recherche de Files_Clients est CONTRAINTE a la racine du Drive (l'ancienne
  // app le creait sous 'root') : pas de match d'un homonyme « partage avec moi ».
  expect(mockFindFolderByName).toHaveBeenCalledWith('userA', 'Files_Clients', { parentId: 'root' });
  expect(mockEnsureFolderPathForUser).toHaveBeenCalledWith('userA', ['Kheops2', 'Dossiers', 'Delmont c- Abily — 202610']);
  expect(mockMoveItem).toHaveBeenCalledWith('userA', 'F1', { addParentId: 'TARGET_ROOT', removeParentId: 'LEG_DOS' });
  expect(mockStoredCreate).toHaveBeenCalledWith(expect.objectContaining({
    documentId: 'DOCENTRY1',
    ownerUserId: 'userA',
    versions: [expect.objectContaining({ storageKey: 'googledrive:userA:F1', filename: 'Facture.docx' })],
  }));
  expect(r.moved).toBe(1);
  expect(r.registered).toBe(1);
});

test('ambiguite (2 fiches de meme nom) → deplace mais N\'enregistre PAS', async () => {
  mockFindFolderByName.mockResolvedValue('LEGACY_ROOT');
  mockUserDossierFind.mockReturnValue(chain([{ dossier: DOSSIER_ID }]));
  mockListChildren
    .mockResolvedValueOnce([{ id: 'LEG_DOS', name: DOSSIER_ID, mimeType: FOLDER }])
    .mockResolvedValueOnce([{ id: 'F1', name: 'Conclusion.docx', mimeType: 'application/x-docx' }]);
  mockDossierFindById.mockReturnValue(chain({
    _id: DOSSIER_ID,
    reference: '202610',
    dossier: {
      dossier: { nom: 'Delmont c/ Abily' },
      documents: [
        { _id: 'D1', nomDocument: 'Conclusion.docx', subfolderName: null },
        { _id: 'D2', nomDocument: 'Conclusion.docx', subfolderName: null },
      ],
    },
  }));

  const r = await migrateLegacyDriveForUser('userA');
  expect(mockMoveItem).toHaveBeenCalledTimes(1);
  expect(mockStoredCreate).not.toHaveBeenCalled();
  expect(r.moved).toBe(1);
  expect(r.registered).toBe(0);
  expect(r.unmatched).toBe(1);
});

test('ownership : un dossier Drive non lie a l\'utilisateur est IGNORE', async () => {
  mockFindFolderByName.mockResolvedValue('LEGACY_ROOT');
  mockUserDossierFind.mockReturnValue(chain([])); // aucun dossier lie
  mockListChildren.mockResolvedValueOnce([{ id: 'LEG_DOS', name: DOSSIER_ID, mimeType: FOLDER }]);

  const r = await migrateLegacyDriveForUser('userA');
  expect(mockMoveItem).not.toHaveBeenCalled();
  expect(r.ignored).toBe(1);
  expect(r.foldersMigrated).toBe(0);
});

test('sous-dossier : fichier deplace vers le sous-dossier cible et matche avec subfolderName', async () => {
  mockFindFolderByName.mockResolvedValue('LEGACY_ROOT');
  mockUserDossierFind.mockReturnValue(chain([{ dossier: DOSSIER_ID }]));
  mockListChildren
    .mockResolvedValueOnce([{ id: 'LEG_DOS', name: DOSSIER_ID, mimeType: FOLDER }])
    .mockResolvedValueOnce([{ id: 'SUB1', name: 'Pieces', mimeType: FOLDER }])       // racine du dossier legacy
    .mockResolvedValueOnce([{ id: 'F2', name: 'Piece1.docx', mimeType: 'application/x-docx' }]); // contenu du sous-dossier
  mockDossierFindById.mockReturnValue(chain({
    _id: DOSSIER_ID,
    reference: '202610',
    dossier: {
      dossier: { nom: 'Delmont c/ Abily' },
      documents: [{ _id: 'D3', nomDocument: 'Piece1.docx', subfolderName: 'Pieces' }],
    },
  }));

  const r = await migrateLegacyDriveForUser('userA');
  expect(mockEnsureChildFolderForUser).toHaveBeenCalledWith('userA', 'TARGET_ROOT', 'Pieces');
  expect(mockMoveItem).toHaveBeenCalledWith('userA', 'F2', { addParentId: 'TARGET_SUB', removeParentId: 'SUB1' });
  expect(r.registered).toBe(1);
});

describe('archiveLegacyDrive (Phase 3 — jamais de suppression)', () => {
  test('des fichiers restent → REFUSE (blocked) et ne renomme rien', async () => {
    mockFindFolderByName.mockResolvedValue('LEGACY_ROOT');
    mockListChildren
      .mockResolvedValueOnce([{ id: 'D1', name: DOSSIER_ID, mimeType: FOLDER }])   // racine Files_Clients
      .mockResolvedValueOnce([{ id: 'F1', name: 'reste.docx', mimeType: 'application/x-docx' }]); // contenu D1
    const r = await archiveLegacyDrive('userA');
    expect(r.blocked).toBe(true);
    expect(r.remainingFiles).toBe(1);
    expect(mockRenameItem).not.toHaveBeenCalled();
  });

  test('tout est vide → renomme en _ARCHIVE_Files_Clients', async () => {
    mockFindFolderByName.mockResolvedValue('LEGACY_ROOT');
    mockListChildren
      .mockResolvedValueOnce([{ id: 'D1', name: DOSSIER_ID, mimeType: FOLDER }])
      .mockResolvedValueOnce([]); // dossier vide
    mockRenameItem.mockResolvedValue({ ok: true });
    const r = await archiveLegacyDrive('userA');
    expect(mockRenameItem).toHaveBeenCalledWith('userA', 'LEGACY_ROOT', '_ARCHIVE_Files_Clients');
    expect(r.archived).toBe(true);
  });

  test('deja archive → le signale sans erreur', async () => {
    mockFindFolderByName
      .mockResolvedValueOnce(null)              // Files_Clients absent
      .mockResolvedValueOnce('ARCHIVED_ID');    // _ARCHIVE_Files_Clients present
    const r = await archiveLegacyDrive('userA');
    expect(r).toEqual({ archived: true, already: true });
    expect(mockRenameItem).not.toHaveBeenCalled();
  });
});
