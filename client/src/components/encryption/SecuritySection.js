// client/src/components/encryption/SecuritySection.js
//
// Onglet "Securite" de la page Parametres. Affiche l'etat de la
// protection des documents pour le cabinet de l'utilisateur connecte et
// fournit les actions disponibles :
//   - Configurer la protection (si pas encore active)
//   - Verrouiller cet ordinateur (efface la MasterKey en RAM)
//   - Generer la feuille de secours (poste deverrouille uniquement)
//   - Changer la phrase secrete (V3+, affiche un placeholder)
//
// Voir DESIGN_CHIFFREMENT_E2E.md sections 6 et 8.1.

import React, { useState } from 'react';
import useCabinetCrypto from '../../hooks/useCabinetCrypto';
import EncryptionSetupModal from './EncryptionSetupModal';
import './_security-section.css';

const SecuritySection = () => {
  const crypto = useCabinetCrypto({ autoFetch: true });
  const [setupOpen, setSetupOpen] = useState(false);
  const [confirmLockOpen, setConfirmLockOpen] = useState(false);
  const [confirmForgetOpen, setConfirmForgetOpen] = useState(false);

  // Generation de la feuille de secours depuis un poste deja deverrouille.
  const [generatingSheet, setGeneratingSheet] = useState(false);
  const [recoverySheetPath, setRecoverySheetPath] = useState(null);
  const [sheetError, setSheetError] = useState(null);

  // Etat d'affichage
  const enabled = crypto.enabled;
  const isUnlocked = crypto.isUnlocked;
  const safeStorageAvailable = crypto.safeStorageAvailable;
  const wordlistIsPlaceholder = crypto.wordlistIsPlaceholder;

  const formattedEnabledAt = crypto.enabledAt
    ? new Date(crypto.enabledAt).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const stateLabel = !enabled
    ? 'Protection non configuree'
    : isUnlocked
    ? 'Protection active — cet ordinateur peut lire vos documents'
    : 'Protection active — cet ordinateur n\'a pas encore la phrase secrete';

  const stateClass = !enabled
    ? 'k-security-state k-security-state--off'
    : isUnlocked
    ? 'k-security-state k-security-state--on'
    : 'k-security-state k-security-state--locked';

  // ----- Actions -----
  const handleConfigure = () => setSetupOpen(true);

  const handleLockMachine = async () => {
    // Verrouillage temporaire : oublie la MasterKey en RAM mais garde le
    // fichier safeStorage. Au prochain demarrage, la cle sera rechargee
    // automatiquement (l'utilisateur ne ressaisit pas).
    await crypto.lockCabinet({ removeDisk: false });
    setConfirmLockOpen(false);
  };

  const handleForgetThisMachine = async () => {
    // Suppression definitive de la cle sur cet ordinateur : RAM + fichier
    // safeStorage. L'utilisateur devra ressaisir la phrase au prochain
    // demarrage de Kheops sur ce poste.
    await crypto.lockCabinet({ removeDisk: true });
    setConfirmForgetOpen(false);
  };

  // Genere une feuille de secours a partir de la MasterKey en RAM (poste
  // deverrouille). N'a PAS besoin de la phrase : utile pour produire la
  // feuille depuis un poste qui marche afin de debloquer un autre poste.
  const getElectronCrypto = () =>
    (typeof window !== 'undefined' && window.electron && window.electron.crypto)
      ? window.electron.crypto
      : null;

  const handleGenerateRecoverySheet = async () => {
    setSheetError(null);
    const electronCrypto = getElectronCrypto();
    if (!electronCrypto) {
      setSheetError('Module crypto indisponible (application desktop requise).');
      return;
    }
    setGeneratingSheet(true);
    try {
      const res = await electronCrypto.generateRecoverySheet({});
      if (res && res.ok) {
        setRecoverySheetPath(res.path);
      } else if (res && res.canceled) {
        // Boite de dialogue annulee : ne rien faire.
      } else {
        setSheetError((res && res.error) || 'Echec de la generation de la feuille de secours.');
      }
    } catch (err) {
      setSheetError(err.message || 'Erreur inattendue.');
    } finally {
      setGeneratingSheet(false);
    }
  };

  const handleOpenRecoverySheet = async () => {
    const electronCrypto = getElectronCrypto();
    if (!electronCrypto || !recoverySheetPath) return;
    const res = await electronCrypto.openRecoverySheet(recoverySheetPath);
    if (!res || !res.ok) {
      setSheetError((res && res.error) || 'Impossible d\'ouvrir le document.');
    }
  };

  return (
    <div className="k-security-section">
      <h2 className="k-security-title">Securite des documents</h2>

      <p className="k-security-intro">
        Cette section concerne la <strong>phrase secrete</strong> qui rend les
        documents de votre cabinet illisibles pour Google et pour toute
        personne qui n'aurait pas cette phrase. Pour en savoir plus, consultez
        l'onglet <strong>Notices</strong> dans la barre de navigation a gauche.
      </p>

      {wordlistIsPlaceholder && (
        <div className="k-security-warning">
          <strong>Mode test</strong> : la liste de mots utilisee n'est pas
          encore la liste finale. La protection cryptographique est volontairement
          reduite pendant la phase de developpement. Ne pas utiliser pour des
          dossiers reels avant la livraison de la version 2.0.2.
        </div>
      )}

      {!safeStorageAvailable && enabled && (
        <div className="k-security-warning">
          <strong>Attention</strong> : votre systeme ne permet pas de memoriser
          la phrase secrete entre deux demarrages. Vous devrez la ressaisir a
          chaque ouverture de Kheops sur cet ordinateur.
        </div>
      )}

      {/* === Etat actuel === */}
      <div className="k-security-card">
        <div className={stateClass}>{stateLabel}</div>
        <dl className="k-security-meta">
          <div className="k-security-meta-row">
            <dt>Etat du cabinet</dt>
            <dd>{enabled ? 'Protege' : 'Non protege'}</dd>
          </div>
          {formattedEnabledAt && (
            <div className="k-security-meta-row">
              <dt>Protege depuis le</dt>
              <dd>{formattedEnabledAt}</dd>
            </div>
          )}
          <div className="k-security-meta-row">
            <dt>Etat de cet ordinateur</dt>
            <dd>
              {!enabled
                ? 'Aucune phrase secrete a memoriser (protection non configuree)'
                : isUnlocked
                ? 'Phrase secrete memorisee, lecture des documents possible'
                : 'Phrase secrete non disponible — saisie necessaire'}
            </dd>
          </div>
        </dl>
      </div>

      {/* === Actions selon l'etat === */}
      <div className="k-security-actions">
        {!enabled && (
          <button
            type="button"
            className="k-security-btn k-security-btn--primary"
            onClick={handleConfigure}
          >
            Configurer la protection des documents
          </button>
        )}

        {enabled && isUnlocked && (
          <>
            <button
              type="button"
              className="k-security-btn k-security-btn--primary"
              onClick={handleGenerateRecoverySheet}
              disabled={generatingSheet}
              title="Genere un document a imprimer permettant de recuperer l'acces sans la phrase. Possible uniquement depuis un poste deja deverrouille."
            >
              {generatingSheet ? 'Generation en cours...' : 'Generer ma feuille de secours'}
            </button>
            <button
              type="button"
              className="k-security-btn"
              onClick={() => setConfirmLockOpen(true)}
              title="Vide la phrase secrete de la memoire active. Elle sera rechargee automatiquement au prochain demarrage."
            >
              Verrouiller temporairement
            </button>
            <button
              type="button"
              className="k-security-btn k-security-btn--danger"
              onClick={() => setConfirmForgetOpen(true)}
              title="Supprime la phrase secrete memorisee sur cet ordinateur. Vous devrez la ressaisir au prochain demarrage."
            >
              Oublier sur cet ordinateur
            </button>
          </>
        )}
      </div>

      {/* === Resultat generation feuille de secours === */}
      {enabled && isUnlocked && (sheetError || recoverySheetPath) && (
        <div className="k-security-card">
          {sheetError && <div className="k-security-warning">{sheetError}</div>}
          {recoverySheetPath && (
            <>
              <p>
                <strong>Feuille de secours enregistree</strong> dans :
                <br />
                <code style={{ wordBreak: 'break-all' }}>{recoverySheetPath}</code>
              </p>
              <p>
                Imprimez-la (ou conservez le PDF) puis, sur l'autre ordinateur,
                cliquez sur <strong>« J'ai perdu ma phrase, j'utilise ma feuille
                de secours »</strong> sur l'ecran de deverrouillage et saisissez
                les deux elements indiques sur la feuille.
              </p>
              <div className="k-security-actions">
                <button
                  type="button"
                  className="k-security-btn"
                  onClick={handleOpenRecoverySheet}
                >
                  Ouvrir le document pour l'imprimer
                </button>
                <button
                  type="button"
                  className="k-security-btn"
                  onClick={handleGenerateRecoverySheet}
                  disabled={generatingSheet}
                >
                  Generer une nouvelle copie
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* === Fonctionnalites a venir === */}
      <div className="k-security-future">
        <h3>Fonctionnalites a venir</h3>
        <ul>
          <li>
            <strong>Changer ma phrase secrete</strong> — disponible dans une
            mise a jour ulterieure. Permettra de renouveler la phrase, par
            exemple apres le depart d'un collaborateur du cabinet.
          </li>
        </ul>
      </div>

      {/* === Modale d'enrolement === */}
      {setupOpen && (
        <EncryptionSetupModal
          isOpen
          onPostpone={() => setSetupOpen(false)}
          onCompleted={() => {
            setSetupOpen(false);
            crypto.refresh();
          }}
        />
      )}

      {/* === Confirmation : verrouillage temporaire === */}
      {confirmLockOpen && (
        <ConfirmDialog
          title="Verrouiller cet ordinateur"
          message={
            <>
              Kheops va oublier la phrase secrete pour la session en cours.
              Vous pourrez continuer a utiliser Kheops normalement, mais
              l'ouverture d'un document protege necessitera un redemarrage
              de l'application. La phrase reste memorisee de facon protegee
              sur le disque et sera rechargee automatiquement au prochain
              demarrage de Kheops.
            </>
          }
          confirmLabel="Verrouiller"
          onConfirm={handleLockMachine}
          onCancel={() => setConfirmLockOpen(false)}
        />
      )}

      {/* === Confirmation : oubli definitif sur la machine === */}
      {confirmForgetOpen && (
        <ConfirmDialog
          title="Oublier la phrase secrete sur cet ordinateur"
          message={
            <>
              La phrase secrete sera <strong>completement effacee</strong> de
              cet ordinateur. Au prochain demarrage de Kheops sur cette
              machine, vous devrez la ressaisir manuellement. Cette action est
              utile si vous pretez votre ordinateur ou si vous le revendez.
            </>
          }
          confirmLabel="Oublier sur cet ordinateur"
          danger
          onConfirm={handleForgetThisMachine}
          onCancel={() => setConfirmForgetOpen(false)}
        />
      )}
    </div>
  );
};

// ----------------------------------------------------------------
// ConfirmDialog interne (mini-modale de confirmation)
// ----------------------------------------------------------------
const ConfirmDialog = ({ title, message, confirmLabel, danger, onConfirm, onCancel }) => {
  return (
    <div className="k-modal-overlay k-security-confirm-overlay" onClick={onCancel}>
      <div className="k-modal-box k-security-confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="k-modal-header">
          <h3>{title}</h3>
        </div>
        <div className="k-modal-body">
          <p className="k-security-confirm-message">{message}</p>
        </div>
        <div className="k-modal-footer">
          <button type="button" className="k-modal-btn k-modal-btn--cancel" onClick={onCancel}>
            Annuler
          </button>
          <button
            type="button"
            className={'k-modal-btn ' + (danger ? 'k-modal-btn--danger' : 'k-modal-btn--primary')}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SecuritySection;
