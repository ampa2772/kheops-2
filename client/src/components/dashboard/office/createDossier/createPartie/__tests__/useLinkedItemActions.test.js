// useLinkedItemActions.test.js — Tests du hook useLinkedItemActions
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Mock useOutsideClick (depuis fonctions.js)
const mockUseOutsideClick = jest.fn();
jest.mock('../fonctions', () => ({
  useOutsideClick: (...args) => mockUseOutsideClick(...args),
}));

// Mocks Redux actions
const mockSetModifyingContactId = jest.fn();
const mockSetIsOpen = jest.fn();
const mockResetFindContact = jest.fn();

const layoutInitialState = {
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
  notifications: { list: [], loading: false, error: null, nextPageToken: null, hasMore: true, lastFetched: null, detail: null, detailLoading: false, detailError: null },
};

jest.mock('../../../../../../redux/slices/layoutSlice', () => ({
  __esModule: true,
  default: (state = layoutInitialState, action) => {
    if (action.type === 'layout/setModifyingContactId') {
      return { ...state, modifyingContactId: action.payload };
    }
    if (action.type === 'layout/setIsOpen') {
      return { ...state, isOpenMod: action.payload };
    }
    return state;
  },
  setModifyingContactId: (val) => {
    mockSetModifyingContactId(val);
    return { type: 'layout/setModifyingContactId', payload: val };
  },
  setIsOpen: (val) => {
    mockSetIsOpen(val);
    return { type: 'layout/setIsOpen', payload: val };
  },
  setSidebarOpen: jest.fn().mockReturnValue({ type: 'layout/setSidebarOpen' }),
  fetchNotificationCount: jest.fn().mockReturnValue({ type: 'FETCH_NOTIFICATION_COUNT' }),
  fetchNotifications: jest.fn().mockReturnValue({ type: 'FETCH_NOTIFICATIONS' }),
  closeNotificationsModal: jest.fn().mockReturnValue({ type: 'CLOSE_NOTIFS_MODAL' }),
}));

const findContactInitialState = { contact: null, loading: false, error: null };

jest.mock('../../../../../../redux/slices/findContactSlice', () => ({
  __esModule: true,
  default: (state = findContactInitialState) => state,
  resetFindContact: () => {
    mockResetFindContact();
    return { type: 'findContact/resetFindContact' };
  },
}));

// Mocks globaux pour rootReducer
const currentDossierInitialState = { dossier: { _id: 'd1', nom: 'Dossier Test' }, documents: [], loading: false, error: null, documentTemplates: [] };

jest.mock('../../../../../../redux/slices/currentDossierSlice', () => ({
  __esModule: true,
  default: (state = currentDossierInitialState) => state,
  UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS: 'UPDATE_DOCUMENT_LIST_IN_LAST_DOSSIERS',
  DELETE_DOSSIER_SUCCESS: 'DELETE_DOSSIER_SUCCESS',
  UPDATE_CURRENT_DOSSIER_SUCCESS: 'UPDATE_CURRENT_DOSSIER_SUCCESS',
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

import rootReducer from '../../../../../../redux/rootReducer';
import useLinkedItemActions from '../useLinkedItemActions';

const createWrapper = (preloadedState = {}) => {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      login: { user: null, isAuthenticated: false, error: null, loading: false },
      currentDossier: { dossier: { _id: 'd1', nom: 'Dossier Test' }, documents: [], loading: false, error: null, documentTemplates: [] },
      ...preloadedState,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const Wrapper = ({ children }) => (
    <Provider store={store}>{children}</Provider>
  );
  return Wrapper;
};

describe('useLinkedItemActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===================== Retour du hook =====================
  describe('retour du hook', () => {
    it('retourne toutes les proprietes attendues', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      expect(result.current).toHaveProperty('dispatch');
      expect(result.current).toHaveProperty('optionsRef');
      expect(result.current).toHaveProperty('isOptionsOpen');
      expect(result.current).toHaveProperty('handleOptionsClick');
      expect(result.current).toHaveProperty('isModifierHovered');
      expect(result.current).toHaveProperty('setIsModifierHovered');
      expect(result.current).toHaveProperty('isSupprimerHovered');
      expect(result.current).toHaveProperty('setIsSupprimerHovered');
      expect(result.current).toHaveProperty('isModalOpen');
      expect(result.current).toHaveProperty('handleModifierClick');
      expect(result.current).toHaveProperty('handleCloseModal');
      expect(result.current).toHaveProperty('dossierIdFromStore');
    });
  });

  // ===================== Options menu =====================
  describe('options menu', () => {
    it('isOptionsOpen est initialement false', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      expect(result.current.isOptionsOpen).toBe(false);
    });

    it('handleOptionsClick toggle isOptionsOpen', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      act(() => {
        result.current.handleOptionsClick();
      });
      expect(result.current.isOptionsOpen).toBe(true);

      act(() => {
        result.current.handleOptionsClick();
      });
      expect(result.current.isOptionsOpen).toBe(false);
    });

    it('appelle useOutsideClick avec le ref, callback et isActive', () => {
      const wrapper = createWrapper();
      renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      expect(mockUseOutsideClick).toHaveBeenCalled();
      const [ref, callback, isActive] = mockUseOutsideClick.mock.calls[0];
      expect(ref).toBeDefined();
      expect(typeof callback).toBe('function');
      expect(typeof isActive).toBe('boolean');
    });
  });

  // ===================== Hover states =====================
  describe('hover states', () => {
    it('isModifierHovered et isSupprimerHovered initialement false', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      expect(result.current.isModifierHovered).toBe(false);
      expect(result.current.isSupprimerHovered).toBe(false);
    });

    it('setIsModifierHovered change l etat', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      act(() => {
        result.current.setIsModifierHovered(true);
      });
      expect(result.current.isModifierHovered).toBe(true);

      act(() => {
        result.current.setIsModifierHovered(false);
      });
      expect(result.current.isModifierHovered).toBe(false);
    });

    it('setIsSupprimerHovered change l etat', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      act(() => {
        result.current.setIsSupprimerHovered(true);
      });
      expect(result.current.isSupprimerHovered).toBe(true);

      act(() => {
        result.current.setIsSupprimerHovered(false);
      });
      expect(result.current.isSupprimerHovered).toBe(false);
    });
  });

  // ===================== Modal management =====================
  describe('modal management', () => {
    it('isModalOpen est false quand modifyingContactId !== contactId', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      expect(result.current.isModalOpen).toBe(false);
    });

    it('isModalOpen est true quand modifyingContactId === contactId', () => {
      const wrapper = createWrapper({
        layout: { ...layoutInitialState, modifyingContactId: 'contact1' },
      });
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      expect(result.current.isModalOpen).toBe(true);
    });

    it('handleModifierClick dispatch resetFindContact et setModifyingContactId', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      act(() => {
        result.current.handleModifierClick();
      });

      expect(mockResetFindContact).toHaveBeenCalled();
      expect(mockSetModifyingContactId).toHaveBeenCalledWith('contact1');
    });

    it('handleCloseModal dispatch setModifyingContactId(null)', () => {
      const wrapper = createWrapper({
        layout: { ...layoutInitialState, modifyingContactId: 'contact1' },
      });
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      act(() => {
        result.current.handleCloseModal();
      });

      expect(mockSetModifyingContactId).toHaveBeenCalledWith(null);
    });

    it('useEffect dispatch setIsOpen quand isModalOpen change', () => {
      // Avec modifyingContactId === contactId → isModalOpen = true → dispatch setIsOpen(true)
      const wrapper = createWrapper({
        layout: { ...layoutInitialState, modifyingContactId: 'contact1' },
      });

      renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      expect(mockSetIsOpen).toHaveBeenCalledWith(true);
    });

    it('useEffect dispatch setIsOpen(false) quand isModalOpen est false', () => {
      const wrapper = createWrapper();

      renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      expect(mockSetIsOpen).toHaveBeenCalledWith(false);
    });
  });

  // ===================== dossierIdFromStore =====================
  describe('dossierIdFromStore', () => {
    it('lit le dossierId depuis state.currentDossier.dossier._id', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      expect(result.current.dossierIdFromStore).toBe('d1');
    });

    it('retourne undefined si pas de dossier courant', () => {
      const wrapper = createWrapper({
        currentDossier: { dossier: null, documents: [], loading: false, error: null, documentTemplates: [] },
      });
      const { result } = renderHook(() => useLinkedItemActions('contact1'), { wrapper });

      expect(result.current.dossierIdFromStore).toBeUndefined();
    });
  });
});
