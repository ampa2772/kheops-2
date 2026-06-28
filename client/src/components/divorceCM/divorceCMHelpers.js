// client/src/components/divorceCM/divorceCMHelpers.js
//
// Utilitaires UI partages : formatage, validation, calcul d'age,
// labels et builders de noms.

export const formatDate = (d) => {
  if (!d) return '—';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatMontant = (value) => {
  if (value === null || value === undefined || value === '') return '—';
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value);
  } catch (_e) {
    return `${Math.round(value)} EUR`;
  }
};

export const toDateInputValue = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const ageFromBirthdate = (d) => {
  if (!d) return null;
  const birth = d instanceof Date ? d : new Date(d);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
};

export const isMineur = (dateNaissance) => {
  const age = ageFromBirthdate(dateNaissance);
  return age !== null && age < 18;
};

export const fullNameEpoux = (epoux) => {
  if (!epoux) return '';
  const parts = [];
  if (epoux.civilite) parts.push(epoux.civilite);
  if (epoux.prenoms) parts.push(epoux.prenoms);
  if (epoux.nom) parts.push(epoux.nom);
  return parts.join(' ').trim() || '(non renseigne)';
};

export const fullNameEnfant = (enfant) => {
  if (!enfant) return '';
  return `${enfant.prenoms || ''} ${enfant.nom || ''}`.trim() || '(prenom inconnu)';
};

export const fullNameAdulte = (a) => {
  if (!a) return '';
  return `${a.prenoms || ''} ${a.nom || ''}`.trim() || '(prenom inconnu)';
};

// Validation par etape (renvoie un tableau d'erreurs ou [])
export const validateStep = (step, draft) => {
  const errs = [];
  switch (step) {
    case 0: // Type & cadre
      if (!draft.voie) errs.push('Selectionnez la voie procedurale.');
      break;
    case 1: // Epoux 1
      if (!draft.epoux1?.nom) errs.push('Nom de l\'Epoux 1 requis.');
      if (!draft.epoux1?.prenoms) errs.push('Prenom(s) de l\'Epoux 1 requis.');
      break;
    case 2: // Epoux 2
      if (!draft.epoux2?.nom) errs.push('Nom de l\'Epoux 2 requis.');
      if (!draft.epoux2?.prenoms) errs.push('Prenom(s) de l\'Epoux 2 requis.');
      // Si les deux epoux n'ont pas le meme avocat, l'avocat 2 doit etre renseigne
      if (!draft.partageAvocat && !draft.epoux2?.avocat?.nom) {
        errs.push('Renseignez l\'avocat adverse, ou cochez "Mon cabinet est aussi l\'avocat de cet epoux".');
      }
      break;
    case 3: // Mariage
      if (!draft.mariage?.dateMariage) errs.push('Date de mariage requise.');
      if (!draft.mariage?.regime) errs.push('Regime matrimonial requis.');
      break;
    case 4: // Enfants
      // Pas d'obligation : les couples sans enfant existent
      break;
    case 5: // Finances
      if (draft.prestationCompensatoire?.applicable) {
        if (!draft.prestationCompensatoire.beneficiaire) errs.push('Beneficiaire de la prestation compensatoire requis.');
        if (!draft.prestationCompensatoire.forme) errs.push('Forme de la prestation compensatoire requise.');
      }
      break;
    case 6: // Notaire & recap
      // Notaire optionnel a la creation (peut etre choisi plus tard)
      break;
    default:
      break;
  }
  return errs;
};

export const STEPS = [
  {
    code: 0,
    label: 'Cadre',
    headerTitle: 'Cadre du divorce',
    headerSubtitle: "Voie procédurale, options de fond et hypothèses du dossier."
  },
  {
    code: 1,
    label: 'Époux 1',
    headerTitle: 'Époux 1 — votre client',
    headerSubtitle: "État civil complet de l'époux représenté par votre cabinet. Vos saisies sont conservées entre les étapes ; vous pouvez naviguer librement."
  },
  {
    code: 2,
    label: 'Époux 2',
    headerTitle: 'Époux 2',
    headerSubtitle: "État civil de l'autre époux. Vous pouvez le rechercher dans vos contacts ou saisir manuellement."
  },
  {
    code: 3,
    label: 'Mariage',
    headerTitle: 'Mariage et régime',
    headerSubtitle: "Date, lieu, contrat de mariage et régime matrimonial."
  },
  {
    code: 4,
    label: 'Enfants',
    headerTitle: 'Enfants & adultes à charge',
    headerSubtitle: "Liste des personnes à charge avec scolarité, résidence et autorité parentale."
  },
  {
    code: 5,
    label: 'Biens',
    headerTitle: 'Biens et finances',
    headerSubtitle: "Patrimoine, comptes, prestation compensatoire et pension alimentaire."
  },
  {
    code: 6,
    label: 'Récap.',
    headerTitle: 'Notaire & récapitulatif',
    headerSubtitle: "Notaire choisi, vérification finale et création du dossier."
  },
];
