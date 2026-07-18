const mockArtifactFindOne = jest.fn();
const mockArtifactFindOneAndUpdate = jest.fn();
const mockArtifactUpdateOne = jest.fn();
const mockEditorFindOne = jest.fn();
const mockEditorUpdateOne = jest.fn();
const mockDossierUpdateOne = jest.fn();

jest.mock('../../../models/AI/AIArtifact', () => ({
  findOne: (...args) => mockArtifactFindOne(...args),
  findOneAndUpdate: (...args) => mockArtifactFindOneAndUpdate(...args),
  updateOne: (...args) => mockArtifactUpdateOne(...args),
}));
jest.mock('../../../models/AI/AITask', () => ({}));
jest.mock('../../../models/Folder/Dossier', () => ({ updateOne: (...args) => mockDossierUpdateOne(...args) }));
jest.mock('../../../models/DocumentEditor/DocumentEditorState', () => ({
  findOne: (...args) => mockEditorFindOne(...args),
  updateOne: (...args) => mockEditorUpdateOne(...args),
}));
jest.mock('../../../models/DocumentEditor/DocumentEditorRevision', () => ({}));

const { applyProposal, validateAIDraft, createResponseArtifact } = require('../artifactService');

describe('AI artifact matter isolation', () => {
  test('rejects an artifact from another matter before loading the target editor state', async () => {
    mockArtifactFindOne.mockResolvedValue({ _id: 'artifact', tenantId: 'tenant', matterId: 'matter-a', content: { text: 'proposal' } });
    await expect(applyProposal({
      tenantId: 'tenant', userId: 'user', targetMatterId: 'matter-b',
      documentId: 'document', artifactId: 'artifact', expectedRevision: 1,
    })).rejects.toMatchObject({ code: 'AI_ARTIFACT_MATTER_MISMATCH', statusCode: 403 });
    expect(mockEditorFindOne).not.toHaveBeenCalled();
  });

  test('human approval updates the visible dossier category without deleting provenance', async () => {
    mockArtifactFindOneAndUpdate.mockResolvedValue({
      _id: 'artifact', matterId: 'matter-a', taskId: 'task', documentId: 'document',
      validationStatus: 'validated', validatedAt: new Date(),
    });
    mockDossierUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockEditorUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    mockArtifactUpdateOne.mockResolvedValue({ matchedCount: 1 });
    const artifact = await validateAIDraft({
      tenantId: 'tenant', userId: 'user', documentId: 'document',
      decision: 'approved-by-human', comment: 'Relu',
    });
    expect(artifact.validationStatus).toBe('validated');
    expect(mockDossierUpdateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'matter-a', tenantId: 'tenant' }),
      { $set: { 'dossier.documents.$.categorie': 'Document IA validé par un humain' } },
    );
    expect(mockEditorUpdateOne).toHaveBeenCalledWith(
      { tenantId: 'tenant', documentId: 'document', status: 'draft' },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'review' }) }),
    );
  });

  test('uncited context sources are not exposed as cited sources', async () => {
    mockArtifactFindOneAndUpdate.mockResolvedValue({ _id: 'artifact' });
    await createResponseArtifact({
      task: { _id: 'task', tenantId: 'tenant', matterId: 'matter', userId: 'user', retentionUntil: new Date() },
      text: 'Réponse sans citation', sourceAnchors: [],
      contextSourceAnchors: [{ sourceId: 'S1', label: 'Pièce' }],
      warnings: ['AI_RESULT_WITHOUT_EXPLICIT_CITATION'],
    });
    const update = mockArtifactFindOneAndUpdate.mock.calls.at(-1)[1].$setOnInsert;
    expect(update.sourceAnchors).toEqual([]);
    expect(update.content.contextSourceAnchors).toEqual([{ sourceId: 'S1', label: 'Pièce' }]);
    expect(update.content.warnings).toEqual(['AI_RESULT_WITHOUT_EXPLICIT_CITATION']);
  });
});
