'use strict';

const IDS = {
  physical: '64f100000000000000000001',
  privateEntity: '64f100000000000000000002',
  publicEntity: '64f100000000000000000003',
  officeUser: '64f100000000000000000004',
};

const query = (value) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(value),
});

test('getAccessibleRelationEntityIds resout en lot les trois carnets et les OfficeUser du cabinet', async () => {
  jest.resetModules();
  const UserContact = { find: jest.fn(() => query([{ contact: IDS.physical }])) };
  const UserContactPM = { find: jest.fn(() => query([{ contactPM: { _id: IDS.privateEntity } }])) };
  const UserContactPMPublique = {
    find: jest.fn(() => query([{ contactPMPublique: IDS.publicEntity }])),
  };
  const UserOfficeUser = {
    find: jest.fn(() => query([{ officeUser: { _id: IDS.officeUser } }])),
  };

  jest.doMock('../../models/Folder/modelsLiaisons/UserContact', () => UserContact);
  jest.doMock('../../models/Folder/modelsLiaisons/UserContactPM', () => UserContactPM);
  jest.doMock('../../models/Folder/modelsLiaisons/UserContactPMPublique', () => UserContactPMPublique);
  jest.doMock('../../models/App_Users/modelsLiaisons/UserOfficeUser', () => UserOfficeUser);
  jest.doMock('../../models/Folder/modelsLiaisons/UserDossier', () => ({}));
  jest.doMock('../../models/Folder/Dossier', () => ({}));
  jest.doMock('../../services/cabinetAccess', () => ({
    getAccessibleUserIds: jest.fn().mockResolvedValue(['64f100000000000000000099']),
  }));
  jest.doMock('../securityLogger', () => ({
    log: jest.fn(),
    EVT: { ACCESS_DENIED: 'ACCESS_DENIED' },
  }));
  jest.doMock('../../services/tenantService', () => ({ resolveTenantId: jest.fn() }));

  const { getAccessibleRelationEntityIds } = require('../ownershipHelpers');
  const result = await getAccessibleRelationEntityIds('64f100000000000000000099', [
    IDS.physical,
    IDS.privateEntity,
    IDS.publicEntity,
    IDS.officeUser,
    'identifiant-invalide-ignore',
  ]);

  expect(result).toEqual({
    contactIds: [IDS.physical, IDS.privateEntity, IDS.publicEntity],
    officeUserIds: [IDS.officeUser],
  });
  expect(UserContact.find).toHaveBeenCalledWith({
    user: { $in: ['64f100000000000000000099'] },
    contact: { $in: [IDS.physical, IDS.privateEntity, IDS.publicEntity, IDS.officeUser] },
  });
});

test('un utilisateur du cabinet est accepte comme avocat interne, un utilisateur etranger non', async () => {
  jest.resetModules();
  const cabinetUser = '64f100000000000000000099';
  const cabinetColleague = '64f100000000000000000098';
  const foreignUser = '64f100000000000000000042';
  const emptyQuery = () => query([]);
  jest.doMock('../../models/Folder/modelsLiaisons/UserContact', () => ({ find: jest.fn(emptyQuery) }));
  jest.doMock('../../models/Folder/modelsLiaisons/UserContactPM', () => ({ find: jest.fn(emptyQuery) }));
  jest.doMock('../../models/Folder/modelsLiaisons/UserContactPMPublique', () => ({ find: jest.fn(emptyQuery) }));
  jest.doMock('../../models/App_Users/modelsLiaisons/UserOfficeUser', () => ({ find: jest.fn(emptyQuery) }));
  jest.doMock('../../models/Folder/modelsLiaisons/UserDossier', () => ({}));
  jest.doMock('../../models/Folder/Dossier', () => ({}));
  jest.doMock('../../services/cabinetAccess', () => ({
    getAccessibleUserIds: jest.fn().mockResolvedValue([cabinetUser, cabinetColleague]),
  }));
  jest.doMock('../securityLogger', () => ({ log: jest.fn(), EVT: { ACCESS_DENIED: 'ACCESS_DENIED' } }));
  jest.doMock('../../services/tenantService', () => ({ resolveTenantId: jest.fn() }));

  const { getAccessibleRelationEntityIds } = require('../ownershipHelpers');
  // Le responsable "de repli" est embarque avec l'_id du User connecte : il
  // doit etre accepte comme relation d'avocat (sinon PUT 403 et disparition
  // du responsable a la lecture). Un User d'un autre cabinet reste refuse.
  const result = await getAccessibleRelationEntityIds(cabinetUser, [cabinetUser, cabinetColleague, foreignUser]);

  expect(result.contactIds).toEqual([]);
  expect(result.officeUserIds).toEqual([cabinetUser, cabinetColleague]);
});

