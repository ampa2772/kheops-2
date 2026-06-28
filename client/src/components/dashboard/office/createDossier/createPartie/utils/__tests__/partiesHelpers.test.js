// partiesHelpers.test.js — Tests des utilitaires de gestion des parties
import {
  arraysAreEqual,
  intersectArrays,
  formatContact,
  formatProContact,
  getInitials,
} from '../partiesHelpers';

// ===================== arraysAreEqual =====================
describe('arraysAreEqual', () => {
  it('retourne true pour la meme reference', () => {
    const arr = [{ _id: '1' }];
    expect(arraysAreEqual(arr, arr)).toBe(true);
  });

  it('retourne true pour deux tableaux identiques (memes _id)', () => {
    const arr1 = [{ _id: '1' }, { _id: '2' }];
    const arr2 = [{ _id: '1' }, { _id: '2' }];
    expect(arraysAreEqual(arr1, arr2)).toBe(true);
  });

  it('retourne true meme si l ordre est different', () => {
    const arr1 = [{ _id: '2' }, { _id: '1' }];
    const arr2 = [{ _id: '1' }, { _id: '2' }];
    expect(arraysAreEqual(arr1, arr2)).toBe(true);
  });

  it('retourne false pour des longueurs differentes', () => {
    const arr1 = [{ _id: '1' }];
    const arr2 = [{ _id: '1' }, { _id: '2' }];
    expect(arraysAreEqual(arr1, arr2)).toBe(false);
  });

  it('retourne false si un tableau est null', () => {
    expect(arraysAreEqual(null, [{ _id: '1' }])).toBe(false);
  });

  it('retourne false si un tableau est undefined', () => {
    expect(arraysAreEqual(undefined, [{ _id: '1' }])).toBe(false);
  });

  it('retourne true pour deux tableaux vides', () => {
    expect(arraysAreEqual([], [])).toBe(true);
  });

  it('retourne false si un element n a pas de _id (avec console.warn)', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const arr1 = [{ _id: '1' }, { name: 'sans id' }];
    const arr2 = [{ _id: '1' }, { _id: '2' }];
    expect(arraysAreEqual(arr1, arr2)).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('retourne false si un seul _id differe', () => {
    const arr1 = [{ _id: '1' }, { _id: '2' }];
    const arr2 = [{ _id: '1' }, { _id: '3' }];
    expect(arraysAreEqual(arr1, arr2)).toBe(false);
  });

  it('utilise les valeurs par defaut (tableaux vides) sans arguments', () => {
    expect(arraysAreEqual()).toBe(true);
  });
});

// ===================== intersectArrays =====================
describe('intersectArrays', () => {
  it('retourne un tableau vide pour un tableau vide', () => {
    expect(intersectArrays([])).toEqual([]);
  });

  it('retourne une copie du tableau pour un seul tableau', () => {
    const single = [{ _id: '1', nom: 'A' }, { _id: '2', nom: 'B' }];
    const result = intersectArrays([single]);
    expect(result).toEqual(single);
    expect(result).not.toBe(single); // copie, pas meme reference
  });

  it('retourne l intersection de deux tableaux', () => {
    const arr1 = [{ _id: '1' }, { _id: '2' }, { _id: '3' }];
    const arr2 = [{ _id: '2' }, { _id: '3' }, { _id: '4' }];
    const result = intersectArrays([arr1, arr2]);
    expect(result.map(i => i._id)).toEqual(['2', '3']);
  });

  it('retourne un tableau vide si aucun element commun', () => {
    const arr1 = [{ _id: '1' }];
    const arr2 = [{ _id: '2' }];
    expect(intersectArrays([arr1, arr2])).toEqual([]);
  });

  it('gere l intersection de trois tableaux', () => {
    const arr1 = [{ _id: '1' }, { _id: '2' }, { _id: '3' }];
    const arr2 = [{ _id: '2' }, { _id: '3' }, { _id: '4' }];
    const arr3 = [{ _id: '3' }, { _id: '4' }, { _id: '5' }];
    const result = intersectArrays([arr1, arr2, arr3]);
    expect(result.map(i => i._id)).toEqual(['3']);
  });

  it('filtre silencieusement les elements sans _id', () => {
    const arr1 = [{ _id: '1' }, { noId: true }];
    const arr2 = [{ _id: '1' }];
    // Le tableau vide apres filtrage d un element → intersection vide si l array filtre est vide?
    // Non: arr1 filtre = [{ _id: '1' }], arr2 = [{ _id: '1' }]
    const result = intersectArrays([arr1, arr2]);
    expect(result.map(i => i._id)).toEqual(['1']);
  });

  it('traite un non-tableau dans l entree comme tableau vide', () => {
    const arr1 = [{ _id: '1' }];
    // Un non-tableau rend le cleaned array vide → intersection vide
    expect(intersectArrays([arr1, 'pas-un-tableau'])).toEqual([]);
  });

  it('retourne un tableau vide pour null/undefined', () => {
    expect(intersectArrays(null)).toEqual([]);
    expect(intersectArrays(undefined)).toEqual([]);
  });

  it('compare les _id via toString pour robustesse', () => {
    const arr1 = [{ _id: 1 }, { _id: 2 }];
    const arr2 = [{ _id: '1' }, { _id: '3' }];
    // 1.toString() === '1' → devrait matcher
    const result = intersectArrays([arr1, arr2]);
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe(1);
  });

  it('optimisation early-exit quand intersection vide', () => {
    const arr1 = [{ _id: '1' }];
    const arr2 = [{ _id: '2' }];
    const arr3 = [{ _id: '1' }]; // ne devrait pas etre verifie car deja vide
    expect(intersectArrays([arr1, arr2, arr3])).toEqual([]);
  });
});

// ===================== formatContact =====================
describe('formatContact', () => {
  it('formate une personne physique (nom + prenoms)', () => {
    expect(formatContact({ nom: 'Dupont', prenoms: 'Jean' })).toBe('Dupont Jean');
  });

  it('ajoute nom de naissance si present', () => {
    expect(formatContact({ nom: 'Dupont', prenoms: 'Marie', nom_de_naissance: 'Martin' }))
      .toBe('Dupont Marie né(e) Martin');
  });

  it('formate une personne morale privee (raisonSociale)', () => {
    expect(formatContact({ raisonSociale: 'SCI Martin', villePM: 'Paris' }))
      .toBe('SCI Martin Paris');
  });

  it('formate une personne morale publique (denomination)', () => {
    expect(formatContact({ denomination: 'Mairie', ville: 'Lyon' }))
      .toBe('Mairie Lyon');
  });

  it('formate un OfficeUser', () => {
    expect(formatContact({ nomOfficeUser: 'Dupont', prenomOfficeUser: 'Jean' }))
      .toBe('Dupont Jean');
  });

  it('ajoute (Avocat) pour un contact pro de type Avocat', () => {
    expect(formatContact({ nom: 'Dupont', prenoms: 'Jean', pro_contact: true, type: 'Avocat' }))
      .toBe('Dupont Jean (Avocat)');
  });

  it('ajoute (Avocat) pour un contact avec isAvocat=true', () => {
    expect(formatContact({ nomOfficeUser: 'Dupont', prenomOfficeUser: 'Jean', isAvocat: true }))
      .toBe('Dupont Jean (Avocat)');
  });

  it('ajoute (Avocat) via roleOfficeUser contenant "avocat"', () => {
    expect(formatContact({ nomOfficeUser: 'Dupont', prenomOfficeUser: 'Jean', roleOfficeUser: 'Avocat associé' }))
      .toBe('Dupont Jean (Avocat)');
  });

  it('ajoute le type pour un pro non-avocat', () => {
    expect(formatContact({ nom: 'Dupont', prenoms: 'Jean', pro_contact: true, type: 'Notaire' }))
      .toBe('Dupont Jean (Notaire)');
  });

  it('retourne une chaine vide pour null', () => {
    expect(formatContact(null)).toBe('');
  });

  it('retourne une chaine vide pour un objet vide', () => {
    expect(formatContact({})).toBe('');
  });

  it('gere un nom seul sans prenoms', () => {
    expect(formatContact({ nom: 'Cabinet Dupont' })).toBe('Cabinet Dupont');
  });

  it('raisonSociale sans villePM → pas d espace supplementaire', () => {
    expect(formatContact({ raisonSociale: 'SCI Martin' })).toBe('SCI Martin');
  });
});

// ===================== formatProContact =====================
describe('formatProContact', () => {
  it('pro non-avocat → nom sans type', () => {
    expect(formatProContact({ nom: 'Dupont', prenoms: 'Jean', pro_contact: true, type: 'Notaire' }))
      .toBe('Dupont Jean');
  });

  it('avocat → nom + (Avocat)', () => {
    expect(formatProContact({ nom: 'Dupont', prenoms: 'Jean', pro_contact: true, type: 'Avocat' }))
      .toBe('Dupont Jean (Avocat)');
  });

  it('non-pro → formatContact standard', () => {
    expect(formatProContact({ nom: 'Dupont', prenoms: 'Jean' }))
      .toBe('Dupont Jean');
  });

  it('retourne une chaine vide pour un objet vide', () => {
    expect(formatProContact({})).toBe('');
  });
});

// ===================== getInitials =====================
describe('getInitials', () => {
  it('retourne les initiales de deux mots', () => {
    expect(getInitials('Jean Dupont')).toBe('JD');
  });

  it('retourne une seule initiale pour un seul mot', () => {
    expect(getInitials('Marie')).toBe('M');
  });

  it('retourne max 2 initiales pour trois mots ou plus', () => {
    expect(getInitials('Jean Pierre Dupont')).toBe('JP');
  });

  it('retourne une chaine vide pour une chaine vide', () => {
    expect(getInitials('')).toBe('');
  });

  it('retourne une chaine vide pour null', () => {
    expect(getInitials(null)).toBe('');
  });

  it('retourne une chaine vide pour undefined', () => {
    expect(getInitials(undefined)).toBe('');
  });

  it('gere les espaces multiples', () => {
    expect(getInitials('  Jean   Dupont  ')).toBe('JD');
  });
});
