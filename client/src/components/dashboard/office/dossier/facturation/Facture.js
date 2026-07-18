import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { saveDossierInvoice, replaceInvoicePayments } from '../../../../../redux/slices/currentDossierSlice';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import ArchivedInvoiceDetailModal from './ArchivedInvoiceDetailModal';
import Voir from '../../../../../assets/voir.svg';
import { useToast } from '../../../../common/notifications/useToast';
import InlineEditField, { eur } from './InlineEditField';
import './Facture.css';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const Facture = () => {
  const dispatch = useDispatch();
  const toast = useToast();
  const { dossier: currentDossier } = useSelector((state) => state.currentDossier);
  const dossierId = currentDossier?._id;

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [savingPayments, setSavingPayments] = useState(false);
  const [savingTotal, setSavingTotal] = useState(false);
  const [selectedArchivedInvoice, setSelectedArchivedInvoice] = useState(null);
  const [newPayment, setNewPayment] = useState({ amount: '', date: new Date().toISOString().slice(0, 10), note: '' });

  const { activeInvoices, archivedInvoices } = useMemo(() => {
    const all = currentDossier?.factures || [];
    return {
      activeInvoices: all.filter((inv) => inv.status !== 'archived').sort((a, b) => new Date(b.dateCreation) - new Date(a.dateCreation)),
      archivedInvoices: all.filter((inv) => inv.status === 'archived').sort((a, b) => new Date(b.dateCreation) - new Date(a.dateCreation)),
    };
  }, [currentDossier]);

  // Re-synchronise la facture sélectionnée quand le dossier change.
  useEffect(() => {
    if (selectedInvoice?._id) {
      const updated = currentDossier?.factures.find((inv) => inv._id === selectedInvoice._id);
      setSelectedInvoice(updated || null);
    }
  }, [currentDossier, selectedInvoice?._id]);

  useEffect(() => {
    const stillActive = selectedInvoice && activeInvoices.some((inv) => inv._id === selectedInvoice._id);
    if (!stillActive) setSelectedInvoice(activeInvoices[0] || null);
  }, [activeInvoices]); // eslint-disable-line react-hooks/exhaustive-deps

  const savePayments = async (payments) => {
    if (!selectedInvoice) return;
    setSavingPayments(true);
    try {
      await dispatch(replaceInvoicePayments(dossierId, selectedInvoice._id, payments));
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Enregistrement des paiements impossible.');
    } finally {
      setSavingPayments(false);
    }
  };

  const updatePayment = (index, patch) => {
    const payments = (selectedInvoice.payments || []).map((p, i) => (i === index ? { amount: p.amount, date: p.date, note: p.note || '', ...patch } : { amount: p.amount, date: p.date, note: p.note || '' }));
    savePayments(payments);
  };

  const deletePayment = (index) => {
    const payments = (selectedInvoice.payments || []).filter((_, i) => i !== index);
    savePayments(payments);
  };

  const addPayment = () => {
    const amount = parseFloat(String(newPayment.amount).replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) {
      toast.warning('Saisissez un montant de paiement valide.');
      return;
    }
    const payments = [
      ...(selectedInvoice.payments || []).map((p) => ({ amount: p.amount, date: p.date, note: p.note || '' })),
      { amount, date: new Date(`${newPayment.date}T00:00:00`).toISOString(), note: newPayment.note || '' },
    ];
    savePayments(payments);
    setNewPayment({ amount: '', date: new Date().toISOString().slice(0, 10), note: '' });
  };

  // Correction manuelle du TOTAL de la facture (erreur, remise, majoration…).
  const saveTotal = async (newTotal) => {
    if (!selectedInvoice) return;
    setSavingTotal(true);
    try {
      await dispatch(saveDossierInvoice(dossierId, { _id: selectedInvoice._id, nomDocument: selectedInvoice.nomDocument, totalTTC: round2(newTotal) }));
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Mise à jour du total impossible.');
    } finally {
      setSavingTotal(false);
    }
  };

  const InvoiceDetailPanel = () => {
    if (!selectedInvoice) {
      return <div className="invoice-detail-placeholder">Sélectionnez une facture pour voir les détails et gérer les paiements.</div>;
    }
    const payments = selectedInvoice.payments || [];
    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    const remaining = round2(selectedInvoice.totalTTC - totalPaid);

    return (
      <div className="invoice-detail-content">
        <h3>Détails de la facture</h3>
        <div className="payment-summary">
          <div className="summary-item">
            <span>Total Facture :</span>
            <InlineEditField type="amount" value={selectedInvoice.totalTTC} onSave={saveTotal} saving={savingTotal} ariaLabel="Total de la facture" />
          </div>
          <div className="summary-item">
            <span>Total Payé :</span>
            <span>{eur(totalPaid)}</span>
          </div>
          <div className="summary-item remaining">
            <span>Restant dû :</span>
            <span>{eur(remaining)}</span>
          </div>
        </div>

        {/* ── Historique des paiements intermédiaires (éditable) ── */}
        <div className="payments-history">
          <div className="payments-history__head">
            <span>Paiements reçus</span>
            {savingPayments && <span className="payments-history__saving">enregistrement…</span>}
          </div>

          {payments.length === 0 && <p className="payments-history__empty">Aucun paiement enregistré pour le moment.</p>}

          {payments.length > 0 && (
            <ul className="payments-history__list">
              {payments.map((p, i) => (
                <li className="payment-row" key={i}>
                  <InlineEditField type="date" value={p.date} onSave={(v) => updatePayment(i, { date: v })} ariaLabel="Date du paiement" className="payment-row__date" />
                  <InlineEditField type="amount" value={p.amount} onSave={(v) => updatePayment(i, { amount: v })} ariaLabel="Montant du paiement" className="payment-row__amount" />
                  <input
                    className="payment-row__note"
                    type="text"
                    value={p.note || ''}
                    placeholder="Libellé (facultatif)"
                    onChange={(e) => {
                      const note = e.target.value;
                      setSelectedInvoice((prev) => ({ ...prev, payments: prev.payments.map((pp, j) => (j === i ? { ...pp, note } : pp)) }));
                    }}
                    onBlur={(e) => updatePayment(i, { note: e.target.value })}
                  />
                  <button type="button" className="payment-row__delete" title="Supprimer ce paiement" onClick={() => deletePayment(i)}>×</button>
                </li>
              ))}
            </ul>
          )}

          {/* Ajout d'un paiement */}
          <div className="payment-add-row">
            <input
              className="payment-add-row__date"
              type="date"
              value={newPayment.date}
              onChange={(e) => setNewPayment((s) => ({ ...s, date: e.target.value }))}
              aria-label="Date du nouveau paiement"
            />
            <input
              className="payment-add-row__amount"
              type="text"
              inputMode="decimal"
              value={newPayment.amount}
              onChange={(e) => setNewPayment((s) => ({ ...s, amount: e.target.value }))}
              placeholder="Montant (€)"
              aria-label="Montant du nouveau paiement"
              onKeyDown={(e) => { if (e.key === 'Enter') addPayment(); }}
            />
            <input
              className="payment-add-row__note"
              type="text"
              value={newPayment.note}
              onChange={(e) => setNewPayment((s) => ({ ...s, note: e.target.value }))}
              placeholder="Libellé (facultatif)"
              aria-label="Libellé du nouveau paiement"
            />
            <button type="button" className="payment-add-row__btn" onClick={addPayment} disabled={savingPayments}>+ Ajouter</button>
          </div>
        </div>
      </div>
    );
  };

  const handleOverlayClick = () => {
    if (selectedArchivedInvoice) setSelectedArchivedInvoice(null);
    else setShowArchiveModal(false);
  };

  return (
    <div className="facture-container">
      <div className="facture-content-wrapper">
        <div className="invoice-list-pane">
          <div className="pane-header">
            {archivedInvoices.length > 0 && (
              <button className="archive-link-btn" onClick={() => { setSelectedArchivedInvoice(null); setShowArchiveModal(true); }}>
                Voir les archives ({archivedInvoices.length})
              </button>
            )}
          </div>
          <div className="invoice-list">
            {activeInvoices.length > 0 ? (
              activeInvoices.map((invoice) => {
                const totalPaid = (invoice.payments || []).reduce((s, p) => s + p.amount, 0);
                const remaining = round2(invoice.totalTTC - totalPaid);
                const isPaid = remaining <= 0.005;
                return (
                  <div
                    key={invoice._id}
                    className={`invoice-list-item-card ${isPaid ? 'paid' : ''} ${selectedInvoice?._id === invoice._id ? 'selected' : ''}`}
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    <div className="invoice-card-header">
                      <span className="invoice-card-name">Facture</span>
                      <span className="invoice-card-amount">{eur(remaining)}</span>
                    </div>
                    <div className="invoice-card-body">
                      <span className="invoice-card-date">Créée le {new Date(invoice.dateCreation).toLocaleDateString('fr-FR')}</span>
                      {isPaid && <span className="invoice-paid-status">Facture honorée</span>}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="no-invoices-message">Aucune facture active. Générez-la depuis l'onglet « Bilan facturation ».</p>
            )}
          </div>
        </div>
        <div className="invoice-detail-pane">
          <InvoiceDetailPanel />
        </div>
      </div>

      {showArchiveModal && (
        <div className="archive-modal-overlay" onClick={handleOverlayClick}>
          <div className="archive-modal-content" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleOverlayClick} className="archive-modal-close-x-btn" title="Fermer ou Retour">×</button>
            {selectedArchivedInvoice ? (
              <ArchivedInvoiceDetailModal invoice={selectedArchivedInvoice} onBack={() => setSelectedArchivedInvoice(null)} onEditInvoice={() => {}} />
            ) : (
              <>
                <h3>Factures archivées</h3>
                <div className="archived-invoice-list">
                  {archivedInvoices.length > 0 ? (
                    archivedInvoices.map((invoice) => {
                      const d = invoice.archivedDate ? new Date(invoice.archivedDate) : new Date(invoice.dateCreation);
                      const formatted = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
                      return (
                        <div className="archived-invoice-item" key={invoice._id}>
                          <span>Facture du {formatted}</span>
                          <button className="view-details-icon-btn" onClick={() => setSelectedArchivedInvoice(invoice)} title="Voir les détails">
                            <img src={Voir} alt="Voir les détails" className="k-icon-sm" />
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <p>Aucune facture archivée.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Facture;
