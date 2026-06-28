// client/src/components/encryption/EncryptionRecoveryModal.js
//
// Modale de restauration depuis la feuille de secours imprimee. Declenchee
// par le lien « J'ai perdu ma phrase, j'utilise ma feuille de secours »
// dans EncryptionUnlockModal (situation B du design).
//
// Flux :
//   1. L'utilisateur saisit le mot de passe de secours (16 caracteres) et
//      le code de secours imprimes sur la feuille.
//   2. Le main process (via crypto:restore-from-recovery-sheet) reconstruit
//      la MasterKey localement et calcule son verifier.
//   3. Le verifier est compare cote serveur a celui enregistre pour le
//      cabinet (route /api/encryption/verify) — verification de coherence.
//   4. Si OK, l'utilisateur choisit une nouvelle phrase secrete (via le
//      flux SetupModal redemarre) qui ecrasera l'ancienne. Le serveur recoit
//      un nouveau salt et un nouveau verifier (POST /api/encryption/setup
//      en mode "rotation" — il faudra prevoir une route specifique en V2).
//
// Pour la V1 simple, on se contente de re-deverrouiller le cabinet avec la
// MasterKey reconstruite. La rotation passphrase reste pour une V2.

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import BaseModal from '../common/BaseModal';
import encryptionApi from '../../services/encryptionService';
import { fetchEncryptionStatus } from '../../redux/slices/encryptionSlice';
import './_encryption-modals.css';
import '../common/_modal-base.css';

const EncryptionRecoveryModal = ({ isOpen = true, ownerUserId, onClose, onRestored }) => {
  const dispatch = useDispatch();
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();

    const cleanPwd = recoveryPassword.replace(/[\s-]/g, '').toUpperCase();
    if (cleanPwd.length !== 16) {
      setLocalError('Le mot de passe de secours doit contenir exactement 16 caracteres (chiffres et lettres).');
      return;
    }
    if (!recoveryCode || recoveryCode.replace(/[\s-]/g, '').length < 100) {
      setLocalError('Le code de secours saisi semble trop court. Verifiez la saisie.');
      return;
    }

    setSubmitting(true);
    setLocalError(null);

    try {
      const electronCrypto = (typeof window !== 'undefined' && window.electron && window.electron.crypto)
        ? window.electron.crypto
        : null;
      if (!electronCrypto) {
        setLocalError('Module crypto indisponible (application desktop requise).');
        setSubmitting(false);
        return;
      }

      // 1. Reconstruction locale de la MasterKey via la feuille
      const restored = await electronCrypto.restoreFromRecoverySheet({
        recoveryPassword: cleanPwd,
        recoveryCode: recoveryCode,
        ownerUserId,
      });

      if (!restored || !restored.ok) {
        setLocalError((restored && restored.error) ||
          'La feuille de secours ne permet pas de restaurer la cle. Verifiez les deux elements saisis.');
        setSubmitting(false);
        return;
      }

      // 2. Verification cote serveur : le verifier reconstruit doit correspondre
      //    a celui enregistre pour le cabinet courant.
      try {
        const serverRes = await encryptionApi.verify({ verifier: restored.verifier });
        if (!serverRes || !serverRes.ok) {
          setLocalError(
            'La feuille de secours est valide, mais elle ne correspond pas au cabinet ' +
            'enregistre pour ce compte. Verifiez que vous utilisez la feuille du bon cabinet.'
          );
          // Effacer la MasterKey en RAM (mauvais cabinet)
          await electronCrypto.forgetMasterKey({});
          setSubmitting(false);
          return;
        }
      } catch (serverErr) {
        setLocalError(
          'Impossible de verifier cote serveur. Verifiez votre connexion internet. (' +
          (serverErr.message || 'erreur inconnue') + ')'
        );
        setSubmitting(false);
        return;
      }

      // 3. Persistance locale via safeStorage pour eviter de redemander
      //    la feuille au prochain demarrage
      await electronCrypto.persistMasterKey();

      // 4. Rafraichir le statut Redux
      await dispatch(fetchEncryptionStatus());

      setSubmitting(false);
      if (typeof onRestored === 'function') {
        onRestored();
      }
    } catch (err) {
      setSubmitting(false);
      setLocalError(err.message || 'Erreur inattendue.');
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={submitting ? undefined : onClose}
      overlayClassName="k-encryption-overlay k-encryption-overlay--blocking"
      contentClassName="k-modal-box k-encryption-box"
    >
      <div className="k-modal-header">
        <h2>Restaurer l'acces avec votre feuille de secours</h2>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="k-modal-body">
          <div className="k-encryption-section">
            <p className="k-encryption-explain">
              Sortez votre <strong>feuille de secours</strong> du lieu ou vous
              la conservez. Vous allez recopier les deux elements imprimes
              sur la feuille : le mot de passe de secours (16 caracteres) et
              le code de secours (lettres et chiffres groupes par 5).
            </p>
            <p className="k-encryption-input-hint" style={{ marginBottom: 12 }}>
              Les tirets et espaces que vous ajoutez ne genent pas la saisie.
              La casse (majuscules / minuscules) est traitee automatiquement.
            </p>

            <label className="k-encryption-explain" htmlFor="k-recovery-pwd" style={{ display: 'block', marginBottom: 6 }}>
              <strong>1. Mot de passe de secours</strong> (16 caracteres, chiffres et lettres)
            </label>
            <input
              id="k-recovery-pwd"
              type="text"
              className={'k-encryption-input' + (localError ? ' k-encryption-input--error' : '')}
              value={recoveryPassword}
              onChange={(e) => { setRecoveryPassword(e.target.value); if (localError) setLocalError(null); }}
              placeholder="ABCDEFGH12345678"
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
              disabled={submitting}
              autoFocus
              aria-label="mot de passe de secours imprime sur la feuille"
            />

            <label className="k-encryption-explain" htmlFor="k-recovery-code" style={{ display: 'block', marginTop: 18, marginBottom: 6 }}>
              <strong>2. Code de secours</strong> (suite complete de lettres et chiffres)
            </label>
            <textarea
              id="k-recovery-code"
              className={'k-encryption-input' + (localError ? ' k-encryption-input--error' : '')}
              value={recoveryCode}
              onChange={(e) => { setRecoveryCode(e.target.value); if (localError) setLocalError(null); }}
              placeholder="ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-Z2345 ..."
              rows={4}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="characters"
              disabled={submitting}
              style={{ resize: 'vertical', fontFamily: "'Courier New', Courier, monospace" }}
              aria-label="code de secours imprime sur la feuille"
            />

            {localError && (
              <div className="k-encryption-error">{localError}</div>
            )}
          </div>
        </div>
        <div className="k-modal-footer">
          <button
            type="button"
            className="k-modal-btn k-modal-btn--cancel"
            onClick={onClose}
            disabled={submitting}
          >
            Annuler
          </button>
          <button
            type="submit"
            className="k-modal-btn k-modal-btn--primary"
            disabled={submitting || !recoveryPassword.trim() || !recoveryCode.trim()}
          >
            {submitting ? 'Restauration en cours...' : 'Restaurer mon acces'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
};

export default EncryptionRecoveryModal;
