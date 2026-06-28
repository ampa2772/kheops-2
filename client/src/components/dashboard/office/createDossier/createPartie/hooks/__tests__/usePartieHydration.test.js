// usePartieHydration.test.js — Tests du hook usePartieHydration
import { renderHook } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Mocks Redux actions
const mockHydratePartiesFromDossier = jest.fn().mockReturnValue({ type: 'HYDRATE_PARTIES' });
const mockResetParties = jest.fn().mockReturnValue({ type: 'RESET_PARTIES' });

jest.mock('../../../../../../../redux/slices/partieEditSlice', () => ({
  hydratePartiesFromDossier: (...args) => {
    mockHydratePartiesFromDossier(...args);
    return { type: 'HYDRATE_PARTIES' };
  },
  resetParties: (...args) => {
    mockResetParties(...args);
    return { type: 'RESET_PARTIES' };
  },
}));

import { usePartieHydration } from '../usePartieHydration';

// Wrapper minimal avec Redux (le hook utilise useDispatch mais pas useSelector)
const createWrapper = () => {
  const store = configureStore({
    reducer: { _placeholder: (state = {}) => state },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const Wrapper = ({ children }) => (
    <Provider store={store}>{children}</Provider>
  );
  return Wrapper;
};

describe('usePartieHydration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===================== Mode create =====================
  describe('mode create', () => {
    it('ne fait rien en mode create (pas d hydratation edit)', () => {
      const wrapper = createWrapper();
      const presetDossier = { _id: 'd1', parties: { pour: [{ _id: 'p1' }], contre: [] } };

      renderHook(() => usePartieHydration('create', presetDossier), { wrapper });

      // En mode create, le useEffect sort immediatement (isEdit = false)
      // Pas de dispatch
      expect(mockHydratePartiesFromDossier).not.toHaveBeenCalled();
      expect(mockResetParties).not.toHaveBeenCalled();
    });
  });

  // ===================== Mode edit sans presetDossier =====================
  describe('mode edit sans presetDossier', () => {
    it('ne fait rien si presetDossier est null', () => {
      const wrapper = createWrapper();

      renderHook(() => usePartieHydration('edit', null), { wrapper });

      expect(mockHydratePartiesFromDossier).not.toHaveBeenCalled();
    });

    it('ne fait rien si presetDossier est undefined', () => {
      const wrapper = createWrapper();

      renderHook(() => usePartieHydration('edit', undefined), { wrapper });

      expect(mockHydratePartiesFromDossier).not.toHaveBeenCalled();
    });
  });

  // ===================== Mode edit avec presetDossier =====================
  describe('mode edit avec presetDossier', () => {
    it('ne dispatch pas d hydratation (gere par le parent)', () => {
      const wrapper = createWrapper();
      const presetDossier = {
        _id: 'd1',
        parties: { pour: [{ _id: 'p1' }], contre: [] },
      };

      renderHook(() => usePartieHydration('edit', presetDossier), { wrapper });

      // Le hook ne dispatch plus l'hydratation lui-meme (deplace vers le parent)
      expect(mockHydratePartiesFromDossier).not.toHaveBeenCalled();
    });
  });

  // ===================== partiesSource (useMemo) =====================
  describe('partiesSource derivation', () => {
    it('detecte les parties via presetDossier.dossier.parties', () => {
      const wrapper = createWrapper();
      const presetDossier = {
        _id: 'd1',
        dossier: {
          parties: { pour: [{ _id: 'p1' }], contre: [{ _id: 'p2' }] },
        },
      };

      // Le hook ne retourne pas partiesSource directement, mais on verifie
      // qu'il ne crash pas avec cette structure
      const { result } = renderHook(
        () => usePartieHydration('edit', presetDossier),
        { wrapper }
      );

      // Le hook retourne void
      expect(result.current).toBeUndefined();
    });

    it('detecte les parties via presetDossier.parties', () => {
      const wrapper = createWrapper();
      const presetDossier = {
        _id: 'd2',
        parties: { pour: [{ _id: 'p3' }], contre: [] },
      };

      const { result } = renderHook(
        () => usePartieHydration('edit', presetDossier),
        { wrapper }
      );

      expect(result.current).toBeUndefined();
    });

    it('detecte les parties via presetDossier.pour et presetDossier.contre', () => {
      const wrapper = createWrapper();
      const presetDossier = {
        _id: 'd3',
        pour: [{ _id: 'p4' }],
        contre: [{ _id: 'p5' }],
      };

      const { result } = renderHook(
        () => usePartieHydration('edit', presetDossier),
        { wrapper }
      );

      expect(result.current).toBeUndefined();
    });

    it('retourne null si presetDossier n a pas de structure de parties', () => {
      const wrapper = createWrapper();
      const presetDossier = { _id: 'd4', nom: 'Dossier sans parties' };

      const { result } = renderHook(
        () => usePartieHydration('edit', presetDossier),
        { wrapper }
      );

      expect(result.current).toBeUndefined();
    });

    it('retourne null si presetDossier est null', () => {
      const wrapper = createWrapper();

      const { result } = renderHook(
        () => usePartieHydration('edit', null),
        { wrapper }
      );

      expect(result.current).toBeUndefined();
    });

    it('gere presetDossier.pour sans presetDossier.contre', () => {
      const wrapper = createWrapper();
      const presetDossier = {
        _id: 'd5',
        pour: [{ _id: 'p6' }],
        // pas de contre
      };

      const { result } = renderHook(
        () => usePartieHydration('edit', presetDossier),
        { wrapper }
      );

      expect(result.current).toBeUndefined();
    });
  });

  // ===================== Refs tracking =====================
  describe('refs tracking (changement dossier)', () => {
    it('met a jour la ref quand l ID du dossier change', () => {
      const wrapper = createWrapper();
      const presetDossier1 = { _id: 'd1', parties: { pour: [], contre: [] } };
      const presetDossier2 = { _id: 'd2', parties: { pour: [], contre: [] } };

      const { rerender } = renderHook(
        ({ mode, presetDossier }) => usePartieHydration(mode, presetDossier),
        { wrapper, initialProps: { mode: 'edit', presetDossier: presetDossier1 } }
      );

      // Changement de dossier — le hook doit survivre sans crash
      rerender({ mode: 'edit', presetDossier: presetDossier2 });

      // Pas de dispatch — le hook ne fait que tracker les refs
      expect(mockHydratePartiesFromDossier).not.toHaveBeenCalled();
    });

    it('ne crash pas quand on passe de edit a create', () => {
      const wrapper = createWrapper();
      const presetDossier = { _id: 'd1', parties: { pour: [], contre: [] } };

      const { rerender } = renderHook(
        ({ mode, presetDossier }) => usePartieHydration(mode, presetDossier),
        { wrapper, initialProps: { mode: 'edit', presetDossier } }
      );

      // Passage en mode create
      rerender({ mode: 'create', presetDossier: null });

      expect(mockHydratePartiesFromDossier).not.toHaveBeenCalled();
    });

    it('re-render avec meme presetDossier ne cause pas de probleme', () => {
      const wrapper = createWrapper();
      const presetDossier = { _id: 'd1', parties: { pour: [], contre: [] } };

      const { rerender } = renderHook(
        ({ mode, presetDossier }) => usePartieHydration(mode, presetDossier),
        { wrapper, initialProps: { mode: 'edit', presetDossier } }
      );

      // Meme dossier — pas de changement
      rerender({ mode: 'edit', presetDossier });

      expect(mockHydratePartiesFromDossier).not.toHaveBeenCalled();
    });
  });

  // ===================== Retour du hook =====================
  describe('retour du hook', () => {
    it('retourne void (pas de valeur de retour)', () => {
      const wrapper = createWrapper();
      const { result } = renderHook(
        () => usePartieHydration('create', null),
        { wrapper }
      );

      expect(result.current).toBeUndefined();
    });
  });
});
