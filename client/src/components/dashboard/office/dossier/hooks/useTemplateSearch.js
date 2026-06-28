import { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDocumentTemplates,
  createDocumentInDossier,
} from '../../../../../redux/slices/currentDossierSlice';

// Hook pour gérer la recherche et la sélection de modèles
export const useTemplateSearch = () => {
  const dispatch = useDispatch();
  const { documentTemplates, loading: loadingTemplates } = useSelector(state => state.currentDossier);
  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  const user = useSelector(state => state.login.user);
  const token = useSelector(state => state.login.token);

  const [searchTerm, setSearchTerm] = useState('');
  const [showList, setShowList] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showReceiverModal, setShowReceiverModal] = useState(false);

  // Ref pour le debounce du dispatch
  const debounceRef = useRef(null);

  useEffect(() => {
    // Charger les templates au montage si la liste est vide
    if (documentTemplates.length === 0) {
      dispatch(fetchDocumentTemplates(''));
    }
  }, [dispatch, documentTemplates.length]);

  // Nettoyage du timer au démontage
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setShowList(value.trim() !== '');

    // Debounce l'appel API pour eviter de bloquer l'input
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      dispatch(fetchDocumentTemplates(value));
    }, 300);
  }, [dispatch]);

  // <<< MODIFICATION ICI: Ajout du paramètre "subfolderId" >>>
  const handleTemplateClick = useCallback((template, subfolderId = null) => {
    if (!currentDossier?._id || !token || !user) return;

    setShowList(false);
    setSearchTerm('');

    const dossierId = currentDossier._id;
    const tplFile = template.templateFileName || template.name;
    const finalName = template.name;

    if (template.categorie === 'allDos' || template.categorie === 'dropped') {
      // <<< MODIFICATION ICI: Passage de "subfolderId" à l'action >>>
      dispatch(createDocumentInDossier(dossierId, tplFile, token, user, [], template.categorie, finalName, subfolderId));
    } else {
      // <<< MODIFICATION ICI: Stockage de "subfolderId" avec le template pour la modale de destinataires >>>
      setSelectedTemplate({ ...template, templateFileName: tplFile, finalDocumentName: finalName, subfolderId });
      setShowReceiverModal(true);
    }
  }, [currentDossier, token, user, dispatch]);

  const handleFocus = useCallback(() => {
    if (searchTerm.trim() !== '') {
      setShowList(true);
    }
  }, [searchTerm]);

  return {
    searchTerm,
    showList,
    loadingTemplates,
    documentTemplates,
    selectedTemplate,
    showReceiverModal,
    setShowReceiverModal,
    handleSearchChange,
    handleTemplateClick,
    handleFocus,
  };
};
