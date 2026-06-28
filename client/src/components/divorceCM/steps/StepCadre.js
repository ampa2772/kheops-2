// Etape 1 du wizard : voie procedurale (extrajudiciaire / judiciaire)
// + saisie de la date du premier entretien.
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setDraftField } from '../../../redux/slices/divorceCMSlice';
import { toDateInputValue } from '../divorceCMHelpers';

const StepCadre = () => {
  const dispatch = useDispatch();
  const draft = useSelector(s => s.divorceCM.draft);
  const constants = useSelector(s => s.divorceCM.constants);

  const setField = (path, value) => dispatch(setDraftField({ path, value }));

  return (
    <div className="k-dcm-card">
      <h3 className="k-dcm-card-title">Cadre du divorce</h3>
      <p className="k-dcm-card-subtitle">
        Choisissez la voie procedurale et indiquez les dates clefs deja connues.
        La voie peut basculer automatiquement en judiciaire si un enfant mineur souhaite etre entendu (etape Enfants).
      </p>

      <div className="k-dcm-grid">
        <div className="k-dcm-field">
          <label>Voie procedurale</label>
          <select
            value={draft.voie || 'extrajudiciaire'}
            onChange={e => setField(['voie'], e.target.value)}
          >
            {(constants?.voies || [
              { code: 'extrajudiciaire', label: 'Extrajudiciaire' },
              { code: 'judiciaire', label: 'Judiciaire' },
            ]).map(v => (
              <option key={v.code} value={v.code}>{v.label}</option>
            ))}
          </select>
          <div className="help">
            Depuis 2017, la voie extrajudiciaire (acte sous signature privee contresigne par avocat) est la regle.
            La voie judiciaire ne s'applique que si un enfant mineur demande son audition (art. 388-1 C. civ.).
          </div>
        </div>

        <div className="k-dcm-field">
          <label>Date du premier entretien des epoux</label>
          <input
            type="date"
            value={toDateInputValue(draft.dates?.premierEntretien)}
            onChange={e => setField(['dates', 'premierEntretien'], e.target.value || null)}
          />
        </div>
      </div>
    </div>
  );
};

export default StepCadre;
