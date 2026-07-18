const Artifact = require('../DocumentPublicationArtifact');

describe('DocumentPublicationArtifact schema', () => {
  test('isole une version et un format exacts avec checksum immuable', () => {
    const schema = Artifact.schema;
    expect(schema.path('tenantId').options.immutable).toBe(true);
    expect(schema.path('dossierId').options.immutable).toBe(true);
    expect(schema.path('documentId').options.immutable).toBe(true);
    expect(schema.path('versionId').options.immutable).toBe(true);
    expect(schema.path('format').enumValues).toEqual(['docx', 'pdf']);
    expect(schema.path('checksum').options.immutable).toBe(true);
    const exactIndex = schema.indexes().find(([fields]) => (
      fields.tenantId === 1
      && fields.dossierId === 1
      && fields.documentId === 1
      && fields.versionId === 1
      && fields.format === 1
    ));
    expect(exactIndex?.[1]?.unique).toBe(true);
  });
});
