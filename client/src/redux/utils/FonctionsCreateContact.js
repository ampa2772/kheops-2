// FonctionsCreateContactReducer.js
import { isValidEmail as _isValidEmail } from './validationHelpers';

// État de réinitialisation pour correspondingContact
export const resetCorrespondingContactState = {
  _id: '6538e6b04986ba1119b1361b',
  masculin: 'Partie (Client / Adversaire)',
  feminin: 'Partie (Client / Adversaire)',
  appellationCourrierTypeContactMasculin: 'Cher Monsieur',
  appellationCourrierTypeContactFeminin: 'Chère Madame',
  contactTypePro: false,
  contactDefault: true,
  __v: 0
};

// Validation email centralisée
export const isValidEmail = _isValidEmail;

// Fonction pour construire un objet typeContact avec la structure souhaitée
export function buildTypeContact(contact, genre) {
  return {
    _id: contact._id,
    label: genre === 'Masculin' ? contact.masculin : contact.feminin,
    appellationCourrier: genre === 'Masculin' ? contact.appellationCourrierTypeContactMasculin : contact.appellationCourrierTypeContactFeminin,
    contactTypePro: contact.contactTypePro,
    contactDefault: contact.contactDefault,
  };
}

// === DÉSACTIVATION COMPLÈTE : Aucun champ obligatoire, aucune validation ===
export function initializeErrorForm(infoObject, isProContact, isModification = false) {
  const baseFields = ['nom', 'prenoms', 'adresse', 'ville', 'codePostal', 'email', 'telephone'];
  const nonProFields = ['dateNaissance', 'paysNaissance', 'villeNaissance', 'CP_VilleNaissance', 'nationalite', 'maritalStatus'];
  const errors = {};
  [...baseFields, ...nonProFields].forEach(field => {
    errors[field] = false; // Toujours false : aucun champ obligatoire
  });
  return errors;
}

// === DÉSACTIVATION COMPLÈTE : Toujours 0 erreurs, email toujours valide ===
export function updateNbErrors(newState) {
  newState.formErrors.nbErrors = 0;
  newState.formErrors.validEmail = true;
}


// Fonction pour ajuster le statut marital en fonction du genre
export function adjustMaritalStatusForGender(currentStatus, newGender, optionsStatusMaritaux) {
  let newStatus = currentStatus;

  const statusAdjustmentMap = {
    Masculin: {
      "Mariée": "Marié",
      "Pacsée": "Pacsé",
      "Divorcée": "Divorcé",
      "Veuve": "Veuf",
      "Séparée": "Séparé",
    },
    Feminin: {
      "Marié": "Mariée",
      "Pacsé": "Pacsée",
      "Divorcé": "Divorcée",
      "Veuf": "Veuve",
      "Séparé": "Séparée"
    }
  };

  const adjustmentMapForCurrentToNewGender = statusAdjustmentMap[newGender];

  if (adjustmentMapForCurrentToNewGender[currentStatus]) {
    newStatus = adjustmentMapForCurrentToNewGender[currentStatus];
  } else {
    for (const option of optionsStatusMaritaux) {
      if (option.Masculin === currentStatus || option.Feminin === currentStatus) {
        newStatus = option[newGender.toLowerCase()];
        break;
      }
    }
  }

  return newStatus;
}

// Déclaration de la constante optionsStatusMaritaux en dehors de la fonction
export const optionsStatusMaritaux = [
  { masculin: 'Célibataire', feminin: 'Célibataire' },
  { masculin: 'Marié', feminin: 'Mariée' },
  { masculin: 'Maritale', feminin: 'Maritale' },
  { masculin: 'Séparé', feminin: 'Séparée' },
  { masculin: 'Pacsé', feminin: 'Pacsée' },
  { masculin: 'Divorcé', feminin: 'Divorcée' },
  { masculin: 'Veuf', feminin: 'Veuve' },
];

// Fonction factory pour générer defaultContact
export function getDefaultContact(genre, currentStatusMarital) {
  return {
    nom: '',
    prenoms: '',
    email: '',
    telephone: '',
    adresse: '',
    ville: '',
    codePostal: '',
    genre: genre,
    dateNaissance: '',
    villeNaissance: '',
    CP_VilleNaissance: '',
    paysNaissance: '',
    nationalite: '',
    maritalStatus: currentStatusMarital,
    profession: '',
    secu: '',
    nom_de_naissance: '',
    appellationCourrier: '',
    // Indique si l'utilisateur a saisi explicitement l'appellation courrier
    // (true) ou si elle est encore en mode auto-sync avec type/genre/pro
    // (false). Une saisie manuelle bloque toute resynchronisation auto.
    appellationCourrierIsCustom: false,
    contactType: 'physique',
    type: 'Partie (Client/Adversaire)',
    pro_contact: false,
  };
}

// Fonction pour initialiser l'état de réinitialisation
// FonctionsCreateContact.js

// ... (autres fonctions)

export function initializeResetState(currentState = null, reset = false) {
  if (!currentState || reset) {
    currentState = {};
  }

  const genreInitial = currentState.contactDetails?.contact?.genre || 'Masculin';
  const currentStatusMaritalInitial = currentState.contactDetails?.currentStatusMarital || 'Célibataire';

  const statusMaritauxGenre = optionsStatusMaritaux
    .map(option => option[genreInitial.toLowerCase()])
    .filter(status => status !== currentStatusMaritalInitial);

  const defaultContact = getDefaultContact(genreInitial, currentStatusMaritalInitial);

  const allTypeContacts = currentState.typeContactsData?.allTypeContacts || [];
  const allTypeContactsForm = allTypeContacts.map(contact =>
    buildTypeContact(contact, genreInitial)
  );

  const foundTypeContact = allTypeContactsForm.find(
    contact => contact._id === currentState.contactDetails?.meta?.typeId
  );

  const contactTypeLabel = foundTypeContact ? foundTypeContact.label : defaultContact.type;
  const appellationCourrier = foundTypeContact ? foundTypeContact.appellationCourrier : '';

  const contact = {
    ...defaultContact,
    type: contactTypeLabel,
    appellationCourrier: appellationCourrier,
    pro_contact: foundTypeContact ? foundTypeContact.contactTypePro : defaultContact.pro_contact,
  };

  const errorForm = initializeErrorForm(contact, contact.pro_contact);

  const currentTypeContact = currentState.typeContactsData?.currentTypeContact || {};
  const typeId = currentState.contactDetails?.meta?.typeId || null;
  const correspondingContactDefault = currentState.typeContactsData?.correspondingContactDefault || {};

  return {
    contactDetails: {
      contact: contact,
      meta: { typeId: typeId },
      optionsStatusMaritaux: optionsStatusMaritaux,
      currentStatusMarital: currentStatusMaritalInitial,
      statusMaritauxGenre: statusMaritauxGenre,
    },
    formErrors: {
      hasCheckedContact: false,
      nbErrors: Object.values(errorForm).filter(value => value === true).length,
      validEmail: isValidEmail(contact.email),
      errorForm: errorForm,
    },
    typeContactsData: {
      loading: false,
      error: null,
      actionStatus: {
        deleteSuccess: false,
        saveSuccess: false,
      },
      typeContactToAdd: {
        masculin: '',
        feminin: '',
        appellationCourrierTypeContactMasculin: '',
        appellationCourrierTypeContactFeminin: '',
        contactTypePro: false,
        contactDefault: false,
        defaultId: null,
      },
      typeContactToModify: {},
      correspondingContactDefault: correspondingContactDefault,
      allTypeContacts: allTypeContacts,
      allTypeContactsForm: allTypeContactsForm,
      currentTypeContact: foundTypeContact || {},
    },
    correspondingContact: currentState.savedTypeContactState?.correspondingContact || resetCorrespondingContactState,
    servErrors: currentState.servErrors || null,
  };
}

// ... (autres fonctions)


// Fonction pour charger l'état depuis le localStorage
export function loadInitialState() {
  const savedState = localStorage.getItem('contactFormData');
  const currentTypeContact = JSON.parse(localStorage.getItem('currentTypeContact'));
  const alternativeCurrentTypeContact = JSON.parse(localStorage.getItem('alternativeCurrentTypeContact'));

  let initialState = savedState ? JSON.parse(savedState) : initializeResetState();

  if (currentTypeContact) {
    initialState.typeContactsData.currentTypeContact = currentTypeContact;
  }

  if (alternativeCurrentTypeContact) {
    initialState.typeContactsData.alternativeCurrentTypeContact = alternativeCurrentTypeContact;
  }

  return initialState;
}