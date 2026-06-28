import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchAllDocumentsInDossier, addDroppedDocumentToList } from '../../../../../redux/slices/currentDossierSlice'; // <-- NOUVEL IMPORT
import { initSocket, subscribeToEvent, unsubscribeFromEvent } from '../../../../../services/socketService';

export const useSocketListeners = () => { // <-- RETRAIT DES PROPS, PLUS NÉCESSAIRES
  const dispatch = useDispatch();
  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  const token = useSelector(state => state.login.token);

  useEffect(() => {
    initSocket(); // S'assure que le socket est initialisé.

    // --- NOUVELLE LOGIQUE : Gérer l'ajout d'un seul document ---
    const onSingleDocumentAdded = (data) => {
      if (data && data.newDocMetadata) {
        console.log('[Socket Listener] Document reçu:', data.newDocMetadata);
        dispatch(addDroppedDocumentToList(data.newDocMetadata));
      }
    };

    // Gère les erreurs d'upload qui peuvent toujours survenir
    const onUploadError = (e) => {
      // La barre de progression affichera l'erreur, ce listener est une sécurité
      console.error('Erreur d\'upload reçue via WebSocket:', e);
    };

    // Gère les succès d'opérations générales comme la suppression, le renommage...
    const onDocumentOperationSuccess = (meta) => {
      
      // MODIFICATION : Si c'est une suppression ('delete-file'), l'état Redux est déjà à jour.
      // On ne fait rien pour éviter un rechargement inutile.
      if (meta && meta.type === 'delete-file') {
        console.log('[Socket Listener] Confirmation de suppression physique reçue. Pas de rechargement nécessaire.');
        return;
      }

      // Pour les autres opérations (renommage, duplication...), on rafraîchit toujours la liste pour l'instant.
      if (currentDossier?._id && token) {
        console.log(`[Socket Listener] Opération "${meta?.type}" réussie. Rafraîchissement de la liste.`);
        dispatch(fetchAllDocumentsInDossier(currentDossier._id, token));
      }
    };

    // Abonnement aux événements
    subscribeToEvent('single_document_added', onSingleDocumentAdded);
    subscribeToEvent('upload_error', onUploadError);
    subscribeToEvent('document_operation_success', onDocumentOperationSuccess);

    // Nettoyage au démontage du composant
    return () => {
      unsubscribeFromEvent('single_document_added', onSingleDocumentAdded);
      unsubscribeFromEvent('upload_error', onUploadError);
      unsubscribeFromEvent('document_operation_success', onDocumentOperationSuccess);
    };
  }, [dispatch, currentDossier, token]);
};