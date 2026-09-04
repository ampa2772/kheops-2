// divorceCMService.test.js — Tests du wrapper REST du module divorce CM.
// getByDossier doit appeler la route by-dossier et propager les erreurs
// telles quelles : le choix de traiter un 404 comme "pas de fiche divorce"
// appartient au thunk (divorceCMSlice), pas au service.

import apiClient from '../apiClient';
import divorceCMApi from '../divorceCMService';

jest.mock('../apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// Erreur axios minimale : message + response.{status,data}
const httpError = (status, data) => Object.assign(
  new Error(`Request failed with status code ${status}`),
  { response: { status, data } },
);

describe('divorceCMService.getByDossier', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('appelle GET /api/divorce-cm/by-dossier/:id et renvoie le corps de la reponse', async () => {
    const payload = { divorceData: { _id: 'div-1', dossierId: 'dos-1' }, dossier: null };
    apiClient.get.mockResolvedValueOnce({ data: payload });

    await expect(divorceCMApi.getByDossier('dos-1')).resolves.toEqual(payload);

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith('/api/divorce-cm/by-dossier/dos-1');
  });

  it('propage un 404 sans le masquer (contrat serveur : aucune fiche divorce)', async () => {
    const err = httpError(404, { message: 'Fiche divorce introuvable.' });
    apiClient.get.mockRejectedValueOnce(err);

    await expect(divorceCMApi.getByDossier('dos-1')).rejects.toBe(err);
  });

  it('propage une erreur 500 et une erreur reseau', async () => {
    apiClient.get.mockRejectedValueOnce(httpError(500, { message: 'Erreur interne du serveur' }));
    await expect(divorceCMApi.getByDossier('dos-1')).rejects.toMatchObject({ response: { status: 500 } });

    const netErr = new Error('Network Error');
    apiClient.get.mockRejectedValueOnce(netErr);
    await expect(divorceCMApi.getByDossier('dos-1')).rejects.toBe(netErr);
  });
});
