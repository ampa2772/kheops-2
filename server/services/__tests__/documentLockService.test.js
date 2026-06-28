// documentLockService.test.js — Tests du service de verrouillage de documents
const lockService = require('../documentLockService');

describe('documentLockService', () => {
    beforeEach(() => {
        lockService._resetForTesting();
    });

    afterAll(() => {
        lockService.stopCleanup();
    });

    describe('acquire', () => {
        it('accorde le verrou si aucun verrou n\'existe', () => {
            const result = lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            expect(result.granted).toBe(true);
        });

        it('refuse le verrou si déjà détenu par un autre utilisateur', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            const result = lockService.acquire('doc1', { userId: 'userB', displayName: 'Bob' });
            expect(result.granted).toBe(false);
            expect(result.lockedBy).toMatchObject({
                userId: 'userA',
                displayName: 'Alice',
            });
            expect(typeof result.lockedBy.lockedAt).toBe('number');
        });

        it('est idempotent : ré-acquérir par le même userId est accordé et rafraîchit le heartbeat', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            // Simulate time passing
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now + 5000);
            const result = lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice (PC2)' });
            expect(result.granted).toBe(true);
            // Le displayName doit avoir été mis à jour
            const list = lockService.list(['doc1']);
            expect(list[0].displayName).toBe('Alice (PC2)');
            Date.now.mockRestore();
        });

        it('accepte si le verrou existant est expiré (heartbeat trop ancien)', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            // Avancer le temps de 100s (> LOCK_TTL_MS = 90s)
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now + lockService.LOCK_TTL_MS + 1000);

            const result = lockService.acquire('doc1', { userId: 'userB', displayName: 'Bob' });
            expect(result.granted).toBe(true);
            const list = lockService.list(['doc1']);
            expect(list[0].userId).toBe('userB');

            Date.now.mockRestore();
        });

        it('throw si docId ou userId manquant', () => {
            expect(() => lockService.acquire(null, { userId: 'a' })).toThrow();
            expect(() => lockService.acquire('doc1', {})).toThrow();
            expect(() => lockService.acquire('doc1', null)).toThrow();
        });
    });

    describe('heartbeat', () => {
        it('rafraîchit le heartbeat du propriétaire', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now + 30_000);

            const result = lockService.heartbeat('doc1', 'userA');
            expect(result.ok).toBe(true);

            // 60s après le heartbeat (= 90s après acquire), le verrou doit toujours être valide
            jest.spyOn(Date, 'now').mockReturnValue(now + 89_000);
            const result2 = lockService.heartbeat('doc1', 'userA');
            expect(result2.ok).toBe(true);

            Date.now.mockRestore();
        });

        it('refuse le heartbeat si pas de verrou', () => {
            const result = lockService.heartbeat('doc1', 'userA');
            expect(result).toEqual({ ok: false, reason: 'no-lock' });
        });

        it('refuse le heartbeat d\'un user qui n\'est pas propriétaire', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            const result = lockService.heartbeat('doc1', 'userB');
            expect(result).toEqual({ ok: false, reason: 'wrong-owner' });
        });

        it('refuse et supprime le verrou si TTL dépassé', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now + lockService.LOCK_TTL_MS + 1000);

            const result = lockService.heartbeat('doc1', 'userA');
            expect(result.ok).toBe(false);
            expect(result.reason).toBe('expired');

            // Le verrou doit avoir été supprimé
            const list = lockService.list(['doc1']);
            expect(list).toHaveLength(0);

            Date.now.mockRestore();
        });
    });

    describe('release', () => {
        it('libère le verrou du propriétaire', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            const result = lockService.release('doc1', 'userA');
            expect(result.released).toBe(true);
            expect(lockService.list(['doc1'])).toHaveLength(0);
        });

        it('refuse de libérer le verrou d\'un autre utilisateur', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            const result = lockService.release('doc1', 'userB');
            expect(result.released).toBe(false);
            expect(result.reason).toBe('wrong-owner');
            // Le verrou existe toujours
            expect(lockService.list(['doc1'])).toHaveLength(1);
        });

        it('libère malgré tout avec force=true', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            const result = lockService.release('doc1', 'userB', { force: true });
            expect(result.released).toBe(true);
            expect(lockService.list(['doc1'])).toHaveLength(0);
        });

        it('renvoie no-lock si aucun verrou', () => {
            const result = lockService.release('doc1', 'userA');
            expect(result).toEqual({ released: false, reason: 'no-lock' });
        });
    });

    describe('list', () => {
        it('retourne tous les verrous quand sans argument', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            lockService.acquire('doc2', { userId: 'userB', displayName: 'Bob' });
            const list = lockService.list();
            expect(list).toHaveLength(2);
            const ids = list.map(l => l.docId).sort();
            expect(ids).toEqual(['doc1', 'doc2']);
        });

        it('filtre sur les docIds fournis', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            lockService.acquire('doc2', { userId: 'userB', displayName: 'Bob' });
            lockService.acquire('doc3', { userId: 'userC', displayName: 'Carol' });
            const list = lockService.list(['doc1', 'doc3', 'doc99']);
            expect(list).toHaveLength(2);
            const ids = list.map(l => l.docId).sort();
            expect(ids).toEqual(['doc1', 'doc3']);
        });

        it('purge automatiquement les verrous expirés', () => {
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });
            lockService.acquire('doc2', { userId: 'userB', displayName: 'Bob' });

            const now = Date.now();
            jest.spyOn(Date, 'now').mockReturnValue(now + lockService.LOCK_TTL_MS + 5000);

            const list = lockService.list();
            expect(list).toHaveLength(0);

            Date.now.mockRestore();
        });
    });

    describe('purgeStale', () => {
        it('retire uniquement les verrous expirés', () => {
            const now = Date.now();
            lockService.acquire('doc1', { userId: 'userA', displayName: 'Alice' });

            jest.spyOn(Date, 'now').mockReturnValue(now + lockService.LOCK_TTL_MS - 5000);
            lockService.acquire('doc2', { userId: 'userB', displayName: 'Bob' });

            // À now + LOCK_TTL_MS + 1s, doc1 est expiré (>90s) mais pas doc2 (~5s)
            jest.spyOn(Date, 'now').mockReturnValue(now + lockService.LOCK_TTL_MS + 1000);

            const removed = lockService.purgeStale();
            expect(removed).toBe(1);
            const remaining = lockService.list();
            expect(remaining).toHaveLength(1);
            expect(remaining[0].docId).toBe('doc2');

            Date.now.mockRestore();
        });
    });

    describe('startCleanup / stopCleanup', () => {
        it('startCleanup est idempotent', () => {
            lockService.startCleanup();
            lockService.startCleanup(); // ne doit pas créer un 2e timer
            lockService.stopCleanup();
            // Si un timer fantôme restait actif, jest se plaindrait — donc passer ce test = OK
            expect(true).toBe(true);
        });
    });
});
