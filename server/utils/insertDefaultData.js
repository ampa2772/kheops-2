// server/utils/insertDefaultData.js

const TemplateFile = require('../models/Fusion/TemplateFile');
const Profession = require('../models/Folder/Profession');
const metiersData = require('./Datas/metiers.json');

async function insertDefaultData() {
  try {
    // ===== 1. Insertion des templates de documents par défaut =====
    const defaultTemplates = [
      { name: 'Courrier', categorie: 'selectOneDestinataire' },
      { name: 'Mise_en_Demeure', categorie: 'selectOneDestinataire' },
      { name: 'Sommation_Interpellative', categorie: 'selectOneDestinataire' },
      { name: 'Dire_et_Observations', categorie: 'selectOneDestinataire' },
      { name: 'Assignation', categorie: 'allDos' },
      { name: 'Conclusion', categorie: 'allDos' },
      { name: 'Requete', categorie: 'allDos' },
      { name: 'Conclusions_Recapitulatives', categorie: 'allDos' },
      { name: 'Protocole_Accord_Transactionnel', categorie: 'allDos' },
      { name: 'Note_en_Delibere', categorie: 'allDos' },
      { name: 'Declaration_Appel', categorie: 'allDos' },
      { name: 'Conclusions_Incident', categorie: 'allDos' },
      { name: 'Requete_Saisie', categorie: 'allDos' },
    ];

    for (const tpl of defaultTemplates) {
      const existing = await TemplateFile.findOne({ name: tpl.name });
      if (!existing) {
        await new TemplateFile(tpl).save();
        console.log(`[insertDefaultData] Template par défaut inséré: "${tpl.name}" (${tpl.categorie})`);
      } else if (!existing.categorie || existing.categorie !== tpl.categorie) {
        // Mettre à jour la catégorie si elle a changé
        existing.categorie = tpl.categorie;
        await existing.save();
        console.log(`[insertDefaultData] Template "${tpl.name}" mis à jour avec catégorie: ${tpl.categorie}`);
      }
    }

    // ===== 2. Types de contacts =====
    // Plus d'insertion de types par defaut : le selecteur de type est
    // desormais un switch pro/client + dropdown ferme cote client.
    // Le modele TypeContact est conserve pour l'instant (pas de suppression
    // de collection Mongo) mais il n'est plus alimente ni consomme par l'app.

    // ===== 3. Insertion des professions par défaut (depuis metiers.json) =====
    const professionCount = await Profession.countDocuments();
    if (professionCount === 0 && metiersData.length > 0) {
      await Profession.insertMany(metiersData, { ordered: false });
      console.log(`[insertDefaultData] ${metiersData.length} professions insérées depuis metiers.json.`);
    }

    console.log('Toutes les données par défaut ont été insérées.');
  } catch (err) {
    console.error('Erreur lors de l\'insertion des données par défaut:', err.message);
  }
}

module.exports = insertDefaultData;
