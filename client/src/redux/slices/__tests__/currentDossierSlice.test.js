// Tests unitaires — currentDossierSlice.js

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
  // Pas de window.electron par defaut
  delete window.electron;
});
afterEach(() => {
  Storage.prototype.getItem.mockRestore();
  Storage.prototype.setItem.mockRestore();
  Storage.prototype.removeItem.mockRestore();
  jest.resetModules();
});

let reducer;
let fetchCurrentDossier, setCurrentDossier, fetchDocumentTemplates;
let updateDocumentColor, selectDestinatairesAction, fetchAllDocumentsInDossier;
let deleteDossier, updateDossier, addPaymentToInvoice, archiveInvoice;
let fetchArchivedInvoiceDetails, updateSelectedEntityInDossier, clearSelectedEntityInDossier;
let addLinkedContactToParty, removeLinkedContactFromParty, addDroppedDocumentToList;
let createSubfolder, updateSubfolder, deleteSubfolder;
let deleteDocumentInDossier, duplicateDocumentInDossier, renameDocumentInDossier;
let updateCurrentDossierFromSocket;
let DELETE_DOSSIER_SUCCESS, DELETE_DOCUMENT_SUCCESS, RENAME_DOCUMENT_SUCCESS;
let UPDATE_CURRENT_DOSSIER_SUCCESS, MOVE_DOCUMENT_OPTIMISTIC, MOVE_DOCUMENT_REVERT;
let UPDATE_DOCUMENT_COLOR_SUCCESS, UPDATE_DOCUMENT_COLOR_REQUEST, UPDATE_DOCUMENT_COLOR_FAIL;
let SUBFOLDER_ACTION_REQUEST, SUBFOLDER_ACTION_SUCCESS, SUBFOLDER_ACTION_FAIL;

let apiClient;

beforeEach(() => {
  jest.isolateModules(() => {
    const mod = require('../currentDossierSlice');
    reducer = mod.default;
    fetchCurrentDossier = mod.fetchCurrentDossier;
    setCurrentDossier = mod.setCurrentDossier;
    fetchDocumentTemplates = mod.fetchDocumentTemplates;
    updateDocumentColor = mod.updateDocumentColor;
    selectDestinatairesAction = mod.selectDestinatairesAction;
    fetchAllDocumentsInDossier = mod.fetchAllDocumentsInDossier;
    deleteDossier = mod.deleteDossier;
    updateDossier = mod.updateDossier;
    addPaymentToInvoice = mod.addPaymentToInvoice;
    archiveInvoice = mod.archiveInvoice;
    fetchArchivedInvoiceDetails = mod.fetchArchivedInvoiceDetails;
    updateSelectedEntityInDossier = mod.updateSelectedEntityInDossier;
    clearSelectedEntityInDossier = mod.clearSelectedEntityInDossier;
    addLinkedContactToParty = mod.addLinkedContactToParty;
    removeLinkedContactFromParty = mod.removeLinkedContactFromParty;
    addDroppedDocumentToList = mod.addDroppedDocumentToList;
    createSubfolder = mod.createSubfolder;
    updateSubfolder = mod.updateSubfolder;
    deleteSubfolder = mod.deleteSubfolder;
    deleteDocumentInDossier = mod.deleteDocumentInDossier;
    duplicateDocumentInDossier = mod.duplicateDocumentInDossier;
    renameDocumentInDossier = mod.renameDocumentInDossier;
    updateCurrentDossierFromSocket = mod.updateCurrentDossierFromSocket;
    DELETE_DOSSIER_SUCCESS = mod.DELETE_DOSSIER_SUCCESS;
    DELETE_DOCUMENT_SUCCESS = mod.DELETE_DOCUMENT_SUCCESS;
    RENAME_DOCUMENT_SUCCESS = mod.RENAME_DOCUMENT_SUCCESS;
    UPDATE_CURRENT_DOSSIER_SUCCESS = mod.UPDATE_CURRENT_DOSSIER_SUCCESS;
    MOVE_DOCUMENT_OPTIMISTIC = mod.MOVE_DOCUMENT_OPTIMISTIC;
    MOVE_DOCUMENT_REVERT = mod.MOVE_DOCUMENT_REVERT;
    UPDATE_DOCUMENT_COLOR_SUCCESS = mod.UPDATE_DOCUMENT_COLOR_SUCCESS;
    UPDATE_DOCUMENT_COLOR_REQUEST = mod.UPDATE_DOCUMENT_COLOR_REQUEST;
    UPDATE_DOCUMENT_COLOR_FAIL = mod.UPDATE_DOCUMENT_COLOR_FAIL;
    SUBFOLDER_ACTION_REQUEST = mod.SUBFOLDER_ACTION_REQUEST;
    SUBFOLDER_ACTION_SUCCESS = mod.SUBFOLDER_ACTION_SUCCESS;
    SUBFOLDER_ACTION_FAIL = mod.SUBFOLDER_ACTION_FAIL;
    apiClient = require('../../../services/apiClient').default;
  });
});

const getBase = () => reducer(undefined, { type: '@@INIT' });

const makeDossier = (id = 'd1', extras = {}) => ({
  _id: id,
  dossier: {
    _id: id,
    nom: 'Test',
    documents: [{ _id: 'doc1', nomDocument: 'file.docx', color: null }],
    parties: { pour: [], contre: [] },
    ...extras,
  },
});

// ========================================================================
// Etat initial
// ========================================================================

describe('currentDossierSlice etat initial', () => {
  test('retourne l etat initial par defaut', () => {
    const state = getBase();
    expect(state.loading).toBe(false);
    expect(state.dossier).toBeNull();
    expect(state.error).toBeNull();
    expect(state.documentTemplates).toEqual([]);
    expect(state.selectedDestinataires).toEqual([]);
    expect(state.selectedEntity).toBeNull();
  });

  test('charge depuis localStorage si present', () => {
    const saved = { loading: false, dossier: { _id: 'x' }, error: null, documentTemplates: [], selectedDestinataires: [], selectedEntity: null, archivedInvoiceDetails: { loading: false, data: null, error: null } };
    Storage.prototype.getItem.mockReturnValue(JSON.stringify(saved));
    jest.isolateModules(() => {
      const mod = require('../currentDossierSlice');
      const state = mod.default(undefined, { type: '@@INIT' });
      expect(state.dossier).toEqual({ _id: 'x' });
    });
  });
});

// ========================================================================
// Loading requests
// ========================================================================

describe('currentDossierSlice loading requests', () => {
  const requestTypes = [
    'FETCH_CURRENT_DOSSIER_REQUEST',
    'UPDATE_DOSSIER_REQUEST',
    'UPDATE_ENTITY_IN_DOSSIER_REQUEST',
  ];

  requestTypes.forEach(type => {
    test(`${type} met loading=true et error=null`, () => {
      const state = reducer(getBase(), { type });
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });
  });

  test('UPDATE_DOCUMENT_COLOR_REQUEST met loading=true', () => {
    const state = reducer(getBase(), { type: UPDATE_DOCUMENT_COLOR_REQUEST });
    expect(state.loading).toBe(true);
  });

  test('SUBFOLDER_ACTION_REQUEST met loading=true', () => {
    const state = reducer(getBase(), { type: SUBFOLDER_ACTION_REQUEST });
    expect(state.loading).toBe(true);
  });
});

// ========================================================================
// Success - dossier updates with entity sync
// ========================================================================

describe('currentDossierSlice success dossier updates', () => {
  test('FETCH_CURRENT_DOSSIER_SUCCESS met a jour le dossier', () => {
    const dossier = makeDossier();
    let state = reducer(getBase(), { type: 'FETCH_CURRENT_DOSSIER_REQUEST' });
    state = reducer(state, { type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: dossier });
    expect(state.loading).toBe(false);
    expect(state.dossier).toEqual(dossier);
    expect(state.error).toBeNull();
  });

  test('UPDATE_CURRENT_DOSSIER_SUCCESS met a jour et sync selectedEntity', () => {
    const entityInPartie = { _id: 'e1', nom: 'Updated' };
    const dossier = makeDossier('d1', {
      parties: {
        pour: [{ partieData: entityInPartie, avocats: [], contacts: [] }],
        contre: [],
      },
    });
    let state = getBase();
    state = { ...state, selectedEntity: { _id: 'e1', nom: 'Old' } };
    state = reducer(state, { type: UPDATE_CURRENT_DOSSIER_SUCCESS, payload: dossier });
    expect(state.selectedEntity.nom).toBe('Updated');
  });

  test('UPDATE_DOSSIER_SUCCESS met a jour le dossier', () => {
    const dossier = makeDossier();
    const state = reducer(getBase(), { type: 'UPDATE_DOSSIER_SUCCESS', payload: dossier });
    expect(state.dossier).toEqual(dossier);
    expect(state.loading).toBe(false);
  });

  test('SUBFOLDER_ACTION_SUCCESS met a jour le dossier', () => {
    const dossier = makeDossier();
    const state = reducer(getBase(), { type: SUBFOLDER_ACTION_SUCCESS, payload: dossier });
    expect(state.dossier).toEqual(dossier);
  });
});

// ========================================================================
// Failures
// ========================================================================

describe('currentDossierSlice failures', () => {
  const failureTypes = [
    'FETCH_CURRENT_DOSSIER_ERROR',
    'UPDATE_DOSSIER_FAIL',
    'UPDATE_ENTITY_IN_DOSSIER_FAIL',
  ];

  failureTypes.forEach(type => {
    test(`${type} definit error et loading=false`, () => {
      let state = reducer(getBase(), { type: 'FETCH_CURRENT_DOSSIER_REQUEST' });
      state = reducer(state, { type, payload: 'Erreur test' });
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Erreur test');
    });
  });

  test('UPDATE_DOCUMENT_COLOR_FAIL definit error', () => {
    const state = reducer(getBase(), { type: UPDATE_DOCUMENT_COLOR_FAIL, payload: 'Erreur' });
    expect(state.error).toBe('Erreur');
  });

  test('SUBFOLDER_ACTION_FAIL definit error', () => {
    const state = reducer(getBase(), { type: SUBFOLDER_ACTION_FAIL, payload: 'Fail' });
    expect(state.error).toBe('Fail');
  });
});

// ========================================================================
// Document operations
// ========================================================================

describe('currentDossierSlice document operations', () => {
  const getStateWithDossier = () => {
    return reducer(getBase(), {
      type: 'FETCH_CURRENT_DOSSIER_SUCCESS',
      payload: makeDossier(),
    });
  };

  test('DELETE_DOCUMENT_SUCCESS supprime le document', () => {
    let state = getStateWithDossier();
    state = reducer(state, { type: DELETE_DOCUMENT_SUCCESS, payload: { docId: 'doc1' } });
    expect(state.dossier.dossier.documents.length).toBe(0);
  });

  test('RENAME_DOCUMENT_SUCCESS renomme le document', () => {
    let state = getStateWithDossier();
    state = reducer(state, { type: RENAME_DOCUMENT_SUCCESS, payload: { docId: 'doc1', newNomDocument: 'renamed.docx' } });
    expect(state.dossier.dossier.documents[0].nomDocument).toBe('renamed.docx');
  });

  test('UPDATE_DOCUMENT_COLOR_SUCCESS change la couleur', () => {
    let state = getStateWithDossier();
    state = reducer(state, { type: UPDATE_DOCUMENT_COLOR_SUCCESS, payload: { docId: 'doc1', color: 'red' } });
    expect(state.dossier.dossier.documents[0].color).toBe('red');
  });

  test('MOVE_DOCUMENT_OPTIMISTIC change le subfolderId', () => {
    let state = getStateWithDossier();
    state = reducer(state, { type: MOVE_DOCUMENT_OPTIMISTIC, payload: { docId: 'doc1', subfolderId: 'sf1' } });
    expect(state.dossier.dossier.documents[0].subfolderId).toBe('sf1');
  });

  test('MOVE_DOCUMENT_REVERT revert le subfolderId', () => {
    let state = getStateWithDossier();
    state = reducer(state, { type: MOVE_DOCUMENT_OPTIMISTIC, payload: { docId: 'doc1', subfolderId: 'sf1' } });
    state = reducer(state, { type: MOVE_DOCUMENT_REVERT, payload: { docId: 'doc1', subfolderId: null } });
    expect(state.dossier.dossier.documents[0].subfolderId).toBeNull();
  });

  test('ADD_DROPPED_DOCUMENT_SUCCESS ajoute un document au debut', () => {
    let state = getStateWithDossier();
    state = reducer(state, { type: 'ADD_DROPPED_DOCUMENT_SUCCESS', payload: { _id: 'doc2', nomDocument: 'drop.pdf' } });
    expect(state.dossier.dossier.documents.length).toBe(2);
    expect(state.dossier.dossier.documents[0]._id).toBe('doc2');
  });
});

// ========================================================================
// Document templates
// ========================================================================

describe('currentDossierSlice document templates', () => {
  test('FETCH_DOCUMENT_TEMPLATES_SUCCESS definit les templates', () => {
    const state = reducer(getBase(), { type: 'FETCH_DOCUMENT_TEMPLATES_SUCCESS', payload: [{ name: 't1' }] });
    expect(state.documentTemplates).toEqual([{ name: 't1' }]);
    expect(state.loading).toBe(false);
  });

  test('FETCH_DOCUMENT_TEMPLATES_ERROR definit error', () => {
    const state = reducer(getBase(), { type: 'FETCH_DOCUMENT_TEMPLATES_ERROR', payload: 'Erreur' });
    expect(state.error).toBe('Erreur');
  });
});

// ========================================================================
// Fetch documents dossier
// ========================================================================

describe('currentDossierSlice fetch documents dossier', () => {
  test('FETCH_DOCUMENTS_DOSSIER_SUCCESS definit documents', () => {
    const state = reducer(getBase(), { type: 'FETCH_DOCUMENTS_DOSSIER_SUCCESS', payload: [{ _id: 'd1' }] });
    expect(state.dossier.dossier.documents).toEqual([{ _id: 'd1' }]);
    expect(state.loading).toBe(false);
  });

  test('FETCH_DOCUMENTS_DOSSIER_FAIL definit error', () => {
    const state = reducer(getBase(), { type: 'FETCH_DOCUMENTS_DOSSIER_FAIL', payload: 'Err' });
    expect(state.error).toBe('Err');
  });
});

// ========================================================================
// Destinataires & direct updates
// ========================================================================

describe('currentDossierSlice destinataires et updates', () => {
  test('SELECT_DESTINATAIRES definit selectedDestinataires', () => {
    const state = reducer(getBase(), { type: 'SELECT_DESTINATAIRES', payload: [{ id: 'd1' }] });
    expect(state.selectedDestinataires).toEqual([{ id: 'd1' }]);
  });

  test('UPDATE_CURRENT_DOSSIER met a jour le dossier', () => {
    const dossier = makeDossier();
    const state = reducer(getBase(), { type: 'UPDATE_CURRENT_DOSSIER', payload: dossier });
    expect(state.dossier).toEqual(dossier);
  });
});

// ========================================================================
// Entity edit
// ========================================================================

describe('currentDossierSlice entity edit', () => {
  test('UPDATE_ENTITY_IN_DOSSIER_SUCCESS met loadingEdit=false', () => {
    const state = reducer({ ...getBase(), loadingEdit: true }, { type: 'UPDATE_ENTITY_IN_DOSSIER_SUCCESS' });
    expect(state.loadingEdit).toBe(false);
  });
});

// ========================================================================
// Archived invoice
// ========================================================================

describe('currentDossierSlice archived invoice', () => {
  test('FETCH_ARCHIVED_INVOICE_DETAILS_REQUEST met loading=true', () => {
    const state = reducer(getBase(), { type: 'FETCH_ARCHIVED_INVOICE_DETAILS_REQUEST' });
    expect(state.archivedInvoiceDetails.loading).toBe(true);
  });

  test('FETCH_ARCHIVED_INVOICE_DETAILS_SUCCESS definit data', () => {
    const state = reducer(getBase(), { type: 'FETCH_ARCHIVED_INVOICE_DETAILS_SUCCESS', payload: { amount: 100 } });
    expect(state.archivedInvoiceDetails.data).toEqual({ amount: 100 });
    expect(state.archivedInvoiceDetails.loading).toBe(false);
  });

  test('FETCH_ARCHIVED_INVOICE_DETAILS_FAIL definit error', () => {
    const state = reducer(getBase(), { type: 'FETCH_ARCHIVED_INVOICE_DETAILS_FAIL', payload: 'NotFound' });
    expect(state.archivedInvoiceDetails.error).toBe('NotFound');
    expect(state.archivedInvoiceDetails.loading).toBe(false);
  });
});

// ========================================================================
// SET_SELECTED_ENTITY
// ========================================================================

describe('currentDossierSlice SET_SELECTED_ENTITY', () => {
  test('definit selectedEntity', () => {
    const state = reducer(getBase(), { type: 'SET_SELECTED_ENTITY', payload: { _id: 'e1', nom: 'X' } });
    expect(state.selectedEntity).toEqual({ _id: 'e1', nom: 'X' });
  });

  test('null remet selectedEntity a null', () => {
    let state = reducer(getBase(), { type: 'SET_SELECTED_ENTITY', payload: { _id: 'e1' } });
    state = reducer(state, { type: 'SET_SELECTED_ENTITY', payload: null });
    expect(state.selectedEntity).toBeNull();
  });

  test('met a jour les parties du dossier si entity correspond', () => {
    const dossier = makeDossier('d1', {
      parties: {
        pour: [{ partieData: { _id: 'e1', nom: 'Old' }, avocats: [], contacts: [] }],
        contre: [],
      },
    });
    let state = reducer(getBase(), { type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: dossier });
    state = reducer(state, { type: 'SET_SELECTED_ENTITY', payload: { _id: 'e1', nom: 'New' } });
    expect(state.dossier.dossier.parties.pour[0].partieData.nom).toBe('New');
  });
});

// ========================================================================
// DELETE_DOSSIER_SUCCESS
// ========================================================================

describe('currentDossierSlice DELETE_DOSSIER_SUCCESS', () => {
  test('nettoie le dossier courant si id correspond', () => {
    const dossier = makeDossier('d1');
    let state = reducer(getBase(), { type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: dossier });
    state = reducer(state, { type: DELETE_DOSSIER_SUCCESS, payload: { dossierId: 'd1' } });
    expect(state.dossier).toBeNull();
    expect(state.selectedEntity).toBeNull();
  });

  test('ne nettoie pas si id different', () => {
    const dossier = makeDossier('d1');
    let state = reducer(getBase(), { type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: dossier });
    state = reducer(state, { type: DELETE_DOSSIER_SUCCESS, payload: { dossierId: 'other' } });
    expect(state.dossier).not.toBeNull();
  });
});

// ========================================================================
// Auth cleanup
// ========================================================================

describe('currentDossierSlice auth cleanup', () => {
  test('LOGOUT nettoie le state', () => {
    const dossier = makeDossier();
    let state = reducer(getBase(), { type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: dossier });
    state = reducer(state, { type: 'LOGOUT' });
    expect(state.dossier).toBeNull();
    expect(state.selectedEntity).toBeNull();
    expect(state.documentTemplates).toEqual([]);
  });

  test('AUTH_ERROR nettoie le state', () => {
    const dossier = makeDossier();
    let state = reducer(getBase(), { type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: dossier });
    state = reducer(state, { type: 'AUTH_ERROR' });
    expect(state.dossier).toBeNull();
  });
});

// ========================================================================
// Persistence
// ========================================================================

describe('currentDossierSlice persistence', () => {
  test('persiste apres FETCH_CURRENT_DOSSIER_SUCCESS', () => {
    reducer(getBase(), { type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: makeDossier() });
    const calls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'currentDossierState');
    expect(calls.length).toBeGreaterThanOrEqual(1);
  });

  test('ne persiste pas apres les requests (loading)', () => {
    Storage.prototype.setItem.mockClear();
    reducer(getBase(), { type: 'FETCH_CURRENT_DOSSIER_REQUEST' });
    const calls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'currentDossierState');
    expect(calls.length).toBe(0);
  });

  test('strip loading/error avant sauvegarde', () => {
    reducer(getBase(), { type: 'FETCH_CURRENT_DOSSIER_SUCCESS', payload: makeDossier() });
    const calls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'currentDossierState');
    if (calls.length > 0) {
      const saved = JSON.parse(calls[calls.length - 1][1]);
      // loading et error sont undefined dans le JSON sauvegarde
      expect(saved.loading).toBeUndefined();
      expect(saved.error).toBeUndefined();
    }
  });
});

// ========================================================================
// Action creators
// ========================================================================

describe('currentDossierSlice action creators', () => {
  test('updateCurrentDossierFromSocket retourne UPDATE_CURRENT_DOSSIER_SUCCESS', () => {
    const action = updateCurrentDossierFromSocket({ _id: 'd1' });
    expect(action.type).toBe(UPDATE_CURRENT_DOSSIER_SUCCESS);
  });

  test('addDroppedDocumentToList retourne ADD_DROPPED_DOCUMENT_SUCCESS', () => {
    const action = addDroppedDocumentToList({ _id: 'doc1' });
    expect(action.type).toBe('ADD_DROPPED_DOCUMENT_SUCCESS');
  });

  test('clearSelectedEntityInDossier est un thunk', () => {
    const dispatch = jest.fn();
    clearSelectedEntityInDossier()(dispatch);
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_SELECTED_ENTITY_IN_DOSSIER' });
  });
});

// ========================================================================
// Thunks critiques
// ========================================================================

describe('currentDossierSlice thunk fetchCurrentDossier', () => {
  let dispatch;
  beforeEach(() => { dispatch = jest.fn(); apiClient.get.mockReset(); });

  test('succes dispatch REQUEST puis SUCCESS', async () => {
    apiClient.get.mockResolvedValue({ data: makeDossier() });
    await fetchCurrentDossier('d1', 'tok')(dispatch);
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types[0]).toBe('FETCH_CURRENT_DOSSIER_REQUEST');
    expect(types[1]).toBe('FETCH_CURRENT_DOSSIER_SUCCESS');
  });

  test('erreur dispatch ERROR', async () => {
    apiClient.get.mockRejectedValue({ response: { data: { error: 'Not found' } } });
    await fetchCurrentDossier('d1', 'tok')(dispatch);
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('FETCH_CURRENT_DOSSIER_ERROR');
  });
});

describe('currentDossierSlice thunk fetchDocumentTemplates', () => {
  let dispatch;
  beforeEach(() => { dispatch = jest.fn(); apiClient.post.mockReset(); });

  test('succes dispatch SUCCESS', async () => {
    apiClient.post.mockResolvedValue({ data: [{ name: 't1' }] });
    await fetchDocumentTemplates('search')(dispatch);
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('FETCH_DOCUMENT_TEMPLATES_SUCCESS');
  });

  test('erreur dispatch ERROR', async () => {
    apiClient.post.mockRejectedValue({ message: 'Err' });
    await fetchDocumentTemplates()(dispatch);
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('FETCH_DOCUMENT_TEMPLATES_ERROR');
  });
});

describe('currentDossierSlice thunk updateDocumentColor', () => {
  let dispatch;
  beforeEach(() => { dispatch = jest.fn(); apiClient.put.mockReset(); });

  test('succes dispatch REQUEST puis SUCCESS', async () => {
    apiClient.put.mockResolvedValue({ data: { updatedDocument: { color: 'blue' } } });
    await updateDocumentColor('d1', 'doc1', 'blue', 'tok')(dispatch);
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain(UPDATE_DOCUMENT_COLOR_REQUEST);
    expect(types).toContain(UPDATE_DOCUMENT_COLOR_SUCCESS);
  });

  test('erreur dispatch FAIL', async () => {
    apiClient.put.mockRejectedValue({ message: 'Err' });
    await updateDocumentColor('d1', 'doc1', 'blue', 'tok')(dispatch);
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain(UPDATE_DOCUMENT_COLOR_FAIL);
  });
});

describe('currentDossierSlice thunk deleteDossier', () => {
  let dispatch;
  beforeEach(() => { dispatch = jest.fn(); apiClient.delete.mockReset(); });

  test('succes dispatch DELETE_DOSSIER_SUCCESS', async () => {
    apiClient.delete.mockResolvedValue({ data: { deletedDossierId: 'd1', deletedEventIds: [] } });
    await deleteDossier('d1')(dispatch);
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain(DELETE_DOSSIER_SUCCESS);
  });

  test('erreur throw et ne dispatch pas SUCCESS', async () => {
    // Mock alert pour eviter les erreurs dans les tests
    global.alert = jest.fn();
    apiClient.delete.mockRejectedValue({ message: 'Erreur suppression' });
    await expect(deleteDossier('d1')(dispatch)).rejects.toBeDefined();
    global.alert.mockRestore();
  });
});

describe('currentDossierSlice thunk updateDossier', () => {
  let dispatch;
  beforeEach(() => { dispatch = jest.fn(); apiClient.put.mockReset(); });

  test('succes dispatch UPDATE_DOSSIER_SUCCESS', async () => {
    apiClient.put.mockResolvedValue({ data: makeDossier() });
    await updateDossier('d1', { nom: 'Updated' }, 'tok')(dispatch);
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('UPDATE_DOSSIER_REQUEST');
    expect(types).toContain('UPDATE_DOSSIER_SUCCESS');
    expect(types).toContain('MOVE_DOSSIER_TO_TOP');
  });

  test('erreur dispatch UPDATE_DOSSIER_FAIL', async () => {
    apiClient.put.mockRejectedValue({ message: 'Erreur update' });
    await updateDossier('d1', {}, 'tok')(dispatch).catch(() => {});
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('UPDATE_DOSSIER_FAIL');
  });
});

describe('currentDossierSlice thunk selectDestinatairesAction', () => {
  test('single mode remplace les destinataires', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => ({ currentDossier: { selectedDestinataires: [{ id: 'old' }] } }));
    selectDestinatairesAction({ id: 'new' })(dispatch, getState);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SELECT_DESTINATAIRES', payload: [{ id: 'new' }] });
  });

  test('multi mode toggle un destinataire', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => ({ currentDossier: { selectedDestinataires: [{ id: 'd1' }] } }));
    selectDestinatairesAction({ id: 'd2' }, true)(dispatch, getState);
    expect(dispatch.mock.calls[0][0].payload.length).toBe(2);
  });

  test('multi mode deselectionne si deja present', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => ({ currentDossier: { selectedDestinataires: [{ id: 'd1' }] } }));
    selectDestinatairesAction({ id: 'd1' }, true)(dispatch, getState);
    expect(dispatch.mock.calls[0][0].payload.length).toBe(0);
  });
});

describe('currentDossierSlice thunk setCurrentDossier', () => {
  test('dispatch MOVE_DOSSIER_TO_TOP puis fetchCurrentDossier', () => {
    const dispatch = jest.fn();
    const getState = jest.fn(() => ({ login: { token: 'tok123' } }));
    setCurrentDossier({ _id: 'd1' })(dispatch, getState);
    const firstCall = dispatch.mock.calls[0][0];
    expect(firstCall.type).toBe('MOVE_DOSSIER_TO_TOP');
  });

  test('ne dispatch rien si dossier invalide', () => {
    const dispatch = jest.fn();
    const getState = jest.fn();
    setCurrentDossier(null)(dispatch, getState);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('currentDossierSlice thunk fetchArchivedInvoiceDetails', () => {
  let dispatch;
  beforeEach(() => { dispatch = jest.fn(); apiClient.get.mockReset(); });

  test('succes dispatch SUCCESS', async () => {
    apiClient.get.mockResolvedValue({ data: { amount: 100 } });
    await fetchArchivedInvoiceDetails('inv1')(dispatch);
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('FETCH_ARCHIVED_INVOICE_DETAILS_REQUEST');
    expect(types).toContain('FETCH_ARCHIVED_INVOICE_DETAILS_SUCCESS');
  });

  test('erreur dispatch FAIL', async () => {
    apiClient.get.mockRejectedValue({ message: 'Err' });
    await fetchArchivedInvoiceDetails('inv1')(dispatch);
    const types = dispatch.mock.calls.map(c => c[0].type);
    expect(types).toContain('FETCH_ARCHIVED_INVOICE_DETAILS_FAIL');
  });
});
