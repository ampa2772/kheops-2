// client/src/components/companion/CompanionManager.js
//
// Au LOGIN (mode web) : détecte le compagnon Electron mince et, s'il est ABSENT,
// propose son installation via une petite boîte de CONSENTEMENT (bouton
// « Installer le compagnon Kheops » → télécharge l'installeur, l'utilisateur le
// lance une fois). Non-intrusive : une seule fois par session (anti-harcèlement).
//
// ⚠️ NE déclenche PLUS le protocole `kheops2://` : sur un poste où l'ANCIENNE
// application native Kheops est installée, ce schéma est enregistré par elle et
// le navigateur proposait « Ouvrir Kheops2 ? » → ouvrait l'ancienne app (bug
// corrigé 2026-07-01). La détection se limite à un ping local 127.0.0.1:8080/health,
// et le compagnon se relance de lui-même au démarrage de session Windows.

import { useEffect, useState, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useIsElectron } from '../../services/electronBridge';
import { detectCompanion } from '../../services/companion/companionClient';
import CompanionInstallModal from './CompanionInstallModal';

const CompanionManager = () => {
  const isElectron = useIsElectron();
  const isAuthenticated = useSelector((state) => state.login.isAuthenticated);
  const [installOpen, setInstallOpen] = useState(false);
  const ranRef = useRef(false);

  useEffect(() => {
    // Mode web uniquement, et seulement une fois authentifié.
    if (isElectron || !isAuthenticated) return;
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;

    (async () => {
      // 1) Détection SILENCIEUSE (ping local 127.0.0.1). AUCUN protocole kheops2://.
      const present = await detectCompanion();
      if (cancelled || present) return; // présent → rien à faire (aucune boîte).

      // 2) Absent → afficher la boîte de téléchargement/installation À CHAQUE
      //    connexion tant que le compagnon n'est pas installé.
      setInstallOpen(true);
    })();

    return () => { cancelled = true; };
  }, [isElectron, isAuthenticated]);

  // Tant que la boîte est OUVERTE, re-détecter le compagnon toutes les 3 s.
  // Dès qu'il répond (= installé ET lancé), on ferme AUTOMATIQUEMENT la boîte —
  // et UNIQUEMENT à ce moment-là (jamais avant l'installation réelle).
  useEffect(() => {
    if (isElectron || !installOpen) return;
    let stopped = false;
    const intervalId = setInterval(async () => {
      const present = await detectCompanion();
      if (!stopped && present) setInstallOpen(false);
    }, 3000);
    return () => { stopped = true; clearInterval(intervalId); };
  }, [installOpen, isElectron]);

  if (isElectron) return null;

  return <CompanionInstallModal open={installOpen} onClose={() => setInstallOpen(false)} />;
};

export default CompanionManager;
