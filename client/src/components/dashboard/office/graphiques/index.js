import React, { useEffect, useMemo, useState, useCallback } from 'react';
import graphiquesApi from '../../../../services/graphiquesService';
import PeriodFilter, { computeRange } from './charts/PeriodFilter';

import OverviewTab from './tabs/Overview';
import DossiersTab from './tabs/Dossiers';
import FacturationTab from './tabs/Facturation';
import DepensesTab from './tabs/Depenses';
import RentabiliteTab from './tabs/Rentabilite';

import './Graphiques.css';

const TABS = [
  { key: 'overview',     label: 'Vue d’ensemble', icon: '◈' },
  { key: 'dossiers',     label: 'Dossiers',           icon: '▦' },
  { key: 'facturation',  label: 'Facturation',        icon: '€' },
  { key: 'depenses',     label: 'Depenses',           icon: '↘' },
  { key: 'rentabilite',  label: 'Rentabilite',        icon: '◆' },
];

const Graphiques = () => {
  const [periode, setPeriode] = useState(() => ({ mode: '12m', ...computeRange('12m') }));
  const [activeTab, setActiveTab] = useState('overview');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const range = useMemo(() => ({ from: periode.from, to: periode.to }), [periode]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await graphiquesApi.fetchAll(range);
      setData(res);
    } catch (e) {
      console.error('[Graphiques] echec chargement', e);
      setError(e?.response?.data?.message || e?.message || 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Renderer du contenu de l'onglet courant.
  const renderTab = () => {
    if (!data) return null;
    const props = { data, periode, loading };
    switch (activeTab) {
      case 'overview':    return <OverviewTab {...props} />;
      case 'dossiers':    return <DossiersTab {...props} />;
      case 'facturation': return <FacturationTab {...props} />;
      case 'depenses':    return <DepensesTab {...props} />;
      case 'rentabilite': return <RentabiliteTab {...props} />;
      default: return null;
    }
  };

  return (
    <div className="graphiques-page" role="region" aria-label="Tableaux de bord graphiques">
      {/* Header : titre + filtre periode */}
      <header className="graphiques-page-header">
        <div className="graphiques-title-block">
          <h1 className="graphiques-title">Tableaux de bord</h1>
          <p className="graphiques-subtitle">
            Visualisation de l&rsquo;activite du cabinet : dossiers, facturation, depenses et rentabilite.
          </p>
        </div>
        <PeriodFilter
          mode={periode.mode}
          onChange={(p) => setPeriode(p)}
        />
      </header>

      {/* Onglets */}
      <nav className="graphiques-tabs" role="tablist" aria-label="Sections du dashboard">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            className={`graphiques-tab ${activeTab === t.key ? 'is-active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <span className="graphiques-tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="graphiques-tab-label">{t.label}</span>
            <span className="graphiques-tab-underline" aria-hidden="true" />
          </button>
        ))}
      </nav>

      {/* Etats globaux */}
      {loading && !data && (
        <div className="graphiques-loader" role="status" aria-live="polite">
          <div className="loader-pulse" aria-hidden="true" />
          <span>Chargement des indicateurs&hellip;</span>
        </div>
      )}

      {error && (
        <div className="graphiques-error" role="alert">
          <strong>Echec du chargement.</strong> {error}
          <button type="button" className="graphiques-retry" onClick={loadAll}>Reessayer</button>
        </div>
      )}

      {/* Contenu de l'onglet (toujours rendu si data dispo, meme pendant un reload) */}
      {data && (
        <div className={`graphiques-tab-panel ${loading ? 'is-refreshing' : ''}`} key={activeTab}>
          {renderTab()}
        </div>
      )}
    </div>
  );
};

export default Graphiques;
