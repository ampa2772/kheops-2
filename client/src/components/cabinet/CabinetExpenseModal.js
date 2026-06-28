// client/src/components/cabinet/CabinetExpenseModal.js
//
// Modale de creation / edition d'une depense (CabinetExpense).
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import cabinetApi from '../../services/cabinetService';
import {
  upsertExpenseLocal,
  fetchBilan,
} from '../../redux/slices/cabinetSlice';
import { toDateInputValue, ttcFromHt, htFromTtc, formatMontant } from './cabinetHelpers';
import './cabinet.css';

const CabinetExpenseModal = ({ open, onClose, initialExpense = null }) => {
  const dispatch = useDispatch();
  const constants = useSelector(s => s.cabinet.constants);
  const dossiers = useSelector(s => s.last25Dossiers?.lastDossiers || []);

  const isEdit = !!(initialExpense && initialExpense._id);

  const [form, setForm] = useState(() => ({
    date: toDateInputValue(initialExpense?.date || new Date()),
    libelle: initialExpense?.libelle || '',
    categorie: initialExpense?.categorie || '',
    montantHT: initialExpense?.montantHT ?? '',
    tauxTVA: initialExpense?.tauxTVA ?? 20,
    montantTTC: initialExpense?.montantTTC ?? '',
    devise: initialExpense?.devise || 'EUR',
    modePaiement: initialExpense?.modePaiement || '',
    fournisseurNom: initialExpense?.fournisseurNom || '',
    fournisseurSiret: initialExpense?.fournisseurSiret || '',
    tvaDeductible: initialExpense?.tvaDeductible ?? true,
    dossierId: initialExpense?.dossierId || '',
    notes: initialExpense?.notes || '',
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Quand HT ou taux change, on recalcule TTC.
  // Quand TTC change manuellement, on recalcule HT.
  const [lastEdited, setLastEdited] = useState('ht');                  // 'ht' | 'ttc'

  useEffect(() => {
    if (lastEdited === 'ht') {
      const ttc = ttcFromHt(form.montantHT, form.tauxTVA);
      if (Number(form.montantTTC) !== ttc) {
        setForm(f => ({ ...f, montantTTC: ttc }));
      }
    } else {
      const ht = htFromTtc(form.montantTTC, form.tauxTVA);
      if (Number(form.montantHT) !== ht) {
        setForm(f => ({ ...f, montantHT: ht }));
      }
    }
  }, [form.montantHT, form.tauxTVA, form.montantTTC, lastEdited]); // eslint-disable-line

  // Quand la categorie change, ajuster tvaDeductible par defaut
  useEffect(() => {
    if (!constants?.categoriesDepenses) return;
    const cat = constants.categoriesDepenses.find(c => c.code === form.categorie);
    if (cat) {
      setForm(f => ({ ...f, tvaDeductible: cat.tvaDeductibleParDefaut }));
    }
  }, [form.categorie, constants?.categoriesDepenses]);

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setError('');
    if (!form.libelle.trim()) { setError('Libelle requis.'); return; }
    if (!form.categorie) { setError('Categorie requise.'); return; }
    const ht = Number(form.montantHT);
    if (!Number.isFinite(ht) || ht < 0) { setError('Montant HT invalide.'); return; }

    setSaving(true);
    try {
      const payload = {
        date: form.date || new Date().toISOString(),
        libelle: form.libelle.trim(),
        categorie: form.categorie,
        montantHT: ht,
        tauxTVA: Number(form.tauxTVA) || 0,
        montantTTC: Number(form.montantTTC) || ttcFromHt(ht, form.tauxTVA),
        devise: form.devise,
        modePaiement: form.modePaiement || '',
        fournisseurNom: form.fournisseurNom || '',
        fournisseurSiret: form.fournisseurSiret || '',
        tvaDeductible: !!form.tvaDeductible,
        dossierId: form.dossierId || null,
        notes: form.notes || '',
      };
      const resp = isEdit
        ? await cabinetApi.patchExpense(initialExpense._id, payload)
        : await cabinetApi.createExpense(payload);
      dispatch(upsertExpenseLocal(resp.expense));
      dispatch(fetchBilan({}));                                          // refresh KPI
      onClose && onClose(resp.expense);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="k-cab-modal-backdrop" role="dialog" aria-modal="true">
      <div className="k-cab-modal">
        <div className="k-cab-modal-header">
          <h3 className="k-cab-modal-title">{isEdit ? 'Modifier la depense' : 'Nouvelle depense'}</h3>
          <button className="k-cab-modal-close" onClick={() => onClose && onClose(null)} aria-label="Fermer">×</button>
        </div>

        <div className="k-cab-modal-body">
          {error && (
            <div className="k-cab-section" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>
              {error}
            </div>
          )}

          <div className="k-cab-form-grid">
            <div className="k-cab-field">
              <label>Date</label>
              <input type="date" value={form.date} onChange={e => setField('date', e.target.value)} />
            </div>
            <div className="k-cab-field">
              <label>Categorie</label>
              <select value={form.categorie} onChange={e => setField('categorie', e.target.value)}>
                <option value="">— Choisir —</option>
                {(constants?.categoriesDepenses || []).map(c => (
                  <option key={c.code} value={c.code}>{c.icone} {c.label}</option>
                ))}
              </select>
            </div>

            <div className="k-cab-field" style={{ gridColumn: '1 / -1' }}>
              <label>Libelle</label>
              <input
                type="text"
                value={form.libelle}
                onChange={e => setField('libelle', e.target.value)}
                placeholder="Ex : Loyer cabinet octobre, abonnement Lexbase, salaire Marie..."
              />
            </div>

            <div className="k-cab-field">
              <label>Fournisseur</label>
              <input
                type="text"
                value={form.fournisseurNom}
                onChange={e => setField('fournisseurNom', e.target.value)}
                placeholder="Ex : SARL Bureautique XYZ"
              />
            </div>
            <div className="k-cab-field">
              <label>SIRET (optionnel)</label>
              <input
                type="text"
                value={form.fournisseurSiret}
                onChange={e => setField('fournisseurSiret', e.target.value)}
              />
            </div>
          </div>

          <div className="k-cab-form-grid cols-3">
            <div className="k-cab-field">
              <label>Montant HT (€)</label>
              <input
                type="number" min="0" step="0.01"
                value={form.montantHT}
                onChange={(e) => { setLastEdited('ht'); setField('montantHT', e.target.value); }}
              />
            </div>
            <div className="k-cab-field">
              <label>Taux TVA</label>
              <select value={form.tauxTVA} onChange={e => { setLastEdited('ht'); setField('tauxTVA', Number(e.target.value)); }}>
                {(constants?.tauxTVA || [{ taux: 20, label: '20 %' }]).map(t => (
                  <option key={t.taux} value={t.taux}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="k-cab-field">
              <label>Montant TTC (€)</label>
              <input
                type="number" min="0" step="0.01"
                value={form.montantTTC}
                onChange={(e) => { setLastEdited('ttc'); setField('montantTTC', e.target.value); }}
              />
            </div>
          </div>

          <div className="k-cab-form-grid">
            <div className="k-cab-field">
              <label>Mode de paiement</label>
              <select value={form.modePaiement} onChange={e => setField('modePaiement', e.target.value)}>
                <option value="">— Aucun —</option>
                {(constants?.modesPaiement || []).map(m => (
                  <option key={m.code} value={m.code}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="k-cab-field">
              <label>Dossier rattache (optionnel)</label>
              <select value={form.dossierId} onChange={e => setField('dossierId', e.target.value)}>
                <option value="">— Aucun (charge generale) —</option>
                {dossiers.map(d => (
                  <option key={d._id} value={d._id}>
                    {d.dossier?.dossier?.nom || d.dossier?.nom || d.reference || d._id.slice(-6)}
                  </option>
                ))}
              </select>
              <div className="help">Permet d'attribuer la depense a un dossier specifique pour le calcul de rentabilite.</div>
            </div>
          </div>

          <div className="k-cab-form-grid full">
            <label className="k-cab-toggle">
              <input
                type="checkbox"
                checked={!!form.tvaDeductible}
                onChange={e => setField('tvaDeductible', e.target.checked)}
              />
              TVA deductible (a inclure dans le calcul du solde TVA a reverser)
            </label>
            <div className="k-cab-field">
              <label>Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={e => setField('notes', e.target.value)}
                placeholder="Reference de facture, contexte, contre-partie..."
              />
            </div>
          </div>
        </div>

        <div className="k-cab-modal-footer">
          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
            {form.montantHT && form.tauxTVA != null
              ? `HT : ${formatMontant(Number(form.montantHT))} · TVA ${form.tauxTVA}% : ${formatMontant(Number(form.montantTTC || 0) - Number(form.montantHT || 0))} · TTC : ${formatMontant(Number(form.montantTTC) || 0)}`
              : 'Saisissez le montant HT pour calculer le TTC automatiquement.'}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="k-cab-btn k-cab-btn-ghost" onClick={() => onClose && onClose(null)}>Annuler</button>
            <button className="k-cab-btn k-cab-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement...' : (isEdit ? 'Enregistrer' : 'Creer la depense')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CabinetExpenseModal;
