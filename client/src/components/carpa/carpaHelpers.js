// client/src/components/carpa/carpaHelpers.js
//
// Helpers UI pour le module CARPA (formattage, libelles, classes CSS d'etat).
// Sans dependance Redux : utilisable depuis n'importe quel composant.

export const formatMontant = (value, devise = 'EUR') => {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: devise || 'EUR',
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch (_e) {
    return `${Math.round(value || 0)} ${devise}`;
  }
};

export const formatDate = (d) => {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatDateTime = (d) => {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Libelle francais d'un etat
export const ETAT_LABELS = {
  brouillon: 'Brouillon',
  recu_cabinet: 'Recus au cabinet',
  depose_carpa: 'Deposes a la CARPA',
  controle_carpa: 'En controle CARPA',
  encaisse_definitif: 'Encaisses (bonne fin)',
  instruit_retrait: 'Retrait instruit',
  restitue: 'Restitues',
  compte_special_bloque: 'Bloques (compte special)',
  annule: 'Annulee',
};

export const etatLabel = (etat) => ETAT_LABELS[etat] || etat;

// Classe CSS d'etat (pour pastilles colorees)
export const etatClass = (etat) => {
  switch (etat) {
    case 'brouillon': return 'k-carpa-etat-brouillon';
    case 'recu_cabinet': return 'k-carpa-etat-attention';
    case 'depose_carpa': return 'k-carpa-etat-progres';
    case 'controle_carpa': return 'k-carpa-etat-progres';
    case 'encaisse_definitif': return 'k-carpa-etat-ok';
    case 'instruit_retrait': return 'k-carpa-etat-progres';
    case 'restitue': return 'k-carpa-etat-ok';
    case 'compte_special_bloque': return 'k-carpa-etat-bloque';
    case 'annule': return 'k-carpa-etat-annule';
    default: return 'k-carpa-etat-default';
  }
};

// Resume du beneficiaire (snapshot ou contact)
export const beneficiaireResume = (snapshot, contactId = null) => {
  if (!snapshot) return contactId ? 'Beneficiaire (lien rompu)' : 'Beneficiaire non specifie';
  if (snapshot.estAvocatTitulaire) return 'Cabinet (honoraires)';
  if (snapshot.contactType === 'morale' && snapshot.raisonSociale) return snapshot.raisonSociale;
  const fullName = `${snapshot.prenoms || ''} ${snapshot.nom || ''}`.trim();
  return fullName || snapshot.raisonSociale || 'Beneficiaire non specifie';
};

// Severite -> classe CSS
export const severiteClass = (severite) => {
  if (severite === 'critique') return 'k-carpa-alerte-critique';
  if (severite === 'attention') return 'k-carpa-alerte-attention';
  return 'k-carpa-alerte-info';
};

// Determine si une operation est terminee (lecture seule)
export const isTerminale = (etat) => ['encaisse_definitif', 'restitue', 'annule'].includes(etat);

// Liste des transitions disponibles a partir d'un etat (utilise les constantes serveur)
export const transitionsDisponibles = (operation, constants) => {
  if (!operation || !constants) return [];
  const map = operation.sens === 'entree' ? constants.transitionsEntree : constants.transitionsSortie;
  return map?.[operation.etat] || [];
};

// Test cote client : pieces requises completes ?
export const piecesCompletesClient = (operation) => {
  const requises = operation?.pieceCategoriesRequises || [];
  const fournies = (operation?.pieces || []).map(p => p.categoriePiece);
  for (const regle of requises) {
    const alternatives = String(regle).split('|');
    if (!alternatives.some(cat => fournies.includes(cat))) return false;
  }
  return true;
};

export const piecesManquantesClient = (operation) => {
  const requises = operation?.pieceCategoriesRequises || [];
  const fournies = (operation?.pieces || []).map(p => p.categoriePiece);
  return requises.filter((regle) => {
    const alternatives = String(regle).split('|');
    return !alternatives.some(cat => fournies.includes(cat));
  });
};
