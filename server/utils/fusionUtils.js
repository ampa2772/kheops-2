// server/utils/fusionUtils.js

// Import du modèle TemplateFile (toujours utile pour findTemplateByName)
const TemplateFile = require("../models/Fusion/TemplateFile");

/**
 * Rechercher la liste des templates selon un nom.
 * Utilisée par la route POST /fusion/getTemplates.
 */
async function findTemplateByName(name) {
  try {
    // Recherche insensible à la casse, ancrée au début du nom
    const existingTemplates = await TemplateFile.find({
      name: { $regex: `^${name}`, $options: 'i' },
    });
    return existingTemplates;
  } catch (error) {
    console.error("Error finding template by name:", error);
    throw error;
  }
}


module.exports = {
  findTemplateByName,
  // createdDatabaseEntryFromTemplateFile, // Commentez ou supprimez si non nécessaire
};
