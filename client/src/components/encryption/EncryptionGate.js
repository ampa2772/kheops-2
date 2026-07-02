// client/src/components/encryption/EncryptionGate.js
//
// Composant orchestrateur du chiffrement E2E cote UI.
// A monter une seule fois dans le layout principal (Dashboard) apres login.
//
// Responsabilites :
//   1. Declencher la recuperation de l'etat de chiffrement au mount
//      (via le hook useCabinetCrypto, qui le fait deja automatiquement).
//   2. Afficher la bonne UI selon le statut :
//      - 'not_configured' / 'reminded_later' : protection OPTIONNELLE — AUCUNE
//        modale automatique. On affiche seulement un bandeau non-bloquant
//        (EncryptionReminderBanner) invitant a proteger ses donnees ; la modale
//        d'enrolement ne s'ouvre que si l'utilisateur clique « Proteger ».
//        L'utilisateur peut fermer le bandeau (croix) et travailler
//        normalement. Le bandeau reapparait a la prochaine connexion tant que
//        la protection n'est pas activee (pas de "ne plus afficher" persistant).
//      - 'configured_locked' : modale de saisie de phrase (situation B). Elle
//        garde l'acces aux DONNEES protegees, mais reste NON-BLOQUANTE pour la
//        SESSION (bouton « Se deconnecter / changer de compte » toujours
//        accessible — cf. EncryptionUnlockModal).
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
import { ENCRYPTION_DISABLED } from '../../redux/slices/encryptionSlice';

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

  // NON-BLOQUANT (regle UX, cf. consigne §11-12) : on n'ouvre PLUS
  // automatiquement la modale d'enrolement au statut 'not_configured'. La
  // protection par phrase secrete est OPTIONNELLE : on se contente d'afficher
  // un bandeau non-bloquant (plus bas) invitant a proteger ses donnees. La
  // modale ne s'ouvre que si l'utilisateur clique explicitement sur le bouton
  // « Proteger mes donnees » du bandeau (handleStartConfigure). L'utilisateur
  // peut travailler normalement sans jamais activer la protection.

  // ----- Rendu selon le statut -----

  // KILL SWITCH : système de chiffrement désactivé → aucune modale (ni
  // déverrouillage par phrase secrète, ni configuration, ni bannière). Le
  // hook useCabinetCrypto ci-dessus continue de tourner et force le main
  // process en "non protégé" (cf. ENCRYPTION_DISABLED dans encryptionSlice).
  if (ENCRYPTION_DISABLED) {
    return null;
  }

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
        (status === 'not_configured' || status === 'reminded_later') &&
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
