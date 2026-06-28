import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchLast25Dossiers } from '../../../../redux/slices/dossierInfoSlice';
import { setCurrentDossier } from '../../../../redux/slices/currentDossierSlice';
import HoverToSpeak from '../../../common/HoverToSpeak';
import './Facturations.css';

// ===========================================================
// Helpers métier
// ===========================================================

const categorizeDossier = (dossier) => {
  const factures = dossier.factures || [];
  if (factures.length === 0) return 'red';
  let allPaid = true;
  let hasAnyPartialPayment = false;
  for (const facture of factures) {
    const totalPaid = (facture.payments || []).reduce((sum, p) => sum + p.amount, 0);
    const remaining = (facture.totalTTC || 0) - totalPaid;
    const isPaid = remaining <= 0.005;
    if (!isPaid) {
      allPaid = false;
      if (totalPaid > 0) hasAnyPartialPayment = true;
    }
  }
  if (allPaid) return 'green';
  if (hasAnyPartialPayment) return 'orange';
  return 'red';
};

const formatDossierNameForDisplay = (fullName) => {
  if (!fullName || typeof fullName !== 'string') return { pour: 'Dossier sans nom', contre: '' };
  const parts = fullName.split(/\s+c\/\s+/i);
  return {
    pour: (parts[0] || '').replace(/\s+et autres…/, '...'),
    contre: (parts[1] || '').replace(/\s+et autres…/, '...'),
  };
};

const computeBillingSummary = (dossier) => {
  const factures = (dossier?.factures || []).filter((f) => !f.archived);
  let totalDue = 0;
  let totalPaid = 0;
  for (const f of factures) {
    totalDue += Number(f.totalTTC) || 0;
    for (const p of (f.payments || [])) totalPaid += Number(p.amount) || 0;
  }
  return {
    totalDue,
    totalPaid,
    remaining: Math.max(0, totalDue - totalPaid),
    invoiceCount: factures.length,
  };
};

const formatAmount = (value) => {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value || 0);
  } catch (_e) {
    return `${Math.round(value || 0)} EUR`;
  }
};

// Sépare le nombre de la devise pour mise en forme typographique (€ en exposant)
const splitAmount = (value) => {
  try {
    const formatted = new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: 0,
    }).format(value || 0);
    return { num: formatted, currency: '€' };
  } catch (_e) {
    return { num: String(Math.round(value || 0)), currency: '€' };
  }
};

const toDateInputValue = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const computePeriodRange = (preset, custom) => {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (preset === 'all') return { from: null, to: null };
  if (preset === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfToday };
  }
  if (preset === 'year') {
    return { from: new Date(now.getFullYear(), 0, 1), to: endOfToday };
  }
  if (preset === 'custom') {
    const from = custom?.from ? new Date(`${custom.from}T00:00:00`) : null;
    const to = custom?.to ? new Date(`${custom.to}T23:59:59.999`) : null;
    return { from, to };
  }
  return { from: null, to: null };
};

const isInRange = (date, from, to) => {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
};

const formatPeriodLabel = (preset, range) => {
  if (preset === 'all') return 'depuis le tout début';
  if (preset === 'month') {
    const m = (range.from || new Date()).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return `pour ${m}`;
  }
  if (preset === 'year') {
    const y = (range.from || new Date()).getFullYear();
    return `pour ${y}`;
  }
  if (preset === 'custom') {
    if (!range.from && !range.to) return 'sur la période';
    const f = range.from ? range.from.toLocaleDateString('fr-FR') : '…';
    const t = range.to ? range.to.toLocaleDateString('fr-FR') : '…';
    return `du ${f} au ${t}`;
  }
  return '';
};

const lastInvoiceNumber = (dossier) => {
  const factures = (dossier?.factures || []).filter((f) => !f.archived);
  if (factures.length === 0) return null;
  const last = factures[factures.length - 1];
  return last?.numeroFacture || last?.number || last?._id?.slice(-6) || null;
};

// ===========================================================
// Icônes inline
// ===========================================================
const I = {
  Search: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
  ),
  Filter: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
  ),
  Download: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
  ),
  Plus: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
  ),
  Check: ({ s = 16 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
  ),
  Clock: ({ s = 16 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
  ),
  Warning: ({ s = 16 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
  ),
  Folder: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
  ),
  Trending: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>
  ),
  Euro: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10h12" /><path d="M4 14h9" /><path d="M19 6.41A6.5 6.5 0 0 0 9 12a6.5 6.5 0 0 0 10 5.59" /></svg>
  ),
  Doc: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="14" x2="15" y2="14" /><line x1="9" y1="17" x2="13" y2="17" /></svg>
  ),
  Percent: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>
  ),
  Calendar: ({ s = 12 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
  ),
  Alert: ({ s = 14 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
  ),
  X: ({ s = 12 }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
  ),
};

// ===========================================================
// Configuration colonnes
// ===========================================================
const COLUMN_CONFIG = {
  green: { title: 'Entièrement payés', sub: 'ENCAISSÉS', icon: <I.Check s={16} />, count: 0 },
  orange: { title: 'Partiellement payés', sub: 'EN COURS', icon: <I.Clock s={16} />, count: 0 },
  red: { title: 'Aucun paiement', sub: 'EN ATTENTE', icon: <I.Warning s={16} />, count: 0 },
};

// ===========================================================
// Carte dossier
// ===========================================================
const DossierCard = ({ dossier, status, onClick }) => {
  const nomComplet = dossier?.dossier?.dossier?.nom || '';
  const { pour, contre } = formatDossierNameForDisplay(nomComplet);
  const { remaining, totalDue, invoiceCount } = computeBillingSummary(dossier);
  const invoiceNumber = lastInvoiceNumber(dossier);

  const displayedAmount = status === 'green' ? totalDue : remaining;
  const showAmount = invoiceCount > 0 && displayedAmount > 0;
  const { num, currency } = splitAmount(displayedAmount);

  return (
    <HoverToSpeak textToSpeak={
      contre
        ? `${pour} contre ${contre}, ${formatAmount(displayedAmount)}`
        : `${pour}, ${formatAmount(displayedAmount)}`
    }>
      <div
        className="fac-card"
        data-status={status}
        onClick={() => onClick(dossier)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(dossier);
          }
        }}
      >
        <span className="fac-card-icon" aria-hidden="true"><I.Folder s={15} /></span>
        <div className="fac-card-body">
          <div className="fac-card-name">
            <span className="fac-card-pour">{pour}</span>
            {contre && (
              <>
                <span className="fac-card-sep">c/</span>
                <span className="fac-card-contre">{contre}</span>
              </>
            )}
          </div>
          {invoiceNumber && (
            <span className="fac-card-pill" title={`Dernière facture : ${invoiceNumber}`}>
              N° {invoiceNumber}
            </span>
          )}
        </div>
        <div className="fac-card-amount">
          {showAmount ? (
            <>
              <span className="fac-card-amount-num">{num}</span>
              <span className="fac-card-amount-cur">{currency}</span>
            </>
          ) : (
            <span className="fac-card-amount-empty">—€</span>
          )}
        </div>
      </div>
    </HoverToSpeak>
  );
};

// ===========================================================
// Colonne
// ===========================================================
const BillingColumn = ({ status, dossiers, onDossierClick }) => {
  const cfg = COLUMN_CONFIG[status];
  return (
    <div className={`fac-col fac-col-${status}`}>
      <div className="fac-col-header">
        <div className="fac-col-icon" aria-hidden="true">{cfg.icon}</div>
        <div className="fac-col-titles">
          <span className="fac-col-title">{cfg.title}</span>
          <span className="fac-col-sub">{cfg.sub}</span>
        </div>
        <span className="fac-col-count">{dossiers.length}</span>
      </div>
      <div className="fac-col-list">
        {dossiers.length > 0 ? (
          dossiers.map((d) => (
            <DossierCard key={d._id} dossier={d} status={status} onClick={onDossierClick} />
          ))
        ) : (
          <p className="fac-col-empty">Aucun dossier</p>
        )}
      </div>
    </div>
  );
};

// ===========================================================
// Sparkline (mini graphique sur les stats)
// ===========================================================
const Sparkline = ({ values, fillFromBottom = false }) => {
  const safe = (values || []).map((v) => Number(v) || 0);
  if (safe.length === 0) return null;
  const max = Math.max(...safe, 1);
  const W = 100;
  const H = 30;
  const step = safe.length > 1 ? W / (safe.length - 1) : W;
  const points = safe.map((v, i) => {
    const x = i * step;
    const y = H - (v / max) * (H - 4) - 2;
    return `${x},${y.toFixed(2)}`;
  }).join(' ');
  const areaPath = `M0,${H} L${points.split(' ').join(' L')} L${W},${H} Z`;
  return (
    <svg className="fac-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {fillFromBottom && <path d={areaPath} fill="currentColor" opacity="0.18" />}
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

// ===========================================================
// Panneau récap
// ===========================================================
const SummaryPanel = ({ dossiers, monthly12, preset, setPreset, custom, setCustom }) => {
  const range = useMemo(() => computePeriodRange(preset, custom), [preset, custom]);

  const stats = useMemo(() => {
    let encaissePeriod = 0;
    let facturePeriod = 0;
    let restantGlobal = 0;
    let nbFacturesPeriod = 0;
    let nbPaiementsPeriod = 0;
    (dossiers || []).forEach((d) => {
      const factures = d?.factures || [];
      factures.forEach((f) => {
        if (!f.archived) {
          const totalTTC = Number(f.totalTTC) || 0;
          const totalPaid = (f.payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
          restantGlobal += Math.max(0, totalTTC - totalPaid);
        }
        if (isInRange(f.dateCreation, range.from, range.to)) {
          facturePeriod += Number(f.totalTTC) || 0;
          nbFacturesPeriod += 1;
        }
        (f.payments || []).forEach((p) => {
          if (isInRange(p.date, range.from, range.to)) {
            encaissePeriod += Number(p.amount) || 0;
            nbPaiementsPeriod += 1;
          }
        });
      });
    });
    const tauxEncaissement = facturePeriod > 0
      ? Math.min(100, Math.round((encaissePeriod / facturePeriod) * 100))
      : null;
    return { encaissePeriod, facturePeriod, restantGlobal, nbFacturesPeriod, nbPaiementsPeriod, tauxEncaissement };
  }, [dossiers, range.from, range.to]);

  const periodLabel = formatPeriodLabel(preset, range);

  // Sparklines : les 12 derniers mois pour chaque métrique
  const sparkEncaisse = monthly12.map((m) => m.encaisse);
  const sparkFacture = monthly12.map((m) => m.facture);
  // Restant global est instantané (pas d'historique fiable depuis le client) -
  // on simule un trait plat (toujours actuel)
  const sparkRestant = monthly12.map(() => stats.restantGlobal || 0);
  const sparkTaux = monthly12.map((m) =>
    m.facture > 0 ? Math.min(100, Math.round((m.encaisse / m.facture) * 100)) : 0
  );

  const presets = [
    { value: 'month', label: 'Ce mois' },
    { value: 'year', label: 'Cette année' },
    { value: 'all', label: 'Tout' },
    { value: 'custom', label: 'Personnalisé', icon: <I.Calendar s={11} /> },
  ];

  return (
    <div className="fac-summary" aria-label="Récapitulatif financier">
      <div className="fac-summary-head">
        <div className="fac-summary-title-block">
          <span className="fac-summary-glyph" aria-hidden="true"><I.Trending s={14} /></span>
          <div>
            <span className="fac-summary-eyebrow">RÉCAPITULATIF</span>
            <h3 className="fac-summary-title">Synthèse de mes revenus</h3>
          </div>
        </div>

        <div className="fac-period" role="group" aria-label="Sélecteur de période">
          {presets.map((p) => (
            <HoverToSpeak key={p.value} textToSpeak={`Période : ${p.label}`}>
              <button
                type="button"
                className={`fac-period-btn ${preset === p.value ? 'is-active' : ''}`}
                onClick={() => setPreset(p.value)}
                aria-pressed={preset === p.value}
              >
                {p.icon && <span className="fac-period-btn-icon">{p.icon}</span>}
                {p.label}
              </button>
            </HoverToSpeak>
          ))}
          {preset === 'custom' && (
            <div className="fac-period-range">
              <label className="fac-period-range-field">
                <span>Du</span>
                <input
                  type="date"
                  value={custom.from}
                  max={custom.to || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                />
              </label>
              <label className="fac-period-range-field">
                <span>Au</span>
                <input
                  type="date"
                  value={custom.to}
                  min={custom.from || undefined}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="fac-stats">
        <HoverToSpeak textToSpeak={`Total encaissé ${periodLabel} : ${formatAmount(stats.encaissePeriod)}`}>
          <div className="fac-stat fac-stat-encaisse">
            <div className="fac-stat-head">
              <span className="fac-stat-glyph" aria-hidden="true"><I.Euro s={13} /></span>
              <span className="fac-stat-label">TOTAL ENCAISSÉ</span>
            </div>
            <div className="fac-stat-value">
              {(() => {
                const a = splitAmount(stats.encaissePeriod);
                return <><span className="fac-stat-num">{a.num}</span><span className="fac-stat-cur">{a.currency}</span></>;
              })()}
            </div>
            <div className="fac-stat-sub">
              {stats.nbPaiementsPeriod} paiement{stats.nbPaiementsPeriod > 1 ? 's' : ''} {periodLabel}
            </div>
            <Sparkline values={sparkEncaisse} fillFromBottom />
          </div>
        </HoverToSpeak>

        <HoverToSpeak textToSpeak={`Restant à encaisser : ${formatAmount(stats.restantGlobal)}`}>
          <div className="fac-stat fac-stat-restant">
            <div className="fac-stat-head">
              <span className="fac-stat-glyph" aria-hidden="true"><I.Alert s={13} /></span>
              <span className="fac-stat-label">RESTANT À ENCAISSER</span>
            </div>
            <div className="fac-stat-value">
              {(() => {
                const a = splitAmount(stats.restantGlobal);
                return <><span className="fac-stat-num">{a.num}</span><span className="fac-stat-cur">{a.currency}</span></>;
              })()}
            </div>
            <div className="fac-stat-sub">solde global actuel</div>
            <Sparkline values={sparkRestant} fillFromBottom />
          </div>
        </HoverToSpeak>

        <HoverToSpeak textToSpeak={`Total facturé ${periodLabel} : ${formatAmount(stats.facturePeriod)}`}>
          <div className="fac-stat fac-stat-facture">
            <div className="fac-stat-head">
              <span className="fac-stat-glyph" aria-hidden="true"><I.Doc s={13} /></span>
              <span className="fac-stat-label">TOTAL FACTURÉ</span>
            </div>
            <div className="fac-stat-value">
              {(() => {
                const a = splitAmount(stats.facturePeriod);
                return <><span className="fac-stat-num">{a.num}</span><span className="fac-stat-cur">{a.currency}</span></>;
              })()}
            </div>
            <div className="fac-stat-sub">
              {stats.nbFacturesPeriod} facture{stats.nbFacturesPeriod > 1 ? 's' : ''} {periodLabel}
            </div>
            <Sparkline values={sparkFacture} fillFromBottom />
          </div>
        </HoverToSpeak>

        <HoverToSpeak textToSpeak={
          stats.tauxEncaissement === null
            ? "Taux d'encaissement non disponible"
            : `Taux d'encaissement : ${stats.tauxEncaissement} pour cent`
        }>
          <div className="fac-stat fac-stat-taux">
            <div className="fac-stat-head">
              <span className="fac-stat-glyph" aria-hidden="true"><I.Percent s={13} /></span>
              <span className="fac-stat-label">TAUX D'ENCAISSEMENT</span>
            </div>
            <div className="fac-stat-value">
              <span className="fac-stat-num">{stats.tauxEncaissement === null ? '—' : stats.tauxEncaissement}</span>
              <span className="fac-stat-cur">%</span>
            </div>
            <div className="fac-stat-sub">encaissé / facturé {periodLabel}</div>
            {stats.tauxEncaissement !== null && (
              <div className="fac-stat-bar" aria-hidden="true">
                <span style={{ width: `${stats.tauxEncaissement}%` }} />
              </div>
            )}
          </div>
        </HoverToSpeak>
      </div>
    </div>
  );
};

// ===========================================================
// Bar chart 12 mois
// ===========================================================
const MonthlyBarsChart = ({ monthly12, onMonthClick, selectedKey }) => {
  const max = Math.max(1, ...monthly12.map((m) => Math.max(m.facture, m.encaisse)));
  return (
    <div className="fac-monthly" aria-label="12 derniers mois">
      <div className="fac-monthly-head">
        <span className="fac-monthly-eyebrow">12 DERNIERS MOIS</span>
        <div className="fac-monthly-legend">
          <span className="fac-monthly-legend-item fac-monthly-legend-fact">
            <span className="fac-monthly-legend-dot" /> Facturé
          </span>
          <span className="fac-monthly-legend-item fac-monthly-legend-enc">
            <span className="fac-monthly-legend-dot" /> Encaissé
          </span>
        </div>
      </div>
      <div className="fac-monthly-grid">
        {monthly12.map((m) => {
          const hF = Math.round((m.facture / max) * 100);
          const hE = Math.round((m.encaisse / max) * 100);
          const isActive = selectedKey === m.key;
          return (
            <HoverToSpeak
              key={m.key}
              textToSpeak={`${m.fullLabel} : facturé ${formatAmount(m.facture)}, encaissé ${formatAmount(m.encaisse)}`}
            >
              <button
                type="button"
                className={`fac-monthly-col ${isActive ? 'is-active' : ''}`}
                title={`${m.fullLabel}\nFacturé : ${formatAmount(m.facture)}\nEncaissé : ${formatAmount(m.encaisse)}`}
                aria-pressed={isActive}
                onClick={() => onMonthClick && onMonthClick(m)}
              >
                <div className="fac-monthly-bars">
                  <span className="fac-monthly-bar fac-monthly-bar-fact" style={{ height: `${hF}%` }} />
                  <span className="fac-monthly-bar fac-monthly-bar-enc" style={{ height: `${hE}%` }} />
                </div>
                <span className="fac-monthly-label">
                  <span className="fac-monthly-label-month">{m.shortLabel}</span>
                  <span className="fac-monthly-label-year">'{m.yearShort}</span>
                </span>
              </button>
            </HoverToSpeak>
          );
        })}
      </div>
    </div>
  );
};

// ===========================================================
// Composant principal
// ===========================================================
const Facturations = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const { lastDossiers, loading } = useSelector((s) => s.last25Dossiers);

  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState({ green: true, orange: true, red: true });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // Période sélectionnée pour la synthèse (partagée avec le bar chart 12 mois)
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState(() => {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toDateInputValue(firstOfMonth), to: toDateInputValue(today) };
  });

  // Mois actif dans le bar chart : on regarde si la plage active correspond
  // à un mois entier de la liste 12 mois. Si oui, on le met en surbrillance.
  const selectedMonthKey = useMemo(() => {
    if (preset !== 'custom' || !custom?.from || !custom?.to) return null;
    const f = new Date(`${custom.from}T00:00:00`);
    const t = new Date(`${custom.to}T00:00:00`);
    if (isNaN(f.getTime()) || isNaN(t.getTime())) return null;
    const sameMonth =
      f.getFullYear() === t.getFullYear() &&
      f.getMonth() === t.getMonth() &&
      f.getDate() === 1;
    if (!sameMonth) return null;
    return `${f.getFullYear()}-${f.getMonth()}`;
  }, [preset, custom]);

  const handleMonthClick = (m) => {
    setPreset('custom');
    setCustom({
      from: toDateInputValue(m.from),
      to: toDateInputValue(m.to),
    });
  };

  const filterRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!loading) dispatch(fetchLast25Dossiers());
  }, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fermeture clic-dehors pour les popovers
  useEffect(() => {
    const onClick = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Filtrage des dossiers (par nom + par statut)
  const filteredDossiers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lastDossiers || []).filter((d) => {
      const nom = (d?.dossier?.dossier?.nom || '').toLowerCase();
      if (q && !nom.includes(q)) return false;
      const cat = categorizeDossier(d);
      if (!statusFilter[cat]) return false;
      return true;
    });
  }, [lastDossiers, search, statusFilter]);

  const { greenDossiers, orangeDossiers, redDossiers } = useMemo(() => {
    const green = [], orange = [], red = [];
    filteredDossiers.forEach((d) => {
      const c = categorizeDossier(d);
      if (c === 'green') green.push(d);
      else if (c === 'orange') orange.push(d);
      else red.push(d);
    });
    return { greenDossiers: green, orangeDossiers: orange, redDossiers: red };
  }, [filteredDossiers]);

  // Agrégations mensuelles 12 derniers mois
  const monthly12 = useMemo(() => {
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      months.push({
        key: `${ref.getFullYear()}-${ref.getMonth()}`,
        from: ref,
        to: new Date(next.getTime() - 1),
        shortLabel: ref.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
        yearShort: String(ref.getFullYear()).slice(-2),
        fullLabel: ref.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
        facture: 0,
        encaisse: 0,
      });
    }
    (lastDossiers || []).forEach((d) => {
      (d?.factures || []).forEach((f) => {
        const dC = f?.dateCreation ? new Date(f.dateCreation) : null;
        if (dC && !isNaN(dC.getTime())) {
          for (const m of months) {
            if (dC >= m.from && dC <= m.to) {
              m.facture += Number(f.totalTTC) || 0;
              break;
            }
          }
        }
        (f?.payments || []).forEach((p) => {
          const dP = p?.date ? new Date(p.date) : null;
          if (dP && !isNaN(dP.getTime())) {
            for (const m of months) {
              if (dP >= m.from && dP <= m.to) {
                m.encaisse += Number(p.amount) || 0;
                break;
              }
            }
          }
        });
      });
    });
    return months;
  }, [lastDossiers]);

  const handleDossierClick = (dossier) => {
    dispatch(setCurrentDossier(dossier));
    navigate('/dashboard/dossier');
  };

  // === Action : Export CSV ===
  const handleExport = () => {
    const rows = [['Dossier', 'Statut', 'Total TTC (€)', 'Encaissé (€)', 'Restant (€)', 'Nb factures']];
    (lastDossiers || []).forEach((d) => {
      const nom = d?.dossier?.dossier?.nom || '';
      const { totalDue, totalPaid, remaining, invoiceCount } = computeBillingSummary(d);
      const cat = categorizeDossier(d);
      const statut = cat === 'green' ? 'Payé' : cat === 'orange' ? 'Partiel' : 'Impayé';
      rows.push([nom, statut, totalDue.toFixed(2), totalPaid.toFixed(2), remaining.toFixed(2), invoiceCount]);
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturation_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // === Action : ouverture du picker pour nouvelle facture ===
  const pickerDossiers = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return (lastDossiers || [])
      .filter((d) => !q || (d?.dossier?.dossier?.nom || '').toLowerCase().includes(q))
      .slice(0, 10);
  }, [lastDossiers, pickerSearch]);

  const handlePickerSelect = (dossier) => {
    setPickerOpen(false);
    setPickerSearch('');
    dispatch(setCurrentDossier(dossier));
    // Le panneau facturation est ouvert dans la page dossier ; le user n'a plus
    // qu'à cliquer "Nouvelle facture" dans ce dossier (cf. Facture.js).
    navigate('/dashboard/dossier');
  };

  if (loading) {
    return (
      <div className="facturations-container fac-loading">
        <p className="facturations-loading">Chargement des dossiers...</p>
      </div>
    );
  }

  const filterCount = Object.values(statusFilter).filter((v) => !v).length;

  return (
    <div className="facturations-container fac-page">
      {/* === TOP BAR === */}
      <div className="fac-topbar">
        <div className="fac-title-block">
          <span className="fac-eyebrow">TABLEAU DE BORD</span>
          <h2 className="fac-title">Facturation</h2>
        </div>
        <div className="fac-actions">
          <div className="fac-search">
            <span className="fac-search-icon" aria-hidden="true"><I.Search s={14} /></span>
            <input
              type="text"
              placeholder="Rechercher un dossier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Rechercher un dossier"
            />
            {search && (
              <button
                type="button"
                className="fac-search-clear"
                onClick={() => setSearch('')}
                aria-label="Effacer la recherche"
              >
                <I.X s={11} />
              </button>
            )}
          </div>

          <div className="fac-popover-wrap" ref={filterRef}>
            <HoverToSpeak textToSpeak="Bouton Filtrer">
              <button
                type="button"
                className={`fac-btn-secondary ${filterOpen ? 'is-active' : ''}`}
                onClick={() => setFilterOpen((v) => !v)}
                aria-expanded={filterOpen}
                aria-haspopup="true"
              >
                <I.Filter s={13} />
                <span>Filtrer</span>
                {filterCount > 0 && <span className="fac-btn-badge">{filterCount}</span>}
              </button>
            </HoverToSpeak>
            {filterOpen && (
              <div className="fac-popover" role="dialog" aria-label="Filtres">
                <div className="fac-popover-title">Statut affiché</div>
                {[
                  { key: 'green', label: 'Entièrement payés', color: '#00c853' },
                  { key: 'orange', label: 'Partiellement payés', color: '#ff9800' },
                  { key: 'red', label: 'Aucun paiement', color: '#dc3545' },
                ].map((s) => (
                  <label key={s.key} className="fac-popover-check">
                    <input
                      type="checkbox"
                      checked={statusFilter[s.key]}
                      onChange={() => setStatusFilter((p) => ({ ...p, [s.key]: !p[s.key] }))}
                    />
                    <span className="fac-popover-dot" style={{ background: s.color }} />
                    <span>{s.label}</span>
                  </label>
                ))}
                <button
                  type="button"
                  className="fac-popover-reset"
                  onClick={() => setStatusFilter({ green: true, orange: true, red: true })}
                >
                  Tout réinitialiser
                </button>
              </div>
            )}
          </div>

          <HoverToSpeak textToSpeak="Bouton Exporter en CSV">
            <button type="button" className="fac-btn-secondary" onClick={handleExport}>
              <I.Download s={13} />
              <span>Exporter</span>
            </button>
          </HoverToSpeak>

          <div className="fac-popover-wrap" ref={pickerRef}>
            <HoverToSpeak textToSpeak="Bouton Nouvelle facture">
              <button
                type="button"
                className={`fac-btn-primary ${pickerOpen ? 'is-active' : ''}`}
                onClick={() => setPickerOpen((v) => !v)}
                aria-expanded={pickerOpen}
                aria-haspopup="true"
              >
                <I.Plus s={13} />
                <span>Nouvelle facture</span>
              </button>
            </HoverToSpeak>
            {pickerOpen && (
              <div className="fac-popover fac-popover-wide" role="dialog" aria-label="Choisir un dossier">
                <div className="fac-popover-title">Pour quel dossier ?</div>
                <div className="fac-popover-search">
                  <I.Search s={12} />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Filtrer les dossiers..."
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                  />
                </div>
                <div className="fac-popover-list">
                  {pickerDossiers.length > 0 ? (
                    pickerDossiers.map((d) => (
                      <button
                        type="button"
                        key={d._id}
                        className="fac-popover-item"
                        onClick={() => handlePickerSelect(d)}
                      >
                        <I.Folder s={13} />
                        <span>{d?.dossier?.dossier?.nom || 'Sans nom'}</span>
                      </button>
                    ))
                  ) : (
                    <p className="fac-popover-empty">Aucun dossier ne correspond.</p>
                  )}
                </div>
                <p className="fac-popover-hint">
                  Vous serez redirigé vers la page du dossier où vous pourrez créer la facture.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* === 3 COLONNES === */}
      <div className="fac-columns">
        <BillingColumn status="green" dossiers={greenDossiers} onDossierClick={handleDossierClick} />
        <BillingColumn status="orange" dossiers={orangeDossiers} onDossierClick={handleDossierClick} />
        <BillingColumn status="red" dossiers={redDossiers} onDossierClick={handleDossierClick} />
      </div>

      {/* === RECAP === */}
      <SummaryPanel
        dossiers={lastDossiers || []}
        monthly12={monthly12}
        preset={preset}
        setPreset={setPreset}
        custom={custom}
        setCustom={setCustom}
      />

      {/* === BAR CHART 12 MOIS === */}
      <MonthlyBarsChart
        monthly12={monthly12}
        onMonthClick={handleMonthClick}
        selectedKey={selectedMonthKey}
      />
    </div>
  );
};

export default Facturations;
