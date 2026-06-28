// client/src/components/divorceCM/templates/templateDefaults.js
//
// Textes par defaut pour les sections personnalisables des documents.
// Chaque template a une cle stable, un libelle pour l'editeur et un
// contenu par defaut. Les placeholders {{x.y}} sont resolus a la
// generation a partir des donnees du dossier.
//
// Convention : les templates ne contiennent JAMAIS la donnee structurelle
// du dossier (noms, montants, dates) — seulement les paragraphes de
// "boilerplate" que l'avocat peut souhaiter personnaliser.

export const TEMPLATE_KEYS = {
  // ============== Convention ==============
  CONVENTION_PREAMBULE_INTRO: 'convention_preambule_intro',
  CONVENTION_FRAIS_HONORAIRES: 'convention_frais_honoraires',
  CONVENTION_EFFETS_DIVORCE: 'convention_effets_divorce',
  CONVENTION_INFORMATION_FISCALE: 'convention_information_fiscale',

  // ============== Lettres ==============
  LETTRE_RAR_INTRO: 'lettre_rar_intro',
  LETTRE_RAR_CONCLUSION: 'lettre_rar_conclusion',
  LETTRE_NOTAIRE_FORMULE_OUVERTURE: 'lettre_notaire_formule_ouverture',
  LETTRE_NOTAIRE_FORMULE_FERMETURE: 'lettre_notaire_formule_fermeture',
  LETTRE_CLIENT_APRES_DEPOT_INTRO: 'lettre_client_apres_depot_intro',
  FORMULE_POLITESSE_COURRIER: 'formule_politesse_courrier',

  // ============== Audition mineur ==============
  LETTRE_AUDITION_MINEUR_CORPS: 'lettre_audition_mineur_corps',
};

// Catalogue : pour chaque cle, le libelle, la description, et le defaut
export const TEMPLATE_CATALOGUE = [
  {
    key: TEMPLATE_KEYS.CONVENTION_PREAMBULE_INTRO,
    label: 'Convention — Preambule (introduction)',
    section: 'Convention',
    description: 'Premier paragraphe apres le rappel du mariage et des enfants. Annonce la decision de divorcer.',
    defaut:
      `Les epoux ont decide, d'un commun accord et apres reflexion approfondie, de mettre fin a leur union par la voie du divorce par consentement mutuel, en application des articles 229-1 et suivants du Code civil.

Apres avoir ete pleinement informes par leurs conseils respectifs des consequences juridiques, patrimoniales et fiscales de leur divorce, ils ont arrete d'un commun accord les dispositions qui suivent, lesquelles sont l'expression libre de leur volonte commune.`,
  },
  {
    key: TEMPLATE_KEYS.CONVENTION_FRAIS_HONORAIRES,
    label: 'Convention — Frais et honoraires',
    section: 'Convention',
    description: 'Article relatif au partage des frais de procedure et au paiement des honoraires d\'avocat.',
    defaut:
      `Chaque epoux conserve a sa charge les honoraires de son avocat conseil conformement a la convention d'honoraires signee entre eux.

Les frais et debours lies au depot de la presente convention au rang des minutes du notaire sont partages par moitie entre les epoux.

Les frais d'enregistrement et de publication eventuels (notamment en cas de bien immobilier soumis a publicite fonciere) seront supportes selon les modalites prevues par la loi ou, le cas echeant, suivant l'accord des parties.`,
  },
  {
    key: TEMPLATE_KEYS.CONVENTION_EFFETS_DIVORCE,
    label: 'Convention — Effets du divorce',
    section: 'Convention',
    description: 'Article qui rappelle a quel moment le divorce produit ses effets entre les epoux et a l\'egard des tiers.',
    defaut:
      `Le divorce produira ses effets entre les epoux a la date du depot de la presente convention au rang des minutes du notaire designe a l'article precedent. A l'egard des tiers, il prendra effet a la date de la mention en marge des actes de l'etat civil.

Les epoux feront proceder, a la diligence du notaire ou par leurs soins, a la mention en marge de leur acte de mariage et de leurs actes de naissance respectifs. Le cas echeant, mention sera egalement portee sur les actes de naissance des enfants.`,
  },
  {
    key: TEMPLATE_KEYS.CONVENTION_INFORMATION_FISCALE,
    label: 'Convention — Information fiscale',
    section: 'Convention',
    description: 'Article rappelant que les epoux ont ete informes des consequences fiscales du divorce.',
    defaut:
      `Les epoux declarent avoir ete informes par leurs avocats respectifs des consequences fiscales du present divorce, notamment en ce qui concerne :

- l'imposition separee a compter de l'annee du divorce ;
- le traitement fiscal de la prestation compensatoire (deduction et reduction d'impot selon les conditions des articles 199 octodecies et 156 II du Code general des impots) ;
- le rattachement et la garde alternee des enfants au regard de l'impot sur le revenu et des allocations ;
- le partage de l'eventuel patrimoine immobilier (droits de partage et frais notarials).

Les epoux feront, le cas echeant, appel a un conseil fiscal pour toute situation particuliere.`,
  },
  {
    key: TEMPLATE_KEYS.LETTRE_RAR_INTRO,
    label: 'Lettre RAR — Paragraphe d\'introduction',
    section: 'Lettre RAR (transmission projet)',
    description: 'Premier paragraphe de la lettre RAR. Annonce la transmission du projet de convention.',
    defaut:
      `Suite a nos derniers entretiens et conformement a la procedure applicable au divorce par consentement mutuel par acte sous signature privee contresigne par avocats (articles 229-1 et suivants du Code civil), je vous adresse, par la presente lettre recommandee avec accuse de reception, le projet de convention de divorce tel qu'il a ete redige et arrete avec le conseil de votre conjoint.`,
  },
  {
    key: TEMPLATE_KEYS.LETTRE_RAR_CONCLUSION,
    label: 'Lettre RAR — Paragraphe de conclusion',
    section: 'Lettre RAR (transmission projet)',
    description: 'Avant-derniers paragraphes : conservation, contact, formules.',
    defaut:
      `Je vous prie de bien vouloir conserver precieusement la presente lettre et son accuse de reception : ces documents constituent la preuve du point de depart du delai de reflexion legal.

Je reste naturellement a votre disposition pour tout entretien complementaire pendant ce delai et pour repondre a toute question.`,
  },
  {
    key: TEMPLATE_KEYS.LETTRE_NOTAIRE_FORMULE_OUVERTURE,
    label: 'Lettre au notaire — Formule d\'ouverture',
    section: 'Lettre au notaire',
    description: 'Premiere phrase de la lettre confraternelle au notaire.',
    defaut:
      `Cher Confrere, Chere Consoeur,

J'ai l'honneur de vous adresser, en double exemplaire original, la convention de divorce par consentement mutuel signee entre les parties.`,
  },
  {
    key: TEMPLATE_KEYS.LETTRE_NOTAIRE_FORMULE_FERMETURE,
    label: 'Lettre au notaire — Formule de fermeture',
    section: 'Lettre au notaire',
    description: 'Phrase de cloture confraternelle.',
    defaut:
      `Je me tiens a votre entiere disposition pour tout complement d'information et vous prie de recevoir, Cher Confrere, Chere Consoeur, l'expression de mes salutations confraternelles.`,
  },
  {
    key: TEMPLATE_KEYS.LETTRE_CLIENT_APRES_DEPOT_INTRO,
    label: 'Lettre client (apres depot) — Introduction',
    section: 'Lettre apres depot',
    description: 'Premier paragraphe annoncant le depot effectif et le recepisse.',
    defaut:
      `J'ai l'honneur de vous confirmer que la convention de divorce par consentement mutuel a bien ete deposee au rang des minutes du notaire designe dans la convention. Le recepisse de depot a ete delivre, conformement a l'article 229-1 du Code civil.

A compter de cette date, vous etes officiellement divorce(e).`,
  },
  {
    key: TEMPLATE_KEYS.FORMULE_POLITESSE_COURRIER,
    label: 'Courriers — Formule de politesse finale',
    section: 'Courriers',
    description: 'Formule de politesse de cloture utilisee dans tous les courriers au client.',
    defaut: `Je vous prie d'agreer, [APPEL], l'expression de mes salutations devouees.`,
  },
  {
    key: TEMPLATE_KEYS.LETTRE_AUDITION_MINEUR_CORPS,
    label: 'Lettre demande audition mineur — Corps',
    section: 'Audition mineur',
    description: 'Corps principal de la lettre adressee au juge demandant l\'audition de l\'enfant mineur.',
    defaut:
      `J'ai l'honneur de solliciter de votre haute bienveillance l'audition de l'enfant mineur, en application des dispositions de l'article 388-1 du Code civil et des articles 338-1 et suivants du Code de procedure civile.

L'enfant a manifeste son souhait d'etre entendu et apparait, compte tenu de son age et de son discernement, en mesure de l'etre.

L'audition aura pour objet de recueillir le sentiment de l'enfant sur les decisions prises a son endroit dans le cadre de la procedure de divorce par consentement mutuel pendante.

Je vous prie de bien vouloir convoquer l'enfant a l'audition dans les conditions habituelles. Je me tiens a votre disposition pour tout complement d'information.`,
  },
];

// Lookup : par cle, retourne le defaut et le libelle
export const getTemplateDefault = (key) => {
  const item = TEMPLATE_CATALOGUE.find(t => t.key === key);
  return item ? item.defaut : '';
};

export const getTemplateLabel = (key) => {
  const item = TEMPLATE_CATALOGUE.find(t => t.key === key);
  return item ? item.label : key;
};
