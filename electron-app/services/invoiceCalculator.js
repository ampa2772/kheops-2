const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const configManager = require('./configManager');

/**
 * Calcule les lignes de facturation pour les événements.
 * @param {Array<object>} events - La liste des événements à facturer.
 * @param {number} hourlyRate - Le taux horaire.
 * @returns {Array<object>} - Un tableau de lignes de facturation.
 */
function calculateEventLines(events, hourlyRate) {
  if (!events || events.length === 0) return [];
  
  return events.map(event => {
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationHours = durationMs > 0 ? durationMs / (1000 * 60 * 60) : 0;
    const priceHT = durationHours * hourlyRate;
    
    const durationMinutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;
    const durationDisplay = `${hours}h${minutes.toString().padStart(2, '0')}`;
    
    return {
      id: event._id,
      type: 'event',
      date_prestation: startDate.toISOString(),
      description: `Événement : ${event.title}`,
      quantite: durationDisplay,
      prix_unitaire_ht: hourlyRate,
      total_ht: priceHT,
    };
  });
}

/**
 * Calcule les lignes de facturation pour les documents en se basant sur le nombre de caractères.
 * @param {Array<object>} documents - La liste des documents à facturer.
 * @param {number} hourlyRate - Le taux horaire.
 * @returns {Promise<Array<object>>} - Une promesse qui résout avec un tableau de lignes de facturation.
 */
async function calculateDocumentLines(documents, hourlyRate) {
  if (!documents || documents.length === 0) return [];
  
  const lines = [];
  for (const doc of documents) {
    const rootPath = configManager.getLocalRootPath() || path.join('C:\\', 'Files_Clients');
    const localPath = path.join(rootPath, doc._id.toString(), doc.nomDocument);
    
    if (fs.existsSync(localPath) && doc.nomDocument.toLowerCase().endsWith('.docx')) {
      try {
        const result = await mammoth.extractRawText({ path: localPath });
        const charCount = (result.value || '').length;
        const typingSpeedCharsPerMin = 200;
        const minutesToType = charCount / typingSpeedCharsPerMin;
        const hoursToType = minutesToType / 60;
        const priceHT = hoursToType * hourlyRate;
        const docDate = new Date(doc.dateCreation);
        
        lines.push({
          id: doc._id,
          type: 'document',
          date_prestation: docDate.toISOString(),
          description: `Document : ${doc.nomDocument.replace(/\.(docx|pdf|doc|rtf)$/i, '')}`,
          quantite: "1",
          prix_unitaire_ht: priceHT,
          total_ht: priceHT,
        });
      } catch (err) {
        console.warn(`[invoiceCalculator] Erreur de lecture Mammoth pour ${doc.nomDocument}:`, err);
      }
    }
  }
  return lines;
}

/**
 * Calcule les totaux de la facture.
 * @param {Array<object>} allLines - Toutes les lignes facturables.
 * @param {number} vatRate - Le taux de TVA.
 * @returns {{totalHT: number, amountTVA: number, totalTTC: number}}
 */
function calculateTotals(allLines, vatRate) {
    const totalHT = allLines.reduce((sum, line) => sum + line.total_ht, 0);
    const amountTVA = totalHT * (vatRate / 100);
    const totalTTC = totalHT + amountTVA;
    
    return { totalHT, amountTVA, totalTTC };
}

module.exports = {
  calculateEventLines,
  calculateDocumentLines,
  calculateTotals,
};