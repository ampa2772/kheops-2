// client/src/components/divorceCM/documents/LettreNotaireDepot.js
//
// Lettre adressee au notaire pour le depot de la convention signee.
// Le depot doit intervenir dans les 7 jours suivant la signature et fait
// courir l'effet dissolutif du mariage des la delivrance du recepisse.
import React from 'react';
import {
  formatDateLongue,
  formatDateCourte,
  nomCompletEpoux,
  adresseLigne,
} from './documentHelpers';
import { useTemplate } from '../templates/useTemplate';
import { TEMPLATE_KEYS } from '../templates/templateDefaults';
import './divorceCMDocs.css';

const LettreNotaireDepot = ({ data, dossier }) => {
  const tplOuverture = useTemplate(TEMPLATE_KEYS.LETTRE_NOTAIRE_FORMULE_OUVERTURE);
  const tplFermeture = useTemplate(TEMPLATE_KEYS.LETTRE_NOTAIRE_FORMULE_FERMETURE);

  if (!data) return null;

  const epoux1 = data.epoux1 || {};
  const epoux2 = data.epoux2 || {};
  const avocat1 = epoux1.avocat || {};
  const avocat2 = epoux2.avocat || {};
  const notaire = data.notaire || {};
  const mariage = data.mariage || {};

  const avocatCabinet = avocat1.estTitulaire ? avocat1
    : avocat2.estTitulaire ? avocat2
    : avocat1;

  const dateSignature = data.dates?.signatureConvention;
  const dateAujourdhui = new Date();
  const refDossier = dossier?.reference || '';

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
            {avocatCabinet.telephone ? `\nTel : ${avocatCabinet.telephone}` : ''}
            {avocatCabinet.email ? `\nEmail : ${avocatCabinet.email}` : ''}
          </div>
        </div>

        {/* Adresse destinataire */}
        <div className="k-dcm-doc-destinataire">
          <strong>Etude de Maitre {notaire.prenoms || ''} {notaire.nom || '__________'}</strong><br />
          {notaire.cabinet && <>{notaire.cabinet}<br /></>}
          {adresseLigne(notaire)}
        </div>

        {/* Lieu et date */}
        <p style={{ textAlign: 'right' }}>
          {avocatCabinet.ville ? `${avocatCabinet.ville}, ` : ''}le {formatDateLongue(dateAujourdhui)}
        </p>

        {/* References */}
        <div className="k-dcm-doc-references">
          {refDossier && <div><strong>Dossier :</strong> {refDossier}</div>}
          <div className="k-dcm-doc-rar">
            <strong>LETTRE RECOMMANDEE AVEC ACCUSE DE RECEPTION</strong> ou remise en main propre
          </div>
        </div>

        {/* Objet */}
        <div className="k-dcm-doc-objet">
          Objet : Depot d'une convention de divorce par consentement mutuel au rang des minutes
        </div>

        <p style={{ whiteSpace: 'pre-line' }}>{tplOuverture}</p>

        <p>Cette convention concerne :</p>

        <ul>
          <li>
            <strong>{nomCompletEpoux(epoux1)}</strong>, ne(e) le {formatDateCourte(epoux1.dateNaissance)}
            {epoux1.lieuNaissance ? ` a ${epoux1.lieuNaissance}` : ''}, demeurant {adresseLigne(epoux1)},{' '}
            represente(e) par moi-meme,
          </li>
          <li>
            <strong>{nomCompletEpoux(epoux2)}</strong>, ne(e) le {formatDateCourte(epoux2.dateNaissance)}
            {epoux2.lieuNaissance ? ` a ${epoux2.lieuNaissance}` : ''}, demeurant {adresseLigne(epoux2)},{' '}
            represente(e) par {avocat2.nom ? `Maitre ${avocat2.prenoms || ''} ${avocat2.nom}, du Barreau de ${avocat2.barreau || '__________'}` : '__________'},
          </li>
        </ul>

        <p>
          Cette convention a ete <strong>signee le {formatDateLongue(dateSignature)}</strong>, apres
          respect du delai de reflexion de quinze jours minimum impose par l'article 229-4 du Code civil.
        </p>

        <p>
          Conformement a l'article 229-1 du Code civil, je vous prie de bien vouloir recevoir cette
          convention au rang des minutes de votre etude, et de delivrer le recepisse de depot prevu
          par les textes. Ce recepisse a effet de prononcer la dissolution du mariage.
        </p>

        <p>
          Vous trouverez ci-jointes les pieces suivantes :
        </p>

        <ul>
          <li>la convention de divorce signee, en double exemplaire original ;</li>
          <li>copie des pieces d'identite des deux epoux ;</li>
          <li>copie de leur acte de mariage ;</li>
          <li>copie du livret de famille ;</li>
          {(data.enfants || []).length > 0 && (
            <li>copie des actes de naissance des enfants ;</li>
          )}
          {mariage.contratMariage?.existence && (
            <li>copie du contrat de mariage ;</li>
          )}
          <li>etat liquidatif (le cas echeant) ;</li>
          <li>tout autre document utile a la conservation de la convention.</li>
        </ul>

        <p>
          Je vous remercie de bien vouloir, des reception et apres delivrance du recepisse :
        </p>

        <ol>
          <li>m'adresser une copie du recepisse par retour ;</li>
          <li>conserver l'original au rang de vos minutes dans les conditions habituelles ;</li>
          <li>m'indiquer le numero d'enregistrement aux fins de mention en marge des actes d'etat civil.</li>
        </ol>

        <p style={{ whiteSpace: 'pre-line' }}>{tplFermeture}</p>

        <div style={{ marginTop: '1.2cm', textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>
            Maitre {avocatCabinet.prenoms || ''} {avocatCabinet.nom || ''}
          </div>
          <div style={{ fontSize: '10pt', fontStyle: 'italic' }}>
            Avocat au Barreau de {avocatCabinet.barreau || '__________'}
          </div>
        </div>

        <p style={{ marginTop: '1cm', fontSize: '9pt', fontStyle: 'italic', color: '#444', borderTop: '1px solid #999', paddingTop: '0.3cm' }}>
          PJ : convention signee (deux originaux), pieces d'identite, acte de mariage, livret de famille, et toutes pieces utiles.
        </p>
      </div>
    </div>
  );
};

export default LettreNotaireDepot;
