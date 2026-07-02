// Kheops_2/client/src/components/dashboard/office/mails/index.js
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { sanitizeEmailHtml } from '../../../../utils/sanitizeEmailHtml';
import { classifyMailError } from '../../../../utils/mailErrorMessage';
import apiClient from '../../../../services/apiClient';
import mailAccountService from '../../../../services/mailAccountService';
import { useSelector } from 'react-redux'; // Utiliser Redux pour l'état d'authentification Kheops
import { useToast } from '../../../common/notifications/useToast';
import MailAccountSetupModal from './MailAccountSetupModal';
import './styles.css'; // Importer les styles


// --- Helpers localStorage ---
const LOCAL_STORAGE_KEYS = {
    EMAILS: 'cachedKheopsEmails',
    NEXT_PAGE_TOKEN: 'cachedKheopsNextPageToken',
    HAS_MORE_EMAILS: 'cachedKheopsHasMoreEmails',
};

const loadFromLocalStorage = (key, defaultValue = null) => {
    try {
        const item = localStorage.getItem(key);
        if (item === null || item === 'undefined') return defaultValue;
        if (key === LOCAL_STORAGE_KEYS.HAS_MORE_EMAILS) return item === 'true';
        if (key === LOCAL_STORAGE_KEYS.EMAILS) {
            const parsed = JSON.parse(item);
            return Array.isArray(parsed) ? parsed : defaultValue;
        }
        return item;
    } catch (e) {
        console.error(`Erreur lecture localStorage pour la clé "${key}":`, e);
        try { localStorage.removeItem(key); } catch (removeError) { console.error(`Erreur suppression clé localStorage invalide "${key}":`, removeError); }
        return defaultValue;
    }
};

const saveToLocalStorage = (key, value) => {
    try {
        let valueToStore = value;
        if (typeof value === 'object' && value !== null) valueToStore = JSON.stringify(value);
        else if (typeof value === 'boolean') valueToStore = String(value);

        if (value === null || typeof value === 'undefined') localStorage.removeItem(key);
        else localStorage.setItem(key, valueToStore);
    } catch (e) {
        console.error(`Erreur écriture localStorage pour la clé "${key}":`, e);
    }
};

const clearPersistedEmailData = () => {
    
    Object.values(LOCAL_STORAGE_KEYS).forEach(key => {
        try { localStorage.removeItem(key); }
        catch (e) { console.error(`Erreur suppression clé localStorage "${key}" lors du nettoyage:`, e); }
    });
};
// --- Fin Helpers localStorage ---

// --- Helpers UI ---
function decodeHtmlEntities(text) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return text || '';
    try {
        const textArea = document.createElement('textarea');
        textArea.innerHTML = text || '';
        return textArea.value;
    } catch (e) {
        console.error("Erreur lors du décodage des entités HTML:", e);
        return text || '';
    }
}

function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Octets';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go', 'To', 'Po', 'Eo', 'Zo', 'Yo'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatAddressList(value) {
    if (!value) return 'N/A';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        return value
            .map((entry) => {
                if (typeof entry === 'string') return entry;
                const label = entry.name ? `${entry.name} <${entry.address || ''}>` : entry.address;
                return label || '';
            })
            .filter(Boolean)
            .join(', ') || 'N/A';
    }
    return 'N/A';
}

function mapGenericEmailListItem(email) {
    return {
        id: email.id,
        from: formatAddressList(email.from),
        subject: email.subject || '(Sans objet)',
        snippet: email.text || '',
        unread: Array.isArray(email.flags) ? !email.flags.includes('\\Seen') : false,
        date: email.date || email.internalDate || null,
        attachments: email.attachments || [],
        source: 'imap',
    };
}

function mapGenericEmailDetail(message) {
    return {
        id: message.id,
        from: formatAddressList(message.from),
        to: formatAddressList(message.to),
        subject: message.subject || '(Sans objet)',
        body: message.html || (message.text ? `<pre>${message.text}</pre>` : ''),
        attachments: (message.attachments || []).map((att, index) => ({
            attachmentId: String(index),
            filename: att.filename,
            mimeType: att.mime,
            size: att.size,
            source: 'imap',
        })),
    };
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
// --- Fin Helpers UI ---

// --- Composant Principal Mails ---
const MailsComponent = () => {
    const toast = useToast();
    // --- États ---
    const [emails, setEmails] = useState(() => loadFromLocalStorage(LOCAL_STORAGE_KEYS.EMAILS, []));
    const [nextPageToken, setNextPageToken] = useState(() => loadFromLocalStorage(LOCAL_STORAGE_KEYS.NEXT_PAGE_TOKEN, null));
    const [hasMoreEmails, setHasMoreEmails] = useState(() => loadFromLocalStorage(LOCAL_STORAGE_KEYS.HAS_MORE_EMAILS, true));
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [view, setView] = useState('list'); // 'list', 'detail', 'compose'
    const [selectedEmailId, setSelectedEmailId] = useState(null);
    const [selectedEmailDetail, setSelectedEmailDetail] = useState(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState(null);
    const [to, setTo] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [attachment, setAttachment] = useState(null);
    const fileInputRef = useRef(null);
    const listContainerRef = useRef(null);        // conteneur à surveiller pour l’infinite‑scroll
    const initialLoadStartedRef = useRef(false);

    const [sendError, setSendError] = useState(null);
    const [sendSuccess, setSendSuccess] = useState(null);
    const [isSending, setIsSending] = useState(false);
    const [mailAccounts, setMailAccounts] = useState([]);
    const [selectedMailAccountId, setSelectedMailAccountId] = useState(null);
    const [isAccountsLoading, setIsAccountsLoading] = useState(false);
    const [showSetupModal, setShowSetupModal] = useState(false);

    // --- Sélecteur Redux ---
    const isAuthenticated = useSelector((state) => state.login.isAuthenticated);
    const user = useSelector((state) => state.login.user);
    const hasOAuthMail = !!(user?.googleRefreshToken || user?.microsoftRefreshToken);
    // Boîte IMAP sélectionnée = SOURCE ACTIVE. Une boîte IMAP peut désormais être
    // ajoutée ET lue même par un compte connecté via Google/Microsoft (sélecteur unifié).
    const selectedMailAccount = mailAccounts.find((account) => account.id === selectedMailAccountId) || null;
    // Source de lecture/envoi : IMAP si une boîte IMAP est sélectionnée ; sinon la
    // messagerie OAuth (Gmail/Outlook) du compte si disponible ; sinon rien (→ config).
    const readFromImap = !!selectedMailAccount;

    // --- Configuration API (apiClient gère auth automatiquement) ---

    // --- Fonctions API ---
    const handleApiError = (error, context) => {
        console.error(`Erreur API (${context}):`, error.response?.data || error.message);
        // A18 : classer l'erreur (réseau/IMAP/session) pour un message clair.
        const info = classifyMailError(error);
        // Seule une VRAIE expiration de session Kheops vide la boîte affichée.
        // Une panne réseau/IMAP passagère (transient) ou un souci d'identifiants
        // mail conserve la liste : on n'efface pas le travail de l'utilisateur.
        if (info.category === 'session') {
            console.warn('Session Kheops invalide : nettoyage de la vue mail.');
            clearPersistedEmailData();
            setEmails([]);
            setNextPageToken(null);
            setHasMoreEmails(true);
            setView('list');
        }
        return info.message;
    };

    const resetMailboxState = useCallback(() => {
        initialLoadStartedRef.current = false;
        setEmails([]);
        setNextPageToken(null);
        setHasMoreEmails(true);
        setSelectedEmailId(null);
        setSelectedEmailDetail(null);
        setDetailError(null);
        setView('list');
        clearPersistedEmailData();
    }, []);

    const refreshGenericAccounts = useCallback(async ({ openSetupIfEmpty = true } = {}) => {
        if (!isAuthenticated) return [];
        setIsAccountsLoading(true);
        try {
            const accounts = await mailAccountService.listAccounts();
            setMailAccounts(accounts);
            if (!hasOAuthMail) {
                // Compte sans OAuth : la boîte IMAP est la source principale → auto-sélection
                // + proposition de configuration si aucune boîte n'existe encore.
                const nextAccount = accounts.find((account) => account.status === 'active') || accounts[0] || null;
                setSelectedMailAccountId(nextAccount?.id || null);
                setShowSetupModal(openSetupIfEmpty && accounts.length === 0);
            }
            // Compte OAuth : on NE sélectionne PAS de boîte IMAP par défaut (Gmail/Outlook
            // reste la vue par défaut) ; l'utilisateur peut en ajouter/choisir une via le sélecteur.
            return accounts;
        } catch (err) {
            setError(handleApiError(err, 'chargement comptes mail'));
            return [];
        } finally {
            setIsAccountsLoading(false);
        }
    }, [isAuthenticated, hasOAuthMail]);

    // Récupérer les emails (liste initiale ou page suivante)
    const fetchEmails = useCallback(async (token = null, isInitialLoad = false) => {
        const isLoadingFirstPage = !token;
        const context = isInitialLoad ? 'chargement initial' : (isLoadingFirstPage ? 'rafraîchissement' : 'page suivante');

        if ((isLoadingFirstPage && (isLoading || isDetailLoading || isSending)) || (!isLoadingFirstPage && (isLoadingMore || isLoading))) {
            
            return;
        }

        if (isLoadingFirstPage) setIsLoading(true);
        else setIsLoadingMore(true);
        setError(null);

        try {
            let newEmails = [];
            let newToken = null;
            let newHasMore = false;

            if (readFromImap) {
                const accountId = selectedMailAccount.id;
                const page = token ? Number(token) : 1;
                const result = await mailAccountService.listMessages(accountId, {
                    folder: 'INBOX',
                    page,
                    pageSize: 20,
                });
                newEmails = (result.messages || []).map(mapGenericEmailListItem);
                newHasMore = !!result.hasMore;
                newToken = newHasMore ? String(page + 1) : null;
            } else if (hasOAuthMail) {
                const url = token ? `/api/mails/emails?pageToken=${token}` : '/api/mails/emails';
                const response = await apiClient.get(url);
                newEmails = response.data.emails || [];
                newToken = response.data.nextPageToken || null;
                newHasMore = !!newToken;
            } else {
                // Ni boîte IMAP sélectionnée, ni messagerie OAuth → proposer la configuration.
                setShowSetupModal(true);
                return;
            }

            setEmails(currentEmails => {
                const updated = isLoadingFirstPage ? newEmails : [...currentEmails, ...newEmails];
                if (!readFromImap) saveToLocalStorage(LOCAL_STORAGE_KEYS.EMAILS, updated);
                return updated;
            });
            setNextPageToken(newToken || null);
            setHasMoreEmails(newHasMore);
            if (!readFromImap) {
                saveToLocalStorage(LOCAL_STORAGE_KEYS.NEXT_PAGE_TOKEN, newToken || null);
                saveToLocalStorage(LOCAL_STORAGE_KEYS.HAS_MORE_EMAILS, newHasMore);
            }

        } catch (error) {
            const errorMessage = handleApiError(error, context);
            if (isLoadingFirstPage) {
                setError(errorMessage);
                setEmails([]);
                setNextPageToken(null);
                setHasMoreEmails(true);
                clearPersistedEmailData();
            } else {
                console.error("Erreur chargement page suivante (scroll):", errorMessage);
                setHasMoreEmails(false);
                saveToLocalStorage(LOCAL_STORAGE_KEYS.HAS_MORE_EMAILS, false);
            }
        } finally {
            if (isLoadingFirstPage) setIsLoading(false);
            else setIsLoadingMore(false);
        }
    }, [isLoading, isDetailLoading, isSending, isLoadingMore, readFromImap, hasOAuthMail, selectedMailAccount, selectedMailAccountId]);

    // Charger les détails d'un email
    const fetchEmailDetail = useCallback(async (id) => {
        if (!id || isDetailLoading || isLoading || isSending) return;
        
        setIsDetailLoading(true);
        setDetailError(null);
        setSelectedEmailDetail(null);
        try {
            if (readFromImap) {
                const message = await mailAccountService.getMessage(id);
                setSelectedEmailDetail(mapGenericEmailDetail(message));
            } else {
                const response = await apiClient.get(`/api/mails/email/${id}`);
                setSelectedEmailDetail(response.data);
            }
            
        } catch (error) {
            const errorMessage = handleApiError(error, `chargement détail email ${id}`);
            setDetailError(errorMessage);
            if (error.response?.status !== 401 && error.response?.status !== 403) {
                // Rester sur la vue détail
            } else {
                setView('list');
                setError(errorMessage);
            }
        } finally {
            setIsDetailLoading(false);
        }
    }, [isDetailLoading, isLoading, isSending, readFromImap]);

    // Envoyer un email
    const handleSendEmail = async (e) => {
        e.preventDefault();
        if (isSending || isLoading || isDetailLoading) return;
        setIsSending(true);
        setSendError(null);
        setSendSuccess(null);

        try {
            if (readFromImap) {
                const attachments = attachment
                    ? [{
                        filename: attachment.name,
                        contentBase64: await fileToBase64(attachment),
                        contentType: attachment.type || 'application/octet-stream',
                    }]
                    : [];
                await mailAccountService.sendMail({
                    accountId: selectedMailAccount.id,
                    to,
                    subject,
                    text: body,
                    attachments,
                });
            } else if (hasOAuthMail) {
                const formData = new FormData();
                formData.append('to', to);
                formData.append('subject', subject);
                formData.append('body', body);
                if (attachment) {
                    formData.append('attachment', attachment);
                }
                await apiClient.post('/api/mails/send-email', formData);
            } else {
                setShowSetupModal(true);
                throw new Error('Aucun compte mail connecté.');
            }
            setSendSuccess('Email envoyé avec succès !');
            setTo('');
            setSubject('');
            setBody('');
            setAttachment(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            setTimeout(() => { setSendSuccess(null); }, 5000);
        } catch (error) {
            const errorMessage = error.message === 'Aucun compte mail connecté.'
                ? error.message
                : handleApiError(error, 'envoi email');
            setSendError(errorMessage);
            setTimeout(() => { setSendError(null); }, 7000);
        } finally {
            setIsSending(false);
        }
    };
    
    const isAnyOperationInProgress = isLoading || isDetailLoading || isSending || isLoadingMore;

    /**
     * ===================================================================
     * === NOUVELLE FONCTION: Gérer le téléchargement de pièce jointe ====
     * ===================================================================
     * Cette fonction remplace le lien <a> direct pour pouvoir injecter
     * le header d'authentification dans la requête.
     */
    const handleDownloadAttachment = async (messageId, attachmentId, filename, mimeType) => {
        if (isAnyOperationInProgress) return;
        try {
            const response = readFromImap
                ? await mailAccountService.downloadAttachment(messageId, attachmentId)
                : await apiClient.get(
                    `/api/mails/email/${messageId}/attachment/${attachmentId}?filename=${encodeURIComponent(filename)}&mimeType=${encodeURIComponent(mimeType)}`,
                    { responseType: 'blob' } // Important: on attend des données binaires
                );

            // Créer un lien temporaire pour le téléchargement
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename); // Le nom de fichier suggéré
            document.body.appendChild(link);
            link.click();

            // Nettoyage après le clic
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Erreur lors du téléchargement de la pièce jointe:', error);
            toast.error("Une erreur est survenue lors du téléchargement de la pièce jointe.");
        }
    };
    // ===================================================================
    // ===================================================================

    // --- Effets ---
    // Effet de chargement initial / déconnexion.
    // fetchEmails est volontairement omis des dépendances car on ne veut déclencher
    // ce chargement qu'au changement d'état d'authentification, pas à chaque
    // recréation de la callback.
    const fetchEmailsRef = useRef(fetchEmails);
    fetchEmailsRef.current = fetchEmails;

    useEffect(() => {
        if (isAuthenticated && !initialLoadStartedRef.current && emails.length === 0 && !isLoading && !isDetailLoading && !isSending) {
            initialLoadStartedRef.current = true;
            fetchEmailsRef.current(null, true);
        } else if (!isAuthenticated) {
            initialLoadStartedRef.current = false;
            clearPersistedEmailData();
            setEmails([]);
            setNextPageToken(null);
            setHasMoreEmails(true);
            setError(null);
            setDetailError(null);
            setSelectedEmailDetail(null);
            setSelectedEmailId(null);
            setView('list');
        }
    }, [isAuthenticated, emails.length, isLoading, isDetailLoading, isSending]);

    useEffect(() => {
        if (!isAuthenticated) return;
        // Charger les comptes IMAP pour TOUS (OAuth ou non) → permet d'ajouter/choisir
        // une boîte IMAP même connecté via Google/Microsoft. Configuration auto-proposée
        // uniquement pour les comptes sans OAuth (les comptes OAuth ont Gmail/Outlook par défaut).
        refreshGenericAccounts({ openSetupIfEmpty: !hasOAuthMail });
    }, [isAuthenticated, hasOAuthMail, refreshGenericAccounts]);

    useEffect(() => {
        // Une boîte IMAP vient d'être sélectionnée (par n'importe quel compte) →
        // recharger la liste depuis cette boîte IMAP.
        if (!isAuthenticated || !selectedMailAccountId) return;
        resetMailboxState();
        initialLoadStartedRef.current = true;
        fetchEmailsRef.current(null, true);
    }, [isAuthenticated, selectedMailAccountId, resetMailboxState]);

    useEffect(() => {
        const container = listContainerRef.current || window;
    
        const handleScroll = () => {
            const metrics = container === window
                ? {
                    scrollTop: document.documentElement.scrollTop,
                    scrollHeight: document.documentElement.scrollHeight,
                    clientHeight: window.innerHeight
                  }
                : {
                    scrollTop: container.scrollTop,
                    scrollHeight: container.scrollHeight,
                    clientHeight: container.clientHeight
                  };
    
            const isNearBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= 150; // ≈ 90 %
    
            if (
                isAuthenticated &&
                view === 'list' &&
                isNearBottom &&
                !isLoadingMore &&
                nextPageToken &&
                hasMoreEmails &&
                !isLoading &&
                !isDetailLoading &&
                !isSending
            ) {
                fetchEmails(nextPageToken);
            }
        };
    
        /* Écoute + appel immédiat si la première page ne remplit pas l’écran */
        container.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
    
        return () => {
            container.removeEventListener('scroll', handleScroll);
        };
    }, [
        isAuthenticated,
        view,
        isLoadingMore,
        nextPageToken,
        hasMoreEmails,
        isLoading,
        isDetailLoading,
        isSending,
        fetchEmails
    ]);
    
    

    // --- Handlers UI ---
    const handleEmailClick = (id) => {
        if (isLoading || isDetailLoading || isSending || isLoadingMore) return;
        setSelectedEmailId(id);
        setView('detail');
        fetchEmailDetail(id);
    };

    const handleBackToList = () => {
        if (isLoading || isSending || isDetailLoading) {
            if (view !== 'list' && !isLoading) {
                setView('list');
                setSelectedEmailId(null);
                setSelectedEmailDetail(null);
                setDetailError(null);
            }
            return;
        }

        
        setView('list');
        setSelectedEmailId(null);
        setSelectedEmailDetail(null);
        setDetailError(null);
        fetchEmails(null, true);
    };

    const handleComposeClick = () => {
        if (!readFromImap && !hasOAuthMail) {
            setShowSetupModal(true);
            return;
        }
        if (isLoading || isSending || isDetailLoading) return;
        setView('compose');
        setSendError(null);
        setSendSuccess(null);
        setAttachment(null);
        setTo('');
        setSubject('');
        setBody('');
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleFileChange = (e) => {
        setAttachment(e.target.files ? e.target.files[0] : null);
    };

    // --- Rendu JSX ---
    if (!isAuthenticated) {
        return <div className="mail-container" style={{ padding: '20px', textAlign: 'center' }}>Veuillez vous connecter pour accéder à la messagerie.</div>;
    }

    return (
        <div className="mail-container" style={{ opacity: isAnyOperationInProgress ? 0.7 : 1 }}>
            <MailAccountSetupModal
                isOpen={showSetupModal}
                userEmail={user?.email}
                onClose={() => setShowSetupModal(false)}
                onAccountCreated={(account) => {
                    setShowSetupModal(false);
                    setMailAccounts((current) => [account, ...current.filter((item) => item.id !== account.id)]);
                    setSelectedMailAccountId(account.id);
                    resetMailboxState();
                }}
            />

            {/* Barre de navigation interne aux mails */}
            <nav className="mail-nav">
                {/* ---- CONTENEUR FLEX POUR LES DEUX BOUTONS ---- */}
                <div className="mail-nav-buttons">
                    <button onClick={handleBackToList} disabled={isAnyOperationInProgress}>
                        Boîte de réception
                    </button>
                    <button onClick={handleComposeClick} disabled={view === 'compose' || isAnyOperationInProgress}>
                        Nouveau message
                    </button>
                    <button onClick={() => setShowSetupModal(true)} disabled={isAnyOperationInProgress || isAccountsLoading}>
                        Ajouter une boîte mail
                    </button>
                </div>

                <div className="mail-status-indicators">
                    {readFromImap && selectedMailAccount && (
                        <span className="mail-account-current">{selectedMailAccount.email}</span>
                    )}
                    {!readFromImap && hasOAuthMail && (
                        <span className="mail-account-current">Messagerie principale (Gmail/Outlook)</span>
                    )}
                    {isAccountsLoading && <span className="status-loading">Comptes...</span>}
                    {isLoading && <span className="status-loading">Chargement liste...</span>}
                    {isDetailLoading && <span className="status-loading">Chargement détail...</span>}
                    {isSending && <span className="status-sending">Envoi...</span>}
                    {isLoadingMore && <span className="status-loading-more">Chargement suite...</span>}
                </div>
            </nav>

            {/* <h1 className="mail-main-title">Messagerie</h1> */}

            {error && <p className="mail-error-global">Erreur : {error}</p>}
            {sendSuccess && view !== 'compose' && <p className="mail-success-global">{sendSuccess}</p>}
            {((hasOAuthMail && mailAccounts.length >= 1) || mailAccounts.length > 1) && (
                <div className="mail-account-selector">
                    <label htmlFor="mail-account-select">Compte</label>
                    <select
                        id="mail-account-select"
                        value={selectedMailAccountId || ''}
                        onChange={(e) => setSelectedMailAccountId(e.target.value || null)}
                        disabled={isAnyOperationInProgress}
                    >
                        {hasOAuthMail && <option value="">Messagerie principale (Gmail/Outlook)</option>}
                        {mailAccounts.map((account) => (
                            <option key={account.id} value={account.id}>{account.email}</option>
                        ))}
                    </select>
                </div>
            )}

            <div
                className={`mail-content ${view === 'detail' ? 'mail-content--split' : ''}`}
                ref={listContainerRef}
            >

                {/* ==================== Vue Liste ====================
                    La liste est desormais rendue aussi en vue detail (panneau
                    gauche type Superhuman / Gmail compact) pour permettre la
                    navigation rapide entre messages. */}
                {(view === 'list' || view === 'detail') && (
                    <div className="mail-list-panel">
                        {isLoading && emails.length === 0 && !error && <p className="mail-loading-message">Chargement des emails...</p>}
                        {!isLoading && emails.length === 0 && !error && !readFromImap && hasOAuthMail && <p className="mail-empty-message">Votre boîte de réception principale est vide.</p>}
                        {!isLoading && emails.length === 0 && !error && readFromImap && selectedMailAccount && <p className="mail-empty-message">Votre boîte de réception principale est vide.</p>}
                        {!isLoading && emails.length === 0 && !error && !readFromImap && !hasOAuthMail && (
                            <div className="mail-empty-setup">
                                <p>Aucune boîte mail n'est connectée.</p>
                                <button type="button" onClick={() => setShowSetupModal(true)}>
                                    Connecter une boîte IMAP/SMTP
                                </button>
                            </div>
                        )}

                        {emails.length > 0 && (
                            <ul className="mail-list">
                                {emails.map((email) => {
                                    // Gmail conventionne labelIds pour marquer lu/non-lu.
                                    // On ne l'a pas toujours cote client, donc fallback
                                    // sur une heuristique : les mails non ouverts sont
                                    // consideres comme non lus.
                                    const isUnread =
                                        Array.isArray(email.labelIds)
                                            ? email.labelIds.includes('UNREAD')
                                            : !!email.unread;
                                    const isSelected = selectedEmailId === email.id;
                                    return (
                                        <li
                                            key={email.id}
                                            className={`mail-list-item ${isSelected ? 'selected' : ''} ${isUnread ? 'is-unread' : 'is-read'} ${isAnyOperationInProgress ? 'disabled' : ''}`}
                                            onClick={() => !isAnyOperationInProgress && handleEmailClick(email.id)}
                                            role="button"
                                            tabIndex={0}
                                            aria-pressed={isSelected}
                                            aria-label={`${isUnread ? 'Email non lu' : 'Email lu'} de ${decodeHtmlEntities(email.from)}, objet : ${decodeHtmlEntities(email.subject)}`}
                                            onKeyDown={(e) => {
                                                if ((e.key === 'Enter' || e.key === ' ') && !isAnyOperationInProgress) {
                                                    e.preventDefault();
                                                    handleEmailClick(email.id);
                                                }
                                            }}
                                        >
                                            <span className="mail-item-unread-dot" aria-hidden="true" />
                                            <p className="mail-item-from">
                                                <span>{decodeHtmlEntities(email.from)}</span>
                                            </p>
                                            <p className="mail-item-subject">
                                                <span>{decodeHtmlEntities(email.subject)}</span>
                                            </p>
                                            <p className="mail-item-snippet">
                                                {decodeHtmlEntities(email.snippet)}...
                                            </p>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {isLoadingMore && <p className="mail-loading-more-message">Chargement des messages suivants...</p>}
                        {!hasMoreEmails && emails.length > 0 && !isLoadingMore && !isLoading && (
                            <p className="mail-end-list-message">-- Fin de la liste --</p>
                        )}
                    </div>
                )}

                {/* ==================== Vue Détail ==================== */}
                {view === 'detail' && (
                    <div className="mail-detail-panel">
                        {isDetailLoading && <p className="mail-loading-message">Chargement du message...</p>}
                        {detailError && <p className="mail-error-detail">Erreur chargement détail : {detailError}</p>}
                        {!isDetailLoading && selectedEmailDetail && (
                            <div className="mail-detail-content">
                                <p><strong>De :</strong> {decodeHtmlEntities(selectedEmailDetail.from)}</p>
                                <p style={{ marginBottom: '15px' }}><strong>Objet :</strong> {decodeHtmlEntities(selectedEmailDetail.subject)}</p>
                                <hr />
                                <div className="mail-body" dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(selectedEmailDetail.body) }} />

                                {selectedEmailDetail.attachments && selectedEmailDetail.attachments.length > 0 && (
                                    <div className="mail-attachments-section">
                                        <hr />
                                        <h3>Pièces jointes :</h3>
                                        <ul className="mail-attachments-list">
                                            {selectedEmailDetail.attachments.map((att, index) => (
                                                <li key={index} className="mail-attachment-item">
                                                    <span className="filename">{decodeHtmlEntities(att.filename)}</span>
                                                    <span className="filesize">({formatBytes(att.size)})</span>
                                                    {/* === MODIFICATION ICI: <a> est remplacé par <button> === */}
                                                    <button
                                                        onClick={() => handleDownloadAttachment(selectedEmailId, att.attachmentId, att.filename, att.mimeType)}
                                                        className="mail-attachment-download"
                                                        disabled={isAnyOperationInProgress}
                                                    >
                                                        Télécharger
                                                    </button>
                                                    {/* ======================================================= */}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                        {!isDetailLoading && !detailError && !selectedEmailDetail && selectedEmailId && (
                            <p>Impossible de charger les détails pour cet email.</p>
                        )}
                    </div>
                )}

                {/* ==================== Vue Composer ==================== */}
                {view === 'compose' && (
                    <div>
                        {/* <h2 className="mail-view-title">Envoyer un nouveau message</h2> */}
                        <form onSubmit={handleSendEmail} className="mail-compose-form">
                            <div className="form-group">
                                {/* <label htmlFor="to">Destinataire :</label> */}
                                <input type="email" placeholder='Destinataire' id="to" value={to} onChange={(e) => setTo(e.target.value)} required disabled={isAnyOperationInProgress} />
                            </div>
                            <div className="form-group">
                                {/* <label htmlFor="subject">Objet :</label> */}
                                <input type="text" placeholder='Objet' id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={isAnyOperationInProgress} />
                            </div>
                            <div className="form-group">
                                {/* <label htmlFor="body">Message :</label> */}
                                <textarea id="body" placeholder='Message' value={body} onChange={(e) => setBody(e.target.value)} required rows="9" disabled={isAnyOperationInProgress} />
                            </div>
                            <div className="form-group">
                                {/* <label htmlFor="attachment">Pièce jointe (optionnel) :</label> */}
                                <input type="file" id="attachment" ref={fileInputRef} onChange={handleFileChange} disabled={isAnyOperationInProgress} />
                                {/* {attachment && <p className="selected-file">Fichier sélectionné : {attachment.name}</p>} */}
                            </div>
                            {sendError && <p className="mail-error-send">Erreur d'envoi : {sendError}</p>}
                            {sendSuccess && <p className="mail-success-send">{sendSuccess}</p>}
                            <button type="submit" disabled={isAnyOperationInProgress} className="mail-send-button">
                                {isSending ? 'Envoi en cours...' : 'Envoyer'}
                            </button>
                            {/* <button type="button" onClick={handleBackToList} disabled={isAnyOperationInProgress} style={{ marginLeft: '10px' }}>
                                Annuler
                            </button> */}
                        </form>
                    </div>
                )}
            </div> {/* Fin mail-content */}
        </div> // Fin mail-container
    );
};

export default MailsComponent;
