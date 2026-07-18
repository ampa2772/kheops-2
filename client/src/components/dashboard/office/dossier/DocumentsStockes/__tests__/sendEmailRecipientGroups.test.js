import {
  buildDossierEmailRecipientGroups,
  flattenDossierEmailRecipientGroups,
} from '../sendEmailRecipientGroups';

const buildDossier = (overrides = {}) => ({
  _id: 'dossier-1',
  dossier: {
    dossier: { responsables: [] },
    parties: { pour: [], contre: [] },
    avocatsResponsables: [],
    contactsDuDossier: [],
    ...overrides,
  },
});

describe('buildDossierEmailRecipientGroups', () => {
  test('ajoute les parties, avocats et contacts liés dans le sélecteur e-mail', () => {
    const dossier = buildDossier({
      parties: {
        pour: [{
          partieData: { _id: 'partie-pour', nom: 'Martin', prenoms: 'Alice', email: 'alice@example.fr' },
          avocats: [{ _id: 'avocat-pour', nomOfficeUser: 'Durand', prenomOfficeUser: 'Léa', email: 'lea@cabinet.fr' }],
          contacts: [{ _id: 'contact-pour', nom: 'Petit', prenoms: 'Marc', email: 'marc@example.fr' }],
        }],
        contre: [{
          partieData: { _id: 'partie-contre', nom: 'Morel', prenoms: 'John', email: 'john@example.fr' },
          contacts: [],
          avocats: [],
        }],
      },
    });

    const result = buildDossierEmailRecipientGroups(dossier, []);

    expect(result.pour[0].partieData).toMatchObject({
      _id: 'partie-pour',
      type: 'Partie',
      isContre: false,
    });
    expect(result.pour[0].avocats[0]).toMatchObject({
      _id: 'avocat-pour',
      type: 'Avocat',
      nom: 'Durand',
      prenoms: 'Léa',
    });
    expect(result.pour[0].contacts[0]).toMatchObject({
      _id: 'contact-pour',
      type: 'Contact',
    });
    expect(result.contre[0].partieData).toMatchObject({
      _id: 'partie-contre',
      type: 'Partie',
      isContre: true,
    });
  });

  test('déduplique entre parties, contacts liés et contacts du dossier par id ou e-mail', () => {
    const dossier = buildDossier({
      parties: {
        pour: [{
          partieData: { _id: 'party-1', nom: 'Martin', email: 'CLIENT@EXAMPLE.FR' },
          contacts: [
            { _id: 'party-1', nom: 'Même identifiant', email: 'autre@example.fr' },
            { _id: 'linked-duplicate-email', nom: 'Même e-mail', email: ' client@example.fr ' },
            { _id: 'linked-unique', nom: 'Contact unique', email: 'unique@example.fr' },
          ],
        }],
        contre: [],
      },
      contactsDuDossier: [
        { _id: 'direct-duplicate', nom: 'Déjà lié', email: 'UNIQUE@example.fr' },
        { _id: 'direct-unique', nom: 'Juridiction', email: 'greffe@justice.fr' },
      ],
    });

    const flattened = flattenDossierEmailRecipientGroups(
      buildDossierEmailRecipientGroups(dossier, []),
    );

    expect(flattened.map((entity) => entity._id)).toEqual([
      'party-1',
      'linked-unique',
      'direct-unique',
    ]);
  });

  test('accepte aussi les noms linkedContacts/linkedAvocats et les références responsables sous forme d’id', () => {
    const dossier = buildDossier({
      dossier: { responsables: ['responsable-1'] },
      avocatsResponsables: [{ _id: 'avocat-responsable' }],
      parties: {
        pour: [{
          partieData: { _id: 'partie-1', nom: 'Bernard', email: 'bernard@example.fr' },
          linkedContacts: [
            { _id: 'responsable-1', nom: 'Responsable', email: 'responsable@example.fr' },
            { _id: 'contact-1', nom: 'Contact', email: 'contact@example.fr' },
          ],
          linkedAvocats: [
            { _id: 'avocat-responsable', nom: 'Exclu', email: 'exclu@example.fr' },
            { _id: 'office-user', nom: 'Cabinet', email: 'cabinet@example.fr' },
          ],
        }],
        contre: [],
      },
    });

    const result = buildDossierEmailRecipientGroups(
      dossier,
      [{ _id: 'office-user' }],
    );
    const flattened = flattenDossierEmailRecipientGroups(result);

    expect(flattened.map((entity) => entity._id)).toEqual(['partie-1', 'contact-1']);
  });

  test('conserve une partie sérialisée directement sans enveloppe partieData', () => {
    const dossier = buildDossier({
      parties: {
        pour: [{ _id: 'legacy-party', nom: 'Dupont', email: 'dupont@example.fr' }],
        contre: [],
      },
    });

    const result = buildDossierEmailRecipientGroups(dossier, []);

    expect(result.pour[0].partieData).toMatchObject({
      _id: 'legacy-party',
      nom: 'Dupont',
      type: 'Partie',
    });
  });
});
