// client/src/components/encryption/EncryptionUnlockModal.js
//
// Modale BLOQUANTE de saisie de la phrase secrete pour un cabinet deja
// protege (situation B du design). Apparait apres le login si :
//   - le cabinet a `encryption.enabled = true` (cote serveur), ET
//   - la machine n'a pas la MasterKey en RAM (safeStorage absent ou
//     dechiffrement local impossible).
//
// Bloquante = pas de fermeture par Echap, pas de clic-dehors.
// L'utilisateur DOIT saisir la phrase pour acceder au tableau de bord, OU
// utiliser sa feuille de secours (lien de recovery — fonctionnalite a
// implementer dans un lot ulterieur, mais le lien est present pour le futur).
//
// Voir DESIGN_CHIFFREMENT_E2E.md sections 6.2 et 6.6.

import React, { useState } from 'react';
import BaseModal from '../common/BaseModal';
import useCabinetCrypto from '../../hooks/useCabinetCrypto';
import './_encryption-modals.css';
import '../common/_modal-base.css';

const EncryptionUnlockModal = ({
  isOpen = true,
  onUnlocked,
  onUseRecoverySheet,
}) => {
  const crypto = useCabinetCrypto({ autoFetch: false });

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
        <div className="k-modal-footer">
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
