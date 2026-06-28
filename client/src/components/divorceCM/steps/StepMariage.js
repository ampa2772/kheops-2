// Etape 4 du wizard : informations sur le mariage et le regime matrimonial.
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setDraftField } from '../../../redux/slices/divorceCMSlice';
import { toDateInputValue } from '../divorceCMHelpers';
import CommunePicker from '../widgets/CommunePicker';

const StepMariage = () => {
  const dispatch = useDispatch();
  const mariage = useSelector(s => s.divorceCM.draft?.mariage) || {};
  const constants = useSelector(s => s.divorceCM.constants);

  const setField = (key, value) => dispatch(setDraftField({ path: ['mariage', key], value }));
  const setContratField = (key, value) => dispatch(setDraftField({ path: ['mariage', 'contratMariage', key], value }));

  return (
    <div className="k-dcm-card">
      <h3 className="k-dcm-card-title">Mariage et regime matrimonial</h3>
      <p className="k-dcm-card-subtitle">
        Informations issues de l'acte de mariage et du contrat (le cas echeant).
        Elles seront pre-remplies dans la convention de divorce.
      </p>

      <div className="k-dcm-grid cols-3">
        <div className="k-dcm-field">
          <label>Date du mariage</label>
          <input
            type="date"
            value={toDateInputValue(mariage.dateMariage)}
            onChange={e => setField('dateMariage', e.target.value || null)}
          />
        </div>
        <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
          <label>Lieu du mariage (commune + CP)</label>
          <CommunePicker
            ville={mariage.lieuMariage}
            codePostal={mariage.cpMariage || ''}
            onChange={({ ville, codePostal }) => {
              setField('lieuMariage', ville);
              setField('cpMariage', codePostal);
            }}
            villeLabel="Commune du mariage"
            cpLabel="CP"
          />
        </div>
        <div className="k-dcm-field">
          <label>Pays</label>
          <input type="text" value={mariage.paysMariage || 'France'} onChange={e => setField('paysMariage', e.target.value)} />
        </div>
        <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
          <label>Numero de l'acte de mariage</label>
          <input type="text" value={mariage.numeroActeMariage || ''} onChange={e => setField('numeroActeMariage', e.target.value)} />
        </div>
      </div>

      <h4 className="k-dcm-card-title" style={{ marginTop: '1rem' }}>Regime matrimonial</h4>
      <div className="k-dcm-grid full">
        <div className="k-dcm-field">
          <label>Regime applicable</label>
          <select value={mariage.regime || ''} onChange={e => setField('regime', e.target.value)}>
            <option value="">— Choisir —</option>
            {(constants?.regimesMatrimoniaux || []).map(r => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
        </div>

        <label className="k-dcm-toggle">
          <input
            type="checkbox"
            checked={!!mariage.contratMariage?.existence}
            onChange={e => setContratField('existence', e.target.checked)}
          />
          Un contrat de mariage a ete signe devant notaire
        </label>

        {mariage.contratMariage?.existence && (
          <div className="k-dcm-grid cols-3" style={{ marginTop: '0.4rem' }}>
            <div className="k-dcm-field">
              <label>Date du contrat</label>
              <input
                type="date"
                value={toDateInputValue(mariage.contratMariage?.dateContrat)}
                onChange={e => setContratField('dateContrat', e.target.value || null)}
              />
            </div>
            <div className="k-dcm-field">
              <label>Notaire redacteur</label>
              <input type="text" value={mariage.contratMariage?.notaireRedacteur || ''} onChange={e => setContratField('notaireRedacteur', e.target.value)} />
            </div>
            <div className="k-dcm-field">
              <label>Ville du notaire</label>
              <input type="text" value={mariage.contratMariage?.villeNotaire || ''} onChange={e => setContratField('villeNotaire', e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <div className="k-dcm-grid full" style={{ marginTop: '1rem' }}>
        <div className="k-dcm-field">
          <label>Patrimoine commun (resume)</label>
          <textarea
            rows={4}
            value={mariage.patrimoineResume || ''}
            onChange={e => setField('patrimoineResume', e.target.value)}
            placeholder="Bref resume des biens (immobilier, comptes, parts sociales, dettes). L'etat liquidatif notarial est un document separe en cas de bien immobilier."
          />
          <div className="help">
            En presence d'un bien immobilier commun, un etat liquidatif etabli par notaire est obligatoirement joint a la convention.
          </div>
        </div>
      </div>
    </div>
  );
};

export default StepMariage;
