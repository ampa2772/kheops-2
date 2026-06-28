// client/src/components/carpa/CarpaOperationModal.js
//
// Modale de creation / edition d'une operation CARPA.
// Couvre :
//  - choix du sens (entree / sortie) et du type
//  - choix du dossier (pre-rempli si on est dans un dossier)
//  - choix du beneficiaire (parmi les contacts du dossier ou saisie manuelle)
//  - montants, dates, mode de paiement
//  - notes et reference e-Carpa
//
// La gestion des pieces et des transitions d'etat se fait dans le panneau
// detail (CarpaOperationDetail), pas dans cette modale.
//
// rc59 : refonte dark navy (classes .k-carpa-form-modal) + fix clignotement
// (les 2 useEffect de sync sens<->type entraient en boucle infinie au changement
// de sens ; logique deplacee dans handleField avec un seul setForm par action).
import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import carpaApi from '../../services/carpaService';
import { fetchOperationsForDossier, fetchCarpaDashboard, upsertOperationLocal } from '../../redux/slices/carpaSlice';
import { masquerRibClient } from './carpaPrintHelpers';
import './carpa.css';
import './carpaOperationModal.css';

const SENS = [
  { code: 'entree', label: 'Entree (depot)' },
  { code: 'sortie', label: 'Sortie (retrait)' },
];

const MODES_RECEPTION = [
  { code: '', label: '—' },
  { code: 'virement', label: 'Virement' },
  { code: 'cheque', label: 'Cheque' },
  { code: 'especes', label: 'Especes' },
  { code: 'autre', label: 'Autre' },
];

const MODES_RESTITUTION = [
  { code: '', label: '—' },
  { code: 'virement', label: 'Virement' },
  { code: 'cheque', label: 'Cheque' },
];

const PAYEUR_TYPES = [
  { code: '', label: '—' },
  { code: 'client', label: 'Client (notre partie)' },
  { code: 'partie_pour', label: 'Partie pour' },
  { code: 'partie_contre', label: 'Partie adverse' },
  { code: 'assurance', label: 'Assurance' },
  { code: 'tiers', label: 'Tiers' },
];

const toDateInputValue = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Type par defaut selon le sens (utilise au mount uniquement, plus aucun effect
// ne re-synchronise apres : la coherence est garantie par handleField).
const defaultTypeForSens = (sens) =>
  sens === 'sortie' ? 'retrait_beneficiaire' : 'depot_client';

// Extrait les contacts/parties d'un dossier pour la liste deroulante des beneficiaires
const collectContactsFromDossier = (dossier) => {
  const list = [];
  if (!dossier) return list;
  const seen = new Set();
  const push = (id, label, kind) => {
    const key = `${kind}:${id}`;
    if (!id || seen.has(key)) return;
    seen.add(key);
    list.push({ id, label, kind });
  };

  const parties = dossier?.dossier?.parties;
  if (parties) {
    for (const partyArr of [parties.pour || [], parties.contre || []]) {
      for (const p of partyArr) {
        const data = p?.partieData || p;
        if (!data || !data._id) continue;
        const label = data.nom
          ? `${data.prenoms || ''} ${data.nom}`.trim()
          : (data.raisonSociale || data.denomination || data.nomPartie || 'Partie');
        push(data._id, label + (p?.isContre ? ' (adverse)' : ''), 'partie');
      }
    }
  }

  const contacts = dossier?.dossier?.contactsDuDossier || [];
  for (const c of contacts) {
    const data = c?.contactData || c;
    if (!data || !data._id) continue;
    const label = data.nom
      ? `${data.prenoms || ''} ${data.nom}`.trim()
      : (data.raisonSociale || data.denomination || 'Contact');
    push(data._id, label, 'contact');
  }

  return list;
};

// ── Icones SVG inline (mêmes patterns que la modale detail) ─────
const IconShield = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 4 6v6c0 4.5 3.5 8.5 8 9 4.5-0.5 8-4.5 8-9V6l-8-3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

const IconUser = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7" />
  </svg>
);

const CarpaOperationModal = ({
  open,
  onClose,
  dossierId,
  initialOperation = null,
  initialSens = 'entree',
}) => {
  const dispatch = useDispatch();
  const constants = useSelector((s) => s.carpa.constants);
  const currentDossier = useSelector((s) => s.currentDossier?.dossier);

  const contactsDuDossier = useMemo(
    () => collectContactsFromDossier(currentDossier),
    [currentDossier]
  );

  const isEdit = !!initialOperation && !!initialOperation._id;

  // Lazy init : aligne sens et type des le premier render pour eviter
  // les effects de sync (qui causaient une boucle infinie / clignotement).
  const [form, setForm] = useState(() => {
    const sens = initialOperation?.sens || initialSens || 'entree';
    const type = initialOperation?.type || defaultTypeForSens(sens);
    return {
      sens,
      type,
      montant: initialOperation?.montant ?? '',
      devise: initialOperation?.devise || 'EUR',
      dateOperation: toDateInputValue(initialOperation?.dateOperation || new Date()),
      dateReceptionFonds: toDateInputValue(initialOperation?.dateReceptionFonds),
      modeReception: initialOperation?.modeReception || '',
      modeRestitution: initialOperation?.modeRestitution || '',
      payeurNom: initialOperation?.payeurNom || '',
      payeurType: initialOperation?.payeurType || '',
      notes: initialOperation?.notes || '',
      reference: initialOperation?.reference || '',
      referenceECarpa: initialOperation?.referenceECarpa || '',
      beneficiaireMode: initialOperation?.beneficiaireContactId ? 'contact' : 'manuel',
      beneficiaireContactId: initialOperation?.beneficiaireContactId || '',
      beneficiaireNomManuel: initialOperation?.beneficiaireSnapshot?.nom || '',
      beneficiairePrenomsManuel: initialOperation?.beneficiaireSnapshot?.prenoms || '',
      beneficiaireRaisonSocialeManuel: initialOperation?.beneficiaireSnapshot?.raisonSociale || '',
      ribBeneficiaireBrut: '',
    };
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const typesPourSens = useMemo(() => {
    if (!constants) return [];
    return form.sens === 'entree' ? (constants.typesEntree || []) : (constants.typesSortie || []);
  }, [form.sens, constants]);

  // Un seul setForm par interaction : pas de boucle infinie possible.
  const handleField = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (!constants) return next;
      if (key === 'sens') {
        const compatibles = value === 'entree'
          ? (constants.typesEntree || [])
          : (constants.typesSortie || []);
        if (!compatibles.some((t) => t.code === next.type) && compatibles.length > 0) {
          next.type = compatibles[0].code;
        }
      } else if (key === 'type') {
        if (constants.typesEntree?.some((t) => t.code === value)) next.sens = 'entree';
        else if (constants.typesSortie?.some((t) => t.code === value)) next.sens = 'sortie';
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setError('');
    if (!dossierId) { setError('Dossier non identifie.'); return; }
    if (!form.type) { setError('Type d\'operation requis.'); return; }
    const montant = Number(form.montant);
    if (!Number.isFinite(montant) || montant < 0) {
      setError('Montant invalide.');
      return;
    }

    setSubmitting(true);
    try {
      const isHonoraires = form.type === 'retrait_honoraires';
      const payload = {
        dossierId,
        sens: form.sens,
        type: form.type,
        estHonoraires: isHonoraires,
        montant,
        devise: form.devise || 'EUR',
        dateOperation: form.dateOperation || new Date().toISOString(),
        dateReceptionFonds: form.dateReceptionFonds || null,
        modeReception: form.sens === 'entree' ? (form.modeReception || null) : null,
        modeRestitution: form.sens === 'sortie' ? (form.modeRestitution || null) : null,
        payeurNom: form.sens === 'entree' ? form.payeurNom : '',
        payeurType: form.sens === 'entree' ? form.payeurType : '',
        notes: form.notes,
        reference: form.reference,
        referenceECarpa: form.referenceECarpa,
      };

      if (isHonoraires) {
        // pas de beneficiaire externe
      } else if (form.beneficiaireMode === 'contact' && form.beneficiaireContactId) {
        payload.beneficiaireContactId = form.beneficiaireContactId;
      } else if (form.beneficiaireMode === 'manuel') {
        payload.beneficiaireSnapshotManual = {
          nom: form.beneficiaireNomManuel,
          prenoms: form.beneficiairePrenomsManuel,
          raisonSociale: form.beneficiaireRaisonSocialeManuel,
          contactType: form.beneficiaireRaisonSocialeManuel ? 'morale' : 'physique',
        };
      }

      if (form.ribBeneficiaireBrut) {
        payload.ribBeneficiaireBrut = form.ribBeneficiaireBrut;
      }

      let resp;
      if (isEdit) {
        resp = await carpaApi.updateOperation(initialOperation._id, payload);
      } else {
        resp = await carpaApi.createOperation(payload);
      }

      const op = resp.operation;
      dispatch(upsertOperationLocal(op));
      dispatch(fetchOperationsForDossier(dossierId));
      dispatch(fetchCarpaDashboard());

      onClose && onClose(op);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="k-carpa-modal-backdrop" role="dialog" aria-modal="true">
      <div className="k-carpa-modal k-carpa-form-modal">
        <div className="k-carpa-form-modal-header">
          <div className="k-carpa-form-modal-badge">
            <IconShield />
          </div>
          <div className="k-carpa-form-modal-header-text">
            <div className="k-carpa-form-modal-eyebrow">
              OPÉRATION CARPA <span aria-hidden="true">·</span>{' '}
              <span className="k-carpa-form-modal-eyebrow-sens">
                {form.sens === 'entree' ? 'ENTRÉE' : 'SORTIE'}
              </span>
            </div>
            <h3 className="k-carpa-form-modal-title">
              {isEdit ? "Modifier l'opération CARPA" : 'Nouvelle opération CARPA'}
            </h3>
          </div>
          <button
            className="k-carpa-form-modal-close"
            onClick={() => onClose && onClose(null)}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="k-carpa-modal-body">
          {error && (
            <div className="k-carpa-alerte k-carpa-alerte-critique">
              <span className="k-carpa-alerte-icon">!</span>
              <div>{error}</div>
            </div>
          )}

          <div className="k-carpa-form-grid">
            <div className="k-carpa-field">
              <label>Sens</label>
              <select value={form.sens} onChange={handleField('sens')} disabled={isEdit}>
                {SENS.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
              {isEdit && <div className="help">Le sens d'une operation ne peut pas etre modifie apres creation.</div>}
            </div>

            <div className="k-carpa-field">
              <label>Type d'operation</label>
              <select value={form.type} onChange={handleField('type')}>
                {typesPourSens.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </div>

            <div className="k-carpa-field">
              <label>Montant</label>
              <input type="number" min="0" step="0.01" value={form.montant} onChange={handleField('montant')} placeholder="0.00" />
            </div>

            <div className="k-carpa-field">
              <label>Devise</label>
              <select value={form.devise} onChange={handleField('devise')}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="CHF">CHF</option>
              </select>
            </div>

            <div className="k-carpa-field">
              <label>Date de l'operation</label>
              <input type="date" value={form.dateOperation} onChange={handleField('dateOperation')} />
            </div>

            {form.sens === 'entree' && (
              <div className="k-carpa-field">
                <label>Date de reception des fonds</label>
                <input type="date" value={form.dateReceptionFonds} onChange={handleField('dateReceptionFonds')} />
                <div className="help">Date a laquelle l'avocat a recu les fonds (avant depot a la CARPA).</div>
              </div>
            )}

            {form.sens === 'entree' && (
              <>
                <div className="k-carpa-field">
                  <label>Mode de reception</label>
                  <select value={form.modeReception} onChange={handleField('modeReception')}>
                    {MODES_RECEPTION.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
                  </select>
                </div>
                <div className="k-carpa-field">
                  <label>Type de payeur</label>
                  <select value={form.payeurType} onChange={handleField('payeurType')}>
                    {PAYEUR_TYPES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                  </select>
                </div>
                <div className="k-carpa-field k-carpa-field-full">
                  <label>Nom du payeur</label>
                  <input type="text" value={form.payeurNom} onChange={handleField('payeurNom')} placeholder="Ex : Cie d'assurance X" />
                </div>
              </>
            )}

            {form.sens === 'sortie' && (
              <div className="k-carpa-field">
                <label>Mode de restitution</label>
                <select value={form.modeRestitution} onChange={handleField('modeRestitution')}>
                  {MODES_RESTITUTION.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {form.type !== 'retrait_honoraires' && (
            <div className="k-carpa-section k-carpa-form-modal-benef">
              <div className="k-carpa-form-modal-section-head">
                <div className="k-carpa-form-modal-section-icon">
                  <IconUser />
                </div>
                <h4 className="k-carpa-form-modal-section-title">Bénéficiaire</h4>
              </div>

              <div className="k-carpa-form-grid">
                <div className="k-carpa-field k-carpa-field-full">
                  <label>Mode de saisie</label>
                  <select value={form.beneficiaireMode} onChange={handleField('beneficiaireMode')}>
                    <option value="contact">Selectionner un contact du dossier</option>
                    <option value="manuel">Saisie manuelle (tiers, expert, autre)</option>
                  </select>
                </div>
              </div>

              {form.beneficiaireMode === 'contact' && (
                <div className="k-carpa-form-grid">
                  <div className="k-carpa-field k-carpa-field-full">
                    <label>Beneficiaire</label>
                    <select value={form.beneficiaireContactId} onChange={handleField('beneficiaireContactId')}>
                      <option value="">— Choisir —</option>
                      {contactsDuDossier.map((c) => (
                        <option key={c.kind + ':' + c.id} value={c.id}>
                          {c.label} {c.kind === 'partie' ? '(partie)' : '(contact)'}
                        </option>
                      ))}
                    </select>
                    {contactsDuDossier.length === 0 && (
                      <div className="help">Aucun contact / partie disponible dans ce dossier. Utiliser la saisie manuelle.</div>
                    )}
                  </div>
                </div>
              )}

              {form.beneficiaireMode === 'manuel' && (
                <div className="k-carpa-form-grid">
                  <div className="k-carpa-field">
                    <label>Nom</label>
                    <input type="text" value={form.beneficiaireNomManuel} onChange={handleField('beneficiaireNomManuel')} />
                  </div>
                  <div className="k-carpa-field">
                    <label>Prenoms</label>
                    <input type="text" value={form.beneficiairePrenomsManuel} onChange={handleField('beneficiairePrenomsManuel')} />
                  </div>
                  <div className="k-carpa-field k-carpa-field-full">
                    <label>OU raison sociale (personne morale)</label>
                    <input type="text" value={form.beneficiaireRaisonSocialeManuel} onChange={handleField('beneficiaireRaisonSocialeManuel')} />
                  </div>
                </div>
              )}

              {form.sens === 'sortie' && (
                <div className="k-carpa-form-grid">
                  <div className="k-carpa-field k-carpa-field-full">
                    <label>RIB / IBAN du beneficiaire</label>
                    <input
                      type="text"
                      value={form.ribBeneficiaireBrut}
                      onChange={handleField('ribBeneficiaireBrut')}
                      placeholder={initialOperation?.ribBeneficiaireMasque || 'FR76 1234 ...'}
                      autoComplete="off"
                    />
                    <div className="help">
                      L'IBAN n'est jamais conserve en clair : seuls les 4 derniers caracteres sont memorises{' '}
                      ({masquerRibClient(form.ribBeneficiaireBrut) || initialOperation?.ribBeneficiaireMasque || 'aucun'}).
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="k-carpa-form-grid">
            <div className="k-carpa-field">
              <label>Reference cabinet</label>
              <input type="text" value={form.reference} onChange={handleField('reference')} placeholder="Ex : DOSS-001-OP-002" />
            </div>
            <div className="k-carpa-field">
              <label>Reference e-Carpa</label>
              <input type="text" value={form.referenceECarpa} onChange={handleField('referenceECarpa')} placeholder="Ex : EC-2025-12345" />
              <div className="help">Pour la reconciliation avec un export e-Carpa.</div>
            </div>
          </div>

          <div className="k-carpa-field k-carpa-field-full">
            <label>Notes internes</label>
            <textarea value={form.notes} onChange={handleField('notes')} rows={3} placeholder="Contexte, instructions, points de vigilance..." />
          </div>
        </div>

        <div className="k-carpa-form-modal-footer">
          <div className="k-carpa-form-modal-footer-legal">
            Conformement a l'arrete du 5 juillet 1996, art. 12 : depot sans delai a la CARPA.
          </div>
          <div className="k-carpa-form-modal-footer-actions">
            <button className="k-carpa-btn k-carpa-btn-ghost" onClick={() => onClose && onClose(null)}>Annuler</button>
            <button className="k-carpa-btn k-carpa-btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Enregistrement...' : (isEdit ? 'Enregistrer' : "Creer l'operation")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CarpaOperationModal;
