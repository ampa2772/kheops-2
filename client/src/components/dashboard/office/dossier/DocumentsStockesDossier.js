import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';

import { useDocumentActions } from './hooks/useDocumentActions';
import { useDossierInfo } from './hooks/useDossierInfo';
import { useSocketListeners } from './hooks/useSocketListeners';
import { useTemplateSearch } from './hooks/useTemplateSearch';
import { processDroppedFile, requestTextExport, subscribeToEvent, unsubscribeFromEvent } from '../../../../services/socketService';
import { fetchAllDocumentsInDossier } from '../../../../redux/slices/currentDossierSlice';

import DocumentSearchBar, { DocumentFilterPills } from './DocumentsStockes/DocumentSearchBar';
import DocumentList from './DocumentsStockes/DocumentList';
import DossierInfoPanel from './DocumentsStockes/DossierInfoPanel';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import SendEmailModal from './DocumentsStockes/SendEmailModal';
import EditDossierModal from './EditDossierModal';
import EditDossierDivorceCMModal from '../../../divorceCM/EditDossierDivorceCMModal';
import AddSubfolderModal from './DocumentsStockes/AddSubfolderModal';
import AJModal from './DocumentsStockes/AJModal';
import InfoDossierTextModal from './DocumentsStockes/InfoDossierTextModal';
import UploadProgressBar from './DocumentsStockes/UploadProgressBar';
import DocumentGenerationProgress from './DocumentsStockes/DocumentGenerationProgress';
import ModalSelectReceiver from './DocumentsStockes/ModalSelectReceiver';
import TextExportProgressModal from './DocumentsStockes/TextExportProgressModal';

import { SkeletonList } from '../../../common/Skeleton';
import './styles.css';

function getDisplayLabel(full) {
    if (!full) return 'Entite invalide';
    const isAvocat = full.type === 'Avocat';
    const isNotaire = full.type === 'Notaire' || full.profession === 'Notaire';
    const isCommissaire = full.type === 'Commissaire de justice' || full.profession === 'Commissaire de justice';
    const hasOfficeUserName = !!full.nomOfficeUser;
    const isPMPrivee = !!full.raisonSociale && !hasOfficeUserName && !isAvocat && !isCommissaire && !isNotaire;
    const isPMPublique = !!full.denomination && !hasOfficeUserName && !isAvocat && !isCommissaire && !isNotaire && !isPMPrivee;
    const isPhysique = !hasOfficeUserName && !isPMPrivee && !isPMPublique && !isAvocat && !isNotaire && !isCommissaire;

    if (isAvocat) return `${full.nomOfficeUser || full.nom || ''} ${full.prenomOfficeUser || full.prenoms || ''}`.trim() + ' (Avocat)';
    if (isNotaire) return `${full.nom || ''} ${full.prenoms || ''}`.trim() + ' (Notaire)';
    if (isCommissaire) return `${full.nom || ''} ${full.prenoms || ''}`.trim() + ' (CDJ)';
    if (isPMPrivee) return `${full.raisonSociale || ''}`.trim() + ' (PM Privee)';
    if (isPMPublique) return `${full.denomination || ''}`.trim() + ' (PM Publique)';
    if (isPhysique) return `${full.nom || ''} ${full.prenoms || ''}`.trim();
    return full.nom || full.raisonSociale || full.denomination || 'Entite inconnue';
}

function getExtraClass(entity) {
    if (!entity) return '';
    let base = entity.type === 'Avocat' ? 'avocatItem' : (entity.type === 'Partie' ? 'partieName' : 'linkedContactItem');
    if (entity.isContre) base += 'Contre';
    return base;
}

function groupPartiesAndContacts(dossier) {
    if (!dossier?.dossier?.parties) return { pour: [], contre: [] };
    const { pour, contre } = dossier.dossier.parties;
    const respons = dossier.dossier.responsables || [];
    const avocatsResp = dossier.dossier.avocatsResponsables || [];
    const excluded = new Set([...respons, ...avocatsResp].map(e => e._id));

    const buildSide = (arr, isContre) =>
      (arr || []).flatMap(p => {
        const block = { partieData: null, avocats: [], contacts: [] };
        if (p.partieData && !excluded.has(p.partieData._id)) block.partieData = { ...p.partieData, type: 'Partie', isContre };
        block.avocats = (p.avocats || []).filter(a => !excluded.has(a._id)).map(a => ({ ...a, type: 'Avocat', isContre }));
        block.contacts = (p.contacts || []).filter(c => !excluded.has(c._id)).map(c => ({ ...c, type: 'Contact', isContre }));
        return block.partieData || block.avocats.length || block.contacts.length ? [block] : [];
      });

    return { pour: buildSide(pour, false), contre: buildSide(contre, true) };
}

const DocumentsStockesDossier = ({ dossierInfoOverride } = {}) => {
    const containerRef = useRef(null);
    const dispatch = useDispatch();
    const { dossier: currentDossier, loading: dossierLoading } = useSelector(state => state.currentDossier);
    const token = useSelector(state => state.login.token);

    useEffect(() => {
        if (!currentDossier?.dossier?.documents) {
             console.warn("[DocumentsStockesDossier] Attention: currentDossier ou documents manquant/vide.");
        }
    }, [currentDossier]);

    // GARANTIE DE STRUCTURE : Fallback a [] si undefined
    const allDocuments = currentDossier?.dossier?.documents || [];
    const allSubfolders = currentDossier?.subfolders || [];

    const [currentView, setCurrentView] = useState({ type: 'root', folderId: null, folderName: '' });
    const [isSubfolderModalOpen, setIsSubfolderModalOpen] = useState(false);
    const [isAJModalOpen, setIsAJModalOpen] = useState(false);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [textExportProgress, setTextExportProgress] = useState(null);
    // Filtre par categorie : all | courriers | actes | pieces
    const [activeFilter, setActiveFilter] = useState('all');
    // Tri par date : date-desc (recent en premier) | date-asc
    const [sortMode, setSortMode] = useState('date-desc');

    useSocketListeners();

    // === Listeners pour l'export texte ===
    useEffect(() => {
      const handleProgress = (data) => {
        if (data.dossierId === currentDossier?._id) {
          setTextExportProgress({ current: data.current, total: data.total, currentDoc: data.currentDoc });
        }
      };
      const handleSuccess = (data) => {
        if (data.dossierId === currentDossier?._id) {
          setTextExportProgress({ current: data.total || 0, total: data.total || 0, done: true, fileName: data.fileName, errorCount: data.errorCount || 0 });
          // Rafraîchir la liste des documents depuis le serveur
          if (token) {
            dispatch(fetchAllDocumentsInDossier(data.dossierId, token));
          }
        }
      };
      const handleError = (data) => {
        if (data.dossierId === currentDossier?._id) {
          setTextExportProgress((prev) => ({ ...(prev || {}), done: false, error: data.message }));
        }
      };

      subscribeToEvent('text_export_progress', handleProgress);
      subscribeToEvent('text_export_success', handleSuccess);
      subscribeToEvent('text_export_error', handleError);

      return () => {
        unsubscribeFromEvent('text_export_progress', handleProgress);
        unsubscribeFromEvent('text_export_success', handleSuccess);
        unsubscribeFromEvent('text_export_error', handleError);
      };
    }, [currentDossier?._id, dispatch]);

    const handleGenerateTextExport = useCallback(() => {
      if (!currentDossier?._id || !token) return;
      setTextExportProgress({ current: 0, total: 0, currentDoc: 'Initialisation...' });
      requestTextExport(currentDossier._id, token);
    }, [currentDossier?._id, token]);

    const docActions = useDocumentActions();

    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);

    // Le drag interne (move depuis et vers les sous-dossiers) est géré par
    // un drag custom mouse-based dans DocumentList (handleSourceMouseDown).
    // handleDrop ci-dessous ne traite plus que le drop EXTERNE depuis Explorer
    // Windows pour l'upload. Cf. DocumentList.js pour le drag custom.

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) {
            setIsDraggingOver(true);
        }
    }, []);

    const handleDragEnter = handleDragOver;

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsDraggingOver(false);
        }
    }, []);

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        setIsDraggingOver(false);

        if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

        if (!currentDossier?._id || !token) {
            const errorMsg = "Aucun dossier selectionne ou session invalide.";
            console.error(`[Drop] Erreur: ${errorMsg}`);
            setUploadProgress({ error: errorMsg });
            setTimeout(() => setUploadProgress(null), 3000);
            return;
        }

        const files = Array.from(e.dataTransfer.files);
        const totalFiles = files.length;

        setUploadProgress({ currentFile: 1, totalFiles, currentFileName: files[0].name, error: null });

        for (let i = 0; i < totalFiles; i++) {
            const file = files[i];
            const currentFileNumber = i + 1;

            setUploadProgress(prev => ({ ...prev, currentFile: currentFileNumber, totalFiles, currentFileName: file.name, error: null }));

            try {
                await processDroppedFile(file, currentDossier._id, token, currentView.folderId);
            } catch (err) {
                const errorMessage = err?.message || 'Erreur inconnue lors de l\'upload.';
                console.error(`[Drop Loop] ERREUR sur le fichier "${file.name}":`, errorMessage);
                setUploadProgress(prev => ({ ...prev, error: `Erreur sur "${file.name}": ${errorMessage}` }));
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        setTimeout(() => setUploadProgress(null), 1500);

    }, [currentDossier, token, currentView.folderId]);
    // Si un hook lifte est passe en prop (depuis Dossier/index.js), on l'utilise.
    // Sinon, on instancie le hook localement (pour conserver la compat avec
    // les usages historiques de DocumentsStockesDossier).
    const localDossierInfo = useDossierInfo(currentDossier);
    const dossierInfo = dossierInfoOverride || localDossierInfo;
    const [showSendModal, setShowSendModal] = useState(false);
    const [emailData, setEmailData] = useState({ to: '', doc: null, displayName: '', isLocalAttachment: false });
    const [showEditDossierModal, setShowEditDossierModal] = useState(false);

    // === Hook de recherche de templates (remplace le bouton "+") ===
    const templateSearch = useTemplateSearch();

    // Wrapper pour passer le subfolderId courant au clic sur un template
    const handleTemplateClick = useCallback((template) => {
        templateSearch.handleTemplateClick(template, currentView.folderId);
    }, [templateSearch, currentView.folderId]);

    const handleOpenEditDossierModal = () => {
        if (currentDossier) {
            setShowEditDossierModal(true);
            dossierInfo.setShowInfosDossier(false);
        }
    };

    const noDossier = !currentDossier?.dossier;

    const handleSubfolderSubmit = (name) => {
        docActions.handleCreateSubfolder(name);
        setIsSubfolderModalOpen(false);
    };

    const handleNavigateToSubfolder = (folder) => {
        setCurrentView({ type: 'subfolder', folderId: folder._id, folderName: folder.name });
    };

    const handleNavigateToRoot = () => {
        setCurrentView({ type: 'root', folderId: null, folderName: '' });
    };

    const baseDocumentsToShow = currentView.type === 'root'
        ? allDocuments.filter(doc => !doc.subfolderId)
        : allDocuments.filter(doc => doc.subfolderId === currentView.folderId);

    // Classification document -> categorie d'affichage (courriers | actes | pieces)
    const classifyDocument = (doc) => {
        const name = (doc?.nomDocument || '').toLowerCase();
        const cat = (doc?.categorie || '').toLowerCase();
        if (name.includes('courrier') || name.startsWith('courrier')) return 'courriers';
        if (
            name.includes('assignation')
            || name.includes('conclusion')
            || name.includes('requete')
            || name.includes('plaidoirie')
            || name.includes('jugement')
            || name.includes('decision')
            || name.includes('ordonnance')
            || name.includes('arret')
        ) return 'actes';
        if (cat === 'dropped') return 'pieces';
        if (cat === 'selectonedestinataire' || cat === 'selectmultidestinataire') return 'courriers';
        return 'pieces';
    };

    const documentsToShow = activeFilter === 'all'
        ? baseDocumentsToShow
        : baseDocumentsToShow.filter(doc => classifyDocument(doc) === activeFilter);

    const subfoldersToShow = currentView.type === 'root' ? allSubfolders : [];

    const handleToggleSort = () => {
        setSortMode(prev => prev === 'date-desc' ? 'date-asc' : 'date-desc');
    };

    return (
        <div className="docStockContainer">
            <UploadProgressBar progress={uploadProgress} error={uploadProgress?.error} />
            <DocumentGenerationProgress />

            <div className="documentsStockesContent" ref={containerRef}>
                <DocumentSearchBar
                    showInfosDossier={dossierInfo.showInfosDossier}
                    handleBackOrToggleInfos={dossierInfo.showInfosDossier ? dossierInfo.handleBackOrToggleInfos : handleOpenEditDossierModal}
                    selectedEntity={dossierInfo.selectedEntity}
                    isEditing={dossierInfo.isEditing}
                    handleToggleEdit={dossierInfo.handleToggleEdit}
                    openLinkedContactModal={dossierInfo.openLinkedContactModal}
                    onOpenBlankEmail={() => { setEmailData({ to: '', doc: null }); setShowSendModal(true); }}
                    onAddSubfolderClick={() => setIsSubfolderModalOpen(true)}
                    onOpenAJModal={() => setIsAJModalOpen(true)}
                    onOpenInfoModal={() => setIsInfoModalOpen(true)}
                    searchTerm={templateSearch.searchTerm}
                    onSearchChange={templateSearch.handleSearchChange}
                    onSearchFocus={templateSearch.handleFocus}
                    showTemplateList={templateSearch.showList}
                    documentTemplates={templateSearch.documentTemplates}
                    onTemplateClick={handleTemplateClick}
                    loadingTemplates={templateSearch.loadingTemplates}
                    currentView={currentView}
                    onNavigateToRoot={handleNavigateToRoot}
                    onGenerateTextExport={handleGenerateTextExport}
                    sortMode={sortMode}
                    onToggleSort={handleToggleSort}
                />
            </div>

            {/* Rangee dediee pour les filtres : toujours visible quelle que soit la largeur */}
            {!dossierInfo.showInfosDossier && currentView.type === 'root' && (
                <div className="dossier-filter-bar">
                    <DocumentFilterPills
                        activeFilter={activeFilter}
                        onFilterChange={setActiveFilter}
                    />
                </div>
            )}

            <div className="mainContentArea">
                {noDossier ? (
                  dossierLoading
                    ? <SkeletonList rows={4} />
                    : <p>Aucun dossier selectionne.</p>
                ) : dossierInfo.showInfosDossier ? (
                    <DossierInfoPanel
                        grouped={groupPartiesAndContacts(currentDossier)}
                        {...dossierInfo}
                        handleSelectEntityForInfo={dossierInfo.handleSelectEntity}
                        getDisplayLabel={getDisplayLabel}
                        getExtraClass={getExtraClass}
                    />
                ) : (
                    <DocumentList
                        subfolders={subfoldersToShow}
                        documents={documentsToShow}
                        allDocuments={allDocuments}
                        onNavigateToSubfolder={handleNavigateToSubfolder}
                        currentSubfolderId={currentView.folderId}
                        isDraggingOver={isDraggingOver}
                        handleDragOver={handleDragOver}
                        handleDragEnter={handleDragEnter}
                        handleDragLeave={handleDragLeave}
                        handleDrop={handleDrop}
                        sortMode={sortMode}
                        classifyDocument={classifyDocument}
                        {...docActions}
                    />
                )}
            </div>

            {docActions.showConfirmDelete && docActions.itemToDelete && (
              <ConfirmDeleteModal
                itemToDelete={docActions.itemToDelete}
                onConfirm={() => docActions.handleDeleteItem()}
                onCancel={docActions.cancelDelete}
              />
            )}
            {showSendModal && (
              <SendEmailModal
                recipient={emailData.to}
                doc={emailData.doc}
                displayName={emailData.displayName}
                isLocalAttachment={emailData.isLocalAttachment}
                onClose={() => setShowSendModal(false)}
              />
            )}
            {showEditDossierModal && currentDossier && (
              (currentDossier?.dossier?.dossier?.type_dossier === 'divorce_cm'
                || currentDossier?.dossier?.type_dossier === 'divorce_cm')
                ? (
                  <EditDossierDivorceCMModal
                    dossier={currentDossier}
                    onClose={() => setShowEditDossierModal(false)}
                  />
                ) : (
                  <EditDossierModal
                    dossier={currentDossier}
                    onClose={() => setShowEditDossierModal(false)}
                  />
                )
            )}
            <AddSubfolderModal
                isOpen={isSubfolderModalOpen}
                onClose={() => setIsSubfolderModalOpen(false)}
                onSubmit={handleSubfolderSubmit}
            />
            <AJModal
                isOpen={isAJModalOpen}
                onClose={() => setIsAJModalOpen(false)}
                dossier={currentDossier}
            />
            {isInfoModalOpen && (
              <InfoDossierTextModal
                isOpen={isInfoModalOpen}
                onClose={() => setIsInfoModalOpen(false)}
                dossier={currentDossier}
              />
            )}
            {templateSearch.showReceiverModal && templateSearch.selectedTemplate && currentDossier && (
              <ModalSelectReceiver
                onClose={() => templateSearch.setShowReceiverModal(false)}
                template={templateSearch.selectedTemplate}
                dossier={currentDossier}
                onDocumentCreated={() => {}}
              />
            )}
            <TextExportProgressModal
              isOpen={!!textExportProgress}
              onClose={() => setTextExportProgress(null)}
              progress={textExportProgress}
            />
        </div>
    );
};

export default DocumentsStockesDossier;
