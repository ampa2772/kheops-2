// Tests unitaires — createContactSlice.js

jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../currentDossierSlice', () => ({
  fetchCurrentDossier: jest.fn(() => jest.fn()),
  addLinkedContactToParty: jest.fn(() => ({ type: 'MOCK/addLinkedContactToParty' })),
}));
jest.mock('../partieSlice', () => ({
  setPartie: jest.fn(() => jest.fn()),
  setPartieLink: jest.fn(() => ({ type: 'MOCK/setPartieLink' })),
  setPartiesLinkAllPour: jest.fn(() => ({ type: 'MOCK/setPartiesLinkAllPour' })),
  setPartiesLinkAllContre: jest.fn(() => ({ type: 'MOCK/setPartiesLinkAllContre' })),
}));
jest.mock('../partieEditSlice', () => ({
  setPartie: jest.fn(() => jest.fn()),
  setPartieLink: jest.fn(() => ({ type: 'MOCK_EDIT/setPartieLink' })),
  setPartiesLinkAllPour: jest.fn(() => ({ type: 'MOCK_EDIT/setPartiesLinkAllPour' })),
  setPartiesLinkAllContre: jest.fn(() => ({ type: 'MOCK_EDIT/setPartiesLinkAllContre' })),
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
let setContactType;
let checkExistingContact, createContact, updateContact;
let resetContactAndErrors, setMaritalStatus, setHasCheckedContact, setContactField;
let setContactForModification, resetFormContact, resetContact, resetMatchingPP, resetCommunesContact;
let apiClient;
let mockPartieSlice, mockPartieEditSlice, mockCurrentDossierSlice;

beforeEach(() => {
  jest.isolateModules(() => {
    const mod = require('../createContactSlice');
    reducer = mod.default;
    setContactType = mod.setContactType;
    checkExistingContact = mod.checkExistingContact;
    createContact = mod.createContact;
    updateContact = mod.updateContact;
    resetContactAndErrors = mod.resetContactAndErrors;
    setMaritalStatus = mod.setMaritalStatus;
    setHasCheckedContact = mod.setHasCheckedContact;
    setContactField = mod.setContactField;
    setContactForModification = mod.setContactForModification;
    resetFormContact = mod.resetFormContact;
    resetContact = mod.resetContact;
    resetMatchingPP = mod.resetMatchingPP;
    resetCommunesContact = mod.resetCommunesContact;
    apiClient = require('../../../services/apiClient').default;
    mockPartieSlice = require('../partieSlice');
    mockPartieEditSlice = require('../partieEditSlice');
    mockCurrentDossierSlice = require('../currentDossierSlice');
  });
});

const getBase = () => reducer(undefined, { type: '@@INIT' });

// ========================================================================
// Etat initial
// ========================================================================

describe('createContactSlice etat initial', () => {
  test('retourne l etat initial par defaut', () => {
    const state = getBase();
    expect(state.contactDetails).toBeDefined();
    expect(state.contactDetails.contact).toBeDefined();
    expect(state.contactDetails.contact.nom).toBe('');
    expect(state.contactDetails.contact.genre).toBe('Masculin');
    expect(state.isModificationMode).toBe(false);
  });

  test('formErrors contient nbErrors et errorForm', () => {
    const state = getBase();
    expect(state.formErrors).toBeDefined();
    expect(state.formErrors.errorForm).toBeDefined();
    expect(typeof state.formErrors.nbErrors).toBe('number');
    expect(state.formErrors.validEmail).toBeDefined();
  });

  test('typeContactsData contient allTypeContacts et currentTypeContact', () => {
    const state = getBase();
    expect(state.typeContactsData).toBeDefined();
    expect(Array.isArray(state.typeContactsData.allTypeContacts)).toBe(true);
    expect(state.typeContactsData.currentTypeContact).toBeDefined();
  });
});

// ========================================================================
// RTK reducers
// ========================================================================

describe('createContactSlice RTK reducers', () => {
  test('setContactType met a jour currentTypeContact (compat)', () => {
    const ct = { _id: 'ct1', label: 'Avocat' };
    const state = reducer(getBase(), setContactType(ct));
    expect(state.typeContactsData.currentTypeContact).toEqual(ct);
  });
});

// ========================================================================
// ExtraReducers — SET_CONTACT_FIELD
// ========================================================================

describe('createContactSlice SET_CONTACT_FIELD', () => {
  test('met a jour un champ simple', () => {
    const state = reducer(getBase(), { type: 'SET_CONTACT_FIELD', payload: { field: 'nom', value: 'Dupont' } });
    expect(state.contactDetails.contact.nom).toBe('Dupont');
  });

  test('met a jour les erreurs pour un champ string', () => {
    let state = getBase();
    // nom est vide dans l etat initial => errorForm.nom devrait etre true
    state = reducer(state, { type: 'SET_CONTACT_FIELD', payload: { field: 'nom', value: 'Rempli' } });
    expect(state.formErrors.errorForm.nom).toBe(false);
  });

  test('champ vide met errorForm a true', () => {
    let state = reducer(getBase(), { type: 'SET_CONTACT_FIELD', payload: { field: 'nom', value: 'X' } });
    state = reducer(state, { type: 'SET_CONTACT_FIELD', payload: { field: 'nom', value: '' } });
    expect(state.formErrors.errorForm.nom).toBe(true);
  });

  test('email met a jour la valeur et remet emailExistsError a null', () => {
    const state = reducer(getBase(), { type: 'SET_CONTACT_FIELD', payload: { field: 'email', value: 'a@b.com' } });
    expect(state.contactDetails.contact.email).toBe('a@b.com');
    expect(state.formErrors.emailExistsError).toBeNull();
    expect(state.formErrors.validEmail).toBe(true);
  });

  // La validation d'email a ete DESACTIVEE cote reducer : updateNbErrors()
  // (appele en fin de SET_CONTACT_FIELD) force toujours validEmail = true et
  // nbErrors = 0 (cf. FonctionsCreateContact.updateNbErrors). Un email
  // syntaxiquement invalide n'est donc plus signale par le store : la valeur
  // est bien enregistree mais validEmail reste true. Le test verifie ce
  // comportement actuel (plus l'ancienne mise a false).
  test('email invalide : valeur enregistree, validEmail reste true (validation desactivee)', () => {
    const state = reducer(getBase(), { type: 'SET_CONTACT_FIELD', payload: { field: 'email', value: 'notanemail' } });
    expect(state.contactDetails.contact.email).toBe('notanemail');
    expect(state.formErrors.validEmail).toBe(true);
    expect(state.formErrors.nbErrors).toBe(0);
  });

  test('changement genre recalcule maritalStatus et statusMaritauxGenre', () => {
    const state = reducer(getBase(), { type: 'SET_CONTACT_FIELD', payload: { field: 'genre', value: 'Feminin' } });
    expect(state.contactDetails.contact.genre).toBe('Feminin');
    expect(state.contactDetails.statusMaritauxGenre).toBeDefined();
    expect(Array.isArray(state.contactDetails.statusMaritauxGenre)).toBe(true);
  });

  // Test retire : le recalcul de appellationCourrier selon le genre
  // n'est plus fait par le reducer SET_CONTACT_FIELD. C'est maintenant
  // geré cote composant par FormePP/index.js via le helper
  // computeAppellationCourrier (qui ne recalcule que si le champ est vide).

  test('saisie utilisateur dans appellationCourrier marque le flag custom', () => {
    const state = reducer(getBase(), {
      type: 'SET_CONTACT_FIELD',
      payload: { field: 'appellationCourrier', value: 'Mon cher confrère' },
    });
    expect(state.contactDetails.contact.appellationCourrier).toBe('Mon cher confrère');
    expect(state.contactDetails.contact.appellationCourrierIsCustom).toBe(true);
  });

  test('SET_APPELLATION_AUTO ne marque PAS le flag custom', () => {
    const state = reducer(getBase(), {
      type: 'SET_APPELLATION_AUTO',
      payload: 'Cher Monsieur',
    });
    expect(state.contactDetails.contact.appellationCourrier).toBe('Cher Monsieur');
    expect(state.contactDetails.contact.appellationCourrierIsCustom).toBe(false);
  });

  test('SET_APPELLATION_AUTO efface le flag custom precedent', () => {
    let state = reducer(getBase(), {
      type: 'SET_CONTACT_FIELD',
      payload: { field: 'appellationCourrier', value: 'Maitre' },
    });
    expect(state.contactDetails.contact.appellationCourrierIsCustom).toBe(true);
    state = reducer(state, { type: 'SET_APPELLATION_AUTO', payload: 'Cher Monsieur' });
    expect(state.contactDetails.contact.appellationCourrierIsCustom).toBe(false);
  });
});

// ========================================================================
// ExtraReducers — EMAIL_ALREADY_EXISTS_PP
// ========================================================================

describe('createContactSlice EMAIL_ALREADY_EXISTS_PP', () => {
  // Le handler EMAIL_ALREADY_EXISTS_PP est desormais un no-op volontaire
  // ("Desactive : pas de blocage pour email duplique", cf.
  // createContactSlice.js). L'action ne doit donc plus positionner d'erreur :
  // emailExistsError reste absent (undefined) et errorForm.email inchange
  // (false a l'initialisation). Le test verifie ce comportement de non-blocage.
  test('ne bloque plus sur email duplique (handler no-op)', () => {
    const before = getBase();
    const state = reducer(before, { type: 'EMAIL_ALREADY_EXISTS_PP', payload: { message: 'Existe deja' } });
    expect(state.formErrors.emailExistsError).toBeUndefined();
    expect(state.formErrors.errorForm.email).toBe(false);
  });
});

// ========================================================================
// ExtraReducers — RESET_FORM_CONTACT
// ========================================================================

describe('createContactSlice RESET_FORM_CONTACT', () => {
  test('remet l etat a neuf et isModificationMode a false', () => {
    let state = reducer(getBase(), { type: 'SET_CONTACT_FIELD', payload: { field: 'nom', value: 'Modifie' } });
    state = reducer(state, { type: 'RESET_FORM_CONTACT' });
    expect(state.contactDetails.contact.nom).toBe('');
    expect(state.isModificationMode).toBe(false);
  });
});

// ========================================================================
// ExtraReducers — SET_CONTACT_FOR_MODIFICATION
// ========================================================================

describe('createContactSlice SET_CONTACT_FOR_MODIFICATION', () => {
  test('hydrate le contact et passe en mode modification', () => {
    const contactData = { nom: 'Martin', prenoms: 'Sophie', email: 's@m.com', dateNaissance: '1990-06-15T00:00:00.000Z', pro_contact: false };
    const state = reducer(getBase(), { type: 'SET_CONTACT_FOR_MODIFICATION', payload: contactData });
    expect(state.contactDetails.contact.nom).toBe('Martin');
    expect(state.contactDetails.contact.prenoms).toBe('Sophie');
    expect(state.isModificationMode).toBe(true);
    expect(state.formErrors.validEmail).toBe(true);
    expect(state.formErrors.errorForm.email).toBe(false);
  });

  test('formate dateNaissance en YYYY-MM-DD', () => {
    const contactData = { nom: 'A', dateNaissance: '1995-03-20T00:00:00.000Z' };
    const state = reducer(getBase(), { type: 'SET_CONTACT_FOR_MODIFICATION', payload: contactData });
    expect(state.contactDetails.contact.dateNaissance).toBe('1995-03-20');
  });
});

// ========================================================================
// ExtraReducers — typeContacts CRUD
// ========================================================================

// Les tests FETCH_TYPE_CONTACTS_*, DELETE_CONTACT_TYPE_*, SAVE_NEW_CONTACT_TYPE_*,
// MODIFY_CONTACT_TYPE_*, FETCH_DEFAULT_CONTACT_* ont ete retires :
// le CRUD serveur des TypeContact a ete supprime, le selecteur est maintenant
// un switch pro/client + dropdown ferme cote client (ContactTypeSwitch).

// Non-regression : nouveau flux du ContactTypeSwitch
describe('createContactSlice ContactTypeSwitch flow', () => {
  test('passer pro_contact a true via SET_CONTACT_FIELD', () => {
    const state = reducer(getBase(), { type: 'SET_CONTACT_FIELD', payload: { field: 'pro_contact', value: true } });
    expect(state.contactDetails.contact.pro_contact).toBe(true);
  });

  test('ecrire type "Avocat" via SET_CONTACT_FIELD', () => {
    let state = reducer(getBase(), { type: 'SET_CONTACT_FIELD', payload: { field: 'pro_contact', value: true } });
    state = reducer(state, { type: 'SET_CONTACT_FIELD', payload: { field: 'type', value: 'Avocat' } });
    expect(state.contactDetails.contact.type).toBe('Avocat');
  });

  test('changement de type recalcule errorForm', () => {
    let state = reducer(getBase(), { type: 'SET_CONTACT_FIELD', payload: { field: 'type', value: 'Notaire' } });
    expect(state.formErrors.errorForm).toBeDefined();
    // errorForm est recalcule : doit exister avec les cles standard
    expect(state.formErrors.errorForm.hasOwnProperty('nom')).toBe(true);
  });
});

// ========================================================================
// ExtraReducers — reducers simples
// ========================================================================

describe('createContactSlice reducers simples', () => {
  test('SET_MARITAL_STATUS met a jour maritalStatus', () => {
    const state = reducer(getBase(), { type: 'SET_MARITAL_STATUS', payload: { value: 'Mari\u00e9' } });
    expect(state.contactDetails.currentStatusMarital).toBe('Mari\u00e9');
    expect(state.contactDetails.contact.maritalStatus).toBe('Mari\u00e9');
  });

  test('SET_SERV_ERRORS definit servErrors', () => {
    const state = reducer(getBase(), { type: 'SET_SERV_ERRORS', payload: 'Erreur serveur' });
    expect(state.servErrors).toBe('Erreur serveur');
  });

  test('RESET_SERV_ERRORS remet servErrors a null', () => {
    let state = reducer(getBase(), { type: 'SET_SERV_ERRORS', payload: 'Err' });
    state = reducer(state, { type: 'RESET_SERV_ERRORS' });
    expect(state.servErrors).toBeNull();
  });

  test('SET_CORRESPONDING_CONTACT definit correspondingContact', () => {
    const cc = { _id: 'cc1', masculin: 'Test' };
    const state = reducer(getBase(), { type: 'SET_CORRESPONDING_CONTACT', payload: cc });
    expect(state.correspondingContact).toEqual(cc);
  });

  test('RESET_CORRESPONDING_CONTACT remet le contact par defaut', () => {
    let state = reducer(getBase(), { type: 'SET_CORRESPONDING_CONTACT', payload: { _id: 'x' } });
    state = reducer(state, { type: 'RESET_CORRESPONDING_CONTACT' });
    expect(state.correspondingContact._id).toBe('6538e6b04986ba1119b1361b');
  });

  test('SET_HAS_CHECKED_CONTACT definit hasCheckedContact', () => {
    const state = reducer(getBase(), { type: 'SET_HAS_CHECKED_CONTACT', payload: true });
    expect(state.formErrors.hasCheckedContact).toBe(true);
  });
});

// ========================================================================
// Les tests FETCH_DEFAULT_CONTACT_* ont ete retires : le backend ne fournit
// plus de "contact par defaut" (plus de TypeContact geres cote serveur).

// ========================================================================
// ExtraReducers — RESET_CONTACT
// ========================================================================

describe('createContactSlice RESET_CONTACT', () => {
  test('remet le contact a defaut et isModificationMode a false', () => {
    let state = reducer(getBase(), { type: 'SET_CONTACT_FIELD', payload: { field: 'nom', value: 'Test' } });
    state = reducer(state, { type: 'RESET_CONTACT' });
    expect(state.contactDetails.contact.nom).toBe('');
    expect(state.isModificationMode).toBe(false);
  });
});

// ========================================================================
// Action creators
// ========================================================================

describe('createContactSlice action creators', () => {
  test('setMaritalStatus retourne le bon type', () => {
    expect(setMaritalStatus('C\u00e9libataire')).toEqual({ type: 'SET_MARITAL_STATUS', payload: { value: 'C\u00e9libataire' } });
  });

  test('setHasCheckedContact retourne le bon type', () => {
    expect(setHasCheckedContact(true)).toEqual({ type: 'SET_HAS_CHECKED_CONTACT', payload: true });
  });

  test('setContactField retourne le bon type', () => {
    expect(setContactField('nom', 'Dupont')).toEqual({ type: 'SET_CONTACT_FIELD', payload: { field: 'nom', value: 'Dupont' } });
  });

  test('resetFormContact retourne le bon type', () => {
    expect(resetFormContact()).toEqual({ type: 'RESET_FORM_CONTACT' });
  });

  test('resetContact retourne le bon type', () => {
    expect(resetContact()).toEqual({ type: 'RESET_CONTACT' });
  });
});

// ========================================================================
// Persistence wrapper
// ========================================================================

describe('createContactSlice persistence', () => {
  test('persiste vers localStorage sauf RESET_FORM_CONTACT', () => {
    Storage.prototype.setItem.mockClear();
    reducer(getBase(), { type: 'SET_CONTACT_FIELD', payload: { field: 'nom', value: 'X' } });
    const contactCalls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'contactFormData');
    expect(contactCalls.length).toBeGreaterThanOrEqual(1);
  });

  test('RESET_FORM_CONTACT ne persiste pas contactFormData mais supprime localStorage', () => {
    const base = getBase();
    Storage.prototype.setItem.mockClear();
    Storage.prototype.removeItem.mockClear();
    reducer(base, { type: 'RESET_FORM_CONTACT' });
    const contactFormCalls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'contactFormData');
    // RESET_FORM_CONTACT est skip dans le wrapper pour contactFormData
    expect(contactFormCalls.length).toBe(0);
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('contactFormData');
  });

  // Non-regression : en mode modification, le brouillon localStorage ne doit
  // PAS etre mis a jour (pour eviter qu'il contamine une future creation).
  test('ne persiste pas contactFormData quand isModificationMode est true', () => {
    // Charge d'abord un contact pour modification => state.isModificationMode = true
    let state = reducer(getBase(), {
      type: 'SET_CONTACT_FOR_MODIFICATION',
      payload: { nom: 'Dupont', prenoms: 'Jean' },
    });
    expect(state.isModificationMode).toBe(true);

    Storage.prototype.setItem.mockClear();
    // Une action d'edition en mode modification ne doit PAS persister
    reducer(state, { type: 'SET_CONTACT_FIELD', payload: { field: 'nom', value: 'Durand' } });
    const contactFormCalls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'contactFormData');
    expect(contactFormCalls.length).toBe(0);
  });

  test('persiste contactFormData en mode creation (isModificationMode false)', () => {
    const state = getBase();
    expect(state.isModificationMode).toBe(false);

    Storage.prototype.setItem.mockClear();
    reducer(state, { type: 'SET_CONTACT_FIELD', payload: { field: 'nom', value: 'Dupont' } });
    const contactFormCalls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'contactFormData');
    expect(contactFormCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// Les describes suivants ont ete retires :
//   - thunk fetchTypeContacts
//   - thunk modifContactType
//   - thunk deleteContactType
//   - thunk saveNewContactType
// Le CRUD serveur des TypeContact est supprime, ces thunks n'existent plus.

// ========================================================================
// Thunks — checkExistingContact
// ========================================================================

describe('createContactSlice thunk checkExistingContact', () => {
  let dispatch;
  beforeEach(() => { dispatch = jest.fn(); });

  test('succes 200 dispatch RESET_SERV_ERRORS et resolve msg', async () => {
    apiClient.post.mockResolvedValue({ status: 200, data: { msg: 'OK' } });
    const result = await checkExistingContact({ nom: 'Test' }, 'tok')(dispatch);
    expect(result).toBe('OK');
    expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_SERV_ERRORS' });
  });

  test('erreur dispatch SET_SERV_ERRORS et rejette', async () => {
    apiClient.post.mockRejectedValue({ response: { data: { msg: 'Contact existe' } } });
    await expect(checkExistingContact({ nom: 'Test' }, 'tok')(dispatch)).rejects.toBe('Contact existe');
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SERV_ERRORS', payload: 'Contact existe' });
  });
});

// ========================================================================
// Thunks — createContact
// ========================================================================

describe('createContactSlice thunk createContact', () => {
  let dispatch, defaultGetState;
  beforeEach(() => {
    defaultGetState = () => ({
      currentDossier: { dossier: { _id: 'doss1' } },
      partieData: { parties: [] },
      partieEditData: { parties: [] },
    });
    dispatch = jest.fn(a => typeof a === 'function' ? a(dispatch, defaultGetState) : a);
  });

  test('succes simple sans options dispatch CREATE_CONTACT_SUCCESS', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c1', nom: 'Dupont' } });
    const result = await createContact({ nom: 'Dupont' }, 'tok')(dispatch, defaultGetState);
    expect(result).toEqual({ _id: 'c1', nom: 'Dupont' });
    const actionTypes = dispatch.mock.calls.map(c => c[0]).filter(a => a != null && typeof a !== 'function').map(a => a.type);
    expect(actionTypes).toContain('CREATE_CONTACT_SUCCESS');
    expect(actionTypes).toContain('RESET_CONTACT');
    // Non-regression : la creation reussie doit purger le brouillon localStorage
    expect(actionTypes).toContain('RESET_FORM_CONTACT');
  });

  test('erreur 409 dispatch EMAIL_ALREADY_EXISTS_PP', async () => {
    apiClient.post.mockRejectedValue({ response: { status: 409, data: { msg: 'Email deja pris', field: 'email' } } });
    await expect(createContact({}, 'tok')(dispatch, defaultGetState)).rejects.toBe('Email deja pris');
    const actionTypes = dispatch.mock.calls.map(c => c[0]).filter(a => a != null && typeof a !== 'function').map(a => a.type);
    expect(actionTypes).toContain('EMAIL_ALREADY_EXISTS_PP');
  });

  test('erreur autre dispatch CREATE_CONTACT_FAIL', async () => {
    apiClient.post.mockRejectedValue(new Error('Network Error'));
    await expect(createContact({}, 'tok')(dispatch, defaultGetState)).rejects.toBe('Network Error');
    const actionTypes = dispatch.mock.calls.map(c => c[0]).filter(a => a != null && typeof a !== 'function').map(a => a.type);
    expect(actionTypes).toContain('CREATE_CONTACT_FAIL');
  });

  test('isTransformedToPartie appelle setPartie en mode create', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c1' } });
    const options = {
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartieForPartie: { isTransformedToPartie: true, typePartie: 'Pour' },
      },
    };
    await createContact({}, 'tok', options)(dispatch, defaultGetState);
    expect(mockPartieSlice.setPartie).toHaveBeenCalledWith('Pour', { _id: 'c1' });
  });

  test('isLinkedToSinglePartie en mode edit appelle addLinkedContactToParty', async () => {
    apiClient.post.mockResolvedValue({ data: { _id: 'c1' } });
    const getState = () => ({ currentDossier: { dossier: { _id: 'doss1' } } });
    const options = {
      fromCreatePartie: {
        mode: 'edit',
        fromCreatePartiesForLink: { isLinkedToSinglePartie: true, linkedPartieId: 'p1' },
      },
    };
    await createContact({}, 'tok', options)(dispatch, getState);
    expect(mockCurrentDossierSlice.addLinkedContactToParty).toHaveBeenCalledWith('doss1', 'p1', { existingContactId: 'c1' });
  });
});

// ========================================================================
// Thunks — updateContact
// ========================================================================

describe('createContactSlice thunk updateContact', () => {
  let dispatch, defaultGetState;
  beforeEach(() => {
    defaultGetState = () => ({
      currentDossier: { dossier: { _id: 'doss1' } },
      partieData: { parties: [] },
      partieEditData: { parties: [] },
    });
    dispatch = jest.fn(a => typeof a === 'function' ? a(dispatch, defaultGetState) : a);
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });
  afterEach(() => {
    console.log.mockRestore();
    console.error.mockRestore();
  });

  test('succes isLinkedToPartiesGroup dispatch UPDATE_CONTACT_SUCCESS', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1', nom: 'Updated' } });
    const options = {
      fromCreatePartie: {
        mode: 'create',
        fromCreatePartiesForLink: { isLinkedToPartiesGroup: true },
      },
    };
    const result = await updateContact('c1', { nom: 'Updated' }, 'tok', options)(dispatch, defaultGetState);
    expect(result).toEqual({ payload: { _id: 'c1', nom: 'Updated' } });
    const actionTypes = dispatch.mock.calls.map(c => c[0]).filter(a => a != null && typeof a !== 'function').map(a => a.type);
    expect(actionTypes).toContain('UPDATE_CONTACT_SUCCESS');
    expect(actionTypes).toContain('RESET_CONTACT');
  });

  test('succes modificationType partieItself dispatch UPDATE_PARTIE', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1', nom: 'Nom', prenoms: 'Prenom' } });
    const getState = () => ({
      currentDossier: { dossier: { _id: 'doss1' } },
      partieData: { parties: [{ idPartie: 'c1', typePartie: 'Pour' }] },
    });
    const options = {
      modificationType: 'partieItself',
      fromCreatePartie: { mode: 'create', fromCreatePartieForPartie: { typePartie: 'Pour' } },
    };
    const result = await updateContact('c1', {}, 'tok', options)(dispatch, getState);
    expect(result).toBeDefined();
    const actionTypes = dispatch.mock.calls.map(c => c[0]).filter(a => a != null && typeof a !== 'function').map(a => a.type);
    expect(actionTypes).toContain('UPDATE_PARTIE');
  });

  test('succes modificationType contactLinkedToDossier dispatch UPDATE_SELECTED_CONTACT', async () => {
    apiClient.put.mockResolvedValue({ data: { _id: 'c1', nom: 'Contact' } });
    const options = { modificationType: 'contactLinkedToDossier' };
    await updateContact('c1', {}, 'tok', options)(dispatch, defaultGetState);
    const actionTypes = dispatch.mock.calls.map(c => c[0]).filter(a => a != null && typeof a !== 'function').map(a => a.type);
    expect(actionTypes).toContain('UPDATE_SELECTED_CONTACT');
  });

  test('erreur rejette avec le message', async () => {
    apiClient.put.mockRejectedValue({ response: { data: { msg: 'Erreur update' } }, message: 'fallback' });
    await expect(updateContact('c1', {}, 'tok')(dispatch, defaultGetState)).rejects.toBe('Erreur update');
  });
});

// ========================================================================
// Thunks — resetContactAndErrors
// ========================================================================

describe('createContactSlice thunk resetContactAndErrors', () => {
  test('dispatch toutes les actions de reset', () => {
    const dispatch = jest.fn();
    resetContactAndErrors()(dispatch);
    const actionTypes = dispatch.mock.calls.map(c => c[0]).filter(a => a != null && typeof a !== 'function').map(a => a.type);
    expect(actionTypes).toContain('RESET_CONTACT_PM');
    expect(actionTypes).toContain('RESET_SERV_ERRORS');
    expect(actionTypes).toContain('RESET_CONTACT');
    expect(actionTypes).toContain('RESET_PERSONNES_CHARGE');
    expect(actionTypes).toContain('RESET_MARIAGE_DETAILS');
    expect(actionTypes).toContain('RESET_MATCHING');
    expect(actionTypes).toContain('RESET_CORRESPONDING_CONTACT');
    expect(actionTypes).toContain('RESET_FORM_CONTACT');
    expect(actionTypes).toContain('RESET_TOUTE_LISTE');
    expect(actionTypes).toContain('RESET_FORM_PMP');
    expect(actionTypes).toContain('RESET_FORM_PMP_PUBLIC');
  });
});
