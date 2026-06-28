// Tests unitaires — personneMoraleSlice.js

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
  personneMoraleReducer as reducer,
  setPersonneMoraleField,
  setPersonneMoraleForModification,
  resetPersonneMorale,
  validateFormeJuridique,
  resetContactPM,
  resetRepresentantLegal,
  resetContactDirectPM,
  resetServErrorsPM,
  createContactPM,
  updateContactPM,
} from '../personneMoraleSlice';

const getBase = () => reducer(undefined, { type: '@@INIT' });

// ========================================================================
// Etat initial
// ========================================================================

describe('personneMoraleSlice etat initial', () => {
  test('retourne l etat initial par defaut', () => {
    const state = getBase();
    expect(state.personData.contactType).toBe('morale');
    expect(state.personData.raisonSociale).toBe('');
    expect(state.personData.genreRL).toBe('Masculin');
    expect(state.representantLegal.nomRL).toBe('');
    expect(state.contactDirect.nomCD).toBe('');
  });

  test('initialise les erreurs de formulaire', () => {
    const state = getBase();
    expect(state.formErrors.raisonSociale).toBe(true);
    expect(state.formErrors.siret).toBe(true);
    expect(state.errorsCount).toBe(6); // 6 champs requis tous vides
  });

  test('initialise ErrorsMails', () => {
    const state = getBase();
    expect(state.ErrorsMails.emailEntrepriseError).toBe(true);
    expect(state.ErrorsMails.emailCDError).toBe(true);
    expect(state.ErrorsMails.emailRLError).toBe(true);
    expect(state.ErrorsMails.emailExistsError).toBeNull();
  });
});

// ========================================================================
// ExtraReducers
// ========================================================================

describe('personneMoraleSlice EMAIL_ALREADY_EXISTS_PM', () => {
  test('definit emailExistsError et errorField', () => {
    const state = reducer(getBase(), {
      type: 'EMAIL_ALREADY_EXISTS_PM',
      payload: { message: 'Cet email existe deja', field: 'emailEntreprise' },
    });
    expect(state.ErrorsMails.emailExistsError).toBe('Cet email existe deja');
    expect(state.ErrorsMails.errorField).toBe('emailEntreprise');
  });
});

describe('personneMoraleSlice RESET_FORM_PMP', () => {
  test('retourne initialState et supprime localStorage', () => {
    let state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'raisonSociale', value: 'TestRS' },
    });
    state = reducer(state, { type: 'RESET_FORM_PMP' });
    expect(state.personData.raisonSociale).toBe('');
    expect(state.formErrors.raisonSociale).toBe(true);
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('personneMoraleData');
  });
});

describe('personneMoraleSlice SET_PERSONNE_MORALE_FIELD', () => {
  test('met a jour un champ personData (raisonSociale)', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'raisonSociale', value: 'Ma Societe' },
    });
    expect(state.personData.raisonSociale).toBe('Ma Societe');
    expect(state.formErrors.raisonSociale).toBe(false);
  });

  test('met a jour un champ suffixe CD dans contactDirect', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'nomCD', value: 'Durand' },
    });
    expect(state.contactDirect.nomCD).toBe('Durand');
  });

  test('met a jour un champ suffixe RL dans representantLegal', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'nomRL', value: 'Martin' },
    });
    expect(state.representantLegal.nomRL).toBe('Martin');
  });

  test('recalcule nom_CompletCD apres update nomCD', () => {
    let state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'prenomCD', value: 'Jean' },
    });
    state = reducer(state, {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'nomCD', value: 'Dupont' },
    });
    expect(state.contactDirect.nom_CompletCD).toBe('Jean Dupont');
  });

  test('recalcule nom_CompletRL apres update prenomRL', () => {
    let state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'nomRL', value: 'Martin' },
    });
    state = reducer(state, {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'prenomRL', value: 'Sophie' },
    });
    expect(state.representantLegal.nom_CompletRL).toBe('Sophie Martin');
  });

  test('valide emailEntreprise et reset emailExistsError', () => {
    // D'abord definir une erreur
    let state = reducer(getBase(), {
      type: 'EMAIL_ALREADY_EXISTS_PM',
      payload: { message: 'existe', field: 'emailEntreprise' },
    });
    state = reducer(state, {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'emailEntreprise', value: 'test@test.com' },
    });
    expect(state.ErrorsMails.emailEntrepriseError).toBe(false);
    expect(state.ErrorsMails.emailExistsError).toBeNull();
  });

  test('valide emailCD', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'emailCD', value: 'cd@test.com' },
    });
    expect(state.ErrorsMails.emailCDError).toBe(false);
  });

  test('valide emailRL', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'emailRL', value: 'rl@test.com' },
    });
    expect(state.ErrorsMails.emailRLError).toBe(false);
  });

  test('email invalide met emailError a true', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'emailEntreprise', value: 'invalid' },
    });
    expect(state.ErrorsMails.emailEntrepriseError).toBe(true);
  });

  test('recalcule errorsCount apres modification champ requis', () => {
    let state = getBase();
    expect(state.errorsCount).toBe(6);
    state = reducer(state, {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'raisonSociale', value: 'Test' },
    });
    expect(state.errorsCount).toBe(5);
  });
});

describe('personneMoraleSlice SET_PERSONNE_MORALE_FOR_MODIFICATION', () => {
  const modPayload = {
    contactData: {
      raisonSociale: 'SocieteX',
      siret: '123456',
      formeJuridique: 'SARL',
      adresseSiegeSocial: '1 rue Test',
      codePostalPM: '75000',
      villePM: 'Paris',
    },
    representantLegalData: {
      representantLegalNom: 'Dupont',
      representantLegalPrenom: 'Jean',
      representantLegalEmail: 'rl@x.com',
      representantLegalTelephone: '06',
      representantLegalGenre: 'Masculin',
    },
    contactDirectData: {
      contactDirectNom: 'Durand',
      contactDirectPrenom: 'Marie',
      contactDirectEmail: 'cd@x.com',
      contactDirectTelephone: '07',
      contactDirectGenre: 'Feminin',
    },
  };

  test('hydrate personData, representantLegal et contactDirect', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION',
      payload: modPayload,
    });
    expect(state.personData.raisonSociale).toBe('SocieteX');
    expect(state.representantLegal.nomRL).toBe('Dupont');
    expect(state.representantLegal.prenomRL).toBe('Jean');
    expect(state.contactDirect.nomCD).toBe('Durand');
    expect(state.contactDirect.prenomCD).toBe('Marie');
  });

  test('recalcule nom_CompletRL et nom_CompletCD', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION',
      payload: modPayload,
    });
    expect(state.representantLegal.nom_CompletRL).toBe('Jean Dupont');
    expect(state.contactDirect.nom_CompletCD).toBe('Marie Durand');
  });

  test('definit appellationCourrierRL pour Masculin', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION',
      payload: modPayload,
    });
    expect(state.representantLegal.appellationCourrierRL).toBe('Cher monsieur');
  });

  test('definit appellationCourrierCD pour Feminin', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION',
      payload: modPayload,
    });
    expect(state.contactDirect.appellationCourrierCD).toBe('Ch\u00e8re madame');
  });

  test('recalcule formErrors (tous les champs remplis => 0 erreurs)', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION',
      payload: modPayload,
    });
    expect(state.errorsCount).toBe(0);
  });

  test('reset ErrorsMails a false', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION',
      payload: modPayload,
    });
    expect(state.ErrorsMails.emailEntrepriseError).toBe(false);
    expect(state.ErrorsMails.emailCDError).toBe(false);
    expect(state.ErrorsMails.emailRLError).toBe(false);
    expect(state.ErrorsMails.emailExistsError).toBeNull();
  });

  test('gere les donnees RL et CD nulles', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION',
      payload: { contactData: {}, representantLegalData: null, contactDirectData: null },
    });
    expect(state.representantLegal.nomRL).toBe('');
    expect(state.representantLegal.genreRL).toBe('Masculin');
    expect(state.contactDirect.nomCD).toBe('');
    expect(state.contactDirect.genreCD).toBe('Masculin');
  });
});

describe('personneMoraleSlice VALIDATE_FORME_JURIDIQUE', () => {
  test('met a jour formeJuridique error et recalcule errorsCount', () => {
    let state = getBase();
    state = reducer(state, { type: 'VALIDATE_FORME_JURIDIQUE', payload: false });
    // formeJuridique error passe a false => errorsCount diminue de 1
    expect(state.formErrors.formeJuridique).toBe(false);
    expect(state.errorsCount).toBe(5); // 6 - 1
  });
});

describe('personneMoraleSlice RESET_CONTACT_PM', () => {
  test('retourne initialState et supprime localStorage', () => {
    let state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'raisonSociale', value: 'XX' },
    });
    state = reducer(state, { type: 'RESET_CONTACT_PM' });
    expect(state.personData.raisonSociale).toBe('');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('personneMoraleData');
  });
});

// ========================================================================
// Action creators
// ========================================================================

describe('personneMoraleSlice action creators', () => {
  test('setPersonneMoraleField retourne le bon type', () => {
    const action = setPersonneMoraleField('raisonSociale', 'Test');
    expect(action.type).toBe('SET_PERSONNE_MORALE_FIELD');
    expect(action.payload).toEqual({ field: 'raisonSociale', value: 'Test' });
  });

  test('setPersonneMoraleForModification retourne le bon type', () => {
    const action = setPersonneMoraleForModification({ contactData: {} });
    expect(action.type).toBe('SET_PERSONNE_MORALE_FOR_MODIFICATION');
  });

  test('resetPersonneMorale retourne RESET_FORM_PMP', () => {
    expect(resetPersonneMorale().type).toBe('RESET_FORM_PMP');
  });

  test('validateFormeJuridique retourne le bon type', () => {
    const action = validateFormeJuridique(true);
    expect(action.type).toBe('VALIDATE_FORME_JURIDIQUE');
    expect(action.payload).toBe(true);
  });

  test('resetContactPM retourne RESET_CONTACT_PM', () => {
    expect(resetContactPM().type).toBe('RESET_CONTACT_PM');
  });

  test('resetRepresentantLegal retourne RESET_REPRESENTANT_LEGAL', () => {
    expect(resetRepresentantLegal().type).toBe('RESET_REPRESENTANT_LEGAL');
  });

  test('resetContactDirectPM retourne RESET_CONTACT_DIRECT', () => {
    expect(resetContactDirectPM().type).toBe('RESET_CONTACT_DIRECT');
  });

  test('resetServErrorsPM retourne RESET_SERV_ERRORS', () => {
    expect(resetServErrorsPM().type).toBe('RESET_SERV_ERRORS');
  });
});

// ========================================================================
// Thunk createContactPM
// ========================================================================

describe('personneMoraleSlice thunk createContactPM', () => {
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
    contact: { raisonSociale: 'Test' },
    representantLegal: {},
    contactDirect: {},
    user: { _id: 'u1' },
  };

  test('succes simple — dispatch SUCCESS puis resets', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c1', raisonSociale: 'Test' } });
    await createContactPM(baseContactData, 'tok')(dispatch, getState);

    const types = dispatch.mock.calls.map(c => {
      const arg = c[0];
      return typeof arg === 'function' ? 'thunk' : arg.type;
    });
    expect(types).toContain('CREATE_CONTACT_PM_SUCCESS');
    expect(types).toContain('RESET_CONTACT_PM');
    expect(types).toContain('RESET_REPRESENTANT_LEGAL');
    expect(types).toContain('RESET_CONTACT_DIRECT');
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
    await createContactPM(data, 'tok')(dispatch, getState);
    expect(setPartieCreate).toHaveBeenCalledWith('Pour', { _id: 'c2' });
  });

  test('isLinkedToSinglePartie dispatch setPartieLink', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c3' } });
    const data = {
      ...baseContactData,
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartiesForLink: { isLinkedToSinglePartie: true, linkedPartieId: 'p1' },
      },
    };
    await createContactPM(data, 'tok')(dispatch, getState);
    expect(setPartieLinkCreate).toHaveBeenCalledWith('p1', { _id: 'c3' });
  });

  test('isLinkedToPartiesGroup Pour dispatch setPartiesLinkAllPour', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c4' } });
    const data = {
      ...baseContactData,
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartiesForLink: { isLinkedToPartiesGroup: true, linkedGroupType: 'Pour' },
      },
    };
    await createContactPM(data, 'tok')(dispatch, getState);
    expect(setPartiesLinkAllPourCreate).toHaveBeenCalledWith({ contact: { _id: 'c4' } });
  });

  test('isLinkedToDossier dispatch ADD_SELECTED_CONTACT', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c5' } });
    const data = {
      ...baseContactData,
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartiesForLink: { isLinkedToDossier: true },
      },
    };
    await createContactPM(data, 'tok')(dispatch, getState);
    const types = dispatch.mock.calls.map(c => (typeof c[0] === 'function' ? 'thunk' : c[0].type));
    expect(types).toContain('ADD_SELECTED_CONTACT');
  });

  test('erreur 409 dispatch EMAIL_ALREADY_EXISTS_PM', async () => {
    apiClient.post.mockRejectedValue({
      response: { status: 409, data: { msg: 'Email existe', field: 'emailEntreprise' } },
      message: 'fallback',
    });
    await createContactPM(baseContactData, 'tok')(dispatch, getState).catch(() => {});
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('EMAIL_ALREADY_EXISTS_PM');
  });

  test('erreur autre dispatch SET_SERV_ERRORS', async () => {
    apiClient.post.mockRejectedValue({ message: 'Erreur serveur' });
    await createContactPM(baseContactData, 'tok')(dispatch, getState).catch(() => {});
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('SET_SERV_ERRORS');
  });
});

// ========================================================================
// Thunk updateContactPM
// ========================================================================

describe('personneMoraleSlice thunk updateContactPM', () => {
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
    contact: { raisonSociale: 'UpdateTest' },
    representantLegal: {},
    contactDirect: {},
    user: { _id: 'u1' },
  };

  test('succes isLinkedToPartiesGroup create dispatch UPDATE_CONTACT_PM_SUCCESS', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1' } });
    const options = {
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartiesForLink: { isLinkedToPartiesGroup: true },
      },
    };
    await updateContactPM('c1', contactData, 'tok', options)(dispatch, getState);
    const types = dispatch.mock.calls.map(c => (typeof c[0] === 'function' ? 'thunk' : c[0].type));
    expect(types).toContain('UPDATE_CONTACT_PM_SUCCESS');
    expect(types).toContain('RESET_CONTACT_PM');
  });

  test('succes isLinkedToPartiesGroup edit dispatch EDIT prefix + fetchCurrentDossier', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1' } });
    const options = {
      fromCreatePartie: {
        mode: 'edit',
        fromCreatePartiesForLink: { isLinkedToPartiesGroup: true },
      },
    };
    await updateContactPM('c1', contactData, 'tok', options)(dispatch, getState);
    const types = dispatch.mock.calls
      .map(c => c[0])
      .filter(a => a != null && typeof a !== 'function')
      .map(a => a.type);
    expect(types).toContain('EDIT_UPDATE_CONTACT_PM_SUCCESS');
    expect(fetchCurrentDossier).toHaveBeenCalledWith('doss1', 'tok');
  });

  test('succes partieItself dispatch UPDATE_PARTIE', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1', raisonSociale: 'XX', villePM: 'Lyon' } });
    const options = {
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartieForPartie: { typePartie: 'Pour' },
      },
      modificationType: 'partieItself',
    };
    await updateContactPM('c1', contactData, 'tok', options)(dispatch, getState);
    const types = dispatch.mock.calls.map(c => (typeof c[0] === 'function' ? 'thunk' : c[0].type));
    expect(types).toContain('UPDATE_PARTIE');
  });

  test('succes partieItself sans typePartie lookup dans getState', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'id1', raisonSociale: 'YY' } });
    const options = { modificationType: 'partieItself' };
    await updateContactPM('id1', contactData, 'tok', options)(dispatch, getState);
    const updateAction = dispatch.mock.calls.find(c =>
      typeof c[0] !== 'function' && c[0].type === 'UPDATE_PARTIE'
    );
    expect(updateAction).toBeDefined();
    expect(updateAction[0].payload.updatedData.typePartie).toBe('Pour');
  });

  test('succes contactLinkedToDossier dispatch UPDATE_SELECTED_CONTACT', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1' } });
    const options = { modificationType: 'contactLinkedToDossier' };
    await updateContactPM('c1', contactData, 'tok', options)(dispatch, getState);
    const types = dispatch.mock.calls.map(c => (typeof c[0] === 'function' ? 'thunk' : c[0].type));
    expect(types).toContain('UPDATE_SELECTED_CONTACT');
  });

  test('erreur dispatch SET_SERV_ERRORS', async () => {
    apiClient.put.mockRejectedValue({ message: 'Erreur reseau' });
    await updateContactPM('c1', contactData, 'tok')(dispatch, getState).catch(() => {});
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('SET_SERV_ERRORS');
  });
});
