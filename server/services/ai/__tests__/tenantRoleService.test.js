const mockTenantFindOne = jest.fn();
const mockMembershipFindOne = jest.fn();

jest.mock('../../../models/Cabinet/Tenant', () => ({ findOne: (...args) => mockTenantFindOne(...args) }));
jest.mock('../../../models/Cabinet/Membership', () => ({ findOne: (...args) => mockMembershipFindOne(...args) }));

const { getTenantRole, isTenantManager } = require('../tenantRoleService');

const tenantA = '64c000000000000000000001';
const tenantB = '64c000000000000000000002';
const user = '64c000000000000000000003';

function queryResult(value) {
  return { select: () => ({ lean: async () => value }) };
}

describe('tenant-scoped AI roles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTenantFindOne.mockReturnValue(queryResult(null));
  });

  test('an admin of tenant A is not an admin of tenant B', async () => {
    mockMembershipFindOne.mockImplementation((filter) => queryResult(
      String(filter.tenantId) === tenantA ? { role: 'admin' } : null,
    ));
    expect(await getTenantRole(tenantA, user)).toBe('admin');
    expect(await getTenantRole(tenantB, user)).toBe('secretaire');
    expect(isTenantManager(await getTenantRole(tenantB, user))).toBe(false);
    expect(mockMembershipFindOne).toHaveBeenCalledWith({ tenantId: tenantB, userId: user, status: 'active' });
  });

  test('ownership is checked against the requested tenant only', async () => {
    mockTenantFindOne.mockImplementation((filter) => queryResult(
      String(filter._id) === tenantA ? { _id: tenantA } : null,
    ));
    mockMembershipFindOne.mockReturnValue(queryResult(null));
    expect(await getTenantRole(tenantA, user)).toBe('owner');
    expect(await getTenantRole(tenantB, user)).toBe('secretaire');
  });

  test('database errors and invalid identifiers fail closed', async () => {
    mockTenantFindOne.mockReturnValue({ select: () => ({ lean: async () => { throw new Error('db down'); } }) });
    expect(await getTenantRole(tenantA, user)).toBe('secretaire');
    expect(await getTenantRole('invalid', user)).toBe('secretaire');
  });
});
