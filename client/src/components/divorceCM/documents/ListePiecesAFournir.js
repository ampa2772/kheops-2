// client/src/components/divorceCM/documents/ListePiecesAFournir.js
//
// Liste imprimable des pieces que le client doit fournir au cabinet pour
// monter le dossier de divorce par consentement mutuel.
// La liste est adaptee au cas d'espece (presence d'enfants, regime
// matrimonial, biens immobiliers, etc.).
import React from 'react';
import {
  formatDateLongue,
  nomCompletEpoux,
} from './documentHelpers';
import './divorceCMDocs.css';

const ListePiecesAFournir = ({ data, dossier }) => {
  if (!data) return null;

  const epoux1 = data.epoux1 || {};
  const epoux2 = data.epoux2 || {};
  const enfants = data.enfants || [];
  const mariage = data.mariage || {};
  const presta = data.prestationCompensatoire || {};
  const logement = data.logementFamilial || {};
  const refDossier = dossier?.reference || '';

  const aBienImmobilier = logement.type === 'attribution_epoux1'
    || logement.type === 'attribution_epoux2'
    || logement.type === 'vente'
    || logement.type === 'indivision';

  const Checkbox = () => <span className="k-dcm-doc-checkbox" />;

  return (
    <div className="k-dcm-doc-print-area">
      <div className="k-dcm-doc-page">
        <h1>Liste des pieces a fournir</h1>
        <p style={{ textAlign: 'center', fontStyle: 'italic', fontSize: '10.5pt', marginTop: '-0.3cm' }}>
          Divorce par consentement mutuel
        </p>
        {refDossier && (
          <p style={{ textAlign: 'right', fontSize: '10pt' }}>Dossier : {refDossier}</p>
        )}

        <p>
          Pour permettre la redaction de la convention de divorce et son depot au notaire, merci de
          bien vouloir reunir et nous transmettre les pieces suivantes. Cocher chaque piece au fur et
          a mesure de la transmission au cabinet.
        </p>

        {/* ----- Etat civil ----- */}
        <h2>1. Pieces d'etat civil</h2>
        <table className="k-dcm-doc-table">
          <thead>
            <tr><th style={{ width: '60%' }}>Piece</th><th style={{ width: '20%' }}>Coche</th><th style={{ width: '20%' }}>Date remise</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Piece d'identite en cours de validite (carte nationale ou passeport)<br />
                <em>{nomCompletEpoux(epoux1)}</em>
              </td>
              <td><Checkbox /></td><td></td>
            </tr>
            <tr>
              <td>
                Piece d'identite en cours de validite<br />
                <em>{nomCompletEpoux(epoux2)}</em>
              </td>
              <td><Checkbox /></td><td></td>
            </tr>
            <tr>
              <td>Justificatif de domicile recent (moins de 3 mois) — pour chacun des epoux</td>
              <td><Checkbox /></td><td></td>
            </tr>
            <tr>
              <td>
                Copie integrale de l'acte de mariage (de moins de 3 mois)<br />
                <em>Mariage du {formatDateLongue(mariage.dateMariage)} a {mariage.lieuMariage || '__________'}</em>
              </td>
              <td><Checkbox /></td><td></td>
            </tr>
            <tr>
              <td>Livret de famille (copie de l'integralite des pages remplies)</td>
              <td><Checkbox /></td><td></td>
            </tr>
            <tr>
              <td>Copie integrale de l'acte de naissance (de moins de 3 mois) — pour chacun des epoux</td>
              <td><Checkbox /></td><td></td>
            </tr>
            {mariage.contratMariage?.existence && (
              <tr>
                <td>Copie du contrat de mariage</td>
                <td><Checkbox /></td><td></td>
              </tr>
            )}
          </tbody>
        </table>

        {/* ----- Enfants ----- */}
        {enfants.length > 0 && (
          <>
            <h2>2. Enfants</h2>
            <table className="k-dcm-doc-table">
              <thead>
                <tr><th style={{ width: '60%' }}>Piece</th><th style={{ width: '20%' }}>Coche</th><th style={{ width: '20%' }}>Date remise</th></tr>
              </thead>
              <tbody>
                {enfants.map((e, idx) => (
                  <tr key={idx}>
                    <td>
                      Copie integrale de l'acte de naissance (moins de 3 mois)<br />
                      <em>{e.prenoms} {e.nom}{e.dateNaissance ? `, ne(e) le ${formatDateLongue(e.dateNaissance)}` : ''}</em>
                    </td>
                    <td><Checkbox /></td><td></td>
                  </tr>
                ))}
                <tr>
                  <td>Justificatifs de scolarite des enfants mineurs (certificat de scolarite recent)</td>
                  <td><Checkbox /></td><td></td>
                </tr>
                <tr>
                  <td>
                    Information de chaque enfant mineur de son droit a etre entendu par le juge
                    (article 388-1 C. civ.) — confirmer que l'enfant n'a pas souhaite faire usage de cette faculte
                  </td>
                  <td><Checkbox /></td><td></td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* ----- Patrimoine et revenus ----- */}
        <h2>{enfants.length > 0 ? '3' : '2'}. Patrimoine et revenus</h2>
        <table className="k-dcm-doc-table">
          <thead>
            <tr><th style={{ width: '60%' }}>Piece</th><th style={{ width: '20%' }}>Coche</th><th style={{ width: '20%' }}>Date remise</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>3 derniers bulletins de salaire — pour chacun des epoux (le cas echeant)</td>
              <td><Checkbox /></td><td></td>
            </tr>
            <tr>
              <td>2 derniers avis d'imposition</td>
              <td><Checkbox /></td><td></td>
            </tr>
            <tr>
              <td>Justificatifs des revenus complementaires (loyers percus, BNC/BIC, retraites, etc.)</td>
              <td><Checkbox /></td><td></td>
            </tr>
            <tr>
              <td>Releves de comptes bancaires (3 derniers mois) pour chacun</td>
              <td><Checkbox /></td><td></td>
            </tr>
            <tr>
              <td>Justificatifs des credits en cours (immobilier, consommation)</td>
              <td><Checkbox /></td><td></td>
            </tr>
            {aBienImmobilier && (
              <>
                <tr>
                  <td><strong>Bien immobilier</strong> — copie de l'acte de propriete (titre de propriete) ou bail</td>
                  <td><Checkbox /></td><td></td>
                </tr>
                <tr>
                  <td>Estimation recente (moins de 6 mois) du bien immobilier (notaire ou agence)</td>
                  <td><Checkbox /></td><td></td>
                </tr>
                <tr>
                  <td>Tableau d'amortissement du pret immobilier (si applicable)</td>
                  <td><Checkbox /></td><td></td>
                </tr>
                <tr>
                  <td>Etat liquidatif notarial (acte authentique) — sera etabli par le notaire designe</td>
                  <td><Checkbox /></td><td></td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        {/* ----- Prestation compensatoire ----- */}
        {presta.applicable && (
          <>
            <h2>{enfants.length > 0 ? '4' : '3'}. Prestation compensatoire</h2>
            <table className="k-dcm-doc-table">
              <thead>
                <tr><th style={{ width: '60%' }}>Piece</th><th style={{ width: '20%' }}>Coche</th><th style={{ width: '20%' }}>Date remise</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    Justificatifs detailles de la situation patrimoniale et professionnelle des deux epoux
                    (criteres de l'article 271 C. civ.) :
                    age, etat de sante, duree du mariage, qualifications, situation professionnelle,
                    consequences des choix de carriere, droits a la retraite, patrimoine respectif
                  </td>
                  <td><Checkbox /></td><td></td>
                </tr>
                <tr>
                  <td>Releve de carriere CNAV / Caisse de retraite — pour chacun des epoux</td>
                  <td><Checkbox /></td><td></td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* ----- Notaire ----- */}
        <h2>{(presta.applicable ? 1 : 0) + (enfants.length > 0 ? 1 : 0) + 3}. Choix du notaire</h2>
        <table className="k-dcm-doc-table">
          <thead>
            <tr><th style={{ width: '60%' }}>Piece</th><th style={{ width: '20%' }}>Coche</th><th style={{ width: '20%' }}>Date remise</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Choix du notaire depositaire (un notaire au choix des epoux ou suggere par le cabinet) :
                accord ecrit ou email confirmant la designation
              </td>
              <td><Checkbox /></td><td></td>
            </tr>
          </tbody>
        </table>

        <p style={{ marginTop: '0.6cm', fontSize: '10.5pt' }}>
          <strong>Important :</strong> ces pieces seront a fournir avant la signature de la convention.
          Le cabinet se charge de transmettre une copie au notaire en meme temps que la convention.
          La conservation des originaux par les epoux est recommandee.
        </p>

        <p style={{ fontSize: '10.5pt' }}>
          En cas de difficulte pour obtenir une piece (notamment d'etat civil), nous contacter sans
          tarder afin que nous vous indiquions la marche a suivre.
        </p>

        <p style={{ marginTop: '0.8cm', fontSize: '9pt', fontStyle: 'italic', color: '#444', borderTop: '1px solid #999', paddingTop: '0.3cm' }}>
          Document genere automatiquement a partir de la fiche divorce. La liste est indicative et peut
          etre completee selon les particularites du dossier.
        </p>
      </div>
    </div>
  );
};

export default ListePiecesAFournir;
