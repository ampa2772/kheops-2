/********************************************/
/* presentationPartiesBuilder.js            */
/********************************************/

const { getBarreauName, buildBarreauComplet } = require('../data/barreaux');

/**
 * Formate les détails d'une partie (Personne Morale ou Personne Physique)
 * @param {object} partieData - Les données de la partie
 * @returns {string} La chaîne formatée pour cette partie
 */
function formatPartieDetails(partieData) {
  if (!partieData) return '';

  // Cas 1 : Personne Morale (détectée par la présence de 'raisonSociale')
  if (partieData.raisonSociale) {
    const raisonSociale = partieData.raisonSociale || '';
    const siegeVille = (partieData.ville || '').toUpperCase();
    const siegeAdresse = partieData.adresse || '';
    const siegeCP = partieData.codePostal || '';

    let str = `<strong>${raisonSociale}</strong>, situé ${siegeAdresse} - ${siegeCP} ${siegeVille}`;

    // Interlocuteur (si présent)
    if (partieData.interlocuteurNom && partieData.interlocuteurFonction) {
      const intNom = partieData.interlocuteurNom;
      const intPrenom = partieData.interlocuteurPrenom || '';
      const intFonction = partieData.interlocuteurFonction;
      str += `, prise en la personne de son ${intFonction}, M./Mme ${intPrenom} ${intNom}, domicilié en cette qualité audit siège`;
    }

    return str;
  }

  // Cas 2 : Personne Physique
  const civilite = partieData.genre === 'Masculin' ? 'Monsieur' : 'Madame';
  const nomMajuscules = (partieData.nom || '').toUpperCase();
  const nomComplet = `${partieData.prenoms || ''} ${nomMajuscules}`.trim();

  // né / née selon le genre
  const neLe = (partieData.genre === 'Féminin' || partieData.genre === 'Feminin') ? 'née le' : 'né le';

  let dateN = '()';
  if (partieData.dateNaissance) {
    const d = new Date(partieData.dateNaissance);
    if (!isNaN(d.getTime())) {
      dateN = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    }
  }

  const naissanceVille = (partieData.villeNaissance || '').toUpperCase();
  const cpNaissance = partieData.CP_VilleNaissance || '';
  const nationalite = partieData.nationalite || '';
  const adresse = partieData.adresse || '';
  const codePostal = partieData.codePostal || '';
  const ville = (partieData.ville || '').toUpperCase();

  // Ville de naissance avec code postal entre parenthèses si disponible
  const villeNaissanceStr = naissanceVille
    ? `à ${naissanceVille}${cpNaissance ? ' (' + cpNaissance + ')' : ''}`
    : '';

  return `<strong>${civilite}</strong> <strong>${nomComplet}</strong>, ${neLe} ${dateN} ${villeNaissanceStr}, de nationalité ${nationalite}, demeurant ${adresse} - ${codePostal} ${ville}`;
}

/**
 * Détermine l'accord grammatical pour le titre de partie et la ligne "Représenté par"
 * @param {Array} parties - Liste des parties
 * @param {string} baseMasculin - Ex: "Demandeur" ou "Défendeur"
 * @param {string} baseFeminin - Ex: "Demanderesse" ou "Défenderesse"
 * @param {string} basePluriel - Ex: "Demandeurs" ou "Défendeurs"
 * @returns {{ titrePartie: string, representePar: string }}
 */
function determinerAccordGrammatical(parties, baseMasculin, baseFeminin, basePluriel) {
  if (!parties || parties.length === 0) {
    return { titrePartie: basePluriel, representePar: 'Représentés par' };
  }

  if (parties.length > 1) {
    return { titrePartie: basePluriel, representePar: 'Représentés par' };
  }

  // Une seule partie
  const partieData = parties[0]?.partieData;
  if (!partieData) {
    return { titrePartie: baseMasculin, representePar: 'Représenté par' };
  }

  // Personne morale → féminin
  if (partieData.raisonSociale || partieData.denomination) {
    return { titrePartie: baseFeminin, representePar: 'Représentée par' };
  }

  // Personne physique féminine
  if (partieData.genre === 'Feminin' || partieData.genre === 'Féminin') {
    return { titrePartie: baseFeminin, representePar: 'Représentée par' };
  }

  // Personne physique masculine (défaut)
  return { titrePartie: baseMasculin, representePar: 'Représenté par' };
}

/**
 * Construit le nom complet d'un avocat avec le nom de famille en MAJUSCULES
 * @param {object} avocat - L'objet avocat (prenomOfficeUser, nomOfficeUser, prenoms, nom)
 * @returns {string} Le nom complet formaté (ex: "Pierre JALET")
 */
function formatNomAvocat(avocat) {
  if (!avocat) return '';

  const prenom = avocat.prenomOfficeUser || avocat.prenoms || '';
  const nom = avocat.nomOfficeUser || avocat.nom || '';
  const nomMajuscules = nom.toUpperCase();

  return `${prenom} ${nomMajuscules}`.trim();
}

/**
 * Construit la ligne "Représenté par Maître [nom], Avocat au Barreau de [barreau]"
 * @param {string} representePar - Ex: "Représenté par"
 * @param {string} nomAvocat - Nom complet de l'avocat (déjà formaté)
 * @param {string} villeAvocat - Ville de l'avocat (pour le lookup barreau)
 * @returns {string} La ligne complète
 */
function formatLigneAvocat(representePar, nomAvocat, villeAvocat) {
  const barreauComplet = buildBarreauComplet(getBarreauName(villeAvocat));
  return `${representePar} Maître ${nomAvocat}, ${barreauComplet}`;
}

/**
 * Construit la présentation des parties pour les documents juridiques.
 *
 * Format cible :
 *   [détails partie POUR],
 *   Demandeur (en italique)
 *   Représenté par Maître [nom], Avocat au Barreau de [barreau]
 *   CONTRE :
 *   [détails partie CONTRE],
 *   Défenderesse (en italique)
 *   Représentée par Maître [nom], Avocat au Barreau de [barreau]
 *
 * @param {object} dossier - L'objet dossier complet
 * @returns {string} La présentation formatée
 */
function buildPresentationParties(dossier) {
  let str = '';

  const partiesPour = dossier?.dossier?.parties?.pour || [];
  const partiesContre = dossier?.dossier?.parties?.contre || [];

  // -----------------------
  // BLOC A : Label "POUR :" en gras + Détails des parties POUR
  // -----------------------
  str += '<strong>POUR :</strong>\n\n';

  if (partiesPour.length > 0) {
    partiesPour.forEach((p) => {
      const details = formatPartieDetails(p?.partieData);
      if (details) {
        str += `${details},\n\n`;
      }
    });
  } else {
    str += '(Aucune partie pour)\n\n';
  }

  // -----------------------
  // BLOC B : Demandeur (italique) + Représenté par (avocat POUR)
  // -----------------------
  const accordPour = determinerAccordGrammatical(partiesPour, 'Demandeur', 'Demanderesse', 'Demandeurs');
  str += `<em>${accordPour.titrePartie}</em>\n\n`;

  // L'avocat POUR est l'avocat responsable du dossier (avocatsResponsables[0])
  const avocatPour = dossier?.dossier?.avocatsResponsables?.[0];
  if (avocatPour) {
    const nomAvocatPour = formatNomAvocat(avocatPour);
    const villeAvocatPour = avocatPour.city || '';
    str += `${formatLigneAvocat(accordPour.representePar, nomAvocatPour, villeAvocatPour)}\n\n`;
  }

  // -----------------------
  // BLOC C : CONTRE + détails des parties
  // -----------------------
  str += '\n<strong>CONTRE :</strong>\n\n';

  if (partiesContre.length > 0) {
    partiesContre.forEach((p) => {
      const details = formatPartieDetails(p?.partieData);
      if (details) {
        str += `${details},\n\n`;
      }
    });
  } else {
    str += '(Aucune partie contre)\n\n';
  }

  // -----------------------
  // BLOC D : Défendeur (italique) + Représenté par (avocats CONTRE)
  // -----------------------
  const accordContre = determinerAccordGrammatical(partiesContre, 'Défendeur', 'Défenderesse', 'Défendeurs');
  str += `<em>${accordContre.titrePartie}</em>\n\n`;

  // Les avocats CONTRE proviennent des avocats liés aux parties adverses
  // Sources : 'avocats' (BDD snapshot), 'linkedAvocats' (Redux), ou 'contacts' filtrés par type Avocat
  const avocatsContre = [];
  partiesContre.forEach((p) => {
    // Source 1 : tableau avocats dédié (snapshot BDD ou Redux)
    const listeAvocats = p.avocats || p.linkedAvocats || [];
    if (Array.isArray(listeAvocats)) {
      listeAvocats.forEach((av) => {
        const nomComplet = formatNomAvocat(av);
        if (nomComplet && !avocatsContre.find(a => a.nom === nomComplet)) {
          avocatsContre.push({
            nom: nomComplet,
            ville: av.city || av.ville || '',
          });
        }
      });
    }

    // Source 2 : contacts de type Avocat/Avocate (fallback robuste)
    const listeContacts = p.contacts || p.linkedContacts || [];
    if (Array.isArray(listeContacts)) {
      listeContacts.forEach((c) => {
        if (c.pro_contact && (c.type === 'Avocat' || c.type === 'Avocate')) {
          const nomComplet = formatNomAvocat(c);
          if (nomComplet && !avocatsContre.find(a => a.nom === nomComplet)) {
            avocatsContre.push({
              nom: nomComplet,
              ville: c.city || c.ville || '',
            });
          }
        }
      });
    }
  });

  if (avocatsContre.length > 0) {
    avocatsContre.forEach((av) => {
      str += `${formatLigneAvocat(accordContre.representePar, av.nom, av.ville)}\n\n`;
    });
  }
  // Si aucun avocat CONTRE, on n'affiche pas la ligne "Représenté par"

  return str;
}

module.exports = {
  buildPresentationParties,
};
