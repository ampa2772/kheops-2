// FonctionsDetailMariage.js

// Validation email centralisée
export { isValidEmail } from './validationHelpers';

// Liste des champs à exclure de la validation
export const excludedFields = ['type', 'genre', 'profession', 'appellationCourrier', 'contactType', 'pro_contact'];

// Fonction pour construire l'objet erreurs
export const buildErrorObject = (notaryObject) => {
  const errorObject = Object.keys(notaryObject)
    .filter(key => !excludedFields.includes(key))
    .reduce((acc, key) => {
      acc[key] = true; // Initialiser chaque champ à true
      return acc;
    }, {});
  return errorObject;
};

// Initial state pour le notaire
export const notaryInit = {
  nom: '',
  prenoms: '',
  email: '',
  telephone: '',
  adresse: '',
  ville: '',
  codePostal: '',
  type: 'Notaire',
  genre: 'Masculin',
  profession: 'Notaire',
  appellationCourrier: 'Mon cher Maître',
  contactType: 'physique',
  pro_contact: true,
};

// Fonction pour formater les dates pour les champs input de type date
export const formatDateForInput = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = ('0' + (date.getMonth() +1)).slice(-2);
  const day = ('0' + date.getDate()).slice(-2);
  return `${year}-${month}-${day}`;
};

