// client/src/components/cabinet/CabinetDossierProfitability.js
//
// Vue de la rentabilite par dossier : pour chaque affaire qui a au moins
// une recette ou une depense, affiche recettes / depenses / resultat.
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  fetchProfitability,
} from '../../redux/slices/cabinetSlice';
import { setCurrentDossier } from '../../redux/slices/currentDossierSlice';
import {
  formatMontant,
  computePeriodRange,
} from './cabinetHelpers';
import './cabinet.css';

const CabinetDossierProfitability = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const items = useSelector(s => s.cabinet.profitability);
  const loading = useSelector(s => s.cabinet.loadingProfitability);

  const [periodPreset, setPeriodPreset] = useState('all');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });

  const range = computePeriodRange(periodPreset, customRange);

  useEffect(() => {
    dispatch(fetchProfitability({
      from: range.from?.toISOString(),
      to: range.to?.toISOString(),
    }));
  }, [periodPreset, customRange.from, customRange.to, dispatch]); // eslint-disable-line

  const totalRecettes = items.reduce((s, i) => s + (i.recettes || 0), 0);
  const totalDepenses = items.reduce((s, i) => s + (i.depenses || 0), 0);
  const totalResultat = totalRecettes - totalDepenses;

  const goToDossier = (item) => {
    dispatch(setCurrentDossier({ _id: item.dossierId, reference: item.reference, dossier: { dossier: { nom: item.nom } } }));
    navigate('/dashboard/dossier');
  };

  const maxAbs = Math.max(...items.map(i => Math.abs(i.resultat || 0)), 1);

  return (
    <div>
      <div className="k-cab-toolbar">
        <div className="filters">
          <select value={periodPreset} onChange={e => setPeriodPreset(e.target.value)}>
            <option value="all">Toutes periodes</option>
            <option value="month">Mois courant</option>
            <option value="quarter">Trimestre courant</option>
            <option value="year">Annee courante</option>
            <option value="previousYear">Annee precedente</option>
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
        <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
          {items.length} dossier(s) avec activite
        </div>
      </div>

      {/* Totaux */}
      {items.length > 0 && (
        <div className="k-cab-kpi-grid" style={{ marginBottom: '1rem' }}>
          <div className="k-cab-kpi-card recettes">
            <span className="k-cab-kpi-label">Total recettes (dossiers)</span>
            <span className="k-cab-kpi-value">{formatMontant(totalRecettes)}</span>
          </div>
          <div className="k-cab-kpi-card depenses">
            <span className="k-cab-kpi-label">Total depenses (dossiers)</span>
            <span className="k-cab-kpi-value">{formatMontant(totalDepenses)}</span>
          </div>
          <div className={`k-cab-kpi-card ${totalResultat >= 0 ? 'resultat-positif' : 'resultat-negatif'}`}>
            <span className="k-cab-kpi-label">Marge cumulee</span>
            <span className="k-cab-kpi-value">{formatMontant(totalResultat)}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="k-cab-empty">Chargement...</div>
      ) : items.length === 0 ? (
        <div className="k-cab-empty">
          Aucun dossier avec activite financiere sur la periode.
          <div style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
            Pour qu'un dossier apparaisse ici, il faut soit qu'il ait fait l'objet d'un encaissement (Facturation), soit qu'une depense lui ait ete rattachee.
          </div>
        </div>
      ) : (
        <div className="k-cab-section">
          <p className="k-cab-section-subtitle">
            Tri par marge decroissante (les dossiers les plus rentables en haut).
            Cliquez sur un dossier pour l'ouvrir.
          </p>
          <table className="k-cab-table">
            <thead>
              <tr>
                <th>Dossier</th>
                <th>Reference</th>
                <th className="col-amount">Recettes</th>
                <th className="col-amount">Depenses</th>
                <th className="col-amount">Marge</th>
                <th>Visualisation</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const positif = (item.resultat || 0) >= 0;
                const ratio = Math.abs((item.resultat || 0) / maxAbs);
                return (
                  <tr key={item.dossierId} onClick={() => goToDossier(item)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: 500, color: '#1e3a8a' }}>{item.nom}</td>
                    <td style={{ color: '#6b7280', fontSize: '0.78rem' }}>{item.reference || '—'}</td>
                    <td className="col-amount" style={{ color: '#047857' }}>+ {formatMontant(item.recettes || 0)}</td>
                    <td className="col-amount" style={{ color: '#b45309' }}>− {formatMontant(item.depenses || 0)}</td>
                    <td className="col-amount" style={{ color: positif ? '#1e40af' : '#b91c1c' }}>
                      {positif ? '' : '−'}{formatMontant(Math.abs(item.resultat || 0))}
                    </td>
                    <td style={{ width: '30%' }}>
                      <div style={{ display: 'flex', gap: '2px', alignItems: 'center', height: '18px' }}>
                        <div
                          style={{
                            background: positif ? '#10b981' : '#ef4444',
                            width: `${ratio * 100}%`,
                            height: '8px',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="k-cab-section" style={{ marginTop: '1rem', background: '#f9fafb', borderStyle: 'dashed' }}>
        <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
          <strong>Note :</strong> seules les depenses explicitement rattachees a un dossier (via le champ "Dossier rattache" dans le formulaire de depense) sont attribuees. Les charges generales (loyer, salaires, abonnements) ne sont pas reparties automatiquement par dossier.
        </p>
      </div>
    </div>
  );
};

export default CabinetDossierProfitability;
