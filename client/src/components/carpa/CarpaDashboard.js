// client/src/components/carpa/CarpaDashboard.js
//
// Dashboard global CARPA accessible depuis la sidebar.
// Onglets :
//  1. Beneficiaires : groupes par beneficiaire avec totaux et operations
//  2. Honoraires    : section dediee aux prelevements d'honoraires du cabinet
//  3. Alertes       : tous les points d'attention (fonds non deposes, pieces manquantes...)
//  4. Statistiques  : totaux annuels (entrees/sorties/honoraires)
//  5. Reconciliation: import CSV e-Carpa
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  fetchCarpaConstants,
  fetchCarpaDashboard,
  fetchCarpaStats,
} from '../../redux/slices/carpaSlice';
import { setCurrentDossier } from '../../redux/slices/currentDossierSlice';
import {
  formatDate,
  formatMontant,
  beneficiaireResume,
  ETAT_LABELS,
  etatClass,
  severiteClass,
} from './carpaHelpers';
import CarpaOperationDetail from './CarpaOperationDetail';
import CarpaClientReport from './CarpaClientReport';
import { printArea } from './carpaPrintHelpers';
import carpaApi from '../../services/carpaService';
import { useToast } from '../common/notifications/useToast';
import { useConfirm } from '../common/notifications/ConfirmProvider';
import './carpa.css';

const CarpaDashboard = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const dashboard = useSelector((s) => s.carpa.dashboard);
  const loadingDashboard = useSelector((s) => s.carpa.loadingDashboard);
  const errorDashboard = useSelector((s) => s.carpa.errorDashboard);
  const constants = useSelector((s) => s.carpa.constants);
  const stats = useSelector((s) => s.carpa.stats);
  const loadingStats = useSelector((s) => s.carpa.loadingStats);

  const [activeTab, setActiveTab] = useState('beneficiaires');
  const [expanded, setExpanded] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  const [printGroupe, setPrintGroupe] = useState(null);
  // Filtre visuel : par defaut on masque les operations annulees pour ne
  // pas polluer la liste. Le toggle dans la toolbar permet de les reafficher
  // (l'audit reste accessible quoi qu'il arrive cote serveur).
  const [hideAnnulees, setHideAnnulees] = useState(true);
  const [actionPending, setActionPending] = useState(null);  // operation _id en cours d'action

  // Reconciliation
  const [csvText, setCsvText] = useState('');
  const [csvResult, setCsvResult] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState('');

  // Stats
  const currentYear = new Date().getFullYear();
  const [statsAnnee, setStatsAnnee] = useState(currentYear);

  useEffect(() => {
    if (!constants) dispatch(fetchCarpaConstants());
    dispatch(fetchCarpaDashboard());
  }, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'stats') {
      dispatch(fetchCarpaStats(statsAnnee));
    }
  }, [activeTab, statsAnnee, dispatch]);

  const beneficiaires = dashboard?.beneficiaires || [];
  const honoraires = dashboard?.honoraires || { enAttente: 0, perçus: 0, operations: [] };
  const alertes = dashboard?.alertes || [];
  const totaux = dashboard?.totaux || {};
  const dossierIndex = dashboard?.dossierIndex || {};

  const toggleGroup = (cle) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(cle)) next.delete(cle); else next.add(cle);
      return next;
    });
  };

  const printRecap = (groupe) => {
    setPrintGroupe(groupe);
    setTimeout(() => {
      printArea('.k-carpa-print-area');
      setTimeout(() => setPrintGroupe(null), 1500);
    }, 80);
  };

  // ----- Annulation et suppression d'operations -----

  const handleAnnuler = async (op, e) => {
    if (e) e.stopPropagation();
    const benefLabel = beneficiaireResume(op.beneficiaireSnapshot, op.beneficiaireContactId);
    const confirmed = await confirm({
      title: 'Annuler cette operation ?',
      message:
        `${benefLabel}\n` +
        `${formatMontant(op.montant, op.devise)}\n\n` +
        `L'operation passera a l'etat "annule" mais restera consultable ` +
        `(la trace est conservee dans le journal d'audit CARPA, comme l'exige la reglementation).`,
      confirmLabel: 'Annuler l\'operation',
      cancelLabel: 'Retour',
      danger: true,
    });
    if (!confirmed) return;
    setActionPending(op._id);
    try {
      await carpaApi.transitionOperation(op._id, 'annule', { motif: 'Annulee depuis la liste' });
      dispatch(fetchCarpaDashboard());
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Erreur inconnue';
      toast.error(`Impossible d'annuler : ${msg}`);
    } finally {
      setActionPending(null);
    }
  };

  const handleSupprimer = async (op, e) => {
    if (e) e.stopPropagation();
    if (op.etat !== 'brouillon') {
      toast.warning(
        `Suppression definitive impossible : cette operation est en etat "${op.etat}". ` +
        `Seuls les brouillons (jamais valides) peuvent etre effaces sans laisser de trace operationnelle. ` +
        `Pour les autres operations, utilise le bouton "Annuler" : la trace est conservee pour l'audit CARPA.`
      );
      return;
    }
    const benefLabel = beneficiaireResume(op.beneficiaireSnapshot, op.beneficiaireContactId);
    const confirmed = await confirm({
      title: 'Supprimer DEFINITIVEMENT ce brouillon ?',
      message:
        `${benefLabel}\n` +
        `${formatMontant(op.montant, op.devise)}\n\n` +
        `Cette action est irreversible. Elle est autorisee uniquement parce que ` +
        `l'operation est encore en etat "brouillon" (jamais validee, sans existence legale).`,
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      danger: true,
    });
    if (!confirmed) return;
    setActionPending(op._id);
    try {
      await carpaApi.deleteOperation(op._id);
      dispatch(fetchCarpaDashboard());
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Erreur inconnue';
      toast.error(`Suppression impossible : ${msg}`);
    } finally {
      setActionPending(null);
    }
  };

  const goToDossier = (dossierId) => {
    if (!dossierId) return;
    // Charger le dossier dans le state puis naviguer
    // (on utilise setCurrentDossier sur l'index du dashboard, qui contient
    // au minimum reference + nom)
    const d = dossierIndex[String(dossierId)];
    if (d) dispatch(setCurrentDossier(d));
    navigate('/dashboard/dossier');
  };

  const importerCsv = async () => {
    if (!csvText.trim()) return;
    setCsvLoading(true);
    setCsvError('');
    setCsvResult(null);
    try {
      const data = await carpaApi.importCsv(csvText);
      setCsvResult(data);
      dispatch(fetchCarpaDashboard());
    } catch (e) {
      setCsvError(e?.response?.data?.message || e.message);
    } finally {
      setCsvLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Onglet 1 : Beneficiaires
  // ------------------------------------------------------------------
  const renderBeneficiaires = () => (
    <div>
      {beneficiaires.length === 0 ? (
        <div className="k-carpa-empty">
          Aucune operation CARPA enregistree.
          <div style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
            Creez votre premiere operation depuis l'onglet "CARPA" d'un dossier.
          </div>
        </div>
      ) : (
        beneficiaires.map(g => {
          const isExpanded = expanded.has(g.cle);
          const solde = (g.totalEntrees || 0) - (g.totalSorties || 0);
          return (
            <div key={g.cle} className="k-carpa-benef-group">
              <div className="k-carpa-benef-header" onClick={() => toggleGroup(g.cle)}>
                <div>
                  <div className="k-carpa-benef-name">
                    {beneficiaireResume(g.snapshot, g.beneficiaireContactId)}
                  </div>
                  <div className="k-carpa-benef-summary">
                    {g.operations.length} operation(s) ·{' '}
                    {g.nbEnAttente > 0 && <span style={{ color: '#92400e' }}>{g.nbEnAttente} en attente · </span>}
                    {g.nbBloquees > 0 && <span style={{ color: '#991b1b' }}>{g.nbBloquees} bloquee(s) · </span>}
                    Total recu : {formatMontant(g.totalEntrees)}, restitue : {formatMontant(g.totalSorties)}
                  </div>
                </div>
                <div className="k-carpa-benef-balance" title="Solde estimatif (entrees - sorties)">
                  {formatMontant(solde)}
                </div>
                <button
                  className="k-carpa-btn k-carpa-btn-ghost"
                  onClick={(e) => { e.stopPropagation(); printRecap(g); }}
                  title="Imprimer un recapitulatif pour le client"
                >
                  Imprimer
                </button>
                <button className="k-carpa-btn k-carpa-btn-ghost" onClick={(e) => { e.stopPropagation(); toggleGroup(g.cle); }}>
                  {isExpanded ? '−' : '+'}
                </button>
              </div>

              {isExpanded && (() => {
                const opsAffichees = hideAnnulees
                  ? g.operations.filter(o => o.etat !== 'annule')
                  : g.operations;
                const nbMasquees = g.operations.length - opsAffichees.length;
                return (
                  <div className="k-carpa-benef-content">
                    {nbMasquees > 0 && (
                      <div className="k-carpa-hidden-note">
                        {nbMasquees} operation(s) annulee(s) masquee(s).{' '}
                        <button
                          type="button"
                          className="k-carpa-link-btn"
                          onClick={(e) => { e.stopPropagation(); setHideAnnulees(false); }}
                        >
                          Tout afficher
                        </button>
                      </div>
                    )}
                    {opsAffichees.map(op => {
                      const dossier = dossierIndex[String(op.dossierId)];
                      const isPending = actionPending === op._id;
                      const isAnnule = op.etat === 'annule';
                      const canDelete = op.etat === 'brouillon';
                      const canCancel = op.etat !== 'annule';
                      return (
                        <div key={op._id} className={`k-carpa-op-card ${isAnnule ? 'is-annulee' : ''}`} onClick={() => setDetailId(op._id)}>
                          <span className={`k-carpa-pastille ${etatClass(op.etat)}`}>{ETAT_LABELS[op.etat] || op.etat}</span>
                          <div className="meta">
                            <div style={{ fontWeight: 500 }}>
                              {constants?.typeLabels?.[op.type] || op.type}
                            </div>
                            <div className="meta-line">
                              <span>{formatDate(op.dateOperation)}</span>
                              {dossier && (
                                <>
                                  <span>·</span>
                                  <span
                                    style={{ color: '#1e40af', cursor: 'pointer', textDecoration: 'underline' }}
                                    onClick={(e) => { e.stopPropagation(); goToDossier(op.dossierId); }}
                                  >
                                    {dossier.nom || dossier.reference}
                                  </span>
                                </>
                              )}
                              {(op.flagsLcbft || []).some(f => !f.leveeLe) && (
                                <span className="k-carpa-flag">LCB-FT</span>
                              )}
                            </div>
                          </div>
                          <span className={`montant ${op.sens === 'entree' ? 'entree' : 'sortie'}`}>
                            {op.sens === 'entree' ? '+' : '−'} {formatMontant(op.montant, op.devise)}
                          </span>
                          <div className="k-carpa-op-actions" onClick={(e) => e.stopPropagation()}>
                            {canCancel && (
                              <button
                                type="button"
                                className="k-carpa-icon-btn k-carpa-icon-btn-cancel"
                                onClick={(e) => handleAnnuler(op, e)}
                                disabled={isPending}
                                title="Annuler l'operation (etat → annule, conserve dans l'audit)"
                                aria-label="Annuler l'operation"
                              >
                                ⊘
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                className="k-carpa-icon-btn k-carpa-icon-btn-delete"
                                onClick={(e) => handleSupprimer(op, e)}
                                disabled={isPending}
                                title="Supprimer ce brouillon definitivement"
                                aria-label="Supprimer ce brouillon"
                              >
                                🗑
                              </button>
                            )}
                          </div>
                          <span style={{ color: '#9ca3af' }}>›</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })
      )}
    </div>
  );

  // ------------------------------------------------------------------
  // Onglet 2 : Honoraires
  // ------------------------------------------------------------------
  const renderHonoraires = () => (
    <div>
      <div className="k-carpa-totaux-grid" style={{ marginBottom: '1rem' }}>
        <div className="k-carpa-totaux-card alt">
          <span className="k-carpa-totaux-label">Honoraires en attente</span>
          <span className="k-carpa-totaux-value">{formatMontant(honoraires.enAttente || 0)}</span>
          <span className="k-carpa-totaux-sub">a prelever via CARPA</span>
        </div>
        <div className="k-carpa-totaux-card" style={{ background: 'linear-gradient(135deg, #047857, #065f46)' }}>
          <span className="k-carpa-totaux-label">Honoraires preleves</span>
          <span className="k-carpa-totaux-value">{formatMontant(honoraires.perçus || 0)}</span>
          <span className="k-carpa-totaux-sub">{(honoraires.operations || []).filter(o => o.etat === 'restitue').length} operation(s)</span>
        </div>
      </div>

      {(() => {
        const opsAll = honoraires.operations || [];
        const opsAffichees = hideAnnulees ? opsAll.filter(o => o.etat !== 'annule') : opsAll;
        const nbMasquees = opsAll.length - opsAffichees.length;
        if (opsAll.length === 0) {
          return <div className="k-carpa-empty">Aucun prelevement d'honoraires CARPA enregistre.</div>;
        }
        return (
          <>
            {nbMasquees > 0 && (
              <div className="k-carpa-hidden-note" style={{ marginBottom: '0.5rem' }}>
                {nbMasquees} operation(s) annulee(s) masquee(s).{' '}
                <button type="button" className="k-carpa-link-btn" onClick={() => setHideAnnulees(false)}>
                  Tout afficher
                </button>
              </div>
            )}
            <table className="k-carpa-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Affaire</th>
                  <th>Etat</th>
                  <th className="col-amount">Montant</th>
                  <th className="col-actions" aria-label="Actions">&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {opsAffichees.map(op => {
                  const dossier = dossierIndex[String(op.dossierId)];
                  const isPending = actionPending === op._id;
                  const isAnnule = op.etat === 'annule';
                  const canDelete = op.etat === 'brouillon';
                  const canCancel = op.etat !== 'annule';
                  return (
                    <tr key={op._id} className={isAnnule ? 'is-annulee' : ''} onClick={() => setDetailId(op._id)}>
                      <td>{formatDate(op.dateOperation)}</td>
                      <td>{dossier?.nom || dossier?.reference || '—'}</td>
                      <td><span className={`k-carpa-pastille ${etatClass(op.etat)}`}>{ETAT_LABELS[op.etat] || op.etat}</span></td>
                      <td className="col-amount">{formatMontant(op.montant, op.devise)}</td>
                      <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                        <div className="k-carpa-op-actions">
                          {canCancel && (
                            <button
                              type="button"
                              className="k-carpa-icon-btn k-carpa-icon-btn-cancel"
                              onClick={(e) => handleAnnuler(op, e)}
                              disabled={isPending}
                              title="Annuler l'operation"
                              aria-label="Annuler l'operation"
                            >⊘</button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="k-carpa-icon-btn k-carpa-icon-btn-delete"
                              onClick={(e) => handleSupprimer(op, e)}
                              disabled={isPending}
                              title="Supprimer ce brouillon"
                              aria-label="Supprimer ce brouillon"
                            >🗑</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        );
      })()}
    </div>
  );

  // ------------------------------------------------------------------
  // Onglet 3 : Alertes
  // ------------------------------------------------------------------
  const renderAlertes = () => (
    <div className="k-carpa-alertes">
      {alertes.length === 0 ? (
        <div className="k-carpa-empty">
          Aucun point d'attention. Tout est en ordre.
        </div>
      ) : (
        alertes.map((a, idx) => (
          <div key={idx} className={`k-carpa-alerte ${severiteClass(a.severite)}`} onClick={() => setDetailId(a.operationId)}>
            <span className="k-carpa-alerte-icon">
              {a.severite === 'critique' ? '!' : a.severite === 'attention' ? '⚠' : 'ⓘ'}
            </span>
            <div>
              <div>{a.message}</div>
              <div className="k-carpa-alerte-conseil">{a.conseil}</div>
            </div>
            <button className="k-carpa-btn k-carpa-btn-ghost" onClick={(e) => { e.stopPropagation(); setDetailId(a.operationId); }}>
              Ouvrir
            </button>
          </div>
        ))
      )}
    </div>
  );

  // ------------------------------------------------------------------
  // Onglet 4 : Statistiques
  // ------------------------------------------------------------------
  const renderStats = () => {
    const annees = Array.from({ length: 5 }, (_, i) => currentYear - i);
    return (
      <div>
        <div className="k-carpa-toolbar">
          <div className="filters">
            <label style={{ fontSize: '0.85rem' }}>Annee :</label>
            <select value={statsAnnee} onChange={e => setStatsAnnee(Number(e.target.value))}>
              {annees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {loadingStats ? (
          <div className="k-carpa-empty">Chargement des statistiques...</div>
        ) : !stats ? (
          <div className="k-carpa-empty">Pas de donnees.</div>
        ) : (
          <>
            <div className="k-carpa-totaux-grid" style={{ marginBottom: '1rem' }}>
              <div className="k-carpa-totaux-card">
                <span className="k-carpa-totaux-label">Total entrees</span>
                <span className="k-carpa-totaux-value">{formatMontant(stats.totalEntrees)}</span>
              </div>
              <div className="k-carpa-totaux-card alt">
                <span className="k-carpa-totaux-label">Total sorties (hors honoraires)</span>
                <span className="k-carpa-totaux-value">{formatMontant(stats.totalSorties)}</span>
              </div>
              <div className="k-carpa-totaux-card" style={{ background: 'linear-gradient(135deg, #047857, #065f46)' }}>
                <span className="k-carpa-totaux-label">Honoraires preleves</span>
                <span className="k-carpa-totaux-value">{formatMontant(stats.totalHonoraires)}</span>
              </div>
              <div className="k-carpa-totaux-card warn">
                <span className="k-carpa-totaux-label">Operations</span>
                <span className="k-carpa-totaux-value">{stats.nbOperations}</span>
              </div>
            </div>

            <div className="k-carpa-section">
              <h4 className="k-carpa-section-title">Repartition mensuelle</h4>
              <table className="k-carpa-table">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th className="col-amount">Entrees</th>
                    <th className="col-amount">Sorties</th>
                    <th className="col-amount">Operations</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.parMois.map((m, idx) => {
                    const noms = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
                    return (
                      <tr key={idx}>
                        <td>{noms[idx]}</td>
                        <td className="col-amount">{formatMontant(m.entrees)}</td>
                        <td className="col-amount">{formatMontant(m.sorties)}</td>
                        <td className="col-amount">{m.count}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="k-carpa-section" style={{ marginTop: '0.75rem' }}>
              <h4 className="k-carpa-section-title">Repartition par type</h4>
              <table className="k-carpa-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th className="col-amount">Nombre</th>
                    <th className="col-amount">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.parType).map(([k, v]) => {
                    const [sens, type] = k.split('/');
                    const label = constants?.typeLabels?.[type] || type;
                    return (
                      <tr key={k}>
                        <td>
                          <span className={`k-carpa-pastille ${sens === 'entree' ? 'k-carpa-pastille-sens-entree' : 'k-carpa-pastille-sens-sortie'}`}>
                            {sens === 'entree' ? 'Entree' : 'Sortie'}
                          </span>{' '}
                          {label}
                        </td>
                        <td className="col-amount">{v.count}</td>
                        <td className="col-amount">{formatMontant(v.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };

  // ------------------------------------------------------------------
  // Onglet 5 : Reconciliation CSV
  // ------------------------------------------------------------------
  const renderReconciliation = () => (
    <div>
      <div className="k-carpa-section">
        <h4 className="k-carpa-section-title">Reconciliation avec un export e-Carpa</h4>
        <p className="k-carpa-section-subtitle">
          Exportez vos mouvements depuis e-Carpa au format CSV (separateur ; ou ,) puis collez le
          contenu ci-dessous. Le rapprochement se fait par reference e-Carpa, ou a defaut par
          (date, montant). Aucune connexion en ligne avec e-Carpa n'est etablie.
        </p>
        <p className="k-carpa-section-subtitle">
          Format attendu (header obligatoire) : <code>reference;date;sens;montant;libelle</code>
        </p>

        <textarea
          rows={8}
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
          placeholder="reference;date;sens;montant;libelle&#10;EC-2025-001;2025-12-04;entree;1500;Versement client"
          style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.82rem', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: 8 }}
        />

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <button className="k-carpa-btn k-carpa-btn-primary" onClick={importerCsv} disabled={!csvText.trim() || csvLoading}>
            {csvLoading ? 'Import en cours...' : 'Lancer la reconciliation'}
          </button>
          <button className="k-carpa-btn k-carpa-btn-ghost" onClick={() => { setCsvText(''); setCsvResult(null); setCsvError(''); }}>
            Reinitialiser
          </button>
        </div>

        {csvError && (
          <div className="k-carpa-alerte k-carpa-alerte-critique" style={{ marginTop: '0.6rem' }}>
            <span className="k-carpa-alerte-icon">!</span>
            <div>{csvError}</div>
          </div>
        )}

        {csvResult && (
          <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div className="k-carpa-alerte k-carpa-alerte-info">
              <span className="k-carpa-alerte-icon">ⓘ</span>
              <div>
                <strong>{csvResult.matched}</strong> operation(s) reconciliee(s),
                <strong> {csvResult.ecarts?.length || 0}</strong> ecart(s) detecte(s),
                <strong> {csvResult.nonAppariees?.length || 0}</strong> ligne(s) sans correspondance.
              </div>
            </div>
            {csvResult.nonAppariees?.length > 0 && (
              <div>
                <h5 style={{ fontSize: '0.85rem', margin: '0.5rem 0 0.3rem 0' }}>Lignes sans correspondance</h5>
                <table className="k-carpa-table">
                  <thead>
                    <tr><th>Reference</th><th>Date</th><th>Sens</th><th className="col-amount">Montant</th></tr>
                  </thead>
                  <tbody>
                    {csvResult.nonAppariees.map((l, idx) => (
                      <tr key={idx}>
                        <td>{l.ref}</td>
                        <td>{l.date}</td>
                        <td>{l.sens}</td>
                        <td className="col-amount">{formatMontant(l.montant)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="k-carpa-section-subtitle" style={{ marginTop: '0.4rem' }}>
                  Saisir manuellement ces operations dans Kheops 2 si elles correspondent a des mouvements reels,
                  ou completer le champ "reference e-Carpa" sur les operations existantes pour les apparier.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // ------------------------------------------------------------------
  return (
    <div className="k-carpa-root">
      <div className="k-carpa-totaux-grid">
        <div className="k-carpa-totaux-card">
          <span className="k-carpa-totaux-label">Fonds en transit (entrees actives)</span>
          <span className="k-carpa-totaux-value">{formatMontant(totaux.fondsEnTransitEntrees || 0)}</span>
        </div>
        <div className="k-carpa-totaux-card alt">
          <span className="k-carpa-totaux-label">Fonds a restituer (sorties actives)</span>
          <span className="k-carpa-totaux-value">{formatMontant(totaux.fondsEnTransitSorties || 0)}</span>
        </div>
        <div className="k-carpa-totaux-card warn">
          <span className="k-carpa-totaux-label">Operations actives</span>
          <span className="k-carpa-totaux-value">{totaux.nbOperationsActives || 0}</span>
          <span className="k-carpa-totaux-sub">/ {totaux.nbOperations || 0} au total</span>
        </div>
        <div className="k-carpa-totaux-card" style={{ background: 'linear-gradient(135deg, #b91c1c, #991b1b)' }}>
          <span className="k-carpa-totaux-label">Alertes en cours</span>
          <span className="k-carpa-totaux-value">{alertes.length}</span>
          <span className="k-carpa-totaux-sub">a traiter</span>
        </div>
      </div>

      <div className="k-carpa-section">
        <div className="k-carpa-tabs-row">
          <div className="k-carpa-tabs">
            {[
              { code: 'beneficiaires', label: 'Par beneficiaire' },
              { code: 'honoraires', label: 'Honoraires (cabinet)' },
              { code: 'alertes', label: `Alertes${alertes.length ? ` (${alertes.length})` : ''}` },
              { code: 'stats', label: 'Statistiques' },
              { code: 'reconciliation', label: 'Reconciliation e-Carpa' },
            ].map(t => (
              <div
                key={t.code}
                className={`k-carpa-tab ${activeTab === t.code ? 'active' : ''}`}
                onClick={() => setActiveTab(t.code)}
                role="tab"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveTab(t.code); }}
              >
                {t.label}
              </div>
            ))}
          </div>
          {(activeTab === 'beneficiaires' || activeTab === 'honoraires') && (
            <label
              className="k-carpa-toggle"
              title="Les operations annulees restent en base et accessibles via l'audit, elles sont juste masquees de la liste."
            >
              <input
                type="checkbox"
                checked={hideAnnulees}
                onChange={(e) => setHideAnnulees(e.target.checked)}
              />
              <span>Masquer les operations annulees</span>
            </label>
          )}
        </div>

        {loadingDashboard && !dashboard && <div className="k-carpa-empty">Chargement...</div>}
        {errorDashboard && (
          <div className="k-carpa-alerte k-carpa-alerte-critique">
            <span className="k-carpa-alerte-icon">!</span>
            <div>{errorDashboard}</div>
          </div>
        )}

        {!loadingDashboard && (
          <>
            {activeTab === 'beneficiaires' && renderBeneficiaires()}
            {activeTab === 'honoraires' && renderHonoraires()}
            {activeTab === 'alertes' && renderAlertes()}
            {activeTab === 'stats' && renderStats()}
            {activeTab === 'reconciliation' && renderReconciliation()}
          </>
        )}
      </div>

      {detailId && (
        <CarpaOperationDetail
          open={!!detailId}
          operationId={detailId}
          onClose={() => { setDetailId(null); dispatch(fetchCarpaDashboard()); }}
        />
      )}

      {printGroupe && <CarpaClientReport groupe={printGroupe} dossierIndex={dossierIndex} />}
    </div>
  );
};

export default CarpaDashboard;
