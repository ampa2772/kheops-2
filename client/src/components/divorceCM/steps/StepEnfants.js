// Etape 5 du wizard : enfants + adultes a charge.
//
// La section "Adultes a charge" couvre les majeurs handicapes, parents
// ages a charge, etudiants sans autonomie financiere... importes
// automatiquement depuis les PersonneCharge type='adulte' du contact
// epoux a la selection.
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addEnfant, updateEnfant, removeEnfant,
  addAdulte, updateAdulte, removeAdulte,
} from '../../../redux/slices/divorceCMSlice';
import { toDateInputValue, ageFromBirthdate, isMineur, fullNameEnfant, fullNameAdulte } from '../divorceCMHelpers';
import CommunePicker from '../widgets/CommunePicker';

const StepEnfants = () => {
  const dispatch = useDispatch();
  const enfants = useSelector(s => s.divorceCM.draft?.enfants) || [];
  const adultesCharge = useSelector(s => s.divorceCM.draft?.adultesCharge) || [];
  const constants = useSelector(s => s.divorceCM.constants);

  const auditionDemandee = enfants.some(e => e?.souhaiteEtreEntendu);

  const update = (index, patch) => dispatch(updateEnfant({ index, patch }));
  const updateNested = (index, parent, key, value) => {
    const enfant = enfants[index];
    const merged = { ...(enfant?.[parent] || {}), [key]: value };
    update(index, { [parent]: merged });
  };

  return (
    <div className="k-dcm-card">
      <h3 className="k-dcm-card-title">Enfants du couple</h3>
      <p className="k-dcm-card-subtitle">
        Renseignez chaque enfant ne du mariage ou commun. Si un enfant mineur souhaite etre entendu (art. 388-1 C. civ.),
        la voie procedurale bascule automatiquement en judiciaire.
      </p>

      {auditionDemandee && (
        <div className="k-dcm-banner" style={{ marginBottom: '0.8rem' }}>
          <span className="k-dcm-banner-icon">!</span>
          <div>
            Au moins un enfant mineur souhaite etre entendu : la voie procedurale passera automatiquement en judiciaire
            (requete au juge aux affaires familiales). La checklist sera adaptee.
          </div>
        </div>
      )}

      {enfants.length === 0 && (
        <div className="k-dcm-empty-list">
          Aucun enfant pour le moment. Si le couple n'a pas d'enfant, passer simplement a l'etape suivante.
        </div>
      )}

      {enfants.map((enfant, index) => {
        const age = ageFromBirthdate(enfant.dateNaissance);
        const mineur = isMineur(enfant.dateNaissance);
        return (
          <div key={index} className="k-dcm-item-card">
            <div className="k-dcm-item-card-header">
              <span className="k-dcm-item-card-title">
                Enfant {index + 1} : {fullNameEnfant(enfant)}
                {age !== null && (
                  <span style={{ marginLeft: '0.5rem', fontWeight: 400, color: mineur ? '#92400e' : '#6b7280', fontSize: '0.78rem' }}>
                    {age} ans {mineur ? '(mineur)' : '(majeur)'}
                  </span>
                )}
              </span>
              <button className="k-dcm-btn k-dcm-btn-danger" onClick={() => dispatch(removeEnfant(index))}>
                Retirer
              </button>
            </div>

            <div className="k-dcm-grid cols-4">
              <div className="k-dcm-field">
                <label>Sexe</label>
                <select value={enfant.sexe || ''} onChange={e => update(index, { sexe: e.target.value })}>
                  <option value="">— Choisir —</option>
                  {(constants?.sexes || [{ code: 'M', label: 'Garcon' }, { code: 'F', label: 'Fille' }])
                    .map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
                </select>
              </div>
              <div className="k-dcm-field">
                <label>Prenom(s)</label>
                <input type="text" value={enfant.prenoms || ''} onChange={e => update(index, { prenoms: e.target.value })} />
              </div>
              <div className="k-dcm-field">
                <label>Nom</label>
                <input type="text" value={enfant.nom || ''} onChange={e => update(index, { nom: e.target.value })} />
              </div>
              <div className="k-dcm-field">
                <label>Date de naissance</label>
                <input
                  type="date"
                  value={toDateInputValue(enfant.dateNaissance)}
                  onChange={e => update(index, { dateNaissance: e.target.value || null })}
                />
              </div>

              <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                <label>Lieu de naissance + CP</label>
                <CommunePicker
                  ville={enfant.lieuNaissance}
                  codePostal={enfant.cpNaissance || ''}
                  onChange={({ ville, codePostal }) => update(index, { lieuNaissance: ville, cpNaissance: codePostal })}
                  villeLabel="Ville de naissance"
                  cpLabel="CP"
                />
              </div>
              <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                <label>Etablissement scolaire</label>
                <input
                  type="text"
                  value={enfant.scolarite?.etablissement || ''}
                  onChange={e => updateNested(index, 'scolarite', 'etablissement', e.target.value)}
                />
              </div>
              <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                <label>Classe</label>
                <input
                  type="text"
                  value={enfant.scolarite?.classe || ''}
                  onChange={e => updateNested(index, 'scolarite', 'classe', e.target.value)}
                />
              </div>
              <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                <label>Ville d'ecole</label>
                <input
                  type="text"
                  value={enfant.scolarite?.ville || ''}
                  onChange={e => updateNested(index, 'scolarite', 'ville', e.target.value)}
                />
              </div>
            </div>

            <h5 style={{ margin: '0.85rem 0 0.4rem 0', fontSize: '0.85rem', color: '#1e3a8a', fontWeight: 600 }}>
              Apres le divorce
            </h5>

            <div className="k-dcm-grid cols-3">
              <div className="k-dcm-field">
                <label>Type de residence</label>
                <select
                  value={enfant.residence?.type || ''}
                  onChange={e => updateNested(index, 'residence', 'type', e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {(constants?.typesResidence || []).map(t => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                <label>Detail (alternance, frequence)</label>
                <input
                  type="text"
                  value={enfant.residence?.detailAlternance || ''}
                  onChange={e => updateNested(index, 'residence', 'detailAlternance', e.target.value)}
                  placeholder="Ex : 1 semaine sur 2 du vendredi 18h au vendredi 18h"
                />
              </div>
              <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
                <label>Droit de visite et d'hebergement (parent non hebergeant)</label>
                <input
                  type="text"
                  value={enfant.residence?.droitVisiteHebergement || ''}
                  onChange={e => updateNested(index, 'residence', 'droitVisiteHebergement', e.target.value)}
                  placeholder="Ex : 1er, 3e et 5e week-end de chaque mois, du vendredi 18h au dimanche 18h"
                />
              </div>
              <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
                <label>Vacances scolaires</label>
                <input
                  type="text"
                  value={enfant.residence?.vacancesScolaires || ''}
                  onChange={e => updateNested(index, 'residence', 'vacancesScolaires', e.target.value)}
                  placeholder="Ex : moitie des vacances en alternance (annees paires/impaires)"
                />
              </div>

              <div className="k-dcm-field">
                <label>Autorite parentale</label>
                <select
                  value={enfant.autoriteParentale || 'conjointe'}
                  onChange={e => update(index, { autoriteParentale: e.target.value })}
                >
                  {(constants?.typesAutoriteParental || []).map(a => (
                    <option key={a.code} value={a.code}>{a.label}</option>
                  ))}
                </select>
              </div>

              {mineur && (
                <label className="k-dcm-toggle" style={{ gridColumn: 'span 2' }}>
                  <input
                    type="checkbox"
                    checked={!!enfant.souhaiteEtreEntendu}
                    onChange={e => update(index, { souhaiteEtreEntendu: e.target.checked })}
                  />
                  L'enfant souhaite etre entendu (declenche la voie judiciaire)
                </label>
              )}
            </div>
          </div>
        );
      })}

      <button className="k-dcm-btn k-dcm-btn-secondary" onClick={() => dispatch(addEnfant())} style={{ marginTop: '0.5rem' }}>
        + Ajouter un enfant
      </button>

      {/* ============================================================
        * Section Adultes a charge
        * ============================================================ */}
      <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e5e7eb' }}>
        <h3 className="k-dcm-card-title">Adultes a charge</h3>
        <p className="k-dcm-card-subtitle">
          Personnes majeures dont l'un des epoux (ou les deux) ont la charge :
          enfants majeurs handicapes, parents ages dependants, etudiants
          majeurs sans autonomie financiere, etc.
        </p>

        {adultesCharge.length === 0 && (
          <div className="k-dcm-empty-list">
            Aucun adulte a charge. Si aucune personne majeure n'est a la charge
            du couple, passez simplement a l'etape suivante.
          </div>
        )}

        {adultesCharge.map((a, index) => {
          const age = ageFromBirthdate(a.dateNaissance);
          return (
            <div key={index} className="k-dcm-item-card">
              <div className="k-dcm-item-card-header">
                <span className="k-dcm-item-card-title">
                  Adulte {index + 1} : {fullNameAdulte(a)}
                  {age !== null && (
                    <span style={{ marginLeft: '0.5rem', fontWeight: 400, color: '#6b7280', fontSize: '0.78rem' }}>
                      {age} ans
                    </span>
                  )}
                </span>
                <button className="k-dcm-btn k-dcm-btn-danger" onClick={() => dispatch(removeAdulte(index))}>
                  Retirer
                </button>
              </div>

              <div className="k-dcm-grid cols-4">
                <div className="k-dcm-field">
                  <label>Sexe</label>
                  <select value={a.sexe || ''} onChange={e => dispatch(updateAdulte({ index, patch: { sexe: e.target.value } }))}>
                    <option value="">— Choisir —</option>
                    <option value="M">Masculin</option>
                    <option value="F">Feminin</option>
                  </select>
                </div>
                <div className="k-dcm-field">
                  <label>Prenom(s)</label>
                  <input
                    type="text"
                    value={a.prenoms || ''}
                    onChange={e => dispatch(updateAdulte({ index, patch: { prenoms: e.target.value } }))}
                  />
                </div>
                <div className="k-dcm-field">
                  <label>Nom</label>
                  <input
                    type="text"
                    value={a.nom || ''}
                    onChange={e => dispatch(updateAdulte({ index, patch: { nom: e.target.value } }))}
                  />
                </div>
                <div className="k-dcm-field">
                  <label>Date de naissance</label>
                  <input
                    type="date"
                    value={toDateInputValue(a.dateNaissance)}
                    onChange={e => dispatch(updateAdulte({ index, patch: { dateNaissance: e.target.value || null } }))}
                  />
                </div>

                <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                  <label>Lien (parent, frere/soeur, enfant majeur, autre)</label>
                  <input
                    type="text"
                    value={a.lien || ''}
                    onChange={e => dispatch(updateAdulte({ index, patch: { lien: e.target.value } }))}
                    placeholder="Ex : pere de l'epoux 1, fils majeur handicape, etc."
                  />
                </div>
                <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                  <label>Motif de la charge</label>
                  <input
                    type="text"
                    value={a.motif || ''}
                    onChange={e => dispatch(updateAdulte({ index, patch: { motif: e.target.value } }))}
                    placeholder="Ex : handicap (AAH), dependance, etudes, etc."
                  />
                </div>

                <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                  <label>Adresse</label>
                  <input
                    type="text"
                    value={a.adresse || ''}
                    onChange={e => dispatch(updateAdulte({ index, patch: { adresse: e.target.value } }))}
                  />
                </div>
                <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                  <label>Ville + CP</label>
                  <CommunePicker
                    ville={a.ville}
                    codePostal={a.codePostal || ''}
                    onChange={({ ville, codePostal }) => dispatch(updateAdulte({ index, patch: { ville, codePostal } }))}
                    villeLabel="Ville"
                    cpLabel="CP"
                  />
                </div>

                <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                  <label>A la charge de</label>
                  <select
                    value={a.aLaChargeDe || 'commun'}
                    onChange={e => dispatch(updateAdulte({ index, patch: { aLaChargeDe: e.target.value } }))}
                  >
                    <option value="commun">Charge commune des deux epoux</option>
                    <option value="epoux1">A la charge de l'Epoux 1</option>
                    <option value="epoux2">A la charge de l'Epoux 2</option>
                  </select>
                </div>
              </div>
            </div>
          );
        })}

        <button className="k-dcm-btn k-dcm-btn-secondary" onClick={() => dispatch(addAdulte())} style={{ marginTop: '0.5rem' }}>
          + Ajouter un adulte a charge
        </button>
      </div>
    </div>
  );
};

export default StepEnfants;
