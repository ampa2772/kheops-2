const { formatDateInFrench, buildDocumentVariables } = require('../variables');

describe('docx variables', () => {
  test('formatDateInFrench', () => {
    expect(formatDateInFrench('2026-07-01')).toMatch(/^le \d+ \w+ 2026$/);
    expect(formatDateInFrench('')).toBe('');
    expect(formatDateInFrench('pas une date')).toBe('');
  });

  test('sans dossier → dateDuJour seul', () => {
    const v = buildDocumentVariables({});
    expect(Object.keys(v)).toEqual(['dateDuJour']);
    expect(v.dateDuJour).toMatch(/^le /);
  });

  test('1 destinataire → courrier simple', () => {
    const dossier = { reference: 'A-1', dossier: { dossier: { nom: 'Dupont c/ Martin' } } };
    const recipients = [{ fullObject: { nom: 'Martin', prenoms: 'Paul', genre: 'Masculin', adresse: '1 rue X', codePostal: '75001', ville: 'Paris' } }];
    const userProfile = { firstName: 'Jean', lastName: 'Avocat', city: 'Paris' };
    const v = buildDocumentVariables({ dossier, recipients, userProfile });
    expect(v.civilite).toBe('Monsieur');
    expect(v.titre).toBe('Monsieur Paul Martin');
    expect(v.nomAvocat).toBe('Jean Avocat');
    expect(v.referenceDossier).toBe('A-1');
    expect(v.dateDuJour).toMatch(/^le /);
    expect(typeof v.barreauComplet).toBe('string');
  });

  test('0 destinataire → présentation des parties', () => {
    const dossier = {
      reference: 'B-2',
      dossier: {
        dossier: { nom: 'X' },
        parties: { pour: [], contre: [] },
        avocatsResponsables: [{ prenomOfficeUser: 'Jean', nomOfficeUser: 'Avocat', city: 'Paris' }],
      },
    };
    const v = buildDocumentVariables({ dossier, recipients: [] });
    expect(typeof v.presentationParties).toBe('string');
    expect(v.presentationParties).toContain('POUR');
    expect(v.referenceDossier).toBe('B-2');
    expect(v.nomAvocat).toBe('Jean Avocat');
  });
});
