const {
  idStr,
  planOwnerScopedUpdates,
  chooseConfigWinner,
  planStorageConfigUpdates,
} = require('../tenantBackfill');

// Cabinets fictifs (Tenant._id) et users (User._id) — de simples chaînes ici.
const T = { u1: 'tenant-of-u1', u2: 'tenant-of-u2', u3: 'tenant-of-u3' };
const tenantOfUser = (userId) => T[userId] || null;

describe('idStr', () => {
  test('normalise null/undefined en null', () => {
    expect(idStr(null)).toBeNull();
    expect(idStr(undefined)).toBeNull();
  });
  test('convertit un objet {toString} en chaîne', () => {
    expect(idStr({ toString: () => 'abc' })).toBe('abc');
    expect(idStr('xyz')).toBe('xyz');
  });
});

describe('planOwnerScopedUpdates (StoredDocument / MailAccount)', () => {
  test('remap tenantId = userId vers le vrai cabinet du propriétaire', () => {
    const records = [
      { _id: 'd1', tenantId: 'u1', ownerUserId: 'u1' }, // fallback userId -> remap
      { _id: 'd2', tenantId: 'u2', ownerUserId: 'u2' },
    ];
    const { updates, unchanged } = planOwnerScopedUpdates(records, tenantOfUser);
    expect(unchanged).toBe(0);
    expect(updates).toEqual([
      { _id: 'd1', from: 'u1', to: 'tenant-of-u1', ownerUserId: 'u1' },
      { _id: 'd2', from: 'u2', to: 'tenant-of-u2', ownerUserId: 'u2' },
    ]);
  });

  test('idempotent : un enregistrement déjà sur le bon cabinet est "unchanged"', () => {
    const records = [{ _id: 'd1', tenantId: 'tenant-of-u1', ownerUserId: 'u1' }];
    const { updates, unchanged } = planOwnerScopedUpdates(records, tenantOfUser);
    expect(updates).toHaveLength(0);
    expect(unchanged).toBe(1);
  });

  test('sans ownerUserId → skippedNoOwner (pas de perte silencieuse)', () => {
    const records = [{ _id: 'd1', tenantId: 'u1', ownerUserId: null }];
    const { updates, skippedNoOwner } = planOwnerScopedUpdates(records, tenantOfUser);
    expect(updates).toHaveLength(0);
    expect(skippedNoOwner).toEqual(['d1']);
  });

  test('propriétaire irrésolu (tenant introuvable) → skippedUnresolved', () => {
    const records = [{ _id: 'd1', tenantId: 'u9', ownerUserId: 'u9' }];
    const { updates, skippedUnresolved } = planOwnerScopedUpdates(records, tenantOfUser);
    expect(updates).toHaveLength(0);
    expect(skippedUnresolved).toEqual(['d1']);
  });

  test('deux membres du même cabinet convergent vers le même tenantId', () => {
    // Cas multi-membres futur : u2 et u3 rattachés au même cabinet.
    const sharedTenantOfUser = (u) => (u === 'u2' || u === 'u3' ? 'cab-shared' : null);
    const records = [
      { _id: 'd1', tenantId: 'u2', ownerUserId: 'u2' },
      { _id: 'd2', tenantId: 'u3', ownerUserId: 'u3' },
    ];
    const { updates } = planOwnerScopedUpdates(records, sharedTenantOfUser);
    expect(updates.map((u) => u.to)).toEqual(['cab-shared', 'cab-shared']);
    // documentId unique → pas de collision d'index malgré le même tenantId.
  });
});

describe('chooseConfigWinner', () => {
  test('privilégie le usedBytes le plus élevé', () => {
    const w = chooseConfigWinner([
      { _id: 'a', provider: 'managed_gcs', usedBytes: 10, quotaBytes: 100 },
      { _id: 'b', provider: 'managed_gcs', usedBytes: 50, quotaBytes: 100 },
    ]);
    expect(w._id).toBe('b');
  });

  test('à usedBytes égal, privilégie le provider non-défaut (choix explicite)', () => {
    const w = chooseConfigWinner([
      { _id: 'a', provider: 'managed_gcs', usedBytes: 0, quotaBytes: 100 },
      { _id: 'b', provider: 'google_drive', usedBytes: 0, quotaBytes: 100 },
    ]);
    expect(w._id).toBe('b');
  });

  test('départage stable par _id quand tout est égal', () => {
    const w = chooseConfigWinner([
      { _id: 'zzz', provider: 'managed_gcs', usedBytes: 0, quotaBytes: 100 },
      { _id: 'aaa', provider: 'managed_gcs', usedBytes: 0, quotaBytes: 100 },
    ]);
    expect(w._id).toBe('aaa');
  });
});

describe('planStorageConfigUpdates (StorageProviderConfig)', () => {
  const classify = (id) => {
    if (id === 'u1' || id === 'u2' || id === 'u3') return 'user';
    if (id === 'tenant-of-u1' || id === 'cab-shared') return 'tenant';
    return 'unknown';
  };

  test('remap la config dont tenantId est un userId vers le cabinet', () => {
    const configs = [
      { _id: 'c1', tenantId: 'u1', provider: 'managed_gcs', usedBytes: 5, quotaBytes: 100 },
    ];
    const { updates, merges, skippedAlreadyTenant } = planStorageConfigUpdates(
      configs,
      classify,
      tenantOfUser,
    );
    expect(merges).toHaveLength(0);
    expect(skippedAlreadyTenant).toHaveLength(0);
    expect(updates).toEqual([{ _id: 'c1', from: 'u1', to: 'tenant-of-u1' }]);
  });

  test('config déjà migrée (tenantId = Tenant) → skippedAlreadyTenant', () => {
    const configs = [{ _id: 'c1', tenantId: 'tenant-of-u1', provider: 'managed_gcs' }];
    const { updates, skippedAlreadyTenant } = planStorageConfigUpdates(
      configs,
      classify,
      tenantOfUser,
    );
    expect(updates).toHaveLength(0);
    expect(skippedAlreadyTenant).toEqual(['c1']);
  });

  test('tenantId inconnu (ni user ni tenant) → skippedUnknown, pas de crash', () => {
    const configs = [{ _id: 'c1', tenantId: 'orphan-xyz', provider: 'managed_gcs' }];
    const { updates, skippedUnknown } = planStorageConfigUpdates(
      configs,
      classify,
      tenantOfUser,
    );
    expect(updates).toHaveLength(0);
    expect(skippedUnknown).toEqual(['c1']);
  });

  test('collision : deux configs -> même cabinet → une seule mise à jour + merge', () => {
    // u2 et u3 partagent 'cab-shared' (cas multi-membres).
    const sharedTenantOfUser = (u) => (u === 'u2' || u === 'u3' ? 'cab-shared' : null);
    const configs = [
      { _id: 'c2', tenantId: 'u2', provider: 'managed_gcs', usedBytes: 20, quotaBytes: 100 },
      { _id: 'c3', tenantId: 'u3', provider: 'google_drive', usedBytes: 5, quotaBytes: 200 },
    ];
    const { updates, merges } = planStorageConfigUpdates(
      configs,
      classify,
      sharedTenantOfUser,
    );
    // Un seul gagnant mis à jour vers cab-shared (c2 : usedBytes plus élevé).
    expect(updates).toEqual([{ _id: 'c2', from: 'u2', to: 'cab-shared' }]);
    expect(merges).toHaveLength(1);
    const merge = merges[0];
    expect(merge.target).toBe('cab-shared');
    expect(merge.keep).toBe('c2');
    expect(merge.drop).toEqual(['c3']);
    expect(merge.mergedQuotaBytes).toBe(200); // max des quotas
    expect(merge.mergedUsedBytes).toBe(20); // max conservateur
  });
});
