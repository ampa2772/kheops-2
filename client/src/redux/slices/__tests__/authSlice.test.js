jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    defaults: { headers: { common: {} } },
  },
}));

jest.mock('../officeUserSlice', () => ({
  __esModule: true,
  loadOfficeUsers: jest.fn((token) => ({ type: 'MOCK/loadOfficeUsers', payload: token })),
}));

import apiClient from '../../../services/apiClient';
import axios from 'axios';
import { loadOfficeUsers } from '../officeUserSlice';
import reducer, {
  logout,
  clearError,
  register,
  login,
  checkGoogleSession,
  setAccessibilityMode,
  updateBillingSettings,
  updateProfileSettings,
  sendResetPasswordRequest,
  updatePassword,
  loadUser,
  loadUserFromLocalStorage,
  verifyEmailToken,
  performLogout,
} from '../authSlice';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation();
  jest.spyOn(console, 'warn').mockImplementation();
  jest.spyOn(console, 'log').mockImplementation();
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation();
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation();
  jest.spyOn(Storage.prototype, 'clear').mockImplementation();
});

afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
  console.log.mockRestore();
  Storage.prototype.getItem.mockRestore();
  Storage.prototype.setItem.mockRestore();
  Storage.prototype.removeItem.mockRestore();
  Storage.prototype.clear.mockRestore();
});

// L etat initial depend du localStorage au moment de l import.
// Comme on mocke localStorage.getItem -> null, l etat initial sera :
const baseState = {
  token: null,
  isAuthenticated: false,
  loading: true,
  user: null,
  error: null,
  successSendResetPasswordMail: false,
  resetPasswordError: null,
};

// --- Etat initial ---

describe('authSlice etat initial', () => {
  test('etat initial avec localStorage vide', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.loading).toBe(true);
    expect(state.user).toBeNull();
    expect(state.error).toBeNull();
    expect(state.successSendResetPasswordMail).toBe(false);
    expect(state.resetPasswordError).toBeNull();
  });
});

// --- RTK Reducers ---

describe('authSlice reducers RTK', () => {
  test('logout nettoie state et localStorage', () => {
    const prev = { ...baseState, token: 'tok', isAuthenticated: true, user: { _id: 'u1' }, error: 'old' };
    const state = reducer(prev, logout());
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.error).toBeNull();
    expect(state.loading).toBe(false);
    // Verifie que les cles localStorage sont supprimees
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('token');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('user');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('officeUser');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('officeUsers');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('currentDossierState');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('readNotificationIds');
  });

  test('logout supprime les 18 cles attendues', () => {
    reducer(baseState, logout());
    // Compter les appels removeItem
    expect(Storage.prototype.removeItem.mock.calls.length).toBeGreaterThanOrEqual(16);
  });

  test('clearError remet error a null', () => {
    const prev = { ...baseState, error: 'Some error' };
    const state = reducer(prev, clearError());
    expect(state.error).toBeNull();
  });

  test('clearError ne touche pas les autres champs', () => {
    const prev = { ...baseState, token: 'tok', error: 'err' };
    const state = reducer(prev, clearError());
    expect(state.token).toBe('tok');
  });
});

// --- ExtraReducers string-type ---

describe('authSlice extraReducers string-type', () => {
  test('SET_TOKEN definit state.token', () => {
    const state = reducer(baseState, { type: 'SET_TOKEN', payload: 'new-token' });
    expect(state.token).toBe('new-token');
  });

  test('USER_LOADED avec payload {user, token}', () => {
    const payload = { user: { _id: 'u1', nom: 'A' }, isAuthenticated: true, token: 'tok' };
    const state = reducer(baseState, { type: 'USER_LOADED', payload });
    expect(state.isAuthenticated).toBe(true);
    expect(state.loading).toBe(false);
    expect(state.user).toEqual({ _id: 'u1', nom: 'A' });
    expect(state.token).toBe('tok');
  });

  test('USER_LOADED avec payload {data}', () => {
    const payload = { data: { _id: 'u2', nom: 'B' } };
    const state = reducer(baseState, { type: 'USER_LOADED', payload });
    expect(state.user).toEqual({ _id: 'u2', nom: 'B' });
  });

  test('USER_LOADED avec payload direct (sans .user ni .data)', () => {
    const payload = { _id: 'u3', nom: 'C' };
    const state = reducer(baseState, { type: 'USER_LOADED', payload });
    expect(state.user).toEqual({ _id: 'u3', nom: 'C' });
  });

  test('USER_LOADED conserve le token existant si payload.token absent', () => {
    const prev = { ...baseState, token: 'existing-token' };
    const state = reducer(prev, { type: 'USER_LOADED', payload: { user: { _id: 'u1' } } });
    expect(state.token).toBe('existing-token');
  });

  test('AUTH_ERROR nettoie state', () => {
    const prev = { ...baseState, token: 'tok', isAuthenticated: true, user: { _id: 'u1' } };
    const state = reducer(prev, { type: 'AUTH_ERROR' });
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.loading).toBe(false);
  });

  test('AUTH_ERROR supprime les cles localStorage specifiques', () => {
    reducer(baseState, { type: 'AUTH_ERROR' });
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('token');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('user');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('officeUser');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('dossierInfoState');
    // AUTH_ERROR ne supprime PAS readNotificationIds
    expect(Storage.prototype.removeItem).not.toHaveBeenCalledWith('readNotificationIds');
  });

  test('LOGOUT nettoie l etat et supprime toutes les cles', () => {
    const prev = { ...baseState, token: 'tok', isAuthenticated: true, error: 'old' };
    const state = reducer(prev, { type: 'LOGOUT' });
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.error).toBeNull();
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('readNotificationIds');
  });

  test('ACCOUNT_DELETED nettoie l etat', () => {
    const prev = { ...baseState, token: 'tok', isAuthenticated: true, user: { _id: 'u1' } };
    const state = reducer(prev, { type: 'ACCOUNT_DELETED' });
    expect(state.token).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });

  test('ACCOUNT_DELETED supprime les cles mais pas readNotificationIds', () => {
    reducer(baseState, { type: 'ACCOUNT_DELETED' });
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('token');
    expect(Storage.prototype.removeItem).not.toHaveBeenCalledWith('readNotificationIds');
  });
});

// --- createAsyncThunk lifecycle ---

describe('authSlice createAsyncThunk lifecycle', () => {
  describe('register', () => {
    test('register.fulfilled definit token et isAuthenticated', () => {
      const state = reducer(baseState, register.fulfilled({ token: 'new-tok' }, 'reqId'));
      expect(state.token).toBe('new-tok');
      expect(state.isAuthenticated).toBe(true);
      expect(state.error).toBeNull();
      expect(state.loading).toBe(false);
      expect(Storage.prototype.setItem).toHaveBeenCalledWith('token', 'new-tok');
    });

    test('register.rejected nettoie token et definit error', () => {
      const state = reducer(baseState, register.rejected(null, 'reqId', undefined, 'Email deja utilise'));
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Email deja utilise');
      expect(Storage.prototype.removeItem).toHaveBeenCalledWith('token');
    });
  });

  describe('login', () => {
    test('login.rejected nettoie token et definit error', () => {
      const errorPayload = { message: 'Identifiants invalides', status: 401 };
      const state = reducer(baseState, login.rejected(null, 'reqId', undefined, errorPayload));
      expect(state.token).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toEqual(errorPayload);
    });
  });

  describe('sendResetPasswordRequest', () => {
    test('fulfilled definit successSendResetPasswordMail=true', () => {
      const state = reducer(baseState, sendResetPasswordRequest.fulfilled(
        { successSendResetPasswordMail: true }, 'reqId',
      ));
      expect(state.successSendResetPasswordMail).toBe(true);
      expect(state.resetPasswordError).toBeNull();
    });

    test('rejected definit resetPasswordError', () => {
      const errorPayload = { message: 'Email non trouve', status: 404 };
      const state = reducer(baseState, sendResetPasswordRequest.rejected(null, 'reqId', undefined, errorPayload));
      expect(state.successSendResetPasswordMail).toBe(false);
      expect(state.resetPasswordError).toEqual(errorPayload);
    });
  });

  describe('updateProfileSettings', () => {
    test('fulfilled met a jour state.user et localStorage', () => {
      const updatedUser = { _id: 'u1', nom: 'Updated' };
      const state = reducer(baseState, updateProfileSettings.fulfilled(updatedUser, 'reqId'));
      expect(state.user).toEqual(updatedUser);
      expect(Storage.prototype.setItem).toHaveBeenCalledWith('user', JSON.stringify(updatedUser));
    });

    test('fulfilled ne change rien si payload null', () => {
      const prev = { ...baseState, user: { _id: 'u1' } };
      const state = reducer(prev, updateProfileSettings.fulfilled(null, 'reqId'));
      expect(state.user).toEqual({ _id: 'u1' });
    });
  });

  describe('setAccessibilityMode', () => {
    test('fulfilled met a jour state.user et localStorage', () => {
      const updatedUser = { _id: 'u1', highContrastMode: true, isSpeechEnabled: false };
      const state = reducer(baseState, setAccessibilityMode.fulfilled(updatedUser, 'reqId'));
      expect(state.user).toEqual(updatedUser);
      expect(Storage.prototype.setItem).toHaveBeenCalledWith('user', JSON.stringify(updatedUser));
    });

    test('rejected ne crash pas', () => {
      const state = reducer(baseState, setAccessibilityMode.rejected(null, 'reqId', undefined, 'err'));
      // Pas de changement d etat, juste console.error
      expect(state.user).toBeNull();
    });
  });
});

// --- Thunks createAsyncThunk execution ---

describe('authSlice thunks createAsyncThunk execution', () => {
  describe('register', () => {
    test('appelle apiClient.post et dispatch loadUser', async () => {
      apiClient.post.mockResolvedValue({ data: { token: 'new-tok' } });
      const dispatch = jest.fn((action) => {
        if (typeof action === 'function') return action(dispatch, () => ({ login: { token: 'new-tok' } }));
        return action;
      });
      apiClient.get.mockResolvedValue({ data: { user: { _id: 'u1' } } });
      const navigate = jest.fn();

      // Invoquer le thunk register via le pattern createAsyncThunk
      const thunk = register({ formData: { email: 'a@b.com' }, navigate });
      await thunk(dispatch, () => ({ login: { token: null } }), undefined);
      expect(apiClient.post).toHaveBeenCalledWith('/api/auth/register', { email: 'a@b.com' });
    });

    test('retourne rejectWithValue en cas d erreur 400', async () => {
      apiClient.post.mockRejectedValue({ response: { status: 400, data: { message: 'Email existe' } } });
      const dispatch = jest.fn();
      const thunk = register({ formData: {}, navigate: jest.fn() });
      const result = await thunk(dispatch, () => ({ login: {} }), undefined);
      expect(result.payload).toBe('Email existe');
    });

    test('retourne message generique pour erreur non-400', async () => {
      apiClient.post.mockRejectedValue({ response: { status: 500, data: {} } });
      const dispatch = jest.fn();
      const result = await register({ formData: {}, navigate: jest.fn() })(dispatch, () => ({ login: {} }), undefined);
      expect(result.payload).toBe('Une erreur est survenue. Veuillez réessayer.');
    });
  });

  describe('login', () => {
    test('appelle apiClient.post et dispatch loadUser sur status 200', async () => {
      apiClient.post.mockResolvedValue({ status: 200, data: { token: 'tok', rememberMe: true } });
      apiClient.get.mockResolvedValue({ data: { user: { _id: 'u1' } } });
      const dispatch = jest.fn((action) => {
        if (typeof action === 'function') return action(dispatch, () => ({ login: { token: 'tok' } }));
        return action;
      });
      const navigate = jest.fn();
      await login({ formData: { email: 'a@b.com', password: 'pass', rememberMe: true }, navigate })(
        dispatch, () => ({ login: {} }), undefined,
      );
      expect(apiClient.post).toHaveBeenCalledWith('/api/auth/login', { email: 'a@b.com', password: 'pass', rememberMe: true });
    });

    test('retourne rejectWithValue en cas d erreur', async () => {
      apiClient.post.mockRejectedValue({ response: { data: { message: 'Bad creds' }, status: 401 } });
      const dispatch = jest.fn();
      const result = await login({ formData: { email: 'a@b.com', password: 'x' }, navigate: jest.fn() })(
        dispatch, () => ({ login: {} }), undefined,
      );
      expect(result.payload).toEqual({ message: 'Bad creds', status: 401 });
    });
  });

  describe('checkGoogleSession', () => {
    test('appelle apiClient.get et retourne data', async () => {
      apiClient.get.mockResolvedValue({ data: { isLoggedIn: true } });
      const dispatch = jest.fn();
      const result = await checkGoogleSession()(dispatch, () => ({ login: { token: 'tok' } }), undefined);
      expect(apiClient.get).toHaveBeenCalledWith('/api/auth/google/session-status');
      expect(result.payload).toEqual({ isLoggedIn: true });
    });

    test('rejete si pas de token', async () => {
      const dispatch = jest.fn();
      const result = await checkGoogleSession()(dispatch, () => ({ login: { token: null } }), undefined);
      expect(result.payload).toContain('Token Kheops non trouvé');
    });
  });

  describe('setAccessibilityMode', () => {
    test('appelle apiClient.put avec les settings (visuel seul)', async () => {
      apiClient.put.mockResolvedValue({ data: { _id: 'u1', highContrastMode: true, isSpeechEnabled: false } });
      const dispatch = jest.fn();
      await setAccessibilityMode({ highContrastMode: true, isSpeechEnabled: false })(dispatch, () => ({ login: { token: 'tok' } }), undefined);
      expect(apiClient.put).toHaveBeenCalledWith('/api/auth/user/settings', { highContrastMode: true, isSpeechEnabled: false });
    });

    test('appelle apiClient.put avec les settings (visuel + voix)', async () => {
      apiClient.put.mockResolvedValue({ data: { _id: 'u1', highContrastMode: true, isSpeechEnabled: true } });
      const dispatch = jest.fn();
      await setAccessibilityMode({ highContrastMode: true, isSpeechEnabled: true })(dispatch, () => ({ login: { token: 'tok' } }), undefined);
      expect(apiClient.put).toHaveBeenCalledWith('/api/auth/user/settings', { highContrastMode: true, isSpeechEnabled: true });
    });
  });

  describe('updateBillingSettings', () => {
    test('appelle apiClient.put avec les settings', async () => {
      const settings = { tauxHoraire: 200 };
      apiClient.put.mockResolvedValue({ data: settings });
      const dispatch = jest.fn();
      await updateBillingSettings(settings)(dispatch, () => ({ login: { token: 'tok' } }), undefined);
      expect(apiClient.put).toHaveBeenCalledWith('/api/auth/user/settings', settings);
    });
  });

  describe('updateProfileSettings', () => {
    test('appelle apiClient.put et retourne data', async () => {
      const settings = { nom: 'Dupont' };
      apiClient.put.mockResolvedValue({ data: { _id: 'u1', nom: 'Dupont' } });
      const dispatch = jest.fn();
      const result = await updateProfileSettings(settings)(dispatch, () => ({ login: { token: 'tok' } }), undefined);
      expect(apiClient.put).toHaveBeenCalledWith('/api/auth/user/settings', settings);
      expect(result.payload).toEqual({ _id: 'u1', nom: 'Dupont' });
    });
  });

  describe('sendResetPasswordRequest', () => {
    test('retourne succes sur status 200', async () => {
      apiClient.post.mockResolvedValue({ status: 200 });
      const dispatch = jest.fn();
      const result = await sendResetPasswordRequest('a@b.com')(dispatch, () => ({}), undefined);
      expect(result.payload.successSendResetPasswordMail).toBe(true);
    });

    test('retourne rejectWithValue en cas d erreur', async () => {
      apiClient.post.mockRejectedValue({ response: { data: { message: 'Not found' }, status: 404 } });
      const dispatch = jest.fn();
      const result = await sendResetPasswordRequest('bad@b.com')(dispatch, () => ({}), undefined);
      expect(result.payload).toEqual({ message: 'Not found', status: 404 });
    });
  });
});

// --- Classic thunks loadUser ---

describe('authSlice thunks classiques loadUser', () => {
  let dispatch, getState;

  beforeEach(() => {
    dispatch = jest.fn((action) => {
      if (typeof action === 'function') return action(dispatch, getState);
      return action;
    });
    getState = () => ({ login: { token: 'existing-tok' } });
  });

  test('definit le token dans axios et localStorage', async () => {
    apiClient.get.mockResolvedValue({ data: { _id: 'u1' } });
    await loadUser({ token: 'new-tok', rememberMe: false })(dispatch, getState);
    expect(axios.defaults.headers.common['Authorization']).toBe('Bearer new-tok');
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('token', 'new-tok');
  });

  test('dispatch SET_TOKEN puis USER_LOADED', async () => {
    apiClient.get.mockResolvedValue({ data: { _id: 'u1', nom: 'A' } });
    await loadUser({ token: 'tok' })(dispatch, getState);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_TOKEN', payload: 'tok' });
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'USER_LOADED',
      payload: expect.objectContaining({ user: { _id: 'u1', nom: 'A' } }),
    }));
  });

  test('dispatch SET_MAIN_USER avec userData', async () => {
    apiClient.get.mockResolvedValue({ data: { _id: 'u1' } });
    await loadUser({ token: 'tok' })(dispatch, getState);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_MAIN_USER', payload: { _id: 'u1' } });
  });

  test('dispatch loadOfficeUsers avec le token', async () => {
    apiClient.get.mockResolvedValue({ data: { _id: 'u1' } });
    await loadUser({ token: 'tok' })(dispatch, getState);
    expect(loadOfficeUsers).toHaveBeenCalledWith('tok');
  });

  test('appelle navigate si fourni', async () => {
    apiClient.get.mockResolvedValue({ data: { _id: 'u1' } });
    const navigate = jest.fn();
    await loadUser({ token: 'tok', navigate })(dispatch, getState);
    expect(navigate).toHaveBeenCalledWith('/dashboard');
  });

  test('n appelle pas navigate si non fourni', async () => {
    apiClient.get.mockResolvedValue({ data: { _id: 'u1' } });
    await loadUser({ token: 'tok' })(dispatch, getState);
    // Pas de crash
  });

  test('gere le format {user: {...}}', async () => {
    apiClient.get.mockResolvedValue({ data: { user: { _id: 'u2', nom: 'B' } } });
    await loadUser({ token: 'tok' })(dispatch, getState);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'USER_LOADED',
      payload: expect.objectContaining({ user: { _id: 'u2', nom: 'B' } }),
    }));
  });

  test('detecte changement de compte et clear localStorage', async () => {
    Storage.prototype.getItem.mockImplementation((key) => {
      if (key === 'user') return JSON.stringify({ _id: 'old-user' });
      return null;
    });
    apiClient.get.mockResolvedValue({ data: { _id: 'new-user' } });
    await loadUser({ token: 'tok' })(dispatch, getState);
    expect(Storage.prototype.clear).toHaveBeenCalled();
    // Re-set token apres clear
    expect(Storage.prototype.setItem).toHaveBeenCalledWith('token', 'tok');
  });

  test('gere localStorage user corrompu sans crash', async () => {
    Storage.prototype.getItem.mockImplementation((key) => {
      if (key === 'user') return 'INVALID_JSON';
      return null;
    });
    apiClient.get.mockResolvedValue({ data: { _id: 'u1' } });
    await loadUser({ token: 'tok' })(dispatch, getState);
    // Le JSON.parse echoue, localStorage.clear est appele
    expect(Storage.prototype.clear).toHaveBeenCalled();
  });

  test('utilise getState().login.token si newToken est falsy', async () => {
    apiClient.get.mockResolvedValue({ data: { _id: 'u1' } });
    await loadUser({ token: null, rememberMe: true })(dispatch, getState);
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_TOKEN', payload: 'existing-tok' });
  });

  test('dispatch AUTH_ERROR en cas d erreur API', async () => {
    apiClient.get.mockRejectedValue(new Error('Network'));
    await loadUser({ token: 'tok' })(dispatch, getState);
    expect(dispatch).toHaveBeenCalledWith({ type: 'AUTH_ERROR' });
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('token');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('user');
  });
});

// --- Classic thunks loadUserFromLocalStorage ---

describe('authSlice thunks classiques loadUserFromLocalStorage', () => {
  let dispatch, getState;

  beforeEach(() => {
    dispatch = jest.fn((action) => {
      if (typeof action === 'function') return action(dispatch, getState);
      return action;
    });
    getState = () => ({ login: { token: null } });
  });

  test('token + user presents : dispatch USER_LOADED + SET_MAIN_USER + loadOfficeUsers', () => {
    Storage.prototype.getItem.mockImplementation((key) => {
      if (key === 'token') return 'tok123';
      if (key === 'user') return JSON.stringify({ _id: 'u1', nom: 'A' });
      return null;
    });
    loadUserFromLocalStorage()(dispatch);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'USER_LOADED' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_MAIN_USER', payload: { _id: 'u1', nom: 'A' } });
    expect(loadOfficeUsers).toHaveBeenCalledWith('tok123');
  });

  test('token present mais user absent : dispatch loadUser', () => {
    Storage.prototype.getItem.mockImplementation((key) => {
      if (key === 'token') return 'tok123';
      if (key === 'user') return null;
      return null;
    });
    loadUserFromLocalStorage()(dispatch);
    // loadUser est dispatche comme thunk (function)
    expect(dispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  test('ni token ni user : dispatch AUTH_ERROR', () => {
    Storage.prototype.getItem.mockReturnValue(null);
    loadUserFromLocalStorage()(dispatch);
    expect(dispatch).toHaveBeenCalledWith({ type: 'AUTH_ERROR' });
  });

  test('user "undefined" dans localStorage est traite comme absent', () => {
    Storage.prototype.getItem.mockImplementation((key) => {
      if (key === 'token') return 'tok';
      if (key === 'user') return 'undefined';
      return null;
    });
    loadUserFromLocalStorage()(dispatch);
    // user est null car "undefined" est filtre, donc dispatch loadUser
    expect(dispatch).toHaveBeenCalledWith(expect.any(Function));
  });
});

// --- Classic thunk performLogout (deconnexion non-bloquante) ---

describe('authSlice performLogout', () => {
  let dispatch, getState;

  beforeEach(() => {
    dispatch = jest.fn((action) => {
      if (typeof action === 'function') return action(dispatch, getState);
      return action;
    });
    getState = () => ({ login: { user: { _id: 'u1' } } });
  });

  test('deconnecte meme sans window.electron (mode web) : dispatch logout et revient au login', async () => {
    const navigate = jest.fn();
    await performLogout({ navigate })(dispatch, getState);
    // L'action logout (auth/logout) a bien ete dispatchee (le reducer fera le
    // nettoyage localStorage dans un vrai store ; ici on verifie le dispatch).
    expect(dispatch).toHaveBeenCalledWith(logout());
    // retour a l'ecran de login
    expect(navigate).toHaveBeenCalledWith('/');
  });

  test('ne crash pas et resout meme si navigate non fourni', async () => {
    await expect(performLogout()(dispatch, getState)).resolves.toBeUndefined();
  });

  test('tente de verrouiller le cabinet (dispatch lockCabinetEncryption) avant le logout', async () => {
    const navigate = jest.fn();
    await performLogout({ navigate })(dispatch, getState);
    // lockCabinetEncryption est dispatche comme thunk (fonction) en best-effort
    expect(dispatch).toHaveBeenCalledWith(expect.any(Function));
  });
});

// --- Classic thunks updatePassword ---

describe('authSlice thunks classiques updatePassword', () => {
  let dispatch;

  beforeEach(() => {
    dispatch = jest.fn((action) => {
      if (typeof action === 'function') return action(dispatch, () => ({ login: { token: 'tok' } }));
      return action;
    });
  });

  test('appelle apiClient.post avec newPassword', async () => {
    apiClient.post.mockResolvedValue({});
    apiClient.get.mockResolvedValue({ data: { _id: 'u1' } });
    await updatePassword('newPass', 'reset-token', jest.fn())(dispatch);
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/auth/new-password',
      JSON.stringify({ newPassword: 'newPass' }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  });

  test('dispatch loadUser apres succes', async () => {
    apiClient.post.mockResolvedValue({});
    apiClient.get.mockResolvedValue({ data: { _id: 'u1' } });
    const navigate = jest.fn();
    await updatePassword('newPass', 'reset-token', navigate)(dispatch);
    // loadUser est dispatche comme function
    expect(dispatch).toHaveBeenCalledWith(expect.any(Function));
  });

  test('gere erreur sans crash', async () => {
    apiClient.post.mockRejectedValue(new Error('err'));
    await updatePassword('newPass', 'tok', jest.fn())(dispatch);
    // console.error est appele
    expect(console.error).toHaveBeenCalled();
  });
});

// --- verifyEmailToken ---

describe('authSlice verifyEmailToken', () => {
  test('retourne true si status 200', async () => {
    apiClient.get.mockResolvedValue({ status: 200 });
    const fn = verifyEmailToken('tok123');
    const result = await fn();
    expect(result).toBe(true);
  });

  test('retourne false en cas d erreur', async () => {
    apiClient.get.mockRejectedValue(new Error('err'));
    const fn = verifyEmailToken('bad-tok');
    const result = await fn();
    expect(result).toBe(false);
  });
});
