// Tests A3 — provider Google Drive PAR UTILISATEUR (symétrique d'onedrive).

jest.mock('../googleDriveClient', () => ({
  uploadFile: jest.fn(),
  downloadFile: jest.fn(),
  deleteItem: jest.fn(),
  itemExists: jest.fn(),
}));
jest.mock('../../../models/Storage/StoredDocument', () => ({ find: jest.fn() }));

const gdrive = require('../googleDriveClient');
const provider = require('../providers/googleDrive');

afterEach(() => jest.clearAllMocks());

describe('storageKey', () => {
  test('round-trip owner + fileId', () => {
    const key = provider._encodeKey('userA', 'FILE1');
    expect(key).toBe('googledrive:userA:FILE1');
    expect(provider._parseKey(key)).toEqual({ ownerUserId: 'userA', fileId: 'FILE1' });
  });
  test('clé non-googledrive → 400', () => {
    expect(() => provider._parseKey('onedrive:u:i')).toThrow(/invalide/i);
  });
});

describe('uploadVersion', () => {
  test('écrit dans le Drive du propriétaire et renvoie storageKey encodé', async () => {
    gdrive.uploadFile.mockResolvedValue({ fileId: 'F9', size: 42, name: 'n', idempotent: true });
    const out = await provider.uploadVersion({
      documentId: 'D1', versionId: 'V1', filename: 'acte.pdf',
      buffer: Buffer.from('pdf'), mime: 'application/pdf', ownerUserId: 'userA', idempotencyKey: 'sync:T1:O1',
    });
    const [owner, payload] = gdrive.uploadFile.mock.calls[0];
    expect(owner).toBe('userA');
    expect(payload.name).toBe('D1__V1__acte.pdf');
    expect(payload.idempotencyKey).toBe('sync:T1:O1');
    expect(out).toMatchObject({ provider: 'google_drive', storageKey: 'googledrive:userA:F9', size: 42, filename: 'acte.pdf', idempotent: true });
  });

  test('🔒 sans ownerUserId → 400', async () => {
    await expect(provider.uploadVersion({ documentId: 'D', versionId: 'V', filename: 'x', buffer: Buffer.from('x') }))
      .rejects.toMatchObject({ statusCode: 400, code: 'MISSING_OWNER_USER_ID' });
    expect(gdrive.uploadFile).not.toHaveBeenCalled();
  });
});

describe('download/delete/exists routent par propriétaire', () => {
  test('downloadVersion', async () => {
    gdrive.downloadFile.mockResolvedValue(Buffer.from('data'));
    const b = await provider.downloadVersion({ storageKey: 'googledrive:userB:FX' });
    expect(gdrive.downloadFile).toHaveBeenCalledWith('userB', 'FX');
    expect(b.toString()).toBe('data');
  });
  test('deleteVersion', async () => {
    gdrive.deleteItem.mockResolvedValue({ ok: true });
    await provider.deleteVersion({ storageKey: 'googledrive:userB:FX' });
    expect(gdrive.deleteItem).toHaveBeenCalledWith('userB', 'FX');
  });
  test('exists', async () => {
    gdrive.itemExists.mockResolvedValue(true);
    expect(await provider.exists({ storageKey: 'googledrive:userB:FX' })).toBe(true);
  });
});

describe('getDownloadUrl', () => {
  test('signale SIGNED_URL_UNSUPPORTED (fichiers privés → streaming côté route)', async () => {
    await expect(provider.getDownloadUrl({ storageKey: 'googledrive:userA:F' }))
      .rejects.toMatchObject({ code: 'SIGNED_URL_UNSUPPORTED' });
  });
});
