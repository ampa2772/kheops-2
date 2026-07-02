import {
  buildStatusMaritaux,
  optionsStatusMaritaux,
  initialiserErreurs,
  estChaineVide,
  isValidEmail,
  verifierErreurs,
  adjustMaritalStatus,
  validateForm,
  updatePositions,
  updateNavigationArrows,
  updateErrors,
  updateField,
  resetFormState,
  loadInitialState,
  saveStateToLocalStorage,
  champsCommuns,
  champsAdulte,
  structurePersonne,
  currentStatusMaritalInitial,
} from '../FonctionsPch';

// --- buildStatusMaritaux ---

describe('buildStatusMaritaux', () => {
  test('retourne les statuts masculins pour le genre Masculin', () => {
    const result = buildStatusMaritaux('Masculin');
    expect(result).toEqual([
      'Célibataire', 'Marié', 'Maritale', 'Séparé', 'Pacsé', 'Divorcé', 'Veuf',
    ]);
  });

  test('retourne les statuts féminins pour le genre Feminin', () => {
    const result = buildStatusMaritaux('Feminin');
    expect(result).toEqual([
      'Célibataire', 'Mariée', 'Maritale', 'Séparée', 'Pacsée', 'Divorcée', 'Veuve',
    ]);
  });
});

// --- initialiserErreurs ---

describe('initialiserErreurs', () => {
  // La validation a été désactivée dans le code de prod : initialiserErreurs
  // retourne désormais un objet d'erreurs vide (tous les champs sont optionnels).
  // Les tests reflètent ce comportement actuel.
  test('retourne un objet vide pour type enfant (validation désactivée)', () => {
    const personne = { ...structurePersonne };
    const errors = initialiserErreurs(personne, 'enfant');

    expect(errors).toEqual({});
  });

  test('retourne un objet vide pour type adulte (validation désactivée)', () => {
    const personne = { ...structurePersonne };
    const errors = initialiserErreurs(personne, 'adulte');

    expect(errors).toEqual({});
  });

  test('ne marque aucun champ rempli ni vide (validation désactivée)', () => {
    const personne = { ...structurePersonne, nom: 'Dupont', prenoms: 'Jean' };
    const errors = initialiserErreurs(personne, 'enfant');

    expect(errors).not.toHaveProperty('nom');
    expect(errors).not.toHaveProperty('prenoms');
    expect(errors).not.toHaveProperty('adresse');
    expect(errors).toEqual({});
  });

  test('retourne un objet vide quand type non spécifié (défaut enfant)', () => {
    const personne = { ...structurePersonne };
    const errors = initialiserErreurs(personne);

    expect(errors).toEqual({});
  });
});

// --- estChaineVide ---

describe('estChaineVide', () => {
  test('retourne true pour null', () => {
    expect(estChaineVide(null)).toBe(true);
  });

  test('retourne true pour undefined', () => {
    expect(estChaineVide(undefined)).toBe(true);
  });

  test('retourne true pour une chaîne vide', () => {
    expect(estChaineVide('')).toBe(true);
  });

  test('retourne true pour des espaces uniquement', () => {
    expect(estChaineVide('   ')).toBe(true);
  });

  test('retourne false pour une chaîne non vide', () => {
    expect(estChaineVide('Dupont')).toBe(false);
  });
});

// --- verifierErreurs ---

describe('verifierErreurs', () => {
  // La validation a été désactivée dans le code de prod : verifierErreurs
  // retourne désormais toujours false (aucun champ n'est signalé en erreur,
  // tous sont optionnels). Les tests reflètent ce comportement actuel.
  test('retourne false pour email quand type est enfant', () => {
    expect(verifierErreurs({ email: '' }, 'email', 'enfant')).toBe(false);
  });

  test('retourne false pour email vide quand type est adulte (validation désactivée)', () => {
    expect(verifierErreurs({ email: '' }, 'email', 'adulte')).toBe(false);
  });

  test('retourne false pour un champ commun vide (validation désactivée)', () => {
    expect(verifierErreurs({ nom: '' }, 'nom', 'enfant')).toBe(false);
  });

  test('retourne false pour un champ commun rempli', () => {
    expect(verifierErreurs({ nom: 'Dupont' }, 'nom', 'enfant')).toBe(false);
  });

  test('retourne false pour un champ adulte vide quand type adulte (validation désactivée)', () => {
    expect(verifierErreurs({ profession: '' }, 'profession', 'adulte')).toBe(false);
  });

  test('retourne false pour un champ adulte quand type enfant', () => {
    expect(verifierErreurs({ profession: '' }, 'profession', 'enfant')).toBe(false);
  });

  test('retourne false pour une propriété inconnue', () => {
    expect(verifierErreurs({ foo: '' }, 'foo', 'adulte')).toBe(false);
  });
});

// --- adjustMaritalStatus ---

describe('adjustMaritalStatus', () => {
  test('ajuste Marié vers Mariée pour Feminin', () => {
    expect(adjustMaritalStatus('Marié', 'Feminin', optionsStatusMaritaux)).toBe('Mariée');
  });

  test('ajuste Mariée vers Marié pour Masculin', () => {
    expect(adjustMaritalStatus('Mariée', 'Masculin', optionsStatusMaritaux)).toBe('Marié');
  });

  test('ajuste Veuf vers Veuve pour Feminin', () => {
    expect(adjustMaritalStatus('Veuf', 'Feminin', optionsStatusMaritaux)).toBe('Veuve');
  });

  test('ajuste Veuve vers Veuf pour Masculin', () => {
    expect(adjustMaritalStatus('Veuve', 'Masculin', optionsStatusMaritaux)).toBe('Veuf');
  });

  test('ajuste Pacsé vers Pacsée pour Feminin', () => {
    expect(adjustMaritalStatus('Pacsé', 'Feminin', optionsStatusMaritaux)).toBe('Pacsée');
  });

  test('ajuste Séparé vers Séparée pour Feminin', () => {
    expect(adjustMaritalStatus('Séparé', 'Feminin', optionsStatusMaritaux)).toBe('Séparée');
  });

  test('garde Célibataire inchangé pour Masculin', () => {
    expect(adjustMaritalStatus('Célibataire', 'Masculin', optionsStatusMaritaux)).toBe('Célibataire');
  });

  test('garde Célibataire inchangé pour Feminin', () => {
    expect(adjustMaritalStatus('Célibataire', 'Feminin', optionsStatusMaritaux)).toBe('Célibataire');
  });

  test('garde Maritale inchangé pour les deux genres', () => {
    expect(adjustMaritalStatus('Maritale', 'Masculin', optionsStatusMaritaux)).toBe('Maritale');
    expect(adjustMaritalStatus('Maritale', 'Feminin', optionsStatusMaritaux)).toBe('Maritale');
  });
});

// --- validateForm ---

describe('validateForm', () => {
  test('compte les valeurs truthy (erreurs)', () => {
    expect(validateForm({ nom: true, email: false, ville: true })).toBe(2);
  });

  test('retourne 0 quand toutes les valeurs sont false', () => {
    expect(validateForm({ nom: false, email: false })).toBe(0);
  });

  test('retourne le total quand toutes sont true', () => {
    expect(validateForm({ nom: true, email: true })).toBe(2);
  });
});

// --- updatePositions ---

describe('updatePositions', () => {
  test('assigne des positions séquentielles 0, 1, 2', () => {
    const liste = [{ nom: 'A' }, { nom: 'B' }, { nom: 'C' }];
    const result = updatePositions(liste);

    expect(result[0].position).toBe(0);
    expect(result[1].position).toBe(1);
    expect(result[2].position).toBe(2);
  });

  test('retourne un tableau vide pour une liste vide', () => {
    expect(updatePositions([])).toEqual([]);
  });
});

// --- updateNavigationArrows ---

describe('updateNavigationArrows', () => {
  test('les deux flèches sont false quand la liste est vide en mode ADD', () => {
    const state = { liste: [], mode: 'ADD', currentPersonne: {} };
    const result = updateNavigationArrows(state);

    expect(result.isRightArrow).toBe(false);
    expect(result.isLeftArrow).toBe(false);
  });

  test('isRightArrow est true quand la liste n est pas vide en mode EDIT', () => {
    const state = { liste: [{}], mode: 'EDIT', currentPersonne: { position: 0 } };
    const result = updateNavigationArrows(state);

    expect(result.isRightArrow).toBe(true);
  });

  test('isRightArrow est false en mode ADD', () => {
    const state = { liste: [{}], mode: 'ADD', currentPersonne: {} };
    const result = updateNavigationArrows(state);

    expect(result.isRightArrow).toBe(false);
  });

  test('isLeftArrow est true en mode ADD quand la liste n est pas vide', () => {
    const state = { liste: [{}], mode: 'ADD', currentPersonne: {} };
    const result = updateNavigationArrows(state);

    expect(result.isLeftArrow).toBe(true);
  });

  test('isLeftArrow est false en mode EDIT à la position 0', () => {
    const state = { liste: [{}], mode: 'EDIT', currentPersonne: { position: 0 } };
    const result = updateNavigationArrows(state);

    expect(result.isLeftArrow).toBe(false);
  });

  test('isLeftArrow est true en mode EDIT à la position > 0', () => {
    const state = { liste: [{}, {}], mode: 'EDIT', currentPersonne: { position: 1 } };
    const result = updateNavigationArrows(state);

    expect(result.isLeftArrow).toBe(true);
  });
});

// --- updateErrors ---

describe('updateErrors', () => {
  test('réinitialise toutes les erreurs quand propriete est type', () => {
    // Validation désactivée : quand propriete === 'type', updateErrors délègue à
    // initialiserErreurs qui retourne désormais un objet vide.
    const personne = { ...structurePersonne, nom: 'Dupont' };
    const result = updateErrors(personne, 'type', 'adulte', {});

    expect(result).toEqual({});
  });

  test('met à jour uniquement l erreur spécifique pour un autre champ', () => {
    const personne = { ...structurePersonne, nom: 'Dupont' };
    const currentErrors = { nom: true, adresse: true };
    const result = updateErrors(personne, 'nom', 'enfant', currentErrors);

    expect(result.nom).toBe(false); // nom rempli
    expect(result.adresse).toBe(true); // inchangé
  });
});

// --- updateField ---

describe('updateField', () => {
  const baseState = resetFormState();

  test('met à jour personne.nom', () => {
    const result = updateField(baseState, 'nom', 'Dupont');

    expect(result.personne.nom).toBe('Dupont');
    expect(result.errors.nom).toBe(false);
  });

  test('retourne l état inchangé quand field est vide', () => {
    const result = updateField(baseState, '', 'valeur');

    expect(result).toEqual(baseState);
  });

  test('met à jour emailValid quand field est email', () => {
    const result = updateField(baseState, 'email', 'test@example.com');

    expect(result.emailValid).toBe(true);
  });

  test('emailValid est false pour un email invalide', () => {
    const result = updateField(baseState, 'email', 'invalid');

    expect(result.emailValid).toBe(false);
  });

  test('ajuste le statut marital quand field est genre', () => {
    // D'abord mettre un statut marital masculin
    const stateWithStatus = {
      ...baseState,
      currentStatusMarital: 'Marié',
      personne: { ...baseState.personne, maritalStatus: 'Marié' },
    };

    const result = updateField(stateWithStatus, 'genre', 'Feminin');

    expect(result.currentStatusMarital).toBe('Mariée');
    expect(result.personne.maritalStatus).toBe('Mariée');
  });

  test('met à jour les options de statut marital quand field est maritalStatus', () => {
    const result = updateField(baseState, 'maritalStatus', 'Marié');

    expect(result.currentStatusMarital).toBe('Marié');
    expect(result.optionsStatusMaritauxForm).not.toContain('Marié');
  });

  test('filtre les clés undefined dans personne', () => {
    const stateWithUndefined = {
      ...baseState,
      personne: { ...baseState.personne, undefined: 'garbage' },
    };

    const result = updateField(stateWithUndefined, 'nom', 'Test');

    expect(result.personne).not.toHaveProperty('undefined');
  });
});

// --- resetFormState ---

describe('resetFormState', () => {
  test('retourne un état avec toutes les propriétés attendues', () => {
    const state = resetFormState();

    expect(state).toHaveProperty('personne');
    expect(state).toHaveProperty('optionsStatusMaritaux');
    expect(state).toHaveProperty('currentStatusMarital');
    expect(state).toHaveProperty('optionsStatusMaritauxForm');
    expect(state).toHaveProperty('errors');
    expect(state).toHaveProperty('mode', 'ADD');
    expect(state).toHaveProperty('emailValid', false);
    expect(state).toHaveProperty('liste');
    expect(state).toHaveProperty('isRightArrow', false);
    expect(state).toHaveProperty('isLeftArrow', false);
    expect(state).toHaveProperty('submitAttempted', false);
    expect(state).toHaveProperty('currentFormType', 'enfant');
  });

  test('personne a le statut marital initial', () => {
    const state = resetFormState();
    expect(state.personne.maritalStatus).toBe(currentStatusMaritalInitial);
  });
});

// --- loadInitialState ---

describe('loadInitialState', () => {
  test('retourne l état sauvegardé depuis localStorage', () => {
    const savedData = { personne: { nom: 'Dupont' }, mode: 'EDIT' };
    jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(JSON.stringify(savedData));

    const result = loadInitialState();
    expect(result).toEqual(savedData);

    Storage.prototype.getItem.mockRestore();
  });

  test('retourne resetFormState quand rien en localStorage', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);

    const result = loadInitialState();
    expect(result).toEqual(resetFormState());

    Storage.prototype.getItem.mockRestore();
  });
});

// --- saveStateToLocalStorage ---

describe('saveStateToLocalStorage', () => {
  test('sauvegarde l état dans localStorage', () => {
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation();
    const state = { personne: { nom: 'Test' } };

    saveStateToLocalStorage(state);

    expect(spy).toHaveBeenCalledWith('personneChargeData', JSON.stringify(state));
    spy.mockRestore();
  });
});
