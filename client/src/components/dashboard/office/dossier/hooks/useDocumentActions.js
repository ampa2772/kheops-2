import { useState, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  duplicateDocumentInDossier,
  renameDocumentInDossier,
  deleteDocumentInDossier as deleteDocumentAction,
  createSubfolder,
  updateSubfolder,
  deleteSubfolder,
  moveDocumentToSubfolder,
} from '../../../../../redux/slices/currentDossierSlice';
import { useToast } from '../../../../common/notifications/useToast';

export const useDocumentActions = () => {
  const dispatch = useDispatch();
  const toast = useToast();
  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  const token = useSelector(state => state.login.token);

  const [miniModalItemId, setMiniModalItemId] = useState(null);
  const [renamingItemId, setRenamingItemId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [itemToDelete, setItemToDelete] = useState(null); 
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const handleDuplicateDocument = useCallback((doc) => {
    if (!currentDossier?._id || !token) return;
    // Le serveur peut refuser (409) : document stocké en nuage dont la copie
    // physique n'est pas encore prise en charge — on affiche son message
    // plutôt que d'échouer en silence.
    Promise.resolve(dispatch(duplicateDocumentInDossier(currentDossier._id, doc, token)))
      .catch((error) => {
        const serverMsg = error?.response?.data?.message;
        toast.error(serverMsg || 'La duplication du document a échoué.');
      });
    setMiniModalItemId(null);
  }, [dispatch, currentDossier, token, toast]);

  const handleRenameDocument = useCallback((doc) => {
    setRenameValue(doc.nomDocument.replace(/\.[^/.]+$/, ''));
    setRenamingItemId(doc._id);
    setMiniModalItemId(null);
  }, []);

  const handleRenameSubfolder = useCallback((subfolder) => {
    setRenameValue(subfolder.name);
    setRenamingItemId(subfolder._id);
    setMiniModalItemId(null);
  }, []);

  const validateRename = useCallback((item, type) => {
    if (!currentDossier?._id || !token || !renameValue.trim()) {
      setRenamingItemId(null);
      return;
    }
    if (type === 'document') {
      dispatch(renameDocumentInDossier(currentDossier._id, item, renameValue.trim(), null, token));
    } else if (type === 'subfolder') {
      dispatch(updateSubfolder(currentDossier._id, item._id, { name: renameValue.trim() }, token));
    }
    setRenamingItemId(null);
    setRenameValue('');
  }, [dispatch, currentDossier, token, renameValue]);

  const handleRenameKeyDown = useCallback((e, item, type) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      validateRename(item, type);
    } else if (e.key === 'Escape') {
      setRenamingItemId(null);
      setRenameValue('');
    }
  }, [validateRename]);

  const handleRenameValueChange = useCallback((e) => {
    setRenameValue(e.target.value);
  }, []);

  const handleRenameBlur = useCallback((item, type) => {
    setTimeout(() => {
      if (renamingItemId === item._id) {
        validateRename(item, type);
      }
    }, 150);
  }, [renamingItemId, validateRename]);

  const confirmDeleteItem = useCallback((item, type) => {
    setItemToDelete({ item, type });
    setShowConfirmDelete(true);
    setMiniModalItemId(null);
  }, []);

  const handleDeleteItem = useCallback(() => {
    if (!itemToDelete || !currentDossier?._id || !token) return;
    const { item, type } = itemToDelete;
    
    if (type === 'document') {
      dispatch(deleteDocumentAction(currentDossier._id, item, token));
    } else if (type === 'subfolder') {
      dispatch(deleteSubfolder(currentDossier._id, item._id, token));
    }
    setShowConfirmDelete(false);
    setItemToDelete(null);
  }, [dispatch, itemToDelete, currentDossier, token]);

  const cancelDelete = useCallback(() => {
    setShowConfirmDelete(false);
    setItemToDelete(null);
  }, []);

  const handleCreateSubfolder = useCallback((name) => {
    if (!currentDossier?._id || !token || !name) return;
    dispatch(createSubfolder(currentDossier._id, name, token));
  }, [dispatch, currentDossier, token]);

  const handleMoveDocumentToSubfolder = useCallback((docId, subfolderId) => {
    if (!currentDossier?._id || !token || !docId) return;
    dispatch(moveDocumentToSubfolder(currentDossier._id, docId, subfolderId, token));
  }, [dispatch, currentDossier, token]);

  const handleDocumentCreated = useCallback(() => {
    // La logique de rafraîchissement est gérée par des listeners WebSocket
  }, []);

  return {
    miniModalItemId,
    renamingItemId,
    renameValue,
    itemToDelete,
    showConfirmDelete,
    setMiniModalItemId,
    setRenamingItemId,
    setRenameValue,
    handleDuplicateDocument,
    handleRenameDocument,
    handleRenameSubfolder,
    validateRename,
    handleRenameKeyDown,
    handleRenameValueChange,
    handleRenameBlur,
    confirmDeleteItem,
    handleDeleteItem,
    cancelDelete,
    handleCreateSubfolder,
    handleMoveDocumentToSubfolder,
    handleDocumentCreated,
  };
};