const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const Store = require('electron-store');
const configManager = require('./configManager');

function getConnectedUserEmail() {
  try {
    const store = new Store();
    const profile = store.get('user_profile');
    return (profile && profile.email) ? profile.email : "contact@kheops-avocats.fr";
  } catch (_) {
    return "contact@kheops-avocats.fr";
  }
}

/**
 * Construit l'objet JSON final pour le template Docxtemplater.
 * @param {object} dossier - L'objet dossier.
 * @param {object} client - Les informations du client.
 * @param {Array<object>} allLines - Toutes les lignes de facturation.
 * @param {object} totals - Objet contenant totalHT, amountTVA, totalTTC.
 * @param {number} vatRate - Le taux de TVA.
 * @param {object} activeInvoice - La facture active existante ou nouvelle.
 * @param {object} [userProfile] - Le profil de l'avocat connecté (Identité).
 * @returns {object} - Le JSON prêt pour Docxtemplater.
 */
function buildInvoiceJson(dossier, client, allLines, totals, vatRate, activeInvoice, userProfile) {
  const { totalHT, amountTVA, totalTTC } = totals;
  const totalPaid = (activeInvoice.payments || []).reduce((sum, p) => sum + p.amount, 0);
  const remainingToPay = totalTTC - totalPaid;

  const profile = userProfile || {};
  const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
  const cabinetLabel = fullName ? `Cabinet ${fullName}` : "Cabinet d'Avocats KHEOPS";

  return {
    nom_cabinet: cabinetLabel,
    adresse_cabinet: profile.address || "123 Rue de la Justice",
    cp_ville_cabinet: profile.city || "75001 PARIS",
    tel_cabinet: profile.phone || "01 23 45 67 89",
    email_cabinet: getConnectedUserEmail(),
    destinataire_nom_complet: client.nom,
    destinataire_adresse: client.adresse,
    destinataire_cp_ville: `${client.codePostal} ${client.ville}`,
    numero_facture: `FACT-${dossier.reference}-${activeInvoice._id.toString().slice(-6)}`,
    date_facture: new Date().toLocaleDateString('fr-FR'),
    nom_dossier: dossier.dossier.dossier.nom,
    reference_dossier: dossier.reference,
    lignes_facture: allLines.map(line => ({
      ...line,
      date_prestation: new Date(line.date_prestation).toLocaleDateString('fr-FR'),
      // MODIFICATION: Ajout du symbole €
      prix_unitaire_ht: `${line.prix_unitaire_ht.toFixed(2).replace('.', ',')} €`,
      total_ht: `${line.total_ht.toFixed(2).replace('.', ',')} €`
    })),
    // MODIFICATION: Ajout du symbole € à tous les totaux pour la cohérence
    total_ht_global: `${totalHT.toFixed(2).replace('.', ',')} €`,
    taux_tva: vatRate.toFixed(2), // Le taux reste un pourcentage sans symbole
    montant_tva: `${amountTVA.toFixed(2).replace('.', ',')} €`,
    total_ttc: `${totalTTC.toFixed(2).replace('.', ',')} €`,
    total_paye: `${totalPaid.toFixed(2).replace('.', ',')} €`,
    restant_a_payer: `${remainingToPay.toFixed(2).replace('.', ',')} €`,
    iban_cabinet: "FR76 3000 4000 0500 0012 3456 789",
    bic_cabinet: "BNPAFRPPXXX"
  };
}

/**
 * Génère le fichier .docx à partir du template et des données.
 * @param {object} data - Les données JSON pour le template.
 * @param {string} dossierId - L'ID du dossier pour le chemin de sortie.
 * @returns {{outputPath: string, finalFileName: string}}
 */
function generateDocx(data, dossierId) {
  const templatePath = path.resolve(__dirname, '..', 'templates', 'template_facture.docx');
  if (!fs.existsSync(templatePath)) throw new Error(`Template de facture non trouvé: ${templatePath}`);

  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  doc.setData(data);
  doc.render();

  const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });

  const rootPath = configManager.getLocalRootPath() || path.resolve('C:\\', 'Files_Clients');
  const outputDir = path.join(rootPath, dossierId.toString());
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const finalFileName = `Facture_${data.numero_facture}.docx`;
  const outputPath = path.join(outputDir, finalFileName);
  fs.writeFileSync(outputPath, buf);

  return { outputPath, finalFileName };
}

module.exports = {
  buildInvoiceJson,
  generateDocx,
};