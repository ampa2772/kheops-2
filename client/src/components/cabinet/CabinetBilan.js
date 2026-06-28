// client/src/components/cabinet/CabinetBilan.js
//
// Vue synthese du bilan : recettes / depenses / resultat / TVA, repartition
// par categorie, evolution mensuelle. La page declenche un sweep automatique
// des recurrences a l'ouverture pour que les donnees soient a jour.
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchBilan,
  sweepRecurrences,
  fetchCabinetConstants,
} from '../../redux/slices/cabinetSlice';
import {
  formatMontant,
  formatMontantCompact,
  computePeriodRange,
  labelMoisCourt,
} from './cabinetHelpers';
import './cabinet.css';

const CabinetBilan = () => {
  const dispatch = useDispatch();
  const bilan = useSelector(s => s.cabinet.bilan);
  const loading = useSelector(s => s.cabinet.loadingBilan);
  const constants = useSelector(s => s.cabinet.constants);
  const lastSweep = useSelector(s => s.cabinet.lastSweep);

  const [periodPreset, setPeriodPreset] = useState('year');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });

  const range = computePeriodRange(periodPreset, customRange);

  useEffect(() => {
    if (!constants) dispatch(fetchCabinetConstants());
    // Sweep automatique a l'ouverture du bilan : genere les occurrences
    // dues des recurrences automatiques avant d'afficher le bilan.
    (async () => {
      await dispatch(sweepRecurrences());
      dispatch(fetchBilan({
        from: range.from?.toISOString(),
        to: range.to?.toISOString(),
      }));
    })();
  }, []); // eslint-disable-line

  useEffect(() => {
    dispatch(fetchBilan({
      from: range.from?.toISOString(),
      to: range.to?.toISOString(),
    }));
  }, [periodPreset, customRange.from, customRange.to, dispatch]); // eslint-disable-line

  const categorieLabel = (code) => {
    const c = (constants?.categoriesDepenses || []).find(c => c.code === code);
    return c ? `${c.icone} ${c.label}` : code;
  };

  const categoriesTriees = useMemo(() => {
    if (!bilan?.repartitions?.depensesParCategorie) return [];
    const entries = Object.entries(bilan.repartitions.depensesParCategorie);
    entries.sort(([, a], [, b]) => b - a);
    return entries;
  }, [bilan]);

  const maxCategorie = categoriesTriees[0]?.[1] || 1;

  const moisData = useMemo(() => {
    if (!bilan) return [];
    const recettesParMois = bilan.repartitions?.recettesParMois || {};
    const depensesParMois = bilan.repartitions?.depensesParMois || {};
    const allMonths = new Set([...Object.keys(recettesParMois), ...Object.keys(depensesParMois)]);
    const sorted = [...allMonths].sort();
    return sorted.map(cle => {
      const [yyyy, mm] = cle.split('-');
      return {
        cle,
        annee: parseInt(yyyy, 10),
        mois: parseInt(mm, 10) - 1,
        recettes: recettesParMois[cle] || 0,
        depenses: depensesParMois[cle] || 0,
        resultat: (recettesParMois[cle] || 0) - (depensesParMois[cle] || 0),
      };
    });
  }, [bilan]);

  const resultat = bilan?.resultat?.ttc ?? 0;
  const positif = resultat >= 0;

  return (
    <div>
      <div className="k-cab-toolbar">
        <div className="filters">
          <select value={periodPreset} onChange={e => setPeriodPreset(e.target.value)}>
            <option value="month">Mois courant</option>
            <option value="previousMonth">Mois precedent</option>
            <option value="quarter">Trimestre courant</option>
            <option value="year">Annee courante</option>
            <option value="previousYear">Annee precedente</option>
            <option value="all">Toutes periodes</option>
            <option value="custom">Periode personnalisee</option>
          </select>
          {periodPreset === 'custom' && (
            <>
              <input type="date" value={customRange.from} onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))} />
              <span>au</span>
              <input type="date" value={customRange.to} onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))} />
            </>
          )}
        </div>
        {lastSweep && lastSweep.generated > 0 && (
          <span style={{ fontSize: '0.78rem', color: '#065f46' }}>
            ⚡ {lastSweep.generated} occurrence(s) recurrente(s) generee(s) automatiquement
          </span>
        )}
      </div>

      {loading && !bilan ? (
        <div className="k-cab-empty">Chargement du bilan...</div>
      ) : (
        <>
          {/* KPIs principaux */}
          <div className="k-cab-kpi-grid">
            <div className="k-cab-kpi-card recettes">
              <span className="k-cab-kpi-label">Recettes encaissees (TTC)</span>
              <span className="k-cab-kpi-value">{formatMontant(bilan?.recettes?.ttc ?? 0)}</span>
              <span className="k-cab-kpi-sub">{bilan?.recettes?.nbPaiements ?? 0} encaissement(s) · HT : {formatMontantCompact(bilan?.recettes?.ht ?? 0)}</span>
            </div>
            <div className="k-cab-kpi-card depenses">
              <span className="k-cab-kpi-label">Depenses (TTC)</span>
              <span className="k-cab-kpi-value">{formatMontant(bilan?.depenses?.ttc ?? 0)}</span>
              <span className="k-cab-kpi-sub">{bilan?.depenses?.nb ?? 0} depense(s) · HT : {formatMontantCompact(bilan?.depenses?.ht ?? 0)}</span>
            </div>
            <div className={`k-cab-kpi-card ${positif ? 'resultat-positif' : 'resultat-negatif'}`}>
              <span className="k-cab-kpi-label">Resultat (benefice)</span>
              <span className="k-cab-kpi-value">{formatMontant(resultat)}</span>
              <span className="k-cab-kpi-sub">{positif ? 'Positif — bonne nouvelle' : 'Negatif — ajuster'}</span>
            </div>
            <div className="k-cab-kpi-card tva">
              <span className="k-cab-kpi-label">Solde TVA a reverser</span>
              <span className="k-cab-kpi-value">{formatMontant(bilan?.tva?.solde ?? 0)}</span>
              <span className="k-cab-kpi-sub">Collectee {formatMontantCompact(bilan?.tva?.collectee ?? 0)} − deductible {formatMontantCompact(bilan?.tva?.deductible ?? 0)}</span>
            </div>
          </div>

          {/* Repartition par categorie */}
          <div className="k-cab-section" style={{ marginTop: '1rem' }}>
            <h4 className="k-cab-section-title">Repartition des depenses par categorie</h4>
            {categoriesTriees.length === 0 ? (
              <p className="k-cab-empty">Aucune depense sur la periode.</p>
            ) : (
              <div className="k-cab-bar-list">
                {categoriesTriees.map(([code, total]) => (
                  <div key={code}>
                    <div className="k-cab-bar-row">
                      <span className="k-cab-bar-label">{categorieLabel(code)}</span>
                      <span className="k-cab-bar-value">{formatMontant(total)}</span>
                    </div>
                    <div className="k-cab-bar-track">
                      <div
                        className="k-cab-bar-fill depenses"
                        style={{ width: `${(total / maxCategorie) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Evolution mensuelle */}
          {moisData.length > 0 && (
            <div className="k-cab-section" style={{ marginTop: '1rem' }}>
              <h4 className="k-cab-section-title">Evolution mensuelle</h4>
              <p className="k-cab-section-subtitle">Recettes (vert) / depenses (orange) / resultat (gras) par mois.</p>
              <div className="k-cab-month-grid">
                {moisData.map(m => (
                  <div key={m.cle} className="k-cab-month-cell">
                    <span className="nom">{labelMoisCourt(m.mois)} {String(m.annee).slice(-2)}</span>
                    <span className="recettes">+ {formatMontantCompact(m.recettes)}</span>
                    <span className="depenses">− {formatMontantCompact(m.depenses)}</span>
                    <span className="resultat" style={{ color: m.resultat >= 0 ? '#1e40af' : '#b91c1c' }}>
                      {m.resultat >= 0 ? '' : '−'}{formatMontantCompact(Math.abs(m.resultat))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="k-cab-section" style={{ marginTop: '1rem', background: '#f9fafb', borderStyle: 'dashed' }}>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
              <strong>Note :</strong> Ce bilan est un outil de pilotage destine a l'avocat. Il ne se substitue pas a une comptabilite legale tenue par un expert-comptable.
              Les recettes correspondent aux <strong>encaissements</strong> (paiements recus) sur la periode. Les depenses sont les charges du cabinet enregistrees ou generees automatiquement par les recurrences. Pour la declaration fiscale ou TVA officielle, consultez votre comptable.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default CabinetBilan;
