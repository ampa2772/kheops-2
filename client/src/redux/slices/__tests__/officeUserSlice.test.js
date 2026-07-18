jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import apiClient from '../../../services/apiClient';

// Must import after mocking apiClient since officeUserSlice imports it
import reducer, {
  ACTIVE_OFFICE_USER_SESSION_PREFIX,
  getActiveOfficeUserSessionKey,
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

const ownerUserId = 'owner-1';
const otherOwnerUserId = 'owner-2';
const activeSessionKey = getActiveOfficeUserSessionKey(ownerUserId);

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  localStorage.removeItem('officeUser');
  localStorage.removeItem('officeUsers');
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
  sessionOwnerUserId: null,
  isLoading: false,
  error: null,
  userToDelete: null,
  editMode: false,
  isSetupRequired: false,
};

const mockUser1 = { _id: 'u1', nom: 'Dupont', mainOfficeUser: true };
const mockUser2 = { _id: 'u2', nom: 'Martin', mainOfficeUser: false };

const actionWithOwner = (type, payload) => ({
  type,
  payload,
  meta: { ownerUserId },
});

// --- RTK Reducer Actions ---

describe('officeUserSlice RTK reducers', () => {
  test('selectOfficeUser trouve l utilisateur par id', () => {
    const prev = {
      ...baseState,
      officeUsers: [mockUser1, mockUser2],
      sessionOwnerUserId: ownerUserId,
    };
    const state = reducer(prev, selectOfficeUser('u2'));
    expect(state.officeUser).toEqual(mockUser2);
  });

  test('selectOfficeUser retourne null si non trouve', () => {
    const prev = {
      ...baseState,
      officeUsers: [mockUser1],
      sessionOwnerUserId: ownerUserId,
    };
    const state = reducer(prev, selectOfficeUser('xxx'));
    expect(state.officeUser).toBeNull();
  });

  test('setUserToDelete stocke le payload', () => {
    const state = reducer(baseState, setUserToDelete('u1'));
    expect(state.userToDelete).toBe('u1');
  });

  test('setEditMode definit editMode', () => {
    const state = reducer(baseState, setEditMode(true));
    expect(state.editMode).toBe(true);
  });

  test('resetEditMode remet editMode a false', () => {
    const prev = { ...baseState, editMode: true };
    const state = reducer(prev, resetEditMode());
    expect(state.editMode).toBe(false);
  });

  test('resetInitialData definit initialData a objet vide', () => {
    const state = reducer(baseState, resetInitialData());
    expect(state.initialData).toEqual({});
  });

  test('l etat initial ne restaure jamais les anciens objets localStorage', () => {
    localStorage.setItem('officeUser', JSON.stringify({ _id: 'stale', nom: 'Perime' }));
    localStorage.setItem('officeUsers', JSON.stringify([{ _id: 'stale' }]));

    const state = reducer(undefined, { type: '@@INIT' });

    expect(state.officeUser).toBeNull();
    expect(state.officeUsers).toEqual([]);
  });
});

// --- String-Type ExtraReducers ---

describe('officeUserSlice string-type extraReducers', () => {
  test('CREATE_OFFICE_USER_SUCCESS definit officeUser et le proprietaire de session', () => {
    const state = reducer(baseState, actionWithOwner('CREATE_OFFICE_USER_SUCCESS', mockUser1));
    expect(state.officeUser).toEqual(mockUser1);
    expect(state.sessionOwnerUserId).toBe(ownerUserId);
    expect(state.isSetupRequired).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  test('LOAD_OFFICE_USERS_SUCCESS definit la liste canonique et le proprietaire', () => {
    const state = reducer(
      baseState,
      actionWithOwner('LOAD_OFFICE_USERS_SUCCESS', [mockUser1, mockUser2])
    );
    expect(state.officeUsers).toEqual([mockUser1, mockUser2]);
    expect(state.sessionOwnerUserId).toBe(ownerUserId);
    expect(state.isLoading).toBe(false);
  });

  test('LOAD_OFFICE_USERS_FAILURE definit l erreur', () => {
    const state = reducer(baseState, {
      type: 'LOAD_OFFICE_USERS_FAILURE',
      payload: { message: 'err' },
    });
    expect(state.error).toEqual({ message: 'err' });
    expect(state.isLoading).toBe(false);
  });

  test('INITIAL_OFFICE_USER_SETUP_REQUIRED vide les users et active isSetupRequired', () => {
    const prev = {
      ...baseState,
      officeUsers: [mockUser1],
      officeUser: mockUser1,
      sessionOwnerUserId: ownerUserId,
    };
    const state = reducer(prev, {
      type: 'INITIAL_OFFICE_USER_SETUP_REQUIRED',
      meta: { ownerUserId },
    });
    expect(state.officeUsers).toEqual([]);
    expect(state.officeUser).toBeNull();
    expect(state.isSetupRequired).toBe(true);
  });
});

// --- createAsyncThunk Lifecycle ---

describe('officeUserSlice createAsyncThunk lifecycle', () => {
  test('createOfficeUser.pending met isLoading=true', () => {
    const state = reducer(baseState, createOfficeUser.pending('reqId'));
    expect(state.isLoading).toBe(true);
  });

  test('createOfficeUser.fulfilled definit officeUser', () => {
    const state = reducer(baseState, createOfficeUser.fulfilled(mockUser1, 'reqId'));
    expect(state.officeUser).toEqual(mockUser1);
    expect(state.isSetupRequired).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  test('createOfficeUser.rejected definit l erreur', () => {
    const state = reducer(
      baseState,
      createOfficeUser.rejected(null, 'reqId', undefined, { message: 'err' })
    );
    expect(state.error).toEqual({ message: 'err' });
    expect(state.isLoading).toBe(false);
  });

  test('createAdditionalOfficeUser.fulfilled ajoute a la liste', () => {
    const prev = { ...baseState, officeUsers: [mockUser1] };
    const state = reducer(prev, createAdditionalOfficeUser.fulfilled(mockUser2, 'reqId'));
    expect(state.officeUsers).toHaveLength(2);
    expect(state.officeUser).toEqual(mockUser2);
  });

  test('createAdditionalOfficeUser.rejected definit l erreur', () => {
    const state = reducer(
      baseState,
      createAdditionalOfficeUser.rejected(null, 'reqId', undefined, { message: 'err' })
    );
    expect(state.error).toEqual({ message: 'err' });
  });

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

  test('deleteOfficeUser.fulfilled bascule atomiquement un profil actif supprime vers le main canonique', () => {
    sessionStorage.setItem(activeSessionKey, 'u2');
    const canonicalMain = { ...mockUser1, version: 4 };
    const prev = {
      ...baseState,
      officeUsers: [canonicalMain, mockUser2],
      officeUser: mockUser2,
      sessionOwnerUserId: ownerUserId,
      userToDelete: mockUser2,
    };

    const state = reducer(prev, deleteOfficeUser.fulfilled('u2', 'reqId'));

    expect(state.officeUsers).toEqual([canonicalMain]);
    expect(state.officeUser).toEqual(canonicalMain);
    expect(state.userToDelete).toBeNull();
    expect(sessionStorage.getItem(activeSessionKey)).toBe('u1');
  });

  test('deleteOfficeUser.fulfilled met le profil actif a null et efface la session sans repli', () => {
    sessionStorage.setItem(activeSessionKey, 'u2');
    const prev = {
      ...baseState,
      officeUsers: [mockUser2],
      officeUser: mockUser2,
      sessionOwnerUserId: ownerUserId,
    };

    const state = reducer(prev, deleteOfficeUser.fulfilled('u2', 'reqId'));

    expect(state.officeUsers).toEqual([]);
    expect(state.officeUser).toBeNull();
    expect(sessionStorage.getItem(activeSessionKey)).toBeNull();
  });

  test('deleteOfficeUser.fulfilled conserve le profil actif canonique si un autre est supprime', () => {
    const canonicalActive = { ...mockUser1, version: 5 };
    const prev = {
      ...baseState,
      officeUsers: [canonicalActive, mockUser2],
      officeUser: { ...mockUser1, version: 1 },
      sessionOwnerUserId: ownerUserId,
    };

    const state = reducer(prev, deleteOfficeUser.fulfilled('u2', 'reqId'));

    expect(state.officeUser).toEqual(canonicalActive);
    expect(sessionStorage.getItem(activeSessionKey)).toBe('u1');
  });

  test('deleteOfficeUser.rejected definit l erreur', () => {
    const state = reducer(
      baseState,
      deleteOfficeUser.rejected(null, 'reqId', undefined, { message: 'err' })
    );
    expect(state.error).toEqual({ message: 'err' });
  });

  test('updateOfficeUser.pending met isLoading=true', () => {
    const state = reducer(baseState, updateOfficeUser.pending('reqId'));
    expect(state.isLoading).toBe(true);
  });

  test('updateOfficeUser.fulfilled remplace la liste et l objet actif', () => {
    const prev = {
      ...baseState,
      officeUsers: [mockUser1, mockUser2],
      officeUser: mockUser1,
      sessionOwnerUserId: ownerUserId,
    };
    const updated = { ...mockUser1, nom: 'Dupont-Martin' };
    const state = reducer(prev, updateOfficeUser.fulfilled(updated, 'reqId'));
    expect(state.officeUsers[0]).toEqual(updated);
    expect(state.officeUser).toEqual(updated);
    expect(state.officeUsers).toHaveLength(2);
  });

  test('updateOfficeUser.fulfilled conserve un autre objet actif', () => {
    const prev = {
      ...baseState,
      officeUsers: [mockUser1, mockUser2],
      officeUser: mockUser2,
      sessionOwnerUserId: ownerUserId,
    };
    const updated = { ...mockUser1, nom: 'Dupont-Martin' };
    const state = reducer(prev, updateOfficeUser.fulfilled(updated, 'reqId'));
    expect(state.officeUsers[0]).toEqual(updated);
    expect(state.officeUser).toEqual(mockUser2);
  });

  test('updateOfficeUser.fulfilled ne crash pas si user non trouve', () => {
    const prev = { ...baseState, officeUsers: [mockUser1] };
    const unknownUser = { _id: 'xxx', nom: 'Inconnu' };
    const state = reducer(prev, updateOfficeUser.fulfilled(unknownUser, 'reqId'));
    expect(state.officeUsers).toHaveLength(1);
    expect(state.officeUsers[0]._id).toBe('u1');
  });

  test('updateOfficeUser.rejected definit l erreur', () => {
    const state = reducer(
      baseState,
      updateOfficeUser.rejected(null, 'reqId', undefined, { message: 'err' })
    );
    expect(state.error).toEqual({ message: 'err' });
  });
});

// --- Cross-Slice ExtraReducers ---

describe('officeUserSlice cross-slice cleanup', () => {
  const filledState = {
    ...baseState,
    officeUser: mockUser1,
    officeUsers: [mockUser1],
    sessionOwnerUserId: ownerUserId,
    isSetupRequired: true,
  };

  const expectCleanup = (actionType) => {
    sessionStorage.setItem(activeSessionKey, mockUser1._id);
    localStorage.setItem('officeUser', JSON.stringify(mockUser1));
    localStorage.setItem('officeUsers', JSON.stringify([mockUser1]));

    const state = reducer(filledState, { type: actionType });

    expect(state.officeUser).toBeNull();
    expect(state.officeUsers).toEqual([]);
    expect(state.sessionOwnerUserId).toBeNull();
    expect(state.isSetupRequired).toBe(false);
    expect(sessionStorage.getItem(activeSessionKey)).toBeNull();
    expect(localStorage.getItem('officeUser')).toBeNull();
    expect(localStorage.getItem('officeUsers')).toBeNull();
  };

  test('LOGOUT reinitialise le state et la selection de session', () => {
    expectCleanup('LOGOUT');
  });

  test('auth/logout reel reinitialise le state et la selection de session', () => {
    expectCleanup('auth/logout');
  });

  test('AUTH_ERROR reinitialise le state et la selection de session', () => {
    expectCleanup('AUTH_ERROR');
  });

  test('ACCOUNT_DELETED reinitialise le state et la selection de session', () => {
    expectCleanup('ACCOUNT_DELETED');
  });

  test('un reset sans proprietaire connu nettoie les selections de cette fenetre', () => {
    sessionStorage.setItem(activeSessionKey, 'u1');
    sessionStorage.setItem(getActiveOfficeUserSessionKey(otherOwnerUserId), 'u2');

    reducer(baseState, { type: 'AUTH_ERROR' });

    expect(sessionStorage.getItem(activeSessionKey)).toBeNull();
    expect(sessionStorage.getItem(getActiveOfficeUserSessionKey(otherOwnerUserId))).toBeNull();
  });
});

// --- sessionStorage Wrapper ---

describe('officeUserSlice per-window session persistence', () => {
  test('la selection UI persiste seulement son id dans la session namespaced', () => {
    const prev = {
      ...baseState,
      officeUsers: [mockUser1, mockUser2],
      sessionOwnerUserId: ownerUserId,
    };

    reducer(prev, selectOfficeUser('u2'));

    expect(sessionStorage.getItem(activeSessionKey)).toBe('u2');
    expect(localStorage.getItem('officeUser')).toBeNull();
    expect(localStorage.getItem('officeUsers')).toBeNull();
  });

  test('deux Users Kheops ont des cles de selection distinctes', () => {
    const ownerOneState = {
      ...baseState,
      officeUsers: [mockUser1, mockUser2],
      sessionOwnerUserId: ownerUserId,
    };
    const ownerTwoState = {
      ...baseState,
      officeUsers: [mockUser1, mockUser2],
      sessionOwnerUserId: otherOwnerUserId,
    };

    reducer(ownerOneState, selectOfficeUser('u1'));
    reducer(ownerTwoState, selectOfficeUser('u2'));

    expect(sessionStorage.getItem(getActiveOfficeUserSessionKey(ownerUserId))).toBe('u1');
    expect(sessionStorage.getItem(getActiveOfficeUserSessionKey(otherOwnerUserId))).toBe('u2');
    expect(getActiveOfficeUserSessionKey(ownerUserId)).toBe(
      `${ACTIVE_OFFICE_USER_SESSION_PREFIX}${ownerUserId}`
    );
  });

  test('une action sans selection ne touche pas sessionStorage', () => {
    reducer(baseState, { type: 'SOME_OTHER_ACTION' });
    expect(sessionStorage.length).toBe(0);
  });

  test('CREATE_OFFICE_USER_SUCCESS migre la selection sans persister l objet', () => {
    localStorage.setItem('officeUser', JSON.stringify({ ...mockUser2, nom: 'Objet perime' }));
    localStorage.setItem('officeUsers', JSON.stringify([mockUser2]));

    reducer(baseState, actionWithOwner('CREATE_OFFICE_USER_SUCCESS', mockUser2));

    expect(sessionStorage.getItem(activeSessionKey)).toBe('u2');
    expect(localStorage.getItem('officeUser')).toBeNull();
    expect(localStorage.getItem('officeUsers')).toBeNull();
  });
});

// --- Thunk Tests ---

describe('officeUserSlice thunks', () => {
  describe('loadOfficeUsers', () => {
    let dispatch;
    let getState;

    beforeEach(() => {
      dispatch = jest.fn();
      getState = jest.fn(() => ({
        login: { token: 'test-token', user: { _id: ownerUserId } },
      }));
    });

    test('dispatch FAILURE quand pas de token', async () => {
      getState.mockReturnValue({ login: { token: null, user: { _id: ownerUserId } } });
      await loadOfficeUsers()(dispatch, getState);
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
        type: 'LOAD_OFFICE_USERS_FAILURE',
      }));
    });

    test('dispatch SUCCESS + mainOfficeUser quand liste non vide', async () => {
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1, mockUser2] } });

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(
        actionWithOwner('LOAD_OFFICE_USERS_SUCCESS', [mockUser1, mockUser2])
      );
      expect(dispatch).toHaveBeenCalledWith(
        actionWithOwner('CREATE_OFFICE_USER_SUCCESS', mockUser1)
      );
    });

    test('utilise le premier user si aucun mainOfficeUser', async () => {
      const users = [
        { _id: 'u1', nom: 'A', mainOfficeUser: false },
        { _id: 'u2', nom: 'B', mainOfficeUser: false },
      ];
      apiClient.get.mockResolvedValue({ data: { officeUsers: users } });

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(
        actionWithOwner('CREATE_OFFICE_USER_SUCCESS', users[0])
      );
    });

    test('restaure l id session uniquement avec l objet canonique du serveur', async () => {
      const freshServerUser2 = { ...mockUser2, nom: 'Martin serveur', version: 3 };
      apiClient.get.mockResolvedValue({
        data: { officeUsers: [mockUser1, freshServerUser2] },
      });
      sessionStorage.setItem(activeSessionKey, 'u2');
      localStorage.setItem('officeUser', JSON.stringify({ ...mockUser2, nom: 'Martin perime' }));

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(
        actionWithOwner('CREATE_OFFICE_USER_SUCCESS', freshServerUser2)
      );
      expect(localStorage.getItem('officeUser')).toBeNull();
    });

    test('un id session invalide retombe sur le main et ignore le legacy', async () => {
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1, mockUser2] } });
      sessionStorage.setItem(activeSessionKey, 'ghost');
      localStorage.setItem('officeUser', JSON.stringify(mockUser2));

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(
        actionWithOwner('CREATE_OFFICE_USER_SUCCESS', mockUser1)
      );
      expect(localStorage.getItem('officeUser')).toBeNull();
    });

    test('migre un ancien officeUser localStorage par son id valide', async () => {
      const staleLegacyUser = { ...mockUser2, nom: 'Ancien objet local' };
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1, mockUser2] } });
      localStorage.setItem('officeUser', JSON.stringify(staleLegacyUser));
      localStorage.setItem('officeUsers', JSON.stringify([{ _id: 'obsolete' }]));

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(
        actionWithOwner('CREATE_OFFICE_USER_SUCCESS', mockUser2)
      );
      expect(localStorage.getItem('officeUser')).toBeNull();
      expect(localStorage.getItem('officeUsers')).toBeNull();
    });

    test('ignore un ancien officeUser dont l id n est pas dans la liste', async () => {
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1] } });
      localStorage.setItem('officeUser', JSON.stringify({ _id: 'xxx', nom: 'Ghost' }));

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(
        actionWithOwner('CREATE_OFFICE_USER_SUCCESS', mockUser1)
      );
      expect(localStorage.getItem('officeUser')).toBeNull();
    });

    test('la liste locale obsolete n est jamais utilisee a la place du serveur', async () => {
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1] } });
      localStorage.setItem('officeUsers', JSON.stringify([{ _id: 'ghost' }]));

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(
        actionWithOwner('LOAD_OFFICE_USERS_SUCCESS', [mockUser1])
      );
      expect(localStorage.getItem('officeUsers')).toBeNull();
    });

    test('dispatch INITIAL_OFFICE_USER_SETUP_REQUIRED quand liste vide', async () => {
      apiClient.get.mockResolvedValue({ data: { officeUsers: [] } });
      sessionStorage.setItem(activeSessionKey, 'u1');

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith({
        type: 'INITIAL_OFFICE_USER_SETUP_REQUIRED',
        meta: { ownerUserId },
      });
    });

    test('dispatch FAILURE en cas d erreur API', async () => {
      apiClient.get.mockRejectedValue({ response: { data: { message: 'Server error' } } });

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
        type: 'LOAD_OFFICE_USERS_FAILURE',
      }));
    });

    test('utilise explicitToken si fourni', async () => {
      getState.mockReturnValue({ login: { token: null, user: { _id: ownerUserId } } });
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1] } });

      await loadOfficeUsers('explicit-token')(dispatch, getState);

      expect(apiClient.get).toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith(
        actionWithOwner('LOAD_OFFICE_USERS_SUCCESS', [mockUser1])
      );
    });

    test('gere un ancien localStorage corrompu gracieusement', async () => {
      apiClient.get.mockResolvedValue({ data: { officeUsers: [mockUser1] } });
      localStorage.setItem('officeUser', 'not valid json{{{');

      await loadOfficeUsers()(dispatch, getState);

      expect(dispatch).toHaveBeenCalledWith(
        actionWithOwner('CREATE_OFFICE_USER_SUCCESS', mockUser1)
      );
      expect(localStorage.getItem('officeUser')).toBeNull();
    });
  });
});
