jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import apiClient from '../../../services/apiClient';

// Must import after mocking apiClient since officeUserSlice imports it
import reducer, {
  createOfficeUser,
  createAdditionalOfficeUser,
  deleteOfficeUser,
  updateOfficeUser,
  loadOfficeUsers,
  selectOfficeUser,
  setUserToDelete,
  setEditMode,
  resetEditMode,
  resetInitialData,
} from '../officeUserSlice';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation();
  jest.spyOn(console, 'log').mockImplementation();
});

afterEach(() => {
  console.error.mockRestore();
  console.log.mockRestore();
});

const baseState = {
  officeUser: null,
  officeUsers: [],
  isLoading: false,
  error: null,
  userToDelete: null,
  editMode: false,
  isSetupRequired: false,
};

const mockUser1 = { _id: 'u1', nom: 'Dupont', mainOfficeUser: true };
const mockUser2 = { _id: 'u2', nom: 'Martin', mainOfficeUser: false };

// --- RTK Reducer Actions ---

describe('officeUserSlice RTK reducers', () => {
  test('selectOfficeUser trouve l utilisateur par id', () => {
    const prev = { ...baseState, officeUsers: [mockUser1, mockUser2] };
    const state = reducer(prev, selectOfficeUser('u2'));
    expect(state.officeUser).toEqual(mockUser2);
  });

  test('selectOfficeUser retourne null si non trouvé', () => {
    const prev = { ...baseState, officeUsers: [mockUser1] };
    const state = reducer(prev, selectOfficeUser('xxx'));
    expect(state.officeUser).toBeNull();
  });

  test('setUserToDelete stocke le payload', () => {
    const state = reducer(baseState, setUserToDelete('u1'));
    expect(state.userToDelete).toBe('u1');
  });

  test('setEditMode définit editMode', () => {
    const state = reducer(baseState, setEditMode(true));
    expect(state.editMode).toBe(true);
  });

  test('resetEditMode remet editMode à false', () => {
    const prev = { ...baseState, editMode: true };
    const state = reducer(prev, resetEditMode());
    expect(state.editMode).toBe(false);
  });

  test('resetInitialData définit initialData à objet vide', () => {
    const state = reducer(baseState, resetInitialData());
    expect(state.initialData).toEqual({});
  });
});

// --- String-Type ExtraReducers ---

describe('officeUserSlice string-type extraReducers', () => {
  test('CREATE_OFFICE_USER_SUCCESS définit officeUser', () => {
    const state = reducer(baseState, { type: 'CREATE_OFFICE_USER_SUCCESS', payload: mockUser1 });
    expect(state.officeUser).toEqual(mockUser1);
    expect(state.isSetupRequired).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  test('LOAD_OFFICE_USERS_SUCCESS définit officeUsers', () => {
    const state = reducer(baseState, { type: 'LOAD_OFFICE_USERS_SUCCESS', payload: [mockUser1, mockUser2] });
    expect(state.officeUsers).toEqual([mockUser1, mockUser2]);
    expect(state.isLoading).toBe(false);
  });

  test('LOAD_OFFICE_USERS_FAILURE définit l erreur', () => {
    const state = reducer(baseState, { type: 'LOAD_OFFICE_USERS_FAILURE', payload: { message: 'err' } });
    expect(state.error).toEqual({ message: 'err' });
    expect(state.isLoading).toBe(false);
  });

  test('INITIAL_OFFICE_USER_SETUP_REQUIRED vide les users et active isSetupRequired', () => {
    const prev = { ...baseState, officeUsers: [mockUser1], officeUser: mockUser1 };
    const state = reducer(prev, { type: 'INITIAL_OFFICE_USER_SETUP_REQUIRED' });
    expect(state.officeUsers).toEqual([]);
    expect(state.officeUser).toBeNull();
    expect(state.isSetupRequired).toBe(true);
  });
});

// --- createAsyncThunk Lifecycle ---

describe('officeUserSlice createAsyncThunk lifecycle', () => {
  // createOfficeUser
  test('createOfficeUser.pending met isLoading=true', () => {
    const state = reducer(baseState, createOfficeUser.pending('reqId'));
    expect(state.isLoading).toBe(true);
  });

  test('createOfficeUser.fulfilled définit officeUser', () => {
    const state = reducer(baseState, createOfficeUser.fulfilled(mockUser1, 'reqId'));
    expect(state.officeUser).toEqual(mockUser1);
    expect(state.isSetupRequired).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  test('createOfficeUser.rejected définit l erreur', () => {
    const state = reducer(baseState, createOfficeUser.rejected(null, 'reqId', undefined, { message: 'err' }));
    expect(state.error).toEqual({ message: 'err' });
    expect(state.isLoading).toBe(false);
  });

  // createAdditionalOfficeUser
  test('createAdditionalOfficeUser.fulfilled ajoute à la liste', () => {
    const prev = { ...baseState, officeUsers: [mockUser1] };
    const state = reducer(prev, createAdditionalOfficeUser.fulfilled(mockUser2, 'reqId'));
    expect(state.officeUsers).toHaveLength(2);
    expect(state.officeUser).toEqual(mockUser2);
  });

  test('createAdditionalOfficeUser.rejected définit l erreur', () => {
    const state = reducer(baseState, createAdditionalOfficeUser.rejected(null, 'reqId', undefined, { message: 'err' }));
    expect(state.error).toEqual({ message: 'err' });
  });

  // deleteOfficeUser
  test('deleteOfficeUser.pending met isLoading=true', () => {
    const state = reducer(baseState, deleteOfficeUser.pending('reqId'));
    expect(state.isLoading).toBe(true);
  });

  test('deleteOfficeUser.fulfilled supprime par id', () => {
    const prev = { ...baseState, officeUsers: [mockUser1, mockUser2] };
    const state = reducer(prev, deleteOfficeUser.fulfilled('u1', 'reqId'));
    expect(state.officeUsers).toHaveLength(1);
    expect(state.officeUsers[0]._id).toBe('u2');
  });

  test('deleteOfficeUser.rejected définit l erreur', () => {
    const state = reducer(baseState, deleteOfficeUser.rejected(null, 'reqId', undefined, { message: 'err' }));
    expect(state.error).toEqual({ message: 'err' });
  });

  // updateOfficeUser
  test('updateOfficeUser.pending met isLoading=true', () => {
    const state = reducer(baseState, updateOfficeUser.pending('reqId'));
    expect(state.isLoading).toBe(true);
  });

  test('updateOfficeUser.fulfilled remplace dans la liste', () => {
    const prev = { ...baseState, officeUsers: [mockUser1, mockUser2] };
    const updated = { ...mockUser1, nom: 'Dupont-Martin' };
    const state = reducer(prev, updateOfficeUser.fulfilled(updated, 'reqId'));
    expect(state.officeUsers[0].nom).toBe('Dupont-Martin');
    expect(state.officeUsers).toHaveLength(2);
  });

  test('updateOfficeUser.fulfilled ne crash pas si user non trouvé', () => {
    const prev = { ...baseState, officeUsers: [mockUser1] };
    const unknownUser = { _id: 'xxx', nom: 'Inconnu' };
    const state = reducer(prev, updateOfficeUser.fulfilled(unknownUser, 'reqId'));
    // La liste est inchangée (pas de remplacement)
    expect(state.officeUsers).toHaveLength(1);
    expect(state.officeUsers[0]._id).toBe('u1');
  });

  test('updateOfficeUser.rejected définit l erreur', () => {
    const state = reducer(baseState, updateOfficeUser.rejected(null, 'reqId', undefined, { message: 'err' }));
    expect(state.error).toEqual({ message: 'err' });
  });
});

// --- Cross-Slice ExtraReducers ---

describe('officeUserSlice cross-slice cleanup', () => {
  const filledState = { ...baseState, officeUser: mockUser1, officeUsers: [mockUser1], isSetupRequired: true };

  test('LOGOUT réinitialise tout', () => {
    const state = reducer(filledState, { type: 'LOGOUT' });
    expect(state.officeUser).toBeNull();
    expect(state.officeUsers).toEqual([]);
    expect(state.isSetupRequired).toBe(false);
  });

  test('AUTH_ERROR réinitialise tout', () => {
    const state = reducer(filledState, { type: 'AUTH_ERROR' });
    expect(state.officeUser).toBeNull();
    expect(state.officeUsers).toEqual([]);
  });

  test('ACCOUNT_DELETED réinitialise tout', () => {
    const state = reducer(filledState, { type: 'ACCOUNT_DELETED' });
    expect(state.officeUser).toBeNull();
    expect(state.officeUsers).toEqual([]);
  });
});

// --- localStorage Wrapper ---

describe('officeUserSlice localStorage persistence', () => {
  test('PERSIST_ACTIONS déclenche setItem pour officeUser et officeUsers', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem');

    // CREATE_OFFICE_USER_SUCCESS is in PERSIST_ACTIONS
    reducer(baseState, { type: 'CREATE_OFFICE_USER_SUCCESS', payload: mockUser1 });

    expect(spy).toHaveBeenCalledWith('officeUser', JSON.stringify(mockUser1));
    expect(spy).toHaveBeenCalledWith('officeUsers', JSON.stringify([]));
    spy.mockRestore();
  });

  test('action non-persistée ne déclenche PAS setItem', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem');

    reducer(baseState, { type: 'SOME_OTHER_ACTION' });

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('selectOfficeUser est dans PERSIST_ACTIONS', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem');
    const prev = { ...baseState, officeUsers: [mockUser1] };

    reducer(prev, selectOfficeUser('u1'));

    expect(spy).toHaveBeenCalledWith('officeUser', expect.any(String));
    spy.mockRestore();
  });
});

// --- Thunk Tests ---

describe('officeUserSlice thunks', () => {
  describe('loadOfficeUsers', () => {
    let dispatch, getState;

    beforeEach(() => {
      dispatch = jest.fn();
      getState = jest.fn(() => ({ login: { token: 'test-token' } }));
    });

    test('dispatch FAILURE quand pas de token', async () => {
      getState.mockReturnValue({ login: { token: null } });
      await loadOfficeUsers()(dispatch, getState);
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
        type: 'LOAD_OFFICE_USERS_FAILURE',
      }));
    });

    test('dispatch SUCCESS + mainOfficeUser quand liste non vide', async () => {
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1, mockUser2] } });
      localStorage.removeItem('officeUser');

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith({ type: 'LOAD_OFFICE_USERS_SUCCESS', payload: [mockUser1, mockUser2] });
      // mainOfficeUser is mockUser1
      expect(dispatch).toHaveBeenCalledWith({ type: 'CREATE_OFFICE_USER_SUCCESS', payload: mockUser1 });
    });

    test('utilise le premier user si aucun mainOfficeUser', async () => {
      const users = [
        { _id: 'u1', nom: 'A', mainOfficeUser: false },
        { _id: 'u2', nom: 'B', mainOfficeUser: false },
      ];
      apiClient.get.mockResolvedValue({ data: { officeUsers: users } });
      localStorage.removeItem('officeUser');

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith({ type: 'CREATE_OFFICE_USER_SUCCESS', payload: users[0] });
    });

    test('préfère le localStorage officeUser s il est dans la liste', async () => {
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1, mockUser2] } });
      localStorage.setItem('officeUser', JSON.stringify(mockUser2));

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith({ type: 'CREATE_OFFICE_USER_SUCCESS', payload: mockUser2 });
      localStorage.removeItem('officeUser');
    });

    test('ignore le localStorage officeUser si son _id n est pas dans la liste', async () => {
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1] } });
      localStorage.setItem('officeUser', JSON.stringify({ _id: 'xxx', nom: 'Ghost' }));

      await loadOfficeUsers()(dispatch, getState);

      // Falls back to mainOfficeUser
      expect(dispatch).toHaveBeenCalledWith({ type: 'CREATE_OFFICE_USER_SUCCESS', payload: mockUser1 });
      localStorage.removeItem('officeUser');
    });

    test('dispatch INITIAL_OFFICE_USER_SETUP_REQUIRED quand liste vide', async () => {
      apiClient.get.mockResolvedValue({ data: { officeUsers: [] } });

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith({ type: 'INITIAL_OFFICE_USER_SETUP_REQUIRED' });
    });

    test('dispatch FAILURE en cas d erreur API', async () => {
      apiClient.get.mockRejectedValue({ response: { data: { message: 'Server error' } } });

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
        type: 'LOAD_OFFICE_USERS_FAILURE',
      }));
    });

    test('utilise explicitToken si fourni', async () => {
      getState.mockReturnValue({ login: { token: null } });
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1] } });
      localStorage.removeItem('officeUser');

      await loadOfficeUsers('explicit-token')(dispatch, getState);

      expect(apiClient.get).toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith({ type: 'LOAD_OFFICE_USERS_SUCCESS', payload: [mockUser1] });
    });

    test('gère un localStorage corrompu gracieusement', async () => {
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1] } });
      localStorage.setItem('officeUser', 'not valid json{{{');

      await loadOfficeUsers()(dispatch, getState);

      // Should not throw, falls back to mainOfficeUser
      expect(dispatch).toHaveBeenCalledWith({ type: 'CREATE_OFFICE_USER_SUCCESS', payload: mockUser1 });
      localStorage.removeItem('officeUser');
    });
  });
});
