const axios = require('axios');
const SERVER_URL = process.env.SERVER_URL || "http://localhost:5000";

/**
 * Récupère les données complètes du dossier et tous les événements associés.
 * @param {string} dossierId - L'ID du dossier.
 * @param {string} token - Le token d'authentification.
 * @returns {Promise<{dossier: object, allEvents: object[]}>}
 */
async function fetchDossierAndEvents(dossierId, token) {
  if (!dossierId || !token) throw new Error("ID de dossier ou token manquant pour le fetch.");
  
  const config = { headers: { Authorization: `Bearer ${token}` } };
  
  const dossierRes = await axios.get(`${SERVER_URL}/api/folder/dossier/${dossierId}`, config);
  const dossier = dossierRes.data;
  if (!dossier) throw new Error("Dossier non trouvé.");

  const eventsRes = await axios.get(`${SERVER_URL}/api/agenda/dossier/${dossierId}`, config);
  const allEvents = eventsRes.data || [];
  
  return { dossier, allEvents };
}

/**
 * Extrait les éléments facturables (événements, documents) et les informations client.
 * Un élément est facturable s'il n'est pas déjà sur une facture archivée.
 * @param {object} dossier - L'objet dossier complet.
 * @param {Array<object>} allEvents - Tous les événements du dossier.
 * @returns {{billableDocuments: object[], billableEvents: object[], client: object}}
 */
function extractBillableItems(dossier, allEvents) {
  const archivedInvoices = (dossier.factures || []).filter(inv => inv.status === 'archived');
  
  const billedArchivedItemIds = new Set(
    archivedInvoices.flatMap(inv => (inv.billedItems || []).map(item => item.id.toString()))
  );

  const billableDocuments = (dossier.dossier?.documents || [])
    .filter(d => 
      d.categorie !== 'dropped' &&
      d.categorie !== 'facture' &&
      d.categorie !== 'email_body' &&       // AJOUT : Exclure le corps des e-mails
      d.categorie !== 'email_attachment' && // AJOUT : Exclure les pièces jointes des e-mails
      !billedArchivedItemIds.has(d._id.toString())
    );

  const billableEvents = (allEvents || [])
    .filter(event => 
      (event.type === 'event' || !event.type) && 
      !billedArchivedItemIds.has(event._id.toString())
    );

  const clientData = dossier.dossier?.parties?.pour?.[0]?.partieData || { nom: "Client non défini", adresse: "", codePostal: "", ville: "" };
  const client = {
    nom: clientData.raisonSociale || `${clientData.prenoms || ''} ${clientData.nom || ''}`.trim(),
    adresse: clientData.adresse || "",
    codePostal: clientData.codePostal || "",
    ville: clientData.ville || ""
  };

  return { billableDocuments, billableEvents, client };
}

module.exports = {
  fetchDossierAndEvents,
  extractBillableItems,
};