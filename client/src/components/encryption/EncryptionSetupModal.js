// client/src/components/encryption/EncryptionSetupModal.js
//
// Modale d'enrolement de la phrase secrete du cabinet (situation A du design).
//
// Apparait apres le login si la protection des documents n'est pas encore
// active pour le cabinet. Reportable (bouton "Plus tard") avec banniere de
// rappel. Voir DESIGN_CHIFFREMENT_E2E.md section 6.1 et la notice utilisateur.
//
// Flux interne en 4 etapes (wizard) :
//   1. Introduction : "Proteger les documents de votre cabinet" + boutons
//      "Configurer maintenant" / "Plus tard"
//   2. Generation de la phrase : 6 mots tires au hasard, bouton "Proposer
//      une autre suite de mots"
//   3. Confirmation de notation : case a cocher + bouton "Continuer"
//   4. Feuille de secours : annonce + bouton "Imprimer la feuille de secours"
//      (la generation PDF reelle viendra dans un lot ulterieur ; pour
//      l'instant, on enregistre simplement la decision et on ferme).
//
// La fermeture par clic-dehors / Echap est volontairement coupee pendant
// les etapes 2-4 : tant que la phrase n'est pas confirmee, on ne veut pas
// que l'utilisateur perde l'ecran par accident.

import React, { useCallback, useEffect, useState } from 'react';
import BaseModal from '../common/BaseModal';
import useCabinetCrypto from '../../hooks/useCabinetCrypto';
import './_encryption-modals.css';
import '../common/_modal-base.css';

const STEP_INTRO = 0;
const STEP_GENERATE = 1;
const STEP_CONFIRM = 2;
const STEP_RECOVERY = 3;
const STEP_DONE = 4;

const EncryptionSetupModal = ({ isOpen = true, onPostpone, onCompleted }) => {
  const crypto = useCabinetCrypto({ autoFetch: false });

  const [step, setStep] = useState(STEP_INTRO);
  const [passphrase, setPassphrase] = useState('');
  const [generating, setGenerating] = useState(false);
  const [confirmedNoted, setConfirmedNoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState(null);
  // Etape 4 (recovery) :
  const [generatingSheet, setGeneratingSheet] = useState(false);
  const [recoverySheetPath, setRecoverySheetPath] = useState(null);
  const [confirmedPrinted, setConfirmedPrinted] = useState(false);

  // Genere une nouvelle proposition de phrase
  const generateOne = useCallback(async () => {
    setGenerating(true);
    setLocalError(null);
    const res = await crypto.proposePassphrase(6);
    setGenerating(false);
    if (res && res.ok) {
      setPassphrase(res.passphrase);
    } else {
      setLocalError(res?.error || 'Impossible de generer une phrase.');
    }
  }, [crypto]);

  // A l'entree dans l'etape 2, generer automatiquement une premiere phrase
  useEffect(() => {
    if (step === STEP_GENERATE && !passphrase && !generating) {
      generateOne();
    }
  }, [step, passphrase, generating, generateOne]);

  const handleConfigureNow = () => {
    setStep(STEP_GENERATE);
  };

  const handlePostpone = () => {
    if (typeof onPostpone === 'function') onPostpone();
  };

  const handleProposeAnother = () => {
    if (!generating) generateOne();
  };

  const handleContinueAfterGenerate = () => {
    setStep(STEP_CONFIRM);
  };

  const handleConfirmNoted = async () => {
    if (!confirmedNoted) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const result = await crypto.setupCabinet({ passphrase, persistLocally: true });
      if (result && result.ok) {
        setStep(STEP_RECOVERY);
      } else {
        setLocalError((result && result.error) || 'La configuration a echoue.');
      }
    } catch (err) {
      // Filet de securite : si la promesse rejette (erreur reseau, timeout
      // serveur, erreur IPC), on affiche le message sans bloquer la modale.
      setLocalError(err && err.message ? err.message : 'Erreur inattendue pendant la configuration.');
    } finally {
      // Garantit que le bouton sera reactive meme en cas d'erreur ou
      // d'exception non capturee plus haut.
      setSubmitting(false);
    }
  };

  const handleAcknowledgeRecovery = () => {
    setStep(STEP_DONE);
    if (typeof onCompleted === 'function') onCompleted();
  };

  // -- Generation et ouverture de la feuille de secours (etape 4) --
  const handleGenerateRecoverySheet = useCallback(async () => {
    setGeneratingSheet(true);
    setLocalError(null);
    try {
      const electronCrypto = (typeof window !== 'undefined' && window.electron && window.electron.crypto)
        ? window.electron.crypto
        : null;
      if (!electronCrypto) {
        setLocalError('Module crypto indisponible (application desktop requise).');
        setGeneratingSheet(false);
        return;
      }
      const res = await electronCrypto.generateRecoverySheet({});
      setGeneratingSheet(false);
      if (res && res.ok) {
        setRecoverySheetPath(res.path);
        setConfirmedPrinted(false);
      } else if (res && res.canceled) {
        // Utilisateur a annule la boite de dialogue : on ne fait rien.
      } else {
        setLocalError((res && res.error) || 'Echec de la generation de la feuille de secours.');
      }
    } catch (err) {
      setGeneratingSheet(false);
      setLocalError(err.message || 'Erreur inattendue.');
    }
  }, []);

  const handleOpenRecoverySheet = useCallback(async () => {
    const electronCrypto = (typeof window !== 'undefined' && window.electron && window.electron.crypto)
      ? window.electron.crypto
      : null;
    if (!electronCrypto || !recoverySheetPath) return;
    const res = await electronCrypto.openRecoverySheet(recoverySheetPath);
    if (!res || !res.ok) {
      setLocalError((res && res.error) || 'Impossible d\'ouvrir le document.');
    }
  }, [recoverySheetPath]);

  // ------ Indicateur d'avancement ------
  const renderSteps = () => {
    const stepKeys = [STEP_INTRO, STEP_GENERATE, STEP_CONFIRM, STEP_RECOVERY];
    return (
      <div className="k-encryption-steps" aria-hidden="true">
        {stepKeys.map((k) => (
          <span
            key={k}
            className={
              'k-encryption-step-dot' +
              (step === k ? ' k-encryption-step-dot--active' : step > k ? ' k-encryption-step-dot--done' : '')
            }
          />
        ))}
      </div>
    );
  };

  // ------ Rendu par etape ------
  let title;
  let body;
  let footer;

  if (step === STEP_INTRO) {
    title = 'Proteger les documents de votre cabinet';
    body = (
      <div className="k-encryption-section">
        <p className="k-encryption-explain">
          Vos documents sont aujourd'hui stockes en ligne chez Google. Pour
          respecter le secret professionnel, Kheops peut <strong>rendre
          illisibles</strong> tous les documents que vous y deposez : seul vous
          et les autres avocats de votre cabinet pourrez les ouvrir, grace a
          une <strong>phrase secrete</strong> que vous noterez sur papier.
        </p>
        <p className="k-encryption-explain">
          Ni Google, ni la justice etrangere, ni meme l'equipe Kheops ne
          pourra lire vos documents sans cette phrase.
        </p>
        <div className="k-encryption-warning">
          La phrase secrete est <strong>indispensable</strong> pour relire vos
          documents. Vous devrez la noter sur papier. Si vous la perdez, vos
          documents seront definitivement illisibles. Kheops vous proposera une
          <strong> feuille de secours</strong> a imprimer immediatement apres.
        </div>
      </div>
    );
    footer = (
      <>
        <button
          type="button"
          className="k-modal-btn k-modal-btn--cancel"
          onClick={handlePostpone}
        >
          Plus tard
        </button>
        <button
          type="button"
          className="k-modal-btn k-modal-btn--primary"
          onClick={handleConfigureNow}
        >
          Configurer maintenant
        </button>
      </>
    );
  } else if (step === STEP_GENERATE) {
    title = 'Votre phrase secrete';
    body = (
      <div className="k-encryption-section">
        {renderSteps()}
        <p className="k-encryption-explain">
          Voici six mots tires au hasard par Kheops. C'est votre
          <strong> phrase secrete</strong>. Ecrivez-la <strong>maintenant</strong>
          {' '}sur une feuille de papier, dans l'ordre, en respectant les
          accents.
        </p>
        {passphrase ? (
          <div className="k-encryption-passphrase" aria-label="phrase secrete proposee">
            {passphrase}
          </div>
        ) : (
          <div className="k-encryption-passphrase-empty">
            {generating ? 'Generation en cours...' : 'Aucune phrase pour le moment.'}
          </div>
        )}
        <div className="k-encryption-passphrase-actions">
          <button
            type="button"
            className="k-encryption-btn-secondary"
            onClick={handleProposeAnother}
            disabled={generating}
          >
            Proposer une autre suite de mots
          </button>
        </div>
        <p className="k-encryption-input-hint">
          Vous pouvez recommencer autant de fois que vous voulez, jusqu'a
          trouver une suite qui vous parle.
        </p>
        {localError && (
          <div className="k-encryption-error">{localError}</div>
        )}
      </div>
    );
    footer = (
      <>
        <button
          type="button"
          className="k-modal-btn k-modal-btn--cancel"
          onClick={handlePostpone}
        >
          Annuler et revenir plus tard
        </button>
        <button
          type="button"
          className="k-modal-btn k-modal-btn--primary"
          onClick={handleContinueAfterGenerate}
          disabled={!passphrase || generating}
        >
          J'ai note ma phrase, continuer
        </button>
      </>
    );
  } else if (step === STEP_CONFIRM) {
    title = 'Confirmer la mise en route';
    body = (
      <div className="k-encryption-section">
        {renderSteps()}
        <p className="k-encryption-explain">
          Avant de continuer, verifiez que vous avez bien <strong>note ces
          six mots sur papier</strong>, dans l'ordre, avec les accents. Une
          fois cette etape passee, Kheops ne vous montrera plus jamais ces
          mots.
        </p>
        <div className="k-encryption-passphrase" aria-label="phrase secrete a noter">
          {passphrase}
        </div>
        <label className="k-encryption-checkbox">
          <input
            type="checkbox"
            checked={confirmedNoted}
            onChange={(e) => setConfirmedNoted(e.target.checked)}
            disabled={submitting}
          />
          <span>J'ai bien note ma phrase secrete sur papier.</span>
        </label>
        {localError && (
          <div className="k-encryption-error">{localError}</div>
        )}
        {crypto.wordlistIsPlaceholder && (
          <div className="k-encryption-warning">
            <strong>Mode test</strong> : la liste de mots utilisee n'est pas
            encore la liste finale. Ne pas utiliser pour des dossiers reels.
          </div>
        )}
        {!crypto.safeStorageAvailable && (
          <div className="k-encryption-warning" role="alert">
            <strong>Attention</strong> : votre systeme ne permet pas a Kheops
            de memoriser la phrase secrete entre deux demarrages (protection
            Windows DPAPI indisponible). Apres cette configuration, vous
            devrez ressaisir votre phrase secrete a <strong>chaque</strong>
            {' '}demarrage de Kheops sur cet ordinateur.
          </div>
        )}
      </div>
    );
    footer = (
      <>
        <button
          type="button"
          className="k-modal-btn k-modal-btn--cancel"
          onClick={() => setStep(STEP_GENERATE)}
          disabled={submitting}
        >
          Revenir
        </button>
        <button
          type="button"
          className="k-modal-btn k-modal-btn--primary"
          onClick={handleConfirmNoted}
          disabled={!confirmedNoted || submitting}
        >
          {submitting ? 'Configuration en cours...' : 'Continuer'}
        </button>
      </>
    );
  } else if (step === STEP_RECOVERY) {
    title = 'Votre feuille de secours';
    body = (
      <div className="k-encryption-section">
        {renderSteps()}
        <p className="k-encryption-explain">
          La protection est <strong>active</strong>. Tous les nouveaux
          documents que vous creez sont maintenant rendus illisibles avant
          d'arriver chez Google.
        </p>
        <p className="k-encryption-explain">
          Pour vous proteger en cas d'oubli de votre phrase secrete <em>et</em>
          {' '}de perte de tous les ordinateurs du cabinet, Kheops va generer
          une <strong>feuille de secours</strong> que vous devrez imprimer en
          deux exemplaires et ranger dans deux lieux differents (coffre du
          cabinet, notaire, coffre a la banque).
        </p>
        {!recoverySheetPath ? (
          <>
            <p className="k-encryption-explain">
              Cliquez sur le bouton ci-dessous. Kheops vous demandera ou
              enregistrer le document a imprimer.
            </p>
            <div className="k-encryption-passphrase-actions">
              <button
                type="button"
                className="k-modal-btn k-modal-btn--primary"
                onClick={handleGenerateRecoverySheet}
                disabled={generatingSheet}
              >
                {generatingSheet ? 'Generation en cours...' : 'Generer ma feuille de secours'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="k-encryption-warning">
              <strong>Feuille de secours enregistree</strong> dans :
              <br />
              <code style={{ wordBreak: 'break-all' }}>{recoverySheetPath}</code>
            </div>
            <div className="k-encryption-passphrase-actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="k-encryption-btn-secondary"
                onClick={handleOpenRecoverySheet}
              >
                Ouvrir le document pour l'imprimer
              </button>
              <button
                type="button"
                className="k-encryption-btn-secondary"
                onClick={handleGenerateRecoverySheet}
                disabled={generatingSheet}
              >
                Generer une nouvelle copie
              </button>
            </div>
            <label className="k-encryption-checkbox" style={{ marginTop: 16 }}>
              <input
                type="checkbox"
                checked={confirmedPrinted}
                onChange={(e) => setConfirmedPrinted(e.target.checked)}
              />
              <span>
                J'ai imprime ma feuille de secours en deux exemplaires et je
                vais les ranger dans deux lieux differents.
              </span>
            </label>
          </>
        )}
        {localError && (
          <div className="k-encryption-error">{localError}</div>
        )}
      </div>
    );
    footer = (
      <>
        <button
          type="button"
          className="k-modal-btn k-modal-btn--primary"
          onClick={handleAcknowledgeRecovery}
          disabled={recoverySheetPath ? !confirmedPrinted : false}
        >
          {recoverySheetPath ? 'Terminer' : 'Continuer sans imprimer maintenant'}
        </button>
      </>
    );
  } else {
    // STEP_DONE — ne devrait jamais s'afficher (onCompleted demonte la modale)
    title = 'Termine';
    body = (
      <p className="k-encryption-explain">La protection est maintenant active.</p>
    );
    footer = null;
  }

  // Sur les etapes 1-4 (apres "Configurer maintenant"), on ne ferme pas par
  // Escape / clic-dehors. Sur l'intro, oui (= equivaut a "Plus tard").
  const allowDismiss = step === STEP_INTRO;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={allowDismiss ? handlePostpone : undefined}
      overlayClassName="k-encryption-overlay"
      contentClassName="k-modal-box k-encryption-box"
    >
      <div className="k-modal-header">
        <h2>{title}</h2>
      </div>
      <div className="k-modal-body">{body}</div>
      {footer && <div className="k-modal-footer">{footer}</div>}
    </BaseModal>
  );
};

export default EncryptionSetupModal;
