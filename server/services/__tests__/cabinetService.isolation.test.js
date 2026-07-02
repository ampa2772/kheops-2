// Test A1 — ISOLATION du bilan/rentabilité cabinet.
// Vérifie que calculerBilan n'agrège QUE les dossiers du cabinet de
// l'utilisateur (jamais Dossier.find({}) global qui fuiterait le CA des autres).

jest.mock('../../models/Cabinet/CabinetExpense', () => ({ find: jest.fn() }));
jest.mock('../../models/Cabinet/CabinetRecurringExpense', () => ({ find: jest.fn() }));
jest.mock('../../models/Folder/Dossier', () => ({ find: jest.fn() }));
jest.mock('../../models/Folder/modelsLiaisons/UserDossier', () => ({ find: jest.fn() }));
jest.mock('../cabinetAccess', () => ({ getAccessibleUserIds: jest.fn() }));

const CabinetExpense = require('../../models/Cabinet/CabinetExpense');
const Dossier = require('../../models/Folder/Dossier');
const UserDossier = require('../../models/Folder/modelsLiaisons/UserDossier');
const { getAccessibleUserIds } = require('../cabinetAccess');
const { calculerBilan } = require('../cabinetService');

const leanOf = (data) => ({ select: () => ({ lean: async () => data }) });
// CabinetExpense.find(...).lean() (pas de .select())
const leanDirect = (data) => ({ lean: async () => data });

beforeEach(() => {
  getAccessibleUserIds.mockResolvedValue(['A', 'B']); // A + son collègue de cabinet
  CabinetExpense.find.mockReturnValue(leanDirect([]));
});
afterEach(() => jest.clearAllMocks());

test('scope les recettes aux dossiers du cabinet (UserDossier + $in), jamais find({})', async () => {
  UserDossier.find.mockReturnValue(leanOf([{ dossier: 'D1' }, { dossier: 'D2' }]));
  Dossier.find.mockReturnValue(leanOf([]));

  await calculerBilan('A');

  // 1. Le périmètre cabinet est bien résolu à partir de l'utilisateur.
  expect(getAccessibleUserIds).toHaveBeenCalledWith('A');
  // 2. Les liens UserDossier sont filtrés sur les membres du cabinet.
  expect(UserDossier.find).toHaveBeenCalledWith({ user: { $in: ['A', 'B'] } });
  // 3. Les dossiers sont chargés UNIQUEMENT par leurs _id scoping (pas {}).
  expect(Dossier.find).toHaveBeenCalledTimes(1);
  const dossierQuery = Dossier.find.mock.calls[0][0];
  expect(dossierQuery).toEqual({ _id: { $in: ['D1', 'D2'] } });
  expect(dossierQuery).not.toEqual({});
});

test('🔒 aucun dossier dans le cabinet → aucune requête Dossier.find (0 recette, pas de fuite)', async () => {
  UserDossier.find.mockReturnValue(leanOf([]));

  const bilan = await calculerBilan('A');

  expect(Dossier.find).not.toHaveBeenCalled();
  expect(bilan.recettes.ttc).toBe(0);
});
