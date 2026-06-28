jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

// Mock the import of DELETE_DOSSIER_SUCCESS from currentDossierSlice
jest.mock('../currentDossierSlice', () => ({
  DELETE_DOSSIER_SUCCESS: 'DELETE_DOSSIER_SUCCESS',
  UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS: 'UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS',
  UPDATE_CURRENT_DOSSIER_SUCCESS: 'UPDATE_CURRENT_DOSSIER_SUCCESS',
}));

import apiClient from '../../../services/apiClient';
import reducer, {
  fetchAgendaEvents,
  createAgendaEvent,
  updateAgendaEvent,
  deleteAgendaEvent,
  fetchEventsForDossier,
  searchDossiersForAgenda,
  fetchTop25Tasks,
  openDeleteConfirmModal,
  closeDeleteConfirmModal,
  resetDossierSearchForAgenda,
  DELETE_DOSSIER_SUCCESS,
} from '../agendaSlice';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation();
});

afterEach(() => {
  console.error.mockRestore();
});

const initialState = {
  events: [],
  loading: false,
  error: null,
  showConfirmDeleteModal: false,
  eventToDeleteId: null,
  dossierSearchResults: [],
  dossierSearchLoading: false,
  dossierSearchError: null,
  dossierEvents: [],
  loadingDossierEvents: false,
  errorDossierEvents: null,
  topTasks: [],
  loadingTopTasks: false,
  errorTopTasks: null,
};

const makeEvent = (id, startDate, extra = {}) => ({
  _id: id,
  title: `Event ${id}`,
  startDate,
  ...extra,
});

// --- Reducer Tests ---

describe('agendaSlice reducer', () => {
  test('retourne l état initial', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  // FETCH events
  test('FETCH_AGENDA_EVENTS_REQUEST met loading=true', () => {
    const state = reducer(initialState, { type: 'FETCH_AGENDA_EVENTS_REQUEST' });
    expect(state.loading).toBe(true);
    expect(state.error).toBeNull();
  });

  test('FETCH_AGENDA_EVENTS_SUCCESS trie par startDate et met loading=false', () => {
    const events = [
      makeEvent('e2', '2024-06-01'),
      makeEvent('e1', '2024-01-01'),
    ];
    const state = reducer(initialState, { type: 'FETCH_AGENDA_EVENTS_SUCCESS', payload: events });
    expect(state.loading).toBe(false);
    expect(state.events[0]._id).toBe('e1');
    expect(state.events[1]._id).toBe('e2');
  });

  test('FETCH_AGENDA_EVENTS_FAIL met l erreur', () => {
    const state = reducer(initialState, { type: 'FETCH_AGENDA_EVENTS_FAIL', payload: 'Erreur' });
    expect(state.loading).toBe(false);
    expect(state.error).toBe('Erreur');
  });

  // CREATE event
  test('CREATE_AGENDA_EVENT_REQUEST met loading=true', () => {
    const state = reducer(initialState, { type: 'CREATE_AGENDA_EVENT_REQUEST' });
    expect(state.loading).toBe(true);
  });

  test('CREATE_AGENDA_EVENT_SUCCESS ajoute l événement trié', () => {
    const prev = { ...initialState, events: [makeEvent('e1', '2024-01-01')] };
    const newEvent = makeEvent('e2', '2024-06-01');
    const state = reducer(prev, { type: 'CREATE_AGENDA_EVENT_SUCCESS', payload: newEvent });
    expect(state.events).toHaveLength(2);
    expect(state.events[1]._id).toBe('e2');
    expect(state.loading).toBe(false);
  });

  test('CREATE_AGENDA_EVENT_SUCCESS ajoute aussi à dossierEvents si dossier est présent', () => {
    const newEvent = makeEvent('e1', '2024-01-01', { dossier: 'd1' });
    const state = reducer(initialState, { type: 'CREATE_AGENDA_EVENT_SUCCESS', payload: newEvent });
    expect(state.dossierEvents).toHaveLength(1);
    expect(state.dossierEvents[0]._id).toBe('e1');
  });

  test('CREATE_AGENDA_EVENT_SUCCESS n ajoute PAS à dossierEvents si pas de dossier', () => {
    const newEvent = makeEvent('e1', '2024-01-01');
    const state = reducer(initialState, { type: 'CREATE_AGENDA_EVENT_SUCCESS', payload: newEvent });
    expect(state.dossierEvents).toHaveLength(0);
  });

  test('CREATE_AGENDA_EVENT_FAIL met l erreur', () => {
    const state = reducer(initialState, { type: 'CREATE_AGENDA_EVENT_FAIL', payload: 'err' });
    expect(state.error).toBe('err');
  });

  // DELETE event
  test('DELETE_AGENDA_EVENT_SUCCESS supprime des 3 listes et ferme la modal', () => {
    const prev = {
      ...initialState,
      events: [makeEvent('e1', '2024-01-01'), makeEvent('e2', '2024-02-01')],
      dossierEvents: [makeEvent('e1', '2024-01-01')],
      topTasks: [makeEvent('e1', '2024-01-01')],
      showConfirmDeleteModal: true,
      eventToDeleteId: 'e1',
    };
    const state = reducer(prev, { type: 'DELETE_AGENDA_EVENT_SUCCESS', payload: 'e1' });
    expect(state.events).toHaveLength(1);
    expect(state.events[0]._id).toBe('e2');
    expect(state.dossierEvents).toHaveLength(0);
    expect(state.topTasks).toHaveLength(0);
    expect(state.showConfirmDeleteModal).toBe(false);
    expect(state.eventToDeleteId).toBeNull();
  });

  // UPDATE event
  test('UPDATE_AGENDA_EVENT_SUCCESS remplace l événement dans les 3 listes', () => {
    const prev = {
      ...initialState,
      events: [makeEvent('e1', '2024-01-01')],
      dossierEvents: [makeEvent('e1', '2024-01-01')],
      topTasks: [makeEvent('e1', '2024-01-01')],
    };
    const updated = { ...makeEvent('e1', '2024-03-01'), title: 'Updated' };
    const state = reducer(prev, { type: 'UPDATE_AGENDA_EVENT_SUCCESS', payload: updated });
    expect(state.events[0].title).toBe('Updated');
    expect(state.dossierEvents[0].title).toBe('Updated');
    expect(state.topTasks[0].title).toBe('Updated');
  });

  // Modal
  test('OPEN_DELETE_CONFIRM_MODAL ouvre la modal', () => {
    const state = reducer(initialState, { type: 'OPEN_DELETE_CONFIRM_MODAL', payload: 'e1' });
    expect(state.showConfirmDeleteModal).toBe(true);
    expect(state.eventToDeleteId).toBe('e1');
  });

  test('CLOSE_DELETE_CONFIRM_MODAL ferme la modal', () => {
    const prev = { ...initialState, showConfirmDeleteModal: true, eventToDeleteId: 'e1' };
    const state = reducer(prev, { type: 'CLOSE_DELETE_CONFIRM_MODAL' });
    expect(state.showConfirmDeleteModal).toBe(false);
    expect(state.eventToDeleteId).toBeNull();
  });

  // Dossier search
  test('SEARCH_DOSSIERS_FOR_AGENDA_REQUEST met loading', () => {
    const state = reducer(initialState, { type: 'SEARCH_DOSSIERS_FOR_AGENDA_REQUEST' });
    expect(state.dossierSearchLoading).toBe(true);
  });

  test('SEARCH_DOSSIERS_FOR_AGENDA_SUCCESS définit les résultats', () => {
    const state = reducer(initialState, { type: 'SEARCH_DOSSIERS_FOR_AGENDA_SUCCESS', payload: [{ _id: 'd1' }] });
    expect(state.dossierSearchResults).toEqual([{ _id: 'd1' }]);
    expect(state.dossierSearchLoading).toBe(false);
  });

  test('SEARCH_DOSSIERS_FOR_AGENDA_FAIL met l erreur', () => {
    const state = reducer(initialState, { type: 'SEARCH_DOSSIERS_FOR_AGENDA_FAIL', payload: 'err' });
    expect(state.dossierSearchError).toBe('err');
  });

  test('RESET_DOSSIER_SEARCH_FOR_AGENDA vide tout', () => {
    const prev = { ...initialState, dossierSearchResults: [{ _id: 'd1' }], dossierSearchLoading: true };
    const state = reducer(prev, { type: 'RESET_DOSSIER_SEARCH_FOR_AGENDA' });
    expect(state.dossierSearchResults).toEqual([]);
    expect(state.dossierSearchLoading).toBe(false);
    expect(state.dossierSearchError).toBeNull();
  });

  // Dossier events
  test('FETCH_DOSSIER_EVENTS lifecycle', () => {
    let state = reducer(initialState, { type: 'FETCH_DOSSIER_EVENTS_REQUEST' });
    expect(state.loadingDossierEvents).toBe(true);

    state = reducer(state, { type: 'FETCH_DOSSIER_EVENTS_SUCCESS', payload: [makeEvent('e1', '2024-01-01')] });
    expect(state.loadingDossierEvents).toBe(false);
    expect(state.dossierEvents).toHaveLength(1);

    state = reducer(initialState, { type: 'FETCH_DOSSIER_EVENTS_FAIL', payload: 'err' });
    expect(state.errorDossierEvents).toBe('err');
  });

  // Top tasks
  test('FETCH_TOP_TASKS lifecycle', () => {
    let state = reducer(initialState, { type: 'FETCH_TOP_TASKS_REQUEST' });
    expect(state.loadingTopTasks).toBe(true);

    state = reducer(state, { type: 'FETCH_TOP_TASKS_SUCCESS', payload: [{ _id: 't1' }] });
    expect(state.loadingTopTasks).toBe(false);
    expect(state.topTasks).toHaveLength(1);

    state = reducer(initialState, { type: 'FETCH_TOP_TASKS_FAIL', payload: 'err' });
    expect(state.errorTopTasks).toBe('err');
  });

  // Cross-slice
  test('DELETE_DOSSIER_SUCCESS supprime les events/tasks liés', () => {
    const prev = {
      ...initialState,
      events: [makeEvent('e1', '2024-01-01'), makeEvent('e2', '2024-02-01')],
      dossierEvents: [makeEvent('e1', '2024-01-01')],
      topTasks: [makeEvent('e1', '2024-01-01'), makeEvent('e3', '2024-03-01')],
    };
    const state = reducer(prev, {
      type: 'DELETE_DOSSIER_SUCCESS',
      payload: { dossierId: 'd1', deletedEventIds: ['e1'] },
    });
    expect(state.events).toHaveLength(1);
    expect(state.events[0]._id).toBe('e2');
    expect(state.dossierEvents).toHaveLength(0);
    expect(state.topTasks).toHaveLength(1);
    expect(state.topTasks[0]._id).toBe('e3');
  });

  test('DELETE_DOSSIER_SUCCESS sans deletedEventIds ne change rien', () => {
    const prev = { ...initialState, events: [makeEvent('e1', '2024-01-01')] };
    const state = reducer(prev, {
      type: 'DELETE_DOSSIER_SUCCESS',
      payload: { dossierId: 'd1', deletedEventIds: [] },
    });
    expect(state.events).toHaveLength(1);
  });

  test('LOGOUT réinitialise events, dossierEvents, topTasks', () => {
    const prev = {
      ...initialState,
      events: [makeEvent('e1', '2024-01-01')],
      topTasks: [{ _id: 't1' }],
      loading: true,
      error: 'some err',
    };
    const state = reducer(prev, { type: 'LOGOUT' });
    expect(state.events).toEqual([]);
    expect(state.topTasks).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  test('AUTH_ERROR réinitialise comme LOGOUT', () => {
    const prev = { ...initialState, events: [makeEvent('e1', '2024-01-01')] };
    const state = reducer(prev, { type: 'AUTH_ERROR' });
    expect(state.events).toEqual([]);
  });
});

// --- Thunk Tests ---

describe('agendaSlice thunks', () => {
  let dispatch;

  beforeEach(() => {
    dispatch = jest.fn();
  });

  describe('fetchAgendaEvents', () => {
    test('dispatch REQUEST puis SUCCESS en cas de succès', async () => {
      apiClient.get.mockResolvedValue({ data: [{ _id: 'e1' }] });
      await fetchAgendaEvents()(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_AGENDA_EVENTS_REQUEST' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_AGENDA_EVENTS_SUCCESS', payload: [{ _id: 'e1' }] });
    });

    test('dispatch FAIL avec message de error.response.data.message', async () => {
      apiClient.get.mockRejectedValue({ response: { data: { message: 'Server error' } }, message: 'fallback' });
      await fetchAgendaEvents()(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_AGENDA_EVENTS_FAIL', payload: 'Server error' });
    });

    test('dispatch FAIL avec error.message en fallback', async () => {
      apiClient.get.mockRejectedValue(new Error('Network err'));
      await fetchAgendaEvents()(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_AGENDA_EVENTS_FAIL', payload: 'Network err' });
    });
  });

  describe('createAgendaEvent', () => {
    test('dispatch REQUEST puis SUCCESS et retourne les données', async () => {
      apiClient.post.mockResolvedValue({ data: { _id: 'e1', title: 'New' } });
      const result = await createAgendaEvent({ title: 'New' })(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'CREATE_AGENDA_EVENT_REQUEST' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'CREATE_AGENDA_EVENT_SUCCESS', payload: { _id: 'e1', title: 'New' } });
      expect(result).toEqual({ _id: 'e1', title: 'New' });
    });

    test('dispatch FAIL en cas d erreur', async () => {
      apiClient.post.mockRejectedValue(new Error('err'));
      await expect(createAgendaEvent({ title: 'Bad' })(dispatch)).rejects.toThrow('err');
      expect(dispatch).toHaveBeenCalledWith({ type: 'CREATE_AGENDA_EVENT_FAIL', payload: 'err' });
    });
  });

  describe('updateAgendaEvent', () => {
    test('dispatch REQUEST puis SUCCESS', async () => {
      apiClient.put.mockResolvedValue({ data: { _id: 'e1', title: 'Updated' } });
      await updateAgendaEvent('e1', { title: 'Updated' })(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_AGENDA_EVENT_REQUEST' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_AGENDA_EVENT_SUCCESS', payload: { _id: 'e1', title: 'Updated' } });
    });

    test('dispatch FAIL en cas d erreur', async () => {
      apiClient.put.mockRejectedValue(new Error('err'));
      await expect(updateAgendaEvent('e1', {})(dispatch)).rejects.toThrow('err');
      expect(dispatch).toHaveBeenCalledWith({ type: 'UPDATE_AGENDA_EVENT_FAIL', payload: 'err' });
    });
  });

  describe('deleteAgendaEvent', () => {
    test('dispatch REQUEST, SUCCESS puis CLOSE_DELETE_CONFIRM_MODAL', async () => {
      apiClient.delete.mockResolvedValue({});
      await deleteAgendaEvent('e1')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_AGENDA_EVENT_REQUEST' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_AGENDA_EVENT_SUCCESS', payload: 'e1' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'CLOSE_DELETE_CONFIRM_MODAL' });
    });

    test('dispatch FAIL sans CLOSE_DELETE_CONFIRM_MODAL en cas d erreur', async () => {
      apiClient.delete.mockRejectedValue(new Error('err'));
      await deleteAgendaEvent('e1')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'DELETE_AGENDA_EVENT_FAIL', payload: 'err' });
      expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'CLOSE_DELETE_CONFIRM_MODAL' }));
    });
  });

  describe('fetchEventsForDossier', () => {
    test('dispatch SUCCESS avec tableau vide si dossierId falsy', async () => {
      await fetchEventsForDossier(null)(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_DOSSIER_EVENTS_SUCCESS', payload: [] });
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    test('dispatch REQUEST puis SUCCESS en cas de succès', async () => {
      apiClient.get.mockResolvedValue({ data: [{ _id: 'e1' }] });
      await fetchEventsForDossier('d1')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_DOSSIER_EVENTS_REQUEST' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_DOSSIER_EVENTS_SUCCESS', payload: [{ _id: 'e1' }] });
    });

    test('dispatch FAIL en cas d erreur', async () => {
      apiClient.get.mockRejectedValue(new Error('err'));
      await fetchEventsForDossier('d1')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_DOSSIER_EVENTS_FAIL', payload: 'err' });
    });
  });

  describe('searchDossiersForAgenda', () => {
    test('dispatch RESET quand le terme est vide', async () => {
      await searchDossiersForAgenda('   ')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'RESET_DOSSIER_SEARCH_FOR_AGENDA' });
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    test('dispatch REQUEST puis SUCCESS', async () => {
      apiClient.post.mockResolvedValue({ data: [{ _id: 'd1' }] });
      await searchDossiersForAgenda('Dupont')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_DOSSIERS_FOR_AGENDA_REQUEST' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_DOSSIERS_FOR_AGENDA_SUCCESS', payload: [{ _id: 'd1' }] });
    });

    test('dispatch FAIL en cas d erreur', async () => {
      apiClient.post.mockRejectedValue(new Error('err'));
      await searchDossiersForAgenda('test')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_DOSSIERS_FOR_AGENDA_FAIL', payload: 'err' });
    });
  });

  describe('fetchTop25Tasks', () => {
    test('dispatch REQUEST puis SUCCESS', async () => {
      apiClient.get.mockResolvedValue({ data: [{ _id: 't1' }] });
      await fetchTop25Tasks()(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_TOP_TASKS_REQUEST' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_TOP_TASKS_SUCCESS', payload: [{ _id: 't1' }] });
    });

    test('dispatch FAIL en cas d erreur', async () => {
      apiClient.get.mockRejectedValue(new Error('err'));
      await fetchTop25Tasks()(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'FETCH_TOP_TASKS_FAIL', payload: 'err' });
    });
  });

  // Action creators
  describe('action creators', () => {
    test('openDeleteConfirmModal retourne l action correcte', () => {
      expect(openDeleteConfirmModal('e1')).toEqual({ type: 'OPEN_DELETE_CONFIRM_MODAL', payload: 'e1' });
    });

    test('closeDeleteConfirmModal retourne l action correcte', () => {
      expect(closeDeleteConfirmModal()).toEqual({ type: 'CLOSE_DELETE_CONFIRM_MODAL' });
    });

    test('resetDossierSearchForAgenda retourne l action correcte', () => {
      expect(resetDossierSearchForAgenda()).toEqual({ type: 'RESET_DOSSIER_SEARCH_FOR_AGENDA' });
    });
  });
});
