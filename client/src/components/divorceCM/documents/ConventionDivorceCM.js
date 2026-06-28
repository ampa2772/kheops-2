// client/src/components/divorceCM/documents/ConventionDivorceCM.js
//
// Convention de divorce par consentement mutuel - voie extrajudiciaire.
// Articles 229-1 a 229-4, 230 et suivants du Code civil.
//
// Cette version :
//  - utilise une numerotation d'articles CONTINUE (pas de "Article — ..."
//    sans numero) via un compteur explicite
//  - integre les templates personnalisables du cabinet pour les sections
//    de boilerplate (preambule, frais et honoraires, effets, info fiscale)
//
// Les donnees structurelles (parties, mariage, enfants, prestation,
// logement, notaire) restent generees automatiquement a partir de la
// fiche divorce.
import React from 'react';
import {
  formatDateLongue,
  formatDateCourte,
  identiteEpouxBloc,
  identiteEnfantBloc,
  nomCompletEpoux,
  designerEpoux,
  formatMontant,
  nombreEnLettres,
} from './documentHelpers';
import { useTemplate } from '../templates/useTemplate';
import { TEMPLATE_KEYS } from '../templates/templateDefaults';
import './divorceCMDocs.css';

// Compteur d'articles : closure simple ; reinitialise a chaque rendu de
// la convention. Permet d'obtenir une numerotation continue (1, 2, 3...)
// quel que soit l'enchainement des sections conditionnelles.
const makeArticleCounter = () => {
  const ref = { value: 0 };
  return () => ++ref.value;
};

const ConventionDivorceCM = ({ data, dossier }) => {
  const tplPreambule = useTemplate(TEMPLATE_KEYS.CONVENTION_PREAMBULE_INTRO);
  const tplFraisHonoraires = useTemplate(TEMPLATE_KEYS.CONVENTION_FRAIS_HONORAIRES);
  const tplEffetsDivorce = useTemplate(TEMPLATE_KEYS.CONVENTION_EFFETS_DIVORCE);
  const tplInfoFiscale = useTemplate(TEMPLATE_KEYS.CONVENTION_INFORMATION_FISCALE);

  if (!data) return null;

  const epoux1 = data.epoux1 || {};
  const epoux2 = data.epoux2 || {};
  const enfants = data.enfants || [];
  const adultesCharge = data.adultesCharge || [];
  const aDesAdultesCharge = adultesCharge.length > 0;
  const enfantsMineurs = enfants.filter(e => {
    if (!e.dateNaissance) return false;
    const age = (Date.now() - new Date(e.dateNaissance).getTime()) / (365.25 * 86400000);
    return age < 18;
  });

  const avocat1 = epoux1.avocat || {};
  const avocat2 = epoux2.avocat || {};
  const mariage = data.mariage || {};
  const presta = data.prestationCompensatoire || {};
  const pensions = data.pensionsAlimentaires || [];
  const logement = data.logementFamilial || {};
  const nomUsage = data.nomUsage || {};
  const notaire = data.notaire || {};

  const refDossier = dossier?.reference || '';

  const labelRegime = {
    communaute_legale: 'la communaute legale reduite aux acquets',
    separation_biens: 'la separation de biens',
    communaute_universelle: 'la communaute universelle',
    participation_acquets: 'la participation aux acquets',
    autre: 'un regime particulier',
  }[mariage.regime] || '__________';

  const labelLogement = {
    attribution_epoux1: `attribue en pleine propriete a ${nomCompletEpoux(epoux1)}`,
    attribution_epoux2: `attribue en pleine propriete a ${nomCompletEpoux(epoux2)}`,
    vente: 'mis en vente',
    indivision: 'maintenu en indivision',
    autre: 'fait l\'objet d\'une disposition particuliere',
  }[logement.type] || '__________';

  const labelForme = {
    capital: 'sous forme d\'un capital',
    rente_temporaire: 'sous forme d\'une rente temporaire',
    rente_viagere: 'sous forme d\'une rente viagere',
    mixte: 'sous forme d\'un capital complete d\'une rente',
  }[presta.forme] || '__________';

  const beneficiairePresta = presta.beneficiaire === 'epoux1' ? nomCompletEpoux(epoux1)
    : presta.beneficiaire === 'epoux2' ? nomCompletEpoux(epoux2)
    : '__________';

  const findEnfantById = (id) => {
    if (!id) return null;
    return enfants.find(e => String(e._id) === String(id));
  };

  const aDesEnfants = enfants.length > 0;
  const aPensions = pensions.length > 0;

  // Compteur d'articles partage par le rendu
  const nextArticle = makeArticleCounter();

  return (
    <div className="k-dcm-doc-print-area">
      <div className="k-dcm-doc-page">
        <h1>Convention de divorce par consentement mutuel</h1>
        <p style={{ textAlign: 'center', fontSize: '10.5pt', fontStyle: 'italic', marginTop: '-0.3cm' }}>
          (Acte sous signature privee contresigne par avocats — articles 229-1 a 229-4 du Code civil)
        </p>
        {refDossier && (
          <p style={{ textAlign: 'right', fontSize: '10pt' }}>Dossier : {refDossier}</p>
        )}

        {/* ===== ENTRE LES SOUSSIGNES ===== */}
        <div className="k-dcm-doc-soussigne">Entre les soussignes :</div>

        <div className="k-dcm-doc-bloc-partie">{identiteEpouxBloc(epoux1)}</div>
        <p className="k-dcm-doc-represente">
          Represente(e) par {avocat1.nom
            ? `Maitre ${avocat1.prenoms || ''} ${avocat1.nom}, avocat au Barreau de ${avocat1.barreau || '__________'}`
            : '__________'},
        </p>
        <p style={{ textAlign: 'center', fontStyle: 'italic' }}>
          ci-apres designe(e) {designerEpoux(epoux1, 'demonstratif')},
        </p>

        <div className="k-dcm-doc-et">D'UNE PART,</div>
        <div className="k-dcm-doc-et">ET</div>

        <div className="k-dcm-doc-bloc-partie">{identiteEpouxBloc(epoux2)}</div>
        <p className="k-dcm-doc-represente">
          Represente(e) par {avocat2.nom
            ? `Maitre ${avocat2.prenoms || ''} ${avocat2.nom}, avocat au Barreau de ${avocat2.barreau || '__________'}`
            : '__________'},
        </p>
        <p style={{ textAlign: 'center', fontStyle: 'italic' }}>
          ci-apres designe(e) {designerEpoux(epoux2, 'demonstratif')},
        </p>

        <div className="k-dcm-doc-et">D'AUTRE PART.</div>

        <p style={{ textAlign: 'center', fontWeight: 700, marginTop: '0.5cm' }}>
          IL A ETE PREALABLEMENT EXPOSE CE QUI SUIT :
        </p>

        {/* ===== PREAMBULE ===== */}
        <div className="k-dcm-doc-article">
          <p>
            {nomCompletEpoux(epoux1)} et {nomCompletEpoux(epoux2)} se sont maries{' '}
            le <strong>{formatDateLongue(mariage.dateMariage)}</strong>{' '}
            a <strong>{mariage.lieuMariage || '__________'}</strong>
            {mariage.paysMariage && mariage.paysMariage !== 'France' ? ` (${mariage.paysMariage})` : ''},
            sous le regime de <strong>{labelRegime}</strong>
            {mariage.contratMariage?.existence
              ? `, suivant contrat de mariage recu en date du ${formatDateLongue(mariage.contratMariage.dateContrat)} par Maitre ${mariage.contratMariage.notaireRedacteur || '__________'}, notaire a ${mariage.contratMariage.villeNotaire || '__________'}`
              : ', a defaut de contrat de mariage'}.
          </p>

          {aDesEnfants ? (
            <>
              <p>De cette union {enfants.length === 1 ? 'est ne(e) un(e) enfant' : `sont nes ${enfants.length} enfants`} :</p>
              <ul>
                {enfants.map((enf, idx) => (
                  <li key={idx}>{identiteEnfantBloc(enf)}.</li>
                ))}
              </ul>
            </>
          ) : (
            <p>Aucun enfant n'est issu du mariage.</p>
          )}

          {/* Template personnalisable : preambule */}
          <p style={{ whiteSpace: 'pre-line' }}>{tplPreambule}</p>
        </div>

        <p style={{ textAlign: 'center', fontWeight: 700, marginTop: '0.6cm' }}>
          CECI EXPOSE, IL EST CONVENU CE QUI SUIT :
        </p>

        {/* ===== ARTICLE 1 - Consentement ===== */}
        <div className="k-dcm-doc-article">
          <div className="k-dcm-doc-article-title">Article {nextArticle()} — Consentement reciproque au divorce</div>
          <p>
            {nomCompletEpoux(epoux1)} et {nomCompletEpoux(epoux2)} declarent consentir, librement et
            sans reserve, a leur divorce par consentement mutuel et a l'ensemble des effets de cette
            rupture tels qu'ils sont organises par la presente convention.
          </p>
          <p>
            Conformement a l'article 229-1 du Code civil, chaque epoux est assiste de son propre avocat ;
            la convention sera deposee au rang des minutes du notaire designe a un article ulterieur de
            la presente convention, le recepisse delivre par ce dernier ayant pour effet de dissoudre
            le mariage.
          </p>
        </div>

        {/* ===== ARTICLES ENFANTS ===== */}
        {aDesEnfants && (
          <>
            <div className="k-dcm-doc-article">
              <div className="k-dcm-doc-article-title">Article {nextArticle()} — Exercice de l'autorite parentale</div>
              <p>
                L'autorite parentale a l'egard {enfants.length === 1 ? 'de l\'enfant' : 'des enfants'} demeure
                {enfants.every(e => (e.autoriteParentale || 'conjointe') === 'conjointe')
                  ? ' exercee conjointement par les deux parents.'
                  : ' organisee comme suit :'}
              </p>
              {enfants.some(e => (e.autoriteParentale || 'conjointe') !== 'conjointe') && (
                <ul>
                  {enfants.map((enf, idx) => {
                    const ap = enf.autoriteParentale || 'conjointe';
                    const label = ap === 'unique_pere' ? 'exercee de maniere unique par le pere'
                      : ap === 'unique_mere' ? 'exercee de maniere unique par la mere'
                      : 'exercee conjointement';
                    return <li key={idx}>{enf.prenoms} {enf.nom} : autorite parentale {label}.</li>;
                  })}
                </ul>
              )}
              <p>
                Les decisions importantes relatives a la sante, a l'education, a la scolarite et a
                l'orientation des enfants sont prises d'un commun accord entre les parents. Chacun
                informe l'autre de tout fait susceptible d'affecter la sante, l'education ou les
                conditions de vie des enfants.
              </p>
            </div>

            <div className="k-dcm-doc-article">
              <div className="k-dcm-doc-article-title">Article {nextArticle()} — Residence des enfants et droit de visite et d'hebergement</div>
              {enfants.map((enf, idx) => {
                const r = enf.residence || {};
                let texte = '';
                if (r.type === 'alternee') {
                  texte = `La residence sera fixee en alternance chez ses deux parents${r.detailAlternance ? `, selon les modalites suivantes : ${r.detailAlternance}` : ', selon des modalites convenues entre les parents'}.`;
                } else if (r.type === 'principale_pere') {
                  texte = 'La residence habituelle est fixee chez le pere.';
                } else if (r.type === 'principale_mere') {
                  texte = 'La residence habituelle est fixee chez la mere.';
                } else if (r.type === 'autre') {
                  texte = r.detailAlternance || 'Une organisation particuliere est convenue entre les parents.';
                } else {
                  texte = '__________';
                }
                return (
                  <div key={idx} style={{ marginBottom: '0.4cm' }}>
                    <p><strong>{enf.prenoms} {enf.nom}</strong> :</p>
                    <p style={{ marginLeft: '0.5cm' }}>{texte}</p>
                    {r.droitVisiteHebergement && r.type !== 'alternee' && (
                      <p style={{ marginLeft: '0.5cm' }}>
                        Droit de visite et d'hebergement du parent non hebergeant : {r.droitVisiteHebergement}.
                      </p>
                    )}
                    {r.vacancesScolaires && (
                      <p style={{ marginLeft: '0.5cm' }}>
                        Vacances scolaires : {r.vacancesScolaires}.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {aPensions && (
              <div className="k-dcm-doc-article">
                <div className="k-dcm-doc-article-title">Article {nextArticle()} — Contribution a l'entretien et l'education des enfants</div>
                <p>
                  Au titre de la contribution a l'entretien et l'education {enfants.length === 1 ? 'de l\'enfant' : 'des enfants'},
                  les parents conviennent ce qui suit :
                </p>
                {pensions.map((p, idx) => {
                  const enf = findEnfantById(p.enfantIdLocal);
                  const debiteur = p.debiteur === 'epoux1' ? nomCompletEpoux(epoux1)
                    : p.debiteur === 'epoux2' ? nomCompletEpoux(epoux2) : '__________';
                  const dureeLabel = {
                    jusqu_majorite: 'jusqu\'a la majorite',
                    jusqu_autonomie: 'jusqu\'a ce que l\'enfant soit financierement autonome',
                    autre: p.dureeAutreDetail || '__________',
                  }[p.duree] || 'jusqu\'a ce que l\'enfant soit financierement autonome';
                  const fraisLabel = {
                    '50_50': 'partages par moitie entre les parents',
                    proportionnel_revenus: 'partages au prorata des revenus respectifs',
                    integral_debiteur: `integralement supportes par ${debiteur}`,
                    autre: p.fraisExceptionnels?.detail || '__________',
                  }[p.fraisExceptionnels?.repartition] || 'partages par moitie';
                  return (
                    <div key={idx} style={{ marginBottom: '0.4cm' }}>
                      <p><strong>{enf ? `${enf.prenoms} ${enf.nom}` : `Enfant ${idx + 1}`}</strong> :</p>
                      <p style={{ marginLeft: '0.5cm' }}>
                        {debiteur} versera a l'autre parent une contribution mensuelle de{' '}
                        <strong>{formatMontant(p.montantMensuel)}</strong>{' '}
                        ({nombreEnLettres(p.montantMensuel)} euros)
                        {p.modalitesPaiement ? `, ${p.modalitesPaiement}` : ''}, {dureeLabel}.
                      </p>
                      {p.indexation?.indice && (
                        <p style={{ marginLeft: '0.5cm', fontSize: '10.5pt' }}>
                          Cette contribution sera revisee chaque annee
                          {p.indexation?.dateRevision ? ` au ${p.indexation.dateRevision}` : ''} en fonction de l'indice {p.indexation.indice}
                          {p.indexation?.indice === 'INSEE_prix_consommation' ? ' des prix a la consommation publie par l\'INSEE' : ''}.
                        </p>
                      )}
                      <p style={{ marginLeft: '0.5cm', fontSize: '10.5pt' }}>
                        Les frais exceptionnels (frais de scolarite et activites extrascolaires importantes,
                        soins medicaux non rembourses, etc.) sont {fraisLabel}
                        {p.fraisExceptionnels?.detail && p.fraisExceptionnels.repartition !== 'autre'
                          ? `. Sont notamment concernes : ${p.fraisExceptionnels.detail}` : ''}.
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ===== Regime matrimonial ===== */}
        <div className="k-dcm-doc-article">
          <div className="k-dcm-doc-article-title">Article {nextArticle()} — Regime matrimonial et liquidation</div>
          <p>
            Les epoux declarent etre maries sous le regime de <strong>{labelRegime}</strong>
            {mariage.contratMariage?.existence
              ? `, suivant contrat de mariage du ${formatDateCourte(mariage.contratMariage.dateContrat)}.`
              : ', a defaut de contrat de mariage.'}
          </p>
          {mariage.patrimoineResume ? (
            <>
              <p><strong>Etat du patrimoine commun :</strong></p>
              <p style={{ whiteSpace: 'pre-line' }}>{mariage.patrimoineResume}</p>
            </>
          ) : (
            <p>
              <em>[Etat liquidatif a annexer ou declaration qu'il n'y a pas lieu a liquidation.]</em>
            </p>
          )}
          <p>
            <strong>Important :</strong> en presence de biens immobiliers communs, un etat liquidatif sera etabli
            par acte authentique recu par le notaire designe ci-apres et annexe a la presente convention.
            A defaut de bien immobilier, les epoux declarent qu'il n'y a pas lieu a liquidation et qu'ils
            ont procede entre eux au partage de leurs meubles et effets personnels.
          </p>
        </div>

        {/* ===== Logement ===== */}
        <div className="k-dcm-doc-article">
          <div className="k-dcm-doc-article-title">Article {nextArticle()} — Sort du logement familial</div>
          <p>
            Le logement de la famille
            {logement.adresseBien ? <> situe <strong>{logement.adresseBien}</strong></> : ''}
            {' '}sera <strong>{labelLogement}</strong>.
          </p>
          {logement.detail && (
            <p style={{ whiteSpace: 'pre-line' }}>{logement.detail}</p>
          )}
          {logement.soulteEventuelle && (
            <p>
              Une soulte d'un montant de <strong>{formatMontant(logement.soulteEventuelle)}</strong>{' '}
              ({nombreEnLettres(logement.soulteEventuelle)} euros) sera versee par
              le beneficiaire de l'attribution a son ex-conjoint dans les conditions a definir entre les parties.
            </p>
          )}
        </div>

        {/* ===== Adultes a charge ===== */}
        {aDesAdultesCharge && (
          <div className="k-dcm-doc-article">
            <div className="k-dcm-doc-article-title">Article {nextArticle()} — Adultes a charge</div>
            <p>
              Les epoux declarent assumer la charge des personnes majeures suivantes au moment du
              divorce. Cette mention est faite pour information, sans prejudice des obligations
              legales de chaque epoux a l'egard de ses propres ascendants ou descendants
              (article 205 et suivants du Code civil).
            </p>
            <ul>
              {adultesCharge.map((a, idx) => {
                const nom = `${a.prenoms || ''} ${a.nom || ''}`.trim() || `Personne ${idx + 1}`;
                const lien = a.lien ? `, ${a.lien}` : '';
                const motif = a.motif ? ` — motif : ${a.motif}` : '';
                const ch = a.aLaChargeDe === 'epoux1' ? ' (a la charge de l\'Epoux 1)'
                  : a.aLaChargeDe === 'epoux2' ? ' (a la charge de l\'Epoux 2)'
                  : ' (charge commune)';
                return <li key={idx}>{nom}{lien}{motif}{ch}.</li>;
              })}
            </ul>
          </div>
        )}

        {/* ===== Prestation compensatoire ===== */}
        <div className="k-dcm-doc-article">
          <div className="k-dcm-doc-article-title">Article {nextArticle()} — Prestation compensatoire</div>
          {presta.applicable ? (
            <>
              <p>
                Compte tenu de la disparite que la rupture du mariage cree dans les conditions de vie
                respectives des epoux, et conformement aux dispositions des articles 270 et suivants du
                Code civil, il est verse une prestation compensatoire au profit de{' '}
                <strong>{beneficiairePresta}</strong>, <strong>{labelForme}</strong>.
              </p>

              {(presta.forme === 'capital' || presta.forme === 'mixte') && presta.montantCapital && (
                <p>
                  Le capital s'eleve a la somme de <strong>{formatMontant(presta.montantCapital)}</strong>{' '}
                  ({nombreEnLettres(presta.montantCapital)} euros)
                  {presta.modalitesCapital === 'paiement_unique' && ', payable en une seule fois.'}
                  {presta.modalitesCapital === 'echelonne' && (presta.detailEchelonnement ? `, ${presta.detailEchelonnement}.` : ', payable selon des modalites echelonnees a definir entre les parties (article 275 du Code civil — duree maximale de 8 ans).')}
                  {presta.modalitesCapital === 'attribution_bien' && (presta.attributionBienDetail ? `, par l'attribution du bien suivant : ${presta.attributionBienDetail}.` : ', par attribution d\'un bien en propriete.')}
                </p>
              )}

              {(presta.forme === 'rente_temporaire' || presta.forme === 'rente_viagere' || presta.forme === 'mixte') && presta.montantRente && (
                <p>
                  La rente mensuelle est fixee a <strong>{formatMontant(presta.montantRente)}</strong>{' '}
                  ({nombreEnLettres(presta.montantRente)} euros par mois)
                  {presta.forme === 'rente_temporaire' && presta.dureeRenteMois
                    ? `, pendant une duree de ${presta.dureeRenteMois} mois.`
                    : presta.forme === 'rente_viagere' ? ', a titre viager.' : '.'}
                  {presta.indexationRente ? ` Cette rente sera revisable selon les modalites suivantes : ${presta.indexationRente}.` : ''}
                </p>
              )}

              {presta.motifs && (
                <>
                  <p><strong>Motifs (criteres de l'article 271 du Code civil) :</strong></p>
                  <p style={{ whiteSpace: 'pre-line' }}>{presta.motifs}</p>
                </>
              )}
            </>
          ) : (
            <p>
              Compte tenu de leur situation respective et des dispositions arretees par la presente
              convention, les epoux declarent expressement qu'aucune prestation compensatoire n'est due
              ni reclamee de part et d'autre.
            </p>
          )}
        </div>

        {/* ===== Nom d'usage ===== */}
        <div className="k-dcm-doc-article">
          <div className="k-dcm-doc-article-title">Article {nextArticle()} — Usage du nom</div>
          <p>
            Conformement aux dispositions de l'article 264 du Code civil, chacun des epoux reprend, a compter
            de la dissolution du mariage, l'usage de son nom de naissance.
          </p>
          {(nomUsage.epoux1Garde || nomUsage.epoux2Garde) && (
            <>
              <p>Toutefois, par derogation, il est convenu ce qui suit :</p>
              {nomUsage.epoux1Garde && (
                <p>
                  {nomCompletEpoux(epoux1)} est autorise(e) a conserver l'usage du nom de
                  l'autre epoux, pour le motif particulier suivant : {nomUsage.motif || '__________'}.
                </p>
              )}
              {nomUsage.epoux2Garde && (
                <p>
                  {nomCompletEpoux(epoux2)} est autorise(e) a conserver l'usage du nom de
                  l'autre epoux, pour le motif particulier suivant : {nomUsage.motif || '__________'}.
                </p>
              )}
            </>
          )}
        </div>

        {/* ===== Frais et honoraires (template) ===== */}
        <div className="k-dcm-doc-article">
          <div className="k-dcm-doc-article-title">Article {nextArticle()} — Frais de procedure et honoraires</div>
          <p style={{ whiteSpace: 'pre-line' }}>{tplFraisHonoraires}</p>
        </div>

        {/* ===== Information fiscale (template) ===== */}
        <div className="k-dcm-doc-article">
          <div className="k-dcm-doc-article-title">Article {nextArticle()} — Information sur les consequences fiscales</div>
          <p style={{ whiteSpace: 'pre-line' }}>{tplInfoFiscale}</p>
        </div>

        {/* ===== Notaire ===== */}
        <div className="k-dcm-doc-article">
          <div className="k-dcm-doc-article-title">Article {nextArticle()} — Depot au rang des minutes du notaire</div>
          <p>
            Conformement a l'article 229-1 du Code civil, la presente convention sera deposee, a la
            diligence de l'avocat le plus diligent et dans les sept jours suivant la signature, au rang
            des minutes de :
          </p>
          {notaire.nom ? (
            <p style={{ marginLeft: '0.5cm' }}>
              <strong>Maitre {notaire.prenoms || ''} {notaire.nom}</strong>,<br />
              {notaire.cabinet ? `${notaire.cabinet},` : ''}
              {notaire.cabinet && <br />}
              {notaire.adresse || '__________'}, {notaire.codePostal || ''} {notaire.ville || '__________'}.
            </p>
          ) : (
            <p style={{ marginLeft: '0.5cm', fontStyle: 'italic' }}>
              [Identite du notaire designe a completer.]
            </p>
          )}
          <p>
            Le recepisse delivre par le notaire a effet de dissoudre le mariage. La convention prend date
            certaine a la date du depot.
          </p>
        </div>

        {/* ===== Audition mineurs (mention obligatoire) ===== */}
        {enfantsMineurs.length > 0 && (
          <div className="k-dcm-doc-article">
            <div className="k-dcm-doc-article-title">Article {nextArticle()} — Information des enfants mineurs</div>
            <p>
              Conformement aux dispositions des articles 229-2 2° et 388-1 du Code civil, les parents
              certifient avoir informe {enfantsMineurs.length === 1 ? 'l\'enfant mineur' : 'les enfants mineurs'}{' '}
              ci-apres designe(s) de leur droit a etre entendu(s) par le juge :
            </p>
            <ul>
              {enfantsMineurs.map((e, idx) => (
                <li key={idx}>
                  {e.prenoms} {e.nom}, {e.dateNaissance ? `ne(e) le ${formatDateLongue(e.dateNaissance)}` : ''}
                </li>
              ))}
            </ul>
            <p>
              Apres avoir ete informe(s) de cette faculte dans des termes adaptes a son (leur) age et a son
              (leur) discernement, l'enfant (ou chacun des enfants) <strong>n'a pas souhaite faire usage de
              cette faculte</strong>. Les parents en attestent expressement par la signature de la presente
              convention.
            </p>
          </div>
        )}

        {/* ===== Effets (template) ===== */}
        <div className="k-dcm-doc-article">
          <div className="k-dcm-doc-article-title">Article {nextArticle()} — Effets du divorce</div>
          <p style={{ whiteSpace: 'pre-line' }}>{tplEffetsDivorce}</p>
        </div>

        <p style={{ marginTop: '1cm', textAlign: 'right' }}>
          Fait en quatre (4) exemplaires originaux,<br />
          a __________________________, le __________________________
        </p>

        <div className="k-dcm-doc-signatures">
          <div className="k-dcm-doc-signature-bloc">
            <div className="k-dcm-doc-signature-titre">{nomCompletEpoux(epoux1)}</div>
            <div className="k-dcm-doc-signature-mention">
              Mention manuscrite obligatoire :<br />
              "Lu et approuve, bon pour accord sur la convention de divorce par consentement mutuel"
            </div>
            <div className="k-dcm-doc-signature-line" />
          </div>
          <div className="k-dcm-doc-signature-bloc">
            <div className="k-dcm-doc-signature-titre">{nomCompletEpoux(epoux2)}</div>
            <div className="k-dcm-doc-signature-mention">
              Mention manuscrite obligatoire :<br />
              "Lu et approuve, bon pour accord sur la convention de divorce par consentement mutuel"
            </div>
            <div className="k-dcm-doc-signature-line" />
          </div>

          <div className="k-dcm-doc-signature-bloc">
            <div className="k-dcm-doc-signature-titre">
              Maitre {avocat1.prenoms || ''} {avocat1.nom || '__________'}
            </div>
            <div className="k-dcm-doc-signature-mention">
              Avocat de {nomCompletEpoux(epoux1)} — contreseing au sens de l'article 1374 du Code civil
            </div>
            <div className="k-dcm-doc-signature-line" />
          </div>
          <div className="k-dcm-doc-signature-bloc">
            <div className="k-dcm-doc-signature-titre">
              Maitre {avocat2.prenoms || ''} {avocat2.nom || '__________'}
            </div>
            <div className="k-dcm-doc-signature-mention">
              Avocat de {nomCompletEpoux(epoux2)} — contreseing au sens de l'article 1374 du Code civil
            </div>
            <div className="k-dcm-doc-signature-line" />
          </div>
        </div>

        <p style={{ marginTop: '1cm', fontSize: '9pt', fontStyle: 'italic', color: '#444', borderTop: '1px solid #999', paddingTop: '0.3cm' }}>
          Document genere automatiquement a partir de la fiche divorce du dossier {refDossier || '__________'}.
          A relire et completer manuellement avant signature. La presente convention est etablie en quatre
          exemplaires originaux : un pour chacun des epoux, un pour chacun des avocats. L'original est
          ensuite depose au notaire pour conservation au rang de ses minutes.
        </p>
      </div>
    </div>
  );
};

export default ConventionDivorceCM;
