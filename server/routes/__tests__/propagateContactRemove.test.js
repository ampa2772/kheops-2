// Tests A22 — propagateContactToDivorces : chemin REMOVE.
// Une entrée PROPAGÉE (pchId) est retirée du divorce quand la personne à
// charge n'est plus rattachée à AUCUN des deux époux. Les entrées saisies à
// la main (sans pchId) ne sont JAMAIS touchées.

const mongoose = require('mongoose');

const CONTACT_A = new mongoose.Types.ObjectId(); // époux 1 (contact modifié)
const CONTACT_B = new mongoose.Types.ObjectId(); // époux 2 (autre conjoint)
const PCH_KEPT = new mongoose.Types.ObjectId();  // toujours rattachée à A
const PCH_REMOVED = new mongoose.Types.ObjectId(); // détachée de A
const PCH_OF_B = new mongoose.Types.ObjectId();  // rattachée à B

// Époux 1 déjà ALIGNÉ sur CONTACT_DATA : la mise à jour des champs époux ne
// déclenche alors aucun changement — les tests isolent le chemin remove.
const matchedEpoux1 = () => ({
  contactId: CONTACT_A,
  civilite: 'Mme', nom: 'Durand', nomDeNaissance: '', prenoms: 'Marie',
  dateNaissance: null, lieuNaissance: '', paysNaissance: 'France',
  nationalite: 'francaise', profession: '', adresse: '', codePostal: '',
  ville: '', pays: 'France', email: '', telephone: '',
});

function fakeDivorce({ enfants = [], adultesCharge = [] } = {}) {
  return {
    epoux1: matchedEpoux1(),
    epoux2: { contactId: CONTACT_B },
    enfants,
    adultesCharge,
    markModified: jest.fn(),
    save: jest.fn().mockResolvedValue(),
  };
}

// Entrée « enfant » complète telle que la propagation l'écrit (aucun champ ne
// diffère → pas de réécriture parasite dans les tests).
const propagatedChild = (prenoms, pchId) => ({
  nom: 'Durand', prenoms, sexe: 'M', dateNaissance: null, lieuNaissance: '', pchId,
});

// liaisonsA : personnes actuellement rattachées au contact modifié (A)
// liaisonsB : personnes actuellement rattachées à l'autre époux (B)
function loadPropagate({ divorce, liaisonsA, liaisonsB, pchDocs }) {
  jest.resetModules();

  jest.doMock('../../models/Divorce/DivorceCMData', () => ({
    find: jest.fn().mockResolvedValue([divorce]),
  }));
  jest.doMock('../../models/Folder/modelsLiaisons/ContactPersonneCharge', () => ({
    find: jest.fn().mockImplementation((filter) => ({
      lean: async () => {
        // 1er appel : liaisons du contact modifié ({ contact: id }) ;
        // 2e appel : liaisons des autres époux ({ contact: { $in: [...] } }).
        if (filter && filter.contact && filter.contact.$in) return liaisonsB;
        return liaisonsA;
      },
    })),
  }));
  jest.doMock('../../models/Folder/PersonneCharge', () => ({
    find: jest.fn().mockReturnValue({ lean: async () => pchDocs }),
  }));
  // Dépendances du module routes (non exercées par la fonction testée).
  jest.doMock('../../middlewares/middleware-auth', () => (req, res, next) => next());
  jest.doMock('../../utils/securityLogger', () => ({ log: jest.fn(), EVT: { ACCESS_DENIED: 'ACCESS_DENIED' } }));
  jest.doMock('../../utils/auditLogger', () => ({ create: jest.fn(), update: jest.fn(), delete: jest.fn() }));

  const { propagateContactToDivorces } = require('../folder/folderContacts');
  return propagateContactToDivorces;
}

const CONTACT_DATA = { nom: 'Durand', prenoms: 'Marie', genre: 'Féminin' };

afterEach(() => jest.clearAllMocks());

test('🔒 enfant propagé détaché du contact → retiré du divorce ; entrée manuelle conservée', async () => {
  const divorce = fakeDivorce({
    enfants: [
      propagatedChild('Léo', PCH_REMOVED),   // propagé, détaché → doit partir
      propagatedChild('Emma', PCH_KEPT),     // propagé, encore rattaché → reste
      { nom: 'Saisi', prenoms: 'Main' },     // manuel (sans pchId) → reste
    ],
  });
  const propagate = loadPropagate({
    divorce,
    liaisonsA: [{ contact: CONTACT_A, personneCharge: PCH_KEPT }],
    liaisonsB: [],
    pchDocs: [{ _id: PCH_KEPT, nom: 'Durand', prenoms: 'Emma', type: 'enfant' }],
  });

  const updated = await propagate(CONTACT_A, CONTACT_DATA, 'U1');

  expect(updated).toBe(1);
  const noms = divorce.enfants.map((e) => e.prenoms);
  expect(noms).toContain('Emma');
  expect(noms).toContain('Main');
  expect(noms).not.toContain('Léo');
  expect(divorce.save).toHaveBeenCalled();
});

test('🔒 enfant propagé par L\'AUTRE époux → JAMAIS retiré quand on modifie ce contact-ci', async () => {
  const divorce = fakeDivorce({
    enfants: [
      { nom: 'Petit', prenoms: 'Zoé', pchId: PCH_OF_B }, // rattaché à l'époux B
    ],
  });
  const propagate = loadPropagate({
    divorce,
    liaisonsA: [], // le contact A n'a plus aucune personne à charge
    liaisonsB: [{ contact: CONTACT_B, personneCharge: PCH_OF_B }],
    pchDocs: [],
  });

  const updated = await propagate(CONTACT_A, CONTACT_DATA, 'U1');

  expect(divorce.enfants.map((e) => e.prenoms)).toContain('Zoé');
  expect(updated).toBe(0); // rien n'a changé → pas de sauvegarde inutile
  expect(divorce.save).not.toHaveBeenCalled();
});

test('🔒 adulte à charge propagé puis détaché → retiré de la section adultes', async () => {
  const divorce = fakeDivorce({
    adultesCharge: [
      { nom: 'Durand', prenoms: 'Papi', pchId: PCH_REMOVED },
      { nom: 'Manuel', prenoms: 'Ajout' },
    ],
  });
  const propagate = loadPropagate({
    divorce,
    liaisonsA: [],
    liaisonsB: [],
    pchDocs: [],
  });

  const updated = await propagate(CONTACT_A, CONTACT_DATA, 'U1');

  expect(updated).toBe(1);
  const prenoms = divorce.adultesCharge.map((a) => a.prenoms);
  expect(prenoms).toContain('Ajout');
  expect(prenoms).not.toContain('Papi');
});

test('aucun retrait abusif : tout est encore rattaché → aucune sauvegarde', async () => {
  const divorce = fakeDivorce({
    enfants: [propagatedChild('Emma', PCH_KEPT)],
  });
  const propagate = loadPropagate({
    divorce,
    liaisonsA: [{ contact: CONTACT_A, personneCharge: PCH_KEPT }],
    liaisonsB: [],
    pchDocs: [{ _id: PCH_KEPT, nom: 'Durand', prenoms: 'Emma', type: 'enfant' }],
  });

  const updated = await propagate(CONTACT_A, CONTACT_DATA, 'U1');

  expect(updated).toBe(0);
  expect(divorce.save).not.toHaveBeenCalled();
});
