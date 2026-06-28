// Tests unitaires — createSubEntitySlice.js

beforeEach(() => {
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation();
});
afterEach(() => {
  Storage.prototype.removeItem.mockRestore();
});

import {
  createSubEntitySlice,
  reprLegPMReducer,
  contDirPMReducer,
  setRepresentantLegalForModification,
  setContactDirectForModification,
} from '../createSubEntitySlice';

// --- Instance REPRESENTANT_LEGAL (tests complets) ---

describe('createSubEntitySlice instance REPRESENTANT_LEGAL', () => {
  const reducer = reprLegPMReducer;

  const initialState = {
    representantLegalNom: '',
    representantLegalPrenom: '',
    representantLegalEmail: '',
    representantLegalTelephone: '',
    representantLegalGenre: 'Masculin',
    appellationCourrier: 'Cher monsieur',
    nom_Complet: '',
  };

  test('retourne l etat initial par defaut', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state).toEqual(initialState);
  });

  // --- UPDATE NOM ---
  test('UPDATE_REPRESENTANT_LEGAL_NOM met a jour le nom', () => {
    const state = reducer(initialState, { type: 'UPDATE_REPRESENTANT_LEGAL_NOM', payload: 'Dupont' });
    expect(state.representantLegalNom).toBe('Dupont');
  });

  test('UPDATE_REPRESENTANT_LEGAL_NOM recalcule nom_Complet avec prenom existant', () => {
    const base = { ...initialState, representantLegalPrenom: 'Jean' };
    const state = reducer(base, { type: 'UPDATE_REPRESENTANT_LEGAL_NOM', payload: 'Dupont' });
    expect(state.nom_Complet).toBe('Dupont Jean');
  });

  test('UPDATE_REPRESENTANT_LEGAL_NOM avec nom seul (pas de prenom)', () => {
    const state = reducer(initialState, { type: 'UPDATE_REPRESENTANT_LEGAL_NOM', payload: 'Dupont' });
    expect(state.nom_Complet).toBe('Dupont');
  });

  // --- UPDATE PRENOM ---
  test('UPDATE_REPRESENTANT_LEGAL_PRENOM met a jour le prenom', () => {
    const state = reducer(initialState, { type: 'UPDATE_REPRESENTANT_LEGAL_PRENOM', payload: 'Jean' });
    expect(state.representantLegalPrenom).toBe('Jean');
  });

  test('UPDATE_REPRESENTANT_LEGAL_PRENOM recalcule nom_Complet avec nom existant', () => {
    const base = { ...initialState, representantLegalNom: 'Dupont' };
    const state = reducer(base, { type: 'UPDATE_REPRESENTANT_LEGAL_PRENOM', payload: 'Jean' });
    expect(state.nom_Complet).toBe('Dupont Jean');
  });

  test('UPDATE_REPRESENTANT_LEGAL_PRENOM avec prenom seul (pas de nom)', () => {
    const state = reducer(initialState, { type: 'UPDATE_REPRESENTANT_LEGAL_PRENOM', payload: 'Jean' });
    expect(state.nom_Complet).toBe('Jean');
  });

  // --- UPDATE EMAIL ---
  test('UPDATE_REPRESENTANT_LEGAL_EMAIL met a jour l email', () => {
    const state = reducer(initialState, { type: 'UPDATE_REPRESENTANT_LEGAL_EMAIL', payload: 'a@b.com' });
    expect(state.representantLegalEmail).toBe('a@b.com');
  });

  // --- UPDATE TELEPHONE ---
  test('UPDATE_REPRESENTANT_LEGAL_TELEPHONE met a jour le telephone', () => {
    const state = reducer(initialState, { type: 'UPDATE_REPRESENTANT_LEGAL_TELEPHONE', payload: '0612345678' });
    expect(state.representantLegalTelephone).toBe('0612345678');
  });

  // --- UPDATE GENRE ---
  test('UPDATE_REPRESENTANT_LEGAL_GENRE met a jour genre et appellationCourrier Masculin', () => {
    const base = { ...initialState, representantLegalGenre: 'Feminin', appellationCourrier: 'Ch\u00e8re madame' };
    const state = reducer(base, { type: 'UPDATE_REPRESENTANT_LEGAL_GENRE', payload: 'Masculin' });
    expect(state.representantLegalGenre).toBe('Masculin');
    expect(state.appellationCourrier).toBe('Cher monsieur');
  });

  test('UPDATE_REPRESENTANT_LEGAL_GENRE met a jour pour Feminin', () => {
    const state = reducer(initialState, { type: 'UPDATE_REPRESENTANT_LEGAL_GENRE', payload: 'Feminin' });
    expect(state.representantLegalGenre).toBe('Feminin');
    expect(state.appellationCourrier).toBe('Ch\u00e8re madame');
  });

  // --- SET FOR MODIFICATION ---
  test('SET_REPRESENTANT_LEGAL_FOR_MODIFICATION hydrate tous les champs', () => {
    const data = {
      representantLegalNom: 'Martin',
      representantLegalPrenom: 'Sophie',
      representantLegalEmail: 's@m.com',
      representantLegalTelephone: '0698765432',
      representantLegalGenre: 'Feminin',
    };
    const state = reducer(initialState, { type: 'SET_REPRESENTANT_LEGAL_FOR_MODIFICATION', payload: data });
    expect(state.representantLegalNom).toBe('Martin');
    expect(state.representantLegalPrenom).toBe('Sophie');
    expect(state.representantLegalEmail).toBe('s@m.com');
    expect(state.representantLegalTelephone).toBe('0698765432');
    expect(state.representantLegalGenre).toBe('Feminin');
    expect(state.appellationCourrier).toBe('Ch\u00e8re madame');
  });

  test('SET_REPRESENTANT_LEGAL_FOR_MODIFICATION calcule nom_Complet', () => {
    const data = { representantLegalNom: 'A', representantLegalPrenom: 'B' };
    const state = reducer(initialState, { type: 'SET_REPRESENTANT_LEGAL_FOR_MODIFICATION', payload: data });
    expect(state.nom_Complet).toBe('A B');
  });

  test('SET_REPRESENTANT_LEGAL_FOR_MODIFICATION avec payload partiel', () => {
    const state = reducer(initialState, { type: 'SET_REPRESENTANT_LEGAL_FOR_MODIFICATION', payload: {} });
    expect(state.representantLegalNom).toBe('');
    // Genre fallback a 'Masculin' mais appellationCourrier verifie data.genre === 'Masculin'
    // Quand payload.genre est undefined, la condition est false -> 'Chère madame'
    expect(state.representantLegalGenre).toBe('Masculin');
    expect(state.appellationCourrier).toBe('Ch\u00e8re madame');
  });

  // --- RESET ---
  test('RESET_REPRESENTANT_LEGAL retourne initialState et supprime localStorage', () => {
    const modified = { ...initialState, representantLegalNom: 'X', nom_Complet: 'X' };
    const state = reducer(modified, { type: 'RESET_REPRESENTANT_LEGAL' });
    expect(state).toEqual(initialState);
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('representantLegalData');
  });
});

// --- Action creators ---

describe('createSubEntitySlice action creators', () => {
  test('setRepresentantLegalForModification retourne le bon type et payload', () => {
    const data = { representantLegalNom: 'Test' };
    const action = setRepresentantLegalForModification(data);
    expect(action.type).toBe('SET_REPRESENTANT_LEGAL_FOR_MODIFICATION');
    expect(action.payload).toEqual(data);
  });

  test('setContactDirectForModification retourne le bon type et payload', () => {
    const data = { contactDirectNom: 'Test' };
    const action = setContactDirectForModification(data);
    expect(action.type).toBe('SET_CONTACT_DIRECT_FOR_MODIFICATION');
    expect(action.payload).toEqual(data);
  });
});

// --- Instance CONTACT_DIRECT (tests legers) ---

describe('createSubEntitySlice instance CONTACT_DIRECT', () => {
  const reducer = contDirPMReducer;

  test('retourne l etat initial avec prefixe contactDirect', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state.contactDirectNom).toBe('');
    expect(state.contactDirectPrenom).toBe('');
    expect(state.contactDirectGenre).toBe('Masculin');
    expect(state.appellationCourrier).toBe('Cher monsieur');
  });

  test('UPDATE_CONTACT_DIRECT_NOM met a jour contactDirectNom', () => {
    const state = reducer(undefined, { type: 'UPDATE_CONTACT_DIRECT_NOM', payload: 'Durand' });
    expect(state.contactDirectNom).toBe('Durand');
  });

  test('UPDATE_CONTACT_DIRECT_GENRE recalcule appellationCourrier', () => {
    const state = reducer(undefined, { type: 'UPDATE_CONTACT_DIRECT_GENRE', payload: 'Feminin' });
    expect(state.contactDirectGenre).toBe('Feminin');
    expect(state.appellationCourrier).toBe('Ch\u00e8re madame');
  });

  test('RESET_CONTACT_DIRECT retourne initialState et supprime localStorage', () => {
    const modified = reducer(undefined, { type: 'UPDATE_CONTACT_DIRECT_NOM', payload: 'X' });
    const state = reducer(modified, { type: 'RESET_CONTACT_DIRECT' });
    expect(state.contactDirectNom).toBe('');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('contactDirectData');
  });
});

// --- Factory createSubEntitySlice ---

describe('createSubEntitySlice factory', () => {
  test('exporte createSubEntitySlice comme fonction', () => {
    expect(typeof createSubEntitySlice).toBe('function');
  });

  test('cree un slice fonctionnel avec config personnalisee', () => {
    const customSlice = createSubEntitySlice({
      sliceName: 'TestEntity',
      prefix: 'test',
      actionPrefix: 'TEST',
      localStorageKey: 'testData',
    });
    const state = customSlice.reducer(undefined, { type: 'UPDATE_TEST_NOM', payload: 'Hello' });
    expect(state.testNom).toBe('Hello');
  });
});
