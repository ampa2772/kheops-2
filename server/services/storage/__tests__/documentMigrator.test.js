// Tests — migration/backfill des DOCUMENTS vers le cloud personnel.
// On mocke le registre de providers, tenantService et les modeles Mongo : on
// valide la LOGIQUE de migration (choix source/cible, repointage du storageKey,
// idempotence), pas les appels reseau reels.
//
// NB : les variables referencees dans une factory jest.mock DOIVENT etre
// prefixees « mock » (regle du plugin babel-jest anti hoisting).

const mockManagedGcsDownload = jest.fn();
const mockGetUploadProvider = jest.fn();
const mockAssertUploadCompleted = jest.fn().mockResolvedValue(undefined);
const mockUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const mockStoredFind = jest.fn();
const mockDossierFind = jest.fn();

jest.mock('../index', () => ({
  providers: { managed_gcs: { name: 'managed_gcs', downloadVersion: (...a) => mockManagedGcsDownload(...a) } },
  // Reproduit le routage : chemin sans schéma = stockage interne.
  providerNameForKey: (key) => {
    const s = String(key || '');
    const i = s.indexOf(':');
    if (i > 0) {
      const scheme = s.slice(0, i);
      return ({ onedrive: 'onedrive', 'onedrive-v2':'onedrive', googledrive: 'google_drive', sharepoint: 'sharepoint' })[scheme]
        || null;
    }
    return s && i<0 ? 'managed_gcs' : null;
  },
  getUploadProvider: (...a) => mockGetUploadProvider(...a),
  assertUploadCompleted: (...a) => mockAssertUploadCompleted(...a),
}));

jest.mock('../../tenantService', () => ({ resolveTenantId: jest.fn().mockResolvedValue('TENANT1') }));
jest.mock('../matterFolderMaterializer', () => ({ backfillUserFolders: jest.fn().mockResolvedValue({ total: 0, ok: 0, skipped: 0, reasons: {} }) }));
jest.mock('../../../models/Storage/StoredDocument', () => ({ find: (...a) => mockStoredFind(...a), updateOne: (...a) => mockUpdateOne(...a) }));
jest.mock('../../../models/Folder/Dossier', () => ({ find: (...a) => mockDossierFind(...a) }));

// Helper de chainage Mongoose : supporte .select().sort().limit().lean() dans
// n'importe quel ordre.
function chain(result) {
  const obj = {
    select: () => obj,
    sort: () => obj,
    limit: () => obj,
    lean: () => Promise.resolve(result),
  };
  return obj;
}

const migrator = require('../documentMigrator');

beforeEach(() => {
  jest.clearAllMocks();
  mockAssertUploadCompleted.mockResolvedValue(undefined);
  mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockDossierFind.mockReturnValue(chain([]));
});

describe('migrateOneDocument', () => {
  const target = { name: 'onedrive', uploadVersion: jest.fn() };

  test('migre un document managed_gcs → cloud perso et repointe le storageKey', async () => {
    mockManagedGcsDownload.mockResolvedValue(Buffer.from('contenu'));
    target.uploadVersion.mockResolvedValue({ provider: 'onedrive', storageKey: 'onedrive:userA:ITEM1', size: 7 });

    const doc = {
      _id: 'DOC1', documentId: 'D1', dossierId: 'M1',
      versions: [{ versionId: 'V1', storageKey: 'tenants/T1/matters/M1/documents/D1/versions/V1/acte.pdf', filename: 'acte.pdf', mime: 'application/pdf', size: 7 }],
      currentVersionId: 'V1',
    };

    const r = await migrator.migrateOneDocument({ ownerUserId: 'userA', doc, targetProvider: target, tenantId: 'TENANT1', matterLabel: 'Durand — 202601' });

    expect(r).toEqual({ ok: true, provider: 'onedrive' });
    expect(mockManagedGcsDownload).toHaveBeenCalledWith({ storageKey: doc.versions[0].storageKey });
    const up = target.uploadVersion.mock.calls[0][0];
    expect(up.ownerUserId).toBe('userA');
    expect(up.matterLabel).toBe('Durand — 202601');
    expect(up.versionOrdinal).toBe(1);
    // Repointage COMPARE-AND-SWAP : $elemMatch sur (versionId + ancienne cle).
    expect(mockUpdateOne).toHaveBeenCalledWith(
      { _id: 'DOC1', versions: { $elemMatch: { versionId: 'V1', storageKey: doc.versions[0].storageKey } } },
      { $set: { 'versions.$.storageKey': 'onedrive:userA:ITEM1', 'versions.$.size': 7 } },
    );
  });

  test('course concurrente perdue (matchedCount 0) → supprime le doublon, ne compte pas comme migre', async () => {
    mockManagedGcsDownload.mockResolvedValue(Buffer.from('c'));
    const targetWithDelete = {
      name: 'onedrive',
      uploadVersion: jest.fn().mockResolvedValue({ provider: 'onedrive', storageKey: 'onedrive:userA:DUP', size: 1 }),
      deleteVersion: jest.fn().mockResolvedValue(undefined),
    };
    // Une autre migration a deja repointe -> le CAS ne matche rien.
    mockUpdateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    const doc = {
      _id: 'DOC9', documentId: 'D9', dossierId: 'M1',
      versions: [{ versionId: 'V1', storageKey: 'tenants/T1/x/acte.pdf', filename: 'acte.pdf', mime: 'application/pdf' }],
      currentVersionId: 'V1',
    };
    const r = await migrator.migrateOneDocument({ ownerUserId: 'userA', doc, targetProvider: targetWithDelete, tenantId: 'TENANT1', matterLabel: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('course-concurrente-nettoyee');
    // Le doublon cree est supprime.
    expect(targetWithDelete.deleteVersion).toHaveBeenCalledWith({ storageKey: 'onedrive:userA:DUP' });
  });

  test('document DEJA sur cloud perso → ignore (idempotent), aucun upload', async () => {
    const doc = {
      _id: 'DOC2', documentId: 'D2', dossierId: 'M1',
      versions: [{ versionId: 'V1', storageKey: 'onedrive:userA:ITEMX', filename: 'x.docx' }],
      currentVersionId: 'V1',
    };
    const r = await migrator.migrateOneDocument({ ownerUserId: 'userA', doc, targetProvider: target, tenantId: 'TENANT1', matterLabel: null });
    expect(r).toEqual({ ok: false, reason: 'deja-sur-cloud-perso' });
    expect(target.uploadVersion).not.toHaveBeenCalled();
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });

  test('echec de confirmation → ne repointe PAS le storageKey (aucune perte)', async () => {
    mockManagedGcsDownload.mockResolvedValue(Buffer.from('c'));
    target.uploadVersion.mockResolvedValue({ provider: 'onedrive', storageKey: 'onedrive:userA:ITEM2', size: 1 });
    mockAssertUploadCompleted.mockRejectedValue(Object.assign(new Error('non confirme'), { code: 'SYNC_NOT_CONFIRMED' }));

    const doc = {
      _id: 'DOC3', documentId: 'D3', dossierId: 'M1',
      versions: [{ versionId: 'V1', storageKey: 'tenants/T1/x/acte.pdf', filename: 'acte.pdf', mime: 'application/pdf' }],
      currentVersionId: 'V1',
    };
    const r = await migrator.migrateOneDocument({ ownerUserId: 'userA', doc, targetProvider: target, tenantId: 'TENANT1', matterLabel: null });
    expect(r.ok).toBe(false);
    expect(mockUpdateOne).not.toHaveBeenCalled();
  });
});

describe('backfillUserDocuments', () => {
  test('cible sans cloud perso (managed_gcs) → ne migre rien', async () => {
    mockStoredFind.mockReturnValue(chain([
      { _id: 'DOC1', documentId: 'D1', dossierId: 'M1', versions: [{ versionId: 'V1', storageKey: 'tenants/T1/a.pdf' }], currentVersionId: 'V1' },
    ]));
    mockGetUploadProvider.mockResolvedValue({ name: 'managed_gcs' });

    const r = await migrator.backfillUserDocuments('userA');
    expect(r.migrated).toBe(0);
    expect(r.reasons['cible-managed_gcs']).toBeGreaterThan(0);
  });

  test('ne considere QUE les documents encore sur stockage interne', async () => {
    mockStoredFind.mockReturnValue(chain([
      { _id: 'DOC1', documentId: 'D1', dossierId: 'M1', versions: [{ versionId: 'V1', storageKey: 'tenants/T1/a.pdf', filename: 'a.pdf' }], currentVersionId: 'V1' },
      { _id: 'DOC2', documentId: 'D2', dossierId: 'M1', versions: [{ versionId: 'V1', storageKey: 'onedrive:userA:ALREADY', filename: 'b.docx' }], currentVersionId: 'V1' },
    ]));
    mockGetUploadProvider.mockResolvedValue({ name: 'onedrive', uploadVersion: jest.fn().mockResolvedValue({ provider: 'onedrive', storageKey: 'onedrive:userA:NEW', size: 3 }) });
    mockManagedGcsDownload.mockResolvedValue(Buffer.from('abc'));

    const r = await migrator.backfillUserDocuments('userA');
    expect(r.total).toBe(1);
    expect(r.migrated).toBe(1);
  });
});
