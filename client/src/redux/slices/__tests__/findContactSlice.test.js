// Tests unitaires — findContactSlice.js

jest.mock('../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

import apiClient from '../../../services/apiClient';
import reducer, { resetFindContact, fetchContactById } from '../findContactSlice';

const initialState = {
  contact: null,
  loading: false,
  error: null,
};

describe('findContactSlice etat initial', () => {
  test('retourne l etat initial par defaut', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state).toEqual(initialState);
  });
});

describe('findContactSlice reducers', () => {
  test('resetFindContact remet tout a l etat initial', () => {
    const state = reducer(
      { contact: { _id: 'c1' }, loading: true, error: 'erreur' },
      resetFindContact()
    );
    expect(state).toEqual(initialState);
  });
});

describe('findContactSlice extraReducers', () => {
  test('FETCH_CONTACT_BY_ID_REQUEST met loading=true et reset contact/error', () => {
    const state = reducer(
      { contact: { _id: 'old' }, loading: false, error: 'old error' },
      { type: 'FETCH_CONTACT_BY_ID_REQUEST' }
    );
    expect(state.loading).toBe(true);
    expect(state.contact).toBeNull();
    expect(state.error).toBeNull();
  });

  test('FETCH_CONTACT_BY_ID_SUCCESS definit contact et loading=false', () => {
    const payload = { _id: 'c1', nom: 'Dupont', email: 'a@b.com' };
    const state = reducer(
      { contact: null, loading: true, error: null },
      { type: 'FETCH_CONTACT_BY_ID_SUCCESS', payload }
    );
    expect(state.contact).toEqual(payload);
    expect(state.loading).toBe(false);
  });

  test('FETCH_CONTACT_BY_ID_FAILURE definit error et loading=false', () => {
    const state = reducer(
      { contact: null, loading: true, error: null },
      { type: 'FETCH_CONTACT_BY_ID_FAILURE', payload: 'Not found' }
    );
    expect(state.error).toBe('Not found');
    expect(state.loading).toBe(false);
  });
});

describe('findContactSlice thunk fetchContactById', () => {
  let dispatch;

  beforeEach(() => {
    dispatch = jest.fn();
    apiClient.get.mockReset();
  });

  test('dispatch REQUEST puis SUCCESS avec donnees nettoyees', async () => {
    apiClient.get.mockResolvedValue({
      data: { _id: 'c1', nom: 'Dupont', adresse: null, nested: { val: undefined } },
    });
    await fetchContactById('c1', 'tok123')(dispatch);

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][0].type).toBe('FETCH_CONTACT_BY_ID_REQUEST');

    const successAction = dispatch.mock.calls[1][0];
    expect(successAction.type).toBe('FETCH_CONTACT_BY_ID_SUCCESS');
    // cleanData remplace null/undefined par ''
    expect(successAction.payload.adresse).toBe('');
    expect(successAction.payload.nested.val).toBe('');
    expect(successAction.payload.nom).toBe('Dupont');
  });

  test('appelle apiClient.get avec la bonne URL', async () => {
    apiClient.get.mockResolvedValue({ data: { _id: 'c2' } });
    await fetchContactById('c2', 'tok')(dispatch);
    expect(apiClient.get).toHaveBeenCalledWith('/api/folder/contact/c2');
  });

  test('dispatch REQUEST puis FAILURE en cas d erreur API', async () => {
    apiClient.get.mockRejectedValue({
      response: { data: { message: 'Contact introuvable' } },
      message: 'fallback',
    });
    await fetchContactById('c3', 'tok')(dispatch);

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0][0].type).toBe('FETCH_CONTACT_BY_ID_REQUEST');
    expect(dispatch.mock.calls[1][0]).toEqual({
      type: 'FETCH_CONTACT_BY_ID_FAILURE',
      payload: 'Contact introuvable',
    });
  });

  test('FAILURE utilise err.message si pas de response.data', async () => {
    apiClient.get.mockRejectedValue(new Error('Network Error'));
    await fetchContactById('c4', 'tok')(dispatch);

    const failAction = dispatch.mock.calls[1][0];
    expect(failAction.payload).toBe('Network Error');
  });
});
