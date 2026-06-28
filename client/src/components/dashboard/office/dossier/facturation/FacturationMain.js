// Kheops_2/client/src/components/dashboard/office/dossier/facturation/FacturationMain.js
import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { initSocket } from '../../../../../services/socketService';
import BilanFacturation from './BilanFacturation';
import Facture from './Facture';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import './FacturationMain.css';

const FacturationMain = () => {
  const [activeSubTab, setActiveSubTab] = useState('bilan');

  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  const { user, token } = useSelector(state => state.login);

  // Fonction qui sera appelée par BilanFacturation pour changer d'onglet
  const handleSwitchToFacturesTab = () => {
    setActiveSubTab('facture');
  };

  // Clic sur l'onglet "Factures" : génère/met à jour la facture PUIS affiche l'onglet
  const handleFacturesTabClick = () => {
    if (currentDossier?._id) {
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
      }
    }
    setActiveSubTab('facture');
  };

  return (
    <div className="facturation-main-container">
      <div className="facturation-sub-tabs">
        <HoverToSpeak textToSpeak="Afficher le bilan de facturation">
          <div
            className={`sub-tab ${activeSubTab === 'bilan' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('bilan')}
          >
            Bilan facturation
          </div>
        </HoverToSpeak>
        <HoverToSpeak textToSpeak="Générer et gérer les factures">
          <div
            className={`sub-tab ${activeSubTab === 'facture' ? 'active' : ''}`}
            onClick={handleFacturesTabClick}
          >
            Factures
          </div>
        </HoverToSpeak>
      </div>
      <div className="facturation-sub-tab-content">
        {activeSubTab === 'bilan' && <BilanFacturation onInvoiceGenerated={handleSwitchToFacturesTab} />}
        {activeSubTab === 'facture' && <Facture />}
      </div>
    </div>
  );
};

export default FacturationMain;