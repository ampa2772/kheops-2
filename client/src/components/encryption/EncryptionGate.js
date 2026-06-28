// client/src/components/encryption/EncryptionGate.js
//
// Composant orchestrateur du chiffrement E2E cote UI.
// A monter une seule fois dans le layout principal (Dashboard) apres login.
//
// Responsabilites :
//   1. Declencher la recuperation de l'etat de chiffrement au mount
//      (via le hook useCabinetCrypto, qui le fait deja automatiquement).
//   2. Afficher la bonne modale selon le statut :
//      - 'not_configured' (et pas encore reporte) : modale d'enrolement
//        (situation A, reportable avec bouton "Plus tard")
//      - 'reminded_later' : aucune modale, mais affichage de la banniere
//        de rappel + un bouton "Configurer" qui la relance
//      - 'configured_locked' : modale BLOQUANTE de saisie de phrase
//        (situation B)
//      - 'unlocked' : rien, l'app fonctionne normalement
//
// Le composant ne rend AUCUN contenu propre quand tout est verrouille
// correctement — il n'agit que via les modales et la banniere.
//
// Voir DESIGN_CHIFFREMENT_E2E.md sections 6.1, 6.2, et la notice utilisateur.

import React, { useEffect, useRef, useState } from 'react';
import useCabinetCrypto from '../../hooks/useCabinetCrypto';
import EncryptionSetupModal from './EncryptionSetupModal';
import EncryptionUnlockModal from './EncryptionUnlockModal';
import EncryptionRecoveryModal from './EncryptionRecoveryModal';
import EncryptionReminderBanner from './EncryptionReminderBanner';

const EncryptionGate = ({ showBanner = true }) => {
  const crypto = useCabinetCrypto({ autoFetch: true });
  const [sessionDismissed, setSessionDismissed] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const wasUnlockedRef = useRef(false);

  // Memorisation locale : si l'utilisateur clique "×" sur la banniere, on
  // la masque pour la session courante meme si reminderDismissed est deja
  // a true cote Redux. Au prochain F5 / redemarrage Kheops, l'etat se
  // reinitialise.
  const handleSessionDismiss = () => setSessionDismissed(true);

  // Ouvrir la modale d'enrolement
  const handleStartConfigure = () => {
    setSessionDismissed(false);
    crypto.resetReminder();                                                  // remet le flag UI a false
    setSetupOpen(true);
  };

  // Suivre la transition vers "unlocked" pour fermer les modales eventuelles
  useEffect(() => {
    if (crypto.isUnlocked && !wasUnlockedRef.current) {
      wasUnlockedRef.current = true;
      setSetupOpen(false);
    }
    if (!crypto.isUnlocked) {
      wasUnlockedRef.current = false;
    }
  }, [crypto.isUnlocked]);

  // Si statut "not_configured" et pas encore reporte : ouvrir la modale
  // d'enrolement automatiquement au premier rendu apres recuperation du
  // statut. On verifie que l'ownerUserId est disponible (sinon on attend).
  useEffect(() => {
    if (!crypto.ownerUserId) return;
    if (crypto.loading) return;
    if (crypto.status === 'not_configured' && !setupOpen) {
      setSetupOpen(true);
    }
  }, [crypto.ownerUserId, crypto.loading, crypto.status, setupOpen]);

  // ----- Rendu selon le statut -----

  const status = crypto.status;

  // Etat 'unknown' / 'loading' / 'unlocked' : rien a afficher
  if (status === 'unknown' || status === 'unlocked') {
    return null;
  }

  // Etat 'configured_locked' : modale bloquante de saisie (avec lien recovery)
  if (status === 'configured_locked') {
    return (
      <>
        {!recoveryOpen && (
          <EncryptionUnlockModal
            isOpen
            onUnlocked={() => { /* l'effet useEffect ci-dessus s'en charge */ }}
            onUseRecoverySheet={() => setRecoveryOpen(true)}
          />
        )}
        {recoveryOpen && (
          <EncryptionRecoveryModal
            isOpen
            ownerUserId={crypto.ownerUserId}
            onClose={() => setRecoveryOpen(false)}
            onRestored={() => {
              setRecoveryOpen(false);
              crypto.refresh();
            }}
          />
        )}
      </>
    );
  }

  // Etats 'not_configured' / 'reminded_later'
  return (
    <>
      {setupOpen && (
        <EncryptionSetupModal
          isOpen
          onPostpone={() => {
            setSetupOpen(false);
            crypto.dismissReminder();                                        // bascule en 'reminded_later'
          }}
          onCompleted={() => {
            setSetupOpen(false);
            crypto.refresh();
          }}
        />
      )}
      {showBanner &&
        status === 'reminded_later' &&
        !sessionDismissed && (
          <EncryptionReminderBanner
            onConfigure={handleStartConfigure}
            onDismiss={handleSessionDismiss}
          />
        )}
    </>
  );
};

export default EncryptionGate;
