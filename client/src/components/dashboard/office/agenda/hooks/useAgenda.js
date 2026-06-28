import { useMemo, useCallback } from 'react';
import { useSelector } from 'react-redux';

export const useAgenda = (currentDate) => {
  const { events } = useSelector(state => state.agenda);

  const eventsByDate = useMemo(() => {
    const map = new Map();
    (events || []).forEach(event => {
      if (!event || !event.startDate) return;
      const date = new Date(event.startDate);
      if (isNaN(date.getTime())) return;
      
      const dateKey = date.toISOString().split('T')[0];
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey).push(event);
    });
    map.forEach(dayEvents => dayEvents.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)));
    return map;
  }, [events]);

  const getEventsForDay = useCallback((date) => {
    const dateKey = date.toISOString().split('T')[0];
    return eventsByDate.get(dateKey) || [];
  }, [eventsByDate]);

  const genererJoursCalendrier = useCallback(() => {
    const annee = currentDate.getFullYear();
    const mois = currentDate.getMonth();
    const premierJourDuMois = new Date(annee, mois, 1);
    const nombreJoursDansMois = new Date(annee, mois + 1, 0).getDate();
    const premierJourSemaineDuMois = premierJourDuMois.getDay();

    const jours = [];
    const joursPaddingDebut = premierJourSemaineDuMois === 0 ? 6 : premierJourSemaineDuMois - 1; // Lundi = 0
    const dernierJourMoisPrec = new Date(annee, mois, 0).getDate();

    for (let i = joursPaddingDebut; i > 0; i--) {
      const jour = new Date(annee, mois - 1, dernierJourMoisPrec - i + 1, 12, 0, 0);
      jours.push({ date: jour, moisActuel: false, events: getEventsForDay(jour) });
    }

    for (let i = 1; i <= nombreJoursDansMois; i++) {
      const jour = new Date(annee, mois, i, 12, 0, 0);
      jours.push({ date: jour, moisActuel: true, events: getEventsForDay(jour) });
    }
    
    const totalCellulesGrille = 42; // Toujours 6 semaines pour une hauteur stable
    const joursRestantsPourGrille = totalCellulesGrille - jours.length;
    
    for (let i = 1; i <= joursRestantsPourGrille; i++) {
      const jour = new Date(annee, mois + 1, i, 12, 0, 0);
      jours.push({ date: jour, moisActuel: false, events: getEventsForDay(jour) });
    }

    return jours;
  }, [currentDate, getEventsForDay]);

  const getWeekViewDates = useCallback(() => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setHours(12, 0, 0, 0);
    const dayOfWeek = startOfWeek.getDay() === 0 ? 6 : startOfWeek.getDay() - 1; // Lundi = 0
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

    return Array.from({ length: 7 }).map((_, i) => {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [currentDate]);

  return {
    getEventsForDay,
    genererJoursCalendrier,
    getWeekViewDates,
  };
};