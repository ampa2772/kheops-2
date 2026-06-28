// FonctionsPch.js
import { isValidEmail as _isValidEmail } from './validationHelpers';

// Définition des options de statut marital
export const optionsStatusMaritaux = [
  { masculin: 'Célibataire', feminin: 'Célibataire' },
  { masculin: 'Marié', feminin: 'Mariée' },
  { masculin: 'Maritale', feminin: 'Maritale' },
  { masculin: 'Séparé', feminin: 'Séparée' },
  { masculin: 'Pacsé', feminin: 'Pacsée' },
  { masculin: 'Divorcé', feminin: 'Divorcée' },
  { masculin: 'Veuf', feminin: 'Veuve' },
];

// Genre initial par défaut
export const genreInitial = 'Masculin';

// Fonction pour construire les statuts maritaux en fonction du genre
export function buildStatusMaritaux(genre) {
  return optionsStatusMaritaux.map((status) => status[genre.toLowerCase()]);
}

// Statut marital initial basé sur le genre initial
export const currentStatusMaritalInitial =
  optionsStatusMaritaux[0][genreInitial.toLowerCase()];

// Options de statut marital pour le formulaire
export const optionsStatusMaritauxForm = buildStatusMaritaux(genreInitial).filter(
  (status) => status !== currentStatusMaritalInitial
);

// Champs communs pour les formulaires
export const champsCommuns = [
  'nom',
  'prenoms',
  'adresse',
  'ville',
  'codePostal',
  'genre',
  'dateNaissance',
  'nationalite',
  'paysNaissance',
  'villeNaissance',
  'codePostalNaissance',
];

// Champs spécifiques aux adultes
export const champsAdulte = ['profession', 'numeroSecu', 'email', 'telephone'];

// Fonction pour initialiser les erreurs dans le formulaire
// Seuls nom et prenoms sont vérifiés (au moins l'un des deux doit être rempli)
export const initialiserErreurs = (personne, type = 'enfant') => {
  return {};
};

// Fonction pour vérifier si une chaîne de caractères est vide
export const estChaineVide = (valeur) => !valeur || valeur.trim() === '';

// Validation email centralisée
export const isValidEmail = _isValidEmail;

// Fonction pour vérifier les erreurs dans le formulaire
// Validation désactivée — tous les champs sont optionnels
export const verifierErreurs = (personne, propriete, type) => {
  return false;
};

// Fonction pour ajuster le statut marital en fonction du genre
export function adjustMaritalStatus(currentStatus, newGender, optionsStatusMaritaux) {
  let newStatus = currentStatus;

  const statusAdjustmentMap = {
    Masculin: {
      Mariée: 'Marié',
      Pacsée: 'Pacsé',
      Divorcée: 'Divorcé',
      Veuve: 'Veuf',
      Séparée: 'Séparé',
    },
    Feminin: {
      Marié: 'Mariée',
      Pacsé: 'Pacsée',
      Divorcé: 'Divorcée',
      Veuf: 'Veuve',
      Séparé: 'Séparée',
    },
  };

  const adjustmentMapForCurrentToNewGender = statusAdjustmentMap[newGender];

  if (adjustmentMapForCurrentToNewGender && adjustmentMapForCurrentToNewGender[currentStatus]) {
    newStatus = adjustmentMapForCurrentToNewGender[currentStatus];
  } else {
    for (const option of optionsStatusMaritaux) {
      if (
        option.masculin === currentStatus ||
        option.feminin === currentStatus
      ) {
        newStatus = option[newGender.toLowerCase()];
        break;
      }
    }
  }

  return newStatus;
}

// Structure initiale pour une personne
export const structurePersonne = {
  nom: '',
  prenoms: '',
  dateNaissance: '',
  nationalite: '',
  adresse: '',
  ville: '',
  codePostal: '',
  paysNaissance: '',
  villeNaissance: '',
  email: '',
  telephone: '',
  maritalStatus: '',
  type: 'enfant', // valeur par défaut
  codePostalNaissance: '',
  genre: 'Masculin', // valeur par défaut
  profession: '',
  numeroSecu: '',
};

// Fonction pour réinitialiser l'état du formulaire
export const resetFormState = () => ({
  personne: {
    ...structurePersonne,
    maritalStatus: currentStatusMaritalInitial,
  },
  optionsStatusMaritaux: optionsStatusMaritaux,

  currentStatusMarital: currentStatusMaritalInitial,
  optionsStatusMaritauxForm: optionsStatusMaritauxForm,

  currentStatusMaritalList: '',
  currentStatusMaritauxListe: [],
  optionsStatusMaritauxFormListe: [],

  errors: initialiserErreurs(structurePersonne),
  mode: 'ADD',
  emailValid: false,
  liste: [],
  currentPersonne: {},
  currentErrors: {},
  currentEmailValid: false,
  listeErrors: [],
  listeEmailValid: [],
  errorCount: 0,
  currentCountErrors: 0,
  listeErrorCounts: [],
  isRightArrow: false,
  isLeftArrow: false,
  submitAttempted: false,
  currentFormType: 'enfant',
});

// Fonction pour charger l'état initial depuis localStorage
export const loadInitialState = () => {
  const savedState = localStorage.getItem('personneChargeData');
  return savedState ? JSON.parse(savedState) : resetFormState();
};

// Fonction pour calculer le nombre d'erreurs dans le formulaire
export const validateForm = (errors) => {
  return Object.values(errors).filter(Boolean).length;
};

// Fonction pour mettre à jour les positions dans la liste
export const updatePositions = (liste) => {
  return liste.map((personne, index) => ({
    ...personne,
    position: index,
  }));
};

// Fonction pour mettre à jour les flèches de navigation
export const updateNavigationArrows = (state) => {
  const isListEmpty = state.liste.length === 0;
  const currentPosition = state.currentPersonne.position || 0;
  const isAtFirstElement = currentPosition === 0;

  return {
    isRightArrow: !isListEmpty && state.mode !== 'ADD',
    isLeftArrow:
      !isListEmpty &&
      (state.mode === 'ADD' || (state.mode === 'EDIT' && !isAtFirstElement)),
  };
};

// Fonction pour sauvegarder l'état dans localStorage
export const saveStateToLocalStorage = (state) => {
  localStorage.setItem('personneChargeData', JSON.stringify(state));
};

// Fonction pour mettre à jour les erreurs
export const updateErrors = (personne, propriete, type, currentErrors) => {
  const errors = { ...currentErrors };
  if (propriete === 'type') {
    return initialiserErreurs(personne, type);
  } else {
    errors[propriete] = verifierErreurs(personne, propriete, type);
    return errors;
  }
};

// Fonction pour mettre à jour un champ dans l'état
export const updateField = (state, field, value) => {
  let newState = { ...state };
  let emailValid = state.emailValid;

  if (field !== '') {
    let updatedPersonne = { ...state.personne, [field]: value };

    updatedPersonne = Object.entries(updatedPersonne).reduce(
      (acc, [key, val]) => {
        if (key !== 'undefined') {
          acc[key] = val;
        }
        return acc;
      },
      {}
    );

    let updatedErrors = updateErrors(
      updatedPersonne,
      field,
      updatedPersonne.type,
      state.errors
    );

    if (field === 'email') {
      emailValid = isValidEmail(value);
    } else if (field === 'type') {
      emailValid =
        updatedPersonne.type === 'adulte'
          ? isValidEmail(updatedPersonne.email)
          : true;
    }

    if (field === 'genre') {
      const newOptionsStatusMaritauxForm = buildStatusMaritaux(value);
      const adjustedCurrentStatusMarital = adjustMaritalStatus(
        newState.currentStatusMarital,
        value,
        newState.optionsStatusMaritaux
      );

      newState.currentStatusMarital = adjustedCurrentStatusMarital;
      newState.optionsStatusMaritauxForm = newOptionsStatusMaritauxForm.filter(
        (status) => status !== newState.currentStatusMarital
      );
      updatedPersonne.maritalStatus = newState.currentStatusMarital;
    }

    if (field === 'maritalStatus') {
      newState.currentStatusMarital = value;
      updatedPersonne.maritalStatus = value;
      newState.optionsStatusMaritauxForm = buildStatusMaritaux(
        updatedPersonne.genre
      ).filter((status) => status !== value);
    }

    updatedErrors = Object.entries(updatedErrors).reduce(
      (acc, [key, val]) => {
        if (key !== 'undefined') {
          acc[key] = val;
        }
        return acc;
      },
      {}
    );

    newState.errorCount = validateForm(updatedErrors);

    newState = {
      ...newState,
      personne: {
        ...updatedPersonne,
        maritalStatus: newState.currentStatusMarital,
      },
      errors: updatedErrors,
      emailValid,
    };
  }

  return newState;
};

