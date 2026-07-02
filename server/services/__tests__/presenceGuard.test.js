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

test('🔒 un socket déjà légitime ne peut pas se réattribuer un OfficeUser étranger', async () => {
  // 1) présence légitime
  UserOfficeUser.findOne.mockReturnValueOnce(leanOf({ _id: 'link1' }));
  await setSocketPresence({ socketId: 's3', userId: 'userA', officeUserId: 'OU_A' });
  expect(getConnectedOfficeUserIds().has('OU_A')).toBe(true);

  // 2) tentative d'usurpation sur le même socket → rejet + purge de la présence
  UserOfficeUser.findOne.mockReturnValueOnce(leanOf(null));
  const r = await setSocketPresence({ socketId: 's3', userId: 'userA', officeUserId: 'OU_ETRANGER' });
  expect(r).toBe('rejected');
  expect(getConnectedOfficeUserIds().has('OU_ETRANGER')).toBe(false);
  expect(getConnectedOfficeUserIds().has('OU_A')).toBe(false); // la présence est effacée
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
