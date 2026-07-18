import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { useDocumentActions } from './hooks/useDocumentActions';
import { useDossierInfo } from './hooks/useDossierInfo';
import { useSocketListeners } from './hooks/useSocketListeners';
import { useTemplateSearch } from './hooks/useTemplateSearch';
import apiClient from '../../../../services/apiClient';
import {
    filesFromDrop,
    isExternalFileDrag,
    uploadDroppedFileWeb,
} from '../../../../services/droppedFileService';
import { fetchAllDocumentsInDossier, createBlankDocument, addDroppedDocumentToList } from '../../../../redux/slices/currentDossierSlice';
import { useToast } from '../../../common/notifications/useToast';
import { AIAssistantPanel } from '../../../ai';
import { isFeatureEnabled } from '../../../../utils/featureFlags';

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
import {
    buildDossierContactEditNavigation,
    isClassicContactEntity,
} from './contactEditNavigation';

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
    const externalDragDepthRef = useRef(0);
    const uploadResetTimerRef = useRef(null);
    const dispatch = useDispatch();
    const navigate = useNavigate();
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
    const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
    const [textExportProgress, setTextExportProgress] = useState(null);
    // Filtre par categorie : all | courriers | actes | pieces
    const [activeFilter, setActiveFilter] = useState('all');
    // Tri par date : date-desc (recent en premier) | date-asc
    const [sortMode, setSortMode] = useState('date-desc');

    useSocketListeners();

    // === Export texte du dossier (mode WEB : REST serveur) ===
    // L'ancien flux passait par l'agent de bureau via socket.io (localhost:8080),
    // qui n'existe pas en web -> restait bloque sur « Initialisation ». Desormais
    // le SERVEUR extrait le texte de tous les documents (docx/pdf/txt) et renvoie
    // le TXT ; on declenche ici le telechargement cote navigateur.
    const handleGenerateTextExport = useCallback(async () => {
      if (!currentDossier?._id || !token) return;
      setTextExportProgress({ current: 0, total: 0, currentDoc: 'Extraction en cours sur le serveur…' });
      try {
        const { data } = await apiClient.post(
          `/api/word/text-export/${currentDossier._id}`,
          {},
          { timeout: 300000 }, // extraction de tout un dossier : jusqu'a 5 min
        );
        // Telechargement navigateur du .txt genere.
        const blob = new Blob([data.txtContent || ''], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.fileName || 'Export_dossier.txt';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => window.URL.revokeObjectURL(url), 4000);
        setTextExportProgress({
          current: data.total || 0, total: data.total || 0, done: true,
          fileName: data.fileName, errorCount: data.errorCount || 0,
        });
      } catch (err) {
        setTextExportProgress({
          done: false,
          error: err.response?.data?.message || err.message || "L'export a échoué.",
        });
      }
    }, [currentDossier?._id, token]);

    const toast = useToast();

    // Document Word vierge : fiche + fichier fabriqué côté serveur (mode web)
    // ou copié localement (mode Electron). Créé dans le sous-dossier courant.
    const handleCreateBlankDocument = useCallback(async () => {
      if (!currentDossier?._id) return;
      const subfolderId = currentView.type === 'subfolder' ? currentView.folderId : null;
      try {
        await dispatch(createBlankDocument(currentDossier._id, subfolderId));
        toast.success('Document vierge créé.', { title: 'Documents' });
      } catch (error) {
        toast.error(error.message || 'La création du document vierge a échoué.');
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDossier?._id, currentView, dispatch, toast]);

    const docActions = useDocumentActions();

    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(null);

    useEffect(() => () => {
        if (uploadResetTimerRef.current) clearTimeout(uploadResetTimerRef.current);
    }, []);

    // Le drag interne (move depuis et vers les sous-dossiers) est géré par
    // un drag custom mouse-based dans DocumentList (handleSourceMouseDown).
    // handleDrop ci-dessous ne traite plus que le drop EXTERNE depuis Explorer
    // Windows pour l'upload. Cf. DocumentList.js pour le drag custom.

    const handleDragOver = useCallback((e) => {
        if (!isExternalFileDrag(e.dataTransfer)) return;
        // Sans preventDefault, Chromium ouvre le fichier a la place de
        // l'application. dropEffect donne en plus le curseur « copie » natif.
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        setIsDraggingOver(true);
    }, []);

    const handleDragEnter = useCallback((e) => {
        if (!isExternalFileDrag(e.dataTransfer)) return;
        e.preventDefault();
        externalDragDepthRef.current += 1;
        setIsDraggingOver(true);
    }, []);

    const handleDragLeave = useCallback((e) => {
        // Chromium peut vider dataTransfer.types sur le dernier dragleave :
        // le compteur actif reste alors la source de verite.
        if (!isExternalFileDrag(e.dataTransfer) && externalDragDepthRef.current === 0) return;
        e.preventDefault();
        externalDragDepthRef.current = Math.max(0, externalDragDepthRef.current - 1);
        if (externalDragDepthRef.current === 0) {
            setIsDraggingOver(false);
        }
    }, []);

    const handleImportFiles = useCallback(async (selectedFiles) => {
        if (uploadResetTimerRef.current) {
            clearTimeout(uploadResetTimerRef.current);
            uploadResetTimerRef.current = null;
        }
        const files = Array.from(selectedFiles || []).filter(Boolean);
        if (files.length === 0) return;

        if (!currentDossier?._id || !token) {
            const errorMsg = "Aucun dossier selectionne ou session invalide.";
            console.error(`[Drop] Erreur: ${errorMsg}`);
            setUploadProgress({ error: errorMsg });
            uploadResetTimerRef.current = setTimeout(() => setUploadProgress(null), 3000);
            return;
        }

        const totalFiles = files.length;
        let completedFiles = 0;
        let uploadedFiles = 0;
        const failures = [];

        setUploadProgress({
            status: 'uploading',
            currentFile: 1,
            completedFiles: 0,
            totalFiles,
            currentFileName: files[0].name,
            error: null,
        });

        for (let i = 0; i < totalFiles; i++) {
            const file = files[i];
            const currentFileNumber = i + 1;

            setUploadProgress({
                status: 'uploading',
                currentFile: currentFileNumber,
                completedFiles,
                totalFiles,
                currentFileName: file.name,
                error: null,
            });

            try {
                // Mode WEB pur : fiche + octets envoyés directement au serveur
                // (remplace l'ancien agent Electron local, disparu).
                const doc = await uploadDroppedFileWeb(file, currentDossier._id, currentView.folderId);
                // Affichage immédiat dans la liste (l'événement socket
                // 'single_document_added' de l'ancien agent n'existe plus).
                dispatch(addDroppedDocumentToList(doc));
                uploadedFiles += 1;
            } catch (err) {
                const errorMessage = err?.message || 'Erreur inconnue lors de l\'upload.';
                console.error(`[Drop Loop] ERREUR sur le fichier "${file.name}":`, errorMessage);
                failures.push(`« ${file.name} » : ${errorMessage}`);
            } finally {
                completedFiles += 1;
                setUploadProgress({
                    status: 'uploading',
                    currentFile: currentFileNumber,
                    completedFiles,
                    totalFiles,
                    currentFileName: file.name,
                    error: null,
                });
            }
        }

        // Le rafraichissement autoritatif evite tout ecart entre l'ajout
        // optimiste et le dossier reel (socket coupe, normalisation serveur,
        // nettoyage d'une fiche apres erreur de stockage, etc.).
        try {
            await dispatch(fetchAllDocumentsInDossier(currentDossier._id, token));
        } catch (refreshError) {
            console.warn('[Drop] Rafraichissement du dossier impossible:', refreshError?.message);
        }

        if (failures.length > 0) {
            const summary = uploadedFiles > 0
                ? `${uploadedFiles} fichier${uploadedFiles > 1 ? 's' : ''} ajouté${uploadedFiles > 1 ? 's' : ''}. ${failures.length} échec${failures.length > 1 ? 's' : ''}.`
                : `Aucun fichier ajouté. ${failures.length} échec${failures.length > 1 ? 's' : ''}.`;
            const error = `${summary} ${failures.join(' ')}`;
            setUploadProgress(prev => ({ ...prev, status: 'error', error }));
            toast.error(summary, { title: 'Documents' });
            uploadResetTimerRef.current = setTimeout(() => setUploadProgress(null), 6000);
            return;
        }

        setUploadProgress(prev => ({
            ...prev,
            status: 'success',
            completedFiles: totalFiles,
            currentFile: totalFiles,
        }));
        toast.success(
            `${uploadedFiles} fichier${uploadedFiles > 1 ? 's' : ''} ajouté${uploadedFiles > 1 ? 's' : ''} au dossier.`,
            { title: 'Documents' },
        );
        uploadResetTimerRef.current = setTimeout(() => setUploadProgress(null), 1400);

    }, [currentDossier, token, currentView.folderId, dispatch, toast]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        externalDragDepthRef.current = 0;
        setIsDraggingOver(false);
        return handleImportFiles(filesFromDrop(e.dataTransfer));
    }, [handleImportFiles]);
    // Si un hook lifte est passe en prop (depuis Dossier/index.js), on l'utilise.
    // Sinon, on instancie le hook localement (pour conserver la compat avec
    // les usages historiques de DocumentsStockesDossier).
    const localDossierInfo = useDossierInfo(currentDossier);
    const dossierInfo = dossierInfoOverride || localDossierInfo;
    const selectedDossierEntity = dossierInfo.selectedEntity;
    const handleInlineEntityEdit = dossierInfo.handleToggleEdit;
    const [showSendModal, setShowSendModal] = useState(false);
    const [emailData, setEmailData] = useState({ to: '', doc: null, displayName: '', isLocalAttachment: false });
    const [showEditDossierModal, setShowEditDossierModal] = useState(false);

    // Une personne/organisation issue du referentiel de contacts doit etre
    // modifiee dans le formulaire complet. Les rares snapshots OfficeUser
    // continuent d'utiliser l'editeur compact historique, qui est le seul a
    // connaitre leur modele de donnees.
    const editOpensFullContact = isClassicContactEntity(selectedDossierEntity);
    const handleEditSelectedEntity = useCallback(() => {
        const navigation = buildDossierContactEditNavigation({
            dossierId: currentDossier?._id,
            selectedEntity: selectedDossierEntity,
        });
        if (!navigation) {
            handleInlineEntityEdit();
            return;
        }
        navigate(navigation.to, { state: navigation.state });
    }, [
        currentDossier?._id,
        selectedDossierEntity,
        handleInlineEntityEdit,
        navigate,
    ]);

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
                    handleToggleEdit={handleEditSelectedEntity}
                    editOpensFullContact={editOpensFullContact && !dossierInfo.isEditing}
                    openLinkedContactModal={dossierInfo.openLinkedContactModal}
                    onOpenBlankEmail={() => { setEmailData({ to: '', doc: null }); setShowSendModal(true); }}
                    onAddSubfolderClick={() => setIsSubfolderModalOpen(true)}
                    onCreateBlankDocument={handleCreateBlankDocument}
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
                    onOpenAIAssistant={isFeatureEnabled('aiAssistant') ? () => setIsAIAssistantOpen(true) : undefined}
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
                        handleImportFiles={handleImportFiles}
                        isImportingFiles={uploadProgress?.status === 'uploading'}
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
            {isAIAssistantOpen && ReactDOM.createPortal(
              <div className="dossier-ai-drawer" role="presentation">
                <AIAssistantPanel
                  matterId={currentDossier?._id || ''}
                  matterTitle={currentDossier?.dossier?.dossier?.nom || currentDossier?.reference || 'Dossier actif'}
                  availableSources={(allDocuments || []).map((document) => ({
                    id: document._id,
                    documentId: document._id,
                    label: document.nomDocument || 'Document sans titre',
                    version: document.currentVersionId || document.version || 'courante',
                    pages: document.pages || null,
                    categorie: document.categorie || '',
                    confidential: document.confidential === true,
                    selectable: document.deletedAt == null,
                  }))}
                  onClose={() => setIsAIAssistantOpen(false)}
                  onOpenSettings={() => navigate('/dashboard/parametres', { state: { activeTab: 'ai' } })}
                  onOpenCitation={(citation) => {
                    const sourceId = citation?.documentId || citation?.sourceId;
                    window.dispatchEvent(new CustomEvent('kheops:open-ai-source', { detail: { documentId: sourceId } }));
                  }}
                  onDocumentCreated={(result) => {
                    if (currentDossier?._id) dispatch(fetchAllDocumentsInDossier(currentDossier._id, token));
                    const created = result?.document || result;
                    toast.success(
                      created?.nomDocument || created?.title
                        ? `Brouillon « ${created.nomDocument || created.title} » créé et à valider.`
                        : 'Brouillon IA créé et à valider.',
                      { title: 'Assistant IA' },
                    );
                  }}
                />
              </div>,
              document.body,
            )}
        </div>
    );
};

export default DocumentsStockesDossier;
