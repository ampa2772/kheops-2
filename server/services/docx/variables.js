// server/services/docx/variables.js
//
// Assemblage des VARIABLES DE FUSION côté serveur (Phase 5).
// Porte les helpers PURS de l'app Electron (docUtils.formatDateInFrench /
// buildSimpleLetterVariables + presentationPartiesBuilder) afin que la route
// POST /api/word/:docId/generate puisse construire elle-même les mentions
// (parties, destinataire, avocat, barreau, date) à partir des données du dossier
// — sans dépendre d'Electron ni de Google Drive.

const { getBarreauName, buildBarreauComplet } = require('./barreaux');
const { buildPresentationParties } = require('./presentationPartiesBuilder');

/** Date en toutes lettres : "le 1 Juillet 2026" (copie de docUtils.formatDateInFrench). */
function formatDateInFrench(dateInput) {
  if (!dateInput) return '';
  const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    return `le ${d.getDate()} ${moisNoms[d.getMonth()]} ${d.getFullYear()}`;
  } catch (_err) {
    return '';
  }
}

/** Variables d'un courrier simple (1 destinataire) — copie de docUtils.buildSimpleLetterVariables. */
function buildSimpleLetterVariables(dossier, contact = {}, userProfile = null) {
  const vars = {};
  const isFeminin = contact.genre === 'Feminin' || contact.genre === 'Féminin';
  const civ = isFeminin ? 'Madame' : 'Monsieur';

  vars.civilite = civ;
  vars.nom = contact.nom || contact.raisonSociale || '';
  vars.prenom = contact.prenoms || '';
  vars.adresse = contact.adresse || '';
  vars.cp = contact.codePostal || '';
  vars.ville = contact.ville || '';
  vars.email = contact.email || '';

  const nom = contact.nom || '';
  const isJuridique = contact.profession &&
    (contact.profession.toLowerCase().includes('avocat') ||
      contact.profession.toLowerCase().includes('notaire') ||
      contact.profession.toLowerCase().includes('huissier'));
  const prenomContact = contact.prenoms || '';
  if (isJuridique) {
    vars.titre = `Maître ${`${prenomContact} ${nom}`.trim()}`;
  } else {
    vars.titre = `${civ} ${`${prenomContact} ${nom}`.trim()}`;
  }

  if (contact.appellationCourrier && contact.appellationCourrier !== 'Partie (Client / Adversaire)') {
    vars.appellation = contact.appellationCourrier;
  } else if (contact.profession && contact.profession.toLowerCase().includes('avocat')) {
    vars.appellation = isFeminin ? 'Ma chère consoeur' : 'Mon cher confrère';
  } else if (isJuridique) {
    vars.appellation = 'Maître';
  } else {
    vars.appellation = isFeminin ? 'Chère Madame' : 'Cher Monsieur';
  }
  vars.introCourier = vars.appellation;

  vars.referenceDossier = dossier?.reference || '';
  vars.nomDossier = dossier?.dossier?.dossier?.nom || '';
  vars.dateDuJour = formatDateInFrench(new Date());

  if (userProfile && (userProfile.firstName || userProfile.lastName)) {
    vars.nomAvocat = `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim();
    vars.villeCabinet = userProfile.city || '';
  } else {
    const avocatResp = dossier?.dossier?.avocatsResponsables?.[0];
    vars.villeCabinet = avocatResp?.city || '';
    vars.nomAvocat = `${avocatResp?.prenomOfficeUser || ''} ${avocatResp?.nomOfficeUser || ''}`.trim();
  }
  const barreauNom = getBarreauName(vars.villeCabinet, userProfile?.barreau);
  vars.barreauComplet = buildBarreauComplet(barreauNom);
  return vars;
}

/** Variables avocat (présentation des parties / 0 ou plusieurs destinataires). */
function buildAvocatVars(dossier, userProfile) {
  let nomAvocat;
  let villeCabinet;
  if (userProfile && (userProfile.firstName || userProfile.lastName)) {
    nomAvocat = `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim();
    villeCabinet = userProfile.city || '';
  } else {
    const avocatResp = dossier?.dossier?.avocatsResponsables?.[0];
    villeCabinet = avocatResp?.city || '';
    nomAvocat = `${avocatResp?.prenomOfficeUser || ''} ${avocatResp?.nomOfficeUser || ''}`.trim();
  }
  const barreauComplet = buildBarreauComplet(getBarreauName(villeCabinet, userProfile?.barreau));
  return { nomAvocat, villeCabinet, barreauComplet };
}

/**
 * Construit l'objet de variables à injecter dans le modèle, à partir des données
 * fournies (dossier, destinataires, profil avocat). Reproduit la logique de
 * l'app Electron (docGenerator) : 0 destinataire / 1 destinataire / 2+.
 *
 * @param {object} clientData  { dossier, recipients, userProfile }
 * @returns {object}
 */
function buildDocumentVariables(clientData = {}) {
  const recipients = clientData.recipients || [];
  const dossier = clientData.dossier;
  const userProfile = clientData.userProfile || null;

  if (!dossier) {
    return { dateDuJour: formatDateInFrench(new Date()) };
  }

  if (recipients.length === 1) {
    const r = recipients[0]?.fullObject || recipients[0] || {};
    return buildSimpleLetterVariables(dossier, r, userProfile);
  }

  // 0 ou 2+ destinataires → présentation des parties
  return {
    presentationParties: buildPresentationParties(dossier),
    referenceDossier: dossier?.reference || '',
    nomDossier: dossier?.dossier?.dossier?.nom || '',
    dateDuJour: formatDateInFrench(new Date()),
    ...buildAvocatVars(dossier, userProfile),
  };
}

module.exports = {
  formatDateInFrench,
  buildSimpleLetterVariables,
  buildDocumentVariables,
};
