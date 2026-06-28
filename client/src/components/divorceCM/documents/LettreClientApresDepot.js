// client/src/components/divorceCM/documents/LettreClientApresDepot.js
//
// Lettre informant le client que la convention a ete deposee chez le notaire,
// que le recepisse a ete delivre, et que le divorce est officiellement prononce.
import React from 'react';
import {
  formatDateLongue,
  nomCompletEpoux,
  formuleAppelCivile,
  adresseLigne,
} from './documentHelpers';
import { useTemplate } from '../templates/useTemplate';
import { TEMPLATE_KEYS } from '../templates/templateDefaults';
import './divorceCMDocs.css';

const LettreClientApresDepot = ({ data, dossier, destinataireKey = 'epoux1' }) => {
  const tplIntro = useTemplate(TEMPLATE_KEYS.LETTRE_CLIENT_APRES_DEPOT_INTRO);
  const tplPolitesse = useTemplate(TEMPLATE_KEYS.FORMULE_POLITESSE_COURRIER);

  if (!data) return null;

  const destinataire = data[destinataireKey] || {};
  const conjoint = destinataireKey === 'epoux1' ? data.epoux2 : data.epoux1;
  const avocatCabinet = data.epoux1?.avocat?.estTitulaire ? data.epoux1.avocat
    : data.epoux2?.avocat?.estTitulaire ? data.epoux2.avocat
    : data.epoux1?.avocat || {};

  const notaire = data.notaire || {};
  const dateAujourdhui = new Date();
  const dateDepot = data.dates?.depotNotaire;
  const dateRecepisse = notaire.dateRecepisse || data.dates?.recepisseRecu;
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
          {nomCompletEpoux(destinataire)}<br />
          {adresseLigne(destinataire)}
        </div>

        <p style={{ textAlign: 'right' }}>
          {avocatCabinet.ville ? `${avocatCabinet.ville}, ` : ''}le {formatDateLongue(dateAujourdhui)}
        </p>

        <div className="k-dcm-doc-references">
          {refDossier && <div><strong>Dossier :</strong> {refDossier}</div>}
        </div>

        <div className="k-dcm-doc-objet">
          Objet : Confirmation du divorce — depot de la convention au rang des minutes du notaire
        </div>

        <p>{formuleAppelCivile(destinataire)},</p>

        <p style={{ whiteSpace: 'pre-line' }}>{tplIntro}</p>

        <p>
          La convention conclue avec votre conjoint, {nomCompletEpoux(conjoint)}, a ete deposee
          {dateDepot ? ` le ${formatDateLongue(dateDepot)}` : ''} au rang des minutes de l'etude de
          <strong> Maitre {notaire.prenoms || ''} {notaire.nom || '__________'}</strong>
          {notaire.ville ? `, notaire a ${notaire.ville}` : ''}.
          {notaire.numeroRecepisse ? ` Le recepisse delivre porte le numero ${notaire.numeroRecepisse}.` : ''}
          {dateRecepisse ? ` Date de delivrance du recepisse : ${formatDateLongue(dateRecepisse)}.` : ''}
        </p>

        <p>
          Une copie de ce recepisse est jointe a la presente lettre. Elle constitue la preuve juridique
          de votre divorce et doit etre conservee precieusement.
        </p>

        <p><strong>Demarches a accomplir :</strong></p>
        <ul>
          <li>
            <strong>Mise a jour des actes d'etat civil :</strong> la mention du divorce sera portee
            en marge de votre acte de naissance ainsi que de l'acte de mariage. Cette demarche est
            generalement effectuee par le notaire ; je vous tiendrai informe(e) le cas echeant.
          </li>
          <li>
            <strong>Documents a mettre a jour :</strong> piece d'identite, carte vitale, banque,
            assurances, employeur, services sociaux et fiscaux, mutuelle.
          </li>
          <li>
            <strong>Logement et patrimoine :</strong> mise en oeuvre des dispositions arretees dans
            la convention (transfert de propriete, soulte, ventes, etc.).
          </li>
          <li>
            <strong>Aspects fiscaux :</strong> declaration separee a partir de l'annee du divorce ;
            partage des reductions et credits d'impots ; le cas echeant, declaration de la prestation
            compensatoire selon les modalites prevues par le Code general des impots.
          </li>
          {(data.pensionsAlimentaires || []).length > 0 && (
            <li>
              <strong>Pensions alimentaires :</strong> la (les) pension(s) alimentaire(s) prevue(s)
              dans la convention sont exigibles selon les modalites convenues. En cas de difficulte
              de recouvrement, des dispositifs (ARIPA, intermediation financiere) peuvent etre
              mobilises.
            </li>
          )}
        </ul>

        <p>
          Je reste a votre disposition pour vous accompagner dans toute demarche complementaire et
          pour repondre a toute question relative a l'application de la convention.
        </p>

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
          PJ : copie du recepisse delivre par le notaire.
        </p>
      </div>
    </div>
  );
};

export default LettreClientApresDepot;
