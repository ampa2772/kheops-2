import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import BaseModal from '../../../../common/BaseModal';
import apiClient from '../../../../../services/apiClient';
import {
  requestAideJuridictionnelle,
  subscribeToEvent,
  unsubscribeFromEvent,
} from '../../../../../services/socketService';
import { fetchAllDocumentsInDossier } from '../../../../../redux/slices/currentDossierSlice';
import './AJModal.css';

// ---------------------------------------------------------------------------
// Modale Aide juridictionnelle (cerfa 15626*02).
// Pré-remplit depuis le dossier (client = 1re partie "pour", adversaires =
// parties "contre"), laisse l'utilisateur compléter ce que Kheops n'a pas
// (ressources, foyer, etc.), puis "Enregistrer" persiste le snapshot via
// PUT /api/folder/dossier/:id/aide-juridictionnelle.
// La génération du PDF (overlay) est la Phase 3 — pas dans ce composant.
// ---------------------------------------------------------------------------

const RESSOURCE_TYPES = [
  { key: 'salaires', label: 'Salaires ou traitements nets imposables' },
  { key: 'revenus_agricoles', label: 'Revenus agricoles, industriels, commerciaux' },
  { key: 'allocations_chomage', label: 'Allocations chômage' },
  { key: 'indemnites', label: 'Indemnités journalières' },
  { key: 'pensions_retraites', label: 'Pensions, retraites, rentes' },
  { key: 'pensions_alimentaires', label: 'Pensions alimentaires perçues' },
  { key: 'ressources_etranger', label: "Ressources imposables à l'étranger" },
  { key: 'autre_revenu', label: 'Tout autre revenu locatif ou du capital' },
];

const emptyForm = () => ({
  demandeur: { nationalite: {}, situationPro: {} },
  assurancePJ: {},
  representant: {},
  conjoint: {},
  personnesACharge: [],
  affaireOppose: {},
  demande: {},
  adversaires: [],
  auxiliaire: {},
  dispenses: {},
  ressources: RESSOURCE_TYPES.map(t => ({ type: t.key })),
  patrimoine: { proprietaireDe: [] },
  prestationsVersees: [],
  attestation: {},
});

// set immuable d'un chemin "a.b.c" dans un objet
function setIn(obj, path, value) {
  const keys = path.split('.');
  const next = Array.isArray(obj) ? [...obj] : { ...obj };
  let cur = next;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cur[k] = Array.isArray(cur[k]) ? [...cur[k]] : { ...(cur[k] || {}) };
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return next;
}

function getIn(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function partyDisplayName(pd) {
  if (!pd) return '';
  if (pd.raisonSociale) return pd.raisonSociale;
  if (pd.denomination) return pd.denomination;
  if (pd.nomPartie) return pd.nomPartie;
  if (pd.nom) {
    const p = pd.prenoms || pd.prenom || '';
    return (p ? `${p} ${pd.nom}` : pd.nom).trim();
  }
  return '';
}

function mapCivilite(genre) {
  const g = String(genre || '').toLowerCase();
  if (/femme|madame|mme|^f$/.test(g)) return 'madame';
  if (/homme|monsieur|^m\.?$|^mr$/.test(g)) return 'monsieur';
  return '';
}

// Construit un pré-remplissage à partir du dossier (ne remplit que ce qu'on a)
function buildPrefill(dossier) {
  const parties = dossier?.dossier?.parties || {};
  const pour = Array.isArray(parties.pour) ? parties.pour : [];
  const contre = Array.isArray(parties.contre) ? parties.contre : [];
  const client = pour[0]?.partieData || {};
  const pre = emptyForm();
  pre.demandeur = {
    ...pre.demandeur,
    civilite: mapCivilite(client.genre),
    nomNaissance: client.nom || '',
    nomUsage: client.nom || '',
    prenoms: client.prenoms || client.prenom || '',
    dateNaissance: client.dateNaissance || '',
    adresse: client.adresse || '',
    codePostal: client.codePostal || '',
    commune: client.ville || '',
    pays: client.pays || 'France',
    telephone: client.telephone || '',
    courriel: client.email || '',
  };
  pre.adversaires = contre
    .map(p => p?.partieData)
    .filter(Boolean)
    .map(pd => ({
      nomRaison: partyDisplayName(pd),
      adresse: [pd.adresse, pd.codePostal, pd.ville].filter(Boolean).join(' '),
    }));
  return pre;
}

// merge superficiel : le snapshot serveur prime sur le pré-remplissage,
// section par section ; les tableaux non vides du snapshot remplacent.
function mergeSnapshot(prefill, snap) {
  if (!snap || typeof snap !== 'object') return prefill;
  const out = { ...prefill };
  Object.keys(prefill).forEach(k => {
    const sv = snap[k];
    if (Array.isArray(prefill[k])) {
      out[k] = Array.isArray(sv) && sv.length ? sv : prefill[k];
    } else if (sv && typeof sv === 'object') {
      out[k] = { ...prefill[k], ...sv };
    } else if (sv !== undefined) {
      out[k] = sv;
    }
  });
  return out;
}

// --- petits composants de champ ---
const Section = ({ title, children }) => (
  <div className="aj-section">
    <h4 className="aj-section__title">{title}</h4>
    <div className="aj-section__body">{children}</div>
  </div>
);

const Txt = ({ label, value, onChange, full, type = 'text' }) => (
  <label className={`aj-field${full ? ' aj-field--full' : ''}`}>
    <span className="aj-field__label">{label}</span>
    <input
      className="aj-field__input"
      type={type}
      value={value == null ? '' : value}
      onChange={e => onChange(e.target.value)}
    />
  </label>
);

const Area = ({ label, value, onChange }) => (
  <label className="aj-field aj-field--full">
    <span className="aj-field__label">{label}</span>
    <textarea
      className="aj-field__textarea"
      value={value == null ? '' : value}
      onChange={e => onChange(e.target.value)}
    />
  </label>
);

const Radio = ({ label, value, options, onChange, full }) => (
  <div className={`aj-field${full ? ' aj-field--full' : ''}`}>
    <span className="aj-field__label">{label}</span>
    <div className="aj-choices">
      {options.map(o => (
        <label key={o.value} className="aj-choice">
          <input
            type="radio"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </div>
  </div>
);

const Check = ({ label, checked, onChange, full }) => (
  <label className={`aj-choice${full ? ' aj-field--full' : ''}`}>
    <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
    {label}
  </label>
);

const AJModal = ({ isOpen, onClose, dossier }) => {
  const dossierId = dossier?._id;
  const dispatch = useDispatch();
  const token = useSelector(s => s.login && s.login.token);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // {type:'ok'|'error', msg}

  const set = useCallback((path, value) => {
    setForm(prev => setIn(prev, path, value));
  }, []);

  useEffect(() => {
    if (!isOpen || !dossierId) return;
    let cancelled = false;
    setLoading(true);
    setStatus(null);
    const prefill = buildPrefill(dossier);
    apiClient
      .get(`/api/folder/dossier/${dossierId}/aide-juridictionnelle`)
      .then(res => {
        if (cancelled) return;
        setForm(mergeSnapshot(prefill, res.data));
      })
      .catch(() => {
        if (cancelled) return;
        setForm(prefill); // pas encore de snapshot : on garde le pré-remplissage
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [isOpen, dossierId, dossier]);

  const handleSave = async () => {
    if (!dossierId) return;
    setStatus(null);
    setLoading(true);
    try {
      await apiClient.put(`/api/folder/dossier/${dossierId}/aide-juridictionnelle`, form);
      setStatus({ type: 'ok', msg: 'Données enregistrées dans le dossier.' });
    } catch (e) {
      setStatus({ type: 'error', msg: "Échec de l'enregistrement. Réessayez." });
    } finally {
      setLoading(false);
    }
  };

  // Résultat de la génération (agent local) via events socket
  useEffect(() => {
    if (!isOpen || !dossierId) return undefined;
    const onSuccess = (data) => {
      if (data && data.dossierId === dossierId) {
        if (token) dispatch(fetchAllDocumentsInDossier(dossierId, token));
        setLoading(false);
        setStatus({
          type: 'ok',
          msg: `PDF généré et ajouté aux documents${data.fileName ? ' : ' + data.fileName : ''}.`,
        });
        setTimeout(() => { if (onClose) onClose(); }, 1500);
      }
    };
    const onError = (data) => {
      if (data && data.dossierId === dossierId) {
        setLoading(false);
        setStatus({ type: 'error', msg: data.message || 'Échec de la génération du PDF.' });
      }
    };
    subscribeToEvent('aj_generation_success', onSuccess);
    subscribeToEvent('aj_generation_error', onError);
    return () => {
      unsubscribeFromEvent('aj_generation_success', onSuccess);
      unsubscribeFromEvent('aj_generation_error', onError);
    };
  }, [isOpen, dossierId, token, dispatch, onClose]);

  const handleEnvoyer = async () => {
    if (!dossierId) return;
    setStatus({ type: 'info', msg: 'Enregistrement puis génération du PDF…' });
    setLoading(true);
    try {
      await apiClient.put(`/api/folder/dossier/${dossierId}/aide-juridictionnelle`, form);
    } catch (e) {
      setLoading(false);
      setStatus({ type: 'error', msg: "Échec de l'enregistrement avant génération." });
      return;
    }
    const ok = requestAideJuridictionnelle(dossierId, token);
    if (!ok) {
      setLoading(false);
      setStatus({ type: 'error', msg: 'Agent local non connecté : génération impossible.' });
    }
    // succès / échec finalisés par les events socket aj_generation_*
  };

  if (!isOpen) return null;

  const F = (path) => getIn(form, path);
  const addRow = (key, row) => set(key, [...(form[key] || []), row]);
  const removeRow = (key, idx) => set(key, (form[key] || []).filter((_, i) => i !== idx));
  const setRow = (key, idx, field, value) =>
    set(key, (form[key] || []).map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  return (
    <BaseModal isOpen={isOpen} onClose={onClose} overlayClassName="aj-modal-overlay">
      <div className="aj-modal" role="dialog" aria-label="Aide juridictionnelle">
        <div className="aj-modal__header">
          <div>
            <h3 className="aj-modal__title">Aide juridictionnelle — cerfa 15626*02</h3>
            <div className="aj-modal__subtitle">
              Pré-rempli depuis le dossier ; complétez ce qui manque puis Enregistrer.
            </div>
          </div>
        </div>

        <div className="aj-modal__body">
          {loading && <p className="aj-modal__status">Chargement…</p>}

          <Section title="Assurance de protection juridique">
            <Radio
              label="Êtes-vous couvert par une assurance de protection juridique ?"
              full
              value={F('assurancePJ.couvert')}
              options={[{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }]}
              onChange={v => set('assurancePJ.couvert', v)}
            />
            <Radio
              label="Si oui, prise en charge"
              full
              value={F('assurancePJ.priseEnCharge')}
              options={[
                { value: 'totale', label: 'Totale' },
                { value: 'partielle', label: 'Partielle' },
                { value: 'aucune', label: 'Aucune' },
              ]}
              onChange={v => set('assurancePJ.priseEnCharge', v)}
            />
          </Section>

          <Section title="1 — Demandeur : état civil">
            <Radio
              label="Civilité"
              value={F('demandeur.civilite')}
              options={[{ value: 'madame', label: 'Madame' }, { value: 'monsieur', label: 'Monsieur' }]}
              onChange={v => set('demandeur.civilite', v)}
            />
            <div className="aj-field" />
            <Txt label="Nom de naissance" value={F('demandeur.nomNaissance')} onChange={v => set('demandeur.nomNaissance', v)} />
            <Txt label="Nom d'usage" value={F('demandeur.nomUsage')} onChange={v => set('demandeur.nomUsage', v)} />
            <Txt label="Prénom(s)" value={F('demandeur.prenoms')} onChange={v => set('demandeur.prenoms', v)} />
            <Txt label="Date de naissance" value={F('demandeur.dateNaissance')} onChange={v => set('demandeur.dateNaissance', v)} />
            <Txt label="Lieu de naissance" value={F('demandeur.lieuNaissance')} onChange={v => set('demandeur.lieuNaissance', v)} />
            <Radio
              label="Nationalité"
              value={F('demandeur.nationalite.type')}
              options={[
                { value: 'francaise', label: 'Française' },
                { value: 'ue', label: 'Union européenne' },
                { value: 'autre', label: 'Autre' },
              ]}
              onChange={v => set('demandeur.nationalite.type', v)}
            />
            <Txt label="Préciser (si UE/Autre)" value={F('demandeur.nationalite.preciser')} onChange={v => set('demandeur.nationalite.preciser', v)} />
            <Txt label="Situation familiale" value={F('demandeur.situationFamiliale')} onChange={v => set('demandeur.situationFamiliale', v)} />
            <div className="aj-field" />
            <Txt label="Adresse" full value={F('demandeur.adresse')} onChange={v => set('demandeur.adresse', v)} />
            <Txt label="Code postal" value={F('demandeur.codePostal')} onChange={v => set('demandeur.codePostal', v)} />
            <Txt label="Commune" value={F('demandeur.commune')} onChange={v => set('demandeur.commune', v)} />
            <Txt label="Pays" value={F('demandeur.pays')} onChange={v => set('demandeur.pays', v)} />
            <Txt label="Téléphone" value={F('demandeur.telephone')} onChange={v => set('demandeur.telephone', v)} />
            <Txt label="Courriel" value={F('demandeur.courriel')} onChange={v => set('demandeur.courriel', v)} />
            <Txt label="Situation professionnelle" value={F('demandeur.situationPro.type')} onChange={v => set('demandeur.situationPro.type', v)} />
            <Txt label="Préciser (profession)" value={F('demandeur.situationPro.preciser')} onChange={v => set('demandeur.situationPro.preciser', v)} />
            <Txt label="N° allocataire CAF/MSA" value={F('demandeur.numCAF')} onChange={v => set('demandeur.numCAF', v)} />
            <Txt label="N° fiscal" value={F('demandeur.numFiscal')} onChange={v => set('demandeur.numFiscal', v)} />
            <Txt label="Réf. avis d'imposition" value={F('demandeur.refAvisImposition')} onChange={v => set('demandeur.refAvisImposition', v)} />
          </Section>

          <Section title="Représentant légal (si mineur / majeur protégé)">
            <Txt label="Nom et prénom du représentant" full value={F('representant.nomPrenom')} onChange={v => set('representant.nomPrenom', v)} />
            <Txt label="Statut (parent/tuteur/curateur/autre)" value={F('representant.statut')} onChange={v => set('representant.statut', v)} />
            <Txt label="Adresse" value={F('representant.adresse')} onChange={v => set('representant.adresse', v)} />
            <Txt label="Code postal" value={F('representant.codePostal')} onChange={v => set('representant.codePostal', v)} />
            <Txt label="Commune" value={F('representant.commune')} onChange={v => set('representant.commune', v)} />
            <Txt label="Téléphone" value={F('representant.telephone')} onChange={v => set('representant.telephone', v)} />
            <Txt label="Courriel" value={F('representant.courriel')} onChange={v => set('representant.courriel', v)} />
          </Section>

          <Section title="2 — Foyer : conjoint(e) / partenaire">
            <Radio
              label="Civilité"
              value={F('conjoint.civilite')}
              options={[{ value: 'madame', label: 'Madame' }, { value: 'monsieur', label: 'Monsieur' }]}
              onChange={v => set('conjoint.civilite', v)}
            />
            <div className="aj-field" />
            <Txt label="Nom de naissance" value={F('conjoint.nomNaissance')} onChange={v => set('conjoint.nomNaissance', v)} />
            <Txt label="Nom d'usage" value={F('conjoint.nomUsage')} onChange={v => set('conjoint.nomUsage', v)} />
            <Txt label="Prénom(s)" value={F('conjoint.prenoms')} onChange={v => set('conjoint.prenoms', v)} />
            <Txt label="Date de naissance" value={F('conjoint.dateNaissance')} onChange={v => set('conjoint.dateNaissance', v)} />
            <Txt label="Lieu de naissance" value={F('conjoint.lieuNaissance')} onChange={v => set('conjoint.lieuNaissance', v)} />
          </Section>

          <Section title="Personnes à charge / vivant avec vous">
            <div className="aj-table">
              {(form.personnesACharge || []).map((r, i) => (
                <div className="aj-table__row" key={i}>
                  <label className="aj-field">
                    <span className="aj-field__label">Nom, Prénom</span>
                    <input className="aj-field__input" value={r.nomPrenom || ''} onChange={e => setRow('personnesACharge', i, 'nomPrenom', e.target.value)} />
                  </label>
                  <label className="aj-field">
                    <span className="aj-field__label">Lien</span>
                    <input className="aj-field__input" value={r.lien || ''} onChange={e => setRow('personnesACharge', i, 'lien', e.target.value)} />
                  </label>
                  <label className="aj-field">
                    <span className="aj-field__label">Date de naissance</span>
                    <input className="aj-field__input" value={r.dateNaissance || ''} onChange={e => setRow('personnesACharge', i, 'dateNaissance', e.target.value)} />
                  </label>
                  <Check label="À charge" checked={r.aCharge} onChange={v => setRow('personnesACharge', i, 'aCharge', v)} />
                  <Check label="Vit avec" checked={r.vitAvec} onChange={v => setRow('personnesACharge', i, 'vitAvec', v)} />
                  <button type="button" className="aj-row-remove" onClick={() => removeRow('personnesACharge', i)} aria-label="Supprimer la ligne">×</button>
                </div>
              ))}
              <button type="button" className="aj-btn aj-btn--mini" onClick={() => addRow('personnesACharge', {})}>+ Ajouter une personne</button>
            </div>
          </Section>

          <Section title="3 — Votre demande">
            <Radio
              label="Votre affaire vous oppose-t-elle à une personne ci-dessus ?"
              full
              value={F('affaireOppose.oppose')}
              options={[{ value: 'oui', label: 'Oui' }, { value: 'non', label: 'Non' }]}
              onChange={v => set('affaireOppose.oppose', v)}
            />
            <Txt label="Si oui, préciser nom et prénom" full value={F('affaireOppose.preciser')} onChange={v => set('affaireOppose.preciser', v)} />
            <Radio
              label="Procédure"
              full
              value={F('demande.procedure')}
              options={[
                { value: 'souhaite', label: 'Vous souhaitez saisir' },
                { value: 'juge_saisi', label: 'Un juge est déjà saisi' },
                { value: 'deja_jugee', label: 'Affaire déjà jugée' },
              ]}
              onChange={v => set('demande.procedure', v)}
            />
            <Area label="Exposez brièvement votre affaire" value={F('demande.exposeAffaire')} onChange={v => set('demande.exposeAffaire', v)} />
            <Check label="Avez-vous déjà bénéficié de l'AJ pour cette affaire ?" full checked={F('demande.dejaBeneficieAJ')} onChange={v => set('demande.dejaBeneficieAJ', v)} />
            <Radio
              label="Vous êtes"
              value={F('demande.role')}
              options={[{ value: 'demandeur', label: 'Demandeur' }, { value: 'defendeur', label: 'Défendeur' }]}
              onChange={v => set('demande.role', v)}
            />
            <Txt label="Juridiction saisie" value={F('demande.juridictionSaisie')} onChange={v => set('demande.juridictionSaisie', v)} />
            <Txt label="Date de convocation" value={F('demande.dateConvocation')} onChange={v => set('demande.dateConvocation', v)} />
            <Check label="Recours contre une décision de justice" checked={F('demande.recours')} onChange={v => set('demande.recours', v)} />
            <Check label="Faire exécuter une décision de justice" checked={F('demande.executer')} onChange={v => set('demande.executer', v)} />
          </Section>

          <Section title="Adversaires">
            <div className="aj-table">
              {(form.adversaires || []).map((r, i) => (
                <div className="aj-table__row" key={i}>
                  <label className="aj-field">
                    <span className="aj-field__label">Nom et prénom ou raison sociale</span>
                    <input className="aj-field__input" value={r.nomRaison || ''} onChange={e => setRow('adversaires', i, 'nomRaison', e.target.value)} />
                  </label>
                  <label className="aj-field">
                    <span className="aj-field__label">Adresse</span>
                    <input className="aj-field__input" value={r.adresse || ''} onChange={e => setRow('adversaires', i, 'adresse', e.target.value)} />
                  </label>
                  <button type="button" className="aj-row-remove" onClick={() => removeRow('adversaires', i)} aria-label="Supprimer la ligne">×</button>
                </div>
              ))}
              <button type="button" className="aj-btn aj-btn--mini" onClick={() => addRow('adversaires', {})}>+ Ajouter un adversaire</button>
            </div>
          </Section>

          <Section title="Auxiliaire de justice">
            <Radio
              label="Mode"
              value={F('auxiliaire.mode')}
              options={[
                { value: 'designation', label: 'Vous demandez la désignation' },
                { value: 'deja_choisi', label: 'Vous avez déjà choisi' },
              ]}
              onChange={v => set('auxiliaire.mode', v)}
            />
            <Radio
              label="Type"
              value={F('auxiliaire.type')}
              options={[
                { value: 'avocat', label: 'Avocat' },
                { value: 'huissier', label: 'Huissier' },
                { value: 'notaire', label: 'Notaire' },
                { value: 'autre', label: 'Autre' },
              ]}
              onChange={v => set('auxiliaire.type', v)}
            />
            <Txt label="Préciser (si autre)" value={F('auxiliaire.autrePreciser')} onChange={v => set('auxiliaire.autrePreciser', v)} />
            <Txt label="Adresse professionnelle" value={F('auxiliaire.adresse')} onChange={v => set('auxiliaire.adresse', v)} />
            <Txt label="Code postal" value={F('auxiliaire.codePostal')} onChange={v => set('auxiliaire.codePostal', v)} />
            <Txt label="Commune" value={F('auxiliaire.commune')} onChange={v => set('auxiliaire.commune', v)} />
            <Txt label="Pays" value={F('auxiliaire.pays')} onChange={v => set('auxiliaire.pays', v)} />
            <Txt label="Téléphone" value={F('auxiliaire.telephone')} onChange={v => set('auxiliaire.telephone', v)} />
            <Txt label="Courriel" value={F('auxiliaire.courriel')} onChange={v => set('auxiliaire.courriel', v)} />
          </Section>

          <Section title="4 — Dispenses de déclaration de ressources">
            <Check label="Bénéficiaire du RSA" checked={F('dispenses.rsa')} onChange={v => set('dispenses.rsa', v)} />
            <Check label="Bénéficiaire de l'ASPA" checked={F('dispenses.aspa')} onChange={v => set('dispenses.aspa', v)} />
            <Check label="Recours devant la CNDA" checked={F('dispenses.cnda')} onChange={v => set('dispenses.cnda', v)} />
            <Check label="Victime d'un crime grave" checked={F('dispenses.victime')} onChange={v => set('dispenses.victime', v)} />
          </Section>

          <Section title="Ressources du foyer (moyennes mensuelles, €)">
            <div className="aj-table">
              {(form.ressources || []).map((r, i) => (
                <div className="aj-table__row" key={r.type || i}>
                  <label className="aj-field" style={{ flex: '2 1 220px' }}>
                    <span className="aj-field__label">
                      {(RESSOURCE_TYPES.find(t => t.key === r.type) || {}).label || r.type}
                    </span>
                    <input className="aj-field__input" type="number" placeholder="Vous"
                      value={r.demandeur == null ? '' : r.demandeur}
                      onChange={e => setRow('ressources', i, 'demandeur', e.target.value)} />
                  </label>
                  <label className="aj-field">
                    <span className="aj-field__label">Conjoint(e)</span>
                    <input className="aj-field__input" type="number"
                      value={r.conjoint == null ? '' : r.conjoint}
                      onChange={e => setRow('ressources', i, 'conjoint', e.target.value)} />
                  </label>
                  <label className="aj-field">
                    <span className="aj-field__label">Personnes à charge</span>
                    <input className="aj-field__input" type="number"
                      value={r.personnes == null ? '' : r.personnes}
                      onChange={e => setRow('ressources', i, 'personnes', e.target.value)} />
                  </label>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Patrimoine">
            <Txt label="Montant total de l'épargne (€)" type="number" value={F('patrimoine.epargneTotal')} onChange={v => set('patrimoine.epargneTotal', v)} />
            <Check label="Propriétaire d'un bien immobilier" checked={F('patrimoine.proprietaire')} onChange={v => set('patrimoine.proprietaire', v)} />
            <Area label="Description des biens (hors résidence principale)" value={F('patrimoine.description')} onChange={v => set('patrimoine.description', v)} />
          </Section>

          <Section title="Prestations versées à des tiers">
            <div className="aj-table">
              {(form.prestationsVersees || []).map((r, i) => (
                <div className="aj-table__row" key={i}>
                  <label className="aj-field">
                    <span className="aj-field__label">Type de prestation</span>
                    <input className="aj-field__input" value={r.type || ''} onChange={e => setRow('prestationsVersees', i, 'type', e.target.value)} />
                  </label>
                  <label className="aj-field">
                    <span className="aj-field__label">Montant mensuel (€)</span>
                    <input className="aj-field__input" type="number" value={r.montant == null ? '' : r.montant} onChange={e => setRow('prestationsVersees', i, 'montant', e.target.value)} />
                  </label>
                  <label className="aj-field">
                    <span className="aj-field__label">Destinataire / relation</span>
                    <input className="aj-field__input" value={r.destinataireRelation || ''} onChange={e => setRow('prestationsVersees', i, 'destinataireRelation', e.target.value)} />
                  </label>
                  <button type="button" className="aj-row-remove" onClick={() => removeRow('prestationsVersees', i)} aria-label="Supprimer la ligne">×</button>
                </div>
              ))}
              <button type="button" className="aj-btn aj-btn--mini" onClick={() => addRow('prestationsVersees', {})}>+ Ajouter une prestation</button>
            </div>
          </Section>

          <Section title="Attestation sur l'honneur">
            <Check label="Je consens à communiquer par voie électronique" full checked={F('attestation.consentElectronique')} onChange={v => set('attestation.consentElectronique', v)} />
            <Txt label="Fait à" value={F('attestation.faitLieu')} onChange={v => set('attestation.faitLieu', v)} />
            <Txt label="Le" value={F('attestation.faitDate')} onChange={v => set('attestation.faitDate', v)} />
            <p className="aj-field aj-field--full aj-modal__subtitle">
              La signature reste manuelle : le PDF généré (Phase 3) sera prêt à imprimer et signer.
            </p>
          </Section>
        </div>

        <div className="aj-modal__footer">
          {status && (
            <span
              className={
                'aj-modal__status' +
                (status.type === 'ok' ? ' aj-modal__status--ok'
                  : status.type === 'error' ? ' aj-modal__status--error' : '')
              }
            >
              {status.msg}
            </span>
          )}
          <button type="button" className="aj-btn aj-btn--ghost" onClick={onClose}>Fermer</button>
          <button type="button" className="aj-btn aj-btn--ghost" onClick={handleSave} disabled={loading || !dossierId}>
            {loading ? '…' : 'Enregistrer'}
          </button>
          <button type="button" className="aj-btn aj-btn--primary" onClick={handleEnvoyer} disabled={loading || !dossierId}>
            {loading ? 'Génération…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </BaseModal>
  );
};

export default AJModal;
