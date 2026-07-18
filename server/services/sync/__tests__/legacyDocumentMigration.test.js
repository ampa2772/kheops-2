const {
  inferProvider,
  makeLegacyDocumentMigration,
  planLegacyDocuments,
} = require('../legacyDocumentMigration');
const mongoose = require('mongoose');

describe('planLegacyDocuments', () => {
  const stored = {
    _id: 'S1', tenantId: 'T1', dossierId: 'D1', documentId: 'DOC1', ownerUserId: 'U1', currentVersionId: 'v1',
    versions: [{ versionId: 'v1', storageKey: 'onedrive:file-1', filename: 'Contrat.docx', size: 12, mime: 'application/docx', createdBy: 'U1' }],
  };

  test('préfère StoredDocument au snapshot embarqué du même document', () => {
    const plan = planLegacyDocuments({
      storedDocuments: [stored],
      embeddedDocuments: [{ tenantId: 'T1', dossierId: 'D1', document: { _id: 'DOC1', nomDocument: 'Ancien nom.docx' } }],
    });
    expect(plan.unique).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.unique[0].versions).toHaveLength(1);
    expect(plan.unique[0].input.title).toBe('Contrat.docx');
  });

  test('ajoute un alias utilisable par les lignes historiques du dossier', () => {
    const plan = planLegacyDocuments({
      embeddedDocuments: [{ tenantId: 'T1', dossierId: 'D1', document: { _id: 'DOC2', nomDocument: 'Lettre.docx' } }],
    });
    expect(plan.unique[0].input.aliases).toContainEqual({ system: 'legacy-dossier-document', externalId: 'DOC2' });
  });

  test('reconnaît les emplacements externes', () => {
    expect(inferProvider('onedrive:abc')).toBe('onedrive');
    expect(inferProvider('sharepoint:abc')).toBe('sharepoint');
    expect(inferProvider('bucket/key')).toBe('managed_gcs');
  });

  test('le dry-run documentaire ne crée aucune ressource', async () => {
    const MigrationRun = { findOne: jest.fn(), create: jest.fn() };
    const documents = { registerDocument: jest.fn() };
    const tenantId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const result = await makeLegacyDocumentMigration({ MigrationRun, documents }).execute({
      tenantId, userId, dryRun: true,
      storedDocuments: [{ ...stored, tenantId: String(tenantId), dossierId: String(new mongoose.Types.ObjectId()) }],
      embeddedDocuments: [],
    });
    expect(result.dryRun).toBe(true);
    expect(MigrationRun.findOne).not.toHaveBeenCalled();
    expect(documents.registerDocument).not.toHaveBeenCalled();
  });
});
