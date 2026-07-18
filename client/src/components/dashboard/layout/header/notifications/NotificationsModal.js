import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import ReactDOM from 'react-dom';
import { sanitizeEmailHtml } from '../../../../../utils/sanitizeEmailHtml';
import TimeAgo from 'react-timeago';
import frStrings from 'react-timeago/lib/language-strings/fr';
import buildFormatter from 'react-timeago/lib/formatters/buildFormatter';
import apiClient from '../../../../../services/apiClient';
import mailAccountService from '../../../../../services/mailAccountService';
import MailAccountSetupModal from '../../../office/mails/MailAccountSetupModal';
import { userHasOAuthMail, shouldOfferMailSetup } from '../../../../../utils/mailSetupDecision';
import { Document, Page, pdfjs } from 'react-pdf';
import { renderAsync } from 'docx-preview';
import { useNavigate } from 'react-router-dom';

import { 
  fetchNotifications, 
  fetchNotificationDetail, 
  clearNotificationDetail, 
  closeNotificationsModal,
  markNotificationAsRead,
  toggleShowReadNotifications
} from '../../../../../redux/slices/layoutSlice';
import { initSocket, subscribeToEvent, unsubscribeFromEvent } from '../../../../../services/socketService';
import { updateCurrentDossierFromSocket, setCurrentDossier, MOVE_DOSSIER_TO_TOP } from '../../../../../redux/slices/currentDossierSlice';
import { resetDossier, setPendingEmailActionForDossierCreation } from '../../../../../redux/slices/dossierInfoSlice';
import { setPartie, resetParties } from '../../../../../redux/slices/partieSlice';
import { useToast } from '../../../../common/notifications/useToast';

import BTN_RetourArriere from '../../../../../assets/en-arriere.svg';
import wordIcon from '../../../../../assets/word-icon.svg';
import pdfIcon from '../../../../../assets/pdf-icon.svg';
import imageIcon from '../../../../../assets/image-icon.svg';
import defaultAttachmentIcon from '../../../../../assets/piece-jointe-yellow.svg';

import IconEnvoyerVersDossier from '../../../../../assets/Envoyer_vers_Dossier.svg';
import IconTelecharger from '../../../../../assets/telechargements.svg';
import IconOuvrirDossier from '../../../../../assets/ouvrir-le-dossier-avec-le-document.svg';
import IconDossierPourEnvoi from '../../../../../assets/dossier-plus.svg';

import Fleche from '../../../../../assets/fleche.svg'

import FullScreenLoader from '../../../../common/FullScreenLoader';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import './NotificationsModal.css';

pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

const formatter = buildFormatter(frStrings);

// Format court pour le timestamp des cards (ex: "1h", "15j") — distinct du
// formatter long utilise dans le footer "Synchronise · ...".
const shortFrStrings = {
  prefixAgo: 'il y a', prefixFromNow: '', suffixAgo: '', suffixFromNow: '',
  seconds: 'qq sec', minute: '1min', minutes: '%dmin',
  hour: '1h', hours: '%dh', day: '1j', days: '%dj',
  month: '1m', months: '%dm', year: '1a', years: '%da', wordSeparator: ' ',
};
const shortFormatter = buildFormatter(shortFrStrings);

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0][0] || '?').toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const extractEmail = (fromHeader) => {
  if (!fromHeader) return '';
  const m = fromHeader.match(/<([^>]+)>/);
  return m ? m[1] : fromHeader;
};

const formatSyncTime = (date) => {
  if (!date) return '—';
  const elapsed = Math.floor((Date.now() - date.getTime()) / 1000);
  if (elapsed < 5) return 'à l’instant';
  if (elapsed < 60) return `il y a ${elapsed}s`;
  if (elapsed < 3600) return `il y a ${Math.floor(elapsed / 60)}min`;
  return `il y a ${Math.floor(elapsed / 3600)}h`;
};

// API_BASE_URL supprimé — apiClient gère le baseURL automatiquement

// Fonctions helpers (inchangées)
const getAttachmentIcon = (filename) => {
  if (!filename) return { type: 'static', src: defaultAttachmentIcon };
  const extension = filename.split('.').pop().toLowerCase();
  switch (extension) {
    case 'doc': case 'docx': return { type: 'static', src: wordIcon };
    case 'pdf': return { type: 'static', src: pdfIcon };
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'webp': return { type: 'dynamic', src: imageIcon, extension: extension.toUpperCase() };
    default: return { type: 'static', src: defaultAttachmentIcon };
  }
};
const truncateFilename = (name, maxLength = 35) => {
    if (!name) return '';
    if (name.length <= maxLength) return name;
    const extensionMatch = name.match(/\.([^.]+)$/);
    const extension = extensionMatch ? extensionMatch[0] : '';
    const baseName = extension ? name.slice(0, -extension.length) : name;
    const availableLength = maxLength - extension.length - 3;
    if (availableLength <= 0) return '...' + extension;
    return baseName.slice(0, availableLength) + '...' + extension;
};
// Fin des fonctions helpers

const NotificationsModal = ({ isOpen, position, onClose }) => {
  const modalRef = useRef(null);
  const modalBodyRef = useRef(null);
  const dispatch = useDispatch();
  const toast = useToast();
  const navigate = useNavigate();
  const kheopsToken = useSelector((state) => state.login.token);

  const [pdfContainerWidth, setPdfContainerWidth] = useState(null);
  const previewContainerRef = useRef(null);
  const docxPreviewRef = useRef(null);

  const [modalView, setModalView] = useState('list');
  const [selectedEmailId, setSelectedEmailId] = useState(null);
  
  const [previewIndex, setPreviewIndex] = useState(0);
  
  const [previewContent, setPreviewContent] = useState(null);
  const [previewContentType, setPreviewContentType] = useState(null);
  const [previewNumPages, setPreviewNumPages] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const [sendEmailText, setSendEmailText] = useState(true);
  const [sendAttachment, setSendAttachment] = useState(true);

  const [sendToDossierStatus, setSendToDossierStatus] = useState({});

  const { list: notificationsList, loading, error, nextPageToken, hasMore, detail: emailDetail, detailLoading, detailError } = useSelector(state => state.layout.notifications);
  const showReadNotifications = useSelector(state => state.layout.showReadNotifications);

  const [isCheckingDossiers, setIsCheckingDossiers] = useState(false);
  const [dossiersForSendView, setDossiersForSendView] = useState([]);
  const [activeContactPopover, setActiveContactPopover] = useState(null);
  const last25Dossiers = useSelector(state => state.last25Dossiers.lastDossiers);

  // Etats locaux pour la nouvelle UI list (search + navigation clavier + sync indicator)
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const [, setSyncTick] = useState(0); // force re-render du label "synchronise"

  const filteredNotifications = useMemo(() => {
    let list = notificationsList || [];
    if (!showReadNotifications) list = list.filter(n => !n.isRead);
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter(n =>
        (n.kheopsContactName || '').toLowerCase().includes(q) ||
        (n.from || '').toLowerCase().includes(q) ||
        (n.subject || '').toLowerCase().includes(q) ||
        (n.snippet || '').toLowerCase().includes(q) ||
        (n.kheopsMatchingDossiers || []).some(d => (d.dossierName || '').toLowerCase().includes(q))
      );
    }
    return list;
  }, [notificationsList, showReadNotifications, searchTerm]);

  const totalCount = (notificationsList || []).length;
  const unreadCount = (notificationsList || []).filter(n => !n.isRead).length;

  // User courant : sert d'expediteur "À" dans le detail email (via le state login)
  const currentUserEmail = useSelector(state => state.login?.user?.email || '');

  // --- Connexion boîte mail depuis la cloche (comptes NI Google NI Microsoft) ---
  // Un compte OAuth (Google/Microsoft) reçoit ses mails automatiquement. Un
  // compte "générique" (Yahoo, Orange, OVH...) doit d'abord saisir les
  // coordonnées de sa boîte (IMAP/SMTP) : on le lui propose ici, avec la MÊME
  // fenêtre que la partie "Courriers" (MailAccountSetupModal).
  const loginUser = useSelector(state => state.login?.user);
  const hasOAuthMail = userHasOAuthMail(loginUser);
  const [imapAccounts, setImapAccounts] = useState(null); // null = pas encore vérifié
  const [showMailSetup, setShowMailSetup] = useState(false);
  // true seulement une fois la vérification faite : ni OAuth, ni boîte IMAP configurée.
  const needsMailSetup = shouldOfferMailSetup(loginUser, imapAccounts);

  // Charge les boîtes IMAP à l'ouverture de la cloche, pour les comptes non-OAuth.
  useEffect(() => {
    if (!isOpen) return undefined;
    if (hasOAuthMail) { setImapAccounts([]); return undefined; }
    let cancelled = false;
    mailAccountService.listAccounts()
      .then((list) => { if (!cancelled) setImapAccounts(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setImapAccounts([]); });
    return () => { cancelled = true; };
  }, [isOpen, hasOAuthMail]);

  // Après connexion d'une boîte : on ferme la fenêtre et on recharge les
  // notifications (le thunk relit les comptes et lira la nouvelle boîte).
  const handleMailAccountCreated = useCallback((account) => {
    setShowMailSetup(false);
    setImapAccounts((prev) => (Array.isArray(prev) ? [...prev, account] : [account]));
    dispatch(fetchNotifications());
  }, [dispatch]);

  // Notification correspondant au mail selectionne (utilise par la vue detail
  // pour recuperer kheopsContactName / emailRole / kheopsMatchingDossiers).
  const currentNotif = useMemo(() => {
    if (!selectedEmailId || !notificationsList) return null;
    return notificationsList.find(n => n.id === selectedEmailId) || null;
  }, [selectedEmailId, notificationsList]);

  // Le reste des hooks et callbacks reste inchangé jusqu'à `handleEmailClick`
  const attachmentForPreview = useMemo(() => {
    if (emailDetail && emailDetail.attachments && emailDetail.attachments.length > previewIndex) {
      return emailDetail.attachments[previewIndex];
    }
    return null;
  }, [emailDetail, previewIndex]);

  const resetPreviewState = useCallback(() => {
    setPreviewContent(null);
    setPreviewContentType(null);
    setPreviewNumPages(null);
    setIsPreviewLoading(false);
    setPreviewError(null);
    setPdfContainerWidth(null);
    setPreviewIndex(0);
  }, []);

  const fileObjectForPdf = useMemo(() => {
    if (!previewContent || previewContentType !== 'application/pdf') return null;
    return { data: previewContent };
  }, [previewContent, previewContentType]);

  useEffect(() => {
    const measureContainer = () => {
      if (modalView === 'preview' && previewContainerRef.current) {
        const padding = 30;
        setPdfContainerWidth(previewContainerRef.current.clientWidth - padding);
      }
    };
    measureContainer();
    window.addEventListener('resize', measureContainer);
    return () => window.removeEventListener('resize', measureContainer);
  }, [modalView, isPreviewLoading]);

  useEffect(() => {
    if (isPreviewLoading || !docxPreviewRef.current || !(previewContent instanceof ArrayBuffer) || !(previewContentType.includes('wordprocessingml') || previewContentType === 'application/msword')) {
        return;
    }
    renderAsync(previewContent, docxPreviewRef.current, null, {
        className: "docx", inWrapper: true, ignoreWidth: true, ignoreHeight: false, breakPages: false,
    })
    .catch(err => {
        console.error("Erreur lors du rendu de l'aperçu DOCX:", err);
        setPreviewError("Impossible de générer l'aperçu de ce document Word.");
    });
    return () => { if (docxPreviewRef.current) docxPreviewRef.current.innerHTML = ''; };
  }, [previewContent, previewContentType, isPreviewLoading]);

  const fetchAttachmentContent = useCallback(async () => {
    if (!selectedEmailId || !attachmentForPreview?.attachmentId) return;
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      // Bascule OAuth vs IMAP : une PJ IMAP (source:'imap', attachmentId =
      // index) se récupère via /api/mail/... ; l'aperçu réutilise ensuite le
      // même pipeline (image blob / PDF / docx / texte selon le Content-Type).
      const isImap = attachmentForPreview.source === 'imap' || emailDetail?.source === 'imap';
      const response = isImap
        ? await mailAccountService.getAttachmentContent(selectedEmailId, attachmentForPreview.attachmentId)
        : await apiClient.get(
            `/api/mails/email/${selectedEmailId}/attachment/${attachmentForPreview.attachmentId}/content?filename=${encodeURIComponent(attachmentForPreview.filename)}&mimeType=${encodeURIComponent(attachmentForPreview.mimeType)}`,
            { responseType: 'arraybuffer' }
          );
      const receivedContentType = response.headers['content-type'];
      setPreviewContentType(receivedContentType);
      const arrayBuffer = response.data;

      if (receivedContentType.startsWith('image/')) {
        const blob = new Blob([arrayBuffer], { type: receivedContentType });
        setPreviewContent(URL.createObjectURL(blob));
      } else if (receivedContentType === 'application/pdf' || receivedContentType.includes('wordprocessingml') || receivedContentType === 'application/msword') {
        setPreviewContent(arrayBuffer);
      } else if (receivedContentType.startsWith('text/plain')) {
        const decoder = new TextDecoder('utf-8');
        setPreviewContent(decoder.decode(arrayBuffer));
      } else {
        setPreviewError(receivedContentType.includes('rtf') ? "Le format RTF n'est pas supporté pour l'aperçu." : `Type de fichier non supporté pour l'aperçu : ${receivedContentType}`);
      }
    } catch (err) {
      setPreviewError("Impossible de charger l'aperçu de la pièce jointe.");
    } finally {
      setIsPreviewLoading(false);
    }
  }, [selectedEmailId, attachmentForPreview, emailDetail, kheopsToken]);

  useEffect(() => {
    if (modalView === 'preview') {
      fetchAttachmentContent();
    }
  }, [modalView, fetchAttachmentContent]);
  
  useEffect(() => {
    if (!isOpen) {
      setModalView('list');
      setSelectedEmailId(null);
      resetPreviewState();
      dispatch(clearNotificationDetail()); 
    }
  }, [isOpen, dispatch, resetPreviewState]);

  useEffect(() => {
    if (!isOpen) return;
    const timeoutIds = [];
    const handleSuccess = (data) => {
      if (data.type === 'send-email-to-dossier') {
        setSendToDossierStatus(prev => ({ ...prev, [data.docId]: 'success' }));
        if (data.dossier) dispatch(updateCurrentDossierFromSocket(data.dossier));
        timeoutIds.push(setTimeout(() => setSendToDossierStatus(prev => ({ ...prev, [data.docId]: null })), 2500));
      }
    };
    const handleError = (data) => {
      if (data.type === 'send-email-to-dossier') {
        setSendToDossierStatus(prev => ({ ...prev, [data.docId]: 'error' }));
        timeoutIds.push(setTimeout(() => setSendToDossierStatus(prev => ({ ...prev, [data.docId]: null })), 3000));
      }
    };
    subscribeToEvent('document_operation_success', handleSuccess);
    subscribeToEvent('document_operation_error', handleError);
    return () => {
      timeoutIds.forEach(id => clearTimeout(id));
      unsubscribeFromEvent('document_operation_success', handleSuccess);
      unsubscribeFromEvent('document_operation_error', handleError);
    };
  }, [isOpen, dispatch]);

  const associatedDossierList = useMemo(() => {
    if (!selectedEmailId || !notificationsList) return [];
    const notification = notificationsList.find(n => n.id === selectedEmailId);
    return notification?.kheopsMatchingDossiers || [];
  }, [selectedEmailId, notificationsList]);

  const senderContactObject = useMemo(() => {
    if (!selectedEmailId || !notificationsList) return null;
    const notification = notificationsList.find(n => n.id === selectedEmailId);
    return notification?.senderContact || null;
  }, [selectedEmailId, notificationsList]);

  const handleCreateDossierForContact = (contact) => {
    if (!contact) return;
    dispatch(resetDossier());
    dispatch(resetParties());
    dispatch(setPartie('Pour', contact));
    dispatch(setPendingEmailActionForDossierCreation({
        emailId: selectedEmailId,
        senderContact: contact
    }));
    onClose(); 
    navigate('/dashboard/createDossier/step1');
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Pendant la saisie dans la modale « Connexion boîte mail », un clic est
      // forcément « hors » du panneau (masqué) : ne PAS fermer le panneau,
      // sinon la modale de connexion serait démontée en pleine saisie.
      if (showMailSetup) return;
      if (modalRef.current && !modalRef.current.contains(event.target)) onClose();
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, showMailSetup]);

  useEffect(() => {
    if (!activeContactPopover) return;
    const handleClickOutside = () => setActiveContactPopover(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [activeContactPopover]);

  const handleScroll = useCallback(() => {
    setActiveContactPopover(null);
    const target = modalBodyRef.current;
    if (target && target.scrollHeight - target.scrollTop <= target.clientHeight + 50 && !loading && hasMore && nextPageToken) {
      dispatch(fetchNotifications(nextPageToken));
    }
  }, [loading, hasMore, nextPageToken, dispatch]);

  useEffect(() => {
    const scrollableElement = modalBodyRef.current;
    if (scrollableElement) scrollableElement.addEventListener('scroll', handleScroll);
    return () => { if (scrollableElement) scrollableElement.removeEventListener('scroll', handleScroll); };
  }, [handleScroll]);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Auto-poll : refetch les notifs toutes les 30s tant que la modale list est ouverte
  useEffect(() => {
    if (!isOpen || modalView !== 'list') return;
    const interval = setInterval(() => { dispatch(fetchNotifications()); }, 30000);
    return () => clearInterval(interval);
  }, [isOpen, modalView, dispatch]);

  // Met a jour le timestamp de derniere synchro a chaque MAJ de la liste
  useEffect(() => { setLastFetchedAt(new Date()); }, [notificationsList]);

  // Tick toutes les 10s pour rafraichir le label "Synchronise · il y a Xmin"
  useEffect(() => {
    if (!isOpen || modalView !== 'list') return;
    const tick = setInterval(() => setSyncTick(t => t + 1), 10000);
    return () => clearInterval(tick);
  }, [isOpen, modalView]);

  // Reinit l'index selectionne quand la liste filtree change (search, filtres)
  useEffect(() => { setSelectedIndex(0); }, [searchTerm, showReadNotifications]);

  // Raccourcis clavier : ↑↓ navigue, ↵ ouvre, Esc ferme
  useEffect(() => {
    if (!isOpen || modalView !== 'list') return;
    const handler = (e) => {
      // Ne pas intercepter si l'utilisateur tape dans le champ de recherche pour les flèches/Enter
      const inSearchInput = e.target?.classList?.contains('k-mailmodal-search-input');
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (inSearchInput && e.key !== 'Enter') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredNotifications.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const notif = filteredNotifications[selectedIndex];
        if (notif) {
          dispatch(markNotificationAsRead(notif.id));
          setSelectedEmailId(notif.id);
          dispatch(fetchNotificationDetail(notif.id));
          setModalView('detail');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, modalView, filteredNotifications, selectedIndex, onClose, dispatch]);

  const handleNextPreview = useCallback(() => {
    if (!emailDetail || !emailDetail.attachments || emailDetail.attachments.length === 0) return;
    setPreviewIndex(prevIndex => (prevIndex + 1) % emailDetail.attachments.length);
  }, [emailDetail]);

  const handlePrevPreview = useCallback(() => {
    if (!emailDetail || !emailDetail.attachments || emailDetail.attachments.length === 0) return;
    setPreviewIndex(prevIndex => (prevIndex - 1 + emailDetail.attachments.length) % emailDetail.attachments.length);
  }, [emailDetail]);

  if (!isOpen) return null;

  const onDocumentLoadSuccessForPreview = ({ numPages }) => setPreviewNumPages(numPages);

  const handleEmailClick = (e, notif) => {
    e.stopPropagation();
    dispatch(markNotificationAsRead(notif.id));
    setSelectedEmailId(notif.id);
    dispatch(fetchNotificationDetail(notif.id));
    setModalView('detail');
  };

  // Raccourci "Aller au dossier" depuis la liste : navigue directement vers
  // le dossier lié sans ouvrir le détail email. Visible uniquement quand
  // exactement 1 dossier matche (sinon l'utilisateur passe par le détail
  // pour choisir explicitement).
  const handleGoToDossier = (e, notif) => {
    e.stopPropagation();
    const match = notif?.kheopsMatchingDossiers?.[0];
    if (!match) return;
    const fullDossier = last25Dossiers.find((d) => d._id === match.dossierId);
    if (!fullDossier) {
      toast.warning("Le dossier lié n'est pas chargé. Ouvrez la notification pour le sélectionner manuellement.");
      return;
    }
    dispatch(markNotificationAsRead(notif.id));
    dispatch({ type: MOVE_DOSSIER_TO_TOP, payload: fullDossier });
    dispatch(setCurrentDossier(fullDossier));
    try {
      localStorage.setItem('kheopsLastOpenedDossierId', fullDossier._id);
    } catch (_e) { /* localStorage indisponible — non bloquant */ }
    dispatch(closeNotificationsModal());
    navigate('/dashboard/dossier');
  };

  const handleBackToList = (e) => {
    e.stopPropagation();
    setModalView('list');
    setSelectedEmailId(null);
    resetPreviewState();
    dispatch(clearNotificationDetail()); 
  };
  
  const handleBackToPreview = (e) => {
    e.stopPropagation();
    setModalView('preview');
  };
  
  const handlePreviewClick = (index = 0) => {
    setPreviewIndex(index);
    setModalView('preview');
  };
  
  const handleSendToDossierClick = async () => {
    setSendToDossierStatus({});
    if (!selectedEmailId || associatedDossierList.length === 0) {
        setDossiersForSendView(associatedDossierList);
        setModalView('sendToDossier');
        return;
    }

    setIsCheckingDossiers(true);

    try {
        const candidateIds = associatedDossierList.map(d => d.dossierId);
        const { data } = await apiClient.post(
            '/api/mails/check-email-presence',
            { emailId: selectedEmailId, candidateDossierIds: candidateIds }
        );

        const idsContainingEmail = new Set(data.dossiersContainingEmail || []);
        const dossiersNotContainingEmail = associatedDossierList.filter(d => !idsContainingEmail.has(d.dossierId));

        if (associatedDossierList.length === 1) {
            if (idsContainingEmail.size === 1) {
                const dossierToRedirect = last25Dossiers.find(d => d._id === associatedDossierList[0].dossierId);
                if (dossierToRedirect) {
                    dispatch({ type: MOVE_DOSSIER_TO_TOP, payload: dossierToRedirect });
                    dispatch(setCurrentDossier(dossierToRedirect));
                    dispatch(closeNotificationsModal());
                    navigate('/dashboard/dossier');
                } else {
                    toast.error("Le dossier correspondant n'a pas pu être chargé pour la redirection.");
                }
            } else {
                setDossiersForSendView(associatedDossierList);
                setModalView('sendToDossier');
            }
        } else {
            if (dossiersNotContainingEmail.length === 0) {
                dispatch(closeNotificationsModal());
                navigate('/dashboard/');
            } else {
                setDossiersForSendView(dossiersNotContainingEmail);
                setModalView('sendToDossier');
            }
        }

    } catch (error) {
        console.error("Erreur lors de la vérification de la présence de l'email:", error);
        toast.warning("Une erreur est survenue. L'envoi va procéder avec la liste complète.");
        setDossiersForSendView(associatedDossierList);
        setModalView('sendToDossier');
    } finally {
        setIsCheckingDossiers(false);
    }
  };
  
  const handleSendToDossier = (dossier) => {
    const socket = initSocket();
    if (!socket?.connected) {
        toast.error("La connexion avec l'application de bureau est inactive.");
        return;
    }
    if (!sendEmailText && !sendAttachment) {
        toast.warning("Veuillez cocher au moins une option (envoyer le texte ou les pièces jointes).");
        return;
    }

    setSendToDossierStatus(prev => ({ ...prev, [dossier.dossierId]: 'sending' }));
    
    let attachmentsToProcess = [];
    if (sendAttachment && emailDetail?.attachments?.length > 0) {
        attachmentsToProcess = emailDetail.attachments.map(att => att.filename);
    }

    const payload = {
        type: 'send_email_to_dossier',
        data: {
            token: kheopsToken, emailId: selectedEmailId, dossierId: dossier.dossierId,
            sendEmailText, 
            sendAttachment: sendAttachment,
            attachmentsToProcess
        }
    };
    socket.emit('message', JSON.stringify(payload));
  };
  
  const handleDownloadAttachment = async (attachment) => {
    if (!selectedEmailId || !attachment.attachmentId) return;
    try {
        const isImap = attachment.source === 'imap' || emailDetail?.source === 'imap';
        const response = isImap
          ? await mailAccountService.downloadAttachment(selectedEmailId, attachment.attachmentId)
          : await apiClient.get(`/api/mails/email/${selectedEmailId}/attachment/${attachment.attachmentId}?filename=${encodeURIComponent(attachment.filename)}&mimeType=${encodeURIComponent(attachment.mimeType)}`, { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', attachment.filename);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url);
    } catch (err) {
        toast.error("Le téléchargement de la pièce jointe a échoué.");
    }
  };

  const handleOpenAttachmentLocally = () => {
    if (!selectedEmailId || !attachmentForPreview) {
      toast.warning("Aucune pièce jointe sélectionnée pour l'ouverture.");
      return;
    }
    
    const socket = initSocket();
    if (!socket || !socket.connected) {
      toast.error("La connexion avec l'application de bureau est inactive.");
      return;
    }

    const payload = {
      type: 'open-attachment-locally',
      data: {
        emailId: selectedEmailId,
        attachment: attachmentForPreview,
        token: kheopsToken
      }
    };
    socket.emit('message', JSON.stringify(payload));
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Octets';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go', 'To'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  const modalClass = `notifications-modal-content ${modalView === 'list' ? 'list-mode' : ''} ${modalView === 'detail' ? 'expanded' : ''} ${modalView === 'preview' ? 'previewing' : ''} ${modalView === 'sendToDossier' ? 'sending-to-dossier' : ''}`;
  const modalStyle = { top: `${position.top}px`, right: `${position.right}px` };
  
  const renderListContent = () => {
    // Compte NI Google NI Microsoft, sans boîte configurée : au lieu d'une liste
    // vide, on invite à connecter sa boîte mail (même fenêtre que "Courriers").
    if (needsMailSetup) return (
      <div className="k-mailmodal-empty k-mailmodal-setup-invite">
        <p>Connectez votre boîte mail pour voir vos courriers ici.</p>
        <button
          type="button"
          className="k-mailmodal-setup-btn"
          onClick={() => setShowMailSetup(true)}
        >
          Connecter ma boîte mail
        </button>
      </div>
    );
    if (loading && filteredNotifications.length === 0) return (
      <HoverToSpeak textToSpeak="Chargement des notifications">
        <p className="k-mailmodal-empty">Chargement des notifications…</p>
      </HoverToSpeak>
    );
    if (error) return (
      <HoverToSpeak textToSpeak={`Erreur: ${error}`}>
        <p className="k-mailmodal-empty k-mailmodal-empty-error">Erreur : {error}</p>
      </HoverToSpeak>
    );
    if (filteredNotifications.length === 0) {
      const msg = searchTerm.trim()
        ? 'Aucun résultat pour cette recherche.'
        : (showReadNotifications ? 'Aucun email reçu récemment.' : 'Aucun email non lu.');
      return (
        <HoverToSpeak textToSpeak={msg}>
          <p className="k-mailmodal-empty">{msg}</p>
        </HoverToSpeak>
      );
    }

    return filteredNotifications.map((notif, index) => {
      const initials = getInitials(notif.kheopsContactName);
      const recipient = extractEmail(notif.from);
      const dossiers = notif.kheopsMatchingDossiers || [];
      const singleDossier = dossiers.length === 1 ? dossiers[0] : null;
      const hasMultipleContacts = notif.kheopsContactNames && notif.kheopsContactNames.length > 1;
      const summary = `Email de ${notif.kheopsContactName || 'inconnu'}${notif.emailRole ? ` (${notif.emailRole})` : ''}. Sujet: ${notif.subject || 'sans sujet'}. Cliquez pour ouvrir.`;
      return (
        <HoverToSpeak key={notif.id} textToSpeak={summary}>
          <div
            className={`k-mailmodal-card ${index === selectedIndex ? 'selected' : ''} ${notif.isRead ? 'read' : 'unread'}`}
            onClick={(e) => handleEmailClick(e, notif)}
          >
            <div className="k-mailmodal-card-avatar" aria-hidden="true">
              <span>{initials}</span>
              {!notif.isRead && <span className="k-mailmodal-card-dot" title="Non lu"></span>}
            </div>
            <div className="k-mailmodal-card-body">
              <div className="k-mailmodal-card-row1">
                <span
                  className={`k-mailmodal-card-name${hasMultipleContacts ? ' clickable' : ''}`}
                  onClick={(e) => {
                    if (hasMultipleContacts) {
                      e.stopPropagation();
                      setActiveContactPopover(activeContactPopover === notif.id ? null : notif.id);
                    }
                  }}
                >
                  {notif.kheopsContactName}
                  {hasMultipleContacts && <span className="k-mailmodal-card-multi">…</span>}
                  {notif.emailRole && <span className="k-mailmodal-card-role">({notif.emailRole})</span>}
                </span>
                <span className="k-mailmodal-card-time">
                  <TimeAgo date={notif.date} formatter={shortFormatter} />
                </span>
              </div>
              {activeContactPopover === notif.id && hasMultipleContacts && (
                <div className="kheops-contact-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="kheops-contact-popover-title">Contacts associés à cet email :</div>
                  {notif.allContactContexts.map((ctx, idx) => (
                    <div key={idx} className="kheops-contact-popover-item">
                      <span className="kheops-contact-popover-name">{ctx.contactName}</span>
                      <span className="kheops-contact-popover-dossier">— {ctx.dossierName || 'Contact global'}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="k-mailmodal-card-meta">
                <span className="k-mailmodal-card-meta-label">À</span>{' '}
                <span className="k-mailmodal-card-meta-value">{recipient}</span>
              </div>
              <div className="k-mailmodal-card-subject">
                <span className="k-mailmodal-card-subject-label">Objet :</span>{' '}
                {notif.subject || '(Sans objet)'}
              </div>
              {notif.snippet && (
                <div className="k-mailmodal-card-snippet">{notif.snippet}</div>
              )}
              {(dossiers.length > 0 || notif.attachmentCount > 0 || singleDossier) && (
                <div className="k-mailmodal-card-actions">
                  <div className="k-mailmodal-card-tags">
                    {notif.attachmentCount > 0 && (
                      <span className="k-mailmodal-card-tag k-mailmodal-card-tag-attach">
                        📎 {notif.attachmentCount}
                      </span>
                    )}
                    {dossiers.slice(0, 2).map((d, idx) => (
                      <span key={idx} className="k-mailmodal-card-tag k-mailmodal-card-tag-folder">
                        📁 {d.dossierName}
                      </span>
                    ))}
                    {dossiers.length > 2 && (
                      <span className="k-mailmodal-card-tag">+{dossiers.length - 2}</span>
                    )}
                  </div>
                  {singleDossier && (
                    <HoverToSpeak textToSpeak={`Bouton Aller au dossier ${singleDossier.dossierName}`}>
                      <button
                        type="button"
                        className="k-mailmodal-card-cta"
                        onClick={(e) => handleGoToDossier(e, notif)}
                        title={`Ouvrir le dossier "${singleDossier.dossierName}"`}
                      >
                        Aller au dossier <span aria-hidden="true">→</span>
                      </button>
                    </HoverToSpeak>
                  )}
                </div>
              )}
            </div>
          </div>
        </HoverToSpeak>
      );
    });
  };

  const renderPreviewContent = () => {
    if (isPreviewLoading) return <FullScreenLoader />;
    if (previewError) return <div className="preview-error">{previewError}</div>;
    if (!previewContent) return <div className="preview-error">Aucun contenu à afficher.</div>;
    if (previewContentType.startsWith('image/')) return <img src={previewContent} alt={attachmentForPreview.filename} className="preview-image" />;
    if (previewContentType === 'application/pdf') return <Document file={fileObjectForPdf} onLoadSuccess={onDocumentLoadSuccessForPreview} loading={<p>Chargement du PDF...</p>} error={<p>Erreur chargement PDF.</p>}> {Array.from(new Array(previewNumPages), (el, index) => <Page key={`page_${index + 1}`} pageNumber={index + 1} width={pdfContainerWidth ? pdfContainerWidth : undefined} />)} </Document>;
    if (previewContentType.includes('wordprocessingml') || previewContentType === 'application/msword') return <div className="docx-preview-container" ref={docxPreviewRef} />;
    if (previewContentType.startsWith('text/plain')) return <pre className="preview-text">{previewContent}</pre>;
    return <div className="preview-error">Aperçu non disponible.</div>;
  };

  return ReactDOM.createPortal(
    <>
      {isCheckingDossiers && <FullScreenLoader />}
      {/* Connexion boîte mail (Yahoo/Orange/OVH...) directement depuis la cloche.
          Réutilise la fenêtre de la partie "Courriers". */}
      <MailAccountSetupModal
        isOpen={showMailSetup}
        userEmail={currentUserEmail}
        onClose={() => setShowMailSetup(false)}
        onAccountCreated={handleMailAccountCreated}
      />
      {/* Panneau MASQUÉ (mais monté) pendant la connexion boîte mail : une
          seule fenêtre à l'écran, pas d'empilement ; il réapparaît à la
          fermeture de la modale (et se rafraîchit après création du compte). */}
      <div
        className="notifications-modal-overlay"
        style={showMailSetup ? { display: 'none' } : undefined}
      >
        <div className={modalClass} ref={modalRef} style={modalStyle}>

          <div className="notification-list-view k-mailmodal">
            <div className="k-mailmodal-header">
              <div className="k-mailmodal-header-left">
                <div className="k-mailmodal-header-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <div className="k-mailmodal-header-text">
                  <div className="k-mailmodal-breadcrumb">
                    <span>BOÎTE MAIL</span> · <span>CABINET</span>
                    {(() => {
                      // Badge du type de boîte lue par la cloche. Pour un compte
                      // OAuth, la cloche lit toujours l'OAuth (Microsoft
                      // prioritaire) ; sinon la boîte IMAP configurée.
                      const src = hasOAuthMail
                        ? (loginUser?.microsoftRefreshToken
                            ? { cls: 'outlook', label: 'Outlook' }
                            : { cls: 'gmail', label: 'Gmail' })
                        : (imapAccounts && imapAccounts.length > 0
                            ? { cls: 'imap', label: 'IMAP' }
                            : null);
                      return src
                        ? <span className={`k-mailmodal-source-badge k-mailmodal-source-badge--${src.cls}`}>{src.label}</span>
                        : null;
                    })()}
                    <span className="k-mailmodal-badge">{totalCount}</span>
                  </div>
                  <div className="k-mailmodal-title">Emails reçus récents</div>
                </div>
              </div>
              <div className="k-mailmodal-header-right">
                <HoverToSpeak textToSpeak={`Bouton Afficher les emails lus, ${showReadNotifications ? 'active' : 'inactif'}`}>
                  <label className="k-mailmodal-toggle">
                    <input
                      type="checkbox"
                      className="k-mailmodal-toggle-input"
                      checked={showReadNotifications}
                      onChange={() => dispatch(toggleShowReadNotifications())}
                    />
                    <span className="k-mailmodal-toggle-track"><span className="k-mailmodal-toggle-thumb"></span></span>
                    <span className="k-mailmodal-toggle-label">Afficher lus</span>
                  </label>
                </HoverToSpeak>
                <HoverToSpeak textToSpeak="Bouton fermer la modale des emails">
                  <button onClick={onClose} className="k-mailmodal-close" aria-label="Fermer">×</button>
                </HoverToSpeak>
              </div>
            </div>

            <div className="k-mailmodal-toolbar">
              <div className="k-mailmodal-search">
                <span className="k-mailmodal-search-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </span>
                <input
                  type="text"
                  className="k-mailmodal-search-input"
                  placeholder="Rechercher un expéditeur, un dossier, un sujet…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="k-mailmodal-filters" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={showReadNotifications}
                  className={`k-mailmodal-filter-pill ${showReadNotifications ? 'active' : ''}`}
                  onClick={() => { if (!showReadNotifications) dispatch(toggleShowReadNotifications()); }}
                >
                  Tous <span className="k-mailmodal-filter-count">{totalCount}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={!showReadNotifications}
                  className={`k-mailmodal-filter-pill ${!showReadNotifications ? 'active' : ''}`}
                  onClick={() => { if (showReadNotifications) dispatch(toggleShowReadNotifications()); }}
                >
                  Non lus <span className="k-mailmodal-filter-count">{unreadCount}</span>
                </button>
              </div>
            </div>

            <div className="k-mailmodal-body" ref={modalBodyRef}>
              {renderListContent()}
              {loading && filteredNotifications.length > 0 && (
                <p className="k-mailmodal-empty">Chargement…</p>
              )}
            </div>

            <div className="k-mailmodal-footer">
              <div className="k-mailmodal-sync">
                <span className="k-mailmodal-sync-dot"></span>
                Synchronisé · {formatSyncTime(lastFetchedAt)}
              </div>
              <div className="k-mailmodal-shortcuts">
                <span><kbd>↑</kbd><kbd>↓</kbd> Naviguer</span>
                <span><kbd>↵</kbd> Ouvrir</span>
                <span><kbd>Esc</kbd> Fermer</span>
              </div>
            </div>
          </div>
          
          <div className="notification-detail-view k-mailmodal-detail">
              <div className="k-mailmodal-detail-header">
                <HoverToSpeak textToSpeak="Bouton Retour a la liste des emails">
                  <button onClick={handleBackToList} className="k-mailmodal-detail-back" title="Retour à la liste">
                    <span aria-hidden="true">←</span> Retour
                  </button>
                </HoverToSpeak>
                <div className="k-mailmodal-detail-breadcrumb">
                  <span>Boîte mail</span>
                  <span className="k-mailmodal-detail-breadcrumb-sep" aria-hidden="true">›</span>
                  <span>Reçus</span>
                  {emailDetail?.subject && (
                    <>
                      <span className="k-mailmodal-detail-breadcrumb-sep" aria-hidden="true">›</span>
                      <span className="k-mailmodal-detail-breadcrumb-current" title={emailDetail.subject}>{emailDetail.subject}</span>
                    </>
                  )}
                </div>
                <div className="k-mailmodal-detail-actions">
                  <HoverToSpeak textToSpeak="Bouton imprimer">
                    <button
                      type="button"
                      className="k-mailmodal-detail-action-btn"
                      title="Imprimer"
                      onClick={() => window.print()}
                      aria-label="Imprimer"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 6 2 18 2 18 9"/>
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                        <rect x="6" y="14" width="12" height="8"/>
                      </svg>
                    </button>
                  </HoverToSpeak>
                  <HoverToSpeak textToSpeak="Bouton plus d'options">
                    <button
                      type="button"
                      className="k-mailmodal-detail-action-btn"
                      title="Plus d'options"
                      aria-label="Plus d'options"
                    >
                      <span aria-hidden="true">⋯</span>
                    </button>
                  </HoverToSpeak>
                </div>
              </div>

              {detailLoading && (
                <HoverToSpeak textToSpeak="Chargement du message">
                  <p className="k-mailmodal-empty">Chargement du message…</p>
                </HoverToSpeak>
              )}
              {detailError && (
                <HoverToSpeak textToSpeak={`Erreur: ${detailError}`}>
                  <p className="k-mailmodal-empty k-mailmodal-empty-error">Erreur : {detailError}</p>
                </HoverToSpeak>
              )}

              {emailDetail && (
                <div className="k-mailmodal-detail-body">
                  {/* Carte info principale : type/contact + sujet + tags + date */}
                  <div className="k-mailmodal-detail-card">
                    <div className="k-mailmodal-detail-card-row">
                      <div className="k-mailmodal-detail-card-meta-left">
                        <div className="k-mailmodal-detail-card-icon" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                            <polyline points="22,6 12,13 2,6"/>
                          </svg>
                        </div>
                        <span className="k-mailmodal-detail-card-meta-text">
                          MESSAGE REÇU{currentNotif?.emailRole ? ` · ${currentNotif.emailRole}` : ''}
                        </span>
                      </div>
                      <span className="k-mailmodal-detail-card-date">
                        <TimeAgo date={emailDetail.date || currentNotif?.date || Date.now()} formatter={formatter} />
                      </span>
                    </div>
                    <div className="k-mailmodal-detail-section-label">Objet</div>
                    <h2 className="k-mailmodal-detail-card-title">{emailDetail.subject || '(Sans objet)'}</h2>
                    {(currentNotif?.kheopsMatchingDossiers?.length > 0 || currentNotif?.emailRole) && (
                      <div className="k-mailmodal-detail-card-tags">
                        {(currentNotif.kheopsMatchingDossiers || []).slice(0, 3).map((d, idx) => (
                          <span key={idx} className="k-mailmodal-detail-tag k-mailmodal-detail-tag-folder">
                            <span aria-hidden="true">📁</span> {d.dossierName}
                          </span>
                        ))}
                        {currentNotif.emailRole && (
                          <span className="k-mailmodal-detail-tag k-mailmodal-detail-tag-role">{currentNotif.emailRole}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bloc expediteur avec avatar + adresses + actions Repondre/Transferer */}
                  <div className="k-mailmodal-detail-sender">
                    <div className="k-mailmodal-detail-sender-avatar" aria-hidden="true">
                      {getInitials(currentNotif?.kheopsContactName || extractEmail(emailDetail.from))}
                    </div>
                    <div className="k-mailmodal-detail-sender-info">
                      <div className="k-mailmodal-detail-sender-name">
                        {currentNotif?.kheopsContactName || emailDetail.from}
                      </div>
                      <div className="k-mailmodal-detail-sender-email">{extractEmail(emailDetail.from)}</div>
                      <div className="k-mailmodal-detail-sender-meta">
                        <span className="k-mailmodal-detail-sender-meta-label">À</span>
                        <span className="k-mailmodal-detail-sender-meta-value">{currentUserEmail || 'vous'}</span>
                      </div>
                    </div>
                    <div className="k-mailmodal-detail-sender-actions">
                      <button
                        type="button"
                        className="k-mailmodal-detail-sender-btn"
                        onClick={() => toast.info("Fonction Répondre à venir.")}
                      >
                        <span aria-hidden="true">↩</span> Répondre
                      </button>
                      <button
                        type="button"
                        className="k-mailmodal-detail-sender-btn"
                        onClick={() => toast.info("Fonction Transférer à venir.")}
                      >
                        Transférer <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  </div>

                  {/* Corps de l'email rendu sur fond dark — texte clair par
                      defaut. Les emails HTML avec leur propre styling restent
                      isolés (les styles inline d'un newsletter ne sont pas
                      override; on accepte que ces emails-la peuvent etre moins
                      lisibles — cas rare en usage cabinet). */}
                  <div className="k-mailmodal-detail-message">
                    <div className="k-mailmodal-detail-section-label">Message</div>
                    <div className="k-mailmodal-detail-content" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(emailDetail.body) }}></div>
                  </div>

                  {/* Pieces jointes */}
                  {(emailDetail.attachments?.length > 0) ? (
                      <div className="k-mailmodal-detail-attachments">
                        <div className="k-mailmodal-detail-attachments-header">
                          <span className="k-mailmodal-detail-attachments-title">PIÈCES JOINTES</span>
                          <span className="k-mailmodal-detail-attachments-badge">{emailDetail.attachments.length}</span>
                        </div>
                        <div className="attachments-list">
                          {emailDetail.attachments.length > 1 ? (
                            <HoverToSpeak textToSpeak={`${emailDetail.attachments.length} pieces jointes. Cliquez pour visualiser.`}>
                              <div className="attachment-summary-card" onClick={() => handlePreviewClick(0)}>
                                <img src={defaultAttachmentIcon} alt="Icône" className="attachment-summary-icon"/>
                                <span className="attachment-summary-text">{emailDetail.attachments.length} pièces jointes</span>
                              </div>
                            </HoverToSpeak>
                          ) : (
                            emailDetail.attachments.map((att, index) => {
                              const iconInfo = getAttachmentIcon(att.filename);
                              return (
                                <HoverToSpeak key={index} textToSpeak={`Piece jointe: ${att.filename}, taille ${formatBytes(att.size)}. Cliquez pour visualiser.`}>
                                  <div className="attachment-card-container" onClick={() => handlePreviewClick(index)}>
                                    <div className="attachment-card">
                                      <div className="attachment-icon-wrapper">
                                        <img src={iconInfo.src} alt="Icône" className="attachment-icon-background"/>
                                        {iconInfo.type === 'dynamic' && (<span className="attachment-icon-text">{iconInfo.extension}</span>)}
                                      </div>
                                      <div className="attachment-details">
                                        <span className="attachment-name">{att.filename}</span>
                                        <span className="attachment-size">{formatBytes(att.size)}</span>
                                      </div>
                                    </div>
                                  </div>
                                </HoverToSpeak>
                              );
                            })
                          )}
                        </div>
                      </div>
                  ) : null}
                </div>
              )}
          </div>
          <div className="notification-preview-view">
            <div className="preview-header">
                <HoverToSpeak textToSpeak="Bouton retour au detail du mail">
                  <button onClick={() => setModalView('detail')} className="preview-back-btn" title="Retour au détail du mail"> <img src={BTN_RetourArriere} alt="Retour" className="k-icon-sm"/> </button>
                </HoverToSpeak>
                <div className="preview-header-center-space">
                  <div className="header-left-pane">
                    {emailDetail?.attachments?.length > 1 && previewIndex > 0 && (
                        <HoverToSpeak textToSpeak="Bouton Piece jointe precedente">
                          <button className="preview-nav-arrow" onClick={handlePrevPreview} title="Pièce jointe précédente">
                              <img src={Fleche} alt="Précédent" className="k-icon-sm"/>
                          </button>
                        </HoverToSpeak>
                    )}
                  </div>
                  <HoverToSpeak textToSpeak={`Piece jointe affichee: ${attachmentForPreview?.filename || ''}${emailDetail?.attachments?.length > 1 ? `, ${previewIndex + 1} sur ${emailDetail.attachments.length}` : ''}`}>
                    <div className="header-center-pane" title={attachmentForPreview?.filename}>
                      <span className="preview-filename">{truncateFilename(attachmentForPreview?.filename)}</span>
                      {emailDetail?.attachments?.length > 1 && (
                        <span className="preview-nav-counter">({previewIndex + 1}/{emailDetail.attachments.length})</span>
                      )}
                    </div>
                  </HoverToSpeak>
                  <div className="header-right-pane">
                    {emailDetail?.attachments?.length > 1 && previewIndex < emailDetail.attachments.length - 1 && (
                      <HoverToSpeak textToSpeak="Bouton Piece jointe suivante">
                        <button className="preview-nav-arrow right" onClick={handleNextPreview} title="Pièce jointe suivante">
                          <img src={Fleche} alt="Suivant" className="k-icon-sm"/>
                        </button>
                      </HoverToSpeak>
                    )}
                  </div>
                </div>
            </div>
            <div className="preview-content-area" ref={previewContainerRef}> {renderPreviewContent()} </div>
            <div className="preview-footer-area">
                <div className="footer-actions">
                    <HoverToSpeak textToSpeak="Bouton Ouvrir la piece jointe localement">
                      <button className="footer-action-btn" title="Ouvrir localement" onClick={handleOpenAttachmentLocally}> <img src={IconOuvrirDossier} alt="Dossier" className="k-icon-sm"/> </button>
                    </HoverToSpeak>
                    <HoverToSpeak textToSpeak="Bouton Telecharger la piece jointe">
                      <button className="footer-action-btn" title="Télécharger" onClick={() => handleDownloadAttachment(attachmentForPreview)}> <img src={IconTelecharger} alt="Télécharger" className="k-icon-sm"/> </button>
                    </HoverToSpeak>
                    <HoverToSpeak textToSpeak="Bouton Envoyer la piece jointe vers un dossier">
                      <button className="footer-action-btn" title="Envoyer vers un dossier" onClick={handleSendToDossierClick}> <img src={IconEnvoyerVersDossier} alt="Envoyer" className="k-icon-sm"/> </button>
                    </HoverToSpeak>
                </div>
            </div>
          </div>
          <div className="notification-send-to-dossier-view">
            <HoverToSpeak textToSpeak="Bouton retour a l'apercu">
              <button onClick={handleBackToPreview} className="preview-back-btn" title="Retour à l'aperçu"> <img src={BTN_RetourArriere} alt="Retour" className="k-icon-sm"/> </button>
            </HoverToSpeak>
            <div className="send-to-dossier-content">
              <HoverToSpeak textToSpeak="Question: Envoyer vers le dossier ?">
                <div className="send-to-dossier-text">Envoyer vers le dossier ?</div>
              </HoverToSpeak>
              <div className="send-options-container">
                  <HoverToSpeak textToSpeak={`Case a cocher Envoyer le texte du mail, ${sendEmailText ? 'cochee' : 'decochee'}`}>
                    <div className="send-option-item"> <input type="checkbox" id="sendEmailTextCheckbox" checked={sendEmailText} onChange={(e) => setSendEmailText(e.target.checked)}/> <label htmlFor="sendEmailTextCheckbox">Envoyer le texte du mail</label> </div>
                  </HoverToSpeak>
                  <HoverToSpeak textToSpeak={`Case a cocher Envoyer les pieces jointes, ${emailDetail?.attachments?.length || 0} en tout, ${sendAttachment ? 'cochee' : 'decochee'}`}>
                    <div className="send-option-item"> <input type="checkbox" id="sendAttachmentCheckbox" checked={sendAttachment} onChange={(e) => setSendAttachment(e.target.checked)}/> <label htmlFor="sendAttachmentCheckbox">Envoyer les pièces jointes ({emailDetail?.attachments?.length || 0})</label> </div>
                  </HoverToSpeak>
              </div>

              {sendAttachment && emailDetail?.attachments?.length > 0 && (
                <div className="selected-attachments-display-list">
                  {emailDetail.attachments.map(att => (
                    <HoverToSpeak key={att.attachmentId} textToSpeak={`Piece jointe selectionnee: ${att.filename}`}>
                      <div className="selected-attachment-item">{att.filename}</div>
                    </HoverToSpeak>
                  ))}
                </div>
              )}

              <div className="dossier-target-list">
                {dossiersForSendView.length > 0 ? dossiersForSendView.map(dossier => {
                    const status = sendToDossierStatus[dossier.dossierId];
                    let text = dossier.dossierName;
                    if (status === 'sending') text = 'Envoi en cours...';
                    if (status === 'success') text = 'Envoyé avec succès !';
                    if (status === 'error') text = 'Échec de l\'envoi';
                    return (
                      <HoverToSpeak key={dossier.dossierId} textToSpeak={`Dossier cible: ${text}.${status ? '' : ' Cliquez pour envoyer.'}`}>
                        <div className={`dossier-target-item ${status ? 'status-' + status : ''}`} onClick={() => !status && handleSendToDossier(dossier)}> <img src={IconDossierPourEnvoi} alt="Dossier" className="dossier-target-icon" /> <span className="dossier-target-name">{text}</span> </div>
                      </HoverToSpeak>
                    );
                  }) : (
                    senderContactObject ? (
                      <HoverToSpeak textToSpeak="Voulez-vous creer un dossier pour ce contact ? Cliquez pour creer.">
                        <div className="dossier-target-item-empty create-dossier-prompt" onClick={() => handleCreateDossierForContact(senderContactObject)}>
                          Voulez-vous créer un dossier pour ce contact ?
                        </div>
                      </HoverToSpeak>
                    ) : (
                      <HoverToSpeak textToSpeak="Aucun dossier correspondant trouve">
                        <div className="dossier-target-item-empty">Aucun dossier correspondant trouvé.</div>
                      </HoverToSpeak>
                    )
                  )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>,
    document.body
  );
};

export default NotificationsModal;