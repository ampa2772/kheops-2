// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_62\Kheops_2\client\src\components\dashboard\office\dossier\facturation\Facture.js
import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { initSocket, subscribeToEvent, unsubscribeFromEvent } from '../../../../../services/socketService';
import { addPaymentToInvoice, archiveInvoice, updateCurrentDossierFromSocket } from '../../../../../redux/slices/currentDossierSlice';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import { speak, stopSpeaking } from '../../../../../services/speechService';
import ArchivedInvoiceDetailModal from './ArchivedInvoiceDetailModal';
import Voir from '../../../../../assets/voir.svg';
import { useToast } from '../../../../common/notifications/useToast';
import './Facture.css';

const Facture = () => {
  const dispatch = useDispatch();
  const toast = useToast();
  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  const token = useSelector(state => state.login.token);
  const isSpeechEnabled = useSelector(state => state.login.user?.isSpeechEnabled || false);

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showPaymentInput, setShowPaymentInput] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedArchivedInvoice, setSelectedArchivedInvoice] = useState(null);

  useEffect(() => {
    const handleInvoiceSuccess = (data) => {
      if (data.dossierId === currentDossier?._id) {
        dispatch(updateCurrentDossierFromSocket(data.updatedDossier));
      }
    };

    subscribeToEvent('invoice_generation_success', handleInvoiceSuccess);

    return () => {
      unsubscribeFromEvent('invoice_generation_success', handleInvoiceSuccess);
    };
  }, [dispatch, currentDossier?._id]);

  const { activeInvoices, archivedInvoices } = useMemo(() => {
    const allInvoices = currentDossier?.factures || [];
    return {
      activeInvoices: allInvoices.filter(inv => inv.status !== 'archived').sort((a, b) => new Date(b.dateCreation) - new Date(a.dateCreation)),
      archivedInvoices: allInvoices.filter(inv => inv.status === 'archived').sort((a, b) => new Date(b.dateCreation) - new Date(a.dateCreation))
    };
  }, [currentDossier]);

  useEffect(() => {
    if (selectedInvoice?._id) {
      const updatedInvoice = currentDossier?.factures.find(inv => inv._id === selectedInvoice._id);
      setSelectedInvoice(updatedInvoice || null);
    }
  }, [currentDossier, selectedInvoice?._id]);
  
  useEffect(() => {
    const currentSelectionIsActive = selectedInvoice && activeInvoices.some(inv => inv._id === selectedInvoice._id);

    if (!currentSelectionIsActive && activeInvoices.length > 0) {
      const newSelection = activeInvoices[0];
      setSelectedInvoice(newSelection);

      if (newSelection.status === 'pending') {
        setShowPaymentInput(true);
      } else {
        setShowPaymentInput(false);
      }
    } 
    else if (activeInvoices.length === 0) {
      setSelectedInvoice(null);
      setShowPaymentInput(false);
    }
    
  }, [activeInvoices]);

  const handleOpenInvoiceFile = (invoice) => {
    const socket = initSocket();
    if (socket && socket.connected) {
      const docToOpen = {
        _id: currentDossier._id, 
        nomDocument: invoice.nomDocument
      };
      
      socket.emit('message', JSON.stringify({ type: 'display-file', data: docToOpen }));
    } else {
      toast.error("Connexion à l'application de bureau perdue.");
    }
  };

  const handleSelectInvoice = (invoice) => {
    if (selectedInvoice?._id === invoice._id) {
      setShowPaymentInput(!showPaymentInput);
    } else {
      setSelectedInvoice(invoice);
      setShowPaymentInput(true);
    }
    setPaymentAmount('');
  };

  const handleAddPayment = async () => {
    if (!paymentAmount || isNaN(paymentAmount) || !selectedInvoice) return;
    setIsSubmitting(true);
    await dispatch(addPaymentToInvoice(currentDossier._id, selectedInvoice._id, paymentAmount, token));
    setPaymentAmount('');
    setIsSubmitting(false);
  };
  
  const handleArchiveInvoice = async (invoiceId) => {
    setIsSubmitting(true);
    await dispatch(archiveInvoice(currentDossier._id, invoiceId, token));
    setIsSubmitting(false);
  };
  
  const handleOpenArchiveModal = () => {
    setSelectedArchivedInvoice(null);
    setShowArchiveModal(true);
  };

  const handleCloseArchiveModal = () => {
    setShowArchiveModal(false);
    setSelectedArchivedInvoice(null);
  };

  const handleBackToList = () => {
    setSelectedArchivedInvoice(null);
  };
  
  const handleOverlayClick = () => {
    if (selectedArchivedInvoice) {
      handleBackToList();
    } else {
      handleCloseArchiveModal();
    }
  };

  const InvoiceDetailPanel = () => {
    if (!selectedInvoice) {
      return (
        <HoverToSpeak textToSpeak="Selectionnez une facture pour voir les details et gerer les paiements">
          <div className="invoice-detail-placeholder">Sélectionnez une facture pour voir les détails et gérer les paiements.</div>
        </HoverToSpeak>
      );
    }

    const totalPaid = (selectedInvoice.payments || []).reduce((sum, p) => sum + p.amount, 0);
    const remainingAmount = selectedInvoice.totalTTC - totalPaid;
    const fmtEur = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

    return (
      <div className="invoice-detail-content">
        <HoverToSpeak textToSpeak="Titre: Details de la facture">
          <h3>Détails de la facture</h3>
        </HoverToSpeak>
        <div className="payment-summary">
          <HoverToSpeak textToSpeak={`Total Facture: ${fmtEur(selectedInvoice.totalTTC)}`}>
            <div className="summary-item">
              <span>Total Facture :</span>
              <span>{fmtEur(selectedInvoice.totalTTC)}</span>
            </div>
          </HoverToSpeak>
          <HoverToSpeak textToSpeak={`Total Paye: ${fmtEur(totalPaid)}`}>
            <div className="summary-item">
              <span>Total Payé :</span>
              <span>{fmtEur(totalPaid)}</span>
            </div>
          </HoverToSpeak>
          <HoverToSpeak textToSpeak={`Restant du: ${fmtEur(remainingAmount)}`}>
            <div className="summary-item remaining">
              <span>Restant dû :</span>
              <span>{fmtEur(remainingAmount)}</span>
            </div>
          </HoverToSpeak>
        </div>
        {showPaymentInput && selectedInvoice.status === 'pending' && (
          <div className="payment-input-container">
            <input
              type="text"
              inputMode="decimal"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="Montant du paiement reçu"
              className="payment-input"
              autoFocus
              onMouseEnter={() => { if (isSpeechEnabled) speak(paymentAmount ? `Champ Montant du paiement: ${paymentAmount}` : 'Champ Montant du paiement recu, saisissez le montant'); }}
              onMouseLeave={() => { if (isSpeechEnabled) stopSpeaking(); }}
            />
            <HoverToSpeak textToSpeak={isSubmitting ? 'Validation en cours' : 'Bouton Valider le paiement'}>
              <button onClick={handleAddPayment} className="validate-payment-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Validation...' : 'Valider'}
              </button>
            </HoverToSpeak>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="facture-container">
      <div className="facture-content-wrapper">
        <div className="invoice-list-pane">
          <div className="pane-header">
            {archivedInvoices.length > 0 &&
              <HoverToSpeak textToSpeak={`Bouton Voir les archives, ${archivedInvoices.length} facture${archivedInvoices.length > 1 ? 's' : ''} archivee${archivedInvoices.length > 1 ? 's' : ''}`}>
                <button className="archive-link-btn" onClick={handleOpenArchiveModal}>
                  Voir les archives ({archivedInvoices.length})
                </button>
              </HoverToSpeak>
            }
          </div>
          <div className="invoice-list">
            {activeInvoices.length > 0 ? (
              activeInvoices.map(invoice => {
                const totalPaid = (invoice.payments || []).reduce((sum, p) => sum + p.amount, 0);
                const remainingAmount = invoice.totalTTC - totalPaid;
                const isPaid = remainingAmount <= 0.005;

                const textToSpeak = `Facture du ${new Date(invoice.dateCreation).toLocaleDateString('fr-FR')}, solde restant : ${remainingAmount.toFixed(2).replace('.', ' virgule ')} euros.`;

                return (
                  <HoverToSpeak key={invoice._id} textToSpeak={textToSpeak}>
                    <div 
                      className={`invoice-list-item-card ${isPaid ? 'paid' : ''} ${selectedInvoice?._id === invoice._id ? 'selected' : ''}`}
                      onClick={() => handleSelectInvoice(invoice)}
                    >
                      <div className="invoice-card-header">
                        <span className="invoice-card-name">Facture</span>
                        <span className="invoice-card-amount">
                          {remainingAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </span>
                      </div>
                      <div className="invoice-card-body">
                        <span className="invoice-card-date">
                          Créée le {new Date(invoice.dateCreation).toLocaleDateString('fr-FR')}
                        </span>
                        {isPaid && <span className="invoice-paid-status">Facture Honorée</span>}
                      </div>
                      <div className="invoice-card-actions">
                        <HoverToSpeak textToSpeak="Bouton Editer la facture">
                          <button className="edit-invoice-btn" onClick={(e) => { e.stopPropagation(); handleOpenInvoiceFile(invoice); }}>
                            Éditer la facture
                          </button>
                        </HoverToSpeak>
                        {/* --- MODIFICATION : Le bouton "Archiver" est retiré ---
                           Le processus est maintenant automatique via le backend lorsque le solde est à zéro.
                        */}
                      </div>
                    </div>
                  </HoverToSpeak>
                );
              })
            ) : (
              <HoverToSpeak textToSpeak="Aucune facture active pour ce dossier">
                <p className="no-invoices-message">Aucune facture active pour ce dossier.</p>
              </HoverToSpeak>
            )}
          </div>
        </div>
        <div className="invoice-detail-pane">
          <InvoiceDetailPanel />
        </div>
      </div>
      
      {showArchiveModal && (
        <div className="archive-modal-overlay" onClick={handleOverlayClick}>
          <div className="archive-modal-content" onClick={e => e.stopPropagation()}>
            <button onClick={handleOverlayClick} className="archive-modal-close-x-btn" title="Fermer ou Retour">
              ×
            </button>

            {selectedArchivedInvoice ? (
              <ArchivedInvoiceDetailModal
                invoice={selectedArchivedInvoice}
                onBack={handleBackToList}
                onEditInvoice={handleOpenInvoiceFile}
              />
            ) : (
              <>
                <h3>Factures Archivées</h3>
                <div className="archived-invoice-list">
                  {archivedInvoices.length > 0 ? (
                    archivedInvoices.map(invoice => {
                      const dateToDisplay = invoice.archivedDate ? new Date(invoice.archivedDate) : new Date(invoice.dateCreation);
                      const formattedDate = dateToDisplay.toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      });
                      const displayText = `Facture du ${formattedDate}`;
                      const textToSpeak = `Facture archivée le ${formattedDate}`;

                      return (
                        <HoverToSpeak key={invoice._id} textToSpeak={textToSpeak}>
                          <div className="archived-invoice-item">
                            <span>{displayText}</span>
                            <button 
                              className="view-details-icon-btn" 
                              onClick={() => setSelectedArchivedInvoice(invoice)}
                              title="Voir les détails"
                            >
                              <img src={Voir} alt="Voir les détails" className="k-icon-sm" />
                            </button>
                          </div>
                        </HoverToSpeak>
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