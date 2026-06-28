// client/src/components/divorceCM/documents/BordereauPieces.js
//
// Bordereau de communication de pieces. Document obligatoire en voie
// judiciaire (art. 132 CPC) et utile en voie extrajudiciaire pour la
// transmission au confrere et au notaire.
//
// La liste des pieces est generee a partir des donnees de la fiche
// (presence d'enfants, regime matrimonial, prestation, bien immobilier).
// Numerotation continue conforme aux usages du Palais.
import React from 'react';
import {
  formatDateLongue,
  nomCompletEpoux,
} from './documentHelpers';
import './divorceCMDocs.css';

const BordereauPieces = ({ data, dossier }) => {
  if (!data) return null;

  const epoux1 = data.epoux1 || {};
  const epoux2 = data.epoux2 || {};
  const avocatCabinet = epoux1.avocat?.estTitulaire ? epoux1.avocat
    : epoux2.avocat?.estTitulaire ? epoux2.avocat
    : epoux1.avocat || {};
  const enfants = data.enfants || [];
  const mariage = data.mariage || {};
  const presta = data.prestationCompensatoire || {};
  const logement = data.logementFamilial || {};
  const refDossier = dossier?.reference || '';
  const dateAujourdhui = new Date();

  // Construction dynamique de la liste numerotee
  const pieces = [];
  let n = 1;

  // Etat civil
  pieces.push({ n: n++, libelle: `Copie de la piece d'identite de ${nomCompletEpoux(epoux1)}` });
  pieces.push({ n: n++, libelle: `Copie de la piece d'identite de ${nomCompletEpoux(epoux2)}` });
  pieces.push({ n: n++, libelle: `Justificatif de domicile recent — ${nomCompletEpoux(epoux1)}` });
  pieces.push({ n: n++, libelle: `Justificatif de domicile recent — ${nomCompletEpoux(epoux2)}` });
  pieces.push({ n: n++, libelle: `Copie integrale de l'acte de mariage du ${formatDateLongue(mariage.dateMariage)}` });
  pieces.push({ n: n++, libelle: `Copie de l'integralite du livret de famille` });
  pieces.push({ n: n++, libelle: `Copie integrale de l'acte de naissance de ${nomCompletEpoux(epoux1)}` });
  pieces.push({ n: n++, libelle: `Copie integrale de l'acte de naissance de ${nomCompletEpoux(epoux2)}` });

  // Contrat de mariage
  if (mariage.contratMariage?.existence) {
    pieces.push({ n: n++, libelle: `Copie du contrat de mariage du ${formatDateLongue(mariage.contratMariage.dateContrat)} (Maitre ${mariage.contratMariage.notaireRedacteur || '__________'}, notaire a ${mariage.contratMariage.villeNotaire || '__________'})` });
  }

  // Enfants
  if (enfants.length > 0) {
    enfants.forEach(e => {
      pieces.push({ n: n++, libelle: `Copie integrale de l'acte de naissance de ${e.prenoms || ''} ${e.nom || ''}${e.dateNaissance ? `, ne(e) le ${formatDateLongue(e.dateNaissance)}` : ''}` });
    });
    pieces.push({ n: n++, libelle: 'Justificatifs de scolarite des enfants mineurs' });
    pieces.push({ n: n++, libelle: 'Attestation des parents — information donnee aux enfants mineurs sur leur droit a etre entendus (art. 388-1 C. civ.)' });
  }

  // Patrimoine
  pieces.push({ n: n++, libelle: '3 derniers bulletins de salaire de chaque epoux' });
  pieces.push({ n: n++, libelle: '2 derniers avis d\'imposition' });
  pieces.push({ n: n++, libelle: 'Justificatifs des revenus complementaires (le cas echeant)' });
  pieces.push({ n: n++, libelle: 'Releves de comptes bancaires des 3 derniers mois (chaque epoux)' });

  // Bien immobilier
  if (['attribution_epoux1', 'attribution_epoux2', 'vente', 'indivision'].includes(logement.type)) {
    pieces.push({ n: n++, libelle: `Titre de propriete du bien immobilier${logement.adresseBien ? ` situe ${logement.adresseBien}` : ''}` });
    pieces.push({ n: n++, libelle: 'Estimation recente du bien immobilier (notaire ou agence)' });
    pieces.push({ n: n++, libelle: 'Tableau d\'amortissement du pret immobilier (le cas echeant)' });
    pieces.push({ n: n++, libelle: 'Etat liquidatif notarial (acte authentique)' });
  }

  // Prestation compensatoire
  if (presta.applicable) {
    pieces.push({ n: n++, libelle: 'Justificatifs detailles de la situation patrimoniale et professionnelle de chaque epoux (criteres de l\'art. 271 C. civ.)' });
    pieces.push({ n: n++, libelle: 'Releve de carriere CNAV / caisse de retraite — chaque epoux' });
  }

  // Convention et procedure
  pieces.push({ n: n++, libelle: 'Convention de divorce par consentement mutuel signee' });

  if (data.voie === 'judiciaire') {
    pieces.push({ n: n++, libelle: 'Demande d\'audition de l\'enfant mineur (art. 388-1 C. civ.)' });
  }

  return (
    <div className="k-dcm-doc-print-area">
      <div className="k-dcm-doc-page">
        {/* En-tete cabinet */}
        <div className="k-dcm-doc-letterhead">
          <div className="k-dcm-doc-letterhead-cabinet">
            {avocatCabinet.cabinet || 'Cabinet d\'avocats'}
          </div>
          <div className="k-dcm-doc-letterhead-coords" style={{ whiteSpace: 'pre-line' }}>
            {`Maitre ${avocatCabinet.prenoms || ''} ${avocatCabinet.nom || ''}`}
            {avocatCabinet.barreau ? `\nAvocat au Barreau de ${avocatCabinet.barreau}` : ''}
            {avocatCabinet.adresse ? `\n${avocatCabinet.adresse}` : ''}
            {(avocatCabinet.codePostal || avocatCabinet.ville) ? `\n${avocatCabinet.codePostal || ''} ${avocatCabinet.ville || ''}` : ''}
          </div>
        </div>

        <h1>Bordereau de communication de pieces</h1>
        <p style={{ textAlign: 'center', fontStyle: 'italic', fontSize: '10.5pt', marginTop: '-0.3cm' }}>
          Divorce par consentement mutuel — {nomCompletEpoux(epoux1)} / {nomCompletEpoux(epoux2)}
        </p>

        <div className="k-dcm-doc-references" style={{ marginTop: '0.5cm' }}>
          {refDossier && <div><strong>Dossier :</strong> {refDossier}</div>}
          <div><strong>Date :</strong> {formatDateLongue(dateAujourdhui)}</div>
          <div><strong>Voie :</strong> {data.voie === 'judiciaire' ? 'Judiciaire (audition mineur)' : 'Extrajudiciaire'}</div>
        </div>

        <p style={{ marginTop: '0.5cm' }}>
          La presente liste enumere les pieces produites au soutien du dossier de divorce par consentement
          mutuel{data.voie === 'judiciaire' ? ' soumis au Juge aux affaires familiales' : ' depose au rang des minutes du notaire designe par les parties'}.
        </p>

        <table className="k-dcm-doc-table" style={{ marginTop: '0.6cm' }}>
          <thead>
            <tr>
              <th style={{ width: '8%', textAlign: 'center' }}>N°</th>
              <th style={{ width: '72%' }}>Designation de la piece</th>
              <th style={{ width: '20%', textAlign: 'center' }}>Nbre de pages</th>
            </tr>
          </thead>
          <tbody>
            {pieces.map(p => (
              <tr key={p.n}>
                <td style={{ textAlign: 'center' }}><strong>{p.n}</strong></td>
                <td>{p.libelle}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ marginTop: '0.6cm', fontSize: '10.5pt' }}>
          <strong>Total : {pieces.length} piece{pieces.length > 1 ? 's' : ''} communiquee{pieces.length > 1 ? 's' : ''}.</strong>
        </p>

        <p style={{ marginTop: '1cm', textAlign: 'right' }}>
          {avocatCabinet.ville ? `${avocatCabinet.ville}, ` : ''}le {formatDateLongue(dateAujourdhui)}
        </p>

        <div style={{ marginTop: '1cm', textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>
            Maitre {avocatCabinet.prenoms || ''} {avocatCabinet.nom || ''}
          </div>
          <div style={{ fontSize: '10pt', fontStyle: 'italic' }}>
            Avocat au Barreau de {avocatCabinet.barreau || '__________'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BordereauPieces;
