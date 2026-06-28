// client/src/components/cabinet/CabinetRecurringExpenseList.js
//
// Liste des depenses recurrentes (templates) avec :
//  - bouton "Sweep automatique" pour generer toutes les occurrences dues
//  - bouton "Generer maintenant" sur chaque ligne (auto ou manuel)
//  - edition / suppression
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchRecurrences,
  fetchExpenses,
  fetchBilan,
  sweepRecurrences,
  removeRecurrenceLocal,
  upsertExpenseLocal,
  upsertRecurrenceLocal,
} from '../../redux/slices/cabinetSlice';
import cabinetApi from '../../services/cabinetService';
import CabinetRecurringExpenseModal from './CabinetRecurringExpenseModal';
import { formatMontant, formatDate } from './cabinetHelpers';
import { useToast } from '../common/notifications/useToast';
import { useConfirm } from '../common/notifications/ConfirmProvider';
import './cabinet.css';

const CabinetRecurringExpenseList = () => {
  const dispatch = useDispatch();
  const toast = useToast();
  const confirm = useConfirm();
  const recurrences = useSelector(s => s.cabinet.recurrences);
  const loading = useSelector(s => s.cabinet.loadingRecurrences);
  const constants = useSelector(s => s.cabinet.constants);
  const dossiers = useSelector(s => s.last25Dossiers?.lastDossiers || []);
  const lastSweep = useSelector(s => s.cabinet.lastSweep);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState(null);
  const [sweepInProgress, setSweepInProgress] = useState(false);

  useEffect(() => {
    dispatch(fetchRecurrences());
  }, [dispatch]);

  const categorieLabel = (code) => {
    const c = (constants?.categoriesDepenses || []).find(c => c.code === code);
    return c ? `${c.icone} ${c.label}` : code;
  };

  const dossierLabel = (id) => {
    if (!id) return '—';
    const d = dossiers.find(x => String(x._id) === String(id));
    return d ? (d.dossier?.dossier?.nom || d.dossier?.nom || d.reference) : '?';
  };

  const handleSweep = async () => {
    setSweepInProgress(true);
    try {
      const result = await dispatch(sweepRecurrences()).unwrap();
      // Refresh expenses + recurrences + bilan
      dispatch(fetchRecurrences());
      dispatch(fetchExpenses({}));
      dispatch(fetchBilan({}));
      toast.success(`${result.generated || 0} occurrence(s) generee(s) automatiquement.`);
    } catch (e) {
      toast.error('Erreur sweep : ' + e);
    } finally {
      setSweepInProgress(false);
    }
  };

  const handleGenerateOne = async (rec) => {
    const ok = await confirm({
      title: 'Generer une occurrence ?',
      message: `Generer une occurrence de "${rec.libelle}" maintenant ?`,
      confirmLabel: 'Generer',
      cancelLabel: 'Annuler',
      danger: false,
    });
    if (!ok) return;
    try {
      const resp = await cabinetApi.generateRecurrence(rec._id);
      if (resp.expense) dispatch(upsertExpenseLocal(resp.expense));
      if (resp.recurrence) dispatch(upsertRecurrenceLocal(resp.recurrence));
      dispatch(fetchBilan({}));
    } catch (e) {
      toast.error('Erreur : ' + (e.message || e));
    }
  };

  const handleEdit = (rec) => {
    setModalInitial(rec);
    setModalOpen(true);
  };

  const handleDelete = async (rec) => {
    const ok = await confirm({
      title: 'Supprimer la recurrence ?',
      message: `Supprimer la recurrence "${rec.libelle}" ?\n\nLes depenses deja generees a partir de cette recurrence ne seront pas supprimees.`,
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      danger: true,
    });
    if (!ok) return;
    await cabinetApi.deleteRecurrence(rec._id);
    dispatch(removeRecurrenceLocal(rec._id));
  };

  const totalMensuelEstime = recurrences
    .filter(r => r.active)
    .reduce((sum, r) => {
      const ttc = Number(r.montantTTC) || 0;
      const intervalle = { mensuelle: 1, trimestrielle: 3, semestrielle: 6, annuelle: 12 }[r.frequence] || 1;
      return sum + (ttc / intervalle);
    }, 0);

  return (
    <div>
      <div className="k-cab-toolbar">
        <div className="filters">
          <span style={{ fontSize: '0.85rem', color: '#4b5563' }}>
            {recurrences.length} recurrence(s) — Charge mensuelle estimee : <strong>{formatMontant(totalMensuelEstime)}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="k-cab-btn k-cab-btn-secondary" onClick={handleSweep} disabled={sweepInProgress}>
            {sweepInProgress ? 'Sweep en cours...' : '⚡ Generer toutes les occurrences dues'}
          </button>
          <button className="k-cab-btn k-cab-btn-primary" onClick={() => { setModalInitial(null); setModalOpen(true); }}>
            + Nouvelle recurrence
          </button>
        </div>
      </div>

      {lastSweep && lastSweep.generated > 0 && (
        <div className="k-cab-section" style={{ background: '#ecfdf5', borderColor: '#34d399', color: '#065f46', marginBottom: '0.75rem' }}>
          <strong>{lastSweep.generated}</strong> occurrence(s) generee(s) lors du dernier sweep.
        </div>
      )}

      {loading ? (
        <div className="k-cab-empty">Chargement...</div>
      ) : recurrences.length === 0 ? (
        <div className="k-cab-empty">
          Aucune depense recurrente.
          <div style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
            Creez une recurrence pour automatiser la saisie de vos charges fixes (loyer, salaires, abonnements...).
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {recurrences.map(rec => (
            <div key={rec._id} className="k-cab-item-card">
              <span className="icon-cell">
                {(constants?.categoriesDepenses || []).find(c => c.code === rec.categorie)?.icone || '📝'}
              </span>
              <div className="meta">
                <div style={{ fontWeight: 600 }}>
                  {rec.libelle}
                  {!rec.active && <span className="k-cab-pastille inactif" style={{ marginLeft: '0.5rem' }}>Suspendue</span>}
                </div>
                <div className="meta-line">
                  <span>{categorieLabel(rec.categorie)}</span>
                  <span>·</span>
                  <span>{rec.frequence}</span>
                  {rec.dossierId && <><span>·</span><span>{dossierLabel(rec.dossierId)}</span></>}
                </div>
                <div className="meta-line" style={{ color: '#6b7280' }}>
                  Prochaine echeance : {rec.prochaineGenerationLe ? formatDate(rec.prochaineGenerationLe) : '— (terminee)'}
                  {' · '}
                  Depuis : {formatDate(rec.dateDebut)}
                  {rec.dateFin && <> · Jusqu'au : {formatDate(rec.dateFin)}</>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                <span className="montant">{formatMontant(rec.montantTTC)}</span>
                <span className={`k-cab-pastille ${rec.automatique ? 'auto' : 'manuel'}`}>
                  {rec.automatique ? '⚡ Automatique' : '✋ Manuel'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button
                  className="k-cab-btn k-cab-btn-success"
                  onClick={() => handleGenerateOne(rec)}
                  title="Generer une occurrence maintenant"
                  style={{ padding: '0.35rem 0.55rem', fontSize: '0.78rem' }}
                  disabled={!rec.active}
                >
                  Generer
                </button>
                <button
                  className="k-cab-btn k-cab-btn-ghost"
                  onClick={() => handleEdit(rec)}
                  style={{ padding: '0.35rem 0.55rem', fontSize: '0.78rem' }}
                >
                  Editer
                </button>
                <button
                  className="k-cab-btn k-cab-btn-danger"
                  onClick={() => handleDelete(rec)}
                  style={{ padding: '0.35rem 0.55rem', fontSize: '0.78rem' }}
                >
                  Suppr.
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <CabinetRecurringExpenseModal
          open={modalOpen}
          initialRecurrence={modalInitial}
          onClose={() => { setModalOpen(false); setModalInitial(null); }}
        />
      )}
    </div>
  );
};

export default CabinetRecurringExpenseList;
