// propagateEntityToDossiers.test.js — Tests du service de propagation

// Mock mongoose
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    Types: {
      ...actual.Types,
      ObjectId: class MockObjectId {
        constructor(id) { this.id = id; }
        toString() { return this.id; }
      },
    },
  };
});

// Mock des modeles
const mockUserDossierFind = jest.fn();
const mockDossierFind = jest.fn();

jest.mock('../../models/Folder/Dossier', () => ({
  find: (...args) => mockDossierFind(...args),
}));

jest.mock('../../models/Folder/modelsLiaisons/UserDossier', () => ({
  find: (...args) => mockUserDossierFind(...args),
}));

const propagateEntityToDossiers = require('../propagateEntityToDossiers');

describe('propagateEntityToDossiers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  it('retourne 0 si aucun dossier pour l utilisateur', async () => {
    mockUserDossierFind.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }) });

    const result = await propagateEntityToDossiers('entity1', { nom: 'Test' }, 'user1');

    expect(result).toBe(0);
  });

  it('retourne 0 si aucun dossier ne contient l entite', async () => {
    mockUserDossierFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ dossier: 'dossier1' }]),
      }),
    });
    mockDossierFind.mockResolvedValue([]);

    const result = await propagateEntityToDossiers('entity1', { nom: 'Test' }, 'user1');

    expect(result).toBe(0);
  });

  it('propage les modifications dans avocatsResponsables', async () => {
    mockUserDossierFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ dossier: 'dossier1' }]),
      }),
    });

    const mockDossier = {
      _id: 'dossier1',
      dossier: {
        parties: { pour: [], contre: [] },
        avocatsResponsables: [
          { _id: { toString: () => 'entity1' }, nom: 'Ancien Nom', email: 'old@test.com' },
        ],
        contactsDuDossier: [],
      },
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(true),
    };
    mockDossierFind.mockResolvedValue([mockDossier]);

    const result = await propagateEntityToDossiers(
      'entity1',
      { nom: 'Nouveau Nom', email: 'new@test.com', type: 'Contact' },
      'user1'
    );

    expect(result).toBe(1);
    expect(mockDossier.markModified).toHaveBeenCalledWith('dossier');
    expect(mockDossier.save).toHaveBeenCalled();
    expect(mockDossier.dossier.avocatsResponsables[0].nom).toBe('Nouveau Nom');
  });

  it('propage les modifications dans contactsDuDossier', async () => {
    mockUserDossierFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ dossier: 'dossier1' }]),
      }),
    });

    const mockDossier = {
      _id: 'dossier1',
      dossier: {
        parties: { pour: [], contre: [] },
        avocatsResponsables: [],
        contactsDuDossier: [
          { _id: { toString: () => 'entity1' }, nom: 'Ancien', email: 'ancien@test.com' },
        ],
      },
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(true),
    };
    mockDossierFind.mockResolvedValue([mockDossier]);

    const result = await propagateEntityToDossiers(
      'entity1',
      { nom: 'Nouveau', email: 'nouveau@test.com', type: 'Contact' },
      'user1'
    );

    expect(result).toBe(1);
    expect(mockDossier.dossier.contactsDuDossier[0].nom).toBe('Nouveau');
  });

  it('propage dans parties.pour.avocats', async () => {
    mockUserDossierFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ dossier: 'dossier1' }]),
      }),
    });

    const mockDossier = {
      _id: 'dossier1',
      dossier: {
        parties: {
          pour: [
            {
              partieData: { _id: { toString: () => 'other' } },
              nomPartie: 'Partie Pour',
              avocats: [{ _id: { toString: () => 'entity1' }, nom: 'Me Ancien' }],
              contacts: [],
            },
          ],
          contre: [],
        },
        avocatsResponsables: [],
        contactsDuDossier: [],
      },
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(true),
    };
    mockDossierFind.mockResolvedValue([mockDossier]);

    const result = await propagateEntityToDossiers(
      'entity1',
      { nom: 'Me Nouveau', type: 'Avocat', prenoms: 'Jean', adresse: '10 rue', ville: 'Paris', codePostal: '75001', email: 'me@av.fr', telephone: '01', genre: 'M' },
      'user1'
    );

    expect(result).toBe(1);
    expect(mockDossier.dossier.parties.pour[0].avocats[0].nom).toBe('Me Nouveau');
  });

  it('applique officeUserAliases pour un type Avocat', async () => {
    mockUserDossierFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ dossier: 'dossier1' }]),
      }),
    });

    const avocatItem = { _id: { toString: () => 'entity1' }, nom: 'Ancien' };
    const mockDossier = {
      _id: 'dossier1',
      dossier: {
        parties: { pour: [], contre: [] },
        avocatsResponsables: [avocatItem],
        contactsDuDossier: [],
      },
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(true),
    };
    mockDossierFind.mockResolvedValue([mockDossier]);

    await propagateEntityToDossiers(
      'entity1',
      { nom: 'Nouveau', prenoms: 'Jean', type: 'Avocat', adresse: '5 rue', ville: 'Lyon', codePostal: '69001', email: 'j@av.fr', telephone: '04', genre: 'M' },
      'user1'
    );

    // officeUserAliases doit avoir ete applique
    expect(avocatItem.nomOfficeUser).toBe('Nouveau');
    expect(avocatItem.prenomOfficeUser).toBe('Jean');
    expect(avocatItem.address).toBe('5 rue');
    expect(avocatItem.city).toBe('Lyon');
    expect(avocatItem.postalCode).toBe('69001');
    expect(avocatItem.roleOfficeUser).toBe('Avocat');
  });

  it('ne modifie pas le dossier si l entite n est pas trouvee', async () => {
    mockUserDossierFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ dossier: 'dossier1' }]),
      }),
    });

    const mockDossier = {
      _id: 'dossier1',
      dossier: {
        parties: { pour: [], contre: [] },
        avocatsResponsables: [
          { _id: { toString: () => 'other-entity' }, nom: 'Autre' },
        ],
        contactsDuDossier: [],
      },
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(true),
    };
    mockDossierFind.mockResolvedValue([mockDossier]);

    const result = await propagateEntityToDossiers('entity1', { nom: 'Test' }, 'user1');

    expect(result).toBe(0);
    expect(mockDossier.save).not.toHaveBeenCalled();
  });

  it('met a jour partieData et recalcule nomPartie', async () => {
    mockUserDossierFind.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ dossier: 'dossier1' }]),
      }),
    });

    const mockDossier = {
      _id: 'dossier1',
      dossier: {
        dossier: { nom: 'Ancien c/ Contre' },
        parties: {
          pour: [
            {
              partieData: { _id: { toString: () => 'entity1' }, nom: 'Ancien', prenoms: 'Pre' },
              nomPartie: 'Ancien Pre',
              avocats: [],
              contacts: [],
            },
          ],
          contre: [],
        },
        avocatsResponsables: [],
        contactsDuDossier: [],
      },
      markModified: jest.fn(),
      save: jest.fn().mockResolvedValue(true),
    };
    mockDossierFind.mockResolvedValue([mockDossier]);

    await propagateEntityToDossiers(
      'entity1',
      { nom: 'Nouveau', prenoms: 'Prenom', type: 'Contact' },
      'user1'
    );

    expect(mockDossier.dossier.parties.pour[0].nomPartie).toBe('Nouveau Prenom');
  });
});
