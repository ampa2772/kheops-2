// client/src/components/cabinet/CabinetCsvImport.js
//
// Import d'un releve bancaire au format CSV. Les debits sont importes comme
// depenses non-classees (categorie au choix). L'utilisateur ajuste ensuite
// chaque depense individuellement (categorie, TVA deductible, etc.).
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchExpenses,
  fetchBilan,
} from '../../redux/slices/cabinetSlice';
import cabinetApi from '../../services/cabinetService';
import './cabinet.css';

const CabinetCsvImport = () => {
  const dispatch = useDispatch();
  const constants = useSelector(s => s.cabinet.constants);

  const [csvText, setCsvText] = useState('');
  const [categorieParDefaut, setCategorieParDefaut] = useState('autre');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleImport = async () => {
    if (!csvText.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await cabinetApi.importCsv(csvText, categorieParDefaut);
      setResult(r);
      dispatch(fetchExpenses({}));
      dispatch(fetchBilan({}));
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="k-cab-section">
        <h4 className="k-cab-section-title">Import d'un releve bancaire</h4>
        <p className="k-cab-section-subtitle">
          Exportez votre releve bancaire au format CSV (depuis votre espace en ligne) et collez le contenu ci-dessous.
          Format attendu (header obligatoire) : <code>date;libelle;debit;credit</code> ou <code>date;libelle;montant</code>.
          Les credits (entrees d'argent) sont ignores : ils correspondent aux paiements clients deja traces dans la facturation.
          Les debits sont importes comme depenses dans la categorie selectionnee — vous ajusterez ensuite manuellement la categorie, la TVA et le fournisseur de chaque depense.
        </p>

        <div className="k-cab-form-grid full">
          <div className="k-cab-field">
            <label>Categorie a appliquer aux depenses importees</label>
            <select value={categorieParDefaut} onChange={e => setCategorieParDefaut(e.target.value)}>
              {(constants?.categoriesDepenses || []).map(c => (
                <option key={c.code} value={c.code}>{c.icone} {c.label}</option>
              ))}
            </select>
            <div className="help">Vous pourrez ensuite reclasser chaque depense individuellement depuis l'onglet "Depenses".</div>
          </div>
          <div className="k-cab-field">
            <label>Contenu CSV</label>
            <textarea
              rows={10}
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder="date;libelle;debit;credit&#10;2026-01-05;LOYER CABINET;1500;&#10;2026-01-08;ABONNEMENT LEXBASE;120;&#10;2026-01-12;HONORAIRES CLIENT MARTIN;;3500"
              style={{
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                padding: '0.5rem',
                border: '1px solid #d1d5db',
                borderRadius: 8,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <button className="k-cab-btn k-cab-btn-primary" onClick={handleImport} disabled={!csvText.trim() || loading}>
            {loading ? 'Import en cours...' : 'Lancer l\'import'}
          </button>
          <button className="k-cab-btn k-cab-btn-ghost" onClick={() => { setCsvText(''); setResult(null); setError(''); }}>
            Reinitialiser
          </button>
        </div>

        {error && (
          <div className="k-cab-section" style={{ marginTop: '0.6rem', background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>
            {error}
          </div>
        )}

        {result && (
          <div className="k-cab-section" style={{ marginTop: '0.85rem', background: '#ecfdf5', borderColor: '#34d399', color: '#065f46' }}>
            <strong>Import termine.</strong>
            <div style={{ marginTop: '0.3rem' }}>
              ✓ {result.imported} depense(s) importee(s) · {result.ignored} ligne(s) ignoree(s) (credits ou montants nuls)
              {result.errors?.length > 0 && (
                <> · ⚠ {result.errors.length} ligne(s) en erreur</>
              )}
            </div>
            {result.errors?.length > 0 && (
              <ul style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
                {result.errors.map((e, i) => (
                  <li key={i}>Ligne {e.ligne} : {e.raison}</li>
                ))}
              </ul>
            )}
            <div style={{ marginTop: '0.4rem', fontSize: '0.85rem' }}>
              Allez dans l'onglet <strong>Depenses</strong> pour ajuster la categorie de chaque depense importee.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CabinetCsvImport;
