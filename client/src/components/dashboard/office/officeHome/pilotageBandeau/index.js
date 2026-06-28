// File: Kheops_2/client/src/components/dashboard/office/officeHome/pilotageBandeau/index.js
import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import './styles.css';

// Seuil "facture en retard" : statut pending + dateCreation > 30 jours.
// On agrège côté client à partir des 25 derniers dossiers chargés ; un endpoint
// dédié pourra remplacer ça si le cabinet dépasse 25 dossiers actifs.
const OVERDUE_DAYS = 30;

const PilotageBandeau = () => {
  const navigate = useNavigate();
  const events = useSelector((s) => s.agenda?.events);
  const topTasks = useSelector((s) => s.agenda?.topTasks);
  const lastDossiers = useSelector((s) => s.last25Dossiers?.lastDossiers);

  const stats = useMemo(() => {
    const now = new Date();
    const today0 = new Date(now);
    today0.setHours(0, 0, 0, 0);
    const tomorrow0 = new Date(today0);
    tomorrow0.setDate(tomorrow0.getDate() + 1);
    const in48h = new Date(now);
    in48h.setHours(in48h.getHours() + 48);
    const in7days = new Date(today0);
    in7days.setDate(in7days.getDate() + 7);
    const overdueThreshold = new Date(now);
    overdueThreshold.setDate(overdueThreshold.getDate() - OVERDUE_DAYS);

    const safeEvents = Array.isArray(events) ? events : [];
    const safeTasks = Array.isArray(topTasks) ? topTasks : [];
    const safeDossiers = Array.isArray(lastDossiers) ? lastDossiers : [];

    const isEventType = (e) => e && (e.type === 'event' || !e.type);

    const audiencesSemaine = safeEvents.filter((e) => {
      if (!isEventType(e)) return false;
      const start = new Date(e.startDate);
      return !Number.isNaN(start.getTime()) && start >= now && start <= in7days;
    }).length;

    let facturesRetard = 0;
    safeDossiers.forEach((d) => {
      const factures = Array.isArray(d?.factures) ? d.factures : [];
      factures.forEach((f) => {
        if (f?.status === 'pending') {
          const created = new Date(f.dateCreation);
          if (!Number.isNaN(created.getTime()) && created < overdueThreshold) {
            facturesRetard += 1;
          }
        }
      });
    });

    const tachesAujourdhui = safeTasks.filter((t) => {
      const start = new Date(t?.startDate);
      return !Number.isNaN(start.getTime()) && start >= today0 && start < tomorrow0;
    }).length;

    const urgent48h = safeEvents.filter((e) => {
      if (!isEventType(e)) return false;
      const start = new Date(e.startDate);
      return !Number.isNaN(start.getTime()) && start >= now && start <= in48h;
    }).length;

    return { audiencesSemaine, facturesRetard, tachesAujourdhui, urgent48h };
  }, [events, topTasks, lastDossiers]);

  const cards = [
    {
      key: 'audiences',
      label: 'Audiences & RDV cette semaine',
      value: stats.audiencesSemaine,
      tone: 'blue',
      icon: '📅',
      target: '/dashboard/agenda',
      ttsLabel: `${stats.audiencesSemaine} audiences ou rendez-vous cette semaine`,
    },
    {
      key: 'factures',
      label: 'Factures en retard',
      value: stats.facturesRetard,
      tone: 'red',
      icon: '⚠️',
      target: '/dashboard/facturation',
      ttsLabel: `${stats.facturesRetard} factures en retard`,
    },
    {
      key: 'taches',
      label: "Tâches dues aujourd'hui",
      value: stats.tachesAujourdhui,
      tone: 'orange',
      icon: '✅',
      target: '/dashboard/todolist',
      ttsLabel: `${stats.tachesAujourdhui} tâches dues aujourd'hui`,
    },
    {
      key: 'urgent',
      label: 'Événements dans les 48h',
      value: stats.urgent48h,
      tone: 'purple',
      icon: '🔔',
      target: '/dashboard/agenda',
      ttsLabel: `${stats.urgent48h} événements urgents dans les 48 prochaines heures`,
    },
  ];

  return (
    <div className="k-pilotage-bandeau" role="region" aria-label="Mode pilotage du jour">
      <div className="k-pilotage-bandeau__header">
        <span className="k-pilotage-bandeau__title">Mode pilotage</span>
        <span className="k-pilotage-bandeau__subtitle">Vos indicateurs du jour</span>
      </div>
      <div className="k-pilotage-bandeau__cards">
        {cards.map((c) => (
          <HoverToSpeak key={c.key} textToSpeak={c.ttsLabel}>
            <button
              type="button"
              className={`k-pilotage-card k-pilotage-card--${c.tone} ${
                c.value > 0 ? 'k-pilotage-card--active' : 'k-pilotage-card--zero'
              }`}
              onClick={() => navigate(c.target)}
              aria-label={c.ttsLabel}
            >
              <span className="k-pilotage-card__icon" aria-hidden="true">{c.icon}</span>
              <span className="k-pilotage-card__value">{c.value}</span>
              <span className="k-pilotage-card__label">{c.label}</span>
            </button>
          </HoverToSpeak>
        ))}
      </div>
    </div>
  );
};

export default PilotageBandeau;
