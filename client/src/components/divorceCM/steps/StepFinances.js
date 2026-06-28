// Etape 6 du wizard : prestation compensatoire, pensions alimentaires,
// nom d'usage, logement familial.
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setDraftField,
  addPension, updatePension, removePension,
} from '../../../redux/slices/divorceCMSlice';
import { fullNameEnfant, fullNameEpoux } from '../divorceCMHelpers';

const StepFinances = () => {
  const dispatch = useDispatch();
  const draft = useSelector(s => s.divorceCM.draft);
  const constants = useSelector(s => s.divorceCM.constants);

  const presta = draft?.prestationCompensatoire || {};
  const enfants = draft?.enfants || [];
  const pensions = draft?.pensionsAlimentaires || [];
  const logement = draft?.logementFamilial || {};
  const nomUsage = draft?.nomUsage || {};

  const setPresta = (key, value) => dispatch(setDraftField({ path: ['prestationCompensatoire', key], value }));
  const setLogement = (key, value) => dispatch(setDraftField({ path: ['logementFamilial', key], value }));
  const setNomUsage = (key, value) => dispatch(setDraftField({ path: ['nomUsage', key], value }));

  const updatePensionField = (index, key, value) => dispatch(updatePension({ index, patch: { [key]: value } }));
  const updatePensionNested = (index, parent, key, value) => {
    const p = pensions[index];
    const merged = { ...(p?.[parent] || {}), [key]: value };
    dispatch(updatePension({ index, patch: { [parent]: merged } }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* ========== Prestation compensatoire ========== */}
      <div className="k-dcm-card">
        <h3 className="k-dcm-card-title">Prestation compensatoire</h3>
        <p className="k-dcm-card-subtitle">
          Articles 270 et suivants du Code civil. Destinee a compenser la disparite que la rupture
          du mariage cree dans les conditions de vie respectives. La forme privilegiee est le capital.
        </p>

        <label className="k-dcm-toggle">
          <input
            type="checkbox"
            checked={!!presta.applicable}
            onChange={e => setPresta('applicable', e.target.checked)}
          />
          Une prestation compensatoire est prevue
        </label>

        {presta.applicable && (
          <>
            <div className="k-dcm-grid cols-3" style={{ marginTop: '0.85rem' }}>
              <div className="k-dcm-field">
                <label>Beneficiaire</label>
                <select value={presta.beneficiaire || ''} onChange={e => setPresta('beneficiaire', e.target.value)}>
                  <option value="">— Choisir —</option>
                  <option value="epoux1">{fullNameEpoux(draft.epoux1) || 'Epoux 1'}</option>
                  <option value="epoux2">{fullNameEpoux(draft.epoux2) || 'Epoux 2'}</option>
                </select>
              </div>
              <div className="k-dcm-field">
                <label>Forme</label>
                <select value={presta.forme || ''} onChange={e => setPresta('forme', e.target.value)}>
                  <option value="">— Choisir —</option>
                  {(constants?.formesPrestation || []).map(f => (
                    <option key={f.code} value={f.code}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="k-dcm-field">
                <label>Modalite (capital)</label>
                <select value={presta.modalitesCapital || ''} onChange={e => setPresta('modalitesCapital', e.target.value)}>
                  <option value="">— Choisir —</option>
                  {(constants?.modalitesCapital || []).map(m => (
                    <option key={m.code} value={m.code}>{m.label}</option>
                  ))}
                </select>
              </div>

              {(presta.forme === 'capital' || presta.forme === 'mixte') && (
                <>
                  <div className="k-dcm-field">
                    <label>Montant capital (EUR)</label>
                    <input
                      type="number" min="0" step="100"
                      value={presta.montantCapital ?? ''}
                      onChange={e => setPresta('montantCapital', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </div>
                  <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                    <label>Detail des modalites (echelonnement, attribution d'un bien...)</label>
                    <input
                      type="text"
                      value={presta.detailEchelonnement || ''}
                      onChange={e => setPresta('detailEchelonnement', e.target.value)}
                      placeholder="Ex : 12 mensualites de 1 500 EUR par virement le 5 de chaque mois"
                    />
                  </div>
                </>
              )}

              {(presta.forme === 'rente_temporaire' || presta.forme === 'rente_viagere' || presta.forme === 'mixte') && (
                <>
                  <div className="k-dcm-field">
                    <label>Montant mensuel rente (EUR)</label>
                    <input
                      type="number" min="0" step="50"
                      value={presta.montantRente ?? ''}
                      onChange={e => setPresta('montantRente', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </div>
                  {presta.forme === 'rente_temporaire' && (
                    <div className="k-dcm-field">
                      <label>Duree de la rente (mois)</label>
                      <input
                        type="number" min="0"
                        value={presta.dureeRenteMois ?? ''}
                        onChange={e => setPresta('dureeRenteMois', e.target.value === '' ? null : Number(e.target.value))}
                      />
                    </div>
                  )}
                  <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
                    <label>Indexation de la rente</label>
                    <input
                      type="text"
                      value={presta.indexationRente || ''}
                      onChange={e => setPresta('indexationRente', e.target.value)}
                      placeholder="Ex : indice INSEE des prix a la consommation, revision au 1er janvier"
                    />
                  </div>
                </>
              )}

              <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
                <label>Motivation (criteres art. 271 C. civ.)</label>
                <textarea
                  rows={3}
                  value={presta.motifs || ''}
                  onChange={e => setPresta('motifs', e.target.value)}
                  placeholder="Ages des epoux, duree du mariage, situation professionnelle, patrimoine, choix de carriere consenti pour les enfants..."
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ========== Pensions alimentaires / contribution a l'entretien ========== */}
      <div className="k-dcm-card">
        <h3 className="k-dcm-card-title">Contribution a l'entretien et l'education des enfants</h3>
        <p className="k-dcm-card-subtitle">
          Une pension par enfant le cas echeant. Indexation et frais exceptionnels reparties.
        </p>

        {pensions.length === 0 && (
          <div className="k-dcm-empty-list">
            Aucune pension definie. Ajouter une pension pour chaque enfant qui en beneficie, ou laisser vide
            si la residence alternee suffit a la repartition.
          </div>
        )}

        {pensions.map((p, index) => (
          <div key={index} className="k-dcm-item-card">
            <div className="k-dcm-item-card-header">
              <span className="k-dcm-item-card-title">Pension #{index + 1}</span>
              <button className="k-dcm-btn k-dcm-btn-danger" onClick={() => dispatch(removePension(index))}>
                Retirer
              </button>
            </div>

            <div className="k-dcm-grid cols-3">
              <div className="k-dcm-field">
                <label>Pour l'enfant</label>
                <select
                  value={p.enfantIdLocal || ''}
                  onChange={e => updatePensionField(index, 'enfantIdLocal', e.target.value || null)}
                >
                  <option value="">— Choisir —</option>
                  {enfants.map((enf, idx) => (
                    <option key={idx} value={enf._id || `local_${idx}`}>
                      {fullNameEnfant(enf) || `Enfant ${idx + 1}`}
                    </option>
                  ))}
                </select>
                {enfants.length === 0 && (
                  <div className="help" style={{ color: '#92400e' }}>Ajouter d'abord les enfants a l'etape precedente.</div>
                )}
              </div>
              <div className="k-dcm-field">
                <label>Debiteur (qui paye)</label>
                <select value={p.debiteur || ''} onChange={e => updatePensionField(index, 'debiteur', e.target.value)}>
                  <option value="">— Choisir —</option>
                  <option value="epoux1">{fullNameEpoux(draft.epoux1) || 'Epoux 1'}</option>
                  <option value="epoux2">{fullNameEpoux(draft.epoux2) || 'Epoux 2'}</option>
                </select>
              </div>
              <div className="k-dcm-field">
                <label>Montant mensuel (EUR)</label>
                <input
                  type="number" min="0" step="10"
                  value={p.montantMensuel ?? ''}
                  onChange={e => updatePensionField(index, 'montantMensuel', e.target.value === '' ? null : Number(e.target.value))}
                />
              </div>

              <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
                <label>Modalites de paiement</label>
                <input
                  type="text"
                  value={p.modalitesPaiement || ''}
                  onChange={e => updatePensionField(index, 'modalitesPaiement', e.target.value)}
                />
              </div>

              <div className="k-dcm-field">
                <label>Indice d'indexation</label>
                <input
                  type="text"
                  value={p.indexation?.indice || ''}
                  onChange={e => updatePensionNested(index, 'indexation', 'indice', e.target.value)}
                />
              </div>
              <div className="k-dcm-field">
                <label>Date de revision annuelle</label>
                <input
                  type="text"
                  value={p.indexation?.dateRevision || ''}
                  onChange={e => updatePensionNested(index, 'indexation', 'dateRevision', e.target.value)}
                  placeholder="Ex : 1er janvier"
                />
              </div>
              <div className="k-dcm-field">
                <label>Duree</label>
                <select value={p.duree || ''} onChange={e => updatePensionField(index, 'duree', e.target.value)}>
                  {(constants?.dureesPension || []).map(d => (
                    <option key={d.code} value={d.code}>{d.label}</option>
                  ))}
                </select>
              </div>

              <div className="k-dcm-field">
                <label>Repartition des frais exceptionnels</label>
                <select
                  value={p.fraisExceptionnels?.repartition || '50_50'}
                  onChange={e => updatePensionNested(index, 'fraisExceptionnels', 'repartition', e.target.value)}
                >
                  {(constants?.repartitionsFrais || []).map(r => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
                <label>Detail des frais exceptionnels</label>
                <input
                  type="text"
                  value={p.fraisExceptionnels?.detail || ''}
                  onChange={e => updatePensionNested(index, 'fraisExceptionnels', 'detail', e.target.value)}
                  placeholder="Ex : frais de scolarite, sante non remboursee, activites extrascolaires"
                />
              </div>
            </div>
          </div>
        ))}

        <button className="k-dcm-btn k-dcm-btn-secondary" onClick={() => dispatch(addPension())}>
          + Ajouter une pension
        </button>
      </div>

      {/* ========== Logement familial ========== */}
      <div className="k-dcm-card">
        <h3 className="k-dcm-card-title">Logement familial</h3>
        <p className="k-dcm-card-subtitle">
          Sort du logement de la famille (proprietaire ou locataire).
        </p>

        <div className="k-dcm-grid cols-3">
          <div className="k-dcm-field">
            <label>Disposition</label>
            <select value={logement.type || ''} onChange={e => setLogement('type', e.target.value)}>
              <option value="">— Choisir —</option>
              {(constants?.typesLogement || []).map(t => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="k-dcm-field">
            <label>Nature du bien</label>
            <input
              type="text"
              value={logement.natureBien || ''}
              onChange={e => setLogement('natureBien', e.target.value)}
              placeholder="Appartement, maison, location..."
            />
          </div>
          <div className="k-dcm-field">
            <label>Soulte (EUR, si attribution)</label>
            <input
              type="number" min="0"
              value={logement.soulteEventuelle ?? ''}
              onChange={e => setLogement('soulteEventuelle', e.target.value === '' ? null : Number(e.target.value))}
            />
          </div>
          <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
            <label>Adresse du bien</label>
            <input type="text" value={logement.adresseBien || ''} onChange={e => setLogement('adresseBien', e.target.value)} />
          </div>
          <div className="k-dcm-field" style={{ gridColumn: 'span 3' }}>
            <label>Detail / conditions particulieres</label>
            <textarea
              rows={2}
              value={logement.detail || ''}
              onChange={e => setLogement('detail', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ========== Nom d'usage ========== */}
      <div className="k-dcm-card">
        <h3 className="k-dcm-card-title">Nom d'usage apres divorce (art. 264 C. civ.)</h3>
        <p className="k-dcm-card-subtitle">
          Apres le divorce, chacun reprend son nom de naissance, sauf accord ou interet particulier dument motive.
        </p>

        <div className="k-dcm-grid cols-2">
          <label className="k-dcm-toggle">
            <input
              type="checkbox"
              checked={!!nomUsage.epoux1Garde}
              onChange={e => setNomUsage('epoux1Garde', e.target.checked)}
            />
            {fullNameEpoux(draft.epoux1) || 'Epoux 1'} conserve l'usage du nom de l'autre
          </label>
          <label className="k-dcm-toggle">
            <input
              type="checkbox"
              checked={!!nomUsage.epoux2Garde}
              onChange={e => setNomUsage('epoux2Garde', e.target.checked)}
            />
            {fullNameEpoux(draft.epoux2) || 'Epoux 2'} conserve l'usage du nom de l'autre
          </label>
          {(nomUsage.epoux1Garde || nomUsage.epoux2Garde) && (
            <div className="k-dcm-field" style={{ gridColumn: 'span 2' }}>
              <label>Motif (interet particulier — professionnel ou enfants)</label>
              <textarea rows={2} value={nomUsage.motif || ''} onChange={e => setNomUsage('motif', e.target.value)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StepFinances;
