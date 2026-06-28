// client/src/components/carpa/CarpaOperationDetail.js
//
// Vue detaillee d'une operation : pieces justificatives, transitions
// d'etat, drapeaux LCB-FT, journal d'audit. Affichee dans une modale.
//
// Refonte rc59 : dark navy + stepper "Cycle de vie" + chips pieces + bandeau
// 3 stats. Adapte dynamiquement au sens (entree / sortie) et a la presence
// d'une branche compte_special pour les sorties.
import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import carpaApi from '../../services/carpaService';
import {
  ETAT_LABELS,
  etatClass,
  formatDate,
  formatDateTime,
  beneficiaireResume,
  isTerminale,
  transitionsDisponibles,
  piecesManquantesClient,
  piecesCompletesClient,
} from './carpaHelpers';
import {
  fetchCarpaDashboard,
  fetchOperationsForDossier,
  upsertOperationLocal,
} from '../../redux/slices/carpaSlice';
import './carpa.css';
import './carpaOperationDetail.css';

// ── Constantes locales ─────────────────────────────────────
// Ordre des etapes principales selon le sens. La branche `annule` est
// rajoutee separement en fin de stepper si applicable. La branche
// `compte_special_bloque` est intercalee dynamiquement pour les sorties
// si l'operation y est passee.
const ETAPES_ENTREE = [
  'brouillon',
  'recu_cabinet',
  'depose_carpa',
  'controle_carpa',
  'encaisse_definitif',
];

// Mapping etat -> champ date dedie dans CarpaOperation (cf schema)
const ETAT_DATE_FIELD = {
  brouillon: 'createdAt',
  recu_cabinet: 'dateReceptionFonds',
  depose_carpa: 'dateDepotCarpa',
  controle_carpa: 'dateControleTermine',
  encaisse_definitif: 'dateBonneFin',
  instruit_retrait: 'dateInstructionRetrait',
  restitue: 'dateRestitution',
  compte_special_bloque: 'compteSpecialDepuis',
};

// ── Helpers locaux ─────────────────────────────────────────
const formatStepperDate = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  // Format compact "dd/MM HH:mm"
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
};

const getEtatDate = (operation, audit, etat) => {
  if (!operation || !etat) return null;
  if (etat === 'annule') {
    const found = (audit || []).find(
      (a) => a.action === 'state_change' && a.nouvelEtat === 'annule'
    );
    return found?.timestamp || operation.updatedAt;
  }
  const field = ETAT_DATE_FIELD[etat];
  if (field && operation[field]) return operation[field];
  const found = (audit || []).find(
    (a) => a.action === 'state_change' && a.nouvelEtat === etat
  );
  return found?.timestamp || null;
};

const getReferencePill = (operation) => {
  if (!operation) return '';
  if (operation.reference) return operation.reference;
  const id = String(operation._id || '');
  return id ? `#OP-${id.slice(-6).toUpperCase()}` : '';
};

// Cycle de vie : construit la liste des etapes et leur statut a partir
// de l'operation + audit. Retourne :
//   { steps: [{code,label,date,status,index}], cancelStep: {...}|null }
const buildStepper = (operation, audit) => {
  if (!operation) return { steps: [], cancelStep: null };
  const isCancelled = operation.etat === 'annule';

  let baseEtats;
  if (operation.sens === 'entree') {
    baseEtats = [...ETAPES_ENTREE];
  } else {
    const hasCompteSpecial =
      !!operation.compteSpecialDepuis ||
      (audit || []).some(
        (a) =>
          a.action === 'state_change' &&
          a.nouvelEtat === 'compte_special_bloque'
      );
    baseEtats = ['brouillon', 'instruit_retrait'];
    if (hasCompteSpecial) baseEtats.push('compte_special_bloque');
    baseEtats.push('restitue');
  }

  // Index courant : etat actuel, ou ancien etat avant annulation
  let currentEtat = operation.etat;
  if (isCancelled) {
    const cancelLog = (audit || []).find(
      (a) => a.action === 'state_change' && a.nouvelEtat === 'annule'
    );
    currentEtat = cancelLog?.ancienEtat || 'brouillon';
  }
  let currentIndex = baseEtats.indexOf(currentEtat);
  if (currentIndex === -1) currentIndex = 0;

  const steps = baseEtats.map((code, i) => {
    let status;
    if (isCancelled) {
      if (i < currentIndex) status = 'done-cancelled';
      else if (i === currentIndex) status = 'current-cancelled';
      else status = 'future-cancelled';
    } else {
      if (i < currentIndex) status = 'done';
      else if (i === currentIndex) status = 'current';
      else status = 'future';
    }
    const showDate = isCancelled ? i <= currentIndex : i <= currentIndex;
    return {
      code,
      label: ETAT_LABELS[code] || code,
      date: showDate ? getEtatDate(operation, audit, code) : null,
      status,
      index: i + 1,
    };
  });

  let cancelStep = null;
  if (isCancelled) {
    cancelStep = {
      code: 'annule',
      label: 'Annulée',
      date: getEtatDate(operation, audit, 'annule'),
      status: 'cancel-terminal',
      index: '✕',
    };
  }
  return { steps, cancelStep };
};

// ── Icones SVG inline ──────────────────────────────────────
const IconShield = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 4 6v6c0 4.5 3.5 8.5 8 9 4.5-0.5 8-4.5 8-9V6l-8-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const IconClock = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const IconDoc = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" />
    <path d="M8 13h8M8 17h5" />
  </svg>
);

const IconWarning = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 2 21h20L12 3z" />
    <path d="M12 10v5M12 18v.5" />
  </svg>
);

const IconCheck = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 12l5 5 11-11" />
  </svg>
);

const IconBang = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 6v8M12 18v.5" />
  </svg>
);

// ── Composant principal ────────────────────────────────────
const CarpaOperationDetail = ({ open, operationId, onClose, onEdit }) => {
  const dispatch = useDispatch();
  const constants = useSelector((s) => s.carpa.constants);

  const [operation, setOperation] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [piecePending, setPiecePending] = useState({ categoriePiece: '', nomFichier: '' });
  const [transitionInProgress, setTransitionInProgress] = useState(false);

  const refresh = async () => {
    if (!operationId) return;
    setLoading(true);
    setError('');
    try {
      const data = await carpaApi.getOperation(operationId);
      setOperation(data.operation);
      setAudit(data.audit || []);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && operationId) refresh();
  }, [open, operationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const transitionsDispo = useMemo(
    () => transitionsDisponibles(operation, constants),
    [operation, constants]
  );

  const piecesManquantes = useMemo(
    () => piecesManquantesClient(operation),
    [operation]
  );

  const piecesCompletes = useMemo(
    () => piecesCompletesClient(operation),
    [operation]
  );

  const { steps: stepperSteps, cancelStep } = useMemo(
    () => buildStepper(operation, audit),
    [operation, audit]
  );

  const handleAddPiece = async () => {
    if (!piecePending.categoriePiece) return;
    try {
      const data = await carpaApi.addPiece(operationId, {
        categoriePiece: piecePending.categoriePiece,
        nomFichier: piecePending.nomFichier,
      });
      setOperation(data.operation);
      dispatch(upsertOperationLocal(data.operation));
      setPiecePending({ categoriePiece: '', nomFichier: '' });
      refresh();
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    }
  };

  const handleRemovePiece = async (pieceId) => {
    try {
      const data = await carpaApi.removePiece(operationId, pieceId);
      setOperation(data.operation);
      dispatch(upsertOperationLocal(data.operation));
      refresh();
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    }
  };

  const handleTransition = async (nouvelEtat, motif = '') => {
    setTransitionInProgress(true);
    setError('');
    try {
      const data = await carpaApi.transitionOperation(operationId, nouvelEtat, { motif });
      setOperation(data.operation);
      dispatch(upsertOperationLocal(data.operation));
      dispatch(fetchCarpaDashboard());
      if (operation?.dossierId) dispatch(fetchOperationsForDossier(operation.dossierId));
      refresh();
    } catch (e) {
      const msg = e?.response?.data?.message || e.message;
      const manquantes = e?.response?.data?.piecesManquantes;
      if (manquantes && manquantes.length > 0) {
        setError(`Pieces manquantes : ${manquantes.join(', ')}. Ajouter les pieces avant de poursuivre.`);
      } else {
        setError(msg);
      }
    } finally {
      setTransitionInProgress(false);
    }
  };

  const handleLiftFlag = async (flagId) => {
    const motif = window.prompt('Motif de la levee (vigilance traitee) :');
    if (!motif) return;
    try {
      const data = await carpaApi.liftFlag(operationId, flagId, motif);
      setOperation(data.operation);
      dispatch(upsertOperationLocal(data.operation));
      refresh();
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    }
  };

  const handleAddManualFlag = async () => {
    const raison = window.prompt('Raison du drapeau LCB-FT manuel :');
    if (!raison) return;
    try {
      const data = await carpaApi.addFlag(operationId, { type: 'manuel', raison });
      setOperation(data.operation);
      dispatch(upsertOperationLocal(data.operation));
      refresh();
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    }
  };

  if (!open) return null;

  // ── Rendu d'une chip de piece requise ─────────────────────
  const renderPieceChip = (regle) => {
    const alternatives = String(regle).split('|');
    const labels = alternatives
      .map((code) => constants?.categorieLabels?.[code] || code)
      .join(' OU ');
    const fournie = (operation?.pieces || []).some((p) =>
      alternatives.includes(p.categoriePiece)
    );
    return (
      <span
        key={regle}
        className={`k-carpa-detail-piece-chip ${fournie ? 'is-fournie' : 'is-manquante'}`}
      >
        <span className="k-carpa-detail-piece-chip-icon">
          {fournie ? <IconCheck /> : <IconBang />}
        </span>
        {labels}
      </span>
    );
  };

  // ── Rendu ─────────────────────────────────────────────────
  const sensLabel = operation?.sens === 'entree' ? 'ENTRÉE' : 'SORTIE';
  const typeLabel = operation
    ? constants?.typeLabels?.[operation.type] || operation.type
    : '';
  const beneficiaireText = operation
    ? beneficiaireResume(operation.beneficiaireSnapshot, operation.beneficiaireContactId)
    : '';
  const beneficiaireEmpty =
    beneficiaireText === 'Beneficiaire non specifie' ||
    beneficiaireText === 'Beneficiaire (lien rompu)';
  const etatDateValue = operation
    ? getEtatDate(operation, audit, operation.etat) || operation.updatedAt
    : null;
  const refPill = getReferencePill(operation);

  return (
    <div className="k-carpa-modal-backdrop" role="dialog" aria-modal="true">
      <div
        className="k-carpa-modal k-carpa-detail-modal"
        style={{ width: 'min(960px, 100%)' }}
      >
        {/* Header */}
        <div className="k-carpa-detail-header">
          <div className="k-carpa-detail-badge">
            <IconShield />
          </div>
          <div className="k-carpa-detail-header-text">
            <div className="k-carpa-detail-eyebrow">
              OPÉRATION CARPA
              {operation && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="k-carpa-detail-sens">{sensLabel}</span>
                </>
              )}
            </div>
            <div className="k-carpa-detail-titlerow">
              <h3>Détail de l'opération</h3>
              {refPill && (
                <span className="k-carpa-detail-ref-pill">{refPill}</span>
              )}
            </div>
          </div>
          <button
            className="k-carpa-detail-close"
            onClick={() => onClose && onClose()}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Bandeau 3 stats */}
        {operation && (
          <div className="k-carpa-detail-stats">
            <div className="k-carpa-detail-stat">
              <span className="k-carpa-detail-stat-label">Bénéficiaire</span>
              <span
                className={`k-carpa-detail-stat-main ${
                  beneficiaireEmpty ? 'k-carpa-detail-stat-main-empty' : ''
                }`}
              >
                {beneficiaireText}
              </span>
              {beneficiaireEmpty && (
                <span className="k-carpa-detail-stat-sub">
                  À renseigner avant la prochaine étape
                </span>
              )}
            </div>
            <div className="k-carpa-detail-stat">
              <span className="k-carpa-detail-stat-label">Montant</span>
              <span className="k-carpa-detail-stat-amount">
                <span className="k-carpa-detail-amount-value">
                  {Number(operation.montant || 0).toLocaleString('fr-FR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
                <span className="k-carpa-detail-amount-currency">
                  {operation.devise === 'EUR' ? '€' : operation.devise}
                </span>
              </span>
              <span className="k-carpa-detail-stat-sub">
                {operation.sens === 'entree' ? 'Entrée' : 'Sortie'} · {typeLabel}
              </span>
            </div>
            <div className="k-carpa-detail-stat k-carpa-detail-stat-etat">
              <span className="k-carpa-detail-stat-label">État · Date</span>
              <span
                className={`k-carpa-pastille ${etatClass(operation.etat)}`}
              >
                {ETAT_LABELS[operation.etat] || operation.etat}
              </span>
              {etatDateValue && (
                <span className="k-carpa-detail-stat-etat-date">
                  {formatDateTime(etatDateValue)}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="k-carpa-modal-body">
          {loading && <div>Chargement...</div>}
          {error && (
            <div className="k-carpa-alerte k-carpa-alerte-critique">
              <span className="k-carpa-alerte-icon">!</span>
              <div>{error}</div>
            </div>
          )}

          {operation && (
            <>
              {/* Cycle de vie de l'opération */}
              <div className="k-carpa-section">
                <div className="k-carpa-detail-section-head">
                  <div className="k-carpa-detail-section-icon">
                    <IconClock />
                  </div>
                  <h4 className="k-carpa-detail-section-title">
                    Cycle de vie de l'opération
                  </h4>
                  {refPill && (
                    <div className="k-carpa-detail-section-aside">
                      <span className="k-carpa-detail-section-aside-label">
                        Référence :
                      </span>
                      <span className="k-carpa-detail-section-aside-value">
                        {refPill}
                      </span>
                    </div>
                  )}
                </div>
                <div className="k-carpa-detail-stepper">
                  {stepperSteps.map((step) => (
                    <div
                      key={step.code}
                      className={`k-carpa-detail-step is-${step.status}`}
                    >
                      <div className="k-carpa-detail-step-circle">
                        {step.index}
                      </div>
                      <div className="k-carpa-detail-step-label">
                        {step.label}
                      </div>
                      <div
                        className={`k-carpa-detail-step-date ${
                          step.date ? '' : 'k-carpa-detail-step-date-empty'
                        }`}
                      >
                        {step.date ? formatStepperDate(step.date) : '—'}
                      </div>
                    </div>
                  ))}
                  {cancelStep && (
                    <div className="k-carpa-detail-step is-cancel-terminal">
                      <div className="k-carpa-detail-step-circle">
                        {cancelStep.index}
                      </div>
                      <div className="k-carpa-detail-step-label">
                        {cancelStep.label}
                      </div>
                      <div className="k-carpa-detail-step-date">
                        {cancelStep.date
                          ? formatStepperDate(cancelStep.date)
                          : '—'}
                      </div>
                    </div>
                  )}
                </div>
                {operation.notes && (
                  <div className="k-carpa-detail-notes">{operation.notes}</div>
                )}
              </div>

              {/* Pièces justificatives */}
              <div className="k-carpa-section">
                <div className="k-carpa-detail-section-head">
                  <div className="k-carpa-detail-section-icon">
                    <IconDoc />
                  </div>
                  <h4 className="k-carpa-detail-section-title">
                    Pièces justificatives
                  </h4>
                  {operation.pieceCategoriesRequises?.length > 0 && (
                    <div
                      className={`k-carpa-detail-section-aside ${
                        piecesCompletes
                          ? 'k-carpa-detail-aside-ok'
                          : 'k-carpa-detail-aside-warn'
                      }`}
                    >
                      {piecesCompletes
                        ? 'Toutes les pièces requises sont fournies'
                        : `${piecesManquantes.length} pièce(s) manquante(s)`}
                    </div>
                  )}
                </div>

                {operation.pieceCategoriesRequises?.length > 0 ? (
                  <div className="k-carpa-detail-piece-chips">
                    {operation.pieceCategoriesRequises.map(renderPieceChip)}
                  </div>
                ) : (
                  <p className="k-carpa-detail-flag-empty">
                    Aucune pièce justificative spécifiquement requise pour ce type
                    d'opération.
                  </p>
                )}

                <p className="k-carpa-detail-piece-legal">
                  Conformément à l'arrêté du 5 juillet 1996 et aux pratiques locales
                  (Paris, Versailles). La CARPA peut refuser un retrait si les pièces
                  requises ne sont pas réunies.
                </p>

                {operation.pieces?.length > 0 && (
                  <div className="k-carpa-detail-piece-deposited">
                    <div className="k-carpa-detail-piece-deposited-label">
                      Pièces déposées
                    </div>
                    {operation.pieces.map((p) => (
                      <div key={p._id} className="k-carpa-detail-piece-deposited-item">
                        <span className="k-carpa-detail-piece-deposited-name">
                          {constants?.categorieLabels?.[p.categoriePiece] ||
                            p.categoriePiece}
                        </span>
                        {p.nomFichier && (
                          <span className="k-carpa-detail-piece-deposited-file">
                            · {p.nomFichier}
                          </span>
                        )}
                        <span className="k-carpa-detail-piece-deposited-date">
                          {formatDate(p.fournieLe)}
                        </span>
                        {!isTerminale(operation.etat) && (
                          <button
                            className="k-carpa-btn k-carpa-btn-danger"
                            onClick={() => handleRemovePiece(p._id)}
                          >
                            Retirer
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!isTerminale(operation.etat) && (
                  <div className="k-carpa-detail-piece-add">
                    <div className="k-carpa-field">
                      <label>Catégorie de la pièce</label>
                      <select
                        value={piecePending.categoriePiece}
                        onChange={(e) =>
                          setPiecePending((p) => ({
                            ...p,
                            categoriePiece: e.target.value,
                          }))
                        }
                      >
                        <option value="">— Choisir —</option>
                        {(constants?.categoriesPieces || []).map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="k-carpa-field" style={{ flex: 2 }}>
                      <label>Nom / référence du fichier (optionnel)</label>
                      <input
                        type="text"
                        value={piecePending.nomFichier}
                        onChange={(e) =>
                          setPiecePending((p) => ({ ...p, nomFichier: e.target.value }))
                        }
                        placeholder="Ex : Protocole_2025-04-12.pdf"
                      />
                    </div>
                    <button
                      className="k-carpa-btn k-carpa-btn-secondary"
                      onClick={handleAddPiece}
                      disabled={!piecePending.categoriePiece}
                    >
                      Ajouter
                    </button>
                  </div>
                )}
              </div>

              {/* Vigilance LCB-FT */}
              <div className="k-carpa-section">
                <div className="k-carpa-detail-section-head">
                  <div className="k-carpa-detail-section-icon k-carpa-detail-section-icon-warning">
                    <IconWarning />
                  </div>
                  <h4 className="k-carpa-detail-section-title">
                    Vigilance LCB-FT
                  </h4>
                  <button
                    className="k-carpa-detail-flag-add-btn"
                    onClick={handleAddManualFlag}
                  >
                    + Ajouter un drapeau
                  </button>
                </div>
                {(operation.flagsLcbft || []).length === 0 ? (
                  <p className="k-carpa-detail-flag-empty">
                    Aucun drapeau de vigilance.
                  </p>
                ) : (
                  <div className="k-carpa-detail-flag-list">
                    {operation.flagsLcbft.map((f) => (
                      <div
                        key={f._id}
                        className={`k-carpa-detail-flag-item ${
                          f.leveeLe ? 'is-lifted' : 'is-active'
                        }`}
                      >
                        <span className="k-carpa-detail-flag-type">{f.type}</span>
                        <div>
                          <div className="k-carpa-detail-flag-reason">{f.raison}</div>
                          {f.leveeLe && (
                            <div className="k-carpa-detail-flag-lifted-info">
                              Levée le {formatDateTime(f.leveeLe)}
                              {f.motifLevee && ` — ${f.motifLevee}`}
                            </div>
                          )}
                        </div>
                        {!f.leveeLe && (
                          <button
                            className="k-carpa-detail-flag-lift-btn"
                            onClick={() => handleLiftFlag(f._id)}
                          >
                            Lever
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Journal d'audit */}
              <div className="k-carpa-section">
                <div className="k-carpa-detail-section-head">
                  <div className="k-carpa-detail-section-icon">
                    <IconClock />
                  </div>
                  <h4 className="k-carpa-detail-section-title">Journal d'audit</h4>
                </div>
                <p className="k-carpa-detail-section-subtitle">
                  Trace immuable des actions effectuées sur cette opération.
                </p>
                {audit.length === 0 ? (
                  <p className="k-carpa-detail-audit-empty">Pas encore d'évènement.</p>
                ) : (
                  <ul className="k-carpa-timeline">
                    {audit.map((a) => (
                      <li key={a._id}>
                        <span className="k-carpa-timeline-when">
                          {formatDateTime(a.timestamp)}
                        </span>
                        <span>{a.resume || a.action}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="k-carpa-modal-footer">
          {operation && (
            <div className="k-carpa-detail-footer-transitions">
              {transitionsDispo.map((s) => (
                <button
                  key={s}
                  className="k-carpa-btn k-carpa-btn-secondary"
                  disabled={transitionInProgress}
                  onClick={() => handleTransition(s)}
                  title={`Passer a "${ETAT_LABELS[s] || s}"`}
                >
                  → {ETAT_LABELS[s] || s}
                </button>
              ))}
            </div>
          )}
          <div className="k-carpa-detail-footer-actions">
            {operation && !isTerminale(operation.etat) && onEdit && (
              <button
                className="k-carpa-btn k-carpa-btn-ghost"
                onClick={() => onEdit(operation)}
              >
                Modifier
              </button>
            )}
            <button
              className="k-carpa-btn k-carpa-btn-primary"
              onClick={() => onClose && onClose()}
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CarpaOperationDetail;
