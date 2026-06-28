// Tests unitaires — dossierStepsSlice.js
import reducer, { setCurrentStep } from '../dossierStepsSlice';

describe('dossierStepsSlice', () => {
  test('retourne l etat initial par defaut', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state).toEqual({ currentStep: 1 });
  });

  test('setCurrentStep met a jour via RTK action', () => {
    const state = reducer({ currentStep: 1 }, setCurrentStep(3));
    expect(state.currentStep).toBe(3);
  });

  test('SET_CURRENT_STEP met a jour via string type compat', () => {
    const state = reducer({ currentStep: 1 }, { type: 'SET_CURRENT_STEP', payload: 5 });
    expect(state.currentStep).toBe(5);
  });

  test('action inconnue retourne l etat inchange', () => {
    const initial = { currentStep: 2 };
    const state = reducer(initial, { type: 'UNKNOWN' });
    expect(state.currentStep).toBe(2);
  });

  test('setCurrentStep est une fonction action creator', () => {
    expect(typeof setCurrentStep).toBe('function');
    const action = setCurrentStep(7);
    expect(action.payload).toBe(7);
    expect(action.type).toContain('setCurrentStep');
  });
});
