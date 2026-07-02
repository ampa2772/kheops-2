// Tests R5b — partage intra-cabinet. Le point CRITIQUE : aucune fuite entre cabinets.
// Modèles Mongoose simulés (pas de vraie base).

jest.mock('../../models/App_Users/User', () => ({ findById: jest.fn() }));
jest.mock('../../models/Cabinet/Tenant', () => ({ find: jest.fn() }));
jest.mock('../../models/Cabinet/Membership', () => ({ find: jest.fn() }));

const User = require('../../models/App_Users/User');
const Tenant = require('../../models/Cabinet/Tenant');
const Membership = require('../../models/Cabinet/Membership');
const { getAccessibleUserIds, computeAccessibleUserIds } = require('../cabinetAccess');

const chain = (data) => ({ select: () => ({ lean: async () => data }) });

// Jeu de données : A possède le cabinet TA ; B possède TB mais est MEMBRE ACTIF de TA.
//                  C possède TC, seul dans son coin (aucun lien).
const OWNER_BY_TENANT = { TA: 'A', TB: 'B', TC: 'C' };
const USER_TENANT = { A: 'TA', B: 'TB', C: 'TC' };
const MEMBERSHIPS = [{ tenantId: 'TA', userId: 'B', status: 'active' }];

beforeEach(() => {
  User.findById.mockImplementation((id) => chain(USER_TENANT[String(id)] ? { tenantId: USER_TENANT[String(id)] } : null));
  Tenant.find.mockImplementation((q) => {
    if (q.ownerUserId !== undefined) {
      return chain(Object.entries(OWNER_BY_TENANT)
        .filter(([, owner]) => owner === String(q.ownerUserId))
        .map(([t]) => ({ _id: t })));
    }
    if (q._id && q._id.$in) {
      return chain(q._id.$in
        .map((t) => ({ ownerUserId: OWNER_BY_TENANT[String(t)] }))
        .filter((x) => x.ownerUserId));
    }
    return chain([]);
  });
  Membership.find.mockImplementation((q) => {
    if (q.userId !== undefined) {
      return chain(MEMBERSHIPS
        .filter((m) => String(m.userId) === String(q.userId) && m.status === 'active')
        .map((m) => ({ tenantId: m.tenantId })));
    }
    if (q.tenantId && q.tenantId.$in) {
      const set = new Set(q.tenantId.$in.map(String));
      return chain(MEMBERSHIPS
        .filter((m) => set.has(String(m.tenantId)) && m.status === 'active')
        .map((m) => ({ userId: m.userId })));
    }
    return chain([]);
  });
});

afterEach(() => jest.clearAllMocks());

describe('computeAccessibleUserIds (pur)', () => {
  test('inclut self + fusionne + déduplique', () => {
    expect(computeAccessibleUserIds({ selfId: 'A', tenantOwnerIds: ['A', 'B'], tenantMemberIds: ['B', null] }).sort())
      .toEqual(['A', 'B']);
  });
  test('solo → self seul', () => {
    expect(computeAccessibleUserIds({ selfId: 'X' })).toEqual(['X']);
  });
});

describe('getAccessibleUserIds (partage intra-cabinet)', () => {
  test('propriétaire A voit A + le membre B', async () => {
    expect((await getAccessibleUserIds('A')).sort()).toEqual(['A', 'B']);
  });

  test('membre B voit A + B (son cabinet perso + le cabinet TA)', async () => {
    expect((await getAccessibleUserIds('B')).sort()).toEqual(['A', 'B']);
  });

  test('🔒 AUCUNE fuite : C (cabinet séparé) ne voit que C', async () => {
    expect(await getAccessibleUserIds('C')).toEqual(['C']);
  });

  test('🔒 AUCUNE fuite : ni A ni B ne voient C', async () => {
    expect(await getAccessibleUserIds('A')).not.toContain('C');
    expect(await getAccessibleUserIds('B')).not.toContain('C');
  });

  test('fermé par défaut : erreur DB → self seul', async () => {
    User.findById.mockImplementationOnce(() => { throw new Error('db down'); });
    expect(await getAccessibleUserIds('A')).toEqual(['A']);
  });

  test('utilisateur inconnu → self seul', async () => {
    expect(await getAccessibleUserIds('ZZZ')).toEqual(['ZZZ']);
  });
});
