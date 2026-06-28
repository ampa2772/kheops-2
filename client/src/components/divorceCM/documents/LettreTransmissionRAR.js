// client/src/components/divorceCM/documents/LettreTransmissionRAR.js
//
// Lettre de transmission du projet de convention de divorce par consentement
// mutuel, envoyee par lettre recommandee avec accuse de reception au client.
// L'envoi declenche le delai de reflexion de 15 jours minimum impose par
// l'article 229-4 du Code civil. La signature avant la fin du delai entraine
// la nullite de la convention.
//
// Cette lettre est destinee au client du cabinet uniquement (l'autre epoux
// recoit la sienne par son propre avocat).
import React from 'react';
import {
  formatDateLongue,
  identiteAvocatBloc,
  nomCompletEpoux,
  formuleAppelCivile,
  adresseLigne,
} from './documentHelpers';
import { useTemplate } from '../templates/useTemplate';
import { TEMPLATE_KEYS } from '../templates/templateDefaults';
import './divorceCMDocs.css';

const LettreTransmissionRAR = ({ data, dossier, destinataireKey = 'epoux1' }) => {
  const tplIntro = useTemplate(TEMPLATE_KEYS.LETTRE_RAR_INTRO);
  const tplConclusion = useTemplate(TEMPLATE_KEYS.LETTRE_RAR_CONCLUSION);
  const tplPolitesse = useTemplate(TEMPLATE_KEYS.FORMULE_POLITESSE_COURRIER);

  if (!data) return null;

  const destinataire = data[destinataireKey] || {};
  const avocatCabinet = data.epoux1?.avocat?.estTitulaire ? data.epoux1.avocat
    : data.epoux2?.avocat?.estTitulaire ? data.epoux2.avocat
    : data.epoux1?.avocat || {};

  const dateProjet = new Date();
  const finDelai = new Date();
  finDelai.setDate(finDelai.getDate() + 15);

  const refDossier = dossier?.reference || '';
  const conjoint = destinataireKey === 'epoux1' ? data.epoux2 : data.epoux1;

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
          {nomCompletEpoux(destinataire)}<br />
          {adresseLigne(destinataire)}
        </div>

        {/* Lieu et date */}
        <p style={{ textAlign: 'right' }}>
          {avocatCabinet.ville ? `${avocatCabinet.ville}, ` : ''}le {formatDateLongue(dateProjet)}
        </p>

        {/* References */}
        <div className="k-dcm-doc-references">
          {refDossier && <div><strong>Dossier :</strong> {refDossier}</div>}
          <div><strong>N/Ref :</strong> __________</div>
          <div className="k-dcm-doc-rar">
            <strong>LETTRE RECOMMANDEE AVEC ACCUSE DE RECEPTION</strong>
          </div>
        </div>

        {/* Objet */}
        <div className="k-dcm-doc-objet">
          Objet : Projet de convention de divorce par consentement mutuel — point de depart du delai de reflexion de 15 jours
        </div>

        {/* Corps */}
        <p>{formuleAppelCivile(destinataire)},</p>

        <p style={{ whiteSpace: 'pre-line' }}>
          {tplIntro.replace(
            '[CONJOINT_AVOCAT]',
            conjoint?.avocat?.nom ? `Maitre ${conjoint.avocat.prenoms || ''} ${conjoint.avocat.nom}` : '__________'
          )}
        </p>

        <p>
          Je vous prie de prendre connaissance, avec la plus grande attention, de ce projet et de
          chacune des dispositions qu'il contient, en particulier celles relatives :
        </p>

        <ul>
          <li>au sort des enfants (autorite parentale, residence, droit de visite et d'hebergement, contribution a leur entretien et leur education) ;</li>
          <li>au regime matrimonial et a l'etat liquidatif ;</li>
          <li>au sort du logement familial ;</li>
          <li>a la prestation compensatoire eventuelle ;</li>
          <li>aux modalites pratiques du depot au rang des minutes du notaire.</li>
        </ul>

        <p>
          <strong>Je tiens a attirer expressement votre attention sur les points suivants :</strong>
        </p>

        <p>
          <strong>1. Delai de reflexion de 15 jours.</strong> En application de l'article 229-4 du
          Code civil, vous disposez d'un delai de reflexion d'au moins <strong>quinze (15) jours
          calendaires</strong> a compter de la reception de la presente lettre. Dans le cas present,
          vous ne pourrez signer la convention <strong>qu'a compter du{' '}
          {formatDateLongue(finDelai)}</strong> au plus tot. <strong>Toute signature anterieure a
          cette date entrainerait la nullite de la convention.</strong>
        </p>

        <p>
          <strong>2. Liberte de modifier ou de refuser le projet.</strong> Le delai de reflexion vous
          permet de relire le projet a tete reposee, de me poser toute question et, le cas echeant,
          de demander des modifications. Aucune signature ne pourra vous etre imposee. Si vous
          souhaitez modifier le projet, je vous invite a m'en informer rapidement afin que nous
          puissions l'amender d'un commun accord avec le conseil de votre conjoint.
        </p>

        <p>
          <strong>3. Signature et depot.</strong> Une fois le delai de reflexion ecoule, et si vous
          confirmez votre accord sur l'integralite du projet, nous fixerons un rendez-vous au cabinet
          afin de proceder a la signature de la convention en quatre exemplaires originaux. La
          convention sera ensuite deposee, dans les <strong>sept (7) jours</strong> suivant la
          signature, au rang des minutes du notaire designe a la convention. C'est le recepisse
          delivre par le notaire qui prononcera officiellement la dissolution du mariage.
        </p>

        <p>
          <strong>4. Conseils complementaires.</strong> Je reste naturellement a votre disposition
          pour tout entretien complementaire pendant ce delai, ainsi que pour repondre a toute
          interrogation. Je vous invite egalement a faire le point sur l'ensemble des pieces
          justificatives qui accompagneront la convention (acte de mariage, livret de famille, et le
          cas echeant etat liquidatif notarial).
        </p>

        <p>
          Vous trouverez en annexe a la presente :
        </p>
        <ul>
          <li>le projet integral de convention de divorce par consentement mutuel ;</li>
          <li>la liste des pieces justificatives a reunir avant la signature ;</li>
          <li>une copie pour vos archives.</li>
        </ul>

        <p style={{ whiteSpace: 'pre-line' }}>{tplConclusion}</p>

        <p style={{ marginTop: '0.6cm', whiteSpace: 'pre-line' }}>
          {tplPolitesse.replace('[APPEL]', formuleAppelCivile(destinataire))}
        </p>

        <div style={{ marginTop: '1.2cm', textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>
            Maitre {avocatCabinet.prenoms || ''} {avocatCabinet.nom || ''}
          </div>
          <div style={{ fontSize: '10pt', fontStyle: 'italic' }}>
            Avocat au Barreau de {avocatCabinet.barreau || '__________'}
          </div>
        </div>

        <p style={{ marginTop: '1cm', fontSize: '9pt', fontStyle: 'italic', color: '#444', borderTop: '1px solid #999', paddingTop: '0.3cm' }}>
          Pieces jointes : projet de convention de divorce par consentement mutuel, liste des pieces a fournir.
        </p>
      </div>
    </div>
  );
};

export default LettreTransmissionRAR;
