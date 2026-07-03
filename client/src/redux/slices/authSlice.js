// client/src/redux/slices/authSlice.js
// Fusion de : loginReducer + registerReducer + authActions + loadUser
// Migration RTK Phase 5A

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios'; // Conservé uniquement pour setAuthToken (axios.defaults)
import apiClient from '../../services/apiClient';
// Import statique (remplace les require() dynamiques dans les thunks)
import { loadOfficeUsers } from './officeUserSlice';
import { lockCabinetEncryption } from './encryptionSlice';

// ========================================================================
// Helpers
// ========================================================================

/** Parse sécurisé du localStorage (évite les crashes sur données corrompues) */
const safeJSONParse = (key) => {
  try {
    const item = localStorage.getItem(key);
    if (!item || item === "undefined" || item === "null") {
      localStorage.removeItem(key);
      return null;
    }
    return JSON.parse(item);
  } catch (e) {
    console.warn(`Donnée corrompue dans localStorage (${key}), nettoyage...`);
    localStorage.removeItem(key);
    return null;
  }
};

const setAuthToken = (token) => {
  if (token) {
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common["Authorization"];
  }
};

// ========================================================================
// Async Thunks
// ========================================================================

/**
 * register — Inscription puis chargement automatique de l'utilisateur.
 * Retourne true (succès) ou false (échec) pour le composant appelant.
 */
export const register = createAsyncThunk(
  'auth/register',
  async ({ formData, navigate }, { dispatch, rejectWithValue }) => {
    try {
      const res = await apiClient.post('/api/auth/register', formData);
      // Charger l'utilisateur et naviguer vers le dashboard
      await dispatch(loadUser({ token: res.data.token, rememberMe: false, navigate }));
      return res.data; // { token, ... }
    } catch (err) {
      const message =
        err.response?.status === 400
          ? err.response.data.message
          : "Une erreur est survenue. Veuillez réessayer.";
      return rejectWithValue(message);
    }
  }
);

/**
 * login — Connexion puis chargement automatique de l'utilisateur.
 */
export const login = createAsyncThunk(
  'auth/login',
  async ({ formData, navigate }, { dispatch, rejectWithValue }) => {
    try {
      const { rememberMe, ...credentials } = formData;
      const res = await apiClient.post('/api/auth/login', { ...credentials, rememberMe });
      if (res.status === 200) {
        dispatch(loadUser({ token: res.data.token, rememberMe: res.data.rememberMe, navigate }));
        return res.data;
      }
      return rejectWithValue({ message: res.data.message, status: res.status });
    } catch (err) {
      return rejectWithValue({
        message: err.response?.data?.message || "Erreur de connexion",
        status: err.response?.status,
      });
    }
  }
);

/**
 * checkGoogleSession — Vérifie si l'utilisateur a une session Google valide.
 * @todo Non utilisé par aucun composant actuellement — câbler dans mails ou supprimer.
 */
export const checkGoogleSession = createAsyncThunk(
  'auth/checkGoogleSession',
  async (_, { getState, rejectWithValue }) => {
    try {
      const token = getState().login.token;
      if (!token) throw new Error("Token Kheops non trouvé.");
      const res = await apiClient.get('/api/auth/google/session-status');
      return res.data; // { isLoggedIn: true/false }
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

/**
 * setAccessibilityMode — Définit le mode d'accessibilité (3 niveaux).
 * @param {Object} param - { highContrastMode: boolean, isSpeechEnabled: boolean }
 */
export const setAccessibilityMode = createAsyncThunk(
  'auth/setAccessibilityMode',
  async ({ highContrastMode, isSpeechEnabled }, { getState, rejectWithValue }) => {
    try {
      const token = getState().login.token;
      const res = await apiClient.put('/api/auth/user/settings', {
        highContrastMode, isSpeechEnabled,
      });
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

/**
 * updateBillingSettings — Met à jour les paramètres de facturation.
 */
export const updateBillingSettings = createAsyncThunk(
  'auth/updateBillingSettings',
  async (settings, { getState, rejectWithValue }) => {
    try {
      const token = getState().login.token;
      const res = await apiClient.put('/api/auth/user/settings', settings);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

/**
 * markOnboardingDone — Marque le tour d'onboarding comme terminé côté serveur
 * pour que le mini-tour ne se redéclenche plus à la connexion.
 */
export const markOnboardingDone = createAsyncThunk(
  'auth/markOnboardingDone',
  async (_, { rejectWithValue }) => {
    try {
      const res = await apiClient.post('/api/auth/user/onboarding-done');
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

/**
 * updateProfileSettings — Met à jour le profil avocat (nom, prénom, adresse, ville, téléphone, signature, en-tête, images).
 * Met à jour le state Redux avec la réponse serveur.
 */
export const updateProfileSettings = createAsyncThunk(
  'auth/updateProfileSettings',
  async (settings, { getState, rejectWithValue }) => {
    try {
      const token = getState().login.token;
      const res = await apiClient.put('/api/auth/user/settings', settings);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

/**
 * updateDossierColorPreferences — Met à jour les couleurs des dossiers par
 * type/juridiction. Body : { colors: {tgi:'#hex', ...} } ou { reset: true }.
 */
export const updateDossierColorPreferences = createAsyncThunk(
  'auth/updateDossierColorPreferences',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await apiClient.put('/api/auth/user/dossier-colors', payload);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || err.message);
    }
  }
);

/**
 * verifyEmailToken — Verifie la validite du token email.
 * Retourne true/false sans dispatcher d'action Redux.
 */
export const verifyEmailToken = (token) => async () => {
  try {
    const res = await apiClient.get('/api/auth/verify-email-token');
    return res.status === 200;
  } catch (err) {
    console.error(err);
    return false;
  }
};

/**
 * sendResetPasswordRequest — Envoie un email de reinitialisation de mot de passe.
 */
export const sendResetPasswordRequest = createAsyncThunk(
  'auth/sendResetPasswordRequest',
  async (email, { rejectWithValue }) => {
    try {
      const res = await apiClient.post('/api/auth/reset-password', JSON.stringify({ email }), {
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.status === 200) {
        return { message: 'Email de reinitialisation envoye avec succes', successSendResetPasswordMail: true };
      }
      return rejectWithValue({ message: res.data.message, status: res.status });
    } catch (err) {
      return rejectWithValue({ message: err.response.data.message, status: err.response.status });
    }
  }
);

/**
 * updatePassword — Met a jour le mot de passe avec un token de reinitialisation.
 * Reste un thunk classique car il dispatch loadUser avec navigation.
 */
export const updatePassword = (newPassword, token, navigate) => async (dispatch) => {
  try {
    await apiClient.post('/api/auth/new-password', JSON.stringify({ newPassword }), {
      headers: { 'Content-Type': 'application/json' },
    });
    dispatch(loadUser({ token, rememberMe: false, navigate }));
  } catch (err) {
    console.error('Erreur updatePassword:', err);
  }
};

// ========================================================================
// Nouveau flow : reset password par code 6 chiffres
// ========================================================================

/**
 * requestPasswordResetCode — Etape 1 : demande l'envoi d'un code par email.
 */
export const requestPasswordResetCode = createAsyncThunk(
  'auth/requestPasswordResetCode',
  async (email, { rejectWithValue }) => {
    try {
      const res = await apiClient.post(
        '/api/auth/forgot-password/request-code',
        { email },
        { headers: { 'Content-Type': 'application/json' } }
      );
      return res.data;
    } catch (err) {
      return rejectWithValue({
        message: err.response?.data?.message || 'Erreur reseau.',
        secondsLeft: err.response?.data?.secondsLeft,
        status: err.response?.status,
      });
    }
  }
);

/**
 * verifyPasswordResetCode — Etape 2 : verifie le code 6 chiffres.
 * Retourne { resetToken } si succes (a passer a l'etape 3).
 */
export const verifyPasswordResetCode = createAsyncThunk(
  'auth/verifyPasswordResetCode',
  async ({ email, code }, { rejectWithValue }) => {
    try {
      const res = await apiClient.post(
        '/api/auth/forgot-password/verify-code',
        { email, code },
        { headers: { 'Content-Type': 'application/json' } }
      );
      return res.data; // { resetToken }
    } catch (err) {
      return rejectWithValue({
        message: err.response?.data?.message || 'Code invalide.',
        attemptsLeft: err.response?.data?.attemptsLeft,
        status: err.response?.status,
      });
    }
  }
);

/**
 * completePasswordReset — Etape 3 : applique le nouveau mot de passe et auto-login.
 * Recoit le resetToken obtenu a l'etape 2, plus le nouveau mot de passe.
 * En cas de succes, dispatch loadUser pour auto-connecter l'utilisateur.
 */
export const completePasswordReset = createAsyncThunk(
  'auth/completePasswordReset',
  async ({ resetToken, newPassword, navigate }, { dispatch, rejectWithValue }) => {
    try {
      const res = await apiClient.post(
        '/api/auth/forgot-password/set-new-password',
        { resetToken, newPassword },
        { headers: { 'Content-Type': 'application/json' } }
      );
      const sessionToken = res.data.token;
      // Auto-login : charge le user et redirige vers /dashboard
      await dispatch(loadUser({ token: sessionToken, rememberMe: false, navigate }));
      return { token: sessionToken };
    } catch (err) {
      return rejectWithValue({
        message: err.response?.data?.message || 'Erreur lors de la mise a jour du mot de passe.',
        status: err.response?.status,
      });
    }
  }
);

// ========================================================================
// Thunks classiques (logique complexe avec navigation / dispatch multiples)
// ========================================================================

/**
 * loadUser — Charge l'utilisateur depuis le backend avec le token JWT.
 * Reste un thunk classique car il dispatch vers d'autres slices (SET_MAIN_USER, loadOfficeUsers).
 */
export const loadUser = ({ token: newToken, rememberMe, navigate }) => async (dispatch, getState) => {
  const token = newToken || getState().login.token;

  if (token) {
    setAuthToken(token);
    localStorage.setItem('token', token);
    // Mettre le token dans le store Redux IMMÉDIATEMENT pour que l'intercepteur
    // d'apiClient (qui lit store.getState().login.token) puisse l'utiliser
    dispatch({ type: 'SET_TOKEN', payload: token });
  }

  try {
    const res = await apiClient.get('/api/auth/user', {
      params: { rememberMe },
    });

    // Le serveur renvoie l'objet user directement (res.json(user))
    // Compatibilité : supporte { user: {...} } ET l'objet user directement
    const userData = res.data.user || res.data;

    // Comparaison avec l'utilisateur précédent
    const oldUserString = localStorage.getItem('user');
    if (oldUserString) {
      try {
        const oldUser = JSON.parse(oldUserString);
        if (oldUser && oldUser._id !== userData._id) {
          localStorage.clear();
          localStorage.setItem('token', token);
        }
      } catch (e) {
        localStorage.clear();
        localStorage.setItem('token', token);
      }
    }

    localStorage.setItem('user', JSON.stringify(userData));

    // Connexion reussie : on retire le flag de deconnexion volontaire pour
    // que le mode BYPASS_AUTH retrouve son comportement par defaut (utile
    // si l'utilisateur s'etait deconnecte puis reconnecte dans la meme
    // session).
    try { localStorage.removeItem('kheopsLoggedOut'); } catch (_e) {}

    if (navigate) {
      navigate('/dashboard');
    }

    dispatch({
      type: "USER_LOADED",
      payload: { user: userData, isAuthenticated: true, token }
    });

    // Dispatch cross-slice pour le dossierInfoReducer
    dispatch({ type: 'SET_MAIN_USER', payload: userData });

    // Charger les office users
    dispatch(loadOfficeUsers(token));

    // Demander à Electron d'initialiser le cloud + lancer la synchro initiale.
    // Idempotent côté main : skip si un cloud est déjà actif (deep-link, session
    // sauvegardée). Couvre principalement le scénario "login email/password sur
    // un PC neuf où le compte est déjà lié à Google/Microsoft sur un autre PC".
    if (window.electron && typeof window.electron.requestCloudSync === 'function') {
      window.electron.requestCloudSync(token).catch(() => { /* échec silencieux côté UI */ });
    }

    // Transmettre le userId Kheops (et l'email Kheops) au main process pour
    // qu'il bascule l'isolation locale des fichiers sur `<basePath>/<userId>/`
    // (au lieu de `<basePath>/<email_compte_cloud>/`). Permet à un même user
    // qui s'authentifie via plusieurs comptes cloud de retrouver tous ses
    // documents au même endroit, et garantit l'étanchéité multi-user sur un
    // même PC. Voir configManager.migrateToUserId pour les détails de migration.
    if (window.electron && typeof window.electron.setUserContext === 'function' && userData && userData._id) {
      try {
        window.electron.setUserContext({ userId: String(userData._id), email: userData.email || null });
      } catch (_e) { /* échec silencieux côté UI */ }
    }
  } catch (err) {
    console.error("Auth Error in loadUser:", err);
    dispatch({ type: "AUTH_ERROR" });
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
};

/**
 * loadUserFromLocalStorage — Restaure la session depuis le localStorage au démarrage.
 */
export const loadUserFromLocalStorage = () => (dispatch) => {
  const token = localStorage.getItem('token');
  const userFromStorage = localStorage.getItem('user');
  const user = (userFromStorage && userFromStorage !== "undefined") ? JSON.parse(userFromStorage) : null;

  if (token && user) {
    // Session complète en localStorage — restauration immédiate
    dispatch({
      type: 'USER_LOADED',
      payload: { isAuthenticated: true, token, user },
    });
    dispatch({ type: 'SET_MAIN_USER', payload: user });
    dispatch(loadOfficeUsers(token));

    // Transmettre userId Kheops au main pour basculer l'isolation locale
    // sur `<basePath>/<userId>/` dès la restauration de session (sans
    // attendre un nouveau login OAuth).
    if (window.electron && typeof window.electron.setUserContext === 'function' && user && user._id) {
      try {
        window.electron.setUserContext({ userId: String(user._id), email: user.email || null });
      } catch (_e) { /* échec silencieux */ }
    }

    // Au redémarrage avec session restaurée : si le main process n'a pas pu
    // re-init le cloud automatiquement (ex: pas de session OAuth Google sauvée
    // localement sur ce PC), on lui demande de tenter via le refresh_token serveur.
    if (window.electron && typeof window.electron.requestCloudSync === 'function') {
      window.electron.requestCloudSync(token).catch(() => { /* échec silencieux */ });
    }
  } else if (token && !user) {
    // Token présent mais pas de user (ex: retour deep link Google OAuth)
    // → charger le user depuis l'API
    dispatch(loadUser({ token, rememberMe: true }));
  } else {
    dispatch({ type: 'AUTH_ERROR' });
  }
};

/**
 * performLogout — Deconnexion COMPLETE et centralisee.
 *
 * Regroupe en un seul endroit ce qui etait auparavant duplique entre le menu
 * principal (mainUserModal) et la modale de phrase secrete. Ordre des
 * operations :
 *   1. Verrouille le cabinet : oublie la MasterKey en RAM ET sur disque
 *      (removeDisk:true). Decision produit "poste partage" — aucune cle ne
 *      doit subsister apres deconnexion sur un PC de cabinet, sinon
 *      l'utilisateur suivant pourrait acceder aux donnees du precedent.
 *      C'est la separation stricte auth/chiffrement (la session se ferme,
 *      la cle disparait). Sans effet tant que le chiffrement est desactive.
 *   2. Deconnecte la session cloud Electron (Microsoft ou Google), best-effort.
 *   3. Vide le JWT + le localStorage et repasse isAuthenticated=false (logout()).
 *   4. Redirige vers l'ecran de login si un navigate est fourni.
 *
 * Tous les appels Electron/crypto sont gardes : ils ne peuvent JAMAIS empecher
 * la deconnexion (regle UX absolue — ne jamais pieger l'utilisateur).
 *
 * @param {object} [opts]
 * @param {function} [opts.navigate]  react-router navigate, pour revenir a '/'
 */
export const performLogout = ({ navigate } = {}) => async (dispatch, getState) => {
  const user = getState().login && getState().login.user;
  const isMicrosoftUser = !!(user && user.microsoftRefreshToken);

  // 1. Verrouiller le cabinet (best-effort, ne bloque jamais la deconnexion).
  try {
    await dispatch(lockCabinetEncryption({ removeDisk: true }));
  } catch (_e) { /* best-effort */ }

  // 2. Deconnexion cloud Electron (best-effort, gardee).
  try {
    if (isMicrosoftUser) {
      if (window.electronAPI && window.electronAPI.logoutMicrosoft) {
        await window.electronAPI.logoutMicrosoft();
      }
    } else if (window.electronAPI && window.electronAPI.logoutGoogle) {
      await window.electronAPI.logoutGoogle();
    }
  } catch (_e) { /* best-effort */ }

  // 3. Deconnexion Kheops (JWT + localStorage).
  dispatch(logout());

  // 4. Retour a l'ecran de login.
  if (navigate) navigate('/');
};

// ========================================================================
// Slice
// ========================================================================

const initialState = {
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  loading: true,
  user: safeJSONParse('user'),
  error: null,
  successSendResetPasswordMail: false,
  resetPasswordError: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      // Marqueur de deconnexion volontaire : empeche le BYPASS_AUTH (mode
      // dev) de re-injecter automatiquement le token et de rediriger vers
      // le dashboard. Stocke en localStorage pour survivre a un redemarrage
      // de l'app — sinon, fermer/rouvrir Kheops 2 reactiverait l'auto-login
      // bypass et l'utilisateur ne pourrait jamais se connecter avec un autre
      // compte. Le flag est efface a la prochaine connexion reussie (loadUser).
      try { localStorage.setItem('kheopsLoggedOut', '1'); } catch (_e) {}

      // Nettoyage complet de TOUT le localStorage pour éviter les données
      // résiduelles lors d'un changement de compte Google
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('officeUser');
      localStorage.removeItem('officeUsers');
      localStorage.removeItem('currentDossierState');
      localStorage.removeItem('lastDossiersState');
      localStorage.removeItem('dossierInfoState');
      localStorage.removeItem('contactFormData');
      localStorage.removeItem('currentTypeContact');
      localStorage.removeItem('alternativeCurrentTypeContact');
      localStorage.removeItem('layoutFormContactState');
      localStorage.removeItem('readNotificationIds');
      localStorage.removeItem('partieData');
      localStorage.removeItem('partieEditData');
      localStorage.removeItem('personneChargeData');
      localStorage.removeItem('cachedKheopsEmails');
      localStorage.removeItem('cachedKheopsNextPageToken');
      localStorage.removeItem('cachedKheopsHasMoreEmails');
      localStorage.removeItem('cachedKheopsEmailsAt');
      state.token = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.user = null;
      state.error = null;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // --- SET_TOKEN (dispatché par loadUser avant la requête API) ---
    builder.addCase('SET_TOKEN', (state, action) => {
      state.token = action.payload;
    });

    // --- USER_LOADED (dispatché par loadUser / loadUserFromLocalStorage) ---
    builder.addCase('USER_LOADED', (state, action) => {
      const payload = action.payload;
      state.isAuthenticated = true;
      state.loading = false;
      state.user = payload?.user ? payload.user : (payload?.data ? payload.data : payload);
      state.token = payload?.token || state.token;
    });

    // --- AUTH_ERROR ---
    builder.addCase('AUTH_ERROR', (state) => {
      // Nettoyage complet pour éviter données résiduelles
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('officeUser');
      localStorage.removeItem('officeUsers');
      localStorage.removeItem('currentDossierState');
      localStorage.removeItem('lastDossiersState');
      localStorage.removeItem('dossierInfoState');
      localStorage.removeItem('cachedKheopsEmails');
      localStorage.removeItem('cachedKheopsNextPageToken');
      localStorage.removeItem('cachedKheopsHasMoreEmails');
      localStorage.removeItem('cachedKheopsEmailsAt');
      state.token = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.user = null;
    });

    // --- register ---
    builder.addCase(register.fulfilled, (state, action) => {
      if (action.payload?.token) {
        localStorage.setItem('token', action.payload.token);
        state.token = action.payload.token;
      }
      state.isAuthenticated = true;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(register.rejected, (state, action) => {
      localStorage.removeItem('token');
      state.token = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.user = null;
      state.error = action.payload;
    });

    // --- login ---
    builder.addCase(login.rejected, (state, action) => {
      state.token = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.user = null;
      state.error = action.payload;
    });

    // --- sendResetPasswordRequest ---
    builder.addCase(sendResetPasswordRequest.fulfilled, (state, action) => {
      state.successSendResetPasswordMail = action.payload.successSendResetPasswordMail;
      state.resetPasswordError = null;
    });
    builder.addCase(sendResetPasswordRequest.rejected, (state, action) => {
      state.successSendResetPasswordMail = false;
      state.resetPasswordError = action.payload;
    });

    // --- LOGOUT / ACCOUNT_DELETED (compatibilité cross-slice) ---
    // --- updateProfileSettings ---
    builder.addCase(updateProfileSettings.fulfilled, (state, action) => {
      if (action.payload) {
        state.user = action.payload;
        localStorage.setItem('user', JSON.stringify(action.payload));
      }
    });

    // --- setAccessibilityMode ---
    builder.addCase(setAccessibilityMode.fulfilled, (state, action) => {
      if (action.payload) {
        state.user = action.payload;
        localStorage.setItem('user', JSON.stringify(action.payload));
      }
    });
    builder.addCase(setAccessibilityMode.rejected, (state, action) => {
      console.error('[setAccessibilityMode] Erreur:', action.payload);
    });

    // --- updateBillingSettings ---
    builder.addCase(updateBillingSettings.fulfilled, (state, action) => {
      if (action.payload) {
        state.user = action.payload;
        localStorage.setItem('user', JSON.stringify(action.payload));
      }
    });

    // --- markOnboardingDone ---
    builder.addCase(markOnboardingDone.fulfilled, (state, action) => {
      if (action.payload) {
        state.user = action.payload;
        localStorage.setItem('user', JSON.stringify(action.payload));
      } else if (state.user) {
        // Optimistic fallback : si le serveur ne renvoie pas l'objet user,
        // on flippe quand même le flag local pour éviter une boucle.
        state.user = { ...state.user, onboardingDone: true };
        localStorage.setItem('user', JSON.stringify(state.user));
      }
    });
    builder.addCase(markOnboardingDone.rejected, (state, action) => {
      console.error('[markOnboardingDone] Erreur:', action.payload);
    });

    // --- updateDossierColorPreferences ---
    builder.addCase(updateDossierColorPreferences.fulfilled, (state, action) => {
      if (action.payload) {
        state.user = action.payload;
        localStorage.setItem('user', JSON.stringify(action.payload));
      }
    });
    builder.addCase(updateDossierColorPreferences.rejected, (state, action) => {
      console.error('[updateDossierColorPreferences] Erreur:', action.payload);
    });

    builder.addCase('LOGOUT', (state) => {
      // Nettoyage complet de TOUT le localStorage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('officeUser');
      localStorage.removeItem('officeUsers');
      localStorage.removeItem('currentDossierState');
      localStorage.removeItem('lastDossiersState');
      localStorage.removeItem('dossierInfoState');
      localStorage.removeItem('contactFormData');
      localStorage.removeItem('currentTypeContact');
      localStorage.removeItem('alternativeCurrentTypeContact');
      localStorage.removeItem('layoutFormContactState');
      localStorage.removeItem('readNotificationIds');
      localStorage.removeItem('partieData');
      localStorage.removeItem('partieEditData');
      localStorage.removeItem('personneChargeData');
      localStorage.removeItem('cachedKheopsEmails');
      localStorage.removeItem('cachedKheopsNextPageToken');
      localStorage.removeItem('cachedKheopsHasMoreEmails');
      localStorage.removeItem('cachedKheopsEmailsAt');
      state.token = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.user = null;
      state.error = null;
    });
    builder.addCase('ACCOUNT_DELETED', (state) => {
      // Nettoyage complet de TOUT le localStorage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('officeUser');
      localStorage.removeItem('officeUsers');
      localStorage.removeItem('currentDossierState');
      localStorage.removeItem('lastDossiersState');
      localStorage.removeItem('dossierInfoState');
      localStorage.removeItem('cachedKheopsEmails');
      localStorage.removeItem('cachedKheopsNextPageToken');
      localStorage.removeItem('cachedKheopsHasMoreEmails');
      localStorage.removeItem('cachedKheopsEmailsAt');
      state.token = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.user = null;
    });
  },
});

export const { logout, clearError } = authSlice.actions;
export default authSlice.reducer;
