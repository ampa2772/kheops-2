// client/src/components/cabinet/CabinetRecurringExpenseModal.js
//
// Modale de creation / edition d'une depense recurrente (template).
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import cabinetApi from '../../services/cabinetService';
import { upsertRecurrenceLocal } from '../../redux/slices/cabinetSlice';
import { toDateInputValue, ttcFromHt, htFromTtc, formatMontant } from './cabinetHelpers';
import './cabinet.css';

const CabinetRecurringExpenseModal = ({ open, onClose, initialRecurrence = null }) => {
  const dispatch = useDispatch();
  const constants = useSelector(s => s.cabinet.constants);
  const dossiers = useSelector(s => s.last25Dossiers?.lastDossiers || []);
  const isEdit = !!(initialRecurrence && initialRecurrence._id);

  const [form, setForm] = useState(() => ({
    libelle: initialRecurrence?.libelle || '',
    categorie: initialRecurrence?.categorie || '',
    montantHT: initialRecurrence?.montantHT ?? '',
    tauxTVA: initialRecurrence?.tauxTVA ?? 20,
    montantTTC: initialRecurrence?.montantTTC ?? '',
    devise: initialRecurrence?.devise || 'EUR',
    modePaiement: initialRecurrence?.modePaiement || 'prelevement',
    fournisseurNom: initialRecurrence?.fournisseurNom || '',
    fournisseurSiret: initialRecurrence?.fournisseurSiret || '',
    tvaDeductible: initialRecurrence?.tvaDeductible ?? true,
    dossierId: initialRecurrence?.dossierId || '',
    notes: initialRecurrence?.notes || '',
    frequence: initialRecurrence?.frequence || 'mensuelle',
    jourMois: initialRecurrence?.jourMois || 1,
    dateDebut: toDateInputValue(initialRecurrence?.dateDebut || new Date()),
    dateFin: toDateInputValue(initialRecurrence?.dateFin),
    automatique: initialRecurrence?.automatique !== false,
    active: initialRecurrence?.active !== false,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastEdited, setLastEdited] = useState('ht');

  useEffect(() => {
    if (lastEdited === 'ht') {
      const ttc = ttcFromHt(form.montantHT, form.tauxTVA);
      if (Number(form.montantTTC) !== ttc) setForm(f => ({ ...f, montantTTC: ttc }));
    } else {
      const ht = htFromTtc(form.montantTTC, form.tauxTVA);
      if (Number(form.montantHT) !== ht) setForm(f => ({ ...f, montantHT: ht }));
    }
  }, [form.montantHT, form.tauxTVA, form.montantTTC, lastEdited]); // eslint-disable-line

  useEffect(() => {
    if (!constants?.categoriesDepenses) return;
    const cat = constants.categoriesDepenses.find(c => c.code === form.categorie);
    if (cat) setForm(f => ({ ...f, tvaDeductible: cat.tvaDeductibleParDefaut }));
  }, [form.categorie, constants?.categoriesDepenses]);

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setError('');
    if (!form.libelle.trim()) { setError('Libelle requis.'); return; }
    if (!form.categorie) { setError('Categorie requise.'); return; }
    if (!form.frequence) { setError('Frequence requise.'); return; }
    if (!form.dateDebut) { setError('Date de debut requise.'); return; }
    const ht = Number(form.montantHT);
    if (!Number.isFinite(ht) || ht < 0) { setError('Montant HT invalide.'); return; }

    setSaving(true);
    try {
      const payload = {
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
        frequence: form.frequence,
        jourMois: Number(form.jourMois) || 1,
        dateDebut: form.dateDebut,
        dateFin: form.dateFin || null,
        automatique: !!form.automatique,
        active: !!form.active,
      };
      const resp = isEdit
        ? await cabinetApi.patchRecurrence(initialRecurrence._id, payload)
        : await cabinetApi.createRecurrence(payload);
      dispatch(upsertRecurrenceLocal(resp.recurrence));
      onClose && onClose(resp.recurrence);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Erreur de sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="k-cab-modal-backdrop" role="dialog" aria-modal="true">
      <div className="k-cab-modal" style={{ width: 'min(800px, 100%)' }}>
        <div className="k-cab-modal-header">
          <h3 className="k-cab-modal-title">{isEdit ? 'Modifier la recurrence' : 'Nouvelle depense recurrente'}</h3>
          <button className="k-cab-modal-close" onClick={() => onClose && onClose(null)} aria-label="Fermer">×</button>
        </div>

        <div className="k-cab-modal-body">
          {error && (
            <div className="k-cab-section" style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }}>{error}</div>
          )}

          <div className="k-cab-section" style={{ background: '#eff6ff', borderColor: '#93c5fd' }}>
            <strong>Mode de generation</strong>
            <div style={{ fontSize: '0.82rem', color: '#1e40af', marginTop: '0.3rem' }}>
              <label className="k-cab-toggle" style={{ marginRight: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={!!form.automatique}
                  onChange={e => setField('automatique', e.target.checked)}
                />
                <strong>Generation automatique</strong> a chaque echeance
              </label>
              <div style={{ fontSize: '0.78rem', color: '#1e3a8a', marginTop: '0.3rem' }}>
                {form.automatique
                  ? '✓ A chaque ouverture de la page Bilan, les occurrences dues seront creees automatiquement comme nouvelles depenses.'
                  : '⚠ Mode manuel : aucune occurrence n\'est creee automatiquement. Vous devrez cliquer sur "Generer" depuis la liste pour chaque echeance.'}
              </div>
            </div>
          </div>

          <div className="k-cab-form-grid">
            <div className="k-cab-field">
              <label>Categorie</label>
              <select value={form.categorie} onChange={e => setField('categorie', e.target.value)}>
                <option value="">— Choisir —</option>
                {(constants?.categoriesDepenses || []).map(c => (
                  <option key={c.code} value={c.code}>{c.icone} {c.label}</option>
                ))}
              </select>
            </div>
            <div className="k-cab-field">
              <label>Libelle (modele applique a chaque occurrence)</label>
              <input
                type="text"
                value={form.libelle}
                onChange={e => setField('libelle', e.target.value)}
                placeholder="Ex : Loyer cabinet"
              />
            </div>

            <div className="k-cab-field">
              <label>Fournisseur</label>
              <input type="text" value={form.fournisseurNom} onChange={e => setField('fournisseurNom', e.target.value)} />
            </div>
            <div className="k-cab-field">
              <label>Mode de paiement</label>
              <select value={form.modePaiement} onChange={e => setField('modePaiement', e.target.value)}>
                {(constants?.modesPaiement || []).map(m => (
                  <option key={m.code} value={m.code}>{m.label}</option>
                ))}
              </select>
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

          <div className="k-cab-form-grid cols-3">
            <div className="k-cab-field">
              <label>Frequence</label>
              <select value={form.frequence} onChange={e => setField('frequence', e.target.value)}>
                {(constants?.frequences || [{ code: 'mensuelle', label: 'Mensuelle' }]).map(f => (
                  <option key={f.code} value={f.code}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="k-cab-field">
              <label>Date de debut (1re echeance)</label>
              <input type="date" value={form.dateDebut} onChange={e => setField('dateDebut', e.target.value)} />
            </div>
            <div className="k-cab-field">
              <label>Date de fin (optionnel)</label>
              <input type="date" value={form.dateFin} onChange={e => setField('dateFin', e.target.value)} />
            </div>
          </div>

          <div className="k-cab-form-grid">
            <label className="k-cab-toggle">
              <input
                type="checkbox"
                checked={!!form.tvaDeductible}
                onChange={e => setField('tvaDeductible', e.target.checked)}
              />
              TVA deductible
            </label>
            <label className="k-cab-toggle">
              <input
                type="checkbox"
                checked={!!form.active}
                onChange={e => setField('active', e.target.checked)}
              />
              Recurrence active (decochez pour suspendre sans supprimer)
            </label>
          </div>

          <div className="k-cab-form-grid full">
            <div className="k-cab-field">
              <label>Dossier rattache (optionnel)</label>
              <select value={form.dossierId} onChange={e => setField('dossierId', e.target.value)}>
                <option value="">— Aucun (charge generale) —</option>
                {dossiers.map(d => (
                  <option key={d._id} value={d._id}>
                    {d.dossier?.dossier?.nom || d.dossier?.nom || d.reference}
                  </option>
                ))}
              </select>
            </div>
            <div className="k-cab-field">
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="k-cab-modal-footer">
          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
            Montant TTC par occurrence : {formatMontant(Number(form.montantTTC) || 0)}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="k-cab-btn k-cab-btn-ghost" onClick={() => onClose && onClose(null)}>Annuler</button>
            <button className="k-cab-btn k-cab-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement...' : (isEdit ? 'Enregistrer' : 'Creer la recurrence')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CabinetRecurringExpenseModal;
