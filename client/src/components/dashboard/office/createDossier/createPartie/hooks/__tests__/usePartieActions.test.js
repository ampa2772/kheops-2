// usePartieActions.test.js — Tests du hook usePartieActions
import { renderHook } from '@testing-library/react';

// Mock les deux slices avec des actions distinctes identifiables
jest.mock('../../../../../../../redux/slices/partieSlice', () => ({
  setPartie: jest.fn().mockReturnValue({ type: 'CREATE/setPartie' }),
  deletePartie: jest.fn().mockReturnValue({ type: 'CREATE/deletePartie' }),
  setPartieLink: jest.fn().mockReturnValue({ type: 'CREATE/setPartieLink' }),
  deleteLinkedAvocat: jest.fn().mockReturnValue({ type: 'CREATE/deleteLinkedAvocat' }),
  deleteLinkedAvocatAllPour: jest.fn().mockReturnValue({ type: 'CREATE/deleteLinkedAvocatAllPour' }),
  deleteLinkedContactAllPour: jest.fn().mockReturnValue({ type: 'CREATE/deleteLinkedContactAllPour' }),
  setPartiesLinkAllPour: jest.fn().mockReturnValue({ type: 'CREATE/setPartiesLinkAllPour' }),
  deleteLinkedAvocatAllContre: jest.fn().mockReturnValue({ type: 'CREATE/deleteLinkedAvocatAllContre' }),
  deleteLinkedContactAllContre: jest.fn().mockReturnValue({ type: 'CREATE/deleteLinkedContactAllContre' }),
  setPartiesLinkAllContre: jest.fn().mockReturnValue({ type: 'CREATE/setPartiesLinkAllContre' }),
  toggleAvocatProperty: jest.fn().mockReturnValue({ type: 'CREATE/toggleAvocatProperty' }),
}));

jest.mock('../../../../../../../redux/slices/partieEditSlice', () => ({
  setPartie: jest.fn().mockReturnValue({ type: 'EDIT/setPartie' }),
  deletePartie: jest.fn().mockReturnValue({ type: 'EDIT/deletePartie' }),
  setPartieLink: jest.fn().mockReturnValue({ type: 'EDIT/setPartieLink' }),
  deleteLinkedAvocat: jest.fn().mockReturnValue({ type: 'EDIT/deleteLinkedAvocat' }),
  deleteLinkedAvocatAllPour: jest.fn().mockReturnValue({ type: 'EDIT/deleteLinkedAvocatAllPour' }),
  deleteLinkedContactAllPour: jest.fn().mockReturnValue({ type: 'EDIT/deleteLinkedContactAllPour' }),
  setPartiesLinkAllPour: jest.fn().mockReturnValue({ type: 'EDIT/setPartiesLinkAllPour' }),
  deleteLinkedAvocatAllContre: jest.fn().mockReturnValue({ type: 'EDIT/deleteLinkedAvocatAllContre' }),
  deleteLinkedContactAllContre: jest.fn().mockReturnValue({ type: 'EDIT/deleteLinkedContactAllContre' }),
  setPartiesLinkAllContre: jest.fn().mockReturnValue({ type: 'EDIT/setPartiesLinkAllContre' }),
  toggleAvocatProperty: jest.fn().mockReturnValue({ type: 'EDIT/toggleAvocatProperty' }),
}));

import { usePartieActions } from '../usePartieActions';
import * as partieSlice from '../../../../../../../redux/slices/partieSlice';
import * as partieEditSlice from '../../../../../../../redux/slices/partieEditSlice';

describe('usePartieActions', () => {
  it('mode "create" retourne les actions du partieSlice', () => {
    const { result } = renderHook(() => usePartieActions('create'));
    expect(result.current.setPartie).toBe(partieSlice.setPartie);
    expect(result.current.deletePartie).toBe(partieSlice.deletePartie);
    expect(result.current.setPartieLink).toBe(partieSlice.setPartieLink);
  });

  it('mode "edit" retourne les actions du partieEditSlice', () => {
    const { result } = renderHook(() => usePartieActions('edit'));
    expect(result.current.setPartie).toBe(partieEditSlice.setPartie);
    expect(result.current.deletePartie).toBe(partieEditSlice.deletePartie);
    expect(result.current.setPartieLink).toBe(partieEditSlice.setPartieLink);
  });

  it('chaque set contient toutes les actions attendues', () => {
    const { result } = renderHook(() => usePartieActions('create'));
    const actionNames = Object.keys(result.current);
    expect(actionNames).toContain('setPartie');
    expect(actionNames).toContain('deletePartie');
    expect(actionNames).toContain('setPartieLink');
    expect(actionNames).toContain('deleteLinkedAvocat');
    expect(actionNames).toContain('deleteLinkedAvocatAllPour');
    expect(actionNames).toContain('setPartiesLinkAllPour');
    expect(actionNames).toContain('deleteLinkedAvocatAllContre');
    expect(actionNames).toContain('setPartiesLinkAllContre');
  });

  it('mode autre que "edit" retourne les actions create par defaut', () => {
    const { result } = renderHook(() => usePartieActions('unknown'));
    expect(result.current.setPartie).toBe(partieSlice.setPartie);
  });

  it('les actions retournees sont des fonctions', () => {
    const { result } = renderHook(() => usePartieActions('create'));
    Object.values(result.current).forEach(action => {
      expect(typeof action).toBe('function');
    });
  });

  it('retourne les memes actions pour le meme mode (memoisation)', () => {
    const { result, rerender } = renderHook(
      ({ mode }) => usePartieActions(mode),
      { initialProps: { mode: 'create' } }
    );
    const firstResult = result.current;
    rerender({ mode: 'create' });
    expect(result.current).toBe(firstResult);
  });
});
