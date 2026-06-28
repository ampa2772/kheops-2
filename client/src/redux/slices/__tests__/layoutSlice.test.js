jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../layoutFormContactSlice', () => ({
  setShowPersonnePhysique: jest.fn(() => ({ type: 'TEST/setShowPersonnePhysique' })),
  setShowPersonneMorale: jest.fn(() => ({ type: 'TEST/setShowPersonneMorale' })),
  setShowPMPublique: jest.fn(() => ({ type: 'TEST/setShowPMPublique' })),
}));

import apiClient from '../../../services/apiClient';
import reducer, {
  // Notifications
  toggleShowReadNotifications,
  markNotificationAsRead,
  openNotificationsModal,
  closeNotificationsModal,
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
  toggleDeleteModal,
  closeDeleteModal,
  // Options
  dispatchShowOptions,
  setShowOptions,
  toogleShowOptions,
  // Responsables
  toggleAddResponsibleMode,
  toggleSupprRespMode,
  // Communes
  setShowCommunesPM,
  // Matching
  setMatchingNationalities,
  resetMatching,
  // Divers
  setContactType,
  setConfirmation,
  setIsOpen,
  // Thunks
  fetchNotificationCount,
  fetchNotifications,
  fetchNotificationDetail,
} from '../layoutSlice';

import {
  setShowPersonnePhysique,
  setShowPersonneMorale,
  setShowPMPublique,
} from '../layoutFormContactSlice';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation();
  jest.spyOn(console, 'warn').mockImplementation();
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation();
});

afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
  Storage.prototype.getItem.mockRestore();
  Storage.prototype.setItem.mockRestore();
});

const baseState = {
  isSidebarOpen: true,
  searchBarMetrics: { distanceFromTop: 0, distanceFromLeft: 0, elementWidth: 0, elementHeight: 0 },
  searchBarFocused: false,
  searchListVisible: false,
  modalIsOpen: false,
  createModalIsOpen: false,
  isNotificationsModalOpen: false,
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
  contactType: 'physique',
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

// --- Etat initial ---

describe('layoutSlice etat initial', () => {
  test('retourne l etat initial par defaut', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state.modalIsOpen).toBe(false);
    expect(state.notificationCount).toBe(0);
    expect(state.contactType).toBe('physique');
    expect(state.confirmationOpen).toBe(true);
  });

  test('isSidebarOpen depend de window.innerWidth', () => {
    // window.innerWidth est >= 768 dans JSDOM par defaut (1024)
    const state = reducer(undefined, { type: '@@INIT' });
    expect(typeof state.isSidebarOpen).toBe('boolean');
  });

  test('initialise notifications avec structure correcte', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state.notifications).toEqual(expect.objectContaining({
      list: [],
      loading: false,
      error: null,
      nextPageToken: null,
      hasMore: true,
      lastFetched: null,
      detail: null,
      detailLoading: false,
      detailError: null,
    }));
  });
});

// --- Notifications ---

describe('layoutSlice reducers Notifications', () => {
  test('toggleShowReadNotifications inverse la valeur', () => {
    const state = reducer(baseState, toggleShowReadNotifications());
    expect(state.showReadNotifications).toBe(true);
    const state2 = reducer(state, toggleShowReadNotifications());
    expect(state2.showReadNotifications).toBe(false);
  });

  test('markNotificationAsRead marque la notification comme lue', () => {
    Storage.prototype.getItem.mockReturnValue(JSON.stringify([]));
    const prev = { ...baseState, notifications: { ...baseState.notifications, list: [{ id: 'n1', isRead: false }] } };
    const state = reducer(prev, markNotificationAsRead('n1'));
    expect(state.notifications.list[0].isRead).toBe(true);
    expect(Storage.prototype.setItem).toHaveBeenCalledWith(
      'readNotificationIds',
      expect.stringContaining('n1'),
    );
  });

  test('markNotificationAsRead ne duplique pas un ID deja lu', () => {
    Storage.prototype.getItem.mockReturnValue(JSON.stringify(['n1']));
    const prev = { ...baseState, notifications: { ...baseState.notifications, list: [{ id: 'n1', isRead: true }] } };
    const state = reducer(prev, markNotificationAsRead('n1'));
    // setItem ne doit pas etre appele car l'ID est deja present
    expect(Storage.prototype.setItem).not.toHaveBeenCalledWith('readNotificationIds', expect.anything());
  });

  test('markNotificationAsRead ignore si notification absente de la liste', () => {
    Storage.prototype.getItem.mockReturnValue(JSON.stringify([]));
    const state = reducer(baseState, markNotificationAsRead('n999'));
    // L'ID est ajoute au localStorage mais pas de crash
    expect(Storage.prototype.setItem).toHaveBeenCalled();
  });

  test('openNotificationsModal met isNotificationsModalOpen a true', () => {
    const state = reducer(baseState, openNotificationsModal());
    expect(state.isNotificationsModalOpen).toBe(true);
  });

  test('closeNotificationsModal met isNotificationsModalOpen a false', () => {
    const prev = { ...baseState, isNotificationsModalOpen: true };
    const state = reducer(prev, closeNotificationsModal());
    expect(state.isNotificationsModalOpen).toBe(false);
  });

  test('clearNotificationDetail remet detail/detailLoading/detailError', () => {
    const prev = {
      ...baseState,
      notifications: { ...baseState.notifications, detail: { id: 'x' }, detailLoading: true, detailError: 'err' },
    };
    const state = reducer(prev, clearNotificationDetail());
    expect(state.notifications.detail).toBeNull();
    expect(state.notifications.detailLoading).toBe(false);
    expect(state.notifications.detailError).toBeNull();
  });
});

// --- Sidebar & SearchBar ---

describe('layoutSlice reducers Sidebar et SearchBar', () => {
  test('toggleSidebar inverse isSidebarOpen', () => {
    const state = reducer(baseState, toggleSidebar());
    expect(state.isSidebarOpen).toBe(false);
  });

  test('setSidebarOpen definit la valeur', () => {
    const state = reducer(baseState, setSidebarOpen(false));
    expect(state.isSidebarOpen).toBe(false);
  });

  test('updateSearchBarMetrics remplace searchBarMetrics', () => {
    const metrics = { distanceFromTop: 10, distanceFromLeft: 20, elementWidth: 300, elementHeight: 40 };
    const state = reducer(baseState, updateSearchBarMetrics(metrics));
    expect(state.searchBarMetrics).toEqual(metrics);
  });

  test('setSearchBarFocus definit searchBarFocused', () => {
    const state = reducer(baseState, setSearchBarFocus(true));
    expect(state.searchBarFocused).toBe(true);
  });

  test('setSearchListVisible definit searchListVisible', () => {
    const state = reducer(baseState, setSearchListVisible(true));
    expect(state.searchListVisible).toBe(true);
  });
});

// --- Modales ---

describe('layoutSlice reducers Modales', () => {
  test('toggleModal inverse modalIsOpen', () => {
    const state = reducer(baseState, toggleModal());
    expect(state.modalIsOpen).toBe(true);
  });

  test('closeModal met modalIsOpen a false', () => {
    const prev = { ...baseState, modalIsOpen: true };
    const state = reducer(prev, closeModal());
    expect(state.modalIsOpen).toBe(false);
  });

  test('toggleCreateModal inverse createModalIsOpen', () => {
    const state = reducer(baseState, toggleCreateModal());
    expect(state.createModalIsOpen).toBe(true);
  });

  test('closeCreateModal met createModalIsOpen a false', () => {
    const prev = { ...baseState, createModalIsOpen: true };
    const state = reducer(prev, closeCreateModal());
    expect(state.createModalIsOpen).toBe(false);
  });

  test('toggleDeleteModal inverse deleteModalIsOpen', () => {
    const state = reducer(baseState, toggleDeleteModal());
    expect(state.deleteModalIsOpen).toBe(true);
  });

  test('closeDeleteModal met deleteModalIsOpen a false', () => {
    const prev = { ...baseState, deleteModalIsOpen: true };
    const state = reducer(prev, closeDeleteModal());
    expect(state.deleteModalIsOpen).toBe(false);
  });
});

// --- Setters representatifs ---

describe('layoutSlice reducers setters representatifs', () => {
  test('dispatchShowOptions definit showOptions', () => {
    const state = reducer(baseState, dispatchShowOptions(true));
    expect(state.showOptions).toBe(true);
  });

  test('setShowOptions definit showOptionsTypeContact', () => {
    const state = reducer(baseState, setShowOptions(true));
    expect(state.showOptionsTypeContact).toBe(true);
  });

  test('toogleShowOptions inverse showOptionsTypeContact', () => {
    const state = reducer(baseState, toogleShowOptions());
    expect(state.showOptionsTypeContact).toBe(true);
  });

  test('toggleAddResponsibleMode inverse isAddResponsibleMode', () => {
    const state = reducer(baseState, toggleAddResponsibleMode());
    expect(state.isAddResponsibleMode).toBe(true);
  });

  test('toggleSupprRespMode definit isToggleSupprRespMode', () => {
    const state = reducer(baseState, toggleSupprRespMode(true));
    expect(state.isToggleSupprRespMode).toBe(true);
  });

  test('setShowCommunesPM gere le format {val, caller}', () => {
    const state = reducer(baseState, setShowCommunesPM({ val: true, caller: 'test' }));
    expect(state.showCommunesPM).toBe(true);
  });

  test('setShowCommunesPM gere un payload simple', () => {
    const state = reducer(baseState, setShowCommunesPM(true));
    expect(state.showCommunesPM).toBe(true);
  });

  test('setMatchingNationalities definit le tableau', () => {
    const state = reducer(baseState, setMatchingNationalities(['Francaise', 'Belge']));
    expect(state.matchingNationalities).toEqual(['Francaise', 'Belge']);
  });

  test('resetMatching vide matchingNationalities et matchingProfessions', () => {
    const prev = { ...baseState, matchingNationalities: ['X'], matchingProfessions: ['Y'] };
    const state = reducer(prev, resetMatching());
    expect(state.matchingNationalities).toEqual([]);
    expect(state.matchingProfessions).toEqual([]);
  });

  test('setContactType definit contactType', () => {
    const state = reducer(baseState, setContactType('morale'));
    expect(state.contactType).toBe('morale');
  });

  test('setConfirmation definit confirmationOpen', () => {
    const state = reducer(baseState, setConfirmation(false));
    expect(state.confirmationOpen).toBe(false);
  });

  test('setIsOpen est un no-op', () => {
    const state = reducer(baseState, setIsOpen(true));
    // L etat ne doit pas changer
    expect(state.modalIsOpen).toBe(baseState.modalIsOpen);
    expect(state.isOpenMod).toBe(baseState.isOpenMod);
  });
});

// --- fetchNotificationCount lifecycle ---

describe('layoutSlice fetchNotificationCount lifecycle', () => {
  test('pending met notificationLoading=true, notificationError=null', () => {
    const state = reducer(baseState, fetchNotificationCount.pending('reqId'));
    expect(state.notificationLoading).toBe(true);
    expect(state.notificationError).toBeNull();
  });

  test('fulfilled definit notificationCount et notificationLoading=false', () => {
    const prev = { ...baseState, notificationLoading: true };
    const state = reducer(prev, fetchNotificationCount.fulfilled(5, 'reqId'));
    expect(state.notificationLoading).toBe(false);
    expect(state.notificationCount).toBe(5);
  });

  test('rejected definit notificationError, notificationCount=0', () => {
    const prev = { ...baseState, notificationLoading: true, notificationCount: 3 };
    const state = reducer(prev, fetchNotificationCount.rejected(null, 'reqId', undefined, 'Erreur reseau'));
    expect(state.notificationLoading).toBe(false);
    expect(state.notificationError).toBe('Erreur reseau');
    expect(state.notificationCount).toBe(0);
  });
});

// --- fetchNotifications lifecycle ---

describe('layoutSlice fetchNotifications lifecycle', () => {
  test('pending met notifications.loading=true', () => {
    const state = reducer(baseState, fetchNotifications.pending('reqId'));
    expect(state.notifications.loading).toBe(true);
    expect(state.notifications.error).toBeNull();
  });

  test('fulfilled (initial load) remplace la liste avec statut de lecture', () => {
    Storage.prototype.getItem.mockReturnValue(JSON.stringify(['n2']));
    const payload = {
      notifications: [{ id: 'n1', subject: 'A' }, { id: 'n2', subject: 'B' }],
      nextPageToken: 'token123',
      fetchedAt: '2024-01-01T00:00:00Z',
      isInitialLoad: true,
    };
    const state = reducer(baseState, fetchNotifications.fulfilled(payload, 'reqId'));
    expect(state.notifications.list).toHaveLength(2);
    expect(state.notifications.list.find(n => n.id === 'n1').isRead).toBe(false);
    expect(state.notifications.list.find(n => n.id === 'n2').isRead).toBe(true);
    expect(state.notifications.nextPageToken).toBe('token123');
    expect(state.notifications.hasMore).toBe(true);
    expect(state.notifications.loading).toBe(false);
  });

  test('fulfilled (pagination) ajoute a la liste existante', () => {
    Storage.prototype.getItem.mockReturnValue(JSON.stringify([]));
    const prevState = {
      ...baseState,
      notifications: { ...baseState.notifications, list: [{ id: 'n1', isRead: false }] },
    };
    const payload = {
      notifications: [{ id: 'n2', subject: 'New' }],
      nextPageToken: null,
      fetchedAt: '2024-01-01T00:00:00Z',
      isInitialLoad: false,
    };
    const state = reducer(prevState, fetchNotifications.fulfilled(payload, 'reqId'));
    expect(state.notifications.list).toHaveLength(2);
    expect(state.notifications.hasMore).toBe(false);
  });

  test('fulfilled deduplique les notifications par ID', () => {
    Storage.prototype.getItem.mockReturnValue(JSON.stringify([]));
    const prevState = {
      ...baseState,
      notifications: { ...baseState.notifications, list: [{ id: 'n1', isRead: false, subject: 'Old' }] },
    };
    const payload = {
      notifications: [{ id: 'n1', subject: 'New' }, { id: 'n2', subject: 'Other' }],
      nextPageToken: null,
      fetchedAt: '2024-01-01T00:00:00Z',
      isInitialLoad: false,
    };
    const state = reducer(prevState, fetchNotifications.fulfilled(payload, 'reqId'));
    // Dedup par Map => le dernier gagne
    expect(state.notifications.list).toHaveLength(2);
    expect(state.notifications.list.find(n => n.id === 'n1').subject).toBe('New');
  });

  test('rejected definit notifications.error', () => {
    const prev = { ...baseState, notifications: { ...baseState.notifications, loading: true } };
    const state = reducer(prev, fetchNotifications.rejected(null, 'reqId', undefined, 'Erreur'));
    expect(state.notifications.loading).toBe(false);
    expect(state.notifications.error).toBe('Erreur');
  });
});

// --- fetchNotificationDetail lifecycle ---

describe('layoutSlice fetchNotificationDetail lifecycle', () => {
  test('pending met detail=null, detailLoading=true', () => {
    const state = reducer(baseState, fetchNotificationDetail.pending('reqId'));
    expect(state.notifications.detail).toBeNull();
    expect(state.notifications.detailLoading).toBe(true);
    expect(state.notifications.detailError).toBeNull();
  });

  test('fulfilled definit detail et detailLoading=false', () => {
    const detail = { id: 'e1', body: 'Contenu' };
    const state = reducer(baseState, fetchNotificationDetail.fulfilled(detail, 'reqId'));
    expect(state.notifications.detailLoading).toBe(false);
    expect(state.notifications.detail).toEqual(detail);
  });

  test('rejected definit detailError et detailLoading=false', () => {
    const state = reducer(baseState, fetchNotificationDetail.rejected(null, 'reqId', undefined, 'Erreur'));
    expect(state.notifications.detailLoading).toBe(false);
    expect(state.notifications.detailError).toBe('Erreur');
  });
});

// --- Thunks async execution ---
// Les createAsyncThunk doivent etre testes via dispatch (pas .call())

describe('layoutSlice thunks async', () => {
  let dispatch, actions;

  beforeEach(() => {
    actions = [];
    dispatch = jest.fn((action) => {
      if (typeof action === 'function') return action(dispatch, () => ({}));
      actions.push(action);
      return action;
    });
  });

  const runThunk = async (thunk, arg, token) => {
    const getState = () => ({ login: { token } });
    const result = await thunk(arg)(dispatch, getState, undefined);
    return result;
  };

  describe('fetchNotificationCount', () => {
    test('appelle apiClient.get et retourne le count via fulfilled', async () => {
      apiClient.get.mockResolvedValue({ data: { notificationCount: 7 } });
      const result = await runThunk(fetchNotificationCount, undefined, 'tok123');
      expect(apiClient.get).toHaveBeenCalledWith('/api/mails/notifications/count');
      expect(result.payload).toBe(7);
    });

    test('rejete si pas de token', async () => {
      const result = await runThunk(fetchNotificationCount, undefined, null);
      expect(result.payload).toBe('Utilisateur non authentifié');
    });

    test('retourne rejectWithValue en cas d erreur API', async () => {
      apiClient.get.mockRejectedValue({ response: { data: { message: 'Server error' } }, message: 'fallback' });
      const result = await runThunk(fetchNotificationCount, undefined, 'tok');
      expect(result.payload).toBe('Server error');
    });
  });

  describe('fetchNotifications', () => {
    test('appelle l URL sans pageToken', async () => {
      apiClient.get.mockResolvedValue({ data: { notifications: [], nextPageToken: null } });
      await runThunk(fetchNotifications, null, 'tok');
      expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('/api/mails/notifications/list?'));
    });

    test('appelle l URL avec pageToken', async () => {
      apiClient.get.mockResolvedValue({ data: { notifications: [], nextPageToken: null } });
      await runThunk(fetchNotifications, 'page2', 'tok');
      expect(apiClient.get).toHaveBeenCalledWith(expect.stringContaining('pageToken=page2'));
    });

    test('rejete si pas de token', async () => {
      const result = await runThunk(fetchNotifications, null, null);
      expect(result.payload).toBe('Utilisateur non authentifié');
    });
  });

  describe('fetchNotificationDetail', () => {
    test('appelle apiClient.get avec emailId', async () => {
      apiClient.get.mockResolvedValue({ data: { id: 'e1', body: 'X' } });
      const result = await runThunk(fetchNotificationDetail, 'e1', 'tok');
      expect(apiClient.get).toHaveBeenCalledWith('/api/mails/email/e1');
      expect(result.payload).toEqual({ id: 'e1', body: 'X' });
    });

    test('rejete si pas de token', async () => {
      const result = await runThunk(fetchNotificationDetail, 'e1', null);
      expect(result.payload).toBe('Utilisateur non authentifié');
    });

    test('retourne rejectWithValue en cas d erreur', async () => {
      apiClient.get.mockRejectedValue(new Error('Network'));
      const result = await runThunk(fetchNotificationDetail, 'e1', 'tok');
      expect(result.payload).toBe('Network');
    });
  });
});

// --- Re-exports ---

describe('layoutSlice re-exports', () => {
  test('exporte fetchNotificationCount comme fonction', () => {
    expect(typeof fetchNotificationCount).toBe('function');
  });

  test('exporte fetchNotifications comme fonction', () => {
    expect(typeof fetchNotifications).toBe('function');
  });

  test('exporte fetchNotificationDetail comme fonction', () => {
    expect(typeof fetchNotificationDetail).toBe('function');
  });

  test('re-exporte setShowPersonnePhysique, setShowPersonneMorale, setShowPMPublique', () => {
    expect(typeof setShowPersonnePhysique).toBe('function');
    expect(typeof setShowPersonneMorale).toBe('function');
    expect(typeof setShowPMPublique).toBe('function');
  });
});
