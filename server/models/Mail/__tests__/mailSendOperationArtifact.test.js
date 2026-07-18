const MailSendOperation = require('../MailSendOperation');

describe('MailSendOperation publication attachments', () => {
  test('conserve artefact, version et format exacts dans l’outbox', () => {
    const attachment = MailSendOperation.schema.path('attachments').schema;
    expect(attachment.path('artifactId').options.ref).toBe('DocumentPublicationArtifact');
    expect(attachment.path('versionId')).toBeDefined();
    expect(attachment.path('format').enumValues).toEqual(['docx', 'pdf']);
    expect(attachment.path('checksum')).toBeDefined();
  });
});
