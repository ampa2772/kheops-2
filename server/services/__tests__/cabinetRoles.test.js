// Tests A6/A7 — résolution du rôle cabinet + garde de suppression de dossier.
// Modèles Mongoose simulés (pas de vraie base).

jest.mock('../../models/Cabinet/Tenant', () => ({ findOne: jest.fn() }));
jest.mock('../../models/Cabinet/Membership', () => ({ find: jest.fn() }));
jest.mock('../../utils/securityLogger', () => ({
  log: jest.fn(),
  EVT: { ACCESS_DENIED: 'ACCESS_DENIED' },
}));

const Tenant = require('../../models/Cabinet/Tenant');
const Membership = require('../../models/Cabinet/Membership');
const secLogger = require('../../utils/securityLogger');
const {
  getCabinetRole, canDeleteDossier, canValidateCarpa, canViewCabinetFinances,
  ensureCabinetRole, ROLES, ROLES_CAN_VALIDATE_CARPA, ROLES_CAN_VIEW_CABINET_FINANCES,
} = require('../cabinetRoles');

const selectLean = (data) => ({ select: () => ({ lean: async () => data }) });

beforeEach(() => {
  Tenant.findOne.mockReturnValue(selectLean(null));
  Membership.find.mockReturnValue(selectLean([]));
});
afterEach(() => jest.clearAllMocks());

describe('getCabinetRole', () => {
  test('titulaire de cabinet → owner', async () => {
    Tenant.findOne.mockReturnValue(selectLean({ _id: 'TA' }));
    expect(await getCabinetRole('A')).toBe(ROLES.OWNER);
  });

  test('membre secrétaire → secretaire', async () => {
    Membership.find.mockReturnValue(selectLean([{ role: 'secretaire' }]));
    expect(await getCabinetRole('S')).toBe(ROLES.SECRETAIRE);
  });

  test('membre avocat → avocat', async () => {
    Membership.find.mockReturnValue(selectLean([{ role: 'avocat' }]));
    expect(await getCabinetRole('AV')).toBe(ROLES.AVOCAT);
  });

  test('cumul de rôles → renvoie le plus fort (admin > collaborateur)', async () => {
    Membership.find.mockReturnValue(selectLean([{ role: 'collaborateur' }, { role: 'admin' }]));
    expect(await getCabinetRole('M')).toBe(ROLES.ADMIN);
  });

  test('utilisateur solo (ni owner ni membre) → owner (propriétaire de ses données)', async () => {
    expect(await getCabinetRole('SOLO')).toBe(ROLES.OWNER);
  });

  test('fail-safe : erreur DB → rôle le plus restrictif (secretaire)', async () => {
    Tenant.findOne.mockImplementationOnce(() => { throw new Error('db down'); });
    expect(await getCabinetRole('A')).toBe(ROLES.SECRETAIRE);
  });

  test('userId absent → secretaire', async () => {
    expect(await getCabinetRole(null)).toBe(ROLES.SECRETAIRE);
  });
});

describe('canDeleteDossier', () => {
  test('owner/admin/avocat peuvent supprimer', () => {
    expect(canDeleteDossier(ROLES.OWNER)).toBe(true);
    expect(canDeleteDossier(ROLES.ADMIN)).toBe(true);
    expect(canDeleteDossier(ROLES.AVOCAT)).toBe(true);
  });

  test('🔒 secrétaire et collaborateur NE peuvent PAS supprimer', () => {
    expect(canDeleteDossier(ROLES.SECRETAIRE)).toBe(false);
    expect(canDeleteDossier(ROLES.COLLABORATEUR)).toBe(false);
  });
});

describe('canValidateCarpa (A6)', () => {
  test('owner/admin/avocat peuvent engager une opération CARPA', () => {
    expect(canValidateCarpa(ROLES.OWNER)).toBe(true);
    expect(canValidateCarpa(ROLES.ADMIN)).toBe(true);
    expect(canValidateCarpa(ROLES.AVOCAT)).toBe(true);
  });

  test('🔒 secrétaire et collaborateur NE peuvent PAS engager', () => {
    expect(canValidateCarpa(ROLES.SECRETAIRE)).toBe(false);
    expect(canValidateCarpa(ROLES.COLLABORATEUR)).toBe(false);
  });
});

describe('canViewCabinetFinances (A6)', () => {
  test('owner/admin peuvent consulter les finances du cabinet', () => {
    expect(canViewCabinetFinances(ROLES.OWNER)).toBe(true);
    expect(canViewCabinetFinances(ROLES.ADMIN)).toBe(true);
  });

  test('🔒 avocat, collaborateur et secrétaire NE voient PAS le bilan consolidé', () => {
    expect(canViewCabinetFinances(ROLES.AVOCAT)).toBe(false);
    expect(canViewCabinetFinances(ROLES.COLLABORATEUR)).toBe(false);
    expect(canViewCabinetFinances(ROLES.SECRETAIRE)).toBe(false);
  });
});

describe('ensureCabinetRole (A6 — garde express)', () => {
  function fakeReqRes() {
    const req = { user: 'U1', originalUrl: '/api/test', headers: {} };
    const res = {
      statusCode: 200,
      status: jest.fn(function (c) { this.statusCode = c; return this; }),
      json: jest.fn(function (p) { this.payload = p; return this; }),
    };
    return { req, res };
  }

  test('rôle autorisé → true, aucune réponse émise', async () => {
    Tenant.findOne.mockReturnValue(selectLean({ _id: 'T1' })); // owner
    const { req, res } = fakeReqRes();
    const ok = await ensureCabinetRole(req, res, ROLES_CAN_VALIDATE_CARPA);
    expect(ok).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  test('utilisateur solo → owner → autorisé', async () => {
    const { req, res } = fakeReqRes();
    expect(await ensureCabinetRole(req, res, ROLES_CAN_VIEW_CABINET_FINANCES)).toBe(true);
  });

  test('🔒 rôle refusé → false + 403 ROLE_FORBIDDEN + log sécurité', async () => {
    Membership.find.mockReturnValue(selectLean([{ role: 'secretaire' }]));
    const { req, res } = fakeReqRes();
    const ok = await ensureCabinetRole(req, res, ROLES_CAN_VALIDATE_CARPA, 'message spécifique');
    expect(ok).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'ROLE_FORBIDDEN',
      message: 'message spécifique',
    }));
    expect(secLogger.log).toHaveBeenCalledWith('ACCESS_DENIED',
      expect.objectContaining({ reason: 'role-forbidden:secretaire' }), req);
  });

  test('🔒 fail-safe : erreur DB → rôle secretaire → refusé', async () => {
    Tenant.findOne.mockImplementationOnce(() => { throw new Error('db down'); });
    const { req, res } = fakeReqRes();
    expect(await ensureCabinetRole(req, res, ROLES_CAN_VALIDATE_CARPA)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
