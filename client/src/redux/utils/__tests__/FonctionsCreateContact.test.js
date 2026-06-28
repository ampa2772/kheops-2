// FonctionsCreateContact.test.js — Tests des fonctions utilitaires de creation de contact
import {
  buildTypeContact,
  initializeErrorForm,
  updateNbErrors,
  adjustMaritalStatusForGender,
  getDefaultContact,
  initializeResetState,
  optionsStatusMaritaux,
  resetCorrespondingContactState,
  isValidEmail,
} from '../FonctionsCreateContact';

// ===================== buildTypeContact =====================
describe('buildTypeContact', () => {
  const contact = {
    _id: '123',
    masculin: 'Partie (Client)',
    feminin: 'Partie (Cliente)',
    appellationCourrierTypeContactMasculin: 'Cher Monsieur',
    appellationCourrierTypeContactFeminin: 'Chere Madame',
    contactTypePro: false,
    contactDefault: true,
  };

  it('retourne le label masculin pour genre Masculin', () => {
    const result = buildTypeContact(contact, 'Masculin');
    expect(result.label).toBe('Partie (Client)');
    expect(result.appellationCourrier).toBe('Cher Monsieur');
  });

  it('retourne le label feminin pour genre Feminin', () => {
    const result = buildTypeContact(contact, 'Feminin');
    expect(result.label).toBe('Partie (Cliente)');
    expect(result.appellationCourrier).toBe('Chere Madame');
  });

  it('retourne les champs structurels (_id, contactTypePro, contactDefault)', () => {
    const result = buildTypeContact(contact, 'Masculin');
    expect(result._id).toBe('123');
    expect(result.contactTypePro).toBe(false);
    expect(result.contactDefault).toBe(true);
  });
});

// ===================== initializeErrorForm =====================
describe('initializeErrorForm', () => {
  const champsBase = ['nom', 'prenoms', 'adresse', 'ville', 'codePostal', 'email', 'telephone'];
  const champsNonPro = ['dateNaissance', 'paysNaissance', 'villeNaissance', 'CP_VilleNaissance', 'nationalite', 'maritalStatus'];

  it('mode creation, contact non-pro, champs vides → tous en erreur', () => {
    const contactVide = {};
    const errors = initializeErrorForm(contactVide, false);
    // Tous les champs base + nonPro doivent etre en erreur
    [...champsBase, ...champsNonPro].forEach(field => {
      expect(errors[field]).toBe(true);
    });
  });

  it('mode creation, contact pro, champs vides → seulement champs base en erreur', () => {
    const contactVide = {};
    const errors = initializeErrorForm(contactVide, true);
    champsBase.forEach(field => {
      expect(errors[field]).toBe(true);
    });
    // Les champs nonPro ne doivent PAS etre dans les erreurs
    champsNonPro.forEach(field => {
      expect(errors[field]).toBeUndefined();
    });
  });

  it('mode creation, champs remplis → pas d erreur', () => {
    const contactRempli = {
      nom: 'Dupont', prenoms: 'Jean', adresse: '1 rue', ville: 'Paris',
      codePostal: '75000', email: 'j@d.com', telephone: '01',
      dateNaissance: '1990-01-01', paysNaissance: 'France',
      villeNaissance: 'Paris', CP_VilleNaissance: '75000',
      nationalite: 'Francaise', maritalStatus: 'Celibataire',
    };
    const errors = initializeErrorForm(contactRempli, false);
    Object.values(errors).forEach(v => expect(v).toBe(false));
  });

  it('mode modification → toutes les erreurs a false', () => {
    const contactVide = {};
    const errors = initializeErrorForm(contactVide, false, true);
    Object.values(errors).forEach(v => expect(v).toBe(false));
  });

  it('champs partiellement remplis → erreurs seulement sur les vides', () => {
    const contactPartiel = { nom: 'Dupont', prenoms: '', email: 'j@d.com' };
    const errors = initializeErrorForm(contactPartiel, true);
    expect(errors.nom).toBe(false);
    expect(errors.prenoms).toBe(true);
    expect(errors.email).toBe(false);
    expect(errors.telephone).toBe(true);
  });
});

// ===================== updateNbErrors =====================
describe('updateNbErrors', () => {
  it('compte 3 erreurs dans errorForm', () => {
    const state = {
      formErrors: {
        errorForm: { nom: true, prenoms: true, email: true, ville: false },
        validEmail: true,
        nbErrors: 0,
      },
    };
    updateNbErrors(state);
    expect(state.formErrors.nbErrors).toBe(3);
  });

  it('0 erreurs + validEmail=true → nbErrors = 0', () => {
    const state = {
      formErrors: {
        errorForm: { nom: false, prenoms: false },
        validEmail: true,
        nbErrors: 0,
      },
    };
    updateNbErrors(state);
    expect(state.formErrors.nbErrors).toBe(0);
  });

  it('0 erreurs errorForm + validEmail=false → nbErrors = 1', () => {
    const state = {
      formErrors: {
        errorForm: { nom: false, email: false },
        validEmail: false,
        nbErrors: 0,
      },
    };
    updateNbErrors(state);
    expect(state.formErrors.nbErrors).toBe(1);
  });
});

// ===================== adjustMaritalStatusForGender =====================
describe('adjustMaritalStatusForGender', () => {
  it('Mariee + Masculin → Marie', () => {
    const result = adjustMaritalStatusForGender('Mariée', 'Masculin', optionsStatusMaritaux);
    expect(result).toBe('Marié');
  });

  it('Marie + Feminin → Mariee', () => {
    const result = adjustMaritalStatusForGender('Marié', 'Feminin', optionsStatusMaritaux);
    expect(result).toBe('Mariée');
  });

  it('Veuf + Feminin → Veuve', () => {
    const result = adjustMaritalStatusForGender('Veuf', 'Feminin', optionsStatusMaritaux);
    expect(result).toBe('Veuve');
  });

  it('Celibataire reste inchange (neutre)', () => {
    const result = adjustMaritalStatusForGender('Célibataire', 'Masculin', optionsStatusMaritaux);
    expect(result).toBe('Célibataire');
  });
});

// ===================== getDefaultContact =====================
describe('getDefaultContact', () => {
  it('retourne un objet avec le genre et maritalStatus passes', () => {
    const contact = getDefaultContact('Feminin', 'Mariée');
    expect(contact.genre).toBe('Feminin');
    expect(contact.maritalStatus).toBe('Mariée');
  });

  it('tous les autres champs sont vides', () => {
    const contact = getDefaultContact('Masculin', 'Célibataire');
    expect(contact.nom).toBe('');
    expect(contact.prenoms).toBe('');
    expect(contact.email).toBe('');
    expect(contact.telephone).toBe('');
    expect(contact.adresse).toBe('');
    expect(contact.ville).toBe('');
    expect(contact.contactType).toBe('physique');
    expect(contact.pro_contact).toBe(false);
  });
});

// ===================== initializeResetState =====================
describe('initializeResetState', () => {
  it('sans parametres → etat par defaut (Masculin, Celibataire)', () => {
    const state = initializeResetState();
    expect(state.contactDetails.contact.genre).toBe('Masculin');
    expect(state.contactDetails.currentStatusMarital).toBe('Célibataire');
    expect(state.formErrors).toBeDefined();
    expect(state.typeContactsData).toBeDefined();
  });

  it('avec reset=true → reinitialise completement', () => {
    const existingState = {
      contactDetails: { contact: { genre: 'Feminin' }, currentStatusMarital: 'Mariée' },
    };
    const state = initializeResetState(existingState, true);
    // Apres reset, on revient aux valeurs par defaut
    expect(state.contactDetails.contact.genre).toBe('Masculin');
  });

  it('retourne un correspondingContact par defaut', () => {
    const state = initializeResetState();
    expect(state.correspondingContact).toEqual(resetCorrespondingContactState);
  });
});

// ===================== optionsStatusMaritaux =====================
describe('optionsStatusMaritaux', () => {
  it('contient 7 options', () => {
    expect(optionsStatusMaritaux).toHaveLength(7);
  });

  it('chaque option a un champ masculin et feminin', () => {
    optionsStatusMaritaux.forEach(option => {
      expect(option).toHaveProperty('masculin');
      expect(option).toHaveProperty('feminin');
    });
  });
});
