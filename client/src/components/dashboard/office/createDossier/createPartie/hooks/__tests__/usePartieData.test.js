// usePartieData.test.js — Tests du hook usePartieData
import { renderHook } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Mock axios pour rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../../../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

import rootReducer from '../../../../../../../redux/rootReducer';
import usePartieData from '../usePartieData';

// Helper pour creer le wrapper avec un store pre-configure
const createWrapper = (preloadedState = {}) => {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      login: { user: null, isAuthenticated: false, error: null, loading: false },
      ...preloadedState,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const Wrapper = ({ children }) => (
    <Provider store={store}>{children}</Provider>
  );
  return Wrapper;
};

// Donnees de test reutilisables
const partiesFixture = [
  {
    idPartie: 'p1',
    nomPartie: 'Dupont',
    typePartie: 'Pour',
    linkedAvocats: [{ _id: 'av1', nom: 'Maitre A' }],
    linkedContacts: [{ _id: 'c1', nom: 'Contact 1' }],
  },
  {
    idPartie: 'p2',
    nomPartie: 'Martin',
    typePartie: 'Pour',
    linkedAvocats: [{ _id: 'av1', nom: 'Maitre A' }, { _id: 'av2', nom: 'Maitre B' }],
    linkedContacts: [{ _id: 'c1', nom: 'Contact 1' }, { _id: 'c2', nom: 'Contact 2' }],
  },
  {
    idPartie: 'p3',
    nomPartie: 'Durand',
    typePartie: 'Contre',
    linkedAvocats: [{ _id: 'av3', nom: 'Maitre C' }],
    linkedContacts: [{ _id: 'c3', nom: 'Contact 3' }],
  },
  {
    idPartie: 'p4',
    nomPartie: 'Bernard',
    typePartie: 'Contre',
    linkedAvocats: [{ _id: 'av3', nom: 'Maitre C' }],
    linkedContacts: [],
  },
];

describe('usePartieData', () => {
  // ===================== Mode create =====================
  describe('mode create', () => {
    it('retourne les parties depuis state.partieData', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      expect(result.current.parties).toHaveLength(4);
    });

    it('retourne des tableaux vides quand partieData est vide', () => {
      const wrapper = createWrapper({
        partieData: { parties: [] },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      expect(result.current.parties).toEqual([]);
      expect(result.current.pourParties).toEqual([]);
      expect(result.current.contreParties).toEqual([]);
    });

    it('mode par defaut est create', () => {
      const wrapper = createWrapper({
        partieData: { parties: [partiesFixture[0]] },
      });
      const { result } = renderHook(() => usePartieData(), { wrapper });

      expect(result.current.parties).toHaveLength(1);
    });
  });

  // ===================== Mode edit =====================
  describe('mode edit', () => {
    it('retourne les parties depuis state.partieEditData', () => {
      const wrapper = createWrapper({
        partieEditData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('edit'), { wrapper });

      expect(result.current.parties).toHaveLength(4);
    });

    it('ne lit pas partieData en mode edit', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
        partieEditData: { parties: [] },
      });
      const { result } = renderHook(() => usePartieData('edit'), { wrapper });

      expect(result.current.parties).toEqual([]);
    });
  });

  // ===================== Normalisation =====================
  describe('normalisation', () => {
    it('ajoute linkedAvocats et linkedContacts vides si absents', () => {
      const wrapper = createWrapper({
        partieData: {
          parties: [{ idPartie: 'p1', nomPartie: 'Test', typePartie: 'Pour' }],
        },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      expect(result.current.parties[0].linkedAvocats).toEqual([]);
      expect(result.current.parties[0].linkedContacts).toEqual([]);
    });

    it('conserve les linkedAvocats et linkedContacts existants', () => {
      const wrapper = createWrapper({
        partieData: { parties: [partiesFixture[0]] },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      expect(result.current.parties[0].linkedAvocats).toEqual([{ _id: 'av1', nom: 'Maitre A' }]);
    });
  });

  // ===================== Separation Pour / Contre =====================
  describe('separation Pour / Contre', () => {
    it('separe correctement les parties Pour et Contre', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      expect(result.current.pourParties).toHaveLength(2);
      expect(result.current.contreParties).toHaveLength(2);
    });

    it('trie les parties Pour par nomPartie', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      // Dupont < Martin
      expect(result.current.pourParties[0].nomPartie).toBe('Dupont');
      expect(result.current.pourParties[1].nomPartie).toBe('Martin');
    });

    it('trie les parties Contre par nomPartie', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      // Bernard < Durand
      expect(result.current.contreParties[0].nomPartie).toBe('Bernard');
      expect(result.current.contreParties[1].nomPartie).toBe('Durand');
    });
  });

  // ===================== Listes plates des elements lies =====================
  describe('listes plates des elements lies', () => {
    it('linkedAvocatsPour contient tous les avocats des parties Pour', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      // Dupont a [av1], Martin a [av1, av2] → total 3 elements
      expect(result.current.linkedAvocatsPour).toHaveLength(3);
    });

    it('linkedAvocatsContre contient tous les avocats des parties Contre', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      // Durand a [av3], Bernard a [av3] → total 2 elements
      expect(result.current.linkedAvocatsContre).toHaveLength(2);
    });

    it('linkedContactsPour contient tous les contacts des parties Pour', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      // Dupont a [c1], Martin a [c1, c2] → total 3 elements
      expect(result.current.linkedContactsPour).toHaveLength(3);
    });

    it('linkedContactsContre contient tous les contacts des parties Contre', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      // Durand a [c3], Bernard a [] → total 1 element
      expect(result.current.linkedContactsContre).toHaveLength(1);
    });
  });

  // ===================== Listes des IDs =====================
  describe('listes des IDs', () => {
    it('linkedAvocatsPourIds contient les _id des avocats Pour', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      expect(result.current.linkedAvocatsPourIds).toEqual(['av1', 'av1', 'av2']);
    });

    it('linkedContactsContreIds contient les _id des contacts Contre', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      expect(result.current.linkedContactsContreIds).toEqual(['c3']);
    });
  });

  // ===================== Intersection (elements communs) =====================
  describe('elements communs (intersect)', () => {
    it('linkedAvocatsAllPour retourne les avocats communs a toutes les parties Pour', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      // Dupont a [av1], Martin a [av1, av2] → commun = [av1]
      expect(result.current.linkedAvocatsAllPour).toHaveLength(1);
      expect(result.current.linkedAvocatsAllPour[0]._id).toBe('av1');
    });

    it('linkedContactsAllPour retourne les contacts communs a toutes les parties Pour', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      // Dupont a [c1], Martin a [c1, c2] → commun = [c1]
      expect(result.current.linkedContactsAllPour).toHaveLength(1);
      expect(result.current.linkedContactsAllPour[0]._id).toBe('c1');
    });

    it('linkedAvocatsAllContre retourne les avocats communs a toutes les parties Contre', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      // Durand a [av3], Bernard a [av3] → commun = [av3]
      expect(result.current.linkedAvocatsAllContre).toHaveLength(1);
      expect(result.current.linkedAvocatsAllContre[0]._id).toBe('av3');
    });

    it('linkedContactsAllContre retourne tableau vide si aucun contact commun', () => {
      const wrapper = createWrapper({
        partieData: { parties: partiesFixture },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      // Durand a [c3], Bernard a [] → commun = []
      expect(result.current.linkedContactsAllContre).toEqual([]);
    });

    it('retourne tableau vide si une seule partie Pour (pas d intersection possible)', () => {
      const wrapper = createWrapper({
        partieData: {
          parties: [partiesFixture[0]], // une seule partie Pour
        },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      expect(result.current.linkedAvocatsAllPour).toEqual([]);
    });
  });

  // ===================== Export utilitaire =====================
  describe('export utilitaire', () => {
    it('exporte la fonction arraysAreEqual', () => {
      const wrapper = createWrapper({
        partieData: { parties: [] },
      });
      const { result } = renderHook(() => usePartieData('create'), { wrapper });

      expect(typeof result.current.arraysAreEqual).toBe('function');
    });
  });
});
