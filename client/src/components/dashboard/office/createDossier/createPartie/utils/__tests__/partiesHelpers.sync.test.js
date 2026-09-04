import { extractPartyRelationsFromResponse } from '../partiesHelpers';

const response = {
  message: 'ok',
  dossier: {
    _id: 'd1',
    dossier: {
      parties: {
        pour: [
          { idPartie: 'p1', nomPartie: 'Pour 1', avocats: [{ _id: 'a1', isPlaidant: true }], contacts: [{ _id: 'c1' }] },
          { partieData: { _id: 'p2' }, nomPartie: 'Pour 2', avocats: [], contacts: [] },
        ],
        contre: [
          { idPartie: 'p3', nomPartie: 'Contre 1', avocats: [{ _id: 'a3', isPostulant: true }] },
        ],
      },
    },
  },
};

describe('extractPartyRelationsFromResponse', () => {
  test('prefere les relations deja filtrees par le serveur (partyRelations) au document brut', () => {
    const withFiltered = { ...response, partyRelations: { avocats: [], contacts: [{ _id: 'seulement-accessible' }] } };
    expect(extractPartyRelationsFromResponse(withFiltered, 'p1')).toEqual({ avocats: [], contacts: [{ _id: 'seulement-accessible' }] });
    expect(extractPartyRelationsFromResponse({ partyRelations: { avocats: [{ _id: 'a' }] } }, 'p1')).toEqual({ avocats: [{ _id: 'a' }], contacts: [] });
  });

  test('retourne les relations canoniques d une partie Pour trouvee par idPartie', () => {
    expect(extractPartyRelationsFromResponse(response, 'p1')).toEqual({
      avocats: [{ _id: 'a1', isPlaidant: true }],
      contacts: [{ _id: 'c1' }],
    });
  });

  test('retrouve une partie par partieData._id et une partie Contre sans tableau contacts', () => {
    expect(extractPartyRelationsFromResponse(response, 'p2')).toEqual({ avocats: [], contacts: [] });
    expect(extractPartyRelationsFromResponse(response, 'p3')).toEqual({
      avocats: [{ _id: 'a3', isPostulant: true }],
      contacts: [],
    });
  });

  test('retourne null si la reponse ne porte pas de dossier ou si la partie est inconnue', () => {
    expect(extractPartyRelationsFromResponse(null, 'p1')).toBeNull();
    expect(extractPartyRelationsFromResponse({ message: 'ok' }, 'p1')).toBeNull();
    expect(extractPartyRelationsFromResponse(response, 'inconnue')).toBeNull();
    expect(extractPartyRelationsFromResponse(response, '')).toBeNull();
  });
});
