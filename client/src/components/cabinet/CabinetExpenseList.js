// client/src/components/cabinet/CabinetExpenseList.js
//
// Liste filtrable des depenses du cabinet. Support :
//  - filtres : periode (mois courant, annee, custom), categorie, dossier
//  - actions : ajouter, editer, supprimer
//  - export CSV de la selection courante
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchExpenses,
  fetchCabinetConstants,
  removeExpenseLocal,
} from '../../redux/slices/cabinetSlice';
import cabinetApi from '../../services/cabinetService';
import CabinetExpenseModal from './CabinetExpenseModal';
import { formatMontant, formatDate, computePeriodRange, toDateInputValue, downloadBlob } from './cabinetHelpers';
import { useToast } from '../common/notifications/useToast';
import { useConfirm } from '../common/notifications/ConfirmProvider';
import './cabinet.css';

const CabinetExpenseList = ({ embedded = false }) => {
  const dispatch = useDispatch();
  const toast = useToast();
  const confirm = useConfirm();
  const expenses = useSelector(s => s.cabinet.expenses);
  const loading = useSelector(s => s.cabinet.loadingExpenses);
  const constants = useSelector(s => s.cabinet.constants);
  const dossiers = useSelector(s => s.last25Dossiers?.lastDossiers || []);

  const [periodPreset, setPeriodPreset] = useState('year');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [filterCategorie, setFilterCategorie] = useState('all');
  const [filterDossier, setFilterDossier] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState(null);

  const range = computePeriodRange(periodPreset, customRange);

  useEffect(() => {
    if (!constants) dispatch(fetchCabinetConstants());
  }, [constants, dispatch]);

  useEffect(() => {
    const filters = {};
    if (range.from) filters.from = range.from.toISOString();
    if (range.to) filters.to = range.to.toISOString();
    if (filterCategorie !== 'all') filters.categorie = filterCategorie;
    if (filterDossier !== 'all') filters.dossierId = filterDossier;
    dispatch(fetchExpenses(filters));
  }, [periodPreset, customRange.from, customRange.to, filterCategorie, filterDossier, dispatch]); // eslint-disable-line

  const total = useMemo(() => {
    return expenses.reduce((s, e) => s + (Number(e.montantTTC) || 0), 0);
  }, [expenses]);

  const dossierIndex = useMemo(() => {
    const idx = {};
    for (const d of dossiers) {
      idx[String(d._id)] = d.dossier?.dossier?.nom || d.dossier?.nom || d.reference || d._id.slice(-6);
    }
    return idx;
  }, [dossiers]);

  const categorieLabel = (code) => {
    const c = (constants?.categoriesDepenses || []).find(c => c.code === code);
    return c ? `${c.icone} ${c.label}` : code;
  };

  const handleEdit = (expense) => {
    setModalInitial(expense);
    setModalOpen(true);
  };

  const handleDelete = async (expense) => {
    const ok = await confirm({
      title: 'Supprimer la depense ?',
      message: `Supprimer la depense "${expense.libelle}" du ${formatDate(expense.date)} ?`,
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      danger: true,
    });
    if (!ok) return;
    await cabinetApi.deleteExpense(expense._id);
    dispatch(removeExpenseLocal(expense._id));
  };

  const handleExport = async () => {
    try {
      const blob = await cabinetApi.exportCsv(
        range.from ? range.from.toISOString().slice(0, 10) : '',
        range.to ? range.to.toISOString().slice(0, 10) : '',
      );
      downloadBlob(blob, `depenses_cabinet_${range.from ? range.from.toISOString().slice(0, 10) : 'debut'}_${range.to ? range.to.toISOString().slice(0, 10) : 'fin'}.csv`);
    } catch (e) {
      toast.error('Erreur a l\'export : ' + (e.message || e));
    }
  };

  return (
    <div className={embedded ? '' : 'k-cab-root'}>
      <div className="k-cab-section">
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
                <input
                  type="date"
                  value={customRange.from}
                  onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))}
                />
                <span>au</span>
                <input
                  type="date"
                  value={customRange.to}
                  onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))}
                />
              </>
            )}
            <select value={filterCategorie} onChange={e => setFilterCategorie(e.target.value)}>
              <option value="all">Toutes categories</option>
              {(constants?.categoriesDepenses || []).map(c => (
                <option key={c.code} value={c.code}>{c.icone} {c.label}</option>
              ))}
            </select>
            <select value={filterDossier} onChange={e => setFilterDossier(e.target.value)}>
              <option value="all">Tous dossiers</option>
              {dossiers.map(d => (
                <option key={d._id} value={d._id}>
                  {d.dossier?.dossier?.nom || d.dossier?.nom || d.reference}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="k-cab-btn k-cab-btn-secondary" onClick={handleExport} disabled={!expenses.length}>
              ⬇ Exporter CSV
            </button>
            <button className="k-cab-btn k-cab-btn-primary" onClick={() => { setModalInitial(null); setModalOpen(true); }}>
              + Nouvelle depense
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.85rem', color: '#4b5563' }}>
          <div>
            {expenses.length} depense(s) sur la periode
          </div>
          <div style={{ fontWeight: 600, color: '#b45309', fontSize: '1rem' }}>
            Total TTC : {formatMontant(total)}
          </div>
        </div>

        {loading ? (
          <div className="k-cab-empty">Chargement...</div>
        ) : expenses.length === 0 ? (
          <div className="k-cab-empty">
            Aucune depense sur la periode.
            <div style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
              Cliquez sur "+ Nouvelle depense" pour enregistrer votre premiere depense.
            </div>
          </div>
        ) : (
          <table className="k-cab-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Libelle</th>
                <th>Categorie</th>
                <th>Fournisseur</th>
                <th>Dossier</th>
                <th className="col-amount">HT</th>
                <th className="col-amount">TTC</th>
                <th>TVA ded.</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => (
                <tr key={e._id}>
                  <td>{formatDate(e.date)}</td>
                  <td style={{ fontWeight: 500 }}>{e.libelle}</td>
                  <td>{categorieLabel(e.categorie)}</td>
                  <td>{e.fournisseurNom || '—'}</td>
                  <td>{e.dossierId ? dossierIndex[String(e.dossierId)] || '?' : '—'}</td>
                  <td className="col-amount">{formatMontant(e.montantHT)}</td>
                  <td className="col-amount">{formatMontant(e.montantTTC)}</td>
                  <td><span className={`k-cab-pastille ${e.tvaDeductible ? 'auto' : 'manuel'}`}>{e.tvaDeductible ? 'Oui' : 'Non'}</span></td>
                  <td style={{ display: 'flex', gap: '0.3rem' }}>
                    <button className="k-cab-btn k-cab-btn-ghost" onClick={() => handleEdit(e)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}>
                      Editer
                    </button>
                    <button className="k-cab-btn k-cab-btn-danger" onClick={() => handleDelete(e)} style={{ padding: '0.3rem 0.5rem', fontSize: '0.78rem' }}>
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <CabinetExpenseModal
          open={modalOpen}
          initialExpense={modalInitial}
          onClose={() => { setModalOpen(false); setModalInitial(null); }}
        />
      )}
    </div>
  );
};

export default CabinetExpenseList;
