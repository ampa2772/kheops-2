// client/src/redux/slices/layoutSlice.js
// Fusion de : layoutReducer + layoutActions (notifications thunks + ~60 action creators)
// Migration RTK Phase 5B

import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import apiClient from '../../services/apiClient';
import { mailAccountService } from '../../services/mailAccountService';

// ========================================================================
// Source des notifications mail :
//  - Compte connecté via Google/Microsoft  → API OAuth  (/api/mails/*).
//  - Compte GÉNÉRIQUE (e-mail/mot de passe, sans OAuth) → boîte IMAP configurée
//    (/api/mail/* via mailAccountService). Évite l'erreur « Authentification
//    Google ou Microsoft requise » pour les comptes Yahoo/Orange/OVH/etc.
// ========================================================================
const userHasOAuthMail = (user) => !!(user?.googleRefreshToken || user?.microsoftRefreshToken);

const formatImapFrom = (from) => {
  if (!from) return 'N/A';
  if (typeof from === 'string') return from;
  if (Array.isArray(from)) {
    return from.map((a) => (a && (a.name || a.address)) || a).filter(Boolean).join(', ') || 'N/A';
  }
  if (typeof from === 'object') return from.name || from.address || 'N/A';
  return 'N/A';
};

const mapImapNotification = (email) => ({
  id: email.id,
  from: formatImapFrom(email.from),
  subject: email.subject || '(Sans objet)',
  snippet: email.text || '',
  unread: Array.isArray(email.flags) ? !email.flags.includes('\\Seen') : false,
  date: email.date || email.internalDate || null,
  attachments: email.attachments || [],
  source: 'imap',
});

const mapImapDetail = (message) => ({
  id: message.id,
  from: formatImapFrom(message.from),
  to: formatImapFrom(message.to),
  subject: message.subject || '(Sans objet)',
  body: message.html || (message.text ? `<pre>${message.text}</pre>` : ''),
  attachments: (message.attachments || []).map((att, index) => ({
    attachmentId: String(index),
    filename: att.filename,
    mimeType: att.mime,
    size: att.size,
    source: 'imap',
  })),
  source: 'imap',
});

// Boîte IMAP active (première active, sinon première) pour l'aperçu de l'en-tête.
const getActiveImapAccountId = async () => {
  const accounts = await mailAccountService.listAccounts();
  const acc = accounts.find((a) => a.status === 'active') || accounts[0] || null;
  return acc ? acc.id : null;
};

// ========================================================================
// Helpers localStorage — gestion des notifications lues
// ========================================================================

const getReadNotificationIds = () => {
  try {
    const ids = localStorage.getItem('readNotificationIds');
    return ids ? new Set(JSON.parse(ids)) : new Set();
  } catch (e) {
    return new Set();
  }
};

const setReadNotificationIds = (idsSet) => {
  try {
    localStorage.setItem('readNotificationIds', JSON.stringify(Array.from(idsSet)));
  } catch (e) {
    console.error("Erreur d'écriture dans localStorage pour les IDs lus:", e);
  }
};

// ========================================================================
// Async Thunks (notifications)
// ========================================================================

/**
 * fetchNotificationCount — Récupère le nombre de notifications.
 */
export const fetchNotificationCount = createAsyncThunk(
  'layout/fetchNotificationCount',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { token, user } = getState().login;
      if (!token) return rejectWithValue("Utilisateur non authentifié");
      if (userHasOAuthMail(user)) {
        const res = await apiClient.get('/api/mails/notifications/count');
        return res.data.notificationCount;
      }
      // Compte générique (IMAP) : nombre de messages non lus sur la 1re page de la boîte active.
      const accountId = await getActiveImapAccountId();
      if (!accountId) return 0;
      const result = await mailAccountService.listMessages(accountId, { folder: 'INBOX', page: 1, pageSize: 20 });
      return (result.messages || []).filter((m) => (Array.isArray(m.flags) ? !m.flags.includes('\\Seen') : false)).length;
    } catch (error) {
      console.error("Erreur lors de la récupération du nombre de notifications:", error);
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

/**
 * fetchNotifications — Récupère la liste paginée des notifications.
 * @param {string|null} pageToken
 */
export const fetchNotifications = createAsyncThunk(
  'layout/fetchNotifications',
  async (pageToken = null, { getState, rejectWithValue }) => {
    try {
      const { token, user } = getState().login;
      if (!token) return rejectWithValue("Utilisateur non authentifié");

      if (userHasOAuthMail(user)) {
        const cacheBuster = `_=${new Date().getTime()}`;
        const url = pageToken
          ? `/api/mails/notifications/list?pageToken=${pageToken}&${cacheBuster}`
          : `/api/mails/notifications/list?${cacheBuster}`;
        const res = await apiClient.get(url);
        return {
          ...res.data,
          fetchedAt: new Date().toISOString(),
          isInitialLoad: !pageToken,
        };
      }

      // Compte générique (IMAP) : aperçu de la boîte active.
      const accountId = await getActiveImapAccountId();
      if (!accountId) {
        return { notifications: [], nextPageToken: null, fetchedAt: new Date().toISOString(), isInitialLoad: !pageToken };
      }
      const page = pageToken ? Number(pageToken) : 1;
      const result = await mailAccountService.listMessages(accountId, { folder: 'INBOX', page, pageSize: 20 });
      return {
        notifications: (result.messages || []).map(mapImapNotification),
        nextPageToken: result.hasMore ? String(page + 1) : null,
        fetchedAt: new Date().toISOString(),
        isInitialLoad: !pageToken,
      };
    } catch (error) {
      console.error("Erreur lors de la récupération de la liste des notifications:", error);
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

/**
 * fetchNotificationDetail — Récupère les détails d'un e-mail spécifique.
 * @param {string} emailId
 */
export const fetchNotificationDetail = createAsyncThunk(
  'layout/fetchNotificationDetail',
  async (emailId, { getState, rejectWithValue }) => {
    try {
      const { token, user } = getState().login;
      if (!token) return rejectWithValue("Utilisateur non authentifié");
      if (userHasOAuthMail(user)) {
        const res = await apiClient.get(`/api/mails/email/${emailId}`);
        return res.data;
      }
      // Compte générique (IMAP)
      const message = await mailAccountService.getMessage(emailId);
      return mapImapDetail(message);
    } catch (error) {
      console.error(`Erreur lors de la récupération des détails de l'email ${emailId}:`, error);
      return rejectWithValue(error.response?.data?.message || error.message);
    }
  }
);

// ========================================================================
// Slice
// ========================================================================

const initialState = {
  isSidebarOpen: window.innerWidth >= 768,
  searchBarMetrics: {
    distanceFromTop: 0,
    distanceFromLeft: 0,
    elementWidth: 0,
    elementHeight: 0,
  },
  searchBarFocused: false,
  searchListVisible: false,
  modalIsOpen: false,
  createModalIsOpen: false,
  emailComposeModalIsOpen: false,
  documentCreateModalIsOpen: false,
  isNotificationsModalOpen: false,
  isAllSearchModalOpen: false,         // Recherche globale (Ctrl+K)
  isShortcutsHelpModalOpen: false,     // Modale d'aide raccourcis (F1)
  showOptions: false,
  deleteModalIsOpen: false,
  isAddResponsibleMode: false,
  isToggleSupprRespMode: null,
  typeContactModalIsOpen: false,
  showOptionsMaritalStatus: false,
  showNationalitesAdulte: false,
  showPaysNaissancePC: false,
  showPaysNaissanceEnfant: false,
  showNationalitesEnfant: false,
  showProfessionPC: false,
  showNationalites: false,
  showPaysNaissance: false,
  showProfession: false,
  professionModalIsOpen: false,
  showRepLegModal: false,
  showContDirect: false,
  mariageDetailsModal: false,
  hasNationaliteClicked: false,
  matchingNationalities: [],
  matchingSecteursActLabel: [],
  matchingProfessions: [],
  formContratMariage: false,
  hasChangePCUPVILLE: false,
  hasChangePCUPVILLE_NAISSANCE: false,
  displayNotaires: false,
  formToDisplay: false,
  formeAjoutNotaire: false,
  didUpdateNotaryName: false,
  singleNotaireFullName: null,
  didClickOnListItem: false,
  clickedNotaireFullName: null,
  confirmationOpen: true,
  showOptionsTypeContact: false,
  modeModif: false,
  showPMPublique: false,
  contactType: "physique",
  showCommunesVilleContact: false,
  showCommunesNaissanceContact: false,
  showCommunesPC: false,
  showCommunesNaissancePC: false,
  showCommunesPCUP: false,
  showCommunesNaissancePCUP: false,
  showCommunesNotaire: false,
  showCommunesPM: false,
  showCommunesPMP: false,
  createPartieModalIsOpen: false,
  modifPartieModalIsOpen: false,
  isOpenMod: false,
  modifyingContactId: null,
  searchNavigationContactId: null,
  linkModalIsOpen: false,

  notificationCount: 0,
  notificationLoading: false,
  notificationError: null,
  showReadNotifications: false,
  notifications: {
    list: [],
    loading: false,
    error: null,
    nextPageToken: null,
    hasMore: true,
    lastFetched: null,
    detail: null,
    detailLoading: false,
    detailError: null,
  },
};

const layoutSlice = createSlice({
  name: 'layout',
  initialState,
  reducers: {
    // --- Notifications (synchrones) ---
    toggleShowReadNotifications(state) {
      state.showReadNotifications = !state.showReadNotifications;
    },
    markNotificationAsRead(state, action) {
      const readIds = getReadNotificationIds();
      if (!readIds.has(action.payload)) {
        readIds.add(action.payload);
        setReadNotificationIds(readIds);
        const notif = state.notifications.list.find(n => n.id === action.payload);
        if (notif) notif.isRead = true;
      }
    },
    openNotificationsModal(state) {
      state.isNotificationsModalOpen = true;
    },
    closeNotificationsModal(state) {
      state.isNotificationsModalOpen = false;
    },
    openAllSearchModal(state) {
      state.isAllSearchModalOpen = true;
    },
    closeAllSearchModal(state) {
      state.isAllSearchModalOpen = false;
    },
    openShortcutsHelpModal(state) {
      state.isShortcutsHelpModalOpen = true;
    },
    closeShortcutsHelpModal(state) {
      state.isShortcutsHelpModalOpen = false;
    },
    clearNotificationDetail(state) {
      state.notifications.detail = null;
      state.notifications.detailLoading = false;
      state.notifications.detailError = null;
    },

    // --- Sidebar ---
    toggleSidebar(state) {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    setSidebarOpen(state, action) {
      state.isSidebarOpen = action.payload;
    },

    // --- Search bar ---
    updateSearchBarMetrics(state, action) {
      state.searchBarMetrics = action.payload;
    },
    setSearchBarFocus(state, action) {
      state.searchBarFocused = action.payload;
    },
    setSearchListVisible(state, action) {
      state.searchListVisible = action.payload;
    },

    // --- Modales génériques ---
    toggleModal(state) {
      state.modalIsOpen = !state.modalIsOpen;
    },
    closeModal(state) {
      state.modalIsOpen = false;
    },
    toggleCreateModal(state) {
      state.createModalIsOpen = !state.createModalIsOpen;
    },
    closeCreateModal(state) {
      state.createModalIsOpen = false;
    },
    // --- Email Compose Modal ---
    openEmailComposeModal(state) {
      state.emailComposeModalIsOpen = true;
      state.createModalIsOpen = false;
    },
    closeEmailComposeModal(state) {
      state.emailComposeModalIsOpen = false;
    },
    // --- Document Create Modal ---
    openDocumentCreateModal(state) {
      state.documentCreateModalIsOpen = true;
      state.createModalIsOpen = false;
    },
    closeDocumentCreateModal(state) {
      state.documentCreateModalIsOpen = false;
    },
    toggleDeleteModal(state) {
      state.deleteModalIsOpen = !state.deleteModalIsOpen;
    },
    closeDeleteModal(state) {
      state.deleteModalIsOpen = false;
    },

    // --- Options & show options ---
    dispatchShowOptions(state, action) {
      state.showOptions = action.payload;
    },
    setShowOptions(state, action) {
      state.showOptionsTypeContact = action.payload;
    },
    toogleShowOptions(state) {
      state.showOptionsTypeContact = !state.showOptionsTypeContact;
    },
    setShowOptions2(state, action) {
      state.showOptionsTypeContact = action.payload;
    },

    // --- Responsables ---
    toggleAddResponsibleMode(state) {
      state.isAddResponsibleMode = !state.isAddResponsibleMode;
    },
    toggleSupprRespMode(state, action) {
      state.isToggleSupprRespMode = action.payload;
    },

    // --- Type contact modal ---
    toggleTypeContactModal(state) {
      state.typeContactModalIsOpen = !state.typeContactModalIsOpen;
    },
    setTypeContactModal(state, action) {
      state.typeContactModalIsOpen = action.payload;
    },

    // --- Communes ---
    setShowCommunesPC(state, action) {
      state.showCommunesPC = action.payload;
    },
    setShowCommunesPCUP(state, action) {
      state.showCommunesPCUP = action.payload;
    },
    setShowCommunesNaissancePCUP(state, action) {
      state.showCommunesNaissancePCUP = action.payload;
    },
    setShowCommunesVilleNaissancePC(state, action) {
      state.showCommunesNaissancePC = action.payload;
    },
    setShowCommunesVilleNaissanceEnfant(state, action) {
      state.showCommunes_ville_naissance_enfant = action.payload;
    },
    setShowCommunesContact(state, action) {
      state.showCommunesVilleContact = action.payload;
    },
    setShowCommunesNotaire(state, action) {
      state.showCommunesNotaire = action.payload;
    },
    setShowCommunesPM(state, action) {
      // L'ancien action creator envoie { val, caller } comme payload
      state.showCommunesPM = action.payload.val !== undefined ? action.payload.val : action.payload;
    },
    setShowCommunesPMP(state, action) {
      state.showCommunesPMP = action.payload;
    },
    setShowCommunesNaissanceContact(state, action) {
      state.showCommunesNaissanceContact = action.payload;
    },

    // --- Options statut marital ---
    setShowOptionsMaritalStatus(state, action) {
      state.showOptionsMaritalStatus = action.payload;
    },

    // --- Nationalités ---
    setShowNationalitesAdulte(state, action) {
      state.showNationalitesAdulte = action.payload;
    },
    setShowNationalitesEnfant(state, action) {
      state.showNationalitesEnfant = action.payload;
    },
    setShowNationalites(state, action) {
      state.showNationalites = action.payload;
    },

    // --- Pays de naissance ---
    setShowPaysNaissancePC(state, action) {
      state.showPaysNaissancePC = action.payload;
    },
    setShowPaysNaissanceEnfant(state, action) {
      state.showPaysNaissanceEnfant = action.payload;
    },
    setShowPaysNaissance(state, action) {
      state.showPaysNaissance = action.payload;
    },

    // --- Professions ---
    setShowProfessionPC(state, action) {
      state.showProfessionPC = action.payload;
    },
    setShowProfession(state, action) {
      state.showProfession = action.payload;
    },
    setProfessionModalIsOpen(state, action) {
      state.professionModalIsOpen = action.payload;
    },

    // --- Notaires ---
    setDisplayNotaires(state, action) {
      state.displayNotaires = action.payload;
    },
    setFormToDisplay(state, action) {
      state.formToDisplay = action.payload;
    },
    setFormAjoutNotaire(state, action) {
      state.formeAjoutNotaire = action.payload;
    },
    setDidUpdateNotaryName(state, action) {
      state.didUpdateNotaryName = action.payload;
    },
    setSingleNotaireFullName(state, action) {
      state.singleNotaireFullName = action.payload;
    },
    setDidClickOnListItem(state, action) {
      state.didClickOnListItem = action.payload;
    },
    setClickedNotaireFullName(state, action) {
      state.clickedNotaireFullName = action.payload;
    },

    // --- Mariage ---
    setMariageDetailsModal(state, action) {
      state.mariageDetailsModal = action.payload;
    },
    setFormContratMariage(state, action) {
      state.formContratMariage = action.payload;
    },

    // --- Nationalités matching ---
    setHasNationaliteClicked(state, action) {
      state.hasNationaliteClicked = action.payload;
    },
    setMatchingNationalities(state, action) {
      state.matchingNationalities = action.payload;
    },
    setMatchingProfessions(state, action) {
      state.matchingProfessions = action.payload;
    },
    setMatchingSecteursActLabel(state, action) {
      state.matchingSecteursActLabel = action.payload;
    },
    resetMatching(state) {
      state.matchingNationalities = [];
      state.matchingProfessions = [];
    },

    // --- PCUP Ville ---
    setChangePCUPVille(state, action) {
      state.hasChangePCUPVILLE = action.payload;
    },
    setChangePCUPVILLE_NAISSANCE(state, action) {
      state.hasChangePCUPVILLE_NAISSANCE = action.payload;
    },

    // --- Divers ---
    setCurrentIndexToListLength(state, action) {
      state.currentIndexToListLength = action.payload;
    },
    setConfirmation(state, action) {
      state.confirmationOpen = action.payload;
    },
    toggleModeModif(state, action) {
      state.modeModif = action.payload;
    },
    setContactType(state, action) {
      state.contactType = action.payload;
    },

    // --- RepLeg / ContDirect ---
    setShowRepLegModal(state, action) {
      state.showRepLegModal = action.payload;
    },
    setShowContDirect(state, action) {
      state.showContDirect = action.payload;
    },

    // --- Partie modals ---
    setCreatePartieModal(state, action) {
      state.createPartieModalIsOpen = action.payload;
    },
    setModifPartieModalIsOpen(state, action) {
      state.modifPartieModalIsOpen = action.payload;
    },
    setModifyingContactId(state, action) {
      state.modifyingContactId = action.payload;
    },
    setSearchNavigationContactId(state, action) {
      state.searchNavigationContactId = action.payload;
    },
    setLinkModalIsOpen(state, action) {
      state.linkModalIsOpen = action.payload;
    },

    // Note: setShowPersonnePhysique, setShowPersonneMorale, setShowPMPublique sont dans layoutFormContactSlice

    // setIsOpen — dans l'ancien code dispatche un type non traité, mais 3 composants l'importent encore
    setIsOpen(state, action) {
      // No-op — préservé pour compatibilité
    },
  },

  extraReducers: (builder) => {
    // --- fetchNotificationCount ---
    builder.addCase(fetchNotificationCount.pending, (state) => {
      state.notificationLoading = true;
      state.notificationError = null;
    });
    builder.addCase(fetchNotificationCount.fulfilled, (state, action) => {
      state.notificationLoading = false;
      state.notificationCount = action.payload;
    });
    builder.addCase(fetchNotificationCount.rejected, (state, action) => {
      state.notificationLoading = false;
      state.notificationError = action.payload;
      state.notificationCount = 0;
    });

    // --- fetchNotifications ---
    builder.addCase(fetchNotifications.pending, (state) => {
      state.notifications.loading = true;
      state.notifications.error = null;
    });
    builder.addCase(fetchNotifications.fulfilled, (state, action) => {
      const readIds = getReadNotificationIds();
      const rawNotifications = action.payload.notifications || [];

      const notificationsWithReadStatus = rawNotifications.map(notif => ({
        ...notif,
        isRead: readIds.has(notif.id),
      }));

      const newList = action.payload.isInitialLoad
        ? notificationsWithReadStatus
        : [...state.notifications.list, ...notificationsWithReadStatus];

      // Éliminer les doublons
      const uniqueList = Array.from(new Map(newList.map(item => [item.id, item])).values());

      state.notifications.loading = false;
      state.notifications.list = uniqueList;
      state.notifications.nextPageToken = action.payload.nextPageToken;
      state.notifications.hasMore = !!action.payload.nextPageToken;
      state.notifications.lastFetched = action.payload.fetchedAt;
    });
    builder.addCase(fetchNotifications.rejected, (state, action) => {
      state.notifications.loading = false;
      state.notifications.error = action.payload;
    });

    // --- fetchNotificationDetail ---
    builder.addCase(fetchNotificationDetail.pending, (state) => {
      state.notifications.detail = null;
      state.notifications.detailLoading = true;
      state.notifications.detailError = null;
    });
    builder.addCase(fetchNotificationDetail.fulfilled, (state, action) => {
      state.notifications.detailLoading = false;
      state.notifications.detail = action.payload;
    });
    builder.addCase(fetchNotificationDetail.rejected, (state, action) => {
      state.notifications.detailLoading = false;
      state.notifications.detailError = action.payload;
    });
  },
});

// ========================================================================
// Exports
// ========================================================================

export const {
  // Notifications
  toggleShowReadNotifications,
  markNotificationAsRead,
  openNotificationsModal,
  closeNotificationsModal,
  openAllSearchModal,
  closeAllSearchModal,
  openShortcutsHelpModal,
  closeShortcutsHelpModal,
  clearNotificationDetail,
  // Sidebar
  toggleSidebar,
  setSidebarOpen,
  // Search bar
  updateSearchBarMetrics,
  setSearchBarFocus,
  setSearchListVisible,
  // Modales
  toggleModal,
  closeModal,
  toggleCreateModal,
  closeCreateModal,
  openEmailComposeModal,
  closeEmailComposeModal,
  openDocumentCreateModal,
  closeDocumentCreateModal,
  toggleDeleteModal,
  closeDeleteModal,
  // Options
  dispatchShowOptions,
  setShowOptions,
  toogleShowOptions,
  setShowOptions2,
  // Responsables
  toggleAddResponsibleMode,
  toggleSupprRespMode,
  // Type contact modal
  toggleTypeContactModal,
  setTypeContactModal,
  // Communes
  setShowCommunesPC,
  setShowCommunesPCUP,
  setShowCommunesNaissancePCUP,
  setShowCommunesVilleNaissancePC,
  setShowCommunesVilleNaissanceEnfant,
  setShowCommunesContact,
  setShowCommunesNotaire,
  setShowCommunesPM,
  setShowCommunesPMP,
  setShowCommunesNaissanceContact,
  // Statut marital
  setShowOptionsMaritalStatus,
  // Nationalités
  setShowNationalitesAdulte,
  setShowNationalitesEnfant,
  setShowNationalites,
  // Pays de naissance
  setShowPaysNaissancePC,
  setShowPaysNaissanceEnfant,
  setShowPaysNaissance,
  // Professions
  setShowProfessionPC,
  setShowProfession,
  setProfessionModalIsOpen,
  // Notaires
  setDisplayNotaires,
  setFormToDisplay,
  setFormAjoutNotaire,
  setDidUpdateNotaryName,
  setSingleNotaireFullName,
  setDidClickOnListItem,
  setClickedNotaireFullName,
  // Mariage
  setMariageDetailsModal,
  setFormContratMariage,
  // Matching
  setHasNationaliteClicked,
  setMatchingNationalities,
  setMatchingProfessions,
  setMatchingSecteursActLabel,
  resetMatching,
  // PCUP
  setChangePCUPVille,
  setChangePCUPVILLE_NAISSANCE,
  // Divers
  setCurrentIndexToListLength,
  setConfirmation,
  toggleModeModif,
  setContactType,
  // RepLeg / ContDirect
  setShowRepLegModal,
  setShowContDirect,
  // Parties
  setCreatePartieModal,
  setModifPartieModalIsOpen,
  setModifyingContactId,
  setSearchNavigationContactId,
  setLinkModalIsOpen,
  // Compat
  setIsOpen,
} = layoutSlice.actions;

// Re-export des actions layoutFormContact pour les composants qui les importaient depuis layoutActions
// Ces actions affectent le state `layoutFormContact`, pas le state `layout`
export { setShowPersonnePhysique, setShowPersonneMorale, setShowPMPublique } from './layoutFormContactSlice';

export default layoutSlice.reducer;
