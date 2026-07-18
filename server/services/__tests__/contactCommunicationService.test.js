const service = require('../contactCommunicationService');

describe('contactCommunicationService — préremplissage sans invention', () => {
  test('normalise une personne physique', () => {
    const contact = service.physicalContact({
      _id: 'c1', prenoms: 'Alice', nom: 'Martin', genre: 'Féminin',
      email: 'alice@example.fr', adresse: '1 rue A', codePostal: '75000', ville: 'Paris',
    });
    expect(contact).toMatchObject({
      displayName: 'Alice Martin', civilite: 'Madame', emails: ['alice@example.fr'], city: 'Paris',
    });
  });

  test('propose toutes les adresses distinctes d’une organisation', () => {
    const contact = service.privateOrganization({
      _id: 'c2', raisonSociale: 'Nova', emailEntreprise: 'contact@nova.fr', interlocuteurEmail: 'personne@nova.fr',
    });
    expect(contact.emails).toEqual(['contact@nova.fr', 'personne@nova.fr']);
  });

  test('la lettre laisse des variables visibles lorsque les données manquent', () => {
    const document = service.contactLetterDocument({
      contact: {
        displayName: 'Alice', organization: '', civilite: '', firstName: 'Alice', lastName: '',
        address: '', postalCode: '', city: '', emails: [], phones: [],
      },
      dossier: { reference: '' },
      title: 'Courrier',
      object: '',
    });
    const text = document.blocks.flatMap((block) => block.runs || []).map((run) => run.text).join('\n');
    expect(text).toContain('À compléter : adresse');
    expect(text).toContain('À compléter : référence du dossier');
    expect(text).not.toContain('Adresse à renseigner');
  });
});
