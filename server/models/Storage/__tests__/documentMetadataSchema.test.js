const User = require('../../App_Users/User');
const StoredDocument = require('../StoredDocument');
const Tenant = require('../../Cabinet/Tenant');
const Dossier = require('../../Folder/Dossier');
const mongoose = require('mongoose');

describe('schémas des préférences et versions documentaires', () => {
  test('le modèle User accepte uniquement les six modes d’ouverture prévus', () => {
    const path = User.schema.path('documentOpening.mode');
    expect(path.enumValues).toEqual([
      'automatic',
      'ask',
      'kheops',
      'word_desktop',
      'word_web',
      'google_docs',
    ]);
    expect(path.defaultValue).toBe('ask');
  });

  test('une version conserve éditeur, origine, commentaire et état', () => {
    const versionSchema = StoredDocument.schema.path('versions').schema;
    expect(versionSchema.path('editor').enumValues).toEqual(expect.arrayContaining([
      'kheops', 'word_desktop', 'word_web', 'google_docs',
    ]));
    expect(versionSchema.path('origin').enumValues).toEqual(expect.arrayContaining([
      'upload', 'google_drive', 'onedrive',
    ]));
    expect(versionSchema.path('comment').options.maxlength).toBe(2000);
    expect(versionSchema.path('status').enumValues).toEqual([
      'draft', 'review', 'corrections_requested', 'approved', 'validated',
      'ready_to_send', 'sent', 'signed', 'archived',
    ]);
    expect(versionSchema.path('status').defaultValue).toBe('draft');
  });

  test('les métadonnées éditeur/origine restent réellement optionnelles pour un dépôt historique', () => {
    const objectId = () => new mongoose.Types.ObjectId();
    const stored = new StoredDocument({
      tenantId: objectId(),
      dossierId: objectId(),
      documentId: objectId(),
      ownerUserId: objectId(),
      currentVersionId: 'version-jaLet',
      versions: [{
        versionId: 'version-jaLet',
        storageKey: 'tenants/cabinet/matters/dossier/JALET.pdf',
        size: 134415,
        mime: 'application/pdf',
        filename: 'JALET.pdf',
        createdBy: objectId(),
      }],
    });

    // Régression du glisser-déposer : avant le correctif, les defaults `null`
    // étaient rejetés par les enums et save() levait "StoredDocument validation
    // failed ... editor/origin: `null` is not a valid enum value".
    expect(stored.validateSync()).toBeUndefined();
    expect(stored.versions[0].editor).toBeNull();
    expect(stored.versions[0].origin).toBeNull();
  });

  test('la politique cabinet contient les six contrôles administratifs', () => {
    expect(Tenant.schema.path('documentPolicy.allowPersonalClouds').defaultValue).toBe(true);
    expect(Tenant.schema.path('documentPolicy.allowedProviders').caster.enumValues).toEqual([
      'managed_gcs', 'google_drive', 'onedrive', 'sharepoint',
    ]);
    expect(Tenant.schema.path('documentPolicy.forceMethod').enumValues).toEqual(expect.arrayContaining([
      'kheops', 'word_desktop', 'word_web', 'google_docs',
    ]));
    expect(Tenant.schema.path('documentPolicy.allowGoogleConversion').defaultValue).toBe(false);
    expect(Tenant.schema.path('documentPolicy.requireKheopsVersion').defaultValue).toBe(true);
    expect(Tenant.schema.path('documentPolicy.deleteExternalCopyAfterSync').defaultValue).toBe(false);
  });

  test('chaque document embarqué peut mémoriser son propre mode d’ouverture', () => {
    const documentSchema = Dossier.schema.path('dossier').schema.path('documents').schema;
    expect(documentSchema.path('openingMode').enumValues).toEqual(expect.arrayContaining([
      'automatic', 'ask', 'kheops', 'word_desktop', 'word_web', 'google_docs',
    ]));
    expect(documentSchema.path('openingMode').defaultValue).toBe(null);
  });
});
