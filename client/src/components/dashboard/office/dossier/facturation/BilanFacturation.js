import React, { useMemo, useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { initSocket, subscribeToEvent, unsubscribeFromEvent } from '../../../../../services/socketService';
import { useToast } from '../../../../common/notifications/useToast';
import './BilanFacturation.css';
import HoverToSpeak from '../../../../common/HoverToSpeak';

const BilanFacturation = ({ onInvoiceGenerated }) => {
    const navigate = useNavigate();
    const toast = useToast();
    const { dossier: currentDossier } = useSelector(state => state.currentDossier);
    const { dossierEvents, loadingDossierEvents } = useSelector(state => state.agenda);

    const { user, token } = useSelector(state => state.login);
    const hourlyRate = user?.hourlyRate || 0;
    const vatRate = user?.vatRate || 0;

    const [billingInfo, setBillingInfo] = useState({});
    const [isCalculatingBilling, setIsCalculatingBilling] = useState(false);

    const { unbilledEvents, unbilledDocuments, activeInvoice } = useMemo(() => {
        const allInvoices = currentDossier?.factures || [];
        const archivedInvoices = allInvoices.filter(inv => inv.status === 'archived');
        const currentActiveInvoice = allInvoices.find(inv => inv.status !== 'archived') || null;

        const permanentlyBilledItemIds = new Set(
            archivedInvoices.flatMap(inv => (inv.billedItems || []).map(item => item.id.toString()))
        );

        const lastArchivedInvoice = archivedInvoices.length > 0
            ? archivedInvoices.sort((a, b) => new Date(b.archivedDate || b.dateCreation) - new Date(a.archivedDate || a.dateCreation))[0]
            : null;
        
        const lastArchivedDate = lastArchivedInvoice
            ? new Date(lastArchivedInvoice.archivedDate || lastArchivedInvoice.dateCreation)
            : new Date(0); 

        const filteredEvents = (dossierEvents || [])
            .filter(event => 
                (event.type === 'event' || !event.type) &&
                !permanentlyBilledItemIds.has(event._id.toString()) &&
                new Date(event.startDate) > lastArchivedDate
            );

        const filteredDocuments = (currentDossier?.dossier?.documents || [])
            .filter(doc => 
                doc.categorie !== 'dropped' && 
                doc.categorie !== 'facture' && 
                doc.categorie !== 'email_body' &&       // AJOUT : Exclure le corps des e-mails
                doc.categorie !== 'email_attachment' && // AJOUT : Exclure les pièces jointes des e-mails
                !permanentlyBilledItemIds.has(doc._id.toString()) &&
                new Date(doc.dateCreation) > lastArchivedDate
            );

        return {
            unbilledEvents: filteredEvents,
            unbilledDocuments: filteredDocuments,
            activeInvoice: currentActiveInvoice,
        };
    }, [currentDossier, dossierEvents]);

    useEffect(() => {
        if (!currentDossier?._id || unbilledDocuments.length === 0) {
            setBillingInfo({});
            setIsCalculatingBilling(false);
            return;
        }
        const socket = initSocket();
        const request = () => {
            setIsCalculatingBilling(true);
            socket.emit('message', JSON.stringify({
                type: 'calculate_billing_for_dossier',
                data: { dossierId: currentDossier._id, documents: unbilledDocuments }
            }));
        };
        if (socket.connected) {
            request();
        } else {
            socket.once('connect', request);
        }
        return () => socket.off('connect', request);
    }, [unbilledDocuments, currentDossier?._id]);

    useEffect(() => {
        const handleBillingUpdate = (data) => {
            if (data.dossierId === currentDossier?._id) {
                setBillingInfo(prev => {
                    const newInfo = { ...prev, [data.docId]: { charCount: data.charCount, error: data.error } };
                    
                    const allDocsProcessed = unbilledDocuments.every(doc => newInfo.hasOwnProperty(doc._id));
                    if (allDocsProcessed) {
                        setIsCalculatingBilling(false);
                    }
                    
                    return newInfo;
                });
            }
        };

        subscribeToEvent('billing_info_update', handleBillingUpdate);

        return () => {
            unsubscribeFromEvent('billing_info_update', handleBillingUpdate);
        };
    }, [currentDossier?._id, unbilledDocuments]);

    const renderBillingText = (itemId, type) => {
        const info = billingInfo[itemId];

        if (!hourlyRate) return "Taux horaire non défini";
        if (!info) return "Calcul en attente...";

        if (info.error) {
            if (info.error === 'unsupported_format') return "Facturation: N/A";
            if (info.error === 'file_not_found') return "Facturation: Fichier local introuvable";
            return "Facturation: Erreur";
        }

        const vatMultiplier = 1 + (vatRate / 100);

        if (type === 'document' && typeof info.charCount === 'number') {
            const typingSpeedCharsPerMin = 200;
            const minutesToType = info.charCount / typingSpeedCharsPerMin;
            const hoursToType = minutesToType / 60;
            const priceHT = hoursToType * hourlyRate;
            const priceTTC = priceHT * vatMultiplier;
            return `Facturation (TTC) : ${priceTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`;
        }
    };

    const documentItems = useMemo(() => {
        return unbilledDocuments
            .map(doc => {
                const docDate = new Date(doc.dateCreation);
                const dateForSpeech = docDate.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                const docTitle = doc.nomDocument.replace(/\.(docx|pdf|doc|rtf)$/i, '');
                return {
                    id: doc._id,
                    date: docDate,
                    title: docTitle,
                    speechText: `Document: ${docTitle}, créé le ${dateForSpeech}.`
                };
            })
            .sort((a, b) => b.date - a.date);
    }, [unbilledDocuments]);

    const eventItems = useMemo(() => {
        return unbilledEvents
            .map(event => {
                const startDate = new Date(event.startDate);
                const endDate = new Date(event.endDate);

                const durationMs = endDate.getTime() - startDate.getTime();
                const durationHours = durationMs > 0 ? durationMs / (1000 * 60 * 60) : 0;
                const priceTTC = (durationHours * hourlyRate * (1 + (vatRate / 100)));

                const durationMinutes = Math.floor(durationMs / 60000);
                const hours = Math.floor(durationMinutes / 60);
                const minutes = durationMinutes % 60;

                const durationDisplay = `${hours}h${minutes > 0 ? `${minutes.toString().padStart(2, '0')}` : ''}`.trim();
                const dateForSpeech = startDate.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                const durationSpeech = `${hours > 0 ? `${hours} heure${hours > 1 ? 's' : ''}` : ''} ${minutes > 0 ? `${minutes} minute${minutes > 1 ? 's' : ''}` : ''}`.trim();

                return {
                    id: event._id,
                    date: startDate,
                    title: event.title,
                    duration: `(Durée: ${durationDisplay})`,
                    billingText: `Facturation (TTC) : ${priceTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`,
                    priceTTC: priceTTC,
                    speechText: `Événement: ${event.title}, le ${dateForSpeech}, pour une durée de ${durationSpeech || 'moins d\'une minute'}.`,
                };
            })
            .sort((a, b) => b.date - a.date);
    }, [unbilledEvents, hourlyRate, vatRate]);

    const totalEventsTTC = useMemo(() => {
        return eventItems.reduce((sum, item) => sum + (item.priceTTC || 0), 0);
    }, [eventItems]);

    const totalDocumentsTTC = useMemo(() => {
        return documentItems.reduce((sum, doc) => {
            const info = billingInfo[doc.id];
            if (info && !info.error && typeof info.charCount === 'number') {
                const typingSpeedCharsPerMin = 200;
                const minutesToType = info.charCount / typingSpeedCharsPerMin;
                const hoursToType = minutesToType / 60;
                const priceHT = hoursToType * hourlyRate;
                const priceTTC = priceHT * (1 + (vatRate / 100));
                return sum + priceTTC;
            }
            return sum;
        }, 0);
    }, [documentItems, billingInfo, hourlyRate, vatRate]);

    const grandTotalTTC = useMemo(() => {
        return totalEventsTTC + totalDocumentsTTC;
    }, [totalEventsTTC, totalDocumentsTTC]);

    const totalPaid = useMemo(() => {
        return (activeInvoice?.payments || []).reduce((sum, p) => sum + p.amount, 0);
    }, [activeInvoice]);

    const remainingBalance = useMemo(() => {
        return grandTotalTTC - totalPaid;
    }, [grandTotalTTC, totalPaid]);

    const totalEventsSpeech = `Total des événements, ${totalEventsTTC.toFixed(2).replace('.', ' virgule ')} euros.`;
    const totalDocumentsSpeech = `Total des documents, ${totalDocumentsTTC.toFixed(2).replace('.', ' virgule ')} euros.`;
    const grandTotalSpeech = `Total des prestations, ${grandTotalTTC.toFixed(2).replace('.', ' virgule ')} euros.`;
    const totalPaidSpeech = `Acomptes versés, ${totalPaid.toFixed(2).replace('.', ' virgule ')} euros.`;
    const remainingBalanceSpeech = `Solde restant à facturer, ${remainingBalance.toFixed(2).replace('.', ' virgule ')} euros.`;

    const handleGenerateInvoice = () => {
        if (!currentDossier?._id) {
            toast.warning("Impossible de générer la facture : aucun dossier n'est sélectionné.");
            return;
        }

        const socket = initSocket();
        if (socket && socket.connected) {
            socket.emit('message', JSON.stringify({
                type: 'generate_invoice',
                data: {
                    dossierId: currentDossier._id,
                    hourlyRate: user?.hourlyRate,
                    vatRate: user?.vatRate,
                    token: token,
                }
            }));
            if (onInvoiceGenerated) {
                onInvoiceGenerated();
            }
        } else {
            toast.error("Connexion avec l'application de bureau perdue. Impossible de générer la facture.");
        }
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    if (loadingDossierEvents || isCalculatingBilling) {
        return <div className="bilan-message">Calcul du bilan en cours...</div>;
    }

    const hasUnbilledItems = unbilledEvents.length > 0 || unbilledDocuments.length > 0;

    if (!hasUnbilledItems) {
        return (
            <div className="bilan-facturation-wrapper all-settled">
                <div className="bilan-message full-height-message">
                    Aucune nouvelle prestation facturable dans ce dossier.
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
                        <p>Veuillez configurer votre taux horaire dans les paramètres avant de pouvoir générer une facture.</p>
                    </div>
                    <button
                        className="bilan-error-action-btn"
                        onClick={() => navigate('/dashboard/parametres', { state: { activeTab: 'billing' } })}
                    >
                        Configurer le taux horaire
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bilan-facturation-wrapper">
            <div className="bilan-facturation-container">
                <div className="bilan-section">
                    <HoverToSpeak textToSpeak={`Section: Evenements, ${eventItems.length} a facturer`}>
                        <h3 className="section-title">Événements</h3>
                    </HoverToSpeak>
                    <div className="bilan-list events-list">
                        {eventItems.length > 0 ? (
                            eventItems.map(item => (
                                <HoverToSpeak key={item.id} textToSpeak={`${item.speechText} ${item.billingText || ''}`}>
                                    <div className="bilan-item">
                                        <div className="bilan-item-date">{formatDate(item.date)}</div>
                                        <div className="bilan-item-title">
                                            {item.title} <span className="bilan-item-duration">{item.duration}</span>
                                        </div>
                                        <div className="bilan-item-billing">
                                            {item.billingText}
                                        </div>
                                    </div>
                                </HoverToSpeak>
                            ))
                        ) : (
                            <HoverToSpeak textToSpeak="Aucun nouvel evenement a facturer">
                                <p className="bilan-list-empty">Aucun nouvel événement à facturer.</p>
                            </HoverToSpeak>
                        )}
                    </div>
                </div>

                <div className="bilan-section">
                    <HoverToSpeak textToSpeak={`Section: Documents, ${documentItems.length} a facturer`}>
                        <h3 className="section-title">Documents</h3>
                    </HoverToSpeak>
                    <div className="bilan-list documents-list">
                        {documentItems.length > 0 ? (
                            documentItems.map(item => (
                                <HoverToSpeak key={item.id} textToSpeak={`${item.speechText} ${renderBillingText(item.id, 'document') || ''}`}>
                                    <div className="bilan-item">
                                        <div className="bilan-item-date">{formatDate(item.date)}</div>
                                        <div className="bilan-item-title">{item.title}</div>
                                        <div className="bilan-item-billing">
                                            {renderBillingText(item.id, 'document')}
                                        </div>
                                    </div>
                                </HoverToSpeak>
                            ))
                        ) : (
                            <HoverToSpeak textToSpeak="Aucun nouveau document a facturer">
                                <p className="bilan-list-empty">Aucun nouveau document à facturer.</p>
                            </HoverToSpeak>
                        )}
                    </div>
                </div>
            </div>

            <div className="facturation-summary-grid">
                {totalPaid > 0 ? (
                    // ----- Affichage COMPLET (avec acompte) -----
                    <>
                        <HoverToSpeak textToSpeak={totalEventsSpeech}>
                            <div className="summary-cell">
                                <span className="summary-label">Total Événements :</span>
                                <span className="summary-value">
                                    {totalEventsTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                </span>
                            </div>
                        </HoverToSpeak>

                        <HoverToSpeak textToSpeak={totalDocumentsSpeech}>
                            <div className="summary-cell cell-right">
                                <span className="summary-label">Total Documents :</span>
                                <span className="summary-value">
                                    {totalDocumentsTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                </span>
                            </div>
                        </HoverToSpeak>

                        <HoverToSpeak textToSpeak={grandTotalSpeech}>
                            <div className="summary-cell cell-bottom">
                                <span className="summary-label">Total Prestations :</span>
                                <span className="summary-value">
                                    {grandTotalTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                </span>
                            </div>
                        </HoverToSpeak>

                        <HoverToSpeak textToSpeak={totalPaidSpeech}>
                            <div className="summary-cell cell-right cell-bottom summary-cell--paid">
                                <span className="summary-label">Acomptes versés :</span>
                                <span className="summary-value">
                                   - {totalPaid.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                </span>
                            </div>
                        </HoverToSpeak>

                        <HoverToSpeak textToSpeak={remainingBalanceSpeech}>
                            <div className="summary-cell grand-total cell-bottom">
                                <span className="summary-label">Solde à facturer :</span>
                                <span className="summary-value grand-total-value">
                                    {remainingBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                </span>
                            </div>
                        </HoverToSpeak>

                        <HoverToSpeak textToSpeak="Mettre à jour la facture avec ces nouvelles prestations">
                            <div className="summary-cell button-cell cell-right cell-bottom">
                                <button className="generate-invoice-btn" onClick={handleGenerateInvoice} disabled={!hourlyRate || grandTotalTTC <= 0}>
                                    Générer / Mettre à jour la facture
                                </button>
                            </div>
                        </HoverToSpeak>
                    </>
                ) : (
                    // ----- Affichage SIMPLIFIÉ (sans acompte) -----
                    <>
                        <HoverToSpeak textToSpeak={totalEventsSpeech}>
                            <div className="summary-cell">
                                <span className="summary-label">Total Événements :</span>
                                <span className="summary-value">
                                    {totalEventsTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                </span>
                            </div>
                        </HoverToSpeak>

                        <HoverToSpeak textToSpeak={totalDocumentsSpeech}>
                            <div className="summary-cell cell-right">
                                <span className="summary-label">Total Documents :</span>
                                <span className="summary-value">
                                    {totalDocumentsTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                </span>
                            </div>
                        </HoverToSpeak>

                        <HoverToSpeak textToSpeak={remainingBalanceSpeech}>
                            <div className="summary-cell grand-total cell-bottom">
                                <span className="summary-label">Solde à facturer :</span>
                                <span className="summary-value grand-total-value">
                                    {remainingBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                </span>
                            </div>
                        </HoverToSpeak>

                        <HoverToSpeak textToSpeak="Générer la facture avec ces prestations">
                            <div className="summary-cell button-cell cell-right cell-bottom">
                                <button className="generate-invoice-btn" onClick={handleGenerateInvoice} disabled={!hourlyRate || grandTotalTTC <= 0}>
                                    Générer / Mettre à jour la facture
                                </button>
                            </div>
                        </HoverToSpeak>
                    </>
                )}
            </div>
        </div>
    );
};

export default BilanFacturation;