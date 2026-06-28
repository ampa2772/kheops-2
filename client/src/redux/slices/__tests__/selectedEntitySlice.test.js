// Tests unitaires — selectedEntitySlice.js
import reducer, { setSelectedEntity } from '../selectedEntitySlice';

describe('selectedEntitySlice', () => {
  test('retourne l etat initial par defaut', () => {
    const state = reducer(undefined, { type: '@@INIT' });
    expect(state).toEqual({ entity: null });
  });

  test('setSelectedEntity definit entity avec un objet', () => {
    const entity = { _id: 'e1', nom: 'Dupont' };
    const state = reducer({ entity: null }, setSelectedEntity(entity));
    expect(state.entity).toEqual(entity);
  });

  test('setSelectedEntity definit entity a null', () => {
    const state = reducer({ entity: { _id: 'e1' } }, setSelectedEntity(null));
    expect(state.entity).toBeNull();
  });

  test('SET_SELECTED_ENTITY via string type compat', () => {
    const entity = { _id: 'e2', nom: 'Martin' };
    const state = reducer({ entity: null }, { type: 'SET_SELECTED_ENTITY', payload: entity });
    expect(state.entity).toEqual(entity);
  });

  test('setSelectedEntity est un action creator valide', () => {
    expect(typeof setSelectedEntity).toBe('function');
    const action = setSelectedEntity({ _id: 'x' });
    expect(action.payload).toEqual({ _id: 'x' });
    expect(action.type).toContain('setSelectedEntity');
  });
});
