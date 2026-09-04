// Tests unitaires — currentDossierSlice : le nom affiché dans l'en-tête du
// dossier suit la règle du nom automatique (anomalie nom-dossier). À la
// sélection d'une entité, le nom n'est régénéré depuis les parties que s'il
// est vide ou encore égal à un nom généré ; un nom personnalisé est conservé.

jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../services/socketService', () => ({
  initSocket: jest.fn(() => ({ emit: jest.fn(), connected: true })),
}));

beforeEach(() => {
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation();
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation();
});
afterEach(() => {
  Storage.prototype.getItem.mockRestore();
  Storage.prototype.setItem.mockRestore();
  Storage.prototype.removeItem.mockRestore();
  jest.resetModules();
});

let reducer;
beforeEach(() => {
  jest.isolateModules(() => {
    reducer = require('../currentDossierSlice').default;
  });
});

const NOM_SAISI = 'ZZTEST Dossier Recette';

// Parties avec nomPartie renseigné (cas produit par le formulaire).
const partiesNommees = () => ({
  pour: [{ idPartie: 'p1', nomPartie: 'Durand Alice', partieData: { _id: 'p1', nom: 'Durand', prenoms: 'Alice' }, avocats: [], contacts: [] }],
  contre: [{ idPartie: 'c1', nomPartie: 'SARL Adverse', partieData: { _id: 'c1', raisonSociale: 'SARL Adverse' }, avocats: [], contacts: [] }],
});

// Parties sans nomPartie : le nom de l'en-tête suit alors partieData.nom et
// change donc quand l'entité est renommée.
const partiesSansNomPartie = () => ({
  pour: [{ idPartie: 'p1', partieData: { _id: 'p1', nom: 'Durand' }, avocats: [], contacts: [] }],
  contre: [{ idPartie: 'c1', partieData: { _id: 'c1', nom: 'Adverse' }, avocats: [], contacts: [] }],
});

const makeDossier = (nom, parties) => ({
  _id: 'd1',
  dossier: { _id: 'd1', nom, documents: [], parties },
});

const charger = (dossier) => reducer(reducer(undefined, { type: '@@INIT' }), { type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: dossier });
const selectionner = (state, entity) => reducer(state, { type: 'SET_SELECTED_ENTITY', payload: entity });

describe('currentDossierSlice SET_SELECTED_ENTITY — nom du dossier', () => {
  test('un nom personnalisé n est pas remplacé à la sélection d une entité', () => {
    let state = charger(makeDossier(NOM_SAISI, partiesNommees()));
    state = selectionner(state, { _id: 'p1', nom: 'Dupont', prenoms: 'Alice' });
    expect(state.dossier.dossier.nom).toBe(NOM_SAISI);
    // Les parties sont bien synchronisées malgré la conservation du nom.
    expect(state.dossier.dossier.parties.pour[0].partieData.nom).toBe('Dupont');
    expect(state.selectedEntity).toEqual({ _id: 'p1', nom: 'Dupont', prenoms: 'Alice' });
  });

  test('un nom personnalisé est conservé après plusieurs sélections successives', () => {
    let state = charger(makeDossier(NOM_SAISI, partiesNommees()));
    state = selectionner(state, { _id: 'p1', nom: 'Durand', prenoms: 'Alice' });
    state = selectionner(state, { _id: 'c1', raisonSociale: 'SARL Adverse' });
    state = selectionner(state, null);
    expect(state.dossier.dossier.nom).toBe(NOM_SAISI);
  });

  test('un nom vide est régénéré depuis les parties', () => {
    let state = charger(makeDossier('', partiesSansNomPartie()));
    state = selectionner(state, { _id: 'p1', nom: 'Dupont' });
    expect(state.dossier.dossier.nom.trim()).toBe('Dupont c/ Adverse');
  });

  test('un nom au format automatique de l en-tête suit le renommage de l entité', () => {
    let state = charger(makeDossier('Durand c/ Adverse ', partiesSansNomPartie()));
    state = selectionner(state, { _id: 'p1', nom: 'Dupont' });
    expect(state.dossier.dossier.nom.trim()).toBe('Dupont c/ Adverse');
  });

  test('un nom au format automatique du formulaire (« A c/ B ») est traité comme généré', () => {
    // Le formulaire nomme « Durand Alice c/ SARL Adverse » (sans espace final) ;
    // l'en-tête le reconnaît comme généré et le réécrit dans son propre format.
    let state = charger(makeDossier('Durand Alice c/ SARL Adverse', partiesNommees()));
    state = selectionner(state, { _id: 'p1', nom: 'Dupont', prenoms: 'Alice' });
    expect(state.dossier.dossier.nom).toBe('Durand Alice c/ SARL Adverse ');
  });

  test('« Dossier sans nom » est régénéré', () => {
    let state = charger(makeDossier('Dossier sans nom', partiesSansNomPartie()));
    state = selectionner(state, { _id: 'c1', nom: 'Tiers' });
    expect(state.dossier.dossier.nom.trim()).toBe('Durand c/ Tiers');
  });
});
