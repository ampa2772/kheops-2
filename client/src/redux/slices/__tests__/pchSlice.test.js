// Tests unitaires — pchSlice.js

beforeEach(() => {
  jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation();
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation();
});
afterEach(() => {
  Storage.prototype.getItem.mockRestore();
  Storage.prototype.setItem.mockRestore();
  Storage.prototype.removeItem.mockRestore();
  jest.resetModules();
});

let reducer, setFormType, setPersonneChargeField, addToListe, modifierPersonne;
let resetTouteListe, prev, next, resetForm, deletePersonneCharge, setMode;
let setPersonnesChargeForModification, resetPersonneCharge;

beforeEach(() => {
  jest.isolateModules(() => {
    const mod = require('../pchSlice');
    reducer = mod.default;
    setFormType = mod.setFormType;
    setPersonneChargeField = mod.setPersonneChargeField;
    addToListe = mod.addToListe;
    modifierPersonne = mod.modifierPersonne;
    resetTouteListe = mod.resetTouteListe;
    prev = mod.prev;
    next = mod.next;
    resetForm = mod.resetForm;
    deletePersonneCharge = mod.deletePersonneCharge;
    setMode = mod.setMode;
    setPersonnesChargeForModification = mod.setPersonnesChargeForModification;
    resetPersonneCharge = mod.resetPersonneCharge;
  });
});

const getBase = () => reducer(undefined, { type: '@@INIT' });

// champsCommuns: nom, prenoms, adresse, ville, codePostal, genre, dateNaissance, nationalite, paysNaissance, villeNaissance, codePostalNaissance
// Tous sont requis pour un enfant
const fillValidEnfant = (state, nom = 'Enfant') => {
  const fields = [
    { field: 'nom', value: nom },
    { field: 'prenoms', value: 'Prenom' },
    { field: 'adresse', value: '1 rue Test' },
    { field: 'ville', value: 'Paris' },
    { field: 'codePostal', value: '75000' },
    { field: 'genre', value: 'Masculin' },
    { field: 'dateNaissance', value: '2015-01-01' },
    { field: 'nationalite', value: 'Francaise' },
    { field: 'paysNaissance', value: 'France' },
    { field: 'villeNaissance', value: 'Paris' },
    { field: 'codePostalNaissance', value: '75000' },
  ];
  let s = state;
  for (const { field, value } of fields) {
    s = reducer(s, setPersonneChargeField({ field, value }));
  }
  return s;
};

describe('pchSlice etat initial', () => {
  test('retourne l etat initial avec localStorage vide', () => {
    const state = getBase();
    expect(state.liste).toEqual([]);
    expect(state.mode).toBe('ADD');
    expect(state.personne).toBeDefined();
    expect(state.personne.nom).toBe('');
    expect(state.errors).toBeDefined();
  });

  test('le currentFormType par defaut est enfant', () => {
    const state = getBase();
    expect(state.currentFormType).toBe('enfant');
  });
});

describe('pchSlice reducers simples', () => {
  test('setFormType definit currentFormType', () => {
    const state = reducer(getBase(), setFormType('adulte'));
    expect(state.currentFormType).toBe('adulte');
  });

  test('setMode definit mode', () => {
    const state = reducer(getBase(), setMode('EDIT'));
    expect(state.mode).toBe('EDIT');
  });

  test('resetForm remet le formulaire en mode ADD', () => {
    let state = reducer(getBase(), setFormType('adulte'));
    state = reducer(state, setMode('EDIT'));
    state = reducer(state, resetForm());
    expect(state.mode).toBe('ADD');
    expect(state.currentFormType).toBe('enfant');
    expect(state.submitAttempted).toBe(false);
  });
});

describe('pchSlice setPersonneChargeField', () => {
  test('met a jour un champ simple', () => {
    const state = reducer(getBase(), setPersonneChargeField({ field: 'nom', value: 'Dupont' }));
    expect(state.personne.nom).toBe('Dupont');
  });

  test('met a jour email et recalcule emailValid', () => {
    const state = reducer(getBase(), setPersonneChargeField({ field: 'email', value: 'a@b.com' }));
    expect(state.personne.email).toBe('a@b.com');
    expect(state.emailValid).toBe(true);
  });

  test('email invalide met emailValid a false', () => {
    const state = reducer(getBase(), setPersonneChargeField({ field: 'email', value: 'invalid' }));
    expect(state.emailValid).toBe(false);
  });

  test('changement de genre recalcule statut marital', () => {
    const state = reducer(getBase(), setPersonneChargeField({ field: 'genre', value: 'Feminin' }));
    expect(state.personne.genre).toBe('Feminin');
    expect(state.optionsStatusMaritauxForm).toBeDefined();
  });

  test('changement de type recalcule emailValid pour enfant', () => {
    let state = reducer(getBase(), setPersonneChargeField({ field: 'email', value: 'invalid' }));
    state = reducer(state, setPersonneChargeField({ field: 'type', value: 'enfant' }));
    expect(state.emailValid).toBe(true);
  });

  test('changement de maritalStatus met a jour les options', () => {
    const state = reducer(getBase(), setPersonneChargeField({ field: 'maritalStatus', value: 'Mari\u00e9' }));
    expect(state.currentStatusMarital).toBe('Mari\u00e9');
    expect(state.personne.maritalStatus).toBe('Mari\u00e9');
  });
});

describe('pchSlice addToListe', () => {
  test('ajoute une personne valide a la liste et reset le form', () => {
    let state = fillValidEnfant(getBase(), 'EnfantTest');
    state = reducer(state, addToListe());
    expect(state.liste.length).toBe(1);
    expect(state.liste[0].nom).toBe('EnfantTest');
    // Form est reset apres ajout
    expect(state.personne.nom).toBe('');
    expect(state.currentFormType).toBe('enfant');
  });

  test('ajout invalide met submitAttempted a true sans ajouter', () => {
    const state = reducer(getBase(), addToListe());
    expect(state.submitAttempted).toBe(true);
    expect(state.liste.length).toBe(0);
  });

  test('ajoute les erreurs et emailValid aux tableaux paralleles', () => {
    let state = fillValidEnfant(getBase());
    state = reducer(state, addToListe());
    expect(state.listeErrors.length).toBe(1);
    expect(state.listeEmailValid.length).toBe(1);
    expect(state.listeErrorCounts.length).toBe(1);
  });
});

describe('pchSlice modifierPersonne', () => {
  const getEditState = () => {
    let state = fillValidEnfant(getBase(), 'Original');
    state = reducer(state, addToListe());
    state = reducer(state, prev()); // mode EDIT sur la personne ajoutee
    return state;
  };

  test('modifie un champ de la personne courante', () => {
    const state = reducer(getEditState(), modifierPersonne({ propriete: 'nom', valeur: 'Modifie' }));
    expect(state.liste[0].nom).toBe('Modifie');
  });

  test('modifie email et recalcule emailValid', () => {
    const state = reducer(getEditState(), modifierPersonne({ propriete: 'email', valeur: 'valid@x.com' }));
    expect(state.currentEmailValid).toBe(true);
  });

  test('recalcule errorCounts apres modification', () => {
    // La validation des champs est volontairement désactivée dans le code
    // (FonctionsPch.verifierErreurs renvoie toujours false → tous les champs
    // sont optionnels). modifierPersonne recalcule néanmoins listeErrorCounts
    // via validateForm(listeErrors[index]) : on vérifie l'invariant de
    // recalcul (compteur défini = nombre d'erreurs actives), et non l'ancien
    // comportement où vider "nom" produisait une erreur.
    const state = reducer(getEditState(), modifierPersonne({ propriete: 'nom', valeur: '' }));
    const expectedCount = Object.values(state.listeErrors[0]).filter(Boolean).length;
    expect(state.listeErrorCounts[0]).toBe(expectedCount);
    // Le champ est bien modifié même si aucune erreur n'est levée.
    expect(state.liste[0].nom).toBe('');
  });

  // Non-régression: villeNaissance doit être modifiable en signature positionnelle
  // (format utilisé par SelectCommune.handleChange via PchCommuneField)
  test('modifierPersonne accepte la signature positionnelle pour villeNaissance', () => {
    const state = reducer(getEditState(), modifierPersonne('villeNaissance', 'Lyon'));
    expect(state.currentPersonne.villeNaissance).toBe('Lyon');
    expect(state.liste[0].villeNaissance).toBe('Lyon');
  });

  test('modifierPersonne accepte la forme objet pour villeNaissance', () => {
    const state = reducer(getEditState(), modifierPersonne({ propriete: 'villeNaissance', valeur: 'Lyon' }));
    expect(state.currentPersonne.villeNaissance).toBe('Lyon');
    expect(state.liste[0].villeNaissance).toBe('Lyon');
  });

  test('modifierPersonne met à jour currentPersonne même si la personne n\'est pas dans liste', () => {
    // Cas limite : currentPersonne défini sans entrée correspondante dans liste
    let state = getBase();
    state = { ...state, currentPersonne: { id: 'external-id', villeNaissance: '' }, mode: 'EDIT' };
    state = reducer(state, modifierPersonne({ propriete: 'villeNaissance', valeur: 'Marseille' }));
    expect(state.currentPersonne.villeNaissance).toBe('Marseille');
  });

  test('setPersonneChargeField accepte la signature positionnelle pour villeNaissance', () => {
    const state = reducer(getBase(), setPersonneChargeField('villeNaissance', 'Bordeaux'));
    expect(state.personne.villeNaissance).toBe('Bordeaux');
  });
});

describe('pchSlice navigation prev/next', () => {
  const getTwoItemState = () => {
    let state = fillValidEnfant(getBase(), 'Premier');
    state = reducer(state, addToListe());
    state = fillValidEnfant(state, 'Deuxieme');
    state = reducer(state, addToListe());
    return state; // mode ADD, 2 personnes dans la liste
  };

  test('prev depuis ADD navigue vers le dernier element', () => {
    const state = reducer(getTwoItemState(), prev());
    expect(state.mode).toBe('EDIT');
    expect(state.currentPersonne.nom).toBe('Deuxieme');
  });

  test('prev depuis EDIT vers l element precedent', () => {
    let state = getTwoItemState();
    state = reducer(state, prev()); // vers Deuxieme (index 1)
    state = reducer(state, prev()); // vers Premier (index 0)
    expect(state.currentPersonne.nom).toBe('Premier');
  });

  test('next depuis dernier element revient en mode ADD', () => {
    let state = getTwoItemState();
    state = reducer(state, prev()); // vers Deuxieme
    state = reducer(state, next()); // dernier -> ADD
    expect(state.mode).toBe('ADD');
  });

  test('next vers l element suivant', () => {
    let state = getTwoItemState();
    state = reducer(state, prev()); // Deuxieme
    state = reducer(state, prev()); // Premier
    state = reducer(state, next()); // Deuxieme
    expect(state.currentPersonne.nom).toBe('Deuxieme');
  });
});

describe('pchSlice deletePersonneCharge', () => {
  test('supprime la personne courante et remet en mode ADD', () => {
    let state = fillValidEnfant(getBase(), 'Asupprimer');
    state = reducer(state, addToListe());
    state = reducer(state, prev()); // mode EDIT
    state = reducer(state, deletePersonneCharge());
    expect(state.liste.length).toBe(0);
    expect(state.mode).toBe('ADD');
  });
});

describe('pchSlice resetTouteListe', () => {
  test('vide la liste et supprime localStorage', () => {
    let state = fillValidEnfant(getBase());
    state = reducer(state, addToListe());
    state = reducer(state, resetTouteListe());
    expect(state.liste).toEqual([]);
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('personneChargeData');
  });
});

describe('pchSlice extraReducers', () => {
  test('SET_PERSONNES_CHARGE_FOR_MODIFICATION hydrate la liste', () => {
    const personnes = [
      { _id: 'p1', nom: 'A', prenoms: 'B', genre: 'Masculin', type: 'enfant', email: '', maritalStatus: 'C\u00e9libataire', adresse: 'x', ville: 'y', codePostal: '1', dateNaissance: '2020-01-01', nationalite: 'FR', paysNaissance: 'FR', villeNaissance: 'P', codePostalNaissance: '75' },
      { _id: 'p2', nom: 'C', prenoms: 'D', genre: 'Feminin', type: 'adulte', email: 'c@d.com', maritalStatus: 'Mari\u00e9e', adresse: 'x', ville: 'y', codePostal: '1', dateNaissance: '1990-01-01', nationalite: 'FR', paysNaissance: 'FR', villeNaissance: 'P', codePostalNaissance: '75', profession: 'Dev', numeroSecu: '123', telephone: '06' },
    ];
    const state = reducer(getBase(), { type: 'SET_PERSONNES_CHARGE_FOR_MODIFICATION', payload: personnes });
    expect(state.liste.length).toBe(2);
    expect(state.liste[0].id).toBe('p1');
    expect(state.liste[1].position).toBe(1);
    expect(state.listeErrors.length).toBe(2);
    expect(state.listeEmailValid.length).toBe(2);
  });

  test('RESET_PERSONNES_CHARGE vide la liste et supprime localStorage', () => {
    let state = fillValidEnfant(getBase());
    state = reducer(state, addToListe());
    state = reducer(state, { type: 'RESET_PERSONNES_CHARGE' });
    expect(state.liste).toEqual([]);
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('personneChargeData');
  });
});

describe('pchSlice action creators exports', () => {
  test('setPersonnesChargeForModification retourne le bon type', () => {
    const action = setPersonnesChargeForModification([{ _id: 'p1' }]);
    expect(action.type).toBe('SET_PERSONNES_CHARGE_FOR_MODIFICATION');
  });

  test('resetPersonneCharge retourne le bon type', () => {
    expect(resetPersonneCharge().type).toBe('RESET_TOUTE_LISTE');
  });
});
