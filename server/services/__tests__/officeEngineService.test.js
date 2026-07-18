describe('officeEngineService', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    jest.resetModules();
  });

  test('lit les actions DOC/DOCX du discovery Collabora sans conserver les placeholders', () => {
    const service = require('../officeEngineService');
    const actions = service.parseDiscovery(`<?xml version="1.0"?>
      <wopi-discovery>
        <net-zone name="external-https">
          <app name="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
            <action ext="docx" name="edit" urlsrc="https://office.example/browser/hash/cool.html?&lt;ui=UI_LLCC&amp;&gt;" />
            <action ext="doc" name="edit" urlsrc="https://office.example/browser/hash/cool.html?" />
          </app>
        </net-zone>
      </wopi-discovery>`);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({
      ext: 'docx',
      name: 'edit',
      urlsrc: 'https://office.example/browser/hash/cool.html?',
    });
  });

  test('limite le moteur avancé aux formats bureautiques pris en charge', () => {
    const service = require('../officeEngineService');
    expect(service.supportedExtension('Conclusions.DOCX')).toBe('docx');
    expect(service.supportedExtension('ancien.doc')).toBe('doc');
    expect(service.supportedExtension('note.txt')).toBeNull();
    expect(service.supportedExtension('piece.pdf')).toBeNull();
  });

  test('fabrique une clé d’enregistrement idempotente liée à la session et au contenu', () => {
    const service = require('../officeEngineService');
    const first = service.operationKey('session-1', Buffer.from('version A'));
    expect(first).toBe(service.operationKey('session-1', Buffer.from('version A')));
    expect(first).not.toBe(service.operationKey('session-1', Buffer.from('version B')));
  });
});
