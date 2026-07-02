// Tests A3 — provider OneDrive PAR UTILISATEUR.
// On mocke le client Graph (oneDriveClient) et le modèle StoredDocument :
// on valide le contrat du provider (routage par propriétaire via storageKey),
// pas les appels réseau réels.

jest.mock('../oneDriveClient', () => ({
  uploadFile: jest.fn(),
  downloadFile: jest.fn(),
  getDownloadUrl: jest.fn(),
  deleteItem: jest.fn(),
  itemExists: jest.fn(),
}));
jest.mock('../../../models/Storage/StoredDocument', () => ({ find: jest.fn() }));

const oneDrive = require('../oneDriveClient');
const provider = require('../providers/onedrive');

afterEach(() => jest.clearAllMocks());

describe('storageKey encode/parse', () => {
  test('round-trip owner + itemId', () => {
    const key = provider._encodeKey('userA', 'ITEM123');
    expect(key).toBe('onedrive:userA:ITEM123');
    expect(provider._parseKey(key)).toEqual({ ownerUserId: 'userA', itemId: 'ITEM123' });
  });

  test('itemId contenant un ":" reste intact (split sur les 2 premiers seulement)', () => {
    const key = provider._encodeKey('userA', 'abc:def:ghi');
    expect(provider._parseKey(key)).toEqual({ ownerUserId: 'userA', itemId: 'abc:def:ghi' });
  });

  test('clé non-onedrive → erreur 400', () => {
    expect(() => provider._parseKey('gcs:foo/bar')).toThrow(/invalide/i);
  });
});

describe('uploadVersion', () => {
  test('écrit dans le OneDrive du PROPRIÉTAIRE et renvoie un storageKey encodé', async () => {
    oneDrive.uploadFile.mockResolvedValue({ itemId: 'ITEM9', size: 1234, webUrl: 'https://od', name: 'acte.pdf' });

    const out = await provider.uploadVersion({
      tenantId: 'T1', matterId: 'M1', documentId: 'D1', versionId: 'V1',
      filename: 'acte.pdf', buffer: Buffer.from('pdf'), mime: 'application/pdf',
      ownerUserId: 'userA',
    });

    expect(oneDrive.uploadFile).toHaveBeenCalledTimes(1);
    const [ownerArg, payload] = oneDrive.uploadFile.mock.calls[0];
    expect(ownerArg).toBe('userA');
    // chemin logique dans le OneDrive de userA
    expect(payload.path).toBe('Kheops2/tenants/T1/matters/M1/documents/D1/versions/V1/acte.pdf');
    expect(payload.mime).toBe('application/pdf');
    expect(out).toMatchObject({
      provider: 'onedrive',
      storageKey: 'onedrive:userA:ITEM9',
      size: 1234,
      filename: 'acte.pdf',
    });
  });

  test('🔒 sans ownerUserId → 400 (on ne sait pas dans quel OneDrive écrire)', async () => {
    await expect(provider.uploadVersion({
      tenantId: 'T1', documentId: 'D1', versionId: 'V1',
      filename: 'x.pdf', buffer: Buffer.from('x'), mime: 'application/pdf',
    })).rejects.toMatchObject({ statusCode: 400, code: 'MISSING_OWNER_USER_ID' });
    expect(oneDrive.uploadFile).not.toHaveBeenCalled();
  });

  test('buffer manquant → 400', async () => {
    await expect(provider.uploadVersion({
      ownerUserId: 'userA', filename: 'x', buffer: null,
    })).rejects.toMatchObject({ statusCode: 400, code: 'MISSING_FILE_BUFFER' });
  });
});

describe('download/delete/exists routent vers le OneDrive du propriétaire (via storageKey)', () => {
  test('downloadVersion utilise owner + itemId du storageKey', async () => {
    oneDrive.downloadFile.mockResolvedValue(Buffer.from('data'));
    const buf = await provider.downloadVersion({ storageKey: 'onedrive:userB:ITEMX' });
    expect(oneDrive.downloadFile).toHaveBeenCalledWith('userB', 'ITEMX');
    expect(buf.toString()).toBe('data');
  });

  test('getDownloadUrl idem', async () => {
    oneDrive.getDownloadUrl.mockResolvedValue('https://pre-authed');
    const url = await provider.getDownloadUrl({ storageKey: 'onedrive:userB:ITEMX' });
    expect(oneDrive.getDownloadUrl).toHaveBeenCalledWith('userB', 'ITEMX');
    expect(url).toBe('https://pre-authed');
  });

  test('deleteVersion idem', async () => {
    oneDrive.deleteItem.mockResolvedValue({ ok: true });
    await provider.deleteVersion({ storageKey: 'onedrive:userB:ITEMX' });
    expect(oneDrive.deleteItem).toHaveBeenCalledWith('userB', 'ITEMX');
  });

  test('exists idem', async () => {
    oneDrive.itemExists.mockResolvedValue(true);
    const ok = await provider.exists({ storageKey: 'onedrive:userB:ITEMX' });
    expect(oneDrive.itemExists).toHaveBeenCalledWith('userB', 'ITEMX');
    expect(ok).toBe(true);
  });
});
