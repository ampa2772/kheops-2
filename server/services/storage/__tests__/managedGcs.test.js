const fs = require('fs');
const os = require('os');
const path = require('path');

describe('managedGcs provider', () => {
  let root;
  let oldLocalRoot;
  let oldGcsBucket;

  beforeEach(() => {
    jest.resetModules();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'kheops-managed-gcs-'));
    oldLocalRoot = process.env.FILE_STORAGE_LOCAL_ROOT;
    oldGcsBucket = process.env.GCS_BUCKET;
    process.env.FILE_STORAGE_LOCAL_ROOT = root;
    delete process.env.GCS_BUCKET;
  });

  afterEach(() => {
    if (oldLocalRoot === undefined) delete process.env.FILE_STORAGE_LOCAL_ROOT;
    else process.env.FILE_STORAGE_LOCAL_ROOT = oldLocalRoot;
    if (oldGcsBucket === undefined) delete process.env.GCS_BUCKET;
    else process.env.GCS_BUCKET = oldGcsBucket;
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('uploadVersion puis downloadVersion restitue le contenu via getFileStorage', async () => {
    const provider = require('../providers/managedGcs');
    const uploaded = await provider.uploadVersion({
      tenantId: '698941d40c8df05d76c7740e',
      matterId: 'matter-1',
      documentId: 'document-1',
      versionId: 'version-1',
      filename: 'piece test.txt',
      buffer: Buffer.from('hello storage'),
      mime: 'text/plain',
    });

    expect(uploaded).toMatchObject({
      provider: 'managed_gcs',
      size: 13,
      mime: 'text/plain',
      filename: 'piece test.txt',
    });
    expect(uploaded.storageKey).toBe(
      'tenants/698941d40c8df05d76c7740e/matters/matter-1/documents/document-1/versions/version-1/piece test.txt',
    );
    await expect(provider.exists({ storageKey: uploaded.storageKey })).resolves.toBe(true);
    await expect(provider.downloadVersion({ storageKey: uploaded.storageKey }))
      .resolves.toEqual(Buffer.from('hello storage'));

    await provider.deleteVersion({ storageKey: uploaded.storageKey });
    await expect(provider.exists({ storageKey: uploaded.storageKey })).resolves.toBe(false);
  });

  test('buildStorageKey cloisonne sous tenants et ne collide pas avec documents/<docId>.docx', () => {
    const provider = require('../providers/managedGcs');
    const key = provider.buildStorageKey({
      tenantId: 'tenant-a',
      matterId: 'matter-a',
      documentId: 'doc-a',
      versionId: 'v1',
      filename: '../bad.docx',
    });

    expect(key).toBe('tenants/tenant-a/matters/matter-a/documents/doc-a/versions/v1/bad.docx');
    expect(key.startsWith('documents/')).toBe(false);
  });
});
