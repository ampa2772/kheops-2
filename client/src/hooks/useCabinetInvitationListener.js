// client/src/hooks/useCabinetInvitationListener.js
//
// Écoute en temps réel les invitations de cabinet ('cabinet:invitation', émis
// par le serveur central dans le room user:<id> de la personne invitée).
// À réception :
//   1) affiche un toast d'information ;
//   2) émet un événement DOM 'kheops:cabinet-invitation' pour que la section
//      Paramètres > Cabinet (CabinetMembersSection) rafraîchisse sa liste et
//      fasse apparaître le bouton « Accepter » SANS rechargement de page.
//
// Monté une seule fois au niveau de App.js (tant que l'utilisateur est connecté).
// On dispatche `showToast` directement (dispatch stable) plutôt que via le hook
// useToast, pour garantir des dépendances d'effet stables (pas de re-souscription).

import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { initChatSocket, subscribeToCabinetInvitation } from '../services/chatSocketCentral';
import { showToast } from '../redux/slices/notificationsSlice';

export function useCabinetInvitationListener() {
  const token = useSelector((s) => s.login?.token);
  const isAuthenticated = useSelector((s) => s.login?.isAuthenticated);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!isAuthenticated || !token) return undefined;

    // Idempotent : réutilise la connexion socket centrale existante si présente.
    const sock = initChatSocket(token);
    if (!sock) return undefined;

    const unsubscribe = subscribeToCabinetInvitation((payload) => {
      const cabinet = payload?.cabinet || 'un cabinet';
      const by = payload?.invitedByName ? ` par ${payload.invitedByName}` : '';
      dispatch(showToast({
        type: 'info',
        title: 'Invitation reçue',
        message: `Vous avez été invité${by} à rejoindre le cabinet « ${cabinet} ». Ouvrez Paramètres → Cabinet pour accepter.`,
        duration: 8000,
      }));
      try {
        window.dispatchEvent(new CustomEvent('kheops:cabinet-invitation', { detail: payload }));
      } catch (_) { /* CustomEvent indisponible : le toast suffit */ }
    });

    return () => { try { unsubscribe(); } catch (_) {} };
  }, [token, isAuthenticated, dispatch]);
}

export default useCabinetInvitationListener;
