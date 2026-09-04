// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_34 - Copie\Kheops_2\client\src\components\dashboard\office\createDossier\createPartie\utils\partiesHelpers.js
/* utilitaires mutualisés */

/**
 * Vérifie si deux tableaux d'objets (contenant une clé _id) sont égaux.
 * L'ordre des éléments n'importe pas. Gère les cas null/undefined.
 */
export const arraysAreEqual = (arr1 = [], arr2 = []) => {
  if (arr1 === arr2) return true; // Strictement la même référence
  if (!arr1 || !arr2 || arr1.length !== arr2.length) return false; // L'un est null/undefined ou longueurs différentes

  // Si les deux tableaux sont vides, ils sont considérés égaux
  if (arr1.length === 0 && arr2.length === 0) return true;

  // Vérifie que chaque élément a bien un _id avant de mapper/trier
  if (!arr1.every(item => item && typeof item._id !== 'undefined') ||
      !arr2.every(item => item && typeof item._id !== 'undefined')) {
     console.warn("arraysAreEqual: Un ou plusieurs éléments n'ont pas de propriété '_id'. Comparaison impossible.", arr1, arr2);
     return false; // Ne peut pas comparer si _id manque
  }

  const ids1 = arr1.map(i => i._id).sort();
  const ids2 = arr2.map(i => i._id).sort();

  return ids1.every((id, idx) => id === ids2[idx]);
};

/**
 * Trouve l'intersection d'un tableau de tableaux d'objets basés sur leur _id.
 * @param {Array<Array<object>>} arrays - Un tableau contenant les tableaux à intersecter.
 * @returns {Array<object>} - Un tableau contenant les objets présents dans TOUS les tableaux d'entrée.
 */
// Nouveau code
export const intersectArrays = (arrays = []) => {
    if (!Array.isArray(arrays) || arrays.length === 0) {
        return [];
    }

    // Helper pour s'assurer que les éléments ont un _id
    const hasId = (item) => item && typeof item._id !== 'undefined';

    // Nettoyer et valider chaque array :
    // - Si un élément n'est pas un tableau, il est traité comme un tableau vide.
    // - Dans chaque tableau, on ne garde que les items qui ont un _id.
    const cleanedArrays = arrays.map(arr => {
        if (!Array.isArray(arr)) return [];
        return arr.filter(hasId);
    });

    // Si après ce nettoyage :
    // - Il n'y a plus de tableaux (parce que l'entrée `arrays` était vide ou ne contenait que des non-tableaux),
    // - OU s'il y avait plusieurs tableaux à l'origine ET au moins un d'entre eux est devenu vide après nettoyage,
    // alors l'intersection est nécessairement vide.
    if (cleanedArrays.length === 0 || (cleanedArrays.length > 0 && cleanedArrays.some(arr => arr.length === 0))) {
        // S'il n'y a qu'un seul tableau à l'origine et qu'il est vide (ou devient vide), l'intersection est vide.
        // S'il y a plusieurs tableaux et qu'au moins un est vide, l'intersection est vide.
        return [];
    }
    
    // Si un seul tableau reste (et il n'est pas vide), l'intersection est ce tableau lui-même.
    if (cleanedArrays.length === 1) {
        return [...cleanedArrays[0]]; // Retourner une copie pour éviter les modifications par référence
    }

    // Commencer avec les IDs du premier tableau comme base pour l'intersection.
    // Convertir les IDs en string pour une comparaison robuste, car les ObjectIds de Mongoose
    // peuvent ne pas être égaux avec `===` même s'ils représentent le même ID.
    let intersectionIds = new Set(cleanedArrays[0].map(item => item._id.toString()));

    // Itérer sur les tableaux restants
    for (let i = 1; i < cleanedArrays.length; i++) {
        const currentArrayIds = new Set(cleanedArrays[i].map(item => item._id.toString()));
        
        // Garder seulement les IDs présents dans l'intersection actuelle ET dans le tableau courant
        intersectionIds = new Set(
            [...intersectionIds].filter(id => currentArrayIds.has(id))
        );
        
        // Optimisation: si à un moment l'intersection devient vide, on peut arrêter
        if (intersectionIds.size === 0) {
            break;
        }
    }

    // Si l'intersection finale d'IDs est vide, retourner un tableau vide.
    if (intersectionIds.size === 0) {
        return [];
    }

    // Reconstruire la liste des objets contacts à partir des IDs intersectés.
    // On prend les objets du premier tableau (cleanedArrays[0]) qui correspondent aux IDs finaux.
    // Cela permet de conserver les données complètes des objets.
    return cleanedArrays[0].filter(item => intersectionIds.has(item._id.toString()));
};

/**
 * Prépare les données nécessaires au changement de camp d'une partie.
 * Les relations sont copiées explicitement afin que le cycle historique
 * suppression/réinsertion ne perde ni les contacts, ni les rôles d'avocat.
 */
/**
 * Extrait, depuis la réponse d'une route d'autosauvegarde
 * (addLinkedContactToParty / removeLinkedContactFromParty), les relations
 * réellement persistées pour une partie. Retourne null si la réponse ne
 * contient pas le dossier ou la partie (ancien serveur, erreur réseau).
 */
export const extractPartyRelationsFromResponse = (responseData, partyId) => {
  // Forme privilégiée : relations déjà filtrées par l'accès cabinet côté serveur.
  const filtered = responseData?.partyRelations;
  if (filtered && (Array.isArray(filtered.avocats) || Array.isArray(filtered.contacts))) {
    return {
      avocats: Array.isArray(filtered.avocats) ? filtered.avocats : [],
      contacts: Array.isArray(filtered.contacts) ? filtered.contacts : [],
    };
  }
  const parties = responseData?.dossier?.dossier?.parties;
  if (!parties || !partyId) return null;
  const all = [
    ...(Array.isArray(parties.pour) ? parties.pour : []),
    ...(Array.isArray(parties.contre) ? parties.contre : []),
  ];
  const party = all.find((p) => String(p?.idPartie || p?.partieData?._id || '') === String(partyId));
  if (!party) return null;
  return {
    avocats: Array.isArray(party.avocats) ? party.avocats : [],
    contacts: Array.isArray(party.contacts) ? party.contacts : [],
  };
};

export const buildPartieMovePayload = (partie = {}) => {
  const cloneRelations = (items) => (Array.isArray(items)
    ? items.map((item) => (
        item && typeof item === 'object' ? { ...item } : item
      ))
    : []);

  return {
    contactData: {
      _id: partie.idPartie ?? partie._id,
      nomPartie: partie.nomPartie,
      ...(partie.partieData || {}),
    },
    linkedContacts: cloneRelations(partie.linkedContacts ?? partie.contacts),
    linkedAvocats: cloneRelations(partie.linkedAvocats ?? partie.avocats),
  };
};

/* ─────────────── formateurs de libellés ─────────────── */

/**
 * Formate le nom/raison sociale d'un contact pour affichage.
 * Gère les personnes physiques, morales (privées/publiques).
 * Ajoute "(Avocat)" si le contact est un avocat.
 */
export const formatContact = (c = {}) => {
  if (!c) return '';

  let isAvocatFlag = false;
  // Détection si c'est un avocat
  if (
    (c.pro_contact && (c.type === 'Avocat' || c.type === 'Avocate')) || // Pour les contacts de type 'contact' (Personne Physique)
    (c.isAvocat === true) || // Pour les officeUsers où 'isAvocat' est explicitement true
    (c.roleOfficeUser && (c.roleOfficeUser.toLowerCase().includes('avocat') || c.roleOfficeUser.toLowerCase().includes('avocate'))) // Pour les officeUsers basés sur le rôle
  ) {
    isAvocatFlag = true;
  }

  let baseName = '';
  let typeSuffix = isAvocatFlag ? " (Avocat)" : "";

  // Construire le nom de base
  if (c.nom && c.prenoms) { // Cas: Personne Physique (peut être un avocat ou autre)
    baseName = `${c.nom} ${c.prenoms}`;
    // Si ce n'est PAS un avocat mais un autre type de pro_contact, on affiche ce type.
    // Le suffixe (Avocat) est déjà géré par typeSuffix.
    if (!isAvocatFlag && c.pro_contact && c.type) {
      typeSuffix = ` (${c.type})`;
    }
    if (c.nom_de_naissance) {
      baseName += ` né(e) ${c.nom_de_naissance}`;
    }
  } else if (c.raisonSociale) { // Cas: Personne Morale Privée
    baseName = `${c.raisonSociale}${c.villePM ? ` ${c.villePM}` : ''}`;
    // Une PM n'est généralement pas "un avocat" en tant qu'entité elle-même,
    // donc on n'ajoute pas (Avocat) sauf si la structure le permettrait (non géré ici).
    // On annule typeSuffix car il serait (Avocat) ou (AutreType) si la logique précédente l'avait défini,
    // ce qui n'est pas pertinent pour une PM.
    typeSuffix = "";
  } else if (c.denomination) { // Cas: Personne Morale Publique
    baseName = `${c.denomination}${c.ville ? ` ${c.ville}` : ''}`;
    typeSuffix = ""; // Idem, pas de suffixe de type pour PM.
  } else if (c.nomOfficeUser && c.prenomOfficeUser) { // Cas: OfficeUser (souvent avocat)
    // Le nom est construit, et typeSuffix (qui sera "(Avocat)" si isAvocatFlag est true) sera ajouté.
    baseName = `${c.nomOfficeUser} ${c.prenomOfficeUser}`;
    // Si c'est un avocat détecté (isAvocatFlag = true), typeSuffix est déjà "(Avocat)".
    // Si ce n'est pas un avocat OfficeUser, typeSuffix est "". On n'ajoute pas "Me" non plus.
  } else if (c.nom && !c.prenoms) { // Cas: Fallback pour un nom seul (ex: un cabinet d'avocat PM sans 'raisonSociale')
    baseName = c.nom;
    // Si c'est une structure comme {nom: "Cabinet Dupont Avocats", type: "Avocat"} (improbable mais pour être sûr)
    // et que `isAvocatFlag` est true à cause de `c.type === 'Avocat'`,
    // `typeSuffix` serait `(Avocat)`. Sinon, il sera vide.
    // Normalement, un cabinet serait une PM, donc pas de suffixe.
    if (!isAvocatFlag && !(c.raisonSociale || c.denomination || (c.nomOfficeUser && c.prenomOfficeUser) || (c.nom && c.prenoms) )) {
        // Si on arrive ici, c'est un "nom seul" et on ne sait pas si c'est une personne physique.
        // Pour éviter d'afficher (Avocat) pour un cabinet, on annule typeSuffix.
        typeSuffix = "";
    }
  } else {
    return ''; // Pas de nom identifiable.
  }

  return `${baseName.trim()}${typeSuffix}`.trim();
};

/**
 * Formate le nom/raison sociale d'un contact PRO (n'inclut pas le type spécifique
 * de pro_contact, SAUF si c'est un avocat où "(Avocat)" sera affiché).
 */
export
const formatProContact = (c = {}) => {
  // Crée une copie pour éviter de modifier l'objet original si on doit forcer c.type à undefined
  const contactCopy = { ...c };
  let isAvocatForProContact = false;

  // Vérifie si c'est un avocat (avant de potentiellement supprimer c.type)
  if (
    (contactCopy.pro_contact && (contactCopy.type === 'Avocat' || contactCopy.type === 'Avocate')) ||
    (contactCopy.isAvocat === true) ||
    (contactCopy.roleOfficeUser && (contactCopy.roleOfficeUser.toLowerCase().includes('avocat') || contactCopy.roleOfficeUser.toLowerCase().includes('avocate')))
  ) {
    isAvocatForProContact = true;
  }

  // Si ce n'est PAS un avocat, on supprime le champ 'type' pour que formatContact ne l'affiche pas.
  // Si c'EST un avocat, on le laisse, car formatContact le gérera pour afficher "(Avocat)".
  if (!isAvocatForProContact && contactCopy.pro_contact && contactCopy.type) {
    contactCopy.type = undefined;
  }
  // Si c'est un avocat, le type "Avocat" ou "Avocate" (si présent) sera utilisé par formatContact.

  return formatContact(contactCopy);
};


/**
 * Obtient les initiales d'un nom (max 2).
 */
export
const getInitials = (name = '') => {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .split(' ')
    .map(p => p.charAt(0).toUpperCase())
    .filter(char => char.match(/[A-Z]/i)) // Garde seulement les lettres pour éviter les initiales bizarres
    .join('')
    .slice(0, 2);
}
