// client/src/components/carpa/CarpaDossierPanel.js
//
// Panneau CARPA d'un dossier : liste des operations de l'affaire,
// totaux, bouton de creation, ouverture en detail.
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchCarpaConstants,
  fetchOperationsForDossier,
} from '../../redux/slices/carpaSlice';
import {
  ETAT_LABELS,
  etatClass,
  formatDate,
  formatMontant,
  beneficiaireResume,
} from './carpaHelpers';
import CarpaOperationModal from './CarpaOperationModal';
import CarpaOperationDetail from './CarpaOperationDetail';
import './carpa.css';

const CarpaDossierPanel = () => {
  const dispatch = useDispatch();
  const currentDossier = useSelector((s) => s.currentDossier?.dossier);
  const constants = useSelector((s) => s.carpa.constants);
  const dossierId = currentDossier?._id;
  const operations = useSelector((s) => (dossierId ? s.carpa.operationsByDossier[String(dossierId)] : null)) || [];
  const loading = useSelector((s) => (dossierId ? s.carpa.loadingByDossier[String(dossierId)] : false));

  const [filterSens, setFilterSens] = useState('all');
  const [filterEtat, setFilterEtat] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState(null);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    if (!constants) dispatch(fetchCarpaConstants());
  }, [constants, dispatch]);

  useEffect(() => {
    if (dossierId) dispatch(fetchOperationsForDossier(dossierId));
  }, [dossierId, dispatch]);

  const filtered = useMemo(() => {
    return operations.filter(op => {
      if (filterSens !== 'all' && op.sens !== filterSens) return false;
      if (filterEtat !== 'all' && op.etat !== filterEtat) return false;
      return true;
    });
  }, [operations, filterSens, filterEtat]);

  const totaux = useMemo(() => {
    const totEntrees = operations
      .filter(o => o.sens === 'entree' && o.etat !== 'annule')
      .reduce((s, o) => s + (o.montant || 0), 0);
    const totSorties = operations
      .filter(o => o.sens === 'sortie' && o.etat !== 'annule' && o.etat !== 'compte_special_bloque')
      .reduce((s, o) => s + (o.montant || 0), 0);
    const enAttente = operations.filter(o => ['recu_cabinet', 'depose_carpa', 'controle_carpa', 'instruit_retrait'].includes(o.etat)).length;
    const honoraires = operations.filter(o => o.estHonoraires && o.etat === 'restitue').reduce((s, o) => s + (o.montant || 0), 0);
    return { totEntrees, totSorties, enAttente, honoraires };
  }, [operations]);

  const openCreate = (sens = 'entree') => {
    setModalInitial(null);
    setModalOpen(sens);
  };

  const openEdit = (op) => {
    setDetailId(null);
    setModalInitial(op);
    setModalOpen(op.sens);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalInitial(null);
  };

  if (!dossierId) {
    return (
      <div className="k-carpa-empty">
        Selectionnez un dossier pour gerer ses operations CARPA.
      </div>
    );
  }

  return (
    <div className="k-carpa-root">
      {/* Totaux */}
      <div className="k-carpa-totaux-grid">
        <div className="k-carpa-totaux-card">
          <span className="k-carpa-totaux-label">Total entrees CARPA</span>
          <span className="k-carpa-totaux-value">{formatMontant(totaux.totEntrees)}</span>
          <span className="k-carpa-totaux-sub">{operations.filter(o => o.sens === 'entree' && o.etat !== 'annule').length} operation(s)</span>
        </div>
        <div className="k-carpa-totaux-card alt">
          <span className="k-carpa-totaux-label">Total sorties CARPA</span>
          <span className="k-carpa-totaux-value">{formatMontant(totaux.totSorties)}</span>
          <span className="k-carpa-totaux-sub">{operations.filter(o => o.sens === 'sortie' && !['annule', 'compte_special_bloque'].includes(o.etat)).length} operation(s)</span>
        </div>
        <div className="k-carpa-totaux-card warn">
          <span className="k-carpa-totaux-label">En attente</span>
          <span className="k-carpa-totaux-value">{totaux.enAttente}</span>
          <span className="k-carpa-totaux-sub">a finaliser</span>
        </div>
        <div className="k-carpa-totaux-card" style={{ background: 'linear-gradient(135deg, #047857, #065f46)' }}>
          <span className="k-carpa-totaux-label">Honoraires preleves</span>
          <span className="k-carpa-totaux-value">{formatMontant(totaux.honoraires)}</span>
          <span className="k-carpa-totaux-sub">via CARPA</span>
        </div>
      </div>

      <div className="k-carpa-section">
        <div className="k-carpa-toolbar">
          <div className="filters">
            <select value={filterSens} onChange={e => setFilterSens(e.target.value)}>
              <option value="all">Tous les sens</option>
              <option value="entree">Entrees uniquement</option>
              <option value="sortie">Sorties uniquement</option>
            </select>
            <select value={filterEtat} onChange={e => setFilterEtat(e.target.value)}>
              <option value="all">Tous les etats</option>
              {Object.entries(ETAT_LABELS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="k-carpa-btn k-carpa-btn-secondary" onClick={() => openCreate('entree')}>
              + Nouvelle entree
            </button>
            <button className="k-carpa-btn k-carpa-btn-primary" onClick={() => openCreate('sortie')}>
              + Nouvelle sortie
            </button>
          </div>
        </div>

        {loading ? (
          <div className="k-carpa-empty">Chargement...</div>
        ) : filtered.length === 0 ? (
          <div className="k-carpa-empty">
            Aucune operation CARPA pour ce dossier.
            <div style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
              Utilisez les boutons ci-dessus pour enregistrer le premier depot ou retrait.
            </div>
          </div>
        ) : (
          <table className="k-carpa-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Sens</th>
                <th>Type</th>
                <th>Beneficiaire / Payeur</th>
                <th>Etat</th>
                <th className="col-amount">Montant</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(op => (
                <tr key={op._id} onClick={() => setDetailId(op._id)}>
                  <td>{formatDate(op.dateOperation)}</td>
                  <td>
                    <span className={`k-carpa-pastille ${op.sens === 'entree' ? 'k-carpa-pastille-sens-entree' : 'k-carpa-pastille-sens-sortie'}`}>
                      {op.sens === 'entree' ? 'Entree' : 'Sortie'}
                    </span>
                  </td>
                  <td>
                    {constants?.typeLabels?.[op.type] || op.type}
                    {op.estHonoraires && <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: '#92400e' }}>· honoraires</span>}
                  </td>
                  <td>
                    {op.sens === 'entree'
                      ? (op.payeurNom || beneficiaireResume(op.beneficiaireSnapshot, op.beneficiaireContactId))
                      : beneficiaireResume(op.beneficiaireSnapshot, op.beneficiaireContactId)}
                  </td>
                  <td>
                    <span className={`k-carpa-pastille ${etatClass(op.etat)}`}>{ETAT_LABELS[op.etat] || op.etat}</span>
                    {(op.flagsLcbft || []).some(f => !f.leveeLe) && (
                      <span className="k-carpa-flag" style={{ marginLeft: '0.35rem' }}>LCB-FT</span>
                    )}
                  </td>
                  <td className="col-amount">{formatMontant(op.montant, op.devise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <CarpaOperationModal
          open={!!modalOpen}
          dossierId={dossierId}
          initialOperation={modalInitial}
          initialSens={modalOpen}
          onClose={(_op) => closeModal()}
        />
      )}

      {detailId && (
        <CarpaOperationDetail
          open={!!detailId}
          operationId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={openEdit}
        />
      )}
    </div>
  );
};

export default CarpaDossierPanel;
