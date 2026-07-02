// Tests unitaires — personneMoraleSlice.js
//
// NOTE (alignement 2026-07) : le slice a été fortement SIMPLIFIÉ.
// Il n'y a plus de "représentant légal" (RL) ni de "contact direct" (CD)
// séparés : tous les champs vivent désormais dans `personData` (dont des
// champs `interlocuteur*`). De plus, la validation live des champs requis et
// des emails a été DÉSACTIVÉE dans les reducers (formErrors init = false,
// EMAIL_ALREADY_EXISTS_PM est un no-op). Les assertions ci-dessous reflètent
// ce comportement ACTUEL, pas l'ancien.

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

// Helper : mappe les args dispatchés vers leur `type`, en ignorant de façon
// défensive les valeurs non-objet (thunks fonction, et surtout les thunks
// mockés — p.ex. fetchCurrentDossier — qui peuvent retourner undefined dans
// l'environnement de test).
const dispatchedTypes = (dispatch) =>
  dispatch.mock.calls
    .map((c) => c[0])
    .filter((a) => a != null && typeof a !== 'function')
    .map((a) => a.type);

// ========================================================================
// Etat initial
// ========================================================================

describe('personneMoraleSlice etat initial', () => {
  test('retourne l etat initial par defaut', () => {
    const state = getBase();
    expect(state.personData.contactType).toBe('morale');
    expect(state.personData.raisonSociale).toBe('');
    // Modèle simplifié : plus de RL/CD séparés ; interlocuteur principal à ''
    expect(state.personData.interlocuteurNom).toBe('');
    expect(state.personData.interlocuteurPrenom).toBe('');
    expect(state.representantLegal).toBeUndefined();
    expect(state.contactDirect).toBeUndefined();
  });

  test('initialise les erreurs de formulaire (validation désactivée => false)', () => {
    const state = getBase();
    // formErrorsInitialState = tous false (validation live désactivée)
    expect(state.formErrors.raisonSociale).toBe(false);
    expect(state.formErrors.siret).toBe(false);
    expect(state.errorsCount).toBe(0); // aucune erreur comptée
  });

  test('initialise ErrorsMails', () => {
    const state = getBase();
    // Modèle simplifié : seul emailEntrepriseError subsiste (init false)
    expect(state.ErrorsMails.emailEntrepriseError).toBe(false);
    expect(state.ErrorsMails.emailExistsError).toBeNull();
    expect(state.ErrorsMails.errorField).toBeNull();
    expect(state.ErrorsMails.emailCDError).toBeUndefined();
    expect(state.ErrorsMails.emailRLError).toBeUndefined();
  });
});

// ========================================================================
// ExtraReducers
// ========================================================================

describe('personneMoraleSlice EMAIL_ALREADY_EXISTS_PM', () => {
  test('est un no-op : ne bloque plus sur email dupliqué', () => {
    // Le reducer a été désactivé (pas de blocage email dupliqué).
    const state = reducer(getBase(), {
      type: 'EMAIL_ALREADY_EXISTS_PM',
      payload: { message: 'Cet email existe deja', field: 'emailEntreprise' },
    });
    expect(state.ErrorsMails.emailExistsError).toBeNull();
    expect(state.ErrorsMails.errorField).toBeNull();
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
    expect(state.formErrors.raisonSociale).toBe(false);
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('personneMoraleData');
  });
});

describe('personneMoraleSlice SET_PERSONNE_MORALE_FIELD', () => {
  test('met a jour un champ personData (raisonSociale) sans toucher formErrors', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'raisonSociale', value: 'Ma Societe' },
    });
    expect(state.personData.raisonSociale).toBe('Ma Societe');
    // Validation live désactivée : formErrors reste inchangé (false)
    expect(state.formErrors.raisonSociale).toBe(false);
  });

  test('met a jour un champ interlocuteurNom dans personData', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'interlocuteurNom', value: 'Durand' },
    });
    expect(state.personData.interlocuteurNom).toBe('Durand');
  });

  test('met a jour un champ interlocuteurPrenom dans personData', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'interlocuteurPrenom', value: 'Martin' },
    });
    expect(state.personData.interlocuteurPrenom).toBe('Martin');
  });

  test('met a jour un champ quelconque (villePM) dans personData', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'villePM', value: 'Paris' },
    });
    expect(state.personData.villePM).toBe('Paris');
  });

  test('stocke emailEntreprise et laisse emailExistsError a null', () => {
    // Le reducer remet explicitement emailExistsError/errorField à null quand on
    // tape emailEntreprise. (EMAIL_ALREADY_EXISTS_PM étant un no-op, on ne peut
    // pas poser d'erreur au préalable ; on vérifie donc l'invariant final.)
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'emailEntreprise', value: 'test@test.com' },
    });
    expect(state.personData.emailEntreprise).toBe('test@test.com');
    expect(state.ErrorsMails.emailExistsError).toBeNull();
    expect(state.ErrorsMails.errorField).toBeNull();
  });

  test('stocke interlocuteurEmail et laisse emailExistsError a null', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'interlocuteurEmail', value: 'contact@test.com' },
    });
    expect(state.personData.interlocuteurEmail).toBe('contact@test.com');
    expect(state.ErrorsMails.emailExistsError).toBeNull();
    expect(state.ErrorsMails.errorField).toBeNull();
  });

  test('un email invalide n est plus rejeté (validation désactivée)', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'emailEntreprise', value: 'invalid' },
    });
    // Plus de mise à true de emailEntrepriseError : la valeur est juste stockée
    expect(state.personData.emailEntreprise).toBe('invalid');
    expect(state.ErrorsMails.emailEntrepriseError).toBe(false);
  });

  test('errorsCount reste stable apres modification champ (validation désactivée)', () => {
    let state = getBase();
    expect(state.errorsCount).toBe(0);
    state = reducer(state, {
      type: 'SET_PERSONNE_MORALE_FIELD',
      payload: { field: 'raisonSociale', value: 'Test' },
    });
    expect(state.errorsCount).toBe(0);
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
      interlocuteurNom: 'Dupont',
      interlocuteurPrenom: 'Jean',
      interlocuteurEmail: 'rl@x.com',
    },
  };

  test('hydrate personData (Object.assign de contactData)', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION',
      payload: modPayload,
    });
    expect(state.personData.raisonSociale).toBe('SocieteX');
    expect(state.personData.siret).toBe('123456');
    expect(state.personData.interlocuteurNom).toBe('Dupont');
    expect(state.personData.interlocuteurPrenom).toBe('Jean');
  });

  test('recalcule formErrors depuis personData (tous remplis => 0 erreurs)', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION',
      payload: modPayload,
    });
    // Les 6 champs requis sont remplis => aucune erreur
    expect(state.formErrors.raisonSociale).toBe(false);
    expect(state.formErrors.villePM).toBe(false);
    expect(state.errorsCount).toBe(0);
  });

  test('recalcule formErrors : champs requis manquants => erreurs comptées', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION',
      payload: { contactData: {} },
    });
    // contactData vide : les 6 champs requis sont vides => 6 erreurs
    expect(state.formErrors.raisonSociale).toBe(true);
    expect(state.formErrors.siret).toBe(true);
    expect(state.errorsCount).toBe(6);
  });

  test('reset ErrorsMails a false / null', () => {
    const state = reducer(getBase(), {
      type: 'SET_PERSONNE_MORALE_FOR_MODIFICATION',
      payload: modPayload,
    });
    expect(state.ErrorsMails.emailEntrepriseError).toBe(false);
    expect(state.ErrorsMails.emailExistsError).toBeNull();
    expect(state.ErrorsMails.errorField).toBeNull();
  });
});

describe('personneMoraleSlice VALIDATE_FORME_JURIDIQUE', () => {
  test('met formeJuridique error a true et incremente errorsCount', () => {
    let state = getBase();
    expect(state.errorsCount).toBe(0);
    state = reducer(state, { type: 'VALIDATE_FORME_JURIDIQUE', payload: true });
    // formeJuridique error passe a true => errorsCount +1
    expect(state.formErrors.formeJuridique).toBe(true);
    expect(state.errorsCount).toBe(1);
  });

  test('met formeJuridique error a false => errorsCount reste 0', () => {
    let state = getBase();
    state = reducer(state, { type: 'VALIDATE_FORME_JURIDIQUE', payload: false });
    expect(state.formErrors.formeJuridique).toBe(false);
    expect(state.errorsCount).toBe(0);
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

    const types = dispatchedTypes(dispatch);
    expect(types).toContain('CREATE_CONTACT_PM_SUCCESS');
    expect(types).toContain('RESET_CONTACT_PM');
    // Modèle simplifié : plus de RESET_REPRESENTANT_LEGAL / RESET_CONTACT_DIRECT
    // dispatchés par le thunk. À la place : RESET_SERV_ERRORS + resets de recherche.
    expect(types).toContain('RESET_SERV_ERRORS');
    expect(types).toContain('SET_CREATE_PARTIE_MODAL');
    expect(types).toContain('SET_SEARCH_TERM_LINK_PARTIE');
    // Ces resets ne sont plus émis :
    expect(types).not.toContain('RESET_REPRESENTANT_LEGAL');
    expect(types).not.toContain('RESET_CONTACT_DIRECT');
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
    const types = dispatchedTypes(dispatch);
    expect(types).toContain('ADD_SELECTED_CONTACT');
  });

  test('erreur 409 dispatch EMAIL_ALREADY_EXISTS_PM', async () => {
    apiClient.post.mockRejectedValue({
      response: { status: 409, data: { msg: 'Email existe', field: 'emailEntreprise' } },
      message: 'fallback',
    });
    await createContactPM(baseContactData, 'tok')(dispatch, getState).catch(() => {});
    const types = dispatchedTypes(dispatch);
    expect(types).toContain('EMAIL_ALREADY_EXISTS_PM');
  });

  test('erreur autre dispatch SET_SERV_ERRORS', async () => {
    apiClient.post.mockRejectedValue({ message: 'Erreur serveur' });
    await createContactPM(baseContactData, 'tok')(dispatch, getState).catch(() => {});
    const types = dispatchedTypes(dispatch);
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
    const types = dispatchedTypes(dispatch);
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
    const types = dispatchedTypes(dispatch);
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
    const types = dispatchedTypes(dispatch);
    expect(types).toContain('UPDATE_PARTIE');
  });

  test('succes partieItself sans typePartie lookup dans getState', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'id1', raisonSociale: 'YY' } });
    const options = { modificationType: 'partieItself' };
    await updateContactPM('id1', contactData, 'tok', options)(dispatch, getState);
    const updateAction = dispatch.mock.calls.find(c =>
      c[0] != null && typeof c[0] !== 'function' && c[0].type === 'UPDATE_PARTIE'
    );
    expect(updateAction).toBeDefined();
    expect(updateAction[0].payload.updatedData.typePartie).toBe('Pour');
  });

  test('succes contactLinkedToDossier dispatch UPDATE_SELECTED_CONTACT', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1' } });
    const options = { modificationType: 'contactLinkedToDossier' };
    await updateContactPM('c1', contactData, 'tok', options)(dispatch, getState);
    const types = dispatchedTypes(dispatch);
    expect(types).toContain('UPDATE_SELECTED_CONTACT');
  });

  test('erreur dispatch SET_SERV_ERRORS', async () => {
    apiClient.put.mockRejectedValue({ message: 'Erreur reseau' });
    await updateContactPM('c1', contactData, 'tok')(dispatch, getState).catch(() => {});
    const types = dispatchedTypes(dispatch);
    expect(types).toContain('SET_SERV_ERRORS');
  });
});
