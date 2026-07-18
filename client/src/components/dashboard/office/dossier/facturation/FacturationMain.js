// Kheops_2/client/src/components/dashboard/office/dossier/facturation/FacturationMain.js
//
// Conteneur de l'onglet Facturation d'un dossier (sous-onglets Bilan/Factures).
// MODE WEB PUR : la facture se SYNCHRONISE automatiquement avec le contenu du
// dossier (RDV + documents) via POST /invoice/sync —
//   1) à l'ouverture de l'onglet (peu importe quand les éléments ont été créés),
//   2) au clic sur le sous-onglet « Factures » (même action que le bouton
//      « Mettre à jour la facture » du bilan).
// L'ancien socket 'generate_invoice' vers l'app de bureau Electron est retiré.
import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { syncDossierInvoice } from '../../../../../redux/slices/currentDossierSlice';
import BilanFacturation from './BilanFacturation';
import Facture from './Facture';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import './FacturationMain.css';

const FacturationMain = () => {
  const dispatch = useDispatch();
  const [activeSubTab, setActiveSubTab] = useState('bilan');
  const [syncing, setSyncing] = useState(false);

  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  const dossierId = currentDossier?._id;

  const syncInvoice = async () => {
    if (!dossierId) return;
    setSyncing(true);
    try {
      await dispatch(syncDossierInvoice(dossierId));
    } catch (err) {
      // Non bloquant : le bilan reste consultable ; l'utilisateur peut
      // relancer via le bouton « Mettre à jour la facture ».
      console.warn('[Facturation] Synchronisation de la facture impossible:', err.message);
    } finally {
      setSyncing(false);
    }
  };

  // Synchronisation AUTOMATIQUE à l'ouverture de l'onglet (une fois par dossier).
  const syncedForRef = useRef(null);
  useEffect(() => {
    if (dossierId && syncedForRef.current !== dossierId) {
      syncedForRef.current = dossierId;
      syncInvoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierId]);

  // Fonction appelée par BilanFacturation après « Mettre à jour la facture »
  const handleSwitchToFacturesTab = () => {
    setActiveSubTab('facture');
  };

  // Clic sur l'onglet « Factures » : MÊME action que le bouton du bilan —
  // synchronise/génère la facture, puis affiche l'onglet.
  const handleFacturesTabClick = async () => {
    setActiveSubTab('facture');
    await syncInvoice();
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
        <HoverToSpeak textToSpeak="Mettre à jour la facture et gérer les paiements">
          <div
            className={`sub-tab ${activeSubTab === 'facture' ? 'active' : ''}`}
            onClick={handleFacturesTabClick}
          >
            Factures{syncing ? ' …' : ''}
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
