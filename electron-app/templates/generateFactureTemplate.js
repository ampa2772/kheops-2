/**
 * Script de génération du template Word pour la facture.
 *
 * Variables docxtemplater :
 *   {nom_cabinet}, {adresse_cabinet}, {cp_ville_cabinet}, {tel_cabinet}, {email_cabinet}
 *   {destinataire_nom_complet}, {destinataire_adresse}, {destinataire_cp_ville}
 *   {date_facture}, {numero_facture}
 *   {nom_dossier}, {reference_dossier}
 *   {#lignes_facture} {date_prestation} {description} {quantite} {prix_unitaire_ht} {total_ht} {/lignes_facture}
 *   {total_ht_global}, {taux_tva}, {montant_tva}, {total_ttc}
 *   {iban_cabinet}, {bic_cabinet}
 */

const {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} = require("docx");
const fs = require("fs");
const path = require("path");

const PAGE_MARGINS = { top: 1417, bottom: 1417, left: 1417, right: 1417 };

function text(content, options = {}) {
  return new TextRun({ text: content, ...options });
}

function para(runs, alignment = AlignmentType.LEFT) {
  const children = Array.isArray(runs) ? runs : [runs];
  return new Paragraph({ children, alignment });
}

function leftPara(content) { return para([text(content)], AlignmentType.LEFT); }
function rightPara(content) { return para([text(content)], AlignmentType.RIGHT); }
function emptyLine() { return new Paragraph({ children: [text("")] }); }

function cell(content, width) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    children: [new Paragraph({ children: [text(content)] })],
  });
}

function buildTable() {
  const headerRow = new TableRow({
    children: [
      cell("Date", 2960),
      cell("Description", 1248),
      cell("Quantité", 1005),
      cell("Prix U. HT", 1581),
      cell("Total HT", 2268),
    ],
  });

  const loopRow = new TableRow({
    children: [
      cell("{#lignes_facture}{date_prestation}", 2960),
      cell("{description}", 1248),
      cell("{quantite}", 1005),
      cell("{prix_unitaire_ht}", 1581),
      cell("{total_ht}{/lignes_facture}", 2268),
    ],
  });

  return new Table({
    width: { size: 9062, type: WidthType.DXA },
    rows: [headerRow, loopRow],
  });
}

function createFactureTemplate() {
  return new Document({
    creator: "Kheops 2",
    title: "Template Facture",
    description: "Modèle de facture d'honoraires",
    sections: [{
      properties: { page: { margin: PAGE_MARGINS } },
      children: [
        // En-tête cabinet (gauche)
        leftPara("{nom_cabinet}"),
        leftPara("{adresse_cabinet}"),
        leftPara("{cp_ville_cabinet}"),
        leftPara("Tél : {tel_cabinet}"),
        leftPara("Email : {email_cabinet}"),
        emptyLine(),
        leftPara("--------------------------------------------------------------------------------------------------"),
        emptyLine(),
        // Destinataire (DROITE)
        rightPara("{destinataire_nom_complet}"),
        rightPara("{destinataire_adresse}"),
        rightPara("{destinataire_cp_ville}"),
        emptyLine(),
        // Date et N° facture (DROITE)
        rightPara("Date : {date_facture}"),
        rightPara("Facture N° : {numero_facture}"),
        emptyLine(),
        emptyLine(),
        // Objet & référence (gauche)
        leftPara("Objet : Honoraires pour le dossier \"{nom_dossier}\""),
        leftPara("Référence : {reference_dossier}"),
        emptyLine(),
        emptyLine(),
        leftPara("Monsieur, Madame,"),
        emptyLine(),
        leftPara("Veuillez trouver ci-dessous le détail des prestations effectuées dans le cadre du dossier référencé ci-dessus :"),
        emptyLine(),
        emptyLine(),
        buildTable(),
        emptyLine(),
        emptyLine(),
        // Totaux (DROITE pour cohérence)
        rightPara("Total HT      : {total_ht_global}"),
        rightPara("TVA ({taux_tva} %) : {montant_tva}"),
        rightPara("TOTAL TTC     : {total_ttc}"),
        emptyLine(),
        emptyLine(),
        leftPara("Nous vous remercions de votre confiance."),
        emptyLine(),
        leftPara("Cordialement,"),
        emptyLine(),
        leftPara("Le {nom_cabinet}"),
        emptyLine(),
        leftPara("--------------------------------------------------------------------------------------------------"),
        leftPara("Modalités de paiement : Virement bancaire"),
        leftPara("IBAN : {iban_cabinet}"),
        leftPara("BIC : {bic_cabinet}"),
      ],
    }],
  });
}

async function generate() {
  try {
    const doc = createFactureTemplate();
    const buffer = await Packer.toBuffer(doc);
    const outputPath = path.join(__dirname, "template_facture.docx");
    fs.writeFileSync(outputPath, buffer);
    console.log(`[OK] template_facture.docx généré : ${outputPath}`);
  } catch (err) {
    console.error(`[ERREUR] Génération template_facture.docx :`, err);
    process.exit(1);
  }
}

generate();
