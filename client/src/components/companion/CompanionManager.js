// client/src/components/companion/CompanionManager.js
//
// Au LOGIN (mode web) : détecte SILENCIEUSEMENT le compagnon Electron mince.
// L'installation n'est jamais proposée automatiquement : elle reste disponible
// uniquement lorsque l'utilisateur choisit « Ouvrir dans Word » ou depuis les
// paramètres des services connectés.
//
// ⚠️ NE déclenche PLUS le protocole `kheops2://` : sur un poste où l'ANCIENNE
// application native Kheops est installée, ce schéma est enregistré par elle et
// le navigateur proposait « Ouvrir Kheops2 ? » → ouvrait l'ancienne app (bug
// corrigé 2026-07-01). La détection se limite à un ping local 127.0.0.1:8080/health,
// et le compagnon se relance de lui-même au démarrage de session Windows.

import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useIsElectron } from '../../services/electronBridge';
import { detectCompanion, triggerMirrorSync } from '../../services/companion/companionClient';

const CompanionManager = () => {
  const isElectron = useIsElectron();
  const isAuthenticated = useSelector((state) => state.login.isAuthenticated);
  const ranRef = useRef(false);

  useEffect(() => {
    // Mode web uniquement, et seulement une fois authentifié.
    if (isElectron || !isAuthenticated) return;
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;

    (async () => {
      // Détection SILENCIEUSE (ping local 127.0.0.1). AUCUN protocole kheops2://.
      const present = await detectCompanion();
      if (cancelled) return;
      if (present) {
        // Présent → aucune boîte, et on déclenche la synchro du MIROIR LOCAL
        // (Phase 2) en arrière-plan. Le serveur décide : pour un compte avec
        // cloud personnel (OneDrive/Google/SharePoint), le compagnon ne fait
        // rien ; pour un compte au stockage interne, il matérialise
        // C:\Files_Clients\Kheops2\Dossiers\<noms lisibles>.
        triggerMirrorSync();
      }
    })();

    return () => { cancelled = true; };
  }, [isElectron, isAuthenticated]);

  return null;
};

export default CompanionManager;
