import {
  buildDossierContactEditNavigation,
  clearDossierContactFocus,
  findFocusedDossierEntity,
  isClassicContactEntity,
  readDossierContactFocus,
} from '../contactEditNavigation';

describe('navigation vers le formulaire classique depuis une fiche rapide de dossier', () => {
  const selectedParty = {
    id: 'contact/romain 1',
    label: 'Romain Aubert',
    type: 'Partie',
    isContre: true,
    fullObject: {
      _id: 'contact/romain 1',
      nom: 'Aubert',
      prenoms: 'Romain',
      contactType: 'physique',
    },
  };

  test('reconnait uniquement les Parties et Contacts geres par le formulaire classique', () => {
    expect(isClassicContactEntity(selectedParty)).toBe(true);
    expect(isClassicContactEntity({
      id: 'societe-1',
      type: 'Contact',
      fullObject: { _id: 'societe-1', raisonSociale: 'Nova Conseil' },
    })).toBe(true);

    expect(isClassicContactEntity({
      id: 'office-user-1',
      type: 'Contact',
      fullObject: { _id: 'office-user-1', nomOfficeUser: 'Jalet', fromResponsable: true },
    })).toBe(false);
    expect(isClassicContactEntity({
      id: 'avocat-externe-1',
      type: 'Avocat',
      fullObject: { _id: 'avocat-externe-1', nomOfficeUser: 'Durand', fromResponsable: false },
    })).toBe(true);
    expect(isClassicContactEntity({ type: 'Partie', fullObject: {} })).toBe(false);
  });

  test('construit l URL d edition et le retour singulier vers la meme fiche', () => {
    const navigation = buildDossierContactEditNavigation({
      dossierId: 'dossier 42',
      selectedEntity: selectedParty,
    });

    expect(navigation).not.toBeNull();
    expect(navigation.state).toEqual({
      contactReturn: {
        to: '/dashboard/dossier?dossierId=dossier+42&focusContactId=contact%2Fromain+1&focusEntityType=Partie&focusSide=contre',
        label: 'Retour au contact',
      },
    });
    expect(navigation.to).toBe(
      '/dashboard/createContact?contactId=contact%2Fromain+1&returnDossierId=dossier+42&returnEntityType=Partie&returnSide=contre',
    );
  });

  test('refuse une navigation incomplete ou une entite non classique', () => {
    expect(buildDossierContactEditNavigation({ dossierId: '', selectedEntity: selectedParty })).toBeNull();
    expect(buildDossierContactEditNavigation({ dossierId: 'd1', selectedEntity: null })).toBeNull();
    expect(buildDossierContactEditNavigation({
      dossierId: 'd1',
      selectedEntity: {
        id: 'av1',
        type: 'Avocat',
        fullObject: { _id: 'av1', fromResponsable: true },
      },
    })).toBeNull();
  });
});

describe('restauration de la fiche rapide au retour du formulaire', () => {
  const dossierRecharge = {
    dossier: {
      parties: {
        pour: [{
          partieData: { _id: 'partie-pour', nom: 'Charpentier', prenoms: 'Louise' },
          contacts: [{ _id: 'contact-pour', raisonSociale: 'Conseil Louise' }],
          avocats: [],
        }],
        contre: [{
          partieData: {
            _id: 'partie-contre',
            nom: 'Aubert',
            prenoms: 'Romain',
            ville: 'Bernay',
          },
          contacts: [{
            _id: 'contact-contre',
            denomination: "Mairie d'Evreux",
            ville: 'Evreux',
          }],
          avocats: [{ _id: 'avocat-contre', nomOfficeUser: 'Jalet', prenomOfficeUser: 'Pierre' }],
        }],
      },
    },
  };

  test('lit le contexte de retour et restaure la Partie du bon cote avec les donnees rechargees', () => {
    const search = '?dossierId=dossier-42&focusContactId=partie-contre&focusEntityType=Partie&focusSide=contre';
    const focus = readDossierContactFocus(search);

    expect(focus).toEqual({
      contactId: 'partie-contre',
      entityType: 'Partie',
      side: 'contre',
    });

    const restored = findFocusedDossierEntity(dossierRecharge, focus);
    expect(restored).toMatchObject({
      id: 'partie-contre',
      label: 'Romain Aubert',
      type: 'Partie',
      isContre: true,
      fullObject: {
        _id: 'partie-contre',
        ville: 'Bernay',
        isContre: true,
      },
    });
  });

  test('restaure aussi un Contact lie, sans confondre type ni cote', () => {
    expect(findFocusedDossierEntity(dossierRecharge, {
      contactId: 'contact-contre',
      entityType: 'Contact',
      side: 'contre',
    })).toMatchObject({
      id: 'contact-contre',
      label: "Mairie d'Evreux",
      type: 'Contact',
      isContre: true,
    });

    expect(findFocusedDossierEntity(dossierRecharge, {
      contactId: 'contact-contre',
      entityType: 'Partie',
      side: 'contre',
    })).toBeNull();
    expect(findFocusedDossierEntity(dossierRecharge, {
      contactId: 'contact-contre',
      entityType: 'Contact',
      side: 'pour',
    })).toBeNull();
  });

  test('restaure une partie au format direct et conserve son type metier', () => {
    const dossierLegacy = {
      dossier: {
        parties: {
          pour: [{
            _id: 'partie-directe',
            nom: 'Martin',
            prenoms: 'Alice',
            type: 'Partie (Client/Adversaire)',
            contacts: [],
            avocats: [],
          }],
          contre: [],
        },
      },
    };

    expect(findFocusedDossierEntity(dossierLegacy, {
      contactId: 'partie-directe',
      entityType: 'Partie',
      side: 'pour',
    })).toMatchObject({
      id: 'partie-directe',
      label: 'Alice Martin',
      type: 'Partie',
      fullObject: { type: 'Partie (Client/Adversaire)' },
    });
  });

  test('supprime seulement les parametres de restauration apres consommation', () => {
    const search = '?dossierId=dossier-42&focusContactId=partie-contre&focusEntityType=Partie&focusSide=contre&onglet=documents';
    expect(clearDossierContactFocus(search)).toBe('?dossierId=dossier-42&onglet=documents');
    expect(clearDossierContactFocus('?focusContactId=c1&focusEntityType=Contact&focusSide=pour')).toBe('');
  });

  test('retourne null si le contact du contexte n existe plus dans le dossier recharge', () => {
    expect(findFocusedDossierEntity(dossierRecharge, {
      contactId: 'contact-supprime',
      entityType: 'Contact',
      side: 'contre',
    })).toBeNull();
  });
});
