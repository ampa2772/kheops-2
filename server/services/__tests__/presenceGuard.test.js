// Tests A14 — anti-usurpation de présence (presence:set-office-user).
// On teste la logique extraite setSocketPresence + l'agrégat getConnectedOfficeUserIds.

jest.mock('../../models/App_Users/modelsLiaisons/UserOfficeUser', () => ({ findOne: jest.fn() }));

const UserOfficeUser = require('../../models/App_Users/modelsLiaisons/UserOfficeUser');
const { setSocketPresence, getConnectedOfficeUserIds, _clearPresence } = require('../chatSocketHandler');

const leanOf = (data) => ({ lean: async () => data });

beforeEach(() => { _clearPresence(); UserOfficeUser.findOne.mockReset(); });

test('OfficeUser possédé (lien UserOfficeUser) → présence enregistrée', async () => {
  UserOfficeUser.findOne.mockReturnValue(leanOf({ _id: 'link1' }));

  const r = await setSocketPresence({ socketId: 's1', userId: 'userA', officeUser: 'OU_A', officeUserId: 'OU_A' });

  expect(r).toBe('set');
  // Le lien est bien vérifié pour le couple (user, officeUser) exact.
  expect(UserOfficeUser.findOne).toHaveBeenCalledWith({ user: 'userA', officeUser: 'OU_A' });
  expect(getConnectedOfficeUserIds().has('OU_A')).toBe(true);
});

test('🔒 OfficeUser NON possédé (autre compte/cabinet) → rejeté, jamais "en ligne"', async () => {
  UserOfficeUser.findOne.mockReturnValue(leanOf(null)); // aucun lien

  const r = await setSocketPresence({ socketId: 's2', userId: 'attacker', officeUserId: 'OU_VICTIME' });

  expect(r).toBe('rejected');
  expect(getConnectedOfficeUserIds().has('OU_VICTIME')).toBe(false);
});

test('🔒 un socket déjà légitime conserve atomiquement sa présence après une tentative étrangère', async () => {
  // 1) présence légitime
  UserOfficeUser.findOne.mockReturnValueOnce(leanOf({ _id: 'link1' }));
  await setSocketPresence({ socketId: 's3', userId: 'userA', officeUserId: 'OU_A' });
  expect(getConnectedOfficeUserIds().has('OU_A')).toBe(true);

  // 2) tentative d'usurpation sur le même socket → rejet sans perdre la
  // présence légitime précédente.
  UserOfficeUser.findOne.mockReturnValueOnce(leanOf(null));
  const r = await setSocketPresence({ socketId: 's3', userId: 'userA', officeUserId: 'OU_ETRANGER' });
  expect(r).toBe('rejected');
  expect(getConnectedOfficeUserIds().has('OU_ETRANGER')).toBe(false);
  expect(getConnectedOfficeUserIds().has('OU_A')).toBe(true);
});

test('officeUserId vide → efface la présence (déconnexion logique)', async () => {
  UserOfficeUser.findOne.mockReturnValue(leanOf({ _id: 'link1' }));
  await setSocketPresence({ socketId: 's4', userId: 'userA', officeUserId: 'OU_A' });
  expect(getConnectedOfficeUserIds().has('OU_A')).toBe(true);

  const r = await setSocketPresence({ socketId: 's4', userId: 'userA', officeUserId: null });
  expect(r).toBe('cleared');
  expect(getConnectedOfficeUserIds().has('OU_A')).toBe(false);
  // Pas de requête DB pour un simple clear.
  expect(UserOfficeUser.findOne).toHaveBeenCalledTimes(1);
});

test('deux bascules concurrentes sont sérialisées et ne laissent qu’un profil actif', async () => {
  let releaseFirstLookup;
  const firstLookup = new Promise(resolve => { releaseFirstLookup = resolve; });
  UserOfficeUser.findOne
    .mockReturnValueOnce({ lean: () => firstLookup })
    .mockReturnValueOnce(leanOf({ _id: 'link2' }));

  const firstSwitch = setSocketPresence({
    socketId: 's5', userId: 'userA', officeUserId: 'OU_A',
  });
  const secondSwitch = setSocketPresence({
    socketId: 's5', userId: 'userA', officeUserId: 'OU_B',
  });

  await new Promise(resolve => setImmediate(resolve));
  expect(UserOfficeUser.findOne).toHaveBeenCalledTimes(1);
  releaseFirstLookup({ _id: 'link1' });

  await expect(Promise.all([firstSwitch, secondSwitch])).resolves.toEqual(['set', 'set']);
  expect(getConnectedOfficeUserIds().has('OU_A')).toBe(false);
  expect(getConnectedOfficeUserIds().has('OU_B')).toBe(true);
});
