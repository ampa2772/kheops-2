// fusionUtils.test.js — Tests de findTemplateByName

// Mock du modele TemplateFile
const mockFind = jest.fn();
jest.mock('../../models/Fusion/TemplateFile', () => ({
  find: (...args) => mockFind(...args),
}));

const { findTemplateByName } = require('../fusionUtils');

describe('findTemplateByName', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('appelle TemplateFile.find avec la bonne regex', async () => {
    mockFind.mockResolvedValue([]);
    await findTemplateByName('contrat');

    expect(mockFind).toHaveBeenCalledWith({
      name: { $regex: '^contrat', $options: 'i' },
    });
  });

  it('retourne les templates trouves', async () => {
    const templates = [
      { _id: 't1', name: 'Contrat de travail' },
      { _id: 't2', name: 'Contrat de bail' },
    ];
    mockFind.mockResolvedValue(templates);

    const result = await findTemplateByName('Contrat');
    expect(result).toEqual(templates);
    expect(result).toHaveLength(2);
  });

  it('retourne un tableau vide si aucun template', async () => {
    mockFind.mockResolvedValue([]);

    const result = await findTemplateByName('inexistant');
    expect(result).toEqual([]);
  });

  it('utilise une recherche insensible a la casse (option i)', async () => {
    mockFind.mockResolvedValue([]);
    await findTemplateByName('CONTRAT');

    const callArgs = mockFind.mock.calls[0][0];
    expect(callArgs.name.$options).toBe('i');
  });

  it('ancre la recherche au debut du nom (^)', async () => {
    mockFind.mockResolvedValue([]);
    await findTemplateByName('test');

    const callArgs = mockFind.mock.calls[0][0];
    expect(callArgs.name.$regex).toBe('^test');
  });

  it('propage l erreur si TemplateFile.find echoue', async () => {
    const dbError = new Error('DB connection failed');
    mockFind.mockRejectedValue(dbError);

    await expect(findTemplateByName('test')).rejects.toThrow('DB connection failed');
  });

  it('appelle console.error en cas d erreur', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFind.mockRejectedValue(new Error('DB error'));

    await expect(findTemplateByName('test')).rejects.toThrow();
    expect(consoleSpy).toHaveBeenCalledWith('Error finding template by name:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('gere un nom vide', async () => {
    mockFind.mockResolvedValue([]);
    await findTemplateByName('');

    expect(mockFind).toHaveBeenCalledWith({
      name: { $regex: '^', $options: 'i' },
    });
  });
});
