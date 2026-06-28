// Tests unitaires — layoutFormContactSlice.js

beforeEach(() => {
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation();
});
afterEach(() => {
  Storage.prototype.getItem.mockRestore();
  Storage.prototype.setItem.mockRestore();
  jest.resetModules();
});

// Import apres les mocks localStorage
let reducer, setShowPersonnePhysique, setShowPersonneMorale, setShowPMPublique;
beforeEach(() => {
  jest.isolateModules(() => {
    const mod = require('../layoutFormContactSlice');
    reducer = mod.default;
    setShowPersonnePhysique = mod.setShowPersonnePhysique;
    setShowPersonneMorale = mod.setShowPersonneMorale;
    setShowPMPublique = mod.setShowPMPublique;
  });
});

const defaultState = {
  showPersonnePhysique: true,
  showPersonneMorale: false,
  showPMPublique: false,
};

describe('layoutFormContactSlice etat initial', () => {
  test('retourne l etat par defaut quand localStorage est vide', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state).toEqual(defaultState);
  });

  test('charge l etat depuis localStorage si present', () => {
    Storage.prototype.getItem.mockReturnValue(JSON.stringify({
      showPersonnePhysique: false,
      showPersonneMorale: true,
      showPMPublique: true,
    }));
    jest.isolateModules(() => {
      const mod = require('../layoutFormContactSlice');
      const freshReducer = mod.default;
      const state = freshReducer(undefined, { type: '@@INIT' });
      expect(state.showPersonnePhysique).toBe(false);
      expect(state.showPersonneMorale).toBe(true);
      expect(state.showPMPublique).toBe(true);
    });
  });
});

describe('layoutFormContactSlice reducers', () => {
  test('setShowPersonnePhysique met a true', () => {
    const state = reducer({ ...defaultState, showPersonnePhysique: false }, setShowPersonnePhysique(true));
    expect(state.showPersonnePhysique).toBe(true);
  });

  test('setShowPersonnePhysique met a false', () => {
    const state = reducer(defaultState, setShowPersonnePhysique(false));
    expect(state.showPersonnePhysique).toBe(false);
  });

  test('setShowPersonneMorale met a true', () => {
    const state = reducer(defaultState, setShowPersonneMorale(true));
    expect(state.showPersonneMorale).toBe(true);
  });

  test('setShowPersonneMorale met a false', () => {
    const state = reducer({ ...defaultState, showPersonneMorale: true }, setShowPersonneMorale(false));
    expect(state.showPersonneMorale).toBe(false);
  });

  test('setShowPMPublique met a true', () => {
    const state = reducer(defaultState, setShowPMPublique(true));
    expect(state.showPMPublique).toBe(true);
  });

  test('setShowPMPublique met a false', () => {
    const state = reducer({ ...defaultState, showPMPublique: true }, setShowPMPublique(false));
    expect(state.showPMPublique).toBe(false);
  });
});

describe('layoutFormContactSlice persistence localStorage', () => {
  test('setShowPersonnePhysique persiste dans localStorage', () => {
    reducer(defaultState, setShowPersonnePhysique(false));
    expect(Storage.prototype.setItem).toHaveBeenCalledWith(
      'layoutFormContactState',
      expect.any(String)
    );
    const saved = JSON.parse(Storage.prototype.setItem.mock.calls[0][1]);
    expect(saved.showPersonnePhysique).toBe(false);
  });

  test('setShowPersonneMorale persiste dans localStorage', () => {
    reducer(defaultState, setShowPersonneMorale(true));
    const calls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'layoutFormContactState');
    const saved = JSON.parse(calls[calls.length - 1][1]);
    expect(saved.showPersonneMorale).toBe(true);
  });

  test('setShowPMPublique persiste dans localStorage', () => {
    reducer(defaultState, setShowPMPublique(true));
    const calls = Storage.prototype.setItem.mock.calls.filter(c => c[0] === 'layoutFormContactState');
    const saved = JSON.parse(calls[calls.length - 1][1]);
    expect(saved.showPMPublique).toBe(true);
  });
});
