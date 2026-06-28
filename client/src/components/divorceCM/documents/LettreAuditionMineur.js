// client/src/components/divorceCM/documents/LettreAuditionMineur.js
//
// Lettre adressee au Juge aux affaires familiales pour solliciter
// l'audition de l'enfant mineur (art. 388-1 du Code civil et 338-1
// et suivants du Code de procedure civile).
//
// Une lettre par enfant mineur ayant manifeste son souhait d'etre entendu.
// Si plusieurs enfants demandent leur audition, la lettre en groupe tous.
import React from 'react';
import {
  formatDateLongue,
  identiteEnfantBloc,
  nomCompletEpoux,
} from './documentHelpers';
import { useTemplate } from '../templates/useTemplate';
import { TEMPLATE_KEYS } from '../templates/templateDefaults';
import './divorceCMDocs.css';

const LettreAuditionMineur = ({ data, dossier }) => {
  const corpsTemplate = useTemplate(TEMPLATE_KEYS.LETTRE_AUDITION_MINEUR_CORPS);

  if (!data) return null;

  const epoux1 = data.epoux1 || {};
  const epoux2 = data.epoux2 || {};
  const enfantsAuditionnes = (data.enfants || []).filter(e => e.souhaiteEtreEntendu);
  const avocatCabinet = epoux1.avocat?.estTitulaire ? epoux1.avocat
    : epoux2.avocat?.estTitulaire ? epoux2.avocat
    : epoux1.avocat || {};

  const tribunalVille = epoux1.ville || epoux2.ville || '__________';
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
          <strong>Monsieur / Madame le Juge aux affaires familiales</strong><br />
          Tribunal Judiciaire de {tribunalVille}<br />
          ___________________________
        </div>

        <p style={{ textAlign: 'right' }}>
          {avocatCabinet.ville ? `${avocatCabinet.ville}, ` : ''}le {formatDateLongue(dateAujourdhui)}
        </p>

        <div className="k-dcm-doc-references">
          {refDossier && <div><strong>Dossier :</strong> {refDossier}</div>}
          <div><strong>Affaire :</strong> {nomCompletEpoux(epoux1)} / {nomCompletEpoux(epoux2)}</div>
        </div>

        <div className="k-dcm-doc-objet">
          Objet : Demande d'audition d'enfant{enfantsAuditionnes.length > 1 ? 's' : ''} mineur{enfantsAuditionnes.length > 1 ? 's' : ''} dans le cadre d'une procedure de divorce par consentement mutuel
        </div>

        <p>Madame, Monsieur le Juge aux affaires familiales,</p>

        <p>
          J'ai l'honneur d'intervenir, en qualite de conseil de {nomCompletEpoux(epoux1)},
          dans la procedure de divorce par consentement mutuel diligentee conjointement avec mon
          confrere, conseil de {nomCompletEpoux(epoux2)}.
        </p>

        {enfantsAuditionnes.length > 0 ? (
          <>
            <p>
              {enfantsAuditionnes.length === 1
                ? `Dans le cadre de cette procedure, l'enfant mineur ci-apres designe a manifeste son souhait d'etre entendu :`
                : `Dans le cadre de cette procedure, les enfants mineurs ci-apres designes ont manifeste leur souhait d'etre entendus :`}
            </p>
            <ul>
              {enfantsAuditionnes.map((e, idx) => (
                <li key={idx}>{identiteEnfantBloc(e)}.</li>
              ))}
            </ul>
          </>
        ) : (
          <p>
            Dans le cadre de cette procedure, l'enfant mineur (ci-apres designe) a manifeste son souhait
            d'etre entendu :
          </p>
        )}

        <p style={{ whiteSpace: 'pre-line' }}>{corpsTemplate}</p>

        <p style={{ marginTop: '0.6cm' }}>
          Je vous prie d'agreer, Madame, Monsieur le Juge aux affaires familiales, l'expression de ma
          haute consideration.
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
          PJ : copie de la convention de divorce, justificatifs d'identite des enfants, attestation des parents.
        </p>
      </div>
    </div>
  );
};

export default LettreAuditionMineur;
