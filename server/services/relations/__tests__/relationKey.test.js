const {
  normalizeRelationInput,
  relationContentHash,
  relationDedupeKey,
  safeObject,
} = require('../relationKey');

describe('relationKey', () => {
  test('une relation non dirigée a la même clé quel que soit l’ordre', () => {
    const left = normalizeRelationInput({
      relationType: 'spouse_of', direction: 'undirected',
      subject: { entityType: 'contact', entityId: 'B' },
      object: { entityType: 'contact', entityId: 'A' },
    });
    const right = normalizeRelationInput({
      relationType: 'spouse_of', direction: 'undirected',
      subject: { entityType: 'contact', entityId: 'A' },
      object: { entityType: 'contact', entityId: 'B' },
    });
    expect(relationDedupeKey(left)).toBe(relationDedupeKey(right));
    expect(left.subject.entityId).toBe('A');
  });

  test('une relation dirigée conserve le sens', () => {
    const a = normalizeRelationInput({ relationType: 'represents', subject: { entityType: 'contact', entityId: 'A' }, object: { entityType: 'contact', entityId: 'B' } });
    const b = normalizeRelationInput({ relationType: 'represents', subject: { entityType: 'contact', entityId: 'B' }, object: { entityType: 'contact', entityId: 'A' } });
    expect(relationDedupeKey(a)).not.toBe(relationDedupeKey(b));
  });

  test('le hash de contenu ignore observedAt mais distingue le statut', () => {
    const input = { relationType: 'represents', subject: { entityType: 'contact', entityId: 'A' }, object: { entityType: 'contact', entityId: 'B' }, provenance: { source: 'user', observedAt: '2025-01-01' } };
    const first = normalizeRelationInput(input);
    const second = normalizeRelationInput({ ...input, provenance: { ...input.provenance, observedAt: '2026-01-01' } });
    expect(relationContentHash(first)).toBe(relationContentHash(second));
    expect(relationContentHash(first)).not.toBe(relationContentHash(normalizeRelationInput({ ...input, status: 'inactive' })));
  });

  test('interdit une auto-relation', () => {
    expect(() => normalizeRelationInput({
      relationType: 'linked',
      subject: { entityType: 'contact', entityId: 'A' },
      object: { entityType: 'contact', entityId: 'A' },
    })).toThrow(/elle-même/);
  });

  test('nettoie les clés Mongo dangereuses dans les attributs', () => {
    expect(safeObject({ ok: 1, '$where': 'x', 'a.b': 2, nested: { __proto__: 'x', safe: true } })).toEqual({ ok: 1, nested: { safe: true } });
  });
});
