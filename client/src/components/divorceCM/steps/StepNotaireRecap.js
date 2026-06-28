// Etape 7 du wizard : choix du notaire depositaire + recap final + creation.
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setDraftField } from '../../../redux/slices/divorceCMSlice';
import {
  toDateInputValue, formatDate, formatMontant, fullNameEpoux, fullNameEnfant,
} from '../divorceCMHelpers';
import ContactSearchBox from '../widgets/ContactSearchBox';
import CommunePicker from '../widgets/CommunePicker';

const StepNotaireRecap = () => {
  const dispatch = useDispatch();
  const draft = useSelector(s => s.divorceCM.draft);
  const constants = useSelector(s => s.divorceCM.constants);

  const setNotaire = (key, value) => dispatch(setDraftField({ path: ['notaire', key], value }));

  const handleSelectNotaire = (c) => {
    if (!c) return;
    const fields = {
      contactId: c._id || null,
      prenoms: c.prenoms || '',
      nom: c.nom || c.raisonSociale || '',
      cabinet: c.raisonSociale || c.cabinet || '',
      adresse: c.adresse || '',
      codePostal: c.codePostal || '',
      ville: c.ville || '',
      email: c.email || '',
      telephone: c.telephone || '',
    };
    Object.entries(fields).forEach(([k, v]) => setNotaire(k, v));
  };

  const notaire = draft.notaire || {};
  const presta = draft.prestationCompensatoire || {};
  const logement = draft.logementFamilial || {};

  const nbEnfants = (draft.enfants || []).length;
  const nbPensions = (draft.pensionsAlimentaires || []).length;
  const labelRegime = (constants?.regimesMatrimoniaux || []).find(r => r.code === draft.mariage?.regime)?.label || '—';
  const labelLogement = (constants?.typesLogement || []).find(t => t.code === logement.type)?.label || '—';
  const labelForme = (constants?.formesPrestation || []).find(f => f.code === presta.forme)?.label || '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="k-dcm-card">
        <h3 className="k-dcm-card-title">Notaire depositaire</h3>
        <p className="k-dcm-card-subtitle">
          La convention signee est deposee par le notaire dans les 7 jours. Le recepisse delivre par le notaire
          a effet dissolutif du mariage. Le notaire peut etre choisi plus tard si vous ne l'avez pas encore identifie.
        </p>

        <ContactSearchBox
          kind="notaire"
          label="Le notaire est-il deja un contact ?"
          placeholder="Tapez le nom du notaire (au moins 2 caracteres)..."
          onSelect={handleSelectNotaire}
        />

        <div className="k-dcm-grid cols-3">
          <div className="k-dcm-field">
            <label>Prenom(s)</label>
            <input type="text" value={notaire.prenoms || ''} onChange={e => setNotaire('prenoms', e.target.value)} />
          </div>
          <div className="k-dcm-field">
            <label>Nom</label>
            <input type="text" value={notaire.nom || ''} onChange={e => setNotaire('nom', e.target.value)} />
          </div>
          <div className="k-dcm-field">
            <label>Cabinet / etude</label>
            <input type="text" value={notaire.cabinet || ''} onChange={e => setNotaire('cabinet', e.target.value)} />
          </div>
          <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
            <label>Adresse</label>
            <input type="text" value={notaire.adresse || ''} onChange={e => setNotaire('adresse', e.target.value)} />
          </div>
          <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
            <label>Ville + CP</label>
            <CommunePicker
              ville={notaire.ville}
              codePostal={notaire.codePostal}
              onChange={({ ville, codePostal }) => {
                setNotaire('ville', ville);
                setNotaire('codePostal', codePostal);
              }}
            />
          </div>
          <div className="k-dcm-field">
            <label>Telephone</label>
            <input type="tel" value={notaire.telephone || ''} onChange={e => setNotaire('telephone', e.target.value)} />
          </div>
          <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
            <label>Email</label>
            <input type="email" value={notaire.email || ''} onChange={e => setNotaire('email', e.target.value)} />
          </div>
          <div className="k-dcm-field">
            <label>Date de depot prevue</label>
            <input
              type="date"
              value={toDateInputValue(notaire.dateDepotPrevue)}
              onChange={e => setNotaire('dateDepotPrevue', e.target.value || null)}
            />
          </div>
        </div>
      </div>

      {/* ============== RECAP FINAL ============== */}
      <div className="k-dcm-card">
        <h3 className="k-dcm-card-title">Recapitulatif avant creation</h3>
        <p className="k-dcm-card-subtitle">
          Verifiez les informations ci-dessous. Vous pourrez modifier la fiche apres creation depuis l'onglet "Divorce CM" du dossier.
        </p>

        <div className="k-dcm-recap-grid">
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Voie procedurale</div>
            <div className="k-dcm-recap-value">
              {draft.voie === 'judiciaire' ? 'Judiciaire (audition mineur demandee)' : 'Extrajudiciaire'}
            </div>
          </div>
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Mariage</div>
            <div className="k-dcm-recap-value">
              {formatDate(draft.mariage?.dateMariage)} — {draft.mariage?.lieuMariage || '—'}
              {'\n'}Regime : {labelRegime}
            </div>
          </div>

          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Epoux 1 (client)</div>
            <div className="k-dcm-recap-value">
              {fullNameEpoux(draft.epoux1) || '—'}
              {'\n'}{draft.epoux1?.adresse || ''} {draft.epoux1?.ville || ''}
            </div>
          </div>
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Epoux 2</div>
            <div className="k-dcm-recap-value">
              {fullNameEpoux(draft.epoux2) || '—'}
              {'\n'}Avocat : {draft.epoux2?.avocat?.nom ? `${draft.epoux2.avocat.prenoms || ''} ${draft.epoux2.avocat.nom}` : '— (a renseigner)'}
              {' '}{draft.epoux2?.avocat?.barreau ? `(barreau de ${draft.epoux2.avocat.barreau})` : ''}
            </div>
          </div>

          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Enfants</div>
            <div className="k-dcm-recap-value">
              {nbEnfants === 0 ? 'Aucun enfant' : `${nbEnfants} enfant(s)`}
              {(draft.enfants || []).map((e, idx) => (
                `\n• ${fullNameEnfant(e) || `Enfant ${idx + 1}`}`
              )).join('')}
            </div>
          </div>
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Pensions alimentaires</div>
            <div className="k-dcm-recap-value">
              {nbPensions === 0 ? 'Aucune' : `${nbPensions} pension(s) prevue(s)`}
            </div>
          </div>

          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Prestation compensatoire</div>
            <div className="k-dcm-recap-value">
              {presta.applicable
                ? `${labelForme} — ${presta.beneficiaire === 'epoux1' ? 'au profit de l\'Epoux 1' : 'au profit de l\'Epoux 2'}\nMontant : ${formatMontant(presta.montantCapital || presta.montantRente)}`
                : 'Aucune'}
            </div>
          </div>
          <div className="k-dcm-recap-card">
            <div className="k-dcm-recap-label">Logement familial</div>
            <div className="k-dcm-recap-value">
              {labelLogement}
              {logement.detail ? `\n${logement.detail}` : ''}
            </div>
          </div>

          <div className="k-dcm-recap-card" style={{ gridColumn: 'span 2' }}>
            <div className="k-dcm-recap-label">Notaire depositaire</div>
            <div className="k-dcm-recap-value">
              {notaire.nom
                ? `${notaire.prenoms || ''} ${notaire.nom} — ${notaire.cabinet || ''} ${notaire.ville ? `(${notaire.ville})` : ''}`
                : '— (a renseigner plus tard)'}
            </div>
          </div>
        </div>

        {draft.voie === 'judiciaire' && (
          <div className="k-dcm-banner" style={{ marginTop: '0.85rem' }}>
            <span className="k-dcm-banner-icon">!</span>
            <div>
              Voie judiciaire detectee : un mineur souhaite etre entendu. La checklist sera generee pour la voie
              judiciaire (requete au juge aux affaires familiales, audition, jugement d'homologation).
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StepNotaireRecap;
