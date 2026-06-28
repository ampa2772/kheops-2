import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { initSocket, subscribeToEvent, unsubscribeFromEvent } from '../services/socketService';
import { updateCurrentDossierFromSocket, MOVE_DOSSIER_TO_TOP, setCurrentDossier } from '../redux/slices/currentDossierSlice';
import { fetchNotifications, closeNotificationsModal } from '../redux/slices/layoutSlice'; // <<< MODIFICATION ICI

export const useSocketListeners = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    initSocket();

    const handleSuccess = (data) => {
      // Gère la mise à jour du dossier après l'envoi d'un email
      if (data.type === 'send-email-to-dossier' && data.dossier) {
        console.log('[Socket Listener] Opération "send-email-to-dossier" réussie. Mise à jour, redirection et fermeture modale...');
        
        // === DÉBUT DE LA MODIFICATION ===
        // 1. Met à jour le dossier dans la liste des derniers dossiers et le place en haut
        dispatch({ type: MOVE_DOSSIER_TO_TOP, payload: data.dossier });
        // 2. Définit le dossier mis à jour comme le dossier courant
        dispatch(setCurrentDossier(data.dossier));
        // 3. Ferme la modale de notifications
        dispatch(closeNotificationsModal());
        // 4. Navigue vers la vue du dossier
        navigate('/dashboard/dossier');
        // === FIN DE LA MODIFICATION ===
      }

      // Gère le rafraîchissement des notifications après une opération réussie
      if (data.type === 'send-email-to-dossier') {
        console.log('[Socket Listener] Opération "send-email-to-dossier" réussie. Rafraîchissement de la liste des notifications.');
        dispatch(fetchNotifications(null));
      }
    };

    const handleError = (data) => {
      // Gère les erreurs venant de l'agent
      if (data.message) {
        console.error(`[Socket Listener] Erreur reçue de l'agent pour l'opération "${data.type}":`, data.message);
        // Vous pourriez ici dispatcher une action pour afficher une notification d'erreur globale
      }
    };

    subscribeToEvent('document_operation_success', handleSuccess);
    subscribeToEvent('document_operation_error', handleError);

    return () => {
      unsubscribeFromEvent('document_operation_success', handleSuccess);
      unsubscribeFromEvent('document_operation_error', handleError);
    };
  }, [dispatch, navigate]);
};