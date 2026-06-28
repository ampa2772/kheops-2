// client/src/redux/slices/encryptionSlice.js
//
// State Redux pour le module Chiffrement E2E (lot 3b).
//
// Structure d'etat :
//   status            : 'unknown' | 'not_configured' | 'configured_locked' | 'unlocked' | 'reminded_later'
//   salt              : sel public du cabinet (hex 32), null si pas configure
//   verifier          : verifier serveur (hex 64), null si pas configure
//   enabledAt         : date d'activation
//   isUnlocked        : booleen (la MasterKey est-elle en RAM cote main process ?)
//   wordlistIsPlaceholder : true tant que la wordlist Diceware FR de 7776 mots
//                       n'a pas remplace le placeholder
//   safeStorageAvailable: la persistance Windows DPAPI est-elle dispo ?
//
// Les operations sensibles (generation, derivation, chiffrement) passent par
// `window.electron.crypto.*` (IPC vers main process). Ce slice ne contient
// JAMAIS la MasterKey ni la phrase secrete.
//
// Voir DESIGN_CHIFFREMENT_E2E.md sections 6 et 7.

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import encryptionApi from '../../services/encryptionService';

// ========================================================================
// Helpers locaux
// ========================================================================

// Acces a l'API IPC exposee par preload.js. Renvoie null si pas en Electron
// (ex : mode dev pur dans un navigateur — non supporte pour le chiffrement).
function getElectronCrypto() {
  if (typeof window === 'undefined') return null;
  return window.electron && window.electron.crypto ? window.electron.crypto : null;
}

// ========================================================================
// Thunks
// ========================================================================

/**
 * Recupere depuis le serveur l'etat de configuration de chiffrement du
 * cabinet ET interroge le main process pour savoir si une MasterKey est
 * deja en RAM (cas Kheops redemarre apres avoir ete unlocke + persiste).
 *
 * Resultat dispatche : { enabled, salt, verifier, enabledAt, isUnlocked }
 */
export const fetchEncryptionStatus = createAsyncThunk(
  'encryption/fetchStatus',
  async (_arg, { rejectWithValue }) => {
    try {
      const serverInfo = await encryptionApi.getInfo();

      const crypto = getElectronCrypto();
      let mainStatus = { isUnlocked: false, ownerUserId: null, wordlistIsPlaceholder: false };
      let safeStorageAvailable = false;

      if (crypto) {
        // Pousser l'état serveur `enabled` vers le main process AVANT toute
        // opération d'upload. Indispensable pour que les uploads sachent
        // refuser proprement quand cabinet protégé mais machine verrouillée
        // (audit S25 chantier #1, décision D1).
        try {
          if (typeof crypto.setProtectionEnabled === 'function') {
            await crypto.setProtectionEnabled(!!serverInfo.encryption.enabled);
          }
        } catch (_) { /* best-effort : ne pas casser le fetch si le bridge IPC est absent */ }

        const s = await crypto.getStatus();
        if (s && s.ok && s.status) mainStatus = s.status;
        const ss = await crypto.safeStorageAvailable();
        if (ss && ss.ok) safeStorageAvailable = !!ss.available;
      }

      return {
        enabled: serverInfo.encryption.enabled,
        salt: serverInfo.encryption.salt,
        verifier: serverInfo.encryption.verifier,
        enabledAt: serverInfo.encryption.enabledAt,
        version: serverInfo.encryption.version,
        isUnlocked: mainStatus.isUnlocked,
        wordlistIsPlaceholder: mainStatus.wordlistIsPlaceholder,
        safeStorageAvailable,
      };
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message || 'Erreur de chargement.');
    }
  }
);

/**
 * Setup initial : genere une phrase, derive la MasterKey, calcule le
 * verifier, envoie { salt, verifier } au serveur, puis persiste via
 * safeStorage si demande.
 *
 * @param {object} args
 * @param {string} args.passphrase         la phrase choisie par l'utilisateur
 * @param {string} args.ownerUserId        userId du compte principal du cabinet
 * @param {boolean} args.persistLocally    persister via safeStorage (par defaut true)
 */
export const setupCabinetEncryption = createAsyncThunk(
  'encryption/setupCabinet',
  async ({ passphrase, ownerUserId, persistLocally = true }, { rejectWithValue }) => {
    const crypto = getElectronCrypto();
    if (!crypto) {
      return rejectWithValue('Chiffrement indisponible en dehors de l\'application desktop.');
    }
    try {
      // 1. Derivation locale (main process)
      const setup = await crypto.setupNewCabinet({ passphrase, ownerUserId });
      if (!setup || !setup.ok) {
        return rejectWithValue(setup?.error || 'Echec de la derivation locale.');
      }

      // 2. Envoi au serveur
      const serverRes = await encryptionApi.setup({
        salt: setup.salt,
        verifier: setup.verifier,
      });

      // 3. Persistance locale (best-effort)
      let persisted = false;
      if (persistLocally) {
        const p = await crypto.persistMasterKey();
        persisted = !!(p && p.ok);
      }

      return {
        enabled: serverRes.encryption.enabled,
        salt: serverRes.encryption.salt,
        verifier: serverRes.encryption.verifier,
        enabledAt: serverRes.encryption.enabledAt,
        version: serverRes.encryption.version,
        isUnlocked: true,
        persistedLocally: persisted,
      };
    } catch (e) {
      return rejectWithValue(e?.response?.data?.message || e.message || 'Erreur lors de la configuration.');
    }
  }
);

/**
 * Deverrouille un cabinet existant : recupere salt+verifier depuis le
 * serveur (si pas deja dans le state), demande au main de deriver la
 * MasterKey et de comparer le verifier, puis persiste localement.
 */
export const unlockCabinetEncryption = createAsyncThunk(
  'encryption/unlockCabinet',
  async ({ passphrase, ownerUserId, persistLocally = true }, { getState, rejectWithValue }) => {
    const crypto = getElectronCrypto();
    if (!crypto) {
      return rejectWithValue('Chiffrement indisponible en dehors de l\'application desktop.');
    }
    const state = getState().encryption || {};
    let salt = state.salt;
    let verifier = state.verifier;
    if (!salt || !verifier) {
      try {
        const info = await encryptionApi.getInfo();
        salt = info.encryption.salt;
        verifier = info.encryption.verifier;
      } catch (e) {
        return rejectWithValue('Impossible de recuperer la configuration de protection.');
      }
    }
    if (!salt || !verifier) {
      return rejectWithValue('Aucune protection configuree pour ce cabinet.');
    }
    try {
      const unlock = await crypto.unlockCabinet({
        passphrase,
        saltHex: salt,
        expectedVerifier: verifier,
        ownerUserId,
      });
      if (!unlock || !unlock.ok) {
        return rejectWithValue(unlock?.error || 'La phrase secrete ne correspond pas.');
      }
      let persisted = false;
      if (persistLocally) {
        const p = await crypto.persistMasterKey();
        persisted = !!(p && p.ok);
      }
      return { isUnlocked: true, persistedLocally: persisted };
    } catch (e) {
      return rejectWithValue(e?.message || 'Erreur lors du deverrouillage.');
    }
  }
);

/**
 * Tente de recharger la MasterKey depuis safeStorage au demarrage de l'app.
 * Echoue silencieusement si pas de cle persistee — c'est attendu (premier
 * lancement sur la machine).
 */
export const tryRestoreMasterKey = createAsyncThunk(
  'encryption/tryRestore',
  async (ownerUserId, { rejectWithValue }) => {
    const crypto = getElectronCrypto();
    if (!crypto) return { restored: false, reason: 'no-electron' };
    if (!ownerUserId) return { restored: false, reason: 'no-owner' };
    const res = await crypto.loadMasterKeyFromDisk(ownerUserId);
    if (res && res.ok) return { restored: true };
    return { restored: false, reason: res?.error || 'unknown' };
  }
);

/**
 * Verrouille le cabinet (oublie la MasterKey en RAM). Si removeDisk=true,
 * supprime aussi le fichier safeStorage — l'utilisateur devra ressaisir la
 * phrase au prochain unlock.
 */
export const lockCabinetEncryption = createAsyncThunk(
  'encryption/lock',
  async ({ removeDisk = false } = {}, { rejectWithValue }) => {
    const crypto = getElectronCrypto();
    if (!crypto) return { ok: true };
    await crypto.forgetMasterKey({ removeDisk });
    return { ok: true, removedDisk: !!removeDisk };
  }
);

// ========================================================================
// Slice
// ========================================================================

const initialState = {
  status: 'unknown',                              // unknown | not_configured | configured_locked | unlocked | reminded_later
  enabled: false,
  salt: null,
  verifier: null,
  enabledAt: null,
  version: null,
  isUnlocked: false,
  wordlistIsPlaceholder: false,
  safeStorageAvailable: false,
  loading: false,
  error: null,
  // UI flags
  reminderDismissed: false,                       // utilisateur a clique "Plus tard"
};

function deriveStatus(state) {
  if (!state.enabled) return state.reminderDismissed ? 'reminded_later' : 'not_configured';
  if (state.isUnlocked) return 'unlocked';
  return 'configured_locked';
}

const encryptionSlice = createSlice({
  name: 'encryption',
  initialState,
  reducers: {
    dismissReminder(state) {
      state.reminderDismissed = true;
      state.status = deriveStatus(state);
    },
    resetReminder(state) {
      state.reminderDismissed = false;
      state.status = deriveStatus(state);
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEncryptionStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEncryptionStatus.fulfilled, (state, action) => {
        const p = action.payload;
        state.loading = false;
        state.enabled = !!p.enabled;
        state.salt = p.salt;
        state.verifier = p.verifier;
        state.enabledAt = p.enabledAt;
        state.version = p.version;
        state.isUnlocked = !!p.isUnlocked;
        state.wordlistIsPlaceholder = !!p.wordlistIsPlaceholder;
        state.safeStorageAvailable = !!p.safeStorageAvailable;
        state.status = deriveStatus(state);
      })
      .addCase(fetchEncryptionStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Erreur de chargement.';
      })

      .addCase(setupCabinetEncryption.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(setupCabinetEncryption.fulfilled, (state, action) => {
        const p = action.payload;
        state.loading = false;
        state.enabled = !!p.enabled;
        state.salt = p.salt;
        state.verifier = p.verifier;
        state.enabledAt = p.enabledAt;
        state.version = p.version;
        state.isUnlocked = !!p.isUnlocked;
        state.reminderDismissed = false;
        state.status = deriveStatus(state);
      })
      .addCase(setupCabinetEncryption.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Echec de la configuration.';
      })

      .addCase(unlockCabinetEncryption.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(unlockCabinetEncryption.fulfilled, (state) => {
        state.loading = false;
        state.isUnlocked = true;
        state.status = deriveStatus(state);
      })
      .addCase(unlockCabinetEncryption.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Echec du deverrouillage.';
      })

      .addCase(tryRestoreMasterKey.fulfilled, (state, action) => {
        if (action.payload && action.payload.restored) {
          state.isUnlocked = true;
          state.status = deriveStatus(state);
        }
      })

      .addCase(lockCabinetEncryption.fulfilled, (state) => {
        state.isUnlocked = false;
        state.status = deriveStatus(state);
      });
  },
});

export const { dismissReminder, resetReminder, clearError } = encryptionSlice.actions;
export default encryptionSlice.reducer;
