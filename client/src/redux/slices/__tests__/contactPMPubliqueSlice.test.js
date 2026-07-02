// Tests unitaires — contactPMPubliqueSlice.js

jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../currentDossierSlice', () => ({
  fetchCurrentDossier: jest.fn(() => ({ type: 'MOCK/fetchCurrentDossier' })),
  addLinkedContactToParty: jest.fn(() => ({ type: 'MOCK/addLinkedContactToParty' })),
}));
jest.mock('../partieSlice', () => ({
  setPartie: jest.fn(() => jest.fn()),
  setPartieLink: jest.fn(() => jest.fn()),
  setPartiesLinkAllPour: jest.fn(() => ({ type: 'MOCK/setPartiesLinkAllPour' })),
  setPartiesLinkAllContre: jest.fn(() => ({ type: 'MOCK/setPartiesLinkAllContre' })),
}));
jest.mock('../partieEditSlice', () => ({
  setPartie: jest.fn(() => jest.fn()),
  setPartieLink: jest.fn(() => jest.fn()),
  setPartiesLinkAllPour: jest.fn(() => ({ type: 'MOCK/editSetPartiesLinkAllPour' })),
  setPartiesLinkAllContre: jest.fn(() => ({ type: 'MOCK/editSetPartiesLinkAllContre' })),
}));

beforeEach(() => {
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation();
});
afterEach(() => {
  Storage.prototype.removeItem.mockRestore();
});

import apiClient from '../../../services/apiClient';
import { addLinkedContactToParty, fetchCurrentDossier } from '../currentDossierSlice';
import {
  setPartie as setPartieCreate,
  setPartieLink as setPartieLinkCreate,
  setPartiesLinkAllPour as setPartiesLinkAllPourCreate,
  setPartiesLinkAllContre as setPartiesLinkAllContreCreate,
} from '../partieSlice';
import {
  setPartie as setPartieEdit,
  setPartieLink as setPartieLinkEdit,
  setPartiesLinkAllPour as setPartiesLinkAllPourEdit,
  setPartiesLinkAllContre as setPartiesLinkAllContreEdit,
} from '../partieEditSlice';

import {
  contactPMPubliqueReducer as reducer,
  setPersonneMoralePubliqueField,
  setPersonneMoralePubliqueForModification,
  resetPersonneMoralePublique,
  resetContactPMPublique,
  setSubmitAttemptedPMP,
  createContactPMPublique,
  updateContactPMPublique,
} from '../contactPMPubliqueSlice';

const getBase = () => reducer(undefined, { type: '@@INIT' });

// ========================================================================
// Etat initial
// ========================================================================

describe('contactPMPubliqueSlice etat initial', () => {
  test('retourne l etat initial par defaut', () => {
    const state = getBase();
    expect(state.personneMorale.denomination).toBe('');
    expect(state.personneMorale.genre).toBe('Masculin');
    expect(state.validation.submitAttempted).toBe(false);
    expect(state.validation.emailExistsError).toBeNull();
  });

  test('initialise les erreurs a false (isValidEmail et isValidField desactives)', () => {
    const state = getBase();
    // isValidEmail/isValidField retournent toujours true => errors = false partout
    expect(state.validation.errors.denomination).toBe(false);
    expect(state.validation.errors.email).toBe(false);
    expect(state.validation.errorsCount).toBe(0);
  });
});

// ========================================================================
// ExtraReducers
// ========================================================================

describe('contactPMPubliqueSlice EMAIL_ALREADY_EXISTS_PMP', () => {
  // Le handler EMAIL_ALREADY_EXISTS_PMP a ete volontairement desactive dans le
  // reducer (voir contactPMPubliqueSlice.js : "Desactive : pas de blocage pour
  // email duplique"). L'action est toujours dispatchee par le thunk sur un 409
  // mais elle ne modifie plus l'etat. Le test verifie donc que emailExistsError
  // et errorField restent a null (aucun blocage cote formulaire).
  test('ne modifie pas l etat (handler desactive)', () => {
    const state = reducer(getBase(), {
      type: 'EMAIL_ALREADY_EXISTS_PMP',
      payload: { message: 'Email deja utilise', field: 'email' },
    });
    expect(state.validation.emailExistsError).toBeNull();
    expect(state.validation.errorField).toBeNull();
  });
});

describe('contactPMPubliqueSlice RESET_CONTACT_PM_PUBLIQUE_PMP', () => {
  test('remet a l etat initial et supprime localStorage', () => {
    let state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUB_FIELD',
      payload: { field: 'denomination', value: 'Ma Societe' },
    });
    state = reducer(state, { type: 'RESET_CONTACT_PM_PUBLIQUE_PMP' });
    expect(state.personneMorale.denomination).toBe('');
    expect(state.personneMorale.genre).toBe('Masculin');
    expect(state.validation.submitAttempted).toBe(false);
    expect(state.validation.emailExistsError).toBeNull();
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('personneMoralePubliqueData');
  });
});

describe('contactPMPubliqueSlice SET_PERSONNE_MORALE_PUB_FIELD', () => {
  test('met a jour un champ simple (denomination)', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUB_FIELD',
      payload: { field: 'denomination', value: 'TestDenom' },
    });
    expect(state.personneMorale.denomination).toBe('TestDenom');
  });

  test('met a jour email et recalcule validateMail', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUB_FIELD',
      payload: { field: 'email', value: 'test@example.com' },
    });
    expect(state.personneMorale.email).toBe('test@example.com');
    // isValidEmail desactive => toujours true
    expect(state.validation.validateMail).toBe(true);
    expect(state.validation.emailExistsError).toBeNull();
  });

  test('met a jour contactEmail et recalcule validateContactMail', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUB_FIELD',
      payload: { field: 'contactEmail', value: 'c@d.com' },
    });
    expect(state.personneMorale.contactEmail).toBe('c@d.com');
    expect(state.validation.validateContactMail).toBe(true);
  });

  test('met a jour genre et recalcule appellationCourrierAffichage', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUB_FIELD',
      payload: { field: 'genre', value: 'Feminin' },
    });
    expect(state.personneMorale.genre).toBe('Feminin');
    expect(state.validation.appellationCourrierAffichage).toBe('Feminin');
  });

  test('met a jour appellationCourrierMasculin via appellationCourrierGenre', () => {
    // genre par defaut = Masculin
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUB_FIELD',
      payload: { field: 'appellationCourrierMasculin', value: 'Cher monsieur' },
    });
    expect(state.appellationCourrierGenre.appellationCourrierMasculin).toBe('Cher monsieur');
    expect(state.personneMorale.appellationCourrier).toBe('Cher monsieur');
  });

  test('met a jour appellationCourrierFeminin (genre Feminin)', () => {
    let state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUB_FIELD',
      payload: { field: 'genre', value: 'Feminin' },
    });
    state = reducer(state, {
      type: 'SET_PERSONNE_MORALE_PUB_FIELD',
      payload: { field: 'appellationCourrierFeminin', value: 'Chere madame' },
    });
    expect(state.personneMorale.appellationCourrier).toBe('Chere madame');
  });

  test('met a jour submitAttempted', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUB_FIELD',
      payload: { field: 'submitAttempted', value: true },
    });
    expect(state.validation.submitAttempted).toBe(true);
  });

  test('recalcule errorsCount apres modification', () => {
    // Comme isValidField retourne toujours true, errorsCount reste 0
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUB_FIELD',
      payload: { field: 'denomination', value: '' },
    });
    expect(state.validation.errorsCount).toBe(0);
  });
});

describe('contactPMPubliqueSlice SET_PERSONNE_MORALE_PUBLIQUE_FOR_MODIFICATION', () => {
  test('hydrate les champs depuis contactData', () => {
    const data = {
      denomination: 'Mairie',
      adresse: '1 place',
      ville: 'Lyon',
      codePostal: '69000',
      genre: 'Feminin',
      appellationCourrier: 'Chere madame',
    };
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUBLIQUE_FOR_MODIFICATION',
      payload: data,
    });
    expect(state.personneMorale.denomination).toBe('Mairie');
    expect(state.personneMorale.ville).toBe('Lyon');
    expect(state.validation.errorsCount).toBe(0);
    expect(state.validation.emailExistsError).toBeNull();
  });

  test('met a jour appellationCourrierAffichage pour Masculin', () => {
    const data = { genre: 'Masculin', appellationCourrier: 'Cher monsieur' };
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUBLIQUE_FOR_MODIFICATION',
      payload: data,
    });
    expect(state.validation.appellationCourrierAffichage).toBe('Masculin');
    expect(state.appellationCourrierGenre.appellationCourrierMasculin).toBe('Cher monsieur');
  });

  test('met a jour appellationCourrierAffichage pour Feminin', () => {
    const data = { genre: 'Feminin', appellationCourrier: 'Chere madame' };
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUBLIQUE_FOR_MODIFICATION',
      payload: data,
    });
    expect(state.validation.appellationCourrierAffichage).toBe('Feminin');
    expect(state.appellationCourrierGenre.appellationCourrierFeminin).toBe('Chere madame');
  });
});

describe('contactPMPubliqueSlice RESET_FORM_PMP_PUBLIC', () => {
  test('remet tout a l etat initial et supprime localStorage', () => {
    let state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_PUB_FIELD',
      payload: { field: 'denomination', value: 'XX' },
    });
    state = reducer(state, { type: 'RESET_FORM_PMP_PUBLIC' });
    expect(state.personneMorale.denomination).toBe('');
    expect(state.personneMorale.genre).toBe('Masculin');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('personneMoralePubliqueData');
  });
});

// ========================================================================
// Action creators
// ========================================================================

describe('contactPMPubliqueSlice action creators', () => {
  test('setPersonneMoralePubliqueField retourne le bon type', () => {
    const action = setPersonneMoralePubliqueField('denomination', 'Test');
    expect(action.type).toBe('SET_PERSONNE_MORALE_PUB_FIELD');
    expect(action.payload).toEqual({ field: 'denomination', value: 'Test' });
  });

  test('setPersonneMoralePubliqueForModification retourne le bon type', () => {
    const action = setPersonneMoralePubliqueForModification({ denomination: 'X' });
    expect(action.type).toBe('SET_PERSONNE_MORALE_PUBLIQUE_FOR_MODIFICATION');
  });

  test('resetPersonneMoralePublique retourne RESET_FORM_PMP_PUBLIC', () => {
    expect(resetPersonneMoralePublique().type).toBe('RESET_FORM_PMP_PUBLIC');
  });

  test('resetContactPMPublique retourne RESET_CONTACT_PM_PUBLIQUE_PMP', () => {
    expect(resetContactPMPublique().type).toBe('RESET_CONTACT_PM_PUBLIQUE_PMP');
  });

  test('setSubmitAttemptedPMP retourne le bon type', () => {
    const action = setSubmitAttemptedPMP(true);
    expect(action.type).toBe('SET_SUBMITATTEMPTED_PMP');
    expect(action.payload).toBe(true);
  });
});

// ========================================================================
// Thunk createContactPMPublique
// ========================================================================

describe('contactPMPubliqueSlice thunk createContactPMPublique', () => {
  let dispatch, getState;

  beforeEach(() => {
    dispatch = jest.fn();
    getState = jest.fn(() => ({
      currentDossier: { dossier: { _id: 'doss1' } },
      partieEditData: { parties: [{ idPartie: 'p1', typePartie: 'Pour' }] },
    }));
    apiClient.post.mockReset();
  });

  const baseContactData = {
    fromCreatePartie: null,
    personneMorale: { personneMorale: { denomination: 'Test' } },
    user: { _id: 'u1' },
  };

  test('succes simple — dispatch SUCCESS puis RESET', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c1', denomination: 'Test' } });
    await createContactPMPublique(baseContactData, 'tok')(dispatch, getState);

    const types = dispatch.mock.calls.map(c => {
      const arg = c[0];
      return typeof arg === 'function' ? 'thunk' : arg.type;
    });
    expect(types).toContain('CREATE_CONTACT_PM_PUBLIQUE_SUCCESS');
    expect(types).toContain('RESET_CONTACT_PM_PUBLIQUE_PMP');
    expect(types).toContain('SET_CREATE_PARTIE_MODAL');
  });

  test('isTransformedToPartie dispatch setPartie create', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c2' } });
    const data = {
      ...baseContactData,
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartieForPartie: { isTransformedToPartie: true, typePartie: 'Pour' },
      },
    };
    await createContactPMPublique(data, 'tok')(dispatch, getState);
    expect(setPartieCreate).toHaveBeenCalledWith('Pour', { _id: 'c2' });
  });

  test('isLinkedToSinglePartie dispatch setPartieLink create', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c3' } });
    const data = {
      ...baseContactData,
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartiesForLink: { isLinkedToSinglePartie: true, linkedPartieId: 'p1' },
      },
    };
    await createContactPMPublique(data, 'tok')(dispatch, getState);
    expect(setPartieLinkCreate).toHaveBeenCalledWith('p1', { _id: 'c3' });
  });

  test('isLinkedToSinglePartie en mode edit dispatch addLinkedContactToParty', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c4' } });
    const data = {
      ...baseContactData,
      fromCreatePartie: {
        mode: 'edit',
        fromCreatePartiesForLink: { isLinkedToSinglePartie: true, linkedPartieId: 'p1' },
      },
    };
    await createContactPMPublique(data, 'tok')(dispatch, getState);
    expect(setPartieLinkEdit).toHaveBeenCalledWith('p1', { _id: 'c4' });
    expect(addLinkedContactToParty).toHaveBeenCalledWith('doss1', 'p1', { existingContactId: 'c4' });
  });

  test('isLinkedToPartiesGroup Pour dispatch setPartiesLinkAllPour', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c5' } });
    const data = {
      ...baseContactData,
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartiesForLink: { isLinkedToPartiesGroup: true, linkedGroupType: 'Pour' },
      },
    };
    await createContactPMPublique(data, 'tok')(dispatch, getState);
    expect(setPartiesLinkAllPourCreate).toHaveBeenCalledWith({ contact: { _id: 'c5' } });
  });

  test('isLinkedToPartiesGroup Contre dispatch setPartiesLinkAllContre', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c6' } });
    const data = {
      ...baseContactData,
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartiesForLink: { isLinkedToPartiesGroup: true, linkedGroupType: 'Contre' },
      },
    };
    await createContactPMPublique(data, 'tok')(dispatch, getState);
    expect(setPartiesLinkAllContreCreate).toHaveBeenCalledWith({ contact: { _id: 'c6' } });
  });

  test('isLinkedToDossier dispatch ADD_SELECTED_CONTACT', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c7' } });
    const data = {
      ...baseContactData,
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartiesForLink: { isLinkedToDossier: true },
      },
    };
    await createContactPMPublique(data, 'tok')(dispatch, getState);
    const types = dispatch.mock.calls.map(c => (typeof c[0] === 'function' ? 'thunk' : c[0].type));
    expect(types).toContain('ADD_SELECTED_CONTACT');
    expect(types).toContain('SET_MODIFYING_CONTACT_ID');
  });

  test('erreur 409 dispatch EMAIL_ALREADY_EXISTS_PMP', async () => {
    apiClient.post.mockRejectedValue({
      response: { status: 409, data: { msg: 'Email existe', field: 'email' } },
      message: 'fallback',
    });
    await createContactPMPublique(baseContactData, 'tok')(dispatch, getState).catch(() => {});
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('EMAIL_ALREADY_EXISTS_PMP');
  });

  test('erreur autre dispatch CREATE_CONTACT_PM_PUBLIQUE_FAIL', async () => {
    apiClient.post.mockRejectedValue({ message: 'Erreur serveur' });
    await createContactPMPublique(baseContactData, 'tok')(dispatch, getState).catch(() => {});
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('CREATE_CONTACT_PM_PUBLIQUE_FAIL');
  });
});

// ========================================================================
// Thunk updateContactPMPublique
// ========================================================================

describe('contactPMPubliqueSlice thunk updateContactPMPublique', () => {
  let dispatch, getState;

  beforeEach(() => {
    dispatch = jest.fn();
    getState = jest.fn(() => ({
      currentDossier: { dossier: { _id: 'doss1' } },
      partieData: { parties: [{ idPartie: 'id1', typePartie: 'Pour' }] },
      partieEditData: { parties: [{ idPartie: 'id1', typePartie: 'Pour' }] },
    }));
    apiClient.put.mockReset();
  });

  const contactData = {
    personneMorale: { personneMorale: { denomination: 'UpdateTest' } },
    user: { _id: 'u1' },
  };

  test('succes isLinkedToPartiesGroup create dispatch UPDATE_CONTACT_PM_PUBLIQUE_SUCCESS', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1', denomination: 'UpdateTest' } });
    const options = {
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartiesForLink: { isLinkedToPartiesGroup: true },
      },
    };
    await updateContactPMPublique('c1', contactData, 'tok', options)(dispatch, getState);
    // Certaines actions dispatchees sont le retour de thunks mockes (ex.
    // fetchCurrentDossier) qui, sous babel-jest, renvoient undefined depuis la
    // factory de mock hoistee. On filtre donc les valeurs null/undefined et les
    // fonctions avant de lire .type, comme dans les autres tests de ce bloc.
    const types = dispatch.mock.calls
      .map(c => c[0])
      .filter(a => a != null && typeof a !== 'function')
      .map(a => a.type);
    expect(types).toContain('UPDATE_CONTACT_PM_PUBLIQUE_SUCCESS');
    expect(types).toContain('RESET_CONTACT_PM_PUBLIQUE_PMP');
  });

  test('succes isLinkedToPartiesGroup edit dispatch EDIT_UPDATE + fetchCurrentDossier', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1' } });
    const options = {
      fromCreatePartie: {
        mode: 'edit',
        fromCreatePartiesForLink: { isLinkedToPartiesGroup: true },
      },
    };
    await updateContactPMPublique('c1', contactData, 'tok', options)(dispatch, getState);
    const types = dispatch.mock.calls
      .map(c => c[0])
      .filter(a => a != null && typeof a !== 'function')
      .map(a => a.type);
    expect(types).toContain('EDIT_UPDATE_CONTACT_PM_PUBLIQUE_SUCCESS');
    expect(fetchCurrentDossier).toHaveBeenCalledWith('doss1', 'tok');
  });

  test('succes isLinkedToSinglePartie dispatch SUCCESS', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1' } });
    const options = {
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartiesForLink: { isLinkedToSinglePartie: true },
      },
    };
    await updateContactPMPublique('c1', contactData, 'tok', options)(dispatch, getState);
    const types = dispatch.mock.calls
      .map(c => c[0])
      .filter(a => a != null && typeof a !== 'function')
      .map(a => a.type);
    expect(types).toContain('UPDATE_CONTACT_PM_PUBLIQUE_SUCCESS');
  });

  test('succes partieItself dispatch UPDATE_PARTIE', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1', denomination: 'XX', ville: 'Lyon' } });
    const options = {
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartieForPartie: { typePartie: 'Pour' },
      },
      modificationType: 'partieItself',
    };
    await updateContactPMPublique('c1', contactData, 'tok', options)(dispatch, getState);
    // fetchCurrentDossier (thunk mocke) est dispatche et renvoie undefined sous
    // babel-jest : on filtre null/undefined et fonctions avant de lire .type.
    const types = dispatch.mock.calls
      .map(c => c[0])
      .filter(a => a != null && typeof a !== 'function')
      .map(a => a.type);
    expect(types).toContain('UPDATE_PARTIE');
  });

  test('succes contactLinkedToDossier dispatch UPDATE_SELECTED_CONTACT', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1' } });
    const options = { modificationType: 'contactLinkedToDossier' };
    await updateContactPMPublique('c1', contactData, 'tok', options)(dispatch, getState);
    // fetchCurrentDossier (thunk mocke) est dispatche et renvoie undefined sous
    // babel-jest : on filtre null/undefined et fonctions avant de lire .type.
    const types = dispatch.mock.calls
      .map(c => c[0])
      .filter(a => a != null && typeof a !== 'function')
      .map(a => a.type);
    expect(types).toContain('UPDATE_SELECTED_CONTACT');
    expect(types).toContain('RESET_CONTACT_PM_PUBLIQUE_PMP');
  });

  test('erreur dispatch UPDATE_CONTACT_PM_PUBLIQUE_FAIL', async () => {
    apiClient.put.mockRejectedValue({ message: 'Erreur reseau' });
    await updateContactPMPublique('c1', contactData, 'tok')(dispatch, getState).catch(() => {});
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('UPDATE_CONTACT_PM_PUBLIQUE_FAIL');
  });
});
