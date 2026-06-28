/**
 * Script de génération des 13 templates Word pour Kheops 2
 *
 * Variables disponibles dans le système (docxtemplater {variableName}) :
 *
 *   Contexte dossier (sans destinataire) :
 *     {dateDuJour}, {presentationParties}, {referenceDossier}, {nomDossier}, {villeCabinet}, {nomAvocat}, {barreauComplet}
 *
 *   Contexte courrier (1 destinataire) :
 *     {civilite}, {nom}, {prenom}, {adresse}, {cp}, {ville}, {email},
 *     {titre}, {appellation}, {introCourier},
 *     {dateDuJour}, {presentationParties}, {referenceDossier}, {nomDossier}, {villeCabinet}, {nomAvocat}, {barreauComplet}
 */

const { Document, Packer, Paragraph, TextRun, AlignmentType } = require("docx");
const fs = require("fs");
const path = require("path");

// ──────────────────────────────────────────────
// UTILITAIRES
// ──────────────────────────────────────────────

const PAGE_MARGINS = { top: 1134, bottom: 1134, left: 1134, right: 1134 };

function text(content, options = {}) {
  return new TextRun({ text: content, font: "Times New Roman", size: 24, ...options });
}

function bold(content, options = {}) {
  return text(content, { bold: true, ...options });
}

function italic(content, options = {}) {
  return text(content, { italics: true, ...options });
}

function emptyLine() {
  return new Paragraph({ children: [text("")], spacing: { after: 100 } });
}

function para(runs, options = {}) {
  const children = Array.isArray(runs) ? runs : [runs];
  return new Paragraph({
    children,
    spacing: { after: 100, line: 276 },
    ...options,
  });
}

function leftPara(runs, opts = {}) { return para(runs, { alignment: AlignmentType.LEFT, ...opts }); }
function centerPara(runs, opts = {}) { return para(runs, { alignment: AlignmentType.CENTER, ...opts }); }
function rightPara(runs, opts = {}) { return para(runs, { alignment: AlignmentType.RIGHT, ...opts }); }
function justifiedPara(runs, opts = {}) { return para(runs, { alignment: AlignmentType.JUSTIFIED, ...opts }); }

function dotLine() { return justifiedPara([text(".........................................................................................................................")]) }
function separator() { return centerPara([text("__________________________________________")]); }

function titre(label) { return centerPara([bold(label, { size: 32, underline: { type: "single" } })]); }
function sousTitre(label) { return centerPara([bold(label, { size: 26 })]); }
function sectionTitle(label) { return leftPara([bold(label, { size: 26, underline: { type: "single" } })]); }
function subSection(label) { return leftPara([bold(label, { size: 24, underline: { type: "single" } })]); }

// Blocs réutilisables
function blocDateRef() {
  return [
    rightPara([text("{villeCabinet}, {dateDuJour}")]),
    emptyLine(),
    leftPara([text("Réf. : "), bold("{referenceDossier}"), text(" - {nomDossier}")]),
    emptyLine(),
  ];
}

function blocParties() {
  return [
    separator(), emptyLine(), emptyLine(),
    leftPara([text("{presentationParties}")]),
    emptyLine(),
    separator(), emptyLine(), emptyLine(),
  ];
}

function blocSignatureAvocat() {
  return [
    emptyLine(), emptyLine(),
    rightPara([text("Fait à {villeCabinet}, {dateDuJour}")]),
    emptyLine(),
    rightPara([bold("{nomAvocat}")]),
    rightPara([text("{barreauComplet}")]),
  ];
}

function blocParCesMotifs() {
  return [
    centerPara([bold("PAR CES MOTIFS", { size: 28, underline: { type: "single" } })]),
    emptyLine(), emptyLine(),
    justifiedPara([text("Il est demandé au Tribunal de bien vouloir :")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- Condamner la partie adverse aux entiers dépens ;")]),
    emptyLine(),
    justifiedPara([text("- Condamner la partie adverse au paiement de la somme de .......... euros sur le fondement de l'article 700 du Code de procédure civile ;")]),
    emptyLine(),
    justifiedPara([text("- Ordonner l'exécution provisoire de la décision à intervenir.")]),
    emptyLine(), emptyLine(),
    centerPara([bold("SOUS TOUTES RÉSERVES")]),
  ];
}

function makeDoc(title, description, children) {
  return new Document({
    creator: "Kheops 2",
    title,
    description,
    sections: [{ properties: { page: { margin: PAGE_MARGINS } }, children }],
  });
}


// ══════════════════════════════════════════════
// 1. COURRIER
// ══════════════════════════════════════════════

function createCourrierTemplate() {
  return makeDoc("Template Courrier", "Modèle de courrier juridique", [
    leftPara([bold("{nomAvocat}")]),
    leftPara([text("{barreauComplet}")]),
    emptyLine(),
    rightPara([text("{villeCabinet}, {dateDuJour}")]),
    emptyLine(),
    leftPara([text("Réf. : "), bold("{referenceDossier}"), text(" - {nomDossier}")]),
    emptyLine(), emptyLine(),
    rightPara([bold("{titre}")]),
    rightPara([text("{adresse}")]),
    rightPara([text("{cp} {ville}")]),
    emptyLine(), emptyLine(),
    leftPara([bold("Objet : "), text("............")]),
    emptyLine(), emptyLine(),
    justifiedPara([text("{appellation},")]),
    emptyLine(),
    justifiedPara([text("J'ai l'honneur de me rapporter à vous dans le cadre du dossier référencé ci-dessus.")]),
    emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    justifiedPara([text("Je vous prie d'agréer, {appellation}, l'expression de mes salutations distinguées.")]),
    emptyLine(), emptyLine(), emptyLine(),
    rightPara([bold("{nomAvocat}")]),
  ]);
}

// ══════════════════════════════════════════════
// 2. ASSIGNATION
// ══════════════════════════════════════════════

function createAssignationTemplate() {
  return makeDoc("Template Assignation", "Modèle d'assignation juridique", [
    titre("ASSIGNATION"),
    emptyLine(),
    sousTitre("DEVANT LE TRIBUNAL JUDICIAIRE DE .............."),
    emptyLine(), emptyLine(),
    ...blocDateRef(),
    ...blocParties(),
    centerPara([bold("PLAISE AU TRIBUNAL", { size: 28 })]),
    emptyLine(), emptyLine(),
    sectionTitle("I. LES FAITS"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("II. DISCUSSION"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("III. SUR LES DEMANDES"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    ...blocParCesMotifs(),
    ...blocSignatureAvocat(),
  ]);
}

// ══════════════════════════════════════════════
// 3. CONCLUSION
// ══════════════════════════════════════════════

function createConclusionTemplate() {
  return makeDoc("Template Conclusions", "Modèle de conclusions juridiques", [
    titre("CONCLUSIONS"),
    emptyLine(),
    sousTitre("DEVANT LE TRIBUNAL JUDICIAIRE DE .............."),
    emptyLine(), emptyLine(),
    ...blocDateRef(),
    ...blocParties(),
    centerPara([bold("PLAISE AU TRIBUNAL", { size: 28 })]),
    emptyLine(), emptyLine(),
    sectionTitle("I. RAPPEL DES FAITS ET DE LA PROCÉDURE"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("II. DISCUSSION"), emptyLine(),
    subSection("A) Sur ............"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    subSection("B) Sur ............"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("III. SUR LES DEMANDES RECONVENTIONNELLES"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    centerPara([bold("PAR CES MOTIFS", { size: 28, underline: { type: "single" } })]),
    emptyLine(), emptyLine(),
    justifiedPara([text("Il est demandé au Tribunal de bien vouloir :")]),
    emptyLine(),
    justifiedPara([bold("A titre principal :")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    justifiedPara([bold("A titre subsidiaire :")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    justifiedPara([bold("En tout état de cause :")]),
    emptyLine(),
    justifiedPara([text("- Condamner la partie adverse aux entiers dépens ;")]),
    emptyLine(),
    justifiedPara([text("- Condamner la partie adverse au paiement de la somme de .......... euros sur le fondement de l'article 700 du Code de procédure civile ;")]),
    emptyLine(),
    justifiedPara([text("- Ordonner l'exécution provisoire de la décision à intervenir.")]),
    emptyLine(), emptyLine(),
    centerPara([bold("SOUS TOUTES RÉSERVES")]),
    ...blocSignatureAvocat(),
  ]);
}

// ══════════════════════════════════════════════
// 4. MISE EN DEMEURE
// ══════════════════════════════════════════════

function createMiseEnDemeureTemplate() {
  return makeDoc("Template Mise en Demeure", "Modèle de mise en demeure", [
    leftPara([bold("{nomAvocat}")]),
    leftPara([text("{barreauComplet}")]),
    emptyLine(),
    rightPara([text("{villeCabinet}, {dateDuJour}")]),
    emptyLine(),
    leftPara([text("Réf. : "), bold("{referenceDossier}"), text(" - {nomDossier}")]),
    emptyLine(), emptyLine(),
    // Destinataire
    rightPara([bold("{titre}")]),
    rightPara([text("{adresse}")]),
    rightPara([text("{cp} {ville}")]),
    emptyLine(), emptyLine(),
    // Envoi recommandé
    leftPara([bold("Lettre recommandée avec accusé de réception")]),
    emptyLine(), emptyLine(),
    leftPara([bold("Objet : MISE EN DEMEURE")]),
    emptyLine(), emptyLine(),
    justifiedPara([text("{appellation},")]),
    emptyLine(),
    justifiedPara([text("J'ai l'honneur d'intervenir en qualité de conseil de mon client dans le cadre du dossier référencé ci-dessus.")]),
    emptyLine(),
    justifiedPara([text("Par la présente, j'ai l'honneur de vous mettre en demeure de :")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    justifiedPara([text("et ce dans un délai de .......... jours à compter de la réception de la présente.")]),
    emptyLine(), emptyLine(),
    justifiedPara([text("A défaut de réponse satisfaisante dans le délai imparti, je me verrai contraint d'engager toute procédure judiciaire utile à la défense des intérêts de mon client, sans autre avis ni mise en demeure.")]),
    emptyLine(), emptyLine(),
    justifiedPara([text("Je vous prie d'agréer, {appellation}, l'expression de mes salutations distinguées.")]),
    emptyLine(), emptyLine(), emptyLine(),
    rightPara([bold("{nomAvocat}")]),
  ]);
}

// ══════════════════════════════════════════════
// 5. REQUÊTE
// ══════════════════════════════════════════════

function createRequeteTemplate() {
  return makeDoc("Template Requête", "Modèle de requête juridique", [
    titre("REQUÊTE"),
    emptyLine(),
    sousTitre("DEVANT LE TRIBUNAL JUDICIAIRE DE .............."),
    emptyLine(), emptyLine(),
    ...blocDateRef(),
    ...blocParties(),
    centerPara([bold("A L'ATTENTION DE MONSIEUR/MADAME LE/LA PRÉSIDENT(E)", { size: 24 })]),
    emptyLine(), emptyLine(),
    justifiedPara([text("Le requérant a l'honneur d'exposer les faits suivants :")]),
    emptyLine(), emptyLine(),
    sectionTitle("I. EXPOSÉ DES FAITS"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("II. DISCUSSION EN DROIT"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("III. SUR L'URGENCE / LA NÉCESSITÉ"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    ...blocParCesMotifs(),
    ...blocSignatureAvocat(),
  ]);
}

// ══════════════════════════════════════════════
// 6. CONCLUSIONS RÉCAPITULATIVES
// ══════════════════════════════════════════════

function createConclusionsRecapitulativesTemplate() {
  return makeDoc("Template Conclusions Récapitulatives", "Modèle de conclusions récapitulatives", [
    titre("CONCLUSIONS RÉCAPITULATIVES"),
    emptyLine(),
    sousTitre("DEVANT LE TRIBUNAL JUDICIAIRE DE .............."),
    emptyLine(), emptyLine(),
    ...blocDateRef(),
    ...blocParties(),
    centerPara([bold("PLAISE AU TRIBUNAL", { size: 28 })]),
    emptyLine(), emptyLine(),
    leftPara([italic("Les présentes conclusions récapitulatives annulent et remplacent l'ensemble des conclusions précédemment déposées, conformément aux dispositions de l'article 954 du Code de procédure civile.")]),
    emptyLine(), emptyLine(),
    sectionTitle("I. RAPPEL DES FAITS"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("II. RAPPEL DE LA PROCÉDURE"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("III. DISCUSSION"), emptyLine(),
    subSection("A) Sur ............"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    subSection("B) Sur ............"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    subSection("C) Sur ............"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    centerPara([bold("PAR CES MOTIFS", { size: 28, underline: { type: "single" } })]),
    emptyLine(), emptyLine(),
    justifiedPara([text("Il est demandé au Tribunal de bien vouloir :")]),
    emptyLine(),
    justifiedPara([bold("A titre principal :")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    justifiedPara([bold("A titre subsidiaire :")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    justifiedPara([bold("A titre infiniment subsidiaire :")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    justifiedPara([bold("En tout état de cause :")]),
    emptyLine(),
    justifiedPara([text("- Condamner la partie adverse aux entiers dépens ;")]),
    emptyLine(),
    justifiedPara([text("- Condamner la partie adverse au paiement de la somme de .......... euros sur le fondement de l'article 700 du Code de procédure civile ;")]),
    emptyLine(),
    justifiedPara([text("- Ordonner l'exécution provisoire de la décision à intervenir.")]),
    emptyLine(), emptyLine(),
    centerPara([bold("SOUS TOUTES RÉSERVES")]),
    ...blocSignatureAvocat(),
  ]);
}

// ══════════════════════════════════════════════
// 7. PROTOCOLE D'ACCORD TRANSACTIONNEL
// ══════════════════════════════════════════════

function createProtocoleAccordTemplate() {
  return makeDoc("Template Protocole d'Accord", "Modèle de protocole d'accord transactionnel", [
    titre("PROTOCOLE D'ACCORD TRANSACTIONNEL"),
    emptyLine(),
    centerPara([italic("(Articles 2044 et suivants du Code civil)")]),
    emptyLine(), emptyLine(),
    ...blocDateRef(),
    emptyLine(),
    centerPara([bold("ENTRE LES SOUSSIGNÉS :", { size: 26 })]),
    emptyLine(), emptyLine(),
    leftPara([text("{presentationParties}")]),
    emptyLine(), emptyLine(),
    sectionTitle("PRÉAMBULE"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    centerPara([bold("IL A ÉTÉ CONVENU ET ARRÊTÉ CE QUI SUIT :", { size: 26 })]),
    emptyLine(), emptyLine(),
    sectionTitle("ARTICLE 1 - OBJET"), emptyLine(),
    justifiedPara([text("Le présent protocole a pour objet de mettre un terme définitif au litige opposant les parties tel que décrit au préambule.")]),
    emptyLine(), emptyLine(),
    sectionTitle("ARTICLE 2 - CONCESSIONS RÉCIPROQUES"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("ARTICLE 3 - MODALITÉS D'EXÉCUTION"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("ARTICLE 4 - CONFIDENTIALITÉ"), emptyLine(),
    justifiedPara([text("Les parties s'engagent à conserver le présent protocole strictement confidentiel et à ne le divulguer à aucun tiers, sauf obligation légale.")]),
    emptyLine(), emptyLine(),
    sectionTitle("ARTICLE 5 - DÉSISTEMENT ET RENONCIATION"), emptyLine(),
    justifiedPara([text("Chacune des parties renonce irrévocablement à toute action, instance ou recours à l'encontre de l'autre partie relativement aux faits objet du présent protocole.")]),
    emptyLine(), emptyLine(),
    sectionTitle("ARTICLE 6 - DISPOSITIONS GÉNÉRALES"), emptyLine(),
    justifiedPara([text("Le présent protocole est soumis au droit français. En cas de difficulté d'interprétation ou d'exécution, les parties s'engagent à rechercher une solution amiable avant toute saisine juridictionnelle.")]),
    emptyLine(), emptyLine(), emptyLine(),
    justifiedPara([text("Fait en deux exemplaires originaux à {villeCabinet}, {dateDuJour}.")]),
    emptyLine(), emptyLine(), emptyLine(),
    leftPara([bold("Pour la première partie :")]),
    emptyLine(), emptyLine(), emptyLine(),
    leftPara([bold("Pour la seconde partie :")]),
  ]);
}

// ══════════════════════════════════════════════
// 8. SOMMATION INTERPELLATIVE
// ══════════════════════════════════════════════

function createSommationInterpellativeTemplate() {
  return makeDoc("Template Sommation Interpellative", "Modèle de sommation interpellative", [
    titre("SOMMATION INTERPELLATIVE"),
    emptyLine(), emptyLine(),
    ...blocDateRef(),
    emptyLine(),
    separator(), emptyLine(), emptyLine(),
    leftPara([text("{presentationParties}")]),
    emptyLine(),
    separator(), emptyLine(), emptyLine(),
    leftPara([bold("A la requête de :")]),
    emptyLine(),
    dotLine(),
    emptyLine(), emptyLine(),
    leftPara([bold("A l'attention de :")]),
    emptyLine(),
    dotLine(),
    emptyLine(), emptyLine(),
    justifiedPara([text("Le requérant, par l'intermédiaire de son conseil soussigné, a l'honneur de sommer et interpeller le destinataire de la présente aux fins de :")]),
    emptyLine(), emptyLine(),
    sectionTitle("I. OBJET DE LA SOMMATION"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("II. QUESTIONS POSÉES"), emptyLine(),
    justifiedPara([text("1. .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("2. .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("3. .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    justifiedPara([text("Le destinataire est invité à répondre à la présente sommation dans un délai de .......... jours à compter de sa signification.")]),
    emptyLine(), emptyLine(),
    justifiedPara([text("Faute de réponse dans le délai imparti, il sera tiré toutes conséquences de droit de ce silence.")]),
    ...blocSignatureAvocat(),
  ]);
}

// ══════════════════════════════════════════════
// 9. NOTE EN DÉLIBÉRÉ
// ══════════════════════════════════════════════

function createNoteDelibereTemplate() {
  return makeDoc("Template Note en Délibéré", "Modèle de note en délibéré", [
    titre("NOTE EN DÉLIBÉRÉ"),
    emptyLine(),
    sousTitre("DEVANT LE TRIBUNAL JUDICIAIRE DE .............."),
    emptyLine(), emptyLine(),
    ...blocDateRef(),
    ...blocParties(),
    centerPara([bold("A L'ATTENTION DU TRIBUNAL", { size: 26 })]),
    emptyLine(), emptyLine(),
    justifiedPara([text("Le conseil du demandeur/défendeur (supprimer la mention inutile) se permet, avec l'autorisation du Tribunal, de porter à la connaissance de la juridiction les observations suivantes à la suite de l'audience du .......... :")]),
    emptyLine(), emptyLine(),
    sectionTitle("I. SUR LES POINTS SOULEVÉS À L'AUDIENCE"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("II. OBSERVATIONS COMPLÉMENTAIRES"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("III. SUR LES PIÈCES COMMUNIQUÉES"), emptyLine(),
    justifiedPara([text("Le concluant verse aux débats les pièces suivantes :")]),
    emptyLine(),
    justifiedPara([text("- Pièce n°..... : .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- Pièce n°..... : .........................................................................................................................")]),
    emptyLine(), emptyLine(), emptyLine(),
    justifiedPara([text("Par ces motifs, le concluant maintient l'intégralité de ses demandes telles que formulées dans ses dernières écritures.")]),
    ...blocSignatureAvocat(),
  ]);
}

// ══════════════════════════════════════════════
// 10. DÉCLARATION D'APPEL
// ══════════════════════════════════════════════

function createDeclarationAppelTemplate() {
  return makeDoc("Template Déclaration d'Appel", "Modèle de déclaration d'appel", [
    titre("DÉCLARATION D'APPEL"),
    emptyLine(),
    sousTitre("DEVANT LA COUR D'APPEL DE .............."),
    emptyLine(), emptyLine(),
    ...blocDateRef(),
    emptyLine(),
    separator(), emptyLine(), emptyLine(),
    leftPara([text("{presentationParties}")]),
    emptyLine(),
    separator(), emptyLine(), emptyLine(),
    leftPara([bold("APPEL DU JUGEMENT RENDU LE :", { size: 24 })]),
    emptyLine(),
    justifiedPara([text("Jugement rendu le .......... par le Tribunal judiciaire de .........., sous le numéro RG ........../..........")]),
    emptyLine(), emptyLine(),
    sectionTitle("I. OBJET DE L'APPEL"), emptyLine(),
    justifiedPara([text("L'appelant interjette appel du jugement susvisé en ce qu'il a :")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    sectionTitle("II. CHEFS DU JUGEMENT CRITIQUÉS"), emptyLine(),
    justifiedPara([text("L'appel est limité aux chefs du jugement suivants (article 901 du Code de procédure civile) :")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    sectionTitle("III. PARTIES INTIMÉES"), emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    justifiedPara([text("L'appelant sollicite l'infirmation du jugement entrepris sur les chefs critiqués et demande à la Cour de statuer à nouveau.")]),
    ...blocSignatureAvocat(),
  ]);
}

// ══════════════════════════════════════════════
// 11. DIRE ET OBSERVATIONS (à expert)
// ══════════════════════════════════════════════

function createDireObservationsTemplate() {
  return makeDoc("Template Dire et Observations", "Modèle de dire et observations à expert judiciaire", [
    titre("DIRE ET OBSERVATIONS"),
    emptyLine(),
    sousTitre("ADRESSÉS À L'EXPERT JUDICIAIRE"),
    emptyLine(), emptyLine(),
    ...blocDateRef(),
    emptyLine(),
    leftPara([bold("Expert désigné : "), text("..........")]),
    leftPara([bold("Mission d'expertise ordonnée par : "), text("Tribunal judiciaire de ..........")]),
    leftPara([bold("Décision du : "), text("..........")]),
    leftPara([bold("N° RG : "), text("..........")]),
    emptyLine(),
    separator(), emptyLine(), emptyLine(),
    leftPara([text("{presentationParties}")]),
    emptyLine(),
    separator(), emptyLine(), emptyLine(),
    leftPara([bold("Maître "), bold("{nomAvocat}"), text(", conseil du demandeur/défendeur (supprimer la mention inutile), a l'honneur de formuler les dires et observations suivants :")]),
    emptyLine(), emptyLine(),
    sectionTitle("I. OBSERVATIONS PRÉLIMINAIRES"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("II. SUR LES CONSTATATIONS DE L'EXPERT"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("III. QUESTIONS POSÉES À L'EXPERT"), emptyLine(),
    justifiedPara([text("1. .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("2. .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("3. .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    sectionTitle("IV. PIÈCES COMMUNIQUÉES"), emptyLine(),
    justifiedPara([text("- Pièce n°..... : .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- Pièce n°..... : .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    justifiedPara([text("Le concluant demande à l'expert de bien vouloir prendre en considération les présents dires et de les annexer à son rapport d'expertise, conformément aux dispositions de l'article 276 du Code de procédure civile.")]),
    ...blocSignatureAvocat(),
  ]);
}

// ══════════════════════════════════════════════
// 12. CONCLUSIONS D'INCIDENT
// ══════════════════════════════════════════════

function createConclusionsIncidentTemplate() {
  return makeDoc("Template Conclusions d'Incident", "Modèle de conclusions d'incident", [
    titre("CONCLUSIONS D'INCIDENT"),
    emptyLine(),
    sousTitre("DEVANT LE JUGE DE LA MISE EN ÉTAT"),
    emptyLine(),
    sousTitre("DU TRIBUNAL JUDICIAIRE DE .............."),
    emptyLine(), emptyLine(),
    ...blocDateRef(),
    ...blocParties(),
    centerPara([bold("PLAISE AU JUGE DE LA MISE EN ÉTAT", { size: 28 })]),
    emptyLine(), emptyLine(),
    sectionTitle("I. RAPPEL DE LA PROCÉDURE"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("II. OBJET DE L'INCIDENT"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("III. DISCUSSION"), emptyLine(),
    dotLine(), emptyLine(), dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    centerPara([bold("PAR CES MOTIFS", { size: 28, underline: { type: "single" } })]),
    emptyLine(), emptyLine(),
    justifiedPara([text("Il est demandé au Juge de la mise en état de bien vouloir :")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- Condamner la partie adverse aux dépens de l'incident ;")]),
    emptyLine(),
    justifiedPara([text("- Condamner la partie adverse au paiement de la somme de .......... euros sur le fondement de l'article 700 du Code de procédure civile.")]),
    emptyLine(), emptyLine(),
    centerPara([bold("SOUS TOUTES RÉSERVES")]),
    ...blocSignatureAvocat(),
  ]);
}

// ══════════════════════════════════════════════
// 13. REQUÊTE AUX FINS DE SAISIE
// ══════════════════════════════════════════════

function createRequeteSaisieTemplate() {
  return makeDoc("Template Requête aux fins de Saisie", "Modèle de requête aux fins de saisie", [
    titre("REQUÊTE AUX FINS DE SAISIE"),
    emptyLine(),
    sousTitre("DEVANT LE JUGE DE L'EXÉCUTION"),
    emptyLine(),
    sousTitre("DU TRIBUNAL JUDICIAIRE DE .............."),
    emptyLine(), emptyLine(),
    ...blocDateRef(),
    ...blocParties(),
    centerPara([bold("A L'ATTENTION DE MONSIEUR/MADAME LE/LA JUGE DE L'EXÉCUTION", { size: 22 })]),
    emptyLine(), emptyLine(),
    sectionTitle("I. TITRE EXÉCUTOIRE"), emptyLine(),
    justifiedPara([text("Le requérant est porteur du titre exécutoire suivant :")]),
    emptyLine(),
    justifiedPara([text("- Nature du titre : .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- Juridiction : .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- Date : .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- Numéro RG : .........................................................................................................................")]),
    emptyLine(), emptyLine(),
    sectionTitle("II. CRÉANCE"), emptyLine(),
    justifiedPara([text("La créance du requérant s'élève à la somme de :")]),
    emptyLine(),
    justifiedPara([text("- Principal : .......... euros")]),
    emptyLine(),
    justifiedPara([text("- Intérêts : .......... euros")]),
    emptyLine(),
    justifiedPara([text("- Frais et dépens : .......... euros")]),
    emptyLine(),
    justifiedPara([text("- Article 700 : .......... euros")]),
    emptyLine(),
    justifiedPara([bold("- TOTAL : .......... euros")]),
    emptyLine(), emptyLine(),
    sectionTitle("III. OBJET DE LA SAISIE"), emptyLine(),
    justifiedPara([text("Le requérant sollicite l'autorisation de pratiquer une saisie .......... sur les biens suivants :")]),
    emptyLine(),
    dotLine(), emptyLine(), dotLine(),
    emptyLine(), emptyLine(),
    sectionTitle("IV. DILIGENCES PRÉALABLES"), emptyLine(),
    justifiedPara([text("Le titre exécutoire a été signifié le .......... par acte de Maître .........., Commissaire de justice à ..........")]),
    emptyLine(),
    justifiedPara([text("Un commandement de payer a été délivré le ..........")]),
    emptyLine(), emptyLine(),
    centerPara([bold("PAR CES MOTIFS", { size: 28, underline: { type: "single" } })]),
    emptyLine(), emptyLine(),
    justifiedPara([text("Il est demandé au Juge de l'exécution de bien vouloir :")]),
    emptyLine(),
    justifiedPara([text("- Autoriser le requérant à pratiquer une saisie .......... ;")]),
    emptyLine(),
    justifiedPara([text("- .........................................................................................................................")]),
    emptyLine(),
    justifiedPara([text("- Condamner le débiteur aux entiers dépens.")]),
    emptyLine(), emptyLine(),
    centerPara([bold("SOUS TOUTES RÉSERVES")]),
    ...blocSignatureAvocat(),
  ]);
}

// ══════════════════════════════════════════════
// GÉNÉRATION DES 13 FICHIERS
// ══════════════════════════════════════════════

async function generateAll() {
  const outputDir = __dirname;

  const templates = [
    { name: "Courrier.docx", builder: createCourrierTemplate },
    { name: "Assignation.docx", builder: createAssignationTemplate },
    { name: "Conclusion.docx", builder: createConclusionTemplate },
    { name: "Mise_en_Demeure.docx", builder: createMiseEnDemeureTemplate },
    { name: "Requete.docx", builder: createRequeteTemplate },
    { name: "Conclusions_Recapitulatives.docx", builder: createConclusionsRecapitulativesTemplate },
    { name: "Protocole_Accord_Transactionnel.docx", builder: createProtocoleAccordTemplate },
    { name: "Sommation_Interpellative.docx", builder: createSommationInterpellativeTemplate },
    { name: "Note_en_Delibere.docx", builder: createNoteDelibereTemplate },
    { name: "Declaration_Appel.docx", builder: createDeclarationAppelTemplate },
    { name: "Dire_et_Observations.docx", builder: createDireObservationsTemplate },
    { name: "Conclusions_Incident.docx", builder: createConclusionsIncidentTemplate },
    { name: "Requete_Saisie.docx", builder: createRequeteSaisieTemplate },
  ];

  for (const tpl of templates) {
    try {
      const doc = tpl.builder();
      const buffer = await Packer.toBuffer(doc);
      const outputPath = path.join(outputDir, tpl.name);
      fs.writeFileSync(outputPath, buffer);
      console.log(`[OK] ${tpl.name} généré`);
    } catch (err) {
      console.error(`[ERREUR] ${tpl.name}:`, err);
    }
  }

  console.log(`\n${templates.length} templates générés avec succès !`);
}

generateAll();
