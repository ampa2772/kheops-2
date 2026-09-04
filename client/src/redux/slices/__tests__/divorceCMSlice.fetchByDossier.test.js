// divorceCMSlice.fetchByDossier.test.js — Tests du thunk fetchDivorceByDossier.
// Un 404 (dossier sans fiche divorce) est absorbe en "pas de fiche" : aucune
// erreur d'etat, aucune erreur console applicative. Les vraies erreurs (401,
// 403, 5xx, reseau) restent signalees dans errorByDossier.

import { configureStore } from '@reduxjs/toolkit';
import divorceCMApi from '../../../services/divorceCMService';
import reducer, { fetchDivorceByDossier } from '../divorceCMSlice';

jest.mock('../../../services/divorceCMService', () => ({
  __esModule: true,
  default: {
    getConstants: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    getByDossier: jest.fn(),
    patch: jest.fn(),
    toggleEtape: jest.fn(),
    getTemplates: jest.fn(),
    saveTemplate: jest.fn(),
  },
}));

// setCurrentDossier est un thunk dans le vrai slice ; une action simple suffit
// ici pour verifier que le rafraichissement du dossier courant est demande.
jest.mock('../currentDossierSlice', () => ({
  setCurrentDossier: (dossier) => ({ type: 'currentDossier/set', payload: dossier }),
}));

const currentDossierReducer = (state = { dossier: null }, action) => (
  action.type === 'currentDossier/set' ? { ...state, dossier: action.payload } : state
);

const makeStore = (currentDossier = null) => configureStore({
  reducer: { divorceCM: reducer, currentDossier: currentDossierReducer },
  preloadedState: { currentDossier: { dossier: currentDossier } },
});

// Erreur axios minimale : message + response.{status,data}
const httpError = (status, data) => Object.assign(
  new Error(`Request failed with status code ${status}`),
  { response: { status, data } },
);

describe('fetchDivorceByDossier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('dossier divorce : la fiche est rangee sous byDossier[id]', async () => {
    const divorceData = { _id: 'div-1', dossierId: 'dos-1', etapes: [] };
    divorceCMApi.getByDossier.mockResolvedValueOnce({ divorceData, dossier: null });
    const store = makeStore({ _id: 'dos-1' });

    const result = await store.dispatch(fetchDivorceByDossier('dos-1'));

    expect(fetchDivorceByDossier.fulfilled.match(result)).toBe(true);
    expect(divorceCMApi.getByDossier).toHaveBeenCalledWith('dos-1');
    const s = store.getState().divorceCM;
    expect(s.byDossier['dos-1']).toEqual(divorceData);
    expect(s.loadingByDossier['dos-1']).toBe(false);
    expect(s.errorByDossier['dos-1']).toBeNull();
    // Sans dossier renvoye par le serveur, le dossier courant n'est pas touche.
    expect(store.getState().currentDossier.dossier).toEqual({ _id: 'dos-1' });
  });

  it('dossier divorce : le dossier renvoye par le rattrapage rafraichit le dossier courant', async () => {
    const dossierMaj = { _id: 'dos-1', dossier: { parties: { pour: [{ nomPartie: 'EPOUX' }], contre: [] } } };
    divorceCMApi.getByDossier.mockResolvedValueOnce({
      divorceData: { _id: 'div-1', dossierId: 'dos-1' },
      dossier: dossierMaj,
    });
    const store = makeStore({ _id: 'dos-1' });

    await store.dispatch(fetchDivorceByDossier('dos-1'));

    expect(store.getState().currentDossier.dossier).toBe(dossierMaj);
  });

  it('dossier ordinaire (404) : "pas de fiche", aucune erreur d etat', async () => {
    divorceCMApi.getByDossier.mockRejectedValueOnce(httpError(404, { message: 'Fiche divorce introuvable.' }));
    const store = makeStore({ _id: 'dos-2' });

    const result = await store.dispatch(fetchDivorceByDossier('dos-2'));

    expect(fetchDivorceByDossier.fulfilled.match(result)).toBe(true);
    expect(result.payload).toEqual({ dossierId: 'dos-2', divorceData: null });
    const s = store.getState().divorceCM;
    expect(s.byDossier['dos-2']).toBeNull();
    expect(s.loadingByDossier['dos-2']).toBe(false);
    expect(s.errorByDossier['dos-2']).toBeNull();
  });

  it.each([
    [401, 'Non authentifie.'],
    [403, 'Acces refuse.'],
    [500, 'Erreur interne du serveur'],
  ])('erreur HTTP %s : signalee dans errorByDossier', async (status, message) => {
    divorceCMApi.getByDossier.mockRejectedValueOnce(httpError(status, { message }));
    const store = makeStore({ _id: 'dos-3' });

    const result = await store.dispatch(fetchDivorceByDossier('dos-3'));

    expect(fetchDivorceByDossier.rejected.match(result)).toBe(true);
    const s = store.getState().divorceCM;
    expect(s.errorByDossier['dos-3']).toBe(message);
    expect(s.loadingByDossier['dos-3']).toBe(false);
    expect(s.byDossier['dos-3']).toBeUndefined();
  });

  it('erreur reseau (pas de reponse) : signalee avec le message de l erreur', async () => {
    divorceCMApi.getByDossier.mockRejectedValueOnce(new Error('Network Error'));
    const store = makeStore({ _id: 'dos-4' });

    const result = await store.dispatch(fetchDivorceByDossier('dos-4'));

    expect(fetchDivorceByDossier.rejected.match(result)).toBe(true);
    expect(store.getState().divorceCM.errorByDossier['dos-4']).toBe('Network Error');
  });

  it('sans identifiant : aucun appel reseau', async () => {
    const store = makeStore(null);

    await store.dispatch(fetchDivorceByDossier(undefined));

    expect(divorceCMApi.getByDossier).not.toHaveBeenCalled();
  });
});
