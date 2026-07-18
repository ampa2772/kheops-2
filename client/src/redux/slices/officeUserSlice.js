// officeUserSlice.js — migre depuis officeUserReducer/officeUserReducer.js
// Phase 9A : logique migree depuis officeUserActions.js + loadUser.js
// Persistance : le profil actif est propre a chaque fenetre/onglet. On ne
// persiste donc que son identifiant dans sessionStorage, namespace par User
// Kheops. La liste et les objets OfficeUser restent canoniques et proviennent
// toujours du serveur.
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';

export const ACTIVE_OFFICE_USER_SESSION_PREFIX = 'kheops.activeOfficeUserId.';

const LEGACY_OFFICE_USER_KEYS = ['officeUser', 'officeUsers'];

export const getActiveOfficeUserSessionKey = (ownerUserId) => {
  const normalizedOwnerId = String(ownerUserId || '').trim();
  return normalizedOwnerId ? `${ACTIVE_OFFICE_USER_SESSION_PREFIX}${normalizedOwnerId}` : null;
};

const getWindowSessionStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch (_error) {
    return null;
  }
};

const getWindowLocalStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch (_error) {
    return null;
  }
};

const readActiveOfficeUserId = (ownerUserId) => {
  const key = getActiveOfficeUserSessionKey(ownerUserId);
  const storage = getWindowSessionStorage();
  if (!key || !storage) return null;

  try {
    const value = storage.getItem(key);
    if (!value || value === 'undefined' || value === 'null') {
      storage.removeItem(key);
      return null;
    }
    return String(value);
  } catch (_error) {
    return null;
  }
};

const writeActiveOfficeUserId = (ownerUserId, officeUserId) => {
  const key = getActiveOfficeUserSessionKey(ownerUserId);
  const storage = getWindowSessionStorage();
  if (!key || !storage) return;

  try {
    if (officeUserId) storage.setItem(key, String(officeUserId));
    else storage.removeItem(key);
  } catch (error) {
    console.error('Erreur sessionStorage officeUser:', error);
  }
};

const clearActiveOfficeUserSession = (ownerUserId = null) => {
  const storage = getWindowSessionStorage();
  if (!storage) return;

  try {
    const exactKey = getActiveOfficeUserSessionKey(ownerUserId);
    if (exactKey) {
      storage.removeItem(exactKey);
      return;
    }

    // Lors d'un logout/auth error, le User peut deja avoir ete retire du
    // state. On nettoie alors toutes les selections de CETTE fenetre.
    const keysToRemove = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(ACTIVE_OFFICE_USER_SESSION_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  } catch (error) {
    console.error('Erreur nettoyage sessionStorage officeUser:', error);
  }
};

const readLegacyOfficeUserId = () => {
  const storage = getWindowLocalStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem('officeUser');
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    const parsed = JSON.parse(raw);
    const id = parsed && typeof parsed === 'object' ? parsed._id : parsed;
    return id ? String(id) : null;
  } catch (_error) {
    return null;
  }
};

const clearLegacyOfficeUserStorage = () => {
  const storage = getWindowLocalStorage();
  if (!storage) return;
  try {
    LEGACY_OFFICE_USER_KEYS.forEach((key) => storage.removeItem(key));
  } catch (error) {
    console.error('Erreur nettoyage ancien localStorage officeUser:', error);
  }
};

// ========================================================================
// Async Thunks
// ========================================================================

export const createOfficeUser = createAsyncThunk(
  'officeUser/create',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/api/auth/officeUser', {});
      if (response.status === 201) {
        return response.data.newOfficeUser;
      }
      return rejectWithValue({ message: 'Statut de la reponse different de 201' });
    } catch (error) {
      console.error('Erreur lors de la requete:', error.response?.data);
      return rejectWithValue(error.response?.data || { message: 'Erreur reseau' });
    }
  }
);

export const createAdditionalOfficeUser = createAsyncThunk(
  'officeUser/createAdditional',
  async (formData, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/api/auth/officeUser/add', formData);
      if (response.status === 201) {
        return response.data.newOfficeUser;
      }
      return rejectWithValue({ message: 'Statut de la reponse different de 201' });
    } catch (error) {
      console.error('Erreur lors de la requete:', error.response?.data);
      return rejectWithValue(error.response?.data || { message: 'Erreur reseau' });
    }
  }
);

export const deleteOfficeUser = createAsyncThunk(
  'officeUser/delete',
  async (officeUserId, { rejectWithValue }) => {
    try {
      const response = await apiClient.post('/api/auth/officeUser/delete', { officeUserId });
      if (response.status === 200) {
        return officeUserId;
      }
      return rejectWithValue({ message: 'Statut de la reponse different de 200' });
    } catch (error) {
      console.error('Erreur lors de la requete:', error.response?.data);
      return rejectWithValue(error.response?.data || { message: 'Erreur reseau' });
    }
  }
);

export const updateOfficeUser = createAsyncThunk(
  'officeUser/update',
  async (formData, { rejectWithValue }) => {
    try {
      const response = await apiClient.put('/api/auth/officeUser/update/', formData);
      if (response.status === 200) {
        return response.data.updatedOfficeUser;
      }
      return rejectWithValue({ message: 'Statut de la reponse different de 200' });
    } catch (error) {
      console.error('Erreur lors de la requete:', error.response?.data);
      return rejectWithValue(error.response?.data || { message: 'Erreur reseau' });
    }
  }
);

/**
 * loadOfficeUsers — Charge la liste des officeUsers depuis le backend.
 * Reste un thunk classique car il dispatch CREATE_OFFICE_USER_SUCCESS
 * et gere la selection sessionStorage, la migration de l'ancien localStorage
 * et INITIAL_OFFICE_USER_SETUP_REQUIRED.
 */
export const loadOfficeUsers = (explicitToken = null) => async (dispatch, getState) => {
  try {
    const loginState = getState().login || {};
    const loginToken = loginState.token;
    const token = explicitToken || loginToken;
    const ownerUserId = loginState.user?._id || loginState.user?.id || null;

    if (!token) {
      return dispatch({ type: 'LOAD_OFFICE_USERS_FAILURE', payload: { message: 'Non authentifie' } });
    }

    const res = await apiClient.get('/api/auth/user/officeUsers', {
      headers: { 'Content-Type': 'application/json' },
    });
    const officeUsersList = res.data.officeUsers;

    if (officeUsersList && officeUsersList.length > 0) {
      dispatch({
        type: 'LOAD_OFFICE_USERS_SUCCESS',
        payload: officeUsersList,
        meta: { ownerUserId },
      });

      let singleUser = officeUsersList.find(user => user.mainOfficeUser === true);
      if (!singleUser) {
        singleUser = officeUsersList[0];
      }

      const sessionOfficeUserId = readActiveOfficeUserId(ownerUserId);
      const legacyOfficeUserId = sessionOfficeUserId ? null : readLegacyOfficeUserId();
      const requestedOfficeUserId = sessionOfficeUserId || legacyOfficeUserId;
      const canonicalSelection = requestedOfficeUserId
        ? officeUsersList.find(user => String(user._id) === String(requestedOfficeUserId))
        : null;

      // Un id de session inconnu ne doit jamais restaurer un objet perime :
      // on retombe sur le main (ou le premier) issu de la reponse serveur.
      if (canonicalSelection) singleUser = canonicalSelection;

      dispatch({
        type: 'CREATE_OFFICE_USER_SUCCESS',
        payload: singleUser,
        meta: { ownerUserId },
      });
      clearLegacyOfficeUserStorage();
    } else {
      console.log('Aucun OfficeUser trouve. Declenchement du formulaire de creation de profil initial.');
      dispatch({
        type: 'INITIAL_OFFICE_USER_SETUP_REQUIRED',
        meta: { ownerUserId },
      });
      clearLegacyOfficeUserStorage();
    }
  } catch (err) {
    dispatch({
      type: 'LOAD_OFFICE_USERS_FAILURE',
      payload: err.response?.data || { message: 'Erreur reseau' },
    });
  }
};

// ========================================================================
// Slice
// ========================================================================

const initialState = {
  officeUser: null,
  officeUsers: [],
  sessionOwnerUserId: null,
  isLoading: false,
  error: null,
  userToDelete: null,
  editMode: false,
  isSetupRequired: false,
};

const officeUserSlice = createSlice({
  name: 'officeUser',
  initialState,
  reducers: {
    selectOfficeUser(state, action) {
      const selected = state.officeUsers.find(user => user._id === action.payload);
      state.officeUser = selected || null;
    },
    setUserToDelete(state, action) {
      state.userToDelete = action.payload;
    },
    setEditMode(state, action) {
      state.editMode = action.payload;
    },
    resetEditMode(state) {
      state.editMode = false;
    },
    resetInitialData(state) {
      state.initialData = {};
    },
  },
  extraReducers: (builder) => {
    builder
      // --- CREATE (string types pour compat cross-slice, ex: loadOfficeUsers dispatch) ---
      .addCase('CREATE_OFFICE_USER_SUCCESS', (state, action) => {
        state.officeUser = action.payload;
        state.sessionOwnerUserId = action.meta?.ownerUserId || state.sessionOwnerUserId;
        state.isSetupRequired = false;
        state.isLoading = false;
        state.error = null;
      })

      // --- LOAD (string types pour loadOfficeUsers thunk classique) ---
      .addCase('LOAD_OFFICE_USERS_SUCCESS', (state, action) => {
        state.officeUsers = action.payload;
        state.sessionOwnerUserId = action.meta?.ownerUserId || state.sessionOwnerUserId;
        state.isLoading = false;
        state.error = null;
      })
      .addCase('LOAD_OFFICE_USERS_FAILURE', (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // --- INITIAL SETUP REQUIRED ---
      .addCase('INITIAL_OFFICE_USER_SETUP_REQUIRED', (state, action) => {
        state.officeUsers = [];
        state.officeUser = null;
        state.sessionOwnerUserId = action.meta?.ownerUserId || state.sessionOwnerUserId;
        state.isSetupRequired = true;
        state.isLoading = false;
      })

      // --- createOfficeUser lifecycle ---
      .addCase(createOfficeUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(createOfficeUser.fulfilled, (state, action) => {
        state.officeUser = action.payload;
        state.isSetupRequired = false;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(createOfficeUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // --- createAdditionalOfficeUser lifecycle ---
      .addCase(createAdditionalOfficeUser.fulfilled, (state, action) => {
        state.isSetupRequired = false;
        state.officeUser = action.payload;
        state.officeUsers.push(action.payload);
        state.isLoading = false;
      })
      .addCase(createAdditionalOfficeUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // --- deleteOfficeUser lifecycle ---
      .addCase(deleteOfficeUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(deleteOfficeUser.fulfilled, (state, action) => {
        const deletedOfficeUserId = String(action.payload || '');
        const deletedActiveProfile = String(state.officeUser?._id || '') === deletedOfficeUserId;
        state.officeUsers = state.officeUsers.filter(
          user => String(user._id) !== deletedOfficeUserId
        );

        if (deletedActiveProfile) {
          // La liste Redux est la copie canonique issue du serveur. Le profil
          // de repli doit provenir de cette liste (jamais d'un ancien objet de
          // localStorage), avec la meme priorite main -> premier que le login.
          state.officeUser = state.officeUsers.find(user => user.mainOfficeUser === true)
            || state.officeUsers[0]
            || null;
        } else if (state.officeUser) {
          // Conserver egalement une reference canonique lorsqu'un autre profil
          // est supprime.
          state.officeUser = state.officeUsers.find(
            user => String(user._id) === String(state.officeUser._id)
          ) || null;
        }

        state.userToDelete = null;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(deleteOfficeUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // --- updateOfficeUser lifecycle ---
      .addCase(updateOfficeUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(updateOfficeUser.fulfilled, (state, action) => {
        const index = state.officeUsers.findIndex(user => user._id === action.payload._id);
        if (index !== -1) {
          state.officeUsers[index] = action.payload;
        }
        if (state.officeUser?._id === action.payload._id) {
          state.officeUser = action.payload;
        }
        state.isSetupRequired = false;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(updateOfficeUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // CORRECTIF : Nettoyer le state officeUser lors du logout/auth_error
      // pour éviter que les données du compte A persistent dans le Redux store
      // quand on se connecte avec le compte B.
      .addCase('LOGOUT', (state) => {
        state.officeUser = null;
        state.officeUsers = [];
        state.sessionOwnerUserId = null;
        state.isSetupRequired = false;
        state.isLoading = false;
        state.error = null;
      })
      .addCase('AUTH_ERROR', (state) => {
        state.officeUser = null;
        state.officeUsers = [];
        state.sessionOwnerUserId = null;
        state.isSetupRequired = false;
        state.isLoading = false;
        state.error = null;
      })
      .addCase('ACCOUNT_DELETED', (state) => {
        state.officeUser = null;
        state.officeUsers = [];
        state.sessionOwnerUserId = null;
        state.isSetupRequired = false;
        state.isLoading = false;
        state.error = null;
      })
      // Le logout RTK reel est `auth/logout`; conserver aussi `LOGOUT`
      // ci-dessus pour la compatibilite avec les anciens dispatchs.
      .addCase('auth/logout', (state) => {
        state.officeUser = null;
        state.officeUsers = [];
        state.sessionOwnerUserId = null;
        state.isSetupRequired = false;
        state.isLoading = false;
        state.error = null;
      });
  },
});

export const {
  selectOfficeUser,
  setUserToDelete,
  setEditMode,
  resetEditMode,
  resetInitialData,
} = officeUserSlice.actions;

// --- Wrapper pour la persistance de la selection dans CETTE fenetre ---
const SESSION_SELECTION_ACTIONS = new Set([
  'CREATE_OFFICE_USER_SUCCESS',
  officeUserSlice.actions.selectOfficeUser.type,
  createOfficeUser.fulfilled.type,
  createAdditionalOfficeUser.fulfilled.type,
  deleteOfficeUser.fulfilled.type,
  updateOfficeUser.fulfilled.type,
]);

const SESSION_RESET_ACTIONS = new Set([
  'LOGOUT',
  'AUTH_ERROR',
  'ACCOUNT_DELETED',
  'auth/logout',
  'INITIAL_OFFICE_USER_SETUP_REQUIRED',
]);

const wrappedReducer = (state, action) => {
  const previousOwnerUserId = state?.sessionOwnerUserId || null;
  const nextState = officeUserSlice.reducer(state, action);

  if (SESSION_RESET_ACTIONS.has(action.type)) {
    clearActiveOfficeUserSession(previousOwnerUserId || nextState.sessionOwnerUserId);
    clearLegacyOfficeUserStorage();
  } else if (SESSION_SELECTION_ACTIONS.has(action.type)) {
    writeActiveOfficeUserId(nextState.sessionOwnerUserId, nextState.officeUser?._id || null);
    clearLegacyOfficeUserStorage();
  }

  return nextState;
};

export default wrappedReducer;
