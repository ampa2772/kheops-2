import { useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { uploadDroppedFile } from '../../../../../services/socketService';

// Hook pour gérer la logique de glisser-déposer
export const useDragAndDrop = () => {
  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  const token = useSelector(state => state.login.token);

  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragEnter = handleDragOver;

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    // Vérifier si le curseur quitte vraiment la zone et pas un de ses enfants
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDraggingOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDraggingOver(false);
    
    // =================================================================================
    // === CORRECTION : Ignorer les événements de drop qui ne contiennent pas de fichiers
    // =================================================================================
    // Ceci empêche les glisser-déposer internes (ex: document vers sous-dossier)
    // de déclencher une fausse erreur "Aucun fichier valide déposé".
    if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) {
      return; // On arrête le traitement ici, car ce n'est pas un dépôt de fichier externe.
    }
    // =================================================================================

    setUploadError(null);

    if (!currentDossier?._id || !token) {
      setUploadError("Aucun dossier sélectionné ou session invalide.");
      return;
    }

    const file = e.dataTransfer.files?.[0];
    
    // La vérification ci-dessous devient redondante grâce au contrôle ajouté plus haut,
    // mais on la garde par sécurité. Le bloc qui déclenchait l'erreur a été supprimé.
    if (!file) {
      return;
    }

    setIsUploading(true);
    try {
      await uploadDroppedFile(file, currentDossier._id, token);
      // Le succès est géré par le listener socket, qui mettra isUploading à false
    } catch (err) {
      setUploadError(err.message || 'Erreur lors de l\'envoi du fichier.');
      setIsUploading(false); // S'assurer de réinitialiser en cas d'erreur immédiate
    }
  }, [currentDossier, token]);
  
  // Exposer aussi le setter pour le reset d'erreur
  return {
    isDraggingOver,
    isUploading,
    uploadError,
    setUploadError,
    setIsUploading,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  };
};