import React from 'react';
import { useSelector } from 'react-redux';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import BTN_RetourArriere from '../../../../../assets/en-arriere.svg';
import './BilanFacturation.css'; // On réutilise le style du bilan

const ArchivedInvoiceDetailModal = ({ invoice, onBack, onEditInvoice }) => {
    const { dossier: currentDossier } = useSelector(state => state.currentDossier);
    const { user } = useSelector(state => state.login);
    const vatRate = user?.vatRate || 20;

    const handleEditClick = () => {
        if (!currentDossier || !invoice) return;
        
        const docToOpen = {
            _id: currentDossier._id,
            nomDocument: invoice.nomDocument
        };
        onEditInvoice(docToOpen);
    };

    const formatDate = (date) => new Date(date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const renderContent = () => {
        if (!invoice || !Array.isArray(invoice.billedItems)) {
            return (
                <HoverToSpeak textToSpeak="Details de facturation non disponibles ou invalides">
                    <p className="bilan-message">Détails de facturation non disponibles ou invalides.</p>
                </HoverToSpeak>
            );
        }

        const billedItems = invoice.billedItems;
        const billedEvents = billedItems.filter(item => item.type === 'event');
        const billedDocuments = billedItems.filter(item => item.type === 'document');

        const totalEventsHT = billedEvents.reduce((sum, item) => sum + item.total_ht, 0);
        const totalDocumentsHT = billedDocuments.reduce((sum, item) => sum + item.total_ht, 0);

        const totalEventsTTC = totalEventsHT * (1 + vatRate / 100);
        const totalDocumentsTTC = totalDocumentsHT * (1 + vatRate / 100);
        const grandTotalTTC = invoice.totalTTC;
        const fmt = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

        return (
            <div className="bilan-facturation-wrapper">
                <div className="bilan-facturation-container">
                    <div className="bilan-section">
                        <HoverToSpeak textToSpeak={`Section: Evenements factures, ${billedEvents.length}`}>
                            <h3 className="section-title">Événements Facturés</h3>
                        </HoverToSpeak>
                        <div className="bilan-list">
                            {billedEvents.length > 0 ? billedEvents.map(item => (
                                <HoverToSpeak key={item.id} textToSpeak={`Événement: ${item.description}`}>
                                    <div className="bilan-item">
                                        <div className="bilan-item-date">{formatDate(item.date_prestation)}</div>
                                        <div className="bilan-item-title">{item.description}</div>
                                        <div className="bilan-item-billing">Facturation (TTC): {(item.total_ht * (1 + vatRate / 100)).toFixed(2)} €</div>
                                    </div>
                                </HoverToSpeak>
                            )) : (
                                <HoverToSpeak textToSpeak="Aucun evenement facture">
                                    <p className="bilan-list-empty">Aucun événement facturé.</p>
                                </HoverToSpeak>
                            )}
                        </div>
                    </div>
                    <div className="bilan-section">
                        <HoverToSpeak textToSpeak={`Section: Documents factures, ${billedDocuments.length}`}>
                            <h3 className="section-title">Documents Facturés</h3>
                        </HoverToSpeak>
                        <div className="bilan-list">
                            {billedDocuments.length > 0 ? billedDocuments.map(item => (
                                <HoverToSpeak key={item.id} textToSpeak={`Document: ${item.description}`}>
                                    <div className="bilan-item">
                                        <div className="bilan-item-date">{formatDate(item.date_prestation)}</div>
                                        <div className="bilan-item-title">{item.description}</div>
                                        <div className="bilan-item-billing">Facturation (TTC): {(item.total_ht * (1 + vatRate / 100)).toFixed(2)} €</div>
                                    </div>
                                </HoverToSpeak>
                            )) : (
                                <HoverToSpeak textToSpeak="Aucun document facture">
                                    <p className="bilan-list-empty">Aucun document facturé.</p>
                                </HoverToSpeak>
                            )}
                        </div>
                    </div>
                </div>
                <div className="facturation-summary-grid">
                    <HoverToSpeak textToSpeak={`Total Evenements: ${fmt(totalEventsTTC)}`}>
                        <div className="summary-cell">
                            <span className="summary-label">Total Événements:</span>
                            <span className="summary-value">{fmt(totalEventsTTC)}</span>
                        </div>
                    </HoverToSpeak>
                    <HoverToSpeak textToSpeak={`Total Documents: ${fmt(totalDocumentsTTC)}`}>
                        <div className="summary-cell cell-right">
                            <span className="summary-label">Total Documents:</span>
                            <span className="summary-value">{fmt(totalDocumentsTTC)}</span>
                        </div>
                    </HoverToSpeak>
                    <HoverToSpeak textToSpeak={`Total Facture: ${fmt(grandTotalTTC)}`}>
                        <div className="summary-cell grand-total cell-bottom">
                            <span className="summary-label">Total Facture:</span>
                            <span className="summary-value">{fmt(grandTotalTTC)}</span>
                        </div>
                    </HoverToSpeak>
                    <div className="summary-cell button-cell cell-right cell-bottom">
                        <HoverToSpeak textToSpeak="Bouton Editer la facture">
                            <button className="generate-invoice-btn" onClick={handleEditClick}>
                                Éditer la facture
                            </button>
                        </HoverToSpeak>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            <div className="archive-detail-header">
                <HoverToSpeak textToSpeak="Bouton retour a la liste des archives">
                    <button onClick={onBack} className="back-to-list-btn" title="Retour à la liste">
                        <img src={BTN_RetourArriere} alt="Retour" className="k-icon-md" />
                    </button>
                </HoverToSpeak>
                <HoverToSpeak textToSpeak={`Detail de la facture: ${invoice.nomDocument}`}>
                    <h3 className="archive-detail-title">Détail de la facture : {invoice.nomDocument}</h3>
                </HoverToSpeak>
            </div>
            {renderContent()}
        </>
    );
};

export default ArchivedInvoiceDetailModal;