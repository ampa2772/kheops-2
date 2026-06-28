import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import HoverToSpeak from '../../../common/HoverToSpeak';

// Libelles courts + complets alignes sur dossiersListe/index.js pour ne pas
// dupliquer la semantique metier (cle = selectedTribunalAffaire.type).
const TRIBUNAL_LABEL = {
  tgi: 'TJ', tco: 'TCO', cph: 'CPH', ta: 'TA', cass: 'CASS',
  ccd: 'CCD', te: 'TE', tprx: 'TPRX', ca: 'CA', caa: 'CAA',
  cdad: 'CDAD', tbrtj: 'TBRTJ',
};
const TRIBUNAL_FULL_LABEL = {
  tgi: 'Tribunal Judiciaire',
  tco: 'Tribunal de Commerce',
  cph: "Conseil de Prud'hommes",
  ta: 'Tribunal Administratif',
  cass: "Cour d'Assises",
  ccd: 'Cour Criminelle Departementale',
  te: 'Tribunal pour Enfants',
  tprx: 'Tribunal de Proximite',
  ca: "Cour d'Appel",
  caa: "Cour Administrative d'Appel",
  cdad: "Conseil Departemental d'Acces au Droit",
  tbrtj: 'Tribunal Paritaire des Baux Ruraux',
};

const formatShortDate = (value) => {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (_e) {
    return null;
  }
};

const formatCurrency = (amount) => {
  if (amount == null || Number.isNaN(amount)) return '0 \u20AC';
  const rounded = Math.round(amount);
  return rounded.toLocaleString('fr-FR') + ' \u20AC';
};

// Decoupe le titre "X c/ Y" pour pouvoir styliser le "c/" en bleu ciel
const renderTitleHTML = (dossierName) => {
  if (!dossierName) return null;
  const parts = dossierName.split(/(\s+c\/\s+)/i);
  if (parts.length < 3) {
    return <span>{dossierName}</span>;
  }
  return (
    <>
      <span className="dossier-rich-header__title-pour">{parts[0]}</span>
      <span className="dossier-rich-header__title-sep">{parts[1]}</span>
      <span className="dossier-rich-header__title-contre">{parts.slice(2).join('')}</span>
    </>
  );
};

const STATUS_LABELS = {
  en_cours: 'EN COURS',
  encours: 'EN COURS',
  ouvert: 'EN COURS',
  archive: 'ARCHIVE',
  archived: 'ARCHIVE',
  cloture: 'CLOTURE',
  closed: 'CLOTURE',
  termine: 'TERMINE',
};

const DossierHeader = ({
  dossier,
  dossierName,
  titleToSpeak,
}) => {
  const inner = useMemo(
    () => dossier?.dossier?.dossier || dossier?.dossier || {},
    [dossier]
  );
  const tribunalType = inner.selectedTribunalAffaire?.type;
  const createdAt = formatShortDate(inner.createdAt || dossier?.createdAt);

  // === Compteur de documents ===
  const documentsCount = useMemo(() => {
    const arr = inner.documents || dossier?.dossier?.documents || [];
    return Array.isArray(arr) ? arr.length : 0;
  }, [inner, dossier]);

  // === Statut ===
  const rawStatus = inner.statut || inner.status || dossier?.statut || dossier?.status || 'en_cours';
  const statusLabel = STATUS_LABELS[String(rawStatus).toLowerCase()] || String(rawStatus).toUpperCase();

  // === Numero d'affaire ===
  const numeroAffaire = inner.numeroAffaire || inner.numero || inner.numeroDossier
    || dossier?.numeroAffaire || dossier?.numero || null;

  // === Echeance (prochain evenement de l'agenda lie au dossier) ===
  const dossierEvents = useSelector(state => state.agenda?.dossierEvents || []);
  const nextDeadline = useMemo(() => {
    if (!Array.isArray(dossierEvents) || dossierEvents.length === 0) return null;
    const now = Date.now();
    const sorted = [...dossierEvents]
      .filter(e => e?.startDate && new Date(e.startDate).getTime() >= now)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    return sorted[0] || null;
  }, [dossierEvents]);

  const nextDeadlineDate = nextDeadline ? new Date(nextDeadline.startDate) : null;
  const daysToDeadline = nextDeadlineDate
    ? Math.max(0, Math.ceil((nextDeadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  // === Montant a regler (factures non payees, archivees ou en cours) ===
  const amountDue = useMemo(() => {
    const factures = dossier?.factures || dossier?.dossier?.factures || [];
    if (!Array.isArray(factures)) return 0;
    return factures.reduce((sum, inv) => {
      const total = Number(inv?.totalTTC ?? inv?.total ?? 0);
      const payments = Array.isArray(inv?.payments) ? inv.payments : [];
      const paid = payments.reduce((s, p) => s + Number(p?.amount ?? 0), 0)
        || Number(inv?.totalPaid ?? inv?.paid ?? 0);
      const remaining = Math.max(0, total - paid);
      return sum + remaining;
    }, 0);
  }, [dossier]);

  return (
    <header className="dossier-rich-header" aria-label="En-tete du dossier">
      <div className="dossier-rich-header__main">
        <div className="dossier-rich-header__left">
          {/* Fil d'Ariane */}
          <div className="dossier-rich-header__breadcrumb">
            <span>Dossiers</span>
            {tribunalType && TRIBUNAL_FULL_LABEL[tribunalType] && (
              <>
                <span className="dossier-rich-header__breadcrumb-sep">{'\u203A'}</span>
                <span className={numeroAffaire ? '' : 'dossier-rich-header__breadcrumb-current'}>
                  {TRIBUNAL_FULL_LABEL[tribunalType]}
                </span>
              </>
            )}
            {numeroAffaire && (
              <>
                <span className="dossier-rich-header__breadcrumb-sep">{'\u203A'}</span>
                <span className="dossier-rich-header__breadcrumb-current">{numeroAffaire}</span>
              </>
            )}
          </div>

          {/* Ligne meta : badge tribunal + statut + numero affaire */}
          <div className="dossier-rich-header__badges-row">
            {tribunalType && TRIBUNAL_LABEL[tribunalType] && (
              <span
                className={`dossier-rich-header__tribunal dossier-color-${tribunalType}`}
                title={TRIBUNAL_FULL_LABEL[tribunalType] || ''}
                aria-label={`Juridiction : ${TRIBUNAL_FULL_LABEL[tribunalType] || TRIBUNAL_LABEL[tribunalType]}`}
              >
                {TRIBUNAL_LABEL[tribunalType]}
              </span>
            )}
            <span className="dossier-rich-header__status">
              <span className="dossier-rich-header__status-dot" aria-hidden="true" />
              {statusLabel}
            </span>
            {numeroAffaire && (
              <span className="dossier-rich-header__affaire">
                Affaire n&deg; {numeroAffaire}
              </span>
            )}
          </div>

          {/* Titre */}
          <HoverToSpeak textToSpeak={titleToSpeak || dossierName}>
            <h1 className="dossierNameTitle dossier-rich-header__title k-h1">
              {renderTitleHTML(dossierName)}
            </h1>
          </HoverToSpeak>
        </div>

        {/* Encarts droite (KPI) */}
        <div className="dossier-rich-header__kpis" aria-label="Indicateurs cles du dossier">
          <div className="dossier-kpi">
            <div className="dossier-kpi__label">DOCUMENTS</div>
            <div className="dossier-kpi__value">{documentsCount}</div>
            <div className="dossier-kpi__hint">stock&eacute;s</div>
          </div>
          <div className="dossier-kpi">
            <div className="dossier-kpi__label">&Eacute;CH&Eacute;ANCE</div>
            <div className="dossier-kpi__value dossier-kpi__value--warn">
              {daysToDeadline != null ? `${daysToDeadline}j` : '\u2014'}
            </div>
            <div className="dossier-kpi__hint">
              {nextDeadlineDate ? formatShortDate(nextDeadlineDate) : 'Aucune'}
            </div>
          </div>
          <div className="dossier-kpi">
            <div className="dossier-kpi__label">FACTURATION</div>
            <div className="dossier-kpi__value dossier-kpi__value--accent">
              {formatCurrency(amountDue)}
            </div>
            <div className="dossier-kpi__hint">
              {amountDue > 0 ? '\u00e0 r\u00e9gler' : 'Soldee'}
            </div>
          </div>
        </div>
      </div>

      {createdAt && (
        <span className="k-sr-only" aria-label={`Dossier cree le ${createdAt}`}>
          Cr&eacute;&eacute; le {createdAt}
        </span>
      )}
    </header>
  );
};

export default DossierHeader;
