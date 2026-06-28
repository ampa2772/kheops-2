// Tests unitaires — allSearchSlice.js

jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import apiClient from '../../../services/apiClient';
import {
  allSearchReducer,
  globalContactsSearchReducer,
  linkedSearchReducer,
  searchContacts,
  searchContactsLinkPartie,
  searchContactsForDossier,
  searchAllUserContacts,
  searchDossiersByParties,
  resetContactsLinkPartie,
} from '../allSearchSlice';

// --- allSearchReducer ---

describe('allSearchReducer', () => {
  const initialState = { loading: false, all: [], error: null, loadingDossiers: false, dossierResults: [], dossierError: null };

  test('retourne l etat initial par defaut', () => {
    expect(allSearchReducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  test('SEARCH_CONTACTS_REQUEST met loading=true', () => {
    const s = allSearchReducer(initialState, { type: 'SEARCH_CONTACTS_REQUEST' });
    expect(s.loading).toBe(true);
    expect(s.error).toBeNull();
  });

  test('SEARCH_CONTACTS_SUCCESS definit all', () => {
    const payload = [{ _id: 'c1' }];
    const s = allSearchReducer({ ...initialState, loading: true }, { type: 'SEARCH_CONTACTS_SUCCESS', payload });
    expect(s.loading).toBe(false);
    expect(s.all).toEqual(payload);
  });

  test('SEARCH_CONTACTS_FAIL definit error', () => {
    const s = allSearchReducer({ ...initialState, loading: true }, { type: 'SEARCH_CONTACTS_FAIL', payload: 'err' });
    expect(s.loading).toBe(false);
    expect(s.error).toBe('err');
  });

  test('SEARCH_DOSSIERS_BY_PARTIES_REQUEST met loadingDossiers=true', () => {
    const s = allSearchReducer(initialState, { type: 'SEARCH_DOSSIERS_BY_PARTIES_REQUEST' });
    expect(s.loadingDossiers).toBe(true);
  });

  test('SEARCH_DOSSIERS_BY_PARTIES_SUCCESS definit dossierResults', () => {
    const payload = [{ _id: 'd1' }];
    const s = allSearchReducer(initialState, { type: 'SEARCH_DOSSIERS_BY_PARTIES_SUCCESS', payload });
    expect(s.dossierResults).toEqual(payload);
    expect(s.loadingDossiers).toBe(false);
  });

  test('SEARCH_DOSSIERS_BY_PARTIES_FAIL definit dossierError', () => {
    const s = allSearchReducer(initialState, { type: 'SEARCH_DOSSIERS_BY_PARTIES_FAIL', payload: 'err' });
    expect(s.dossierError).toBe('err');
  });
});

// --- globalContactsSearchReducer ---

describe('globalContactsSearchReducer', () => {
  const initialState = { loadingAllUserContacts: false, allUserContactsResults: [], errorAllUserContacts: null };

  test('retourne l etat initial', () => {
    expect(globalContactsSearchReducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  test('SEARCH_ALL_USER_CONTACTS_REQUEST met loading', () => {
    const s = globalContactsSearchReducer(initialState, { type: 'SEARCH_ALL_USER_CONTACTS_REQUEST' });
    expect(s.loadingAllUserContacts).toBe(true);
  });

  test('SEARCH_ALL_USER_CONTACTS_SUCCESS definit resultats', () => {
    const s = globalContactsSearchReducer(initialState, { type: 'SEARCH_ALL_USER_CONTACTS_SUCCESS', payload: [{ _id: 'x' }] });
    expect(s.allUserContactsResults).toEqual([{ _id: 'x' }]);
    expect(s.loadingAllUserContacts).toBe(false);
  });

  test('SEARCH_ALL_USER_CONTACTS_FAIL definit erreur et vide resultats', () => {
    const s = globalContactsSearchReducer(
      { ...initialState, allUserContactsResults: [{ _id: 'x' }] },
      { type: 'SEARCH_ALL_USER_CONTACTS_FAIL', payload: 'err' }
    );
    expect(s.errorAllUserContacts).toBe('err');
    expect(s.allUserContactsResults).toEqual([]);
  });

  test('SEARCH_ALL_USER_CONTACTS_RESET remet a l etat initial', () => {
    const s = globalContactsSearchReducer(
      { loadingAllUserContacts: true, allUserContactsResults: [{ _id: 'x' }], errorAllUserContacts: 'err' },
      { type: 'SEARCH_ALL_USER_CONTACTS_RESET' }
    );
    expect(s).toEqual(initialState);
  });
});

// --- linkedSearchReducer ---

describe('linkedSearchReducer', () => {
  const initialState = { loading: false, all: [], error: null };

  test('retourne l etat initial', () => {
    expect(linkedSearchReducer(undefined, { type: '@@INIT' })).toEqual(initialState);
  });

  test('SEARCH_CONTACTS_LINK_PARTIE_REQUEST met loading', () => {
    const s = linkedSearchReducer(initialState, { type: 'SEARCH_CONTACTS_LINK_PARTIE_REQUEST' });
    expect(s.loading).toBe(true);
  });

  test('SEARCH_CONTACTS_LINK_PARTIE_SUCCESS definit all', () => {
    const s = linkedSearchReducer(initialState, { type: 'SEARCH_CONTACTS_LINK_PARTIE_SUCCESS', payload: [{ _id: 'y' }] });
    expect(s.all).toEqual([{ _id: 'y' }]);
    expect(s.loading).toBe(false);
  });

  test('SEARCH_CONTACTS_LINK_PARTIE_FAIL definit error', () => {
    const s = linkedSearchReducer(initialState, { type: 'SEARCH_CONTACTS_LINK_PARTIE_FAIL', payload: 'err' });
    expect(s.error).toBe('err');
  });

  test('RESET_CONTACTS_LINK_PARTIE remet a l etat initial', () => {
    const s = linkedSearchReducer({ loading: true, all: [{ _id: 'z' }], error: 'err' }, { type: 'RESET_CONTACTS_LINK_PARTIE' });
    expect(s).toEqual(initialState);
  });
});

// --- Action creator ---

describe('allSearchSlice action creator', () => {
  test('resetContactsLinkPartie retourne le bon type', () => {
    expect(resetContactsLinkPartie()).toEqual({ type: 'RESET_CONTACTS_LINK_PARTIE' });
  });
});

// --- Thunks ---

describe('allSearchSlice thunks', () => {
  let dispatch;

  beforeEach(() => {
    dispatch = jest.fn();
    apiClient.post.mockReset();
  });

  describe('searchContacts', () => {
    test('dispatch REQUEST puis SUCCESS en cas de succes', async () => {
      apiClient.post.mockResolvedValue({ data: [{ _id: 'c1' }] });
      await searchContacts('dupont', { _id: 'u1' }, 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_CONTACTS_REQUEST' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_CONTACTS_SUCCESS', payload: [{ _id: 'c1' }] });
    });

    test('dispatch SUCCESS avec tableau vide si chaine vide', async () => {
      await searchContacts('   ', {}, 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_CONTACTS_SUCCESS', payload: [] });
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    test('dispatch FAIL en cas d erreur', async () => {
      apiClient.post.mockRejectedValue({ response: { data: { message: 'Server error' } } });
      await searchContacts('test', {}, 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_CONTACTS_FAIL', payload: 'Server error' });
    });
  });

  describe('searchContactsLinkPartie', () => {
    test('dispatch REQUEST puis SUCCESS', async () => {
      apiClient.post.mockResolvedValue({ data: [{ _id: 'c2' }] });
      await searchContactsLinkPartie('martin', { _id: 'u1' }, 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_CONTACTS_LINK_PARTIE_SUCCESS', payload: [{ _id: 'c2' }] });
    });

    test('dispatch SUCCESS vide si chaine vide', async () => {
      await searchContactsLinkPartie('  ', {}, 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_CONTACTS_LINK_PARTIE_SUCCESS', payload: [] });
    });
  });

  describe('searchContactsForDossier', () => {
    test('dispatch REQUEST puis SUCCESS', async () => {
      apiClient.post.mockResolvedValue({ data: [{ _id: 'c3' }] });
      await searchContactsForDossier('avocat', 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_CONTACTS_DOSSIER_SUCCESS', payload: [{ _id: 'c3' }] });
    });

    test('dispatch SUCCESS vide si chaine vide', async () => {
      await searchContactsForDossier('  ', 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_CONTACTS_DOSSIER_SUCCESS', payload: [] });
    });
  });

  describe('searchAllUserContacts', () => {
    test('dispatch REQUEST puis SUCCESS', async () => {
      apiClient.post.mockResolvedValue({ data: [{ _id: 'c4' }] });
      await searchAllUserContacts('global', 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_ALL_USER_CONTACTS_SUCCESS', payload: [{ _id: 'c4' }] });
    });

    test('dispatch SUCCESS vide si chaine vide', async () => {
      await searchAllUserContacts('  ', 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_ALL_USER_CONTACTS_SUCCESS', payload: [] });
    });

    test('dispatch FAIL en cas d erreur', async () => {
      apiClient.post.mockRejectedValue(new Error('Network'));
      await searchAllUserContacts('test', 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_ALL_USER_CONTACTS_FAIL', payload: 'Network' });
    });
  });

  describe('searchDossiersByParties', () => {
    test('dispatch REQUEST puis SUCCESS', async () => {
      apiClient.post.mockResolvedValue({ data: [{ _id: 'd1' }] });
      await searchDossiersByParties('dossier', 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_DOSSIERS_BY_PARTIES_SUCCESS', payload: [{ _id: 'd1' }] });
    });

    test('dispatch SUCCESS vide si chaine vide', async () => {
      await searchDossiersByParties('  ', 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_DOSSIERS_BY_PARTIES_SUCCESS', payload: [] });
    });

    test('dispatch FAIL en cas d erreur', async () => {
      apiClient.post.mockRejectedValue(new Error('Timeout'));
      await searchDossiersByParties('test', 'tok')(dispatch);
      expect(dispatch).toHaveBeenCalledWith({ type: 'SEARCH_DOSSIERS_BY_PARTIES_FAIL', payload: 'Timeout' });
    });
  });
});
