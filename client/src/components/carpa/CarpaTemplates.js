// client/src/components/carpa/CarpaTemplates.js
//
// Generation de modeles de documents CARPA pre-remplis (auto-impression /
// save-as-PDF via window.print()).
// Modeles fournis :
//  - Autorisation manuscrite de prelevement d'honoraires
//  - Convention d'honoraires (annexe CARPA)
//
// Le contenu suit les pratiques officielles locales (Paris, Versailles)
// recensees dans le PDF de reference.
import React, { useState } from 'react';
import {
  formatDate,
  formatMontant,
  beneficiaireResume,
} from './carpaHelpers';
import { printArea } from './carpaPrintHelpers';

const ModeleAutorisationHonoraires = ({ operation, dossier, cabinetNom = 'Cabinet KHEOPS 2' }) => {
  const beneficiaire = operation?.beneficiaireSnapshot;
  const nomClient = beneficiaire?.nom
    ? `${beneficiaire.prenoms || ''} ${beneficiaire.nom}`.trim()
    : (beneficiaire?.raisonSociale || '__________________________');
  const refAffaire = dossier?.reference || dossier?.dossier?.dossier?.nom || '__________________________';

  return (
    <div className="k-carpa-print-area">
      <div style={{ fontFamily: 'Times New Roman, serif', color: '#000', maxWidth: '17cm', margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', fontSize: '1.2rem', textDecoration: 'underline' }}>
          AUTORISATION DE PRELEVEMENT D'HONORAIRES SUR LE COMPTE CARPA
        </h1>

        <p style={{ marginTop: '1.5rem' }}>
          Je soussigne(e) <strong>{nomClient}</strong>,<br />
          domicilie(e) : __________________________________________________________________________<br />
          ne(e) le : ______________ a : __________________________________________________________
        </p>

        <p style={{ marginTop: '1rem' }}>
          Client(e) du <strong>{cabinetNom}</strong> dans le dossier <strong>{refAffaire}</strong>,
        </p>

        <p style={{ marginTop: '1rem' }}>
          autorise expressement le cabinet a prelever, sur le sous-compte CARPA dedie a cette
          affaire, la somme de <strong>{formatMontant(operation?.montant, operation?.devise)}</strong> en
          reglement de ses honoraires conformement a la convention d'honoraires conclue entre nous,
          ou de la facture detaillee qui m'a ete remise et que j'approuve par la presente.
        </p>

        <p style={{ marginTop: '1rem' }}>
          Cette autorisation est donnee en application des dispositions du RIN et du reglement
          interieur du Barreau competent. Elle vaut justification ecrite, signee de ma main, du
          prelevement a effectuer sur les fonds detenus par la CARPA pour mon compte.
        </p>

        <p style={{ marginTop: '2rem' }}>
          Fait a __________________________, le {formatDate(new Date())}
        </p>

        <p style={{ marginTop: '2rem' }}>
          Mention manuscrite obligatoire :{' '}
          <em>"Lu et approuve, bon pour autorisation de prelevement d'honoraires sur le compte CARPA"</em>
        </p>

        <div style={{ marginTop: '3rem' }}>
          <div>Signature du client :</div>
          <div style={{ marginTop: '4rem', borderTop: '1px solid #000', width: '7cm' }} />
        </div>
      </div>
    </div>
  );
};

const ModeleConventionHonorairesCarpa = ({ operation, dossier, cabinetNom = 'Cabinet KHEOPS 2' }) => {
  const beneficiaire = operation?.beneficiaireSnapshot;
  const nomClient = beneficiaire?.nom
    ? `${beneficiaire.prenoms || ''} ${beneficiaire.nom}`.trim()
    : (beneficiaire?.raisonSociale || '__________________________');
  const refAffaire = dossier?.reference || dossier?.dossier?.dossier?.nom || '__________________________';

  return (
    <div className="k-carpa-print-area">
      <div style={{ fontFamily: 'Times New Roman, serif', color: '#000', maxWidth: '17cm', margin: '0 auto' }}>
        <h1 style={{ textAlign: 'center', fontSize: '1.2rem', textDecoration: 'underline' }}>
          ANNEXE CARPA A LA CONVENTION D'HONORAIRES
        </h1>

        <p style={{ marginTop: '1.5rem' }}>
          ENTRE LES SOUSSIGNES :
        </p>
        <p>
          <strong>{cabinetNom}</strong>, ci-apres "le Cabinet",
        </p>
        <p style={{ marginTop: '0.5rem' }}>ET</p>
        <p>
          <strong>{nomClient}</strong>, ci-apres "le Client",
        </p>

        <p style={{ marginTop: '1rem' }}>
          dans le cadre du dossier <strong>{refAffaire}</strong>.
        </p>

        <h2 style={{ fontSize: '1rem', marginTop: '1.5rem' }}>Article 1 — Objet</h2>
        <p>
          La presente annexe a pour objet de definir les modalites de prelevement des honoraires
          du Cabinet sur le sous-compte CARPA ouvert au nom de l'affaire visee ci-dessus.
        </p>

        <h2 style={{ fontSize: '1rem', marginTop: '1rem' }}>Article 2 — Autorisation generale</h2>
        <p>
          Le Client autorise le Cabinet a faire prelever, sur les fonds qu'il detient pour son
          compte aupres de la CARPA, les sommes qui lui sont dues a titre d'honoraires conformement
          aux factures emises et acceptees, ou a la convention d'honoraires principale.
        </p>

        <h2 style={{ fontSize: '1rem', marginTop: '1rem' }}>Article 3 — Information prealable</h2>
        <p>
          Toute demande de prelevement d'honoraires sur le compte CARPA est precedee de la remise
          au Client d'une facture detaillee. Le Client conserve la possibilite de contester la
          facture dans les conditions du droit commun, sans que cela puisse retarder le respect des
          procedures CARPA.
        </p>

        <h2 style={{ fontSize: '1rem', marginTop: '1rem' }}>Article 4 — Justificatifs</h2>
        <p>
          La CARPA peut requerir, prealablement a tout prelevement, une autorisation manuscrite
          specifique du Client, conformement aux pratiques locales du Barreau competent. Le Client
          s'engage a fournir cette autorisation dans un delai raisonnable.
        </p>

        <h2 style={{ fontSize: '1rem', marginTop: '1rem' }}>Article 5 — Information de fin</h2>
        <p>
          A l'issue de chaque prelevement, le Cabinet transmet au Client un releve recapitulatif
          de la somme prelevee, de la facture associee, et du solde restant disponible sur le
          sous-compte CARPA.
        </p>

        <p style={{ marginTop: '2rem' }}>
          Fait en deux exemplaires, a __________________________, le {formatDate(new Date())}.
        </p>

        <div style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <div>
            <div>Pour le Cabinet :</div>
            <div style={{ marginTop: '4rem', borderTop: '1px solid #000', width: '6cm' }} />
          </div>
          <div>
            <div>Le Client :</div>
            <div style={{ fontSize: '0.78rem', marginTop: '0.4rem' }}>
              (mention manuscrite : "Lu et approuve")
            </div>
            <div style={{ marginTop: '3rem', borderTop: '1px solid #000', width: '6cm' }} />
          </div>
        </div>
      </div>
    </div>
  );
};

// Composant declencheur (bouton -> impression du modele)
export const CarpaTemplateButton = ({ template, operation, dossier, label }) => {
  const [pendingTemplate, setPendingTemplate] = useState(null);

  const triggerPrint = () => {
    setPendingTemplate(template);
    setTimeout(() => {
      printArea('.k-carpa-print-area');
      setTimeout(() => setPendingTemplate(null), 1500);
    }, 50);
  };

  return (
    <>
      <button className="k-carpa-btn k-carpa-btn-secondary" onClick={triggerPrint}>
        {label || 'Generer le modele'}
      </button>
      {pendingTemplate === 'autorisation_honoraires' && (
        <ModeleAutorisationHonoraires operation={operation} dossier={dossier} />
      )}
      {pendingTemplate === 'convention_honoraires' && (
        <ModeleConventionHonorairesCarpa operation={operation} dossier={dossier} />
      )}
    </>
  );
};

// Bibliotheque accessible depuis le panneau dossier
export const CarpaTemplatesLibrary = ({ dossier }) => {
  // Operation factice "honoraires" pour le dossier (modele non lie a une operation precise)
  const fakeOp = {
    montant: 0,
    devise: 'EUR',
    beneficiaireSnapshot: dossier?.dossier?.parties?.pour?.[0]?.partieData
      ? {
          nom: dossier.dossier.parties.pour[0].partieData.nom || '',
          prenoms: dossier.dossier.parties.pour[0].partieData.prenoms || '',
          raisonSociale: dossier.dossier.parties.pour[0].partieData.raisonSociale || '',
        }
      : { nom: '', prenoms: '', raisonSociale: '' },
  };

  return (
    <div className="k-carpa-section">
      <h4 className="k-carpa-section-title">Modeles de documents CARPA</h4>
      <p className="k-carpa-section-subtitle">
        Generez en un clic un modele pre-rempli a faire signer au client. L'imprimante systeme
        ouvre une fenetre — choisissez "Enregistrer en PDF" pour conserver le document.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <CarpaTemplateButton
          template="autorisation_honoraires"
          operation={fakeOp}
          dossier={dossier}
          label="Autorisation manuscrite (honoraires)"
        />
        <CarpaTemplateButton
          template="convention_honoraires"
          operation={fakeOp}
          dossier={dossier}
          label="Annexe CARPA convention honoraires"
        />
      </div>
    </div>
  );
};

export default CarpaTemplatesLibrary;
