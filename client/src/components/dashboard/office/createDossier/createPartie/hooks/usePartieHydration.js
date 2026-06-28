// client\src\components\dashboard\office\createDossier\createPartie\hooks\usePartieHydration.js
import { useEffect, useMemo, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { hydratePartiesFromDossier as hydrateEditPartiesFromDossier, resetParties as resetPartiesEdit } from '../../../../../../redux/slices/partieEditSlice';

// Nouveau code
export const usePartieHydration = (mode, presetDossier) => {
  const dispatch = useDispatch();
  const isEdit = mode === 'edit';

  const hydratedDossierIdRef = useRef(null);
  const hydratedTimestampRef = useRef(null);

  const currentDossierIdToHydrate = presetDossier?._id ?? null;
  const currentTimestamp = presetDossier?._lastUpdated ?? presetDossier?.dateCreation ?? null;

  const partiesSource = useMemo(() => {
    if (!presetDossier) return null;
    if (presetDossier.dossier?.parties && (Array.isArray(presetDossier.dossier.parties.pour) || Array.isArray(presetDossier.dossier.parties.contre))) {
      return presetDossier.dossier.parties;
    }
    if (presetDossier.parties && (Array.isArray(presetDossier.parties.pour) || Array.isArray(presetDossier.parties.contre))) {
      return presetDossier.parties;
    }
    if (Array.isArray(presetDossier.pour) || Array.isArray(presetDossier.contre)) {
      return { pour: presetDossier.pour || [], contre: presetDossier.contre || [] };
    }
    return null;
  }, [presetDossier]);

  // Nouveau code
// Nouveau code
useEffect(() => {
  // Ce hook est appelé par CreatePartieForm.
  // En mode édition, l'hydratation principale de partieEditData est désormais gérée par
  // le composant parent CreateDossier/index.js lorsqu'un presetDossier est fourni.

  // Ce hook doit donc principalement s'assurer que si le mode change de 'edit' à 'create',
  // ou si le presetDossier devient null en mode 'edit', l'état de partieEditData est nettoyé.
  // Il ne devrait PLUS déclencher lui-même l'hydratation à partir de partiesSource,
  // car cela pourrait causer une double hydratation ou écraser des modifications.

  if (!isEdit || !currentDossierIdToHydrate) {
    // Si on n'est pas en mode édition OU si l'ID du dossier à hydrater est nul
    // ET qu'un dossier avait été précédemment hydraté pour l'édition (selon la ref),
    // alors on reset partieEditData.
    if (hydratedDossierIdRef.current !== null) {
      // dispatch(resetPartiesEdit()); // Déplacé vers EditDossierModal.onClose pour un reset plus contrôlé.
    }
    return;
  }

  // Si on est en mode édition et qu'on a un currentDossierIdToHydrate:
  // On vérifie si l'ID du dossier que ce hook pense avoir hydraté
  // est différent de celui qui est maintenant demandé.
  // Cela pourrait arriver si le composant parent changeait le presetDossier SANS
  // que CreateDossier/index.js ait eu le temps de ré-hydrater globalement.
  // (Normalement, la logique dans CreateDossier/index.js devrait prévenir ça).
  if (currentDossierIdToHydrate !== hydratedDossierIdRef.current) {
    // On met juste à jour la ref locale pour refléter l'ID actuel.
    hydratedDossierIdRef.current = currentDossierIdToHydrate;
  }

  // Le timestamp n'est plus utilisé ici pour la décision de ré-hydrater.
}, [isEdit, currentDossierIdToHydrate, dispatch]); // partiesSource n'est plus une dépendance directe pour l'hydratation ici.
};