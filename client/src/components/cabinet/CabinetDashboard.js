// client/src/components/cabinet/CabinetDashboard.js
//
// Page principale du module Cabinet : sidebar entry "Bilan".
// Onglets :
//  1. Synthese  (CabinetBilan)
//  2. Depenses  (CabinetExpenseList)
//  3. Recurrences (CabinetRecurringExpenseList)
//  4. Rentabilite par dossier (CabinetDossierProfitability)
//  5. Import CSV bancaire (CabinetCsvImport)
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchCabinetConstants,
} from '../../redux/slices/cabinetSlice';
import { fetchLast25Dossiers } from '../../redux/slices/dossierInfoSlice';
import CabinetBilan from './CabinetBilan';
import CabinetExpenseList from './CabinetExpenseList';
import CabinetRecurringExpenseList from './CabinetRecurringExpenseList';
import CabinetDossierProfitability from './CabinetDossierProfitability';
import CabinetCsvImport from './CabinetCsvImport';
import './cabinet.css';

const CabinetDashboard = () => {
  const dispatch = useDispatch();
  const constants = useSelector(s => s.cabinet.constants);
  const [tab, setTab] = useState('synthese');

  useEffect(() => {
    if (!constants) dispatch(fetchCabinetConstants());
    dispatch(fetchLast25Dossiers());
  }, [constants, dispatch]);

  return (
    <div className="k-cab-root">
      <div className="k-cab-section" style={{ padding: '0.85rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#1e3a8a' }}>Bilan comptable du cabinet</h2>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#6b7280' }}>
              Vision holistique : recettes, depenses, benefice et rentabilite par dossier. Outil de pilotage interne (ne se substitue pas a une comptabilite legale).
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="k-cab-tabs">
          {[
            { code: 'synthese', label: 'Synthese' },
            { code: 'depenses', label: 'Depenses' },
            { code: 'recurrences', label: 'Recurrences' },
            { code: 'rentabilite', label: 'Rentabilite par dossier' },
            { code: 'csv-import', label: 'Import CSV bancaire' },
          ].map(t => (
            <button
              key={t.code}
              type="button"
              className={`k-cab-tab ${tab === t.code ? 'active' : ''}`}
              onClick={() => setTab(t.code)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'synthese' && <CabinetBilan />}
        {tab === 'depenses' && <CabinetExpenseList embedded />}
        {tab === 'recurrences' && <CabinetRecurringExpenseList />}
        {tab === 'rentabilite' && <CabinetDossierProfitability />}
        {tab === 'csv-import' && <CabinetCsvImport />}
      </div>
    </div>
  );
};

export default CabinetDashboard;
