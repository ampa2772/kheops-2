// client/src/components/encryption/EncryptionUnlockModal.js
//
// Modale BLOQUANTE de saisie de la phrase secrete pour un cabinet deja
// protege (situation B du design). Apparait apres le login si :
//   - le cabinet a `encryption.enabled = true` (cote serveur), ET
//   - la machine n'a pas la MasterKey en RAM (safeStorage absent ou
//     dechiffrement local impossible).
//
// Bloquante pour l'ACCES AUX DONNEES (pas de fermeture par Echap ni clic-dehors) :
// pour acceder au tableau de bord protege, l'utilisateur doit saisir la phrase,
// OU utiliser sa feuille de secours.
//
// MAIS jamais bloquante pour la SESSION : un bouton « Se deconnecter / changer
// de compte » est TOUJOURS accessible (handleLogout ci-dessous). Regle UX
// absolue — la phrase secrete protege les donnees, elle n'enferme jamais
// l'utilisateur dans une session dont il ne peut pas sortir.
//
// Voir DESIGN_CHIFFREMENT_E2E.md sections 6.2 et 6.6.

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import BaseModal from '../common/BaseModal';
import useCabinetCrypto from '../../hooks/useCabinetCrypto';
import { performLogout } from '../../redux/slices/authSlice';
import './_encryption-modals.css';
import '../common/_modal-base.css';

const EncryptionUnlockModal = ({
  isOpen = true,
  onUnlocked,
  onUseRecoverySheet,
}) => {
  const crypto = useCabinetCrypto({ autoFetch: false });
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [passphrase, setPassphrase] = useState('');
  const [persistLocally, setPersistLocally] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!passphrase.trim()) {
      setLocalError('Saisissez votre phrase secrete.');
      return;
    }
    setSubmitting(true);
    setLocalError(null);
    const result = await crypto.unlockCabinet({
      passphrase: passphrase.trim(),
      persistLocally,
    });
    setSubmitting(false);
    if (result.ok) {
      setPassphrase('');
      if (typeof onUnlocked === 'function') onUnlocked();
    } else {
      setLocalError(result.error || 'La phrase secrete ne correspond pas.');
    }
  };

  const handleRecoveryClick = () => {
    if (typeof onUseRecoverySheet === 'function') onUseRecoverySheet();
  };

  // Echappatoire NON-BLOQUANTE. Regle UX absolue : meme sans connaitre la
  // phrase secrete, l'utilisateur doit TOUJOURS pouvoir se deconnecter et
  // changer de compte. La phrase secrete protege les donnees, elle n'enferme
  // jamais la session.
  //
  // On delegue a performLogout (authSlice) qui centralise la deconnexion
  // complete : verrouillage du cabinet (oubli de la MasterKey), logout cloud
  // Electron, vidage du JWT et retour au login.
  const handleLogout = () => {
    dispatch(performLogout({ navigate }));
  };

  return (
    <BaseModal
      isOpen={isOpen}
      // PAS de onClose : la modale est bloquante, on ne peut pas la fermer
      // par Echap ou clic-dehors.
      overlayClassName="k-encryption-overlay k-encryption-overlay--blocking"
      contentClassName="k-modal-box k-encryption-box"
    >
      <div className="k-modal-header">
        <h2>Saisissez la phrase secrete de votre cabinet</h2>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="k-modal-body">
          <div className="k-encryption-section">
            <p className="k-encryption-explain">
              Les documents de votre cabinet sont proteges par une phrase
              secrete connue de vous seul et des autres avocats du cabinet.
              Pour acceder a votre espace de travail sur cet ordinateur,
              saisissez les <strong>six mots</strong> que vous avez notes,
              dans l'ordre, separes par un espace.
            </p>
            <p className="k-encryption-input-hint">
              Respectez les accents : « foret » et « foret » avec accent
              circonflexe ne sont pas le meme mot.
            </p>
            <input
              type="text"
              className={
                'k-encryption-input' +
                (localError ? ' k-encryption-input--error' : '')
              }
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value);
                if (localError) setLocalError(null);
              }}
              placeholder="bateau foret cuivre montagne nuage soleil"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              disabled={submitting}
              aria-label="phrase secrete du cabinet"
            />
            <label className="k-encryption-checkbox">
              <input
                type="checkbox"
                checked={persistLocally}
                onChange={(e) => setPersistLocally(e.target.checked)}
                disabled={submitting}
              />
              <span>
                Memoriser sur cet ordinateur (recommande). Sinon, vous devrez
                ressaisir la phrase au prochain demarrage de Kheops.
              </span>
            </label>
            {localError && (
              <div className="k-encryption-error">{localError}</div>
            )}
            <button
              type="button"
              className="k-encryption-recovery-link"
              onClick={handleRecoveryClick}
              disabled={submitting}
            >
              J'ai perdu ma phrase, j'utilise ma feuille de secours
            </button>
          </div>
        </div>
        <div className="k-modal-footer" style={{ justifyContent: 'space-between' }}>
          <button
            type="button"
            className="k-modal-btn k-modal-btn--cancel"
            onClick={handleLogout}
            disabled={submitting}
            title="Quitter cette session sans saisir la phrase secrete"
          >
            Se deconnecter / changer de compte
          </button>
          <button
            type="submit"
            className="k-modal-btn k-modal-btn--primary"
            disabled={submitting || !passphrase.trim()}
          >
            {submitting ? 'Verification en cours...' : 'Deverrouiller mon cabinet'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
};

export default EncryptionUnlockModal;
