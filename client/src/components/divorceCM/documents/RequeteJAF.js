// client/src/components/divorceCM/documents/RequeteJAF.js
//
// Requete conjointe en divorce par consentement mutuel adressee au juge aux
// affaires familiales — voie judiciaire (art. 230 et s. C. civ.).
// Cette voie reste applicable lorsqu'un mineur capable de discernement
// demande son audition (art. 388-1 C. civ.).
import React from 'react';
import {
  formatDateLongue,
  identiteEnfantBloc,
  nomCompletEpoux,
  identiteEpouxBloc,
} from './documentHelpers';
import './divorceCMDocs.css';

const RequeteJAF = ({ data, dossier }) => {
  if (!data) return null;

  const epoux1 = data.epoux1 || {};
  const epoux2 = data.epoux2 || {};
  const enfants = data.enfants || [];
  const enfantsAuditionnes = enfants.filter(e => e.souhaiteEtreEntendu);
  const mariage = data.mariage || {};

  const avocat1 = epoux1.avocat || {};
  const avocat2 = epoux2.avocat || {};
  const avocatCabinet = avocat1.estTitulaire ? avocat1
    : avocat2.estTitulaire ? avocat2
    : avocat1;

  const refDossier = dossier?.reference || '';
  // Tribunal : par defaut on prend la ville du domicile commun ou du conjoint adverse
  const tribunalVille = epoux1.ville || epoux2.ville || '__________';

  return (
    <div className="k-dcm-doc-print-area">
      <div className="k-dcm-doc-page">
        <h1>Requete conjointe en divorce par consentement mutuel</h1>
        <p style={{ textAlign: 'center', fontSize: '10.5pt', fontStyle: 'italic', marginTop: '-0.3cm' }}>
          (Articles 230 et suivants du Code civil — voie judiciaire suite a demande d'audition d'un mineur)
        </p>
        {refDossier && (
          <p style={{ textAlign: 'right', fontSize: '10pt' }}>Dossier : {refDossier}</p>
        )}

        <p style={{ textAlign: 'center', fontWeight: 700, marginTop: '0.5cm' }}>
          A MONSIEUR / MADAME LE JUGE AUX AFFAIRES FAMILIALES<br />
          PRES LE TRIBUNAL JUDICIAIRE DE {tribunalVille.toUpperCase()}
        </p>

        <p style={{ marginTop: '0.6cm', fontWeight: 700 }}>HONORE D'ENGAGER UNE REQUETE CONJOINTE :</p>

        {/* Epoux 1 */}
        <div className="k-dcm-doc-bloc-partie">
          {identiteEpouxBloc(epoux1)}
        </div>
        <p className="k-dcm-doc-represente">
          Ayant pour avocat {avocat1.nom
            ? `Maitre ${avocat1.prenoms || ''} ${avocat1.nom}, du Barreau de ${avocat1.barreau || '__________'}`
            : '__________'},
        </p>

        <p style={{ textAlign: 'center', fontWeight: 700 }}>ET</p>

        {/* Epoux 2 */}
        <div className="k-dcm-doc-bloc-partie">
          {identiteEpouxBloc(epoux2)}
        </div>
        <p className="k-dcm-doc-represente">
          Ayant pour avocat {avocat2.nom
            ? `Maitre ${avocat2.prenoms || ''} ${avocat2.nom}, du Barreau de ${avocat2.barreau || '__________'}`
            : '__________'},
        </p>

        <p style={{ textAlign: 'center', fontWeight: 700, marginTop: '0.5cm' }}>
          ONT L'HONNEUR DE VOUS EXPOSER CE QUI SUIT :
        </p>

        <h2>I. EXPOSE DES FAITS</h2>

        <p>
          Les requerants se sont maries le <strong>{formatDateLongue(mariage.dateMariage)}</strong>{' '}
          a <strong>{mariage.lieuMariage || '__________'}</strong>
          {mariage.contratMariage?.existence
            ? `, sous contrat de mariage recu le ${formatDateLongue(mariage.contratMariage.dateContrat)} par Maitre ${mariage.contratMariage.notaireRedacteur || '__________'}, notaire a ${mariage.contratMariage.villeNotaire || '__________'}.`
            : ', a defaut de contrat de mariage.'}
        </p>

        {enfants.length > 0 && (
          <>
            <p>De cette union {enfants.length === 1 ? 'est ne' : 'sont nes'} :</p>
            <ul>
              {enfants.map((e, idx) => <li key={idx}>{identiteEnfantBloc(e)}.</li>)}
            </ul>
          </>
        )}

        <p>
          Les epoux ont decide d'un commun accord de mettre fin a leur union par la voie du divorce
          par consentement mutuel et ont arrete une convention reglant l'integralite des effets de
          leur divorce.
        </p>

        {enfantsAuditionnes.length > 0 && (
          <p>
            Toutefois,{' '}
            {enfantsAuditionnes.length === 1
              ? "l'enfant mineur ci-apres designe a"
              : "les enfants mineurs ci-apres designes ont"}{' '}
            <strong>demande son (leur) audition par le juge</strong> en application des dispositions
            de l'article 388-1 du Code civil :
            <ul style={{ marginTop: '0.2cm' }}>
              {enfantsAuditionnes.map((e, idx) => (
                <li key={idx}>{e.prenoms} {e.nom}, {e.dateNaissance ? `ne(e) le ${formatDateLongue(e.dateNaissance)}` : ''}</li>
              ))}
            </ul>
          </p>
        )}

        <p>
          La voie extrajudiciaire de l'article 229-1 du Code civil n'est par consequent pas applicable.
          Les epoux saisissent donc le Juge aux affaires familiales aux fins d'homologation de la
          convention de divorce.
        </p>

        <h2>II. DISCUSSION</h2>

        <p>
          La convention conclue entre les epoux respecte les exigences legales : elle reglemente
          l'integralite des consequences du divorce (autorite parentale, residence, contribution a
          l'entretien et l'education des enfants, regime matrimonial, prestation compensatoire le
          cas echeant, sort du logement familial, nom d'usage).
        </p>

        <p>
          Les requerants demanderont au tribunal de proceder, prealablement a l'homologation, a
          l'audition de {enfantsAuditionnes.length === 1 ? "l'enfant mineur" : "des enfants mineurs"}
          ci-dessus designe(s), conformement a sa (leur) demande.
        </p>

        <h2>III. PAR CES MOTIFS</h2>

        <p>
          Vu les articles 230 a 232 du Code civil, vu les articles 1090 et suivants du Code de
          procedure civile, il est demande au Juge aux affaires familiales de bien vouloir :
        </p>

        <ul>
          <li>
            CONSTATER l'accord des epoux sur le principe et les consequences du divorce ;
          </li>
          <li>
            ENTENDRE
            {enfantsAuditionnes.length === 1
              ? ` l'enfant mineur ${enfantsAuditionnes[0].prenoms} ${enfantsAuditionnes[0].nom}`
              : ` les enfants mineurs ${enfantsAuditionnes.map(e => `${e.prenoms} ${e.nom}`).join(', ')}`},
            conformement a leur demande, dans les conditions de l'article 388-1 du Code civil ;
          </li>
          <li>
            HOMOLOGUER la convention de divorce conclue entre les epoux et y annexee ;
          </li>
          <li>
            PRONONCER en consequence le divorce de {nomCompletEpoux(epoux1)} et de {nomCompletEpoux(epoux2)} ;
          </li>
          <li>
            ORDONNER la mention du jugement en marge des actes de mariage et de naissance des epoux ;
          </li>
          <li>
            DIRE que les depens seront partages par moitie entre les epoux.
          </li>
        </ul>

        <h2>IV. PIECES PRODUITES</h2>

        <ol>
          <li>Convention de divorce signee par les epoux et leurs avocats ;</li>
          <li>Pieces d'identite des deux epoux ;</li>
          <li>Acte de mariage des epoux ;</li>
          <li>Livret de famille ;</li>
          {enfants.length > 0 && <li>Actes de naissance des enfants ;</li>}
          {mariage.contratMariage?.existence && <li>Contrat de mariage ;</li>}
          <li>Demande d'audition de(s) l'enfant(s) mineur(s) ;</li>
          <li>Justificatifs de revenus et de patrimoine ;</li>
          <li>Toute autre piece utile a l'instruction.</li>
        </ol>

        <p style={{ marginTop: '0.8cm', textAlign: 'right' }}>
          Fait a {avocatCabinet.ville || '__________'}, le {formatDateLongue(new Date())}
        </p>

        <div className="k-dcm-doc-signatures">
          <div className="k-dcm-doc-signature-bloc">
            <div className="k-dcm-doc-signature-titre">
              Maitre {avocat1.prenoms || ''} {avocat1.nom || '__________'}
            </div>
            <div className="k-dcm-doc-signature-mention">
              Avocat de {nomCompletEpoux(epoux1)}<br />
              Barreau de {avocat1.barreau || '__________'}
            </div>
            <div className="k-dcm-doc-signature-line" />
          </div>
          <div className="k-dcm-doc-signature-bloc">
            <div className="k-dcm-doc-signature-titre">
              Maitre {avocat2.prenoms || ''} {avocat2.nom || '__________'}
            </div>
            <div className="k-dcm-doc-signature-mention">
              Avocat de {nomCompletEpoux(epoux2)}<br />
              Barreau de {avocat2.barreau || '__________'}
            </div>
            <div className="k-dcm-doc-signature-line" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default RequeteJAF;
