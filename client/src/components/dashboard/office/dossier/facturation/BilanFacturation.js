import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { computeInvoiceBilan, saveDossierInvoice } from '../../../../../redux/slices/currentDossierSlice';
import { useToast } from '../../../../common/notifications/useToast';
import InlineEditField, { eur } from './InlineEditField';
import './BilanFacturation.css';
import HoverToSpeak from '../../../../common/HoverToSpeak';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

const BilanFacturation = ({ onInvoiceGenerated }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const dispatch = useDispatch();
  const { dossier: currentDossier } = useSelector((state) => state.currentDossier);
  const dossierId = currentDossier?._id;

  const [bilan, setBilan] = useState(null); // { hourlyRate, vatRate, events:[], documents:[] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overrides, setOverrides] = useState({}); // { [lineId]: montantHT saisi à la main }
  const [generating, setGenerating] = useState(false);

  // Calcul du bilan CÔTÉ SERVEUR (remplace l'ancien socket Electron).
  const loadBilan = useCallback(async () => {
    if (!dossierId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await dispatch(computeInvoiceBilan(dossierId));
      setBilan(data);
      setOverrides({}); // on repart des montants calculés
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Calcul du bilan impossible.');
    } finally {
      setLoading(false);
    }
  }, [dispatch, dossierId]);

  useEffect(() => { loadBilan(); }, [loadBilan]);

  const hourlyRate = bilan?.hourlyRate || 0;
  const vatRate = bilan?.vatRate || 0;
  const vatMult = 1 + vatRate / 100;

  const events = useMemo(() => (bilan?.events || []).slice().sort((a, b) => new Date(b.date_prestation) - new Date(a.date_prestation)), [bilan]);
  const documents = useMemo(() => (bilan?.documents || []).slice().sort((a, b) => new Date(b.date_prestation) - new Date(a.date_prestation)), [bilan]);

  // Montant HT effectif d'une ligne : override manuel s'il existe, sinon calcul auto.
  const effHT = useCallback((line) => (overrides[line.id] !== undefined ? overrides[line.id] : (Number(line.total_ht) || 0)), [overrides]);
  const setOverride = (id, value) => setOverrides((prev) => ({ ...prev, [id]: round2(value) }));

  const totalEventsHT = useMemo(() => events.reduce((s, l) => s + effHT(l), 0), [events, effHT]);
  const totalDocumentsHT = useMemo(() => documents.reduce((s, l) => s + effHT(l), 0), [documents, effHT]);
  const grandHT = round2(totalEventsHT + totalDocumentsHT);
  const grandTTC = round2(grandHT * vatMult);

  const activeInvoice = useMemo(
    () => (currentDossier?.factures || []).find((inv) => inv.status !== 'archived') || null,
    [currentDossier]
  );
  const totalPaid = useMemo(() => (activeInvoice?.payments || []).reduce((s, p) => s + p.amount, 0), [activeInvoice]);
  const remaining = round2(grandTTC - totalPaid);

  const handleGenerate = async () => {
    if (!dossierId || grandTTC <= 0) return;
    setGenerating(true);
    try {
      const buildItems = (list) => list.map((l) => ({
        id: l.id,
        type: l.type,
        description: l.description,
        total_ht: effHT(l),
        date_prestation: l.date_prestation || new Date().toISOString(),
      }));
      const billedItems = [...buildItems(events), ...buildItems(documents)];

      let invoiceData;
      if (activeInvoice) {
        // Mise à jour de la facture en cours (on préserve paiements/date/statut).
        invoiceData = { _id: activeInvoice._id, nomDocument: activeInvoice.nomDocument, totalTTC: grandTTC, billedItems };
      } else {
        const newId = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `inv-${Date.now()}`;
        const ref = currentDossier?.reference ? `Facture ${currentDossier.reference}` : 'Facture';
        invoiceData = { _id: newId, nomDocument: `${ref}.docx`, totalTTC: grandTTC, billedItems, status: 'pending', dateCreation: new Date().toISOString(), payments: [] };
      }
      await dispatch(saveDossierInvoice(dossierId, invoiceData));
      toast.success(activeInvoice ? 'Facture mise à jour.' : 'Facture générée.', { title: 'Facturation' });
      if (onInvoiceGenerated) onInvoiceGenerated();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Enregistrement de la facture impossible.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="bilan-message">Calcul du bilan en cours…</div>;
  }

  if (error) {
    return (
      <div className="bilan-facturation-wrapper">
        <div className="bilan-error-banner">
          <div className="bilan-error-icon">⚠</div>
          <div className="bilan-error-text"><strong>Bilan indisponible</strong><p>{error}</p></div>
          <button className="bilan-error-action-btn" onClick={loadBilan}>Réessayer</button>
        </div>
      </div>
    );
  }

  if (!hourlyRate) {
    return (
      <div className="bilan-facturation-wrapper">
        <div className="bilan-error-banner">
          <div className="bilan-error-icon">⚠</div>
          <div className="bilan-error-text">
            <strong>Taux de facturation non rempli</strong>
            <p>Configurez votre taux horaire dans les paramètres pour calculer les montants (vous pourrez toujours les ajuster à la main).</p>
          </div>
          <button className="bilan-error-action-btn" onClick={() => navigate('/dashboard/parametres', { state: { activeTab: 'billing' } })}>
            Configurer le taux horaire
          </button>
        </div>
      </div>
    );
  }

  const hasItems = events.length > 0 || documents.length > 0;
  if (!hasItems) {
    return (
      <div className="bilan-facturation-wrapper all-settled">
        <div className="bilan-message full-height-message">Aucune nouvelle prestation facturable dans ce dossier.</div>
      </div>
    );
  }

  const renderLine = (line, extraLabel) => {
    const ht = effHT(line);
    const isEdited = overrides[line.id] !== undefined;
    return (
      <div className="bilan-item" key={line.id}>
        <div className="bilan-item-date">{fmtDate(line.date_prestation)}</div>
        <div className="bilan-item-title">
          {line.description}
          {extraLabel && <span className="bilan-item-duration"> {extraLabel}</span>}
          {line.type === 'document' && line.charCount == null && (
            <span className="bilan-item-hint"> · prix à saisir</span>
          )}
        </div>
        <div className="bilan-item-billing">
          <span className="bilan-item-ht-label">HT</span>
          <InlineEditField type="amount" value={ht} onSave={(v) => setOverride(line.id, v)} ariaLabel={`Montant HT de ${line.description}`} />
          {isEdited && <span className="bilan-item-manual" title="Montant modifié manuellement">✎</span>}
          <span className="bilan-item-ttc">soit {eur(round2(ht * vatMult))} TTC</span>
        </div>
      </div>
    );
  };

  return (
    <div className="bilan-facturation-wrapper">
      <div className="bilan-facturation-container">
        <div className="bilan-section">
          <h3 className="section-title">Événements</h3>
          <div className="bilan-list events-list">
            {events.length > 0 ? (
              events.map((line) => {
                const h = Math.floor(line.hours || 0);
                const m = Math.round(((line.hours || 0) - h) * 60);
                const dur = `(Durée : ${h}h${m > 0 ? String(m).padStart(2, '0') : ''})`;
                return renderLine(line, dur);
              })
            ) : (
              <p className="bilan-list-empty">Aucun nouvel événement à facturer.</p>
            )}
          </div>
        </div>

        <div className="bilan-section">
          <h3 className="section-title">Documents</h3>
          <div className="bilan-list documents-list">
            {documents.length > 0 ? (
              documents.map((line) => renderLine(line))
            ) : (
              <p className="bilan-list-empty">Aucun nouveau document à facturer.</p>
            )}
          </div>
        </div>
      </div>

      <div className="facturation-summary-grid">
        <div className="summary-cell">
          <span className="summary-label">Total Événements :</span>
          <span className="summary-value">{eur(round2(totalEventsHT * vatMult))}</span>
        </div>
        <div className="summary-cell cell-right">
          <span className="summary-label">Total Documents :</span>
          <span className="summary-value">{eur(round2(totalDocumentsHT * vatMult))}</span>
        </div>

        {totalPaid > 0 && (
          <>
            <div className="summary-cell cell-bottom">
              <span className="summary-label">Total Prestations :</span>
              <span className="summary-value">{eur(grandTTC)}</span>
            </div>
            <div className="summary-cell cell-right cell-bottom summary-cell--paid">
              <span className="summary-label">Acomptes versés :</span>
              <span className="summary-value">- {eur(totalPaid)}</span>
            </div>
          </>
        )}

        <div className="summary-cell grand-total cell-bottom">
          <span className="summary-label">Solde à facturer :</span>
          <span className="summary-value grand-total-value">{eur(remaining)}</span>
        </div>

        <div className="summary-cell button-cell cell-right cell-bottom">
          <HoverToSpeak textToSpeak="Générer ou mettre à jour la facture">
            <button className="generate-invoice-btn" onClick={handleGenerate} disabled={generating || grandTTC <= 0}>
              {generating ? 'Enregistrement…' : (activeInvoice ? 'Mettre à jour la facture' : 'Générer la facture')}
            </button>
          </HoverToSpeak>
        </div>
      </div>
    </div>
  );
};

export default BilanFacturation;
