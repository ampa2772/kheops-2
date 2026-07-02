// client/src/hooks/useCabinetCrypto.js
//
// Hook React qui expose une API unifiee pour le chiffrement E2E du cabinet
// aux composants UI : modale d'enrolement, modale de deverrouillage,
// onglet Securite dans Parametres, banniere de rappel, etc.
//
// Le hook orchestre trois mondes :
//   - IPC Electron (window.electron.crypto.*)            -> module @kheops/crypto
//   - REST serveur (encryptionService)                   -> /api/encryption/*
//   - Redux slice (encryption)                           -> etat global
//
// Voir DESIGN_CHIFFREMENT_E2E.md sections 6 et 7.

import { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchEncryptionStatus,
  setupCabinetEncryption,
  unlockCabinetEncryption,
  lockCabinetEncryption,
  tryRestoreMasterKey,
  dismissReminder,
  resetReminder,
  clearError,
} from '../redux/slices/encryptionSlice';
// Helper centralise d'acces aux methodes IPC crypto (null hors Electron).
import { getElectronCrypto } from '../services/electronBridge';

/**
 * Hook principal du module Chiffrement.
 *
 * @param {object} [options]
 * @param {boolean} [options.autoFetch=true]    declenche fetchStatus au mount
 * @returns {object} API du hook
 */
export default function useCabinetCrypto(options = {}) {
  const { autoFetch = true } = options;
  const dispatch = useDispatch();

  // Lecture du state encryption
  const state = useSelector((s) => s.encryption || {});
  // ownerUserId : l'_id User Mongo du compte principal du cabinet, derive
  // de l'auth Redux. Selon le pattern existant : state.login.user._id ou
  // similar. On essaie plusieurs chemins pour ne pas dependre d'un nom precis.
  const ownerUserId = useSelector((s) => {
    const u = s.login && (s.login.user || s.login.profile);
    if (u && (u._id || u.id)) return String(u._id || u.id);
    // Fallback : decoder le JWT
    const token = s.login && s.login.token;
    if (token && typeof token === 'string') {
      try {
        const payload = JSON.parse(
          decodeURIComponent(
            atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          )
        );
        return payload && (payload.id || payload.userId)
          ? String(payload.id || payload.userId)
          : null;
      } catch (_) {
        return null;
      }
    }
    return null;
  });

  // Fetch initial au mount
  useEffect(() => {
    if (autoFetch) {
      dispatch(fetchEncryptionStatus());
    }
  }, [autoFetch, dispatch]);

  // Tentative de restauration de la MasterKey via safeStorage des qu'on
  // connait l'ownerUserId. Idempotent : sans effet si deja unlocked.
  useEffect(() => {
    if (!ownerUserId) return;
    if (state.isUnlocked) return;
    dispatch(tryRestoreMasterKey(ownerUserId));
  }, [ownerUserId, state.isUnlocked, dispatch]);

  // ----------------------------------------------------------------
  // API exposee aux composants
  // ----------------------------------------------------------------

  /**
   * Genere une proposition de phrase secrete cote main process. La phrase
   * est ramenee en clair au renderer pour affichage a l'utilisateur, mais
   * n'est pas memoires globale (le composant l'affiche puis l'oublie).
   *
   * @param {number} [wordCount=6]
   * @returns {Promise<{ ok, passphrase?, error? }>}
   */
  const proposePassphrase = useCallback(async (wordCount = 6) => {
    const crypto = getElectronCrypto();
    if (!crypto) return { ok: false, error: 'Module crypto indisponible.' };
    return crypto.generatePassphrase(wordCount);
  }, []);

  /**
   * Validation locale (synchrone cote main) d'une phrase saisie.
   * Ne deverrouille pas, sert juste a donner un feedback "bonne forme".
   */
  const validatePassphrase = useCallback(async (passphrase) => {
    const crypto = getElectronCrypto();
    if (!crypto) return { valid: false, error: 'Module crypto indisponible.' };
    return crypto.validatePassphrase(passphrase);
  }, []);

  /**
   * Configure pour la premiere fois la protection du cabinet (situation A).
   */
  const setupCabinet = useCallback(
    async ({ passphrase, persistLocally = true } = {}) => {
      if (!ownerUserId) {
        return { ok: false, error: 'Identifiant cabinet inconnu, reconnectez-vous.' };
      }
      const action = await dispatch(
        setupCabinetEncryption({ passphrase, ownerUserId, persistLocally })
      );
      if (setupCabinetEncryption.fulfilled.match(action)) {
        return { ok: true, payload: action.payload };
      }
      return { ok: false, error: action.payload || 'Echec de la configuration.' };
    },
    [dispatch, ownerUserId]
  );

  /**
   * Deverrouille un cabinet existant avec une phrase saisie (situation B).
   */
  const unlockCabinet = useCallback(
    async ({ passphrase, persistLocally = true } = {}) => {
      if (!ownerUserId) {
        return { ok: false, error: 'Identifiant cabinet inconnu, reconnectez-vous.' };
      }
      const action = await dispatch(
        unlockCabinetEncryption({ passphrase, ownerUserId, persistLocally })
      );
      if (unlockCabinetEncryption.fulfilled.match(action)) {
        return { ok: true };
      }
      return { ok: false, error: action.payload || 'Echec du deverrouillage.' };
    },
    [dispatch, ownerUserId]
  );

  /**
   * Verrouille volontairement le cabinet (vide la MasterKey en RAM).
   * Si removeDisk=true, supprime aussi la cle persistee — l'utilisateur
   * devra ressaisir la phrase au prochain unlock.
   */
  const lockCabinet = useCallback(
    async ({ removeDisk = false } = {}) => {
      await dispatch(lockCabinetEncryption({ removeDisk }));
    },
    [dispatch]
  );

  /**
   * Marquer la banniere de rappel comme "Plus tard" (sans configurer).
   * La banniere se reaffichera au prochain login.
   */
  const dismissReminderUI = useCallback(() => {
    dispatch(dismissReminder());
  }, [dispatch]);

  const resetReminderUI = useCallback(() => {
    dispatch(resetReminder());
  }, [dispatch]);

  const refresh = useCallback(() => dispatch(fetchEncryptionStatus()), [dispatch]);
  const clearErr = useCallback(() => dispatch(clearError()), [dispatch]);

  // Utilitaires de chiffrement de chaines (pour les messages chat). Pour
  // les fichiers Drive, le chiffrement passera directement par le main
  // process (docGenerator), pas par le hook.
  const encryptString = useCallback(async (plaintext) => {
    const crypto = getElectronCrypto();
    if (!crypto) return { ok: false, error: 'Module crypto indisponible.' };
    return crypto.encryptString(plaintext);
  }, []);

  const decryptString = useCallback(async (encoded) => {
    const crypto = getElectronCrypto();
    if (!crypto) return { ok: false, error: 'Module crypto indisponible.' };
    return crypto.decryptString(encoded);
  }, []);

  // ----------------------------------------------------------------
  // API memorisee
  // ----------------------------------------------------------------
  return useMemo(
    () => ({
      // Etat
      status: state.status,                                                  // unknown | not_configured | configured_locked | unlocked | reminded_later
      enabled: !!state.enabled,
      isUnlocked: !!state.isUnlocked,
      reminderDismissed: !!state.reminderDismissed,
      loading: !!state.loading,
      error: state.error || null,
      enabledAt: state.enabledAt,
      version: state.version,
      wordlistIsPlaceholder: !!state.wordlistIsPlaceholder,
      safeStorageAvailable: !!state.safeStorageAvailable,
      ownerUserId,

      // Actions
      proposePassphrase,
      validatePassphrase,
      setupCabinet,
      unlockCabinet,
      lockCabinet,
      dismissReminder: dismissReminderUI,
      resetReminder: resetReminderUI,
      refresh,
      clearError: clearErr,
      encryptString,
      decryptString,
    }),
    [
      state.status,
      state.enabled,
      state.isUnlocked,
      state.reminderDismissed,
      state.loading,
      state.error,
      state.enabledAt,
      state.version,
      state.wordlistIsPlaceholder,
      state.safeStorageAvailable,
      ownerUserId,
      proposePassphrase,
      validatePassphrase,
      setupCabinet,
      unlockCabinet,
      lockCabinet,
      dismissReminderUI,
      resetReminderUI,
      refresh,
      clearErr,
      encryptString,
      decryptString,
    ]
  );
}
