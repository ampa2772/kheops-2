import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import SharePointConnectModal from './SharePointConnectModal';
import { getSharePointStatus, dismissSharePointPrompt } from '../../services/storageClient';

/**
 * SharePointLoginPrompt — modale d'invitation SharePoint affichée AUTOMATIQUEMENT
 * à la connexion, UNIQUEMENT si un compte SharePoint est détecté sur le compte de
 * l'utilisateur ET qu'il ne l'a pas déjà activé / refusé. Sinon : rien du tout.
 *
 * Monté au niveau de l'App (comme OnboardingTour). Sonde le statut une seule fois
 * PAR UTILISATEUR (et non « par session ») : sur un PC de cabinet partagé, un
 * changement de compte ne remonte pas le composant (login/logout en pur SPA),
 * donc la sonde doit se ré-armer à chaque nouvel utilisateur. La détection côté
 * serveur est tolérante : pour un compte sans SharePoint (Google, Outlook perso…),
 * elle renvoie available=false → aucune modale, aucun impact.
 */
const SharePointLoginPrompt = () => {
  const isAuthenticated = useSelector((s) => s.login?.isAuthenticated);
  const user = useSelector((s) => s.login?.user);

  const [open, setOpen] = useState(false);
  const [sites, setSites] = useState([]);
  const [busyDismiss, setBusyDismiss] = useState(false);
  // Id de l'utilisateur déjà sondé (et non un simple booléen) : permet de
  // re-sonder quand un AUTRE compte se connecte sans redémarrage de l'app.
  const probedUserIdRef = useRef(null);

  // On attend que l'onboarding soit terminé pour ne jamais empiler deux modales.
  const readyToProbe = isAuthenticated && user && user.onboardingDone === true;
  const userId = user && user._id ? String(user._id) : null;

  useEffect(() => {
    if (!readyToProbe) {
      // Déconnexion / changement de compte : on ré-arme la sonde ET on FERME toute
      // modale résiduelle (+ purge des sites), pour ne JAMAIS montrer les sites
      // SharePoint d'un utilisateur précédent au suivant (PC de cabinet partagé —
      // login/logout en pur SPA, sans remontage du composant).
      probedUserIdRef.current = null;
      setOpen(false);
      setSites([]);
      return undefined;
    }
    if (probedUserIdRef.current === userId) return undefined; // déjà sondé pour CET utilisateur
    probedUserIdRef.current = userId;                          // une seule sonde par utilisateur
    let cancelled = false;
    (async () => {
      try {
        const s = await getSharePointStatus();
        if (cancelled) return;
        // Conditions strictes : SharePoint disponible, pas déjà activé, pas refusé.
        if (s && s.available && !s.enabled && !s.promptDismissed) {
          setSites(Array.isArray(s.sites) ? s.sites : []);
          setOpen(true);
        }
      } catch (_e) {
        /* silencieux : en cas d'échec de sonde, on n'affiche simplement rien */
      }
    })();
    return () => { cancelled = true; };
  }, [readyToProbe, userId]);

  const handleSelected = useCallback(() => {
    setOpen(false); // le choix est persisté côté serveur (select-site)
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false); // « Plus tard » : réapparaîtra à la prochaine session
  }, []);

  const handleDismissForever = useCallback(async () => {
    setBusyDismiss(true);
    try {
      await dismissSharePointPrompt();
    } catch (_e) {
      /* même en cas d'échec réseau, on ferme : non bloquant */
    } finally {
      setBusyDismiss(false);
      setOpen(false);
    }
  }, []);

  if (!open) return null;

  return (
    <SharePointConnectModal
      isOpen={open}
      sites={sites}
      onSelected={handleSelected}
      onClose={handleClose}
      showDismiss
      onDismissForever={handleDismissForever}
      busyDismiss={busyDismiss}
    />
  );
};

export default SharePointLoginPrompt;
