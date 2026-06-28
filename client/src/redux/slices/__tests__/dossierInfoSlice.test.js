jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../../services/socketService', () => ({
  initSocket: jest.fn(),
}));

jest.mock('../currentDossierSlice', () => ({
  setCurrentDossier: jest.fn((dossier) => ({ type: 'MOCK/setCurrentDossier', payload: dossier })),
  DELETE_DOSSIER_SUCCESS: 'DELETE_DOSSIER_SUCCESS',
  UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS: 'UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS',
  UPDATE_CURRENT_DOSSIER_SUCCESS: 'UPDATE_CURRENT_DOSSIER_SUCCESS',
}));

import apiClient from '../../../services/apiClient';
import { initSocket } from '../../../services/socketService';
import reducer, {
  setNomDossier,
  setResponsables,
  resetDossier,
  addSelectedContact,
  initializeDossierInfosForEdit,
  createDossierServer,
  fetchLast25Dossiers,
} from '../dossierInfoSlice';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation();
  jest.spyOn(console, 'warn').mockImplementation();
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation();
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation();
});

afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
  console.log.mockRestore();
  Storage.prototype.getItem.mockRestore();
  Storage.prototype.setItem.mockRestore();
  Storage.prototype.removeItem.mockRestore();
});

const defaultInitialState = {
  dossierData: {
    nom_dossier: '',
    type_dossier: '',
    description_dossier: '',
    date_Creation_Dossier: '',
    responsables: [],
    selectedTribunalAffaire: null,
  },
  mainUser: null,
  errors: {},
  searchContactsDossier: { loading: false, contacts: [], error: null },
  selectedContacts: [],
  originalResponsablesInEdit: [],
  addedResponsablesInEdit: [],
  removedOriginalResponsableIdsInEdit: [],
  pendingEmailAction: null,
};

// Helper : creer un etat de base (le wrapper persiste a chaque dispatch)
const getBaseState = () => reducer(undefined, { type: '@@INIT' });

// --- Etat initial ---

describe('dossierInfoSlice etat initial', () => {
  test('retourne defaultInitialState quand localStorage est vide', () => {
    const state = getBaseState();
    expect(state.dossierData.nom_dossier).toBe('');
    expect(state.mainUser).toBeNull();
    expect(state.selectedContacts).toEqual([]);
    expect(state.pendingEmailAction).toBeNull();
  });

  test('les champs de dossierData sont presents', () => {
    const state = getBaseState();
    expect(state.dossierData).toEqual(expect.objectContaining({
      nom_dossier: '',
      type_dossier: '',
      description_dossier: '',
      date_Creation_Dossier: '',
      responsables: [],
      selectedTribunalAffaire: null,
    }));
  });

  test('les tableaux de tracking edition sont vides', () => {
    const state = getBaseState();
    expect(state.originalResponsablesInEdit).toEqual([]);
    expect(state.addedResponsablesInEdit).toEqual([]);
    expect(state.removedOriginalResponsableIdsInEdit).toEqual([]);
  });
});

// --- Action creators ---

describe('dossierInfoSlice action creators', () => {
  test('setNomDossier retourne le bon type et payload', () => {
    expect(setNomDossier('Dossier A')).toEqual({ type: 'SET_NOM_DOSSIER', payload: 'Dossier A' });
  });

  test('setResponsables retourne le bon type et payload', () => {
    expect(setResponsables([{ _id: 'r1' }])).toEqual({ type: 'SET_RESPONSABLES', payload: [{ _id: 'r1' }] });
  });

  test('resetDossier retourne le bon type', () => {
    expect(resetDossier()).toEqual({ type: 'RESET_DOSSIER' });
  });

  test('addSelectedContact retourne le bon type et payload', () => {
    expect(addSelectedContact({ _id: 'c1' })).toEqual({ type: 'ADD_SELECTED_CONTACT', payload: { _id: 'c1' } });
  });

  test('initializeDossierInfosForEdit retourne le bon type et payload', () => {
    const preset = { dossier: { nom: 'Test' } };
    expect(initializeDossierInfosForEdit(preset)).toEqual({ type: 'INITIALIZE_DOSSIER_INFOS_FOR_EDIT', payload: preset });
  });
});

// --- Reducers champs simples ---

describe('dossierInfoSlice reducers champs simples', () => {
  test('SET_NOM_DOSSIER definit nom_dossier', () => {
    const state = reducer(getBaseState(), { type: 'SET_NOM_DOSSIER', payload: 'Mon Dossier' });
    expect(state.dossierData.nom_dossier).toBe('Mon Dossier');
  });

  test('SET_TYPE_DOSSIER definit type_dossier', () => {
    const state = reducer(getBaseState(), { type: 'SET_TYPE_DOSSIER', payload: 'Divorce' });
    expect(state.dossierData.type_dossier).toBe('Divorce');
  });

  test('SET_NOM_DOSSIER_FOR_EDIT definit nom_dossier', () => {
    const state = reducer(getBaseState(), { type: 'SET_NOM_DOSSIER_FOR_EDIT', payload: 'Edit Nom' });
    expect(state.dossierData.nom_dossier).toBe('Edit Nom');
  });

  test('SET_DESCRIPTION_DOSSIER definit description_dossier', () => {
    const state = reducer(getBaseState(), { type: 'SET_DESCRIPTION_DOSSIER', payload: 'Desc' });
    expect(state.dossierData.description_dossier).toBe('Desc');
  });

  test('SET_DATE_CREATION_DOSSIER definit date_Creation_Dossier', () => {
    const state = reducer(getBaseState(), { type: 'SET_DATE_CREATION_DOSSIER', payload: '2024-06-01' });
    expect(state.dossierData.date_Creation_Dossier).toBe('2024-06-01');
  });

  test('SET_ERRORS definit errors', () => {
    const errors = { nom: true, type: false };
    const state = reducer(getBaseState(), { type: 'SET_ERRORS', payload: errors });
    expect(state.errors).toEqual(errors);
  });

  test('SET_SELECTED_TRIBUNAL_AFFAIRE definit selectedTribunalAffaire', () => {
    const tribunal = { _id: 't1', name: 'TGI Paris' };
    const state = reducer(getBaseState(), { type: 'SET_SELECTED_TRIBUNAL_AFFAIRE', payload: tribunal });
    expect(state.dossierData.selectedTribunalAffaire).toEqual(tribunal);
  });
});

// --- Workflow email ---

describe('dossierInfoSlice reducers workflow email', () => {
  test('SET_PENDING_EMAIL_ACTION_FOR_DOSSIER_CREATION definit pendingEmailAction', () => {
    const action = { emailId: 'e1', subject: 'Test' };
    const state = reducer(getBaseState(), { type: 'SET_PENDING_EMAIL_ACTION_FOR_DOSSIER_CREATION', payload: action });
    expect(state.pendingEmailAction).toEqual(action);
  });

  test('CLEAR_PENDING_EMAIL_ACTION remet pendingEmailAction a null', () => {
    let state = reducer(getBaseState(), { type: 'SET_PENDING_EMAIL_ACTION_FOR_DOSSIER_CREATION', payload: { emailId: 'e1' } });
    state = reducer(state, { type: 'CLEAR_PENDING_EMAIL_ACTION' });
    expect(state.pendingEmailAction).toBeNull();
  });
});

// --- mergeMainUserProperties (via reducers) ---

describe('dossierInfoSlice mergeMainUserProperties', () => {
  const mainUser = { _id: 'u1', email: 'a@b.com', address: '1 Rue', city: 'Paris', postalCode: '75001' };

  test('SET_MAIN_USER fusionne les proprietes pour isAvocat=true', () => {
    const base = getBaseState();
    // D abord ajouter un responsable isAvocat
    let state = reducer(base, { type: 'SET_RESPONSABLES', payload: [{ _id: 'r1', isAvocat: true, nom: 'Dupont' }] });
    // Puis definir mainUser
    state = reducer(state, { type: 'SET_MAIN_USER', payload: mainUser });
    expect(state.dossierData.responsables[0].email).toBe('a@b.com');
    expect(state.dossierData.responsables[0].city).toBe('Paris');
  });

  test('SET_MAIN_USER ne modifie pas isAvocat=false', () => {
    const base = getBaseState();
    let state = reducer(base, { type: 'SET_RESPONSABLES', payload: [{ _id: 'r1', isAvocat: false, nom: 'Client' }] });
    state = reducer(state, { type: 'SET_MAIN_USER', payload: mainUser });
    expect(state.dossierData.responsables[0].email).toBeUndefined();
  });

  test('SET_RESPONSABLES fusionne avec mainUser existant', () => {
    const base = getBaseState();
    let state = reducer(base, { type: 'SET_MAIN_USER', payload: mainUser });
    state = reducer(state, { type: 'SET_RESPONSABLES', payload: [{ _id: 'r1', isAvocat: true }] });
    expect(state.dossierData.responsables[0].email).toBe('a@b.com');
  });

  test('SET_RESPONSABLES sans mainUser retourne les responsables tels quels', () => {
    const state = reducer(getBaseState(), { type: 'SET_RESPONSABLES', payload: [{ _id: 'r1', isAvocat: true, nom: 'X' }] });
    expect(state.dossierData.responsables[0].email).toBeUndefined();
    expect(state.dossierData.responsables[0].nom).toBe('X');
  });

  test('SET_MAIN_USER avec responsables vides ne crash pas', () => {
    const state = reducer(getBaseState(), { type: 'SET_MAIN_USER', payload: mainUser });
    expect(state.mainUser).toEqual(mainUser);
    expect(state.dossierData.responsables).toEqual([]);
  });
});

// --- Resets ---

describe('dossierInfoSlice reducers resets', () => {
  test('RESET_DOSSIER conserve mainUser et pendingEmailAction', () => {
    let state = reducer(getBaseState(), { type: 'SET_MAIN_USER', payload: { _id: 'u1' } });
    state = reducer(state, { type: 'SET_PENDING_EMAIL_ACTION_FOR_DOSSIER_CREATION', payload: { emailId: 'e1' } });
    state = reducer(state, { type: 'SET_NOM_DOSSIER', payload: 'Test' });
    state = reducer(state, { type: 'RESET_DOSSIER' });
    expect(state.dossierData.nom_dossier).toBe('');
    expect(state.mainUser).toEqual({ _id: 'u1' });
    expect(state.pendingEmailAction).toEqual({ emailId: 'e1' });
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('dossierInfoState');
  });

  test('RESET_ALL conserve mainUser et pendingEmailAction', () => {
    let state = reducer(getBaseState(), { type: 'SET_MAIN_USER', payload: { _id: 'u1' } });
    state = reducer(state, { type: 'SET_NOM_DOSSIER', payload: 'Test' });
    state = reducer(state, { type: 'RESET_ALL' });
    expect(state.dossierData.nom_dossier).toBe('');
    expect(state.mainUser).toEqual({ _id: 'u1' });
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('dossierInfoState');
  });

  test('RESET_DOSSIER remet selectedContacts a vide', () => {
    let state = reducer(getBaseState(), { type: 'ADD_SELECTED_CONTACT', payload: { _id: 'c1', nom: 'A' } });
    state = reducer(state, { type: 'RESET_DOSSIER' });
    expect(state.selectedContacts).toEqual([]);
  });

  test('RESET_ALL remet les tableaux de tracking edition', () => {
    let state = reducer(getBaseState(), { type: 'INITIALIZE_RESPONSABLES_FOR_EDIT', payload: [{ _id: 'r1', isAvocat: false }] });
    state = reducer(state, { type: 'RESET_ALL' });
    expect(state.originalResponsablesInEdit).toEqual([]);
    expect(state.addedResponsablesInEdit).toEqual([]);
    expect(state.removedOriginalResponsableIdsInEdit).toEqual([]);
  });
});

// --- INITIALIZE_DOSSIER_INFOS_FOR_EDIT ---

describe('dossierInfoSlice INITIALIZE_DOSSIER_INFOS_FOR_EDIT', () => {
  test('extrait les champs depuis dossier.dossier (3 niveaux)', () => {
    const preset = {
      dossier: {
        dossier: {
          nom_dossier: 'Dossier 3N',
          description_dossier: 'Desc 3N',
          date_Creation_Dossier: '2024-01-01',
          responsables: [{ _id: 'r1', isAvocat: false }],
          selectedTribunalAffaire: { _id: 't1' },
          contactsDuDossier: [{ _id: 'c1' }],
        },
      },
    };
    const state = reducer(getBaseState(), { type: 'INITIALIZE_DOSSIER_INFOS_FOR_EDIT', payload: preset });
    expect(state.dossierData.nom_dossier).toBe('Dossier 3N');
    expect(state.dossierData.description_dossier).toBe('Desc 3N');
    expect(state.dossierData.date_Creation_Dossier).toBe('2024-01-01');
    expect(state.dossierData.selectedTribunalAffaire).toEqual({ _id: 't1' });
    expect(state.selectedContacts).toEqual([{ _id: 'c1' }]);
  });

  test('extrait les champs depuis le niveau dossier direct', () => {
    const preset = {
      dossier: {
        nom_dossier: 'Dossier 2N',
        description_dossier: 'Desc 2N',
        contactsDuDossier: [{ _id: 'c2' }],
      },
    };
    const state = reducer(getBaseState(), { type: 'INITIALIZE_DOSSIER_INFOS_FOR_EDIT', payload: preset });
    expect(state.dossierData.nom_dossier).toBe('Dossier 2N');
    expect(state.selectedContacts).toEqual([{ _id: 'c2' }]);
  });

  test('fallback au niveau preset racine', () => {
    const preset = { nom_dossier: 'Dossier Racine', description_dossier: 'Desc Racine' };
    const state = reducer(getBaseState(), { type: 'INITIALIZE_DOSSIER_INFOS_FOR_EDIT', payload: preset });
    expect(state.dossierData.nom_dossier).toBe('Dossier Racine');
  });

  test('initialise les tracking arrays et vide les erreurs', () => {
    const preset = {
      dossier: { dossier: { responsables: [{ _id: 'r1', isAvocat: false }] } },
    };
    const state = reducer(getBaseState(), { type: 'INITIALIZE_DOSSIER_INFOS_FOR_EDIT', payload: preset });
    expect(state.originalResponsablesInEdit).toEqual([{ _id: 'r1', isAvocat: false }]);
    expect(state.addedResponsablesInEdit).toEqual([]);
    expect(state.removedOriginalResponsableIdsInEdit).toEqual([]);
    expect(state.errors).toEqual({});
  });

  test('gere un preset vide sans crash', () => {
    const state = reducer(getBaseState(), { type: 'INITIALIZE_DOSSIER_INFOS_FOR_EDIT', payload: {} });
    expect(state.dossierData.nom_dossier).toBe('');
    expect(state.selectedContacts).toEqual([]);
  });
});

// --- INITIALIZE_RESPONSABLES_FOR_EDIT ---

describe('dossierInfoSlice INITIALIZE_RESPONSABLES_FOR_EDIT', () => {
  test('definit originalResponsablesInEdit et dossierData.responsables', () => {
    const resps = [{ _id: 'r1', isAvocat: false, nom: 'Dupont' }];
    const state = reducer(getBaseState(), { type: 'INITIALIZE_RESPONSABLES_FOR_EDIT', payload: resps });
    expect(state.originalResponsablesInEdit).toEqual(resps);
    expect(state.dossierData.responsables).toEqual(resps);
  });

  test('vide addedResponsablesInEdit et removedOriginalResponsableIdsInEdit', () => {
    const state = reducer(getBaseState(), { type: 'INITIALIZE_RESPONSABLES_FOR_EDIT', payload: [] });
    expect(state.addedResponsablesInEdit).toEqual([]);
    expect(state.removedOriginalResponsableIdsInEdit).toEqual([]);
  });
});

// --- ADD_RESPONSIBLE_TO_EDIT_SESSION ---

describe('dossierInfoSlice ADD_RESPONSIBLE_TO_EDIT_SESSION', () => {
  const setupEditState = () => {
    let state = reducer(getBaseState(), { type: 'INITIALIZE_RESPONSABLES_FOR_EDIT', payload: [{ _id: 'r1', isAvocat: false, nom: 'Original' }] });
    return state;
  };

  test('ajoute un nouveau responsable a addedResponsablesInEdit', () => {
    let state = setupEditState();
    state = reducer(state, { type: 'ADD_RESPONSIBLE_TO_EDIT_SESSION', payload: { _id: 'r2', isAvocat: false, nom: 'Nouveau' } });
    expect(state.addedResponsablesInEdit).toHaveLength(1);
    expect(state.addedResponsablesInEdit[0]._id).toBe('r2');
    expect(state.dossierData.responsables).toHaveLength(2);
  });

  test('restaure un responsable original precedemment supprime', () => {
    let state = setupEditState();
    // Supprimer r1
    state = reducer(state, { type: 'REMOVE_RESPONSIBLE_FROM_EDIT_SESSION', payload: 'r1' });
    expect(state.removedOriginalResponsableIdsInEdit).toContain('r1');
    // Re-ajouter r1
    state = reducer(state, { type: 'ADD_RESPONSIBLE_TO_EDIT_SESSION', payload: { _id: 'r1', isAvocat: false, nom: 'Original' } });
    expect(state.removedOriginalResponsableIdsInEdit).not.toContain('r1');
    expect(state.dossierData.responsables).toHaveLength(1);
  });

  test('ignore un responsable deja present dans original', () => {
    let state = setupEditState();
    state = reducer(state, { type: 'ADD_RESPONSIBLE_TO_EDIT_SESSION', payload: { _id: 'r1', isAvocat: false } });
    expect(state.addedResponsablesInEdit).toHaveLength(0);
    expect(state.dossierData.responsables).toHaveLength(1);
  });

  test('recalcule dossierData.responsables correctement', () => {
    let state = setupEditState();
    state = reducer(state, { type: 'ADD_RESPONSIBLE_TO_EDIT_SESSION', payload: { _id: 'r2', isAvocat: false } });
    state = reducer(state, { type: 'ADD_RESPONSIBLE_TO_EDIT_SESSION', payload: { _id: 'r3', isAvocat: false } });
    // original(r1) + added(r2, r3) = 3
    expect(state.dossierData.responsables).toHaveLength(3);
  });
});

// --- REMOVE_RESPONSIBLE_FROM_EDIT_SESSION ---

describe('dossierInfoSlice REMOVE_RESPONSIBLE_FROM_EDIT_SESSION', () => {
  test('supprime un responsable de addedResponsablesInEdit', () => {
    let state = reducer(getBaseState(), { type: 'INITIALIZE_RESPONSABLES_FOR_EDIT', payload: [{ _id: 'r1', isAvocat: false }] });
    state = reducer(state, { type: 'ADD_RESPONSIBLE_TO_EDIT_SESSION', payload: { _id: 'r2', isAvocat: false } });
    state = reducer(state, { type: 'REMOVE_RESPONSIBLE_FROM_EDIT_SESSION', payload: 'r2' });
    expect(state.addedResponsablesInEdit).toHaveLength(0);
    expect(state.dossierData.responsables).toHaveLength(1);
  });

  test('marque un original dans removedOriginalResponsableIdsInEdit', () => {
    let state = reducer(getBaseState(), { type: 'INITIALIZE_RESPONSABLES_FOR_EDIT', payload: [{ _id: 'r1', isAvocat: false }] });
    state = reducer(state, { type: 'REMOVE_RESPONSIBLE_FROM_EDIT_SESSION', payload: 'r1' });
    expect(state.removedOriginalResponsableIdsInEdit).toContain('r1');
    expect(state.dossierData.responsables).toHaveLength(0);
  });

  test('ne duplique pas dans removedIds', () => {
    let state = reducer(getBaseState(), { type: 'INITIALIZE_RESPONSABLES_FOR_EDIT', payload: [{ _id: 'r1', isAvocat: false }] });
    state = reducer(state, { type: 'REMOVE_RESPONSIBLE_FROM_EDIT_SESSION', payload: 'r1' });
    state = reducer(state, { type: 'REMOVE_RESPONSIBLE_FROM_EDIT_SESSION', payload: 'r1' });
    expect(state.removedOriginalResponsableIdsInEdit.filter(id => id === 'r1')).toHaveLength(1);
  });
});

// --- Recherche de contacts ---

describe('dossierInfoSlice recherche de contacts', () => {
  test('SEARCH_CONTACTS_DOSSIER_REQUEST met loading=true', () => {
    const state = reducer(getBaseState(), { type: 'SEARCH_CONTACTS_DOSSIER_REQUEST' });
    expect(state.searchContactsDossier.loading).toBe(true);
    expect(state.searchContactsDossier.contacts).toEqual([]);
  });

  test('SEARCH_CONTACTS_DOSSIER_SUCCESS definit contacts', () => {
    const contacts = [{ _id: 'c1', nom: 'A' }];
    const state = reducer(getBaseState(), { type: 'SEARCH_CONTACTS_DOSSIER_SUCCESS', payload: contacts });
    expect(state.searchContactsDossier.contacts).toEqual(contacts);
    expect(state.searchContactsDossier.loading).toBe(false);
  });

  test('SEARCH_CONTACTS_DOSSIER_FAIL definit error', () => {
    const state = reducer(getBaseState(), { type: 'SEARCH_CONTACTS_DOSSIER_FAIL', payload: 'Erreur' });
    expect(state.searchContactsDossier.error).toBe('Erreur');
    expect(state.searchContactsDossier.loading).toBe(false);
  });
});

// --- Contacts selectionnes ---

describe('dossierInfoSlice contacts selectionnes', () => {
  test('ADD_SELECTED_CONTACT ajoute un contact', () => {
    const state = reducer(getBaseState(), { type: 'ADD_SELECTED_CONTACT', payload: { _id: 'c1', nom: 'Dupont' } });
    expect(state.selectedContacts).toHaveLength(1);
    expect(state.selectedContacts[0]._id).toBe('c1');
  });

  test('ADD_SELECTED_CONTACT deduplique par _id', () => {
    let state = reducer(getBaseState(), { type: 'ADD_SELECTED_CONTACT', payload: { _id: 'c1', nom: 'A' } });
    state = reducer(state, { type: 'ADD_SELECTED_CONTACT', payload: { _id: 'c1', nom: 'B' } });
    expect(state.selectedContacts).toHaveLength(1);
  });

  test('ADD_SELECTED_CONTACT ignore payload sans _id', () => {
    const state = reducer(getBaseState(), { type: 'ADD_SELECTED_CONTACT', payload: { nom: 'SansId' } });
    expect(state.selectedContacts).toHaveLength(0);
  });

  test('ADD_SELECTED_CONTACT ignore payload null', () => {
    const state = reducer(getBaseState(), { type: 'ADD_SELECTED_CONTACT', payload: null });
    expect(state.selectedContacts).toHaveLength(0);
  });

  test('DELETE_SELECTED_CONTACT supprime par _id', () => {
    let state = reducer(getBaseState(), { type: 'ADD_SELECTED_CONTACT', payload: { _id: 'c1', nom: 'A' } });
    state = reducer(state, { type: 'ADD_SELECTED_CONTACT', payload: { _id: 'c2', nom: 'B' } });
    state = reducer(state, { type: 'DELETE_SELECTED_CONTACT', payload: 'c1' });
    expect(state.selectedContacts).toHaveLength(1);
    expect(state.selectedContacts[0]._id).toBe('c2');
  });

  test('UPDATE_SELECTED_CONTACT remplace le contact par _id', () => {
    let state = reducer(getBaseState(), { type: 'ADD_SELECTED_CONTACT', payload: { _id: 'c1', nom: 'Old' } });
    state = reducer(state, { type: 'UPDATE_SELECTED_CONTACT', payload: { _id: 'c1', nom: 'New' } });
    expect(state.selectedContacts[0].nom).toBe('New');
  });

  test('SET_SELECTED_CONTACTS_FROM_PRESET definit selectedContacts', () => {
    const contacts = [{ _id: 'c1' }, { _id: 'c2' }];
    const state = reducer(getBaseState(), { type: 'SET_SELECTED_CONTACTS_FROM_PRESET', payload: contacts });
    expect(state.selectedContacts).toEqual(contacts);
  });

  test('SET_SELECTED_CONTACTS_FROM_PRESET definit tableau vide si payload non-tableau', () => {
    const state = reducer(getBaseState(), { type: 'SET_SELECTED_CONTACTS_FROM_PRESET', payload: 'invalid' });
    expect(state.selectedContacts).toEqual([]);
  });
});

// --- Cross-slice cleanup ---

describe('dossierInfoSlice cross-slice cleanup', () => {
  test('LOGOUT remet a defaultInitialState et supprime localStorage', () => {
    let state = reducer(getBaseState(), { type: 'SET_NOM_DOSSIER', payload: 'Test' });
    state = reducer(state, { type: 'SET_MAIN_USER', payload: { _id: 'u1' } });
    state = reducer(state, { type: 'LOGOUT' });
    expect(state.dossierData.nom_dossier).toBe('');
    expect(state.mainUser).toBeNull();
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('dossierInfoState');
  });

  test('AUTH_ERROR remet a defaultInitialState et supprime localStorage', () => {
    let state = reducer(getBaseState(), { type: 'SET_NOM_DOSSIER', payload: 'Test' });
    state = reducer(state, { type: 'AUTH_ERROR' });
    expect(state.dossierData.nom_dossier).toBe('');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('dossierInfoState');
  });
});

// --- Wrapper localStorage persistence ---

describe('dossierInfoSlice wrapper localStorage persistence', () => {
  test('persiste l etat apres une action traitee', () => {
    Storage.prototype.setItem.mockClear();
    reducer(getBaseState(), { type: 'SET_NOM_DOSSIER', payload: 'Test' });
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('dossierInfoState', expect.any(String));
  });

  test('persiste l etat apres une action non traitee (re-merge mainUser)', () => {
    // D abord creer un state avec mainUser et responsable isAvocat
    let state = reducer(getBaseState(), { type: 'SET_MAIN_USER', payload: { _id: 'u1', email: 'test@x.com', address: 'Addr', city: 'City', postalCode: '75000' } });
    state = reducer(state, { type: 'SET_RESPONSABLES', payload: [{ _id: 'r1', isAvocat: true }] });
    Storage.prototype.setItem.mockClear();
    // Dispatch une action inconnue
    const newState = reducer(state, { type: 'UNKNOWN_ACTION' });
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('dossierInfoState', expect.any(String));
    // Le wrapper re-merge les proprietes mainUser
    expect(newState.dossierData.responsables[0].email).toBe('test@x.com');
  });

  test('verifie structure JSON persistee', () => {
    const base = getBaseState();
    Storage.prototype.setItem.mockClear();
    reducer(base, { type: 'SET_NOM_DOSSIER', payload: 'PersistTest' });
    // Prendre le dernier appel setItem pour dossierInfoState
    const calls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'dossierInfoState');
    expect(calls.length).toBeGreaterThan(0);
    const parsed = JSON.parse(calls[calls.length - 1][1]);
    expect(parsed.dossierData.nom_dossier).toBe('PersistTest');
  });
});

// --- Thunks ---

describe('dossierInfoSlice thunks', () => {
  describe('fetchLast25Dossiers', () => {
    let dispatch, getState;

    beforeEach(() => {
      dispatch = jest.fn();
      getState = () => ({ login: { token: 'tok123' }, dossierInfos: defaultInitialState });
    });

    test('dispatch REQUEST puis SUCCESS', async () => {
      apiClient.get.mockResolvedValue({ data: [{ _id: 'd1' }] });
      await fetchLast25Dossiers()(dispatch, getState);
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_LAST_25_DOSSIERS_REQUEST' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_LAST_25_DOSSIERS_SUCCESS', payload: [{ _id: 'd1' }] });
    });

    test('rejete si pas de token', async () => {
      getState = () => ({ login: { token: null }, dossierInfos: defaultInitialState });
      await expect(fetchLast25Dossiers()(dispatch, getState)).rejects.toBeDefined();
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'FETCH_LAST_25_DOSSIERS_ERROR' }));
    });

    test('dispatch ERROR en cas d erreur API', async () => {
      apiClient.get.mockRejectedValue(new Error('Network'));
      await expect(fetchLast25Dossiers()(dispatch, getState)).rejects.toBeDefined();
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_LAST_25_DOSSIERS_ERROR', payload: 'Network' });
    });

    test('appelle apiClient.get avec l URL correcte', async () => {
      apiClient.get.mockResolvedValue({ data: [] });
      await fetchLast25Dossiers()(dispatch, getState);
      expect(apiClient.get).toHaveBeenCalledWith('/api/folder/last-25-dossiers');
    });
  });

  describe('createDossierServer', () => {
    let dispatch, getState;

    beforeEach(() => {
      dispatch = jest.fn((action) => {
        if (typeof action === 'function') return action(dispatch, getState);
        return action;
      });
      getState = () => ({
        login: { token: 'tok123' },
        dossierInfos: { ...defaultInitialState },
      });
    });

    test('dispatch CREATE_DOSSIER_SUCCESS en cas de succes', async () => {
      apiClient.post.mockResolvedValue({ data: { dossier: { _id: 'd1', nom: 'Test' } } });
      apiClient.get.mockResolvedValue({ data: [] }); // pour fetchLast25Dossiers
      const navigate = jest.fn();
      await createDossierServer({ user: { _id: 'u1' } }, { navigate })(dispatch, getState);
      expect(dispatch).toHaveBeenCalledWith({ type: 'CREATE_DOSSIER_SUCCESS', payload: { dossier: { _id: 'd1', nom: 'Test' } } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'MOVE_DOSSIER_TO_TOP', payload: { _id: 'd1', nom: 'Test' } });
    });

    test('dispatch RESET_ALL et RESET_PARTIES apres succes', async () => {
      apiClient.post.mockResolvedValue({ data: { dossier: { _id: 'd1' } } });
      apiClient.get.mockResolvedValue({ data: [] });
      const navigate = jest.fn();
      await createDossierServer({ user: { _id: 'u1' } }, { navigate })(dispatch, getState);
      expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_ALL' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_PARTIES' });
    });

    test('gere pendingEmailAction avec socket connecte', async () => {
      const mockEmit = jest.fn();
      initSocket.mockReturnValue({ connected: true, emit: mockEmit });
      getState = () => ({
        login: { token: 'tok123' },
        dossierInfos: { ...defaultInitialState, pendingEmailAction: { emailId: 'e1' } },
      });
      apiClient.post.mockResolvedValue({ data: { dossier: { _id: 'd1' } } });
      apiClient.get.mockResolvedValue({ data: [] });
      await createDossierServer({ user: { _id: 'u1' } }, {})(dispatch, getState);
      expect(mockEmit).toHaveBeenCalledWith('message', expect.stringContaining('send_email_to_dossier'));
      expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_PENDING_EMAIL_ACTION' });
    });

    test('gere pendingEmailAction avec socket non connecte', async () => {
      initSocket.mockReturnValue({ connected: false });
      jest.spyOn(window, 'alert').mockImplementation();
      getState = () => ({
        login: { token: 'tok123' },
        dossierInfos: { ...defaultInitialState, pendingEmailAction: { emailId: 'e1' } },
      });
      apiClient.post.mockResolvedValue({ data: { dossier: { _id: 'd1' } } });
      apiClient.get.mockResolvedValue({ data: [] });
      await createDossierServer({ user: { _id: 'u1' } }, {})(dispatch, getState);
      expect(window.alert).toHaveBeenCalled();
      window.alert.mockRestore();
    });

    test('dispatch CREATE_DOSSIER_ERROR en cas d erreur API', async () => {
      apiClient.post.mockRejectedValue({ response: { data: { msg: 'Erreur serveur' } }, message: 'err' });
      await expect(
        createDossierServer({ user: { _id: 'u1' } }, {})(dispatch, getState),
      ).rejects.toBeDefined();
      expect(dispatch).toHaveBeenCalledWith({ type: 'CREATE_DOSSIER_ERROR', payload: 'Erreur serveur' });
    });

    test('navigate vers /dashboard/dossier si navigate fourni', async () => {
      apiClient.post.mockResolvedValue({ data: { dossier: { _id: 'd1' } } });
      apiClient.get.mockResolvedValue({ data: [] });
      const navigate = jest.fn();
      await createDossierServer({ user: { _id: 'u1' } }, { navigate })(dispatch, getState);
      expect(navigate).toHaveBeenCalledWith('/dashboard/dossier');
    });
  });
});
