// useAgenda.test.js — Tests du hook useAgenda
import { renderHook } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

// Mock axios pour rootReducer
jest.mock('axios', () => ({
  __esModule: true,
  default: { defaults: { headers: { common: {} } } },
}));
jest.mock('../../../../../../services/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../../../../../services/socketService', () => ({
  __esModule: true,
  initSocket: jest.fn(),
  default: { initSocket: jest.fn() },
}));

import rootReducer from '../../../../../../redux/rootReducer';
import { useAgenda } from '../useAgenda';

const createWrapper = (events = []) => {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: {
      login: { user: null, isAuthenticated: false, error: null, loading: false },
      agenda: { events, loading: false, error: null },
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

  const Wrapper = ({ children }) => (
    <Provider store={store}>{children}</Provider>
  );
  return Wrapper;
};

describe('useAgenda', () => {
  // ===================== getEventsForDay =====================
  describe('getEventsForDay', () => {
    it('retourne les evenements d un jour donne', () => {
      const events = [
        { _id: '1', title: 'RDV', startDate: '2024-06-15T10:00:00.000Z' },
        { _id: '2', title: 'Reunion', startDate: '2024-06-15T14:00:00.000Z' },
        { _id: '3', title: 'Autre', startDate: '2024-06-16T10:00:00.000Z' },
      ];
      const wrapper = createWrapper(events);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 15)), { wrapper });

      const dayEvents = result.current.getEventsForDay(new Date(2024, 5, 15, 12));
      expect(dayEvents).toHaveLength(2);
      expect(dayEvents[0].title).toBe('RDV');
      expect(dayEvents[1].title).toBe('Reunion');
    });

    it('retourne un tableau vide pour un jour sans evenement', () => {
      const wrapper = createWrapper([]);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 15)), { wrapper });

      const dayEvents = result.current.getEventsForDay(new Date(2024, 5, 20, 12));
      expect(dayEvents).toEqual([]);
    });

    it('trie les evenements par startDate', () => {
      const events = [
        { _id: '1', title: 'Apres-midi', startDate: '2024-06-15T14:00:00.000Z' },
        { _id: '2', title: 'Matin', startDate: '2024-06-15T09:00:00.000Z' },
      ];
      const wrapper = createWrapper(events);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 15)), { wrapper });

      const dayEvents = result.current.getEventsForDay(new Date(2024, 5, 15, 12));
      expect(dayEvents[0].title).toBe('Matin');
      expect(dayEvents[1].title).toBe('Apres-midi');
    });
  });

  // ===================== genererJoursCalendrier =====================
  describe('genererJoursCalendrier', () => {
    it('retourne exactement 42 jours (6 semaines)', () => {
      const wrapper = createWrapper([]);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 1)), { wrapper }); // Juin 2024

      const jours = result.current.genererJoursCalendrier();
      expect(jours).toHaveLength(42);
    });

    it('les jours du mois courant ont moisActuel=true', () => {
      const wrapper = createWrapper([]);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 1)), { wrapper }); // Juin 2024

      const jours = result.current.genererJoursCalendrier();
      const joursCourants = jours.filter(j => j.moisActuel);
      expect(joursCourants).toHaveLength(30); // Juin a 30 jours
    });

    it('les jours de padding ont moisActuel=false', () => {
      const wrapper = createWrapper([]);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 1)), { wrapper });

      const jours = result.current.genererJoursCalendrier();
      const joursPadding = jours.filter(j => !j.moisActuel);
      expect(joursPadding.length).toBeGreaterThan(0);
      expect(joursPadding.length).toBe(42 - 30); // 42 - jours du mois
    });

    it('le premier jour est un lundi (calendrier francais)', () => {
      const wrapper = createWrapper([]);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 1)), { wrapper }); // Juin 2024

      const jours = result.current.genererJoursCalendrier();
      const premierJour = jours[0].date;
      // getDay() : 0=Dimanche, 1=Lundi
      expect(premierJour.getDay()).toBe(1); // Lundi
    });

    it('chaque jour contient ses evenements', () => {
      const events = [
        { _id: '1', title: 'Test', startDate: '2024-06-15T10:00:00.000Z' },
      ];
      const wrapper = createWrapper(events);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 1)), { wrapper });

      const jours = result.current.genererJoursCalendrier();
      const jour15 = jours.find(j => j.moisActuel && j.date.getDate() === 15);
      expect(jour15.events).toHaveLength(1);
      expect(jour15.events[0].title).toBe('Test');
    });
  });

  // ===================== getWeekViewDates =====================
  describe('getWeekViewDates', () => {
    it('retourne exactement 7 dates', () => {
      const wrapper = createWrapper([]);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 12)), { wrapper }); // Mercredi 12 juin

      const dates = result.current.getWeekViewDates();
      expect(dates).toHaveLength(7);
    });

    it('commence le lundi', () => {
      const wrapper = createWrapper([]);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 12)), { wrapper }); // Mercredi 12 juin

      const dates = result.current.getWeekViewDates();
      expect(dates[0].getDay()).toBe(1); // Lundi
    });

    it('finit le dimanche', () => {
      const wrapper = createWrapper([]);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 12)), { wrapper });

      const dates = result.current.getWeekViewDates();
      expect(dates[6].getDay()).toBe(0); // Dimanche
    });

    it('les dates sont consecutives', () => {
      const wrapper = createWrapper([]);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 12)), { wrapper });

      const dates = result.current.getWeekViewDates();
      for (let i = 1; i < dates.length; i++) {
        const diff = dates[i].getDate() - dates[i - 1].getDate();
        expect(diff).toBe(1);
      }
    });
  });

  // ===================== Cas limites =====================
  describe('cas limites', () => {
    it('gere les evenements null dans le store', () => {
      const wrapper = createWrapper(null);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 1)), { wrapper });

      const dayEvents = result.current.getEventsForDay(new Date(2024, 5, 15, 12));
      expect(dayEvents).toEqual([]);
    });

    it('gere les evenements sans startDate', () => {
      const events = [
        { _id: '1', title: 'Sans date' },
        { _id: '2', title: 'Avec date', startDate: '2024-06-15T10:00:00.000Z' },
      ];
      const wrapper = createWrapper(events);
      const { result } = renderHook(() => useAgenda(new Date(2024, 5, 1)), { wrapper });

      const dayEvents = result.current.getEventsForDay(new Date(2024, 5, 15, 12));
      expect(dayEvents).toHaveLength(1);
      expect(dayEvents[0].title).toBe('Avec date');
    });
  });
});
