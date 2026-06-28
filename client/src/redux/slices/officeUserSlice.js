// officeUserSlice.js — migre depuis officeUserReducer/officeUserReducer.js
// Phase 9A : logique migree depuis officeUserActions.js + loadUser.js
// Persistance : wrapper pattern (localStorage read a l'init, write apres chaque dispatch)
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';

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
 * et gere la logique localStorage + INITIAL_OFFICE_USER_SETUP_REQUIRED.
 */
export const loadOfficeUsers = (explicitToken = null) => async (dispatch, getState) => {
  try {
    const loginToken = getState().login.token;
    const token = explicitToken || loginToken;

    if (!token) {
      return dispatch({ type: 'LOAD_OFFICE_USERS_FAILURE', payload: { message: 'Non authentifie' } });
    }

    const res = await apiClient.get('/api/auth/user/officeUsers', {
      headers: { 'Content-Type': 'application/json' },
    });
    const officeUsersList = res.data.officeUsers;

    if (officeUsersList && officeUsersList.length > 0) {
      dispatch({ type: 'LOAD_OFFICE_USERS_SUCCESS', payload: officeUsersList });

      let singleUser = officeUsersList.find(user => user.mainOfficeUser === true);
      if (!singleUser) {
        singleUser = officeUsersList[0];
      }

      const localStorageOfficeUser = localStorage.getItem('officeUser');
      if (localStorageOfficeUser) {
        try {
          const parsedOfficeUser = JSON.parse(localStorageOfficeUser);
          if (officeUsersList.some(u => u._id === parsedOfficeUser._id)) {
            singleUser = parsedOfficeUser;
          }
        } catch (e) {
          console.error('Erreur parsing officeUser depuis localStorage');
        }
      }

      dispatch({ type: 'CREATE_OFFICE_USER_SUCCESS', payload: singleUser });
    } else {
      console.log('Aucun OfficeUser trouve. Declenchement du formulaire de creation de profil initial.');
      dispatch({ type: 'INITIAL_OFFICE_USER_SETUP_REQUIRED' });
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

const officeUserFromStorage = localStorage.getItem('officeUser');
const officeUsersFromStorage = localStorage.getItem('officeUsers');

const initialState = {
  officeUser: (officeUserFromStorage && officeUserFromStorage !== "undefined") ? JSON.parse(officeUserFromStorage) : null,
  officeUsers: (officeUsersFromStorage && officeUsersFromStorage !== "undefined") ? JSON.parse(officeUsersFromStorage) : [],
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
        state.isSetupRequired = false;
        state.isLoading = false;
        state.error = null;
      })

      // --- LOAD (string types pour loadOfficeUsers thunk classique) ---
      .addCase('LOAD_OFFICE_USERS_SUCCESS', (state, action) => {
        state.officeUsers = action.payload;
        state.isLoading = false;
        state.error = null;
      })
      .addCase('LOAD_OFFICE_USERS_FAILURE', (state, action) => {
        state.isLoading = false;
        state.error = action.payload;
      })

      // --- INITIAL SETUP REQUIRED ---
      .addCase('INITIAL_OFFICE_USER_SETUP_REQUIRED', (state) => {
        state.officeUsers = [];
        state.officeUser = null;
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
        state.officeUsers = state.officeUsers.filter(user => user._id !== action.payload);
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
        state.isSetupRequired = false;
        state.isLoading = false;
        state.error = null;
      })
      .addCase('AUTH_ERROR', (state) => {
        state.officeUser = null;
        state.officeUsers = [];
        state.isSetupRequired = false;
        state.isLoading = false;
        state.error = null;
      })
      .addCase('ACCOUNT_DELETED', (state) => {
        state.officeUser = null;
        state.officeUsers = [];
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

// --- Wrapper pour la persistance localStorage ---
const PERSIST_ACTIONS = new Set([
  'CREATE_OFFICE_USER_SUCCESS',
  'LOAD_OFFICE_USERS_SUCCESS',
  'LOGOUT',
  'AUTH_ERROR',
  'ACCOUNT_DELETED',
  officeUserSlice.actions.selectOfficeUser.type,
  createOfficeUser.fulfilled.type,
  createAdditionalOfficeUser.fulfilled.type,
  deleteOfficeUser.fulfilled.type,
  updateOfficeUser.fulfilled.type,
]);

const wrappedReducer = (state, action) => {
  const nextState = officeUserSlice.reducer(state, action);

  if (PERSIST_ACTIONS.has(action.type)) {
    try {
      localStorage.setItem('officeUser', JSON.stringify(nextState.officeUser));
      localStorage.setItem('officeUsers', JSON.stringify(nextState.officeUsers));
    } catch (e) {
      console.error('Erreur localStorage officeUser:', e);
    }
  }

  return nextState;
};

export default wrappedReducer;
