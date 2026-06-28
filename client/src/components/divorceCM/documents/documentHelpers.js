// client/src/components/divorceCM/documents/documentHelpers.js
//
// Helpers partages pour la generation des documents juridiques du module
// divorce par consentement mutuel. Tout est isole ici pour pouvoir tester
// la mise en forme independamment des composants.

// ----- Date au format long ("le 12 mars 2026") ---------------------------
export const formatDateLongue = (d) => {
  if (!d) return '__________';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '__________';
  const mois = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  return `${date.getDate()} ${mois[date.getMonth()]} ${date.getFullYear()}`;
};

// ----- Date au format court ("12/03/2026") -------------------------------
export const formatDateCourte = (d) => {
  if (!d) return '__________';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '__________';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// ----- Lieu et date de signature -----------------------------------------
export const lieuDateSignature = (lieu, date) => {
  return `Fait a ${lieu || '__________'}, le ${formatDateLongue(date)}`;
};

// ----- Identite civile complete d'un epoux (en bloc) ---------------------
//  Format normalise pour le preambule de la convention :
//    "Monsieur/Madame [Prenoms] [Nom],
//    ne(e) le ___ a ___ ([pays]),
//    de nationalite [...],
//    [profession],
//    demeurant [...]"
export const identiteEpouxBloc = (epoux) => {
  if (!epoux) return '__________';
  const lignes = [];

  // Ligne 1 : civilite + prenoms + nom
  const titre = epoux.civilite || '__________';
  const prenoms = epoux.prenoms || '__________';
  const nom = epoux.nom || '__________';
  let ligne1 = `${titre} ${prenoms} ${nom}`;
  if (epoux.nomDeNaissance && epoux.nomDeNaissance !== epoux.nom) {
    ligne1 += `, nee ${epoux.nomDeNaissance}`;
  }
  lignes.push(ligne1 + ',');

  // Ligne 2 : naissance
  const accord = epoux.civilite === 'Mme' ? 'nee' : 'ne';
  const dateN = formatDateLongue(epoux.dateNaissance);
  const lieuN = epoux.lieuNaissance || '__________';
  const paysN = epoux.paysNaissance && epoux.paysNaissance !== 'France' ? ` (${epoux.paysNaissance})` : '';
  lignes.push(`${accord} le ${dateN} a ${lieuN}${paysN},`);

  // Ligne 3 : nationalite
  const nat = epoux.nationalite || 'francaise';
  const accordNat = epoux.civilite === 'Mme' ? 'de nationalite' : 'de nationalite';
  lignes.push(`${accordNat} ${nat},`);

  // Ligne 4 : profession
  if (epoux.profession) {
    lignes.push(`exercant la profession de ${epoux.profession},`);
  }

  // Ligne 5 : adresse
  const adresseParts = [];
  if (epoux.adresse) adresseParts.push(epoux.adresse);
  const villePart = [epoux.codePostal, epoux.ville].filter(Boolean).join(' ');
  if (villePart) adresseParts.push(villePart);
  if (epoux.pays && epoux.pays !== 'France') adresseParts.push(epoux.pays);
  const adresseStr = adresseParts.length > 0 ? adresseParts.join(', ') : '__________';
  lignes.push(`demeurant ${adresseStr}.`);

  return lignes.join('\n');
};

// ----- Identite avocat complete -----------------------------------------
export const identiteAvocatBloc = (avocat) => {
  if (!avocat || !avocat.nom) return '__________';
  const lignes = [];
  const titre = avocat.civilite === 'Mme' ? 'Maitre' : 'Maitre';
  const prenoms = avocat.prenoms || '';
  const nom = avocat.nom || '__________';
  lignes.push(`${titre} ${prenoms} ${nom},`);

  if (avocat.barreau) {
    lignes.push(`avocat au Barreau de ${avocat.barreau},`);
  }
  if (avocat.cabinet) {
    lignes.push(`exercant au sein de ${avocat.cabinet},`);
  }

  const adresseParts = [];
  if (avocat.adresse) adresseParts.push(avocat.adresse);
  const villePart = [avocat.codePostal, avocat.ville].filter(Boolean).join(' ');
  if (villePart) adresseParts.push(villePart);
  if (adresseParts.length > 0) {
    lignes.push(`dont le cabinet est sis ${adresseParts.join(', ')}.`);
  }

  return lignes.join('\n');
};

// ----- Identite simple d'un enfant pour la convention --------------------
export const identiteEnfantBloc = (enfant) => {
  if (!enfant) return '__________';
  const accord = enfant.sexe === 'F' ? 'nee' : 'ne';
  const prenoms = enfant.prenoms || '__________';
  const nom = enfant.nom || '__________';
  const dateN = formatDateLongue(enfant.dateNaissance);
  const lieuN = enfant.lieuNaissance || '__________';
  return `${prenoms} ${nom}, ${accord}(e) le ${dateN} a ${lieuN}`;
};

// ----- Adresse en une ligne ---------------------------------------------
export const adresseLigne = (entite) => {
  if (!entite) return '__________';
  const parts = [];
  if (entite.adresse) parts.push(entite.adresse);
  const ville = [entite.codePostal, entite.ville].filter(Boolean).join(' ');
  if (ville) parts.push(ville);
  return parts.length > 0 ? parts.join(', ') : '__________';
};

// ----- Nom complet civil epoux -------------------------------------------
export const nomCompletEpoux = (epoux) => {
  if (!epoux) return '__________';
  return `${epoux.civilite || ''} ${epoux.prenoms || ''} ${epoux.nom || ''}`.trim().replace(/\s+/g, ' ') || '__________';
};

// ----- Reference a un epoux dans la convention ("l'Epoux", "l'Epouse") --
export const designerEpoux = (epoux, label) => {
  if (epoux?.civilite === 'Mme') return label === 'demonstratif' ? 'l\'Epouse' : 'l\'epouse';
  return label === 'demonstratif' ? 'l\'Epoux' : 'l\'epoux';
};

// ----- Helpers pour montants ---------------------------------------------
export const formatMontant = (value) => {
  if (value === null || value === undefined || value === '') return '__________';
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 2,
    }).format(value);
  } catch (_e) {
    return `${value} EUR`;
  }
};

// Conversion d'un nombre en lettres (pour les montants des conventions)
// Implementation simplifiee, gere les nombres entiers usuels.
export const nombreEnLettres = (n) => {
  if (n === null || n === undefined) return '__________';
  const num = Math.round(Number(n));
  if (!Number.isFinite(num) || num < 0) return String(n);
  if (num === 0) return 'zero';

  const unites = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
    'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
  const dizaines = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', '', 'quatre-vingt', ''];

  const moinsCent = (m) => {
    if (m < 17) return unites[m];
    if (m < 20) return 'dix-' + unites[m - 10];
    if (m < 70) {
      const d = Math.floor(m / 10);
      const u = m % 10;
      if (u === 0) return dizaines[d];
      if (u === 1 && d !== 8) return dizaines[d] + ' et un';
      return dizaines[d] + '-' + unites[u];
    }
    if (m < 80) {
      const u = m - 60;
      if (u === 11) return 'soixante et onze';
      return 'soixante-' + (u < 17 ? unites[u] : 'dix-' + unites[u - 10]);
    }
    if (m < 100) {
      const u = m - 80;
      if (u === 0) return 'quatre-vingts';
      return 'quatre-vingt-' + (u < 17 ? unites[u] : 'dix-' + unites[u - 10]);
    }
    return String(m);
  };

  const moinsMille = (m) => {
    if (m < 100) return moinsCent(m);
    const c = Math.floor(m / 100);
    const r = m % 100;
    let s = '';
    if (c === 1) s = 'cent';
    else s = unites[c] + ' cent' + (r === 0 ? 's' : '');
    if (r > 0) s += ' ' + moinsCent(r);
    return s;
  };

  if (num < 1000) return moinsMille(num);
  if (num < 1000000) {
    const milliers = Math.floor(num / 1000);
    const reste = num % 1000;
    let s = (milliers === 1 ? 'mille' : moinsMille(milliers) + ' mille');
    if (reste > 0) s += ' ' + moinsMille(reste);
    return s;
  }
  // Pour les sommes superieures, on rend simplement le format chiffre
  return String(num);
};

// ----- Civilite pour appels de courrier ----------------------------------
export const formuleAppelCivile = (entite) => {
  if (!entite) return 'Madame, Monsieur';
  if (entite.civilite === 'M.') return 'Monsieur';
  if (entite.civilite === 'Mme') return 'Madame';
  return 'Madame, Monsieur';
};
