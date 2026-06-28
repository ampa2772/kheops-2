// client/src/components/divorceCM/documents/EtatLiquidatif.js
//
// Etat liquidatif type — document preparatoire (et non l'acte authentique
// notarial obligatoire en cas de bien immobilier soumis a publicite
// fonciere). Sert de base de discussion entre les parties et de support
// pour le notaire qui dressera l'acte authentique.
//
// Contenu :
//  1. Rappel du regime matrimonial et de la composition de la masse
//     a partager
//  2. Tableau Actif / Passif
//  3. Bilan et propositions de partage
//  4. Mention d'orientation vers le notaire le cas echeant
import React from 'react';
import {
  formatDateLongue,
  identiteEpouxBloc,
  nomCompletEpoux,
  formatMontant,
  nombreEnLettres,
} from './documentHelpers';
import './divorceCMDocs.css';

const EtatLiquidatif = ({ data, dossier }) => {
  if (!data) return null;

  const epoux1 = data.epoux1 || {};
  const epoux2 = data.epoux2 || {};
  const mariage = data.mariage || {};
  const logement = data.logementFamilial || {};
  const presta = data.prestationCompensatoire || {};
  const refDossier = dossier?.reference || '';

  const labelRegime = {
    communaute_legale: 'la communaute legale reduite aux acquets',
    separation_biens: 'la separation de biens',
    communaute_universelle: 'la communaute universelle',
    participation_acquets: 'la participation aux acquets',
    autre: 'un regime particulier',
  }[mariage.regime] || '__________';

  const aBienImmobilier = ['attribution_epoux1', 'attribution_epoux2', 'vente', 'indivision'].includes(logement.type);

  const labelLogement = {
    attribution_epoux1: `attribue a ${nomCompletEpoux(epoux1)}`,
    attribution_epoux2: `attribue a ${nomCompletEpoux(epoux2)}`,
    vente: 'mis en vente avec partage du prix',
    indivision: 'maintenu en indivision',
    autre: 'fait l\'objet d\'une disposition particuliere',
  }[logement.type] || '__________';

  return (
    <div className="k-dcm-doc-print-area">
      <div className="k-dcm-doc-page">
        <h1>Etat liquidatif type</h1>
        <p style={{ textAlign: 'center', fontStyle: 'italic', fontSize: '10.5pt', marginTop: '-0.3cm' }}>
          Document preparatoire — divorce par consentement mutuel
        </p>
        {refDossier && (
          <p style={{ textAlign: 'right', fontSize: '10pt' }}>Dossier : {refDossier}</p>
        )}

        <div className="k-dcm-doc-citation" style={{ marginTop: '0.5cm' }}>
          Le present document constitue un etat liquidatif preparatoire reflectant l'accord des epoux
          sur la composition et le partage de leur masse commune. <strong>Il ne se substitue pas a
          l'acte authentique notarial obligatoire en cas de bien immobilier soumis a publicite
          fonciere</strong> (article 229-3 5° du Code civil).
        </div>

        {/* ===== Identification ===== */}
        <h2>I. Identification des parties et du regime matrimonial</h2>

        <p style={{ fontWeight: 700 }}>Epoux 1 :</p>
        <div className="k-dcm-doc-bloc-partie">{identiteEpouxBloc(epoux1)}</div>

        <p style={{ fontWeight: 700 }}>Epoux 2 :</p>
        <div className="k-dcm-doc-bloc-partie">{identiteEpouxBloc(epoux2)}</div>

        <p>
          Les epoux se sont maries le <strong>{formatDateLongue(mariage.dateMariage)}</strong> a{' '}
          <strong>{mariage.lieuMariage || '__________'}</strong>, sous le regime de{' '}
          <strong>{labelRegime}</strong>
          {mariage.contratMariage?.existence
            ? `, suivant contrat de mariage du ${formatDateLongue(mariage.contratMariage.dateContrat)} recu par Maitre ${mariage.contratMariage.notaireRedacteur || '__________'}, notaire a ${mariage.contratMariage.villeNotaire || '__________'}.`
            : ', a defaut de contrat de mariage.'}
        </p>

        {/* ===== Composition de la masse a partager ===== */}
        <h2>II. Composition de la masse a partager</h2>

        {mariage.patrimoineResume ? (
          <p style={{ whiteSpace: 'pre-line' }}>{mariage.patrimoineResume}</p>
        ) : (
          <p>
            <em>[Description detaillee a completer manuellement : nature et localisation des biens,
            comptes bancaires, parts sociales, vehicules, mobilier, dettes communes, etc.]</em>
          </p>
        )}

        <h3>A. Actif commun</h3>
        <table className="k-dcm-doc-table">
          <thead>
            <tr>
              <th style={{ width: '60%' }}>Designation</th>
              <th style={{ width: '20%' }}>Valeur estimee</th>
              <th style={{ width: '20%' }}>Observations</th>
            </tr>
          </thead>
          <tbody>
            {aBienImmobilier && (
              <tr>
                <td>
                  <strong>Bien immobilier</strong> : {logement.natureBien || '__________'}
                  {logement.adresseBien ? <><br /><span style={{ fontSize: '10pt' }}>{logement.adresseBien}</span></> : ''}
                </td>
                <td>__________</td>
                <td>{labelLogement}</td>
              </tr>
            )}
            <tr>
              <td>Comptes bancaires communs</td>
              <td>__________</td>
              <td></td>
            </tr>
            <tr>
              <td>Vehicules</td>
              <td>__________</td>
              <td></td>
            </tr>
            <tr>
              <td>Mobilier et effets personnels</td>
              <td>__________</td>
              <td>Partage amiable</td>
            </tr>
            <tr>
              <td>Parts sociales / placements</td>
              <td>__________</td>
              <td></td>
            </tr>
            <tr>
              <td>Autres actifs</td>
              <td>__________</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <h3>B. Passif commun</h3>
        <table className="k-dcm-doc-table">
          <thead>
            <tr>
              <th style={{ width: '60%' }}>Designation</th>
              <th style={{ width: '20%' }}>Montant restant du</th>
              <th style={{ width: '20%' }}>Reprise par</th>
            </tr>
          </thead>
          <tbody>
            {aBienImmobilier && (
              <tr>
                <td>Pret immobilier</td>
                <td>__________</td>
                <td>__________</td>
              </tr>
            )}
            <tr>
              <td>Credits a la consommation</td>
              <td>__________</td>
              <td></td>
            </tr>
            <tr>
              <td>Decouverts bancaires</td>
              <td>__________</td>
              <td></td>
            </tr>
            <tr>
              <td>Autres dettes</td>
              <td>__________</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        {/* ===== Modalites de partage ===== */}
        <h2>III. Modalites de partage convenues</h2>

        {aBienImmobilier ? (
          <>
            <p>
              Le bien immobilier sera <strong>{labelLogement}</strong>.
              {logement.detail ? ` ${logement.detail}` : ''}
            </p>
            {logement.soulteEventuelle && (
              <p>
                Une soulte d'un montant de <strong>{formatMontant(logement.soulteEventuelle)}</strong>{' '}
                ({nombreEnLettres(logement.soulteEventuelle)} euros) sera versee par le beneficiaire de
                l'attribution a son ex-conjoint dans les conditions fixees par l'acte authentique notarial.
              </p>
            )}
            <p>
              <strong>L'acte authentique notarial</strong>, etabli par le notaire designe dans la convention
              de divorce, constatera juridiquement la liquidation et le partage et procedera a la
              publicite fonciere requise (article 710-1 du Code civil).
            </p>
          </>
        ) : (
          <p>
            Les epoux declarent avoir procede a un partage amiable de leurs meubles et effets personnels.
            Aucun bien immobilier ne fait l'objet de la liquidation. <strong>Il n'y a donc pas lieu a
            etablir un etat liquidatif notarial</strong> au sens de l'article 229-3 5° du Code civil.
          </p>
        )}

        {/* ===== Recompenses et creances ===== */}
        <h2>IV. Recompenses et creances entre epoux</h2>
        <p>
          <em>[Indiquer les recompenses dues entre la communaute et le patrimoine propre de chaque epoux,
          le cas echeant. En l'absence de recompense, mentionner expressement le declaratif des epoux.]</em>
        </p>
        <p>
          Les epoux declarent qu'aucune recompense ni creance entre eux n'est due au titre de leur regime
          matrimonial, sauf dispositions contraires expressement mentionnees ci-dessus.
        </p>

        {/* ===== Prestation compensatoire ===== */}
        {presta.applicable && (
          <>
            <h2>V. Prestation compensatoire</h2>
            <p>
              Une prestation compensatoire est versee au profit de{' '}
              <strong>{presta.beneficiaire === 'epoux1' ? nomCompletEpoux(epoux1) : nomCompletEpoux(epoux2)}</strong>.
              Le montant et les modalites sont fixes dans la convention de divorce (article correspondant).
              Cette prestation n'entre pas dans le partage de la masse commune et est traitee separement.
            </p>
          </>
        )}

        {/* ===== Conclusions ===== */}
        <h2>VI. Conclusions</h2>
        <p>
          Le present etat liquidatif refleta l'accord des epoux sur la composition de leur masse commune
          et sur les modalites de son partage. Il sera annexe a la convention de divorce par consentement
          mutuel et, le cas echeant, transmis au notaire designe pour etablissement de l'acte
          authentique requis par la loi.
        </p>

        <p style={{ marginTop: '1cm', textAlign: 'right' }}>
          Fait a __________________________, le {formatDateLongue(new Date())}
        </p>

        <div className="k-dcm-doc-signatures">
          <div className="k-dcm-doc-signature-bloc">
            <div className="k-dcm-doc-signature-titre">{nomCompletEpoux(epoux1)}</div>
            <div className="k-dcm-doc-signature-mention">
              Mention "Lu et approuve, bon pour accord sur l'etat liquidatif"
            </div>
            <div className="k-dcm-doc-signature-line" />
          </div>
          <div className="k-dcm-doc-signature-bloc">
            <div className="k-dcm-doc-signature-titre">{nomCompletEpoux(epoux2)}</div>
            <div className="k-dcm-doc-signature-mention">
              Mention "Lu et approuve, bon pour accord sur l'etat liquidatif"
            </div>
            <div className="k-dcm-doc-signature-line" />
          </div>
        </div>

        <p style={{ marginTop: '1cm', fontSize: '9pt', fontStyle: 'italic', color: '#444', borderTop: '1px solid #999', paddingTop: '0.3cm' }}>
          Document preparatoire — a completer avec les valeurs reelles. En presence d'un bien immobilier,
          un acte authentique notarial sera obligatoirement etabli par le notaire en sus du present etat.
        </p>
      </div>
    </div>
  );
};

export default EtatLiquidatif;
