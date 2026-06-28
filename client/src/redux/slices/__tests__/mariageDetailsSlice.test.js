// Tests unitaires — mariageDetailsSlice.js

jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

beforeEach(() => {
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation();
});
afterEach(() => {
  Storage.prototype.removeItem.mockRestore();
});

import apiClient from '../../../services/apiClient';
import reducer, {
  updateRegime_matrimonial,
  updateMarriageLocation,
  updateMarriageDate,
  toggleFormContratMariage,
  updateContractDate,
  updateNotaryName,
  resetMariageDetails,
  updateNotary,
  setConfirmation,
  selectNotaire,
  setAddingText,
  setListeAffich,
  setDetailMariageForModification,
  resetMariageDetailsShared,
  setContactFieldNotaireMariage,
  fetchNotaires,
} from '../mariageDetailsSlice';

// Le reducer exporte est un wrappedReducer qui force validity.errors={}, nbErrors=0, validEmail=true, submitAttempted=false
const getBaseState = () => reducer(undefined, { type: '@@INIT' });

describe('mariageDetailsSlice etat initial', () => {
  test('retourne l etat initial par defaut', () => {
    const state = getBaseState();
    expect(state.detailsMariage.marriageLocation).toBe('');
    expect(state.detailsMariage.regime_matrimonial).toBe('');
    expect(state.listeNotaires.notaires).toEqual([]);
    expect(state.affichagesComposants.modaleMariage).toBe(false);
  });

  test('le wrapper force validity.errors={} et nbErrors=0', () => {
    const state = getBaseState();
    // Le wrapper ecrase toujours errors a {} et nbErrors a 0
    expect(state.validity.errors).toEqual({});
    expect(state.validity.nbErrors).toBe(0);
    expect(state.validity.validEmail).toBe(true);
    expect(state.validity.submitAttempted).toBe(false);
  });
});

describe('mariageDetailsSlice RTK reducers', () => {
  const base = getBaseState();

  test('updateRegime_matrimonial definit regime_matrimonial', () => {
    const state = reducer(base, updateRegime_matrimonial('communaute'));
    expect(state.detailsMariage.regime_matrimonial).toBe('communaute');
  });

  test('updateMarriageLocation definit marriageLocation', () => {
    const state = reducer(base, updateMarriageLocation('Paris'));
    expect(state.detailsMariage.marriageLocation).toBe('Paris');
  });

  test('updateMarriageDate definit marriageDate', () => {
    const state = reducer(base, updateMarriageDate('2024-01-15'));
    expect(state.detailsMariage.marriageDate).toBe('2024-01-15');
  });

  test('toggleFormContratMariage inverse contratMariageForm', () => {
    const state = reducer(base, toggleFormContratMariage());
    expect(state.affichagesComposants.contratMariageForm).toBe(true);
    const state2 = reducer(state, toggleFormContratMariage());
    expect(state2.affichagesComposants.contratMariageForm).toBe(false);
  });

  test('updateContractDate definit contractDate', () => {
    const state = reducer(base, updateContractDate('2024-06-01'));
    expect(state.detailsMariage.contractDate).toBe('2024-06-01');
  });

  test('updateNotaryName definit notaryName', () => {
    const state = reducer(base, updateNotaryName('Me Dupont'));
    expect(state.detailsMariage.notaryName).toBe('Me Dupont');
  });

  test('resetMariageDetails retourne initialState et supprime localStorage', () => {
    const modified = reducer(base, updateMarriageLocation('Lyon'));
    const state = reducer(modified, resetMariageDetails());
    expect(state.detailsMariage.marriageLocation).toBe('');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('mariageDetailsState');
  });

  test('updateNotary fusionne les champs du notary', () => {
    const state = reducer(base, updateNotary({ nom: 'Dupont', prenoms: 'Jean' }));
    expect(state.notary.nom).toBe('Dupont');
    expect(state.notary.prenoms).toBe('Jean');
  });

  test('setConfirmation definit confirmationAjout', () => {
    const state = reducer(base, setConfirmation(true));
    expect(state.affichagesComposants.confirmationAjout).toBe(true);
  });

  test('selectNotaire met a jour currentNotary et notaryName', () => {
    const notaire = { _id: 'n1', nom: 'Martin', prenoms: 'Pierre' };
    const state = reducer(base, selectNotaire(notaire));
    expect(state.currentNotary).toEqual(notaire);
    expect(state.detailsMariage.notaryName).toBe('Martin Pierre');
    expect(state.listeNotaires.notaires).toEqual([]);
    expect(state.affichagesComposants.listeNotairesAffich).toBe(false);
  });

  test('setAddingText definit addingText', () => {
    const state = reducer(base, setAddingText(true));
    expect(state.affichagesComposants.addingText).toBe(true);
  });

  test('setListeAffich definit listeNotairesAffich', () => {
    const state = reducer(base, setListeAffich(true));
    expect(state.affichagesComposants.listeNotairesAffich).toBe(true);
  });
});

describe('mariageDetailsSlice extraReducers', () => {
  const base = getBaseState();

  test('SET_DETAIL_MARIAGE_FOR_MODIFICATION hydrate les details', () => {
    const data = {
      marriageLocation: 'Lyon',
      marriageDate: '2024-01-15T00:00:00.000Z',
      contractDate: '2024-02-15T00:00:00.000Z',
      regime_matrimonial: 'separation',
      notary: { nom: 'Duval', prenoms: 'Anne' },
    };
    const state = reducer(base, { type: 'SET_DETAIL_MARIAGE_FOR_MODIFICATION', payload: data });
    expect(state.detailsMariage.marriageLocation).toBe('Lyon');
    expect(state.detailsMariage.regime_matrimonial).toBe('separation');
    expect(state.notary.nom).toBe('Duval');
  });

  test('RESET_MARIAGE_DETAILS retourne initialState et supprime localStorage', () => {
    const modified = reducer(base, updateMarriageLocation('Marseille'));
    const state = reducer(modified, { type: 'RESET_MARIAGE_DETAILS' });
    expect(state.detailsMariage.marriageLocation).toBe('');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('mariageDetailsState');
  });

  test('SET_CONTACT_FIELD_NOTAIRE_MARIAGE met a jour un champ du notary', () => {
    const state = reducer(base, { type: 'SET_CONTACT_FIELD_NOTAIRE_MARIAGE', payload: { field: 'nom', value: 'Test' } });
    expect(state.notary.nom).toBe('Test');
  });

  test('SET_CONTACT_FIELD_NOTAIRE_MARIAGE met a jour un champ de detailsMariage', () => {
    const state = reducer(base, { type: 'SET_CONTACT_FIELD_NOTAIRE_MARIAGE', payload: { field: 'marriageLocation', value: 'Nice' } });
    expect(state.detailsMariage.marriageLocation).toBe('Nice');
  });
});

describe('mariageDetailsSlice fetchNotaires lifecycle', () => {
  const base = getBaseState();

  test('fulfilled avec emptyQuery vide la liste', () => {
    const state = reducer(base, fetchNotaires.fulfilled({ notaires: [], totalPages: 0, currentPage: 1, emptyQuery: true }, 'reqId', { query: '' }));
    expect(state.listeNotaires.notaires).toEqual([]);
    expect(state.affichagesComposants.listeNotairesAffich).toBe(false);
  });

  test('fulfilled avec 0 notaires et pas emptyQuery met confirmationAjout', () => {
    const state = reducer(base, fetchNotaires.fulfilled({ notaires: [], totalPages: 0, currentPage: 1, emptyQuery: false }, 'reqId', { query: 'xyz' }));
    expect(state.affichagesComposants.confirmationAjout).toBe(true);
    expect(state.affichagesComposants.listeNotairesAffich).toBe(false);
  });

  test('fulfilled avec >1 notaires affiche la liste', () => {
    const notaires = [{ nom: 'A', prenoms: 'B' }, { nom: 'C', prenoms: 'D' }];
    const state = reducer(base, fetchNotaires.fulfilled({ notaires, totalPages: 1, currentPage: 1, emptyQuery: false }, 'reqId', { query: 'test' }));
    expect(state.listeNotaires.notaires).toEqual(notaires);
    expect(state.affichagesComposants.listeNotairesAffich).toBe(true);
    expect(state.affichagesComposants.confirmationAjout).toBe(false);
  });

  test('fulfilled avec 1 notaire et addingText selectionne automatiquement', () => {
    const withAddingText = reducer(base, setAddingText(true));
    const notaire = { nom: 'Unique', prenoms: 'Notaire' };
    const state = reducer(withAddingText, fetchNotaires.fulfilled({ notaires: [notaire], totalPages: 1, currentPage: 1, emptyQuery: false }, 'reqId', { query: 'u' }));
    expect(state.currentNotary).toEqual(notaire);
    expect(state.detailsMariage.notaryName).toBe('Unique Notaire');
  });
});

describe('mariageDetailsSlice action creators', () => {
  test('setDetailMariageForModification retourne le bon type', () => {
    const action = setDetailMariageForModification({ marriageLocation: 'X' });
    expect(action.type).toBe('SET_DETAIL_MARIAGE_FOR_MODIFICATION');
  });

  test('resetMariageDetailsShared retourne le bon type', () => {
    expect(resetMariageDetailsShared().type).toBe('RESET_MARIAGE_DETAILS');
  });

  test('setContactFieldNotaireMariage retourne le bon type et payload', () => {
    const action = setContactFieldNotaireMariage('nom', 'Test');
    expect(action).toEqual({ type: 'SET_CONTACT_FIELD_NOTAIRE_MARIAGE', payload: { field: 'nom', value: 'Test' } });
  });
});
