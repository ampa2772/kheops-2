// FonctionsDetailMariage.test.js — Tests des fonctions utilitaires mariage/notaire
import {
  buildErrorObject,
  formatDateForInput,
  notaryInit,
  excludedFields,
  isValidEmail,
} from '../FonctionsDetailMariage';

// ===================== buildErrorObject =====================
describe('buildErrorObject', () => {
  it('exclut les champs de excludedFields et met les autres a true', () => {
    const notaryObject = {
      nom: 'Dupont',
      prenoms: 'Jean',
      email: 'j@d.com',
      telephone: '01',
      type: 'Notaire',        // exclu
      genre: 'Masculin',      // exclu
      profession: 'Notaire',  // exclu
    };
    const errors = buildErrorObject(notaryObject);
    expect(errors.nom).toBe(true);
    expect(errors.prenoms).toBe(true);
    expect(errors.email).toBe(true);
    expect(errors.telephone).toBe(true);
    expect(errors.type).toBeUndefined();
    expect(errors.genre).toBeUndefined();
    expect(errors.profession).toBeUndefined();
  });

  it('retourne un objet vide pour un objet vide', () => {
    const errors = buildErrorObject({});
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('exclut tous les excludedFields meme s ils sont les seuls champs', () => {
    const onlyExcluded = {
      type: 'Notaire',
      genre: 'Masculin',
      profession: 'Notaire',
      appellationCourrier: 'Mon cher Maitre',
      contactType: 'physique',
      pro_contact: true,
    };
    const errors = buildErrorObject(onlyExcluded);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('construit l objet erreurs pour notaryInit complet', () => {
    const errors = buildErrorObject(notaryInit);
    // notaryInit a : nom, prenoms, email, telephone, adresse, ville, codePostal, type, genre, profession, appellationCourrier, contactType, pro_contact
    // Apres exclusion de type, genre, profession, appellationCourrier, contactType, pro_contact → 7 champs
    expect(Object.keys(errors)).toHaveLength(7);
    expect(errors.nom).toBe(true);
    expect(errors.adresse).toBe(true);
  });
});

// ===================== formatDateForInput =====================
describe('formatDateForInput', () => {
  it('formate une date ISO string en YYYY-MM-DD', () => {
    const result = formatDateForInput('2024-03-15T10:30:00.000Z');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe('2024-03-15');
  });

  it('retourne une chaine vide pour null', () => {
    expect(formatDateForInput(null)).toBe('');
  });

  it('retourne une chaine vide pour undefined', () => {
    expect(formatDateForInput(undefined)).toBe('');
  });

  it('retourne une chaine vide pour une date invalide', () => {
    expect(formatDateForInput('pas-une-date')).toBe('');
  });

  it('formate le premier jour du mois correctement', () => {
    const result = formatDateForInput('2024-01-01T00:00:00.000Z');
    expect(result).toBe('2024-01-01');
  });

  it('formate le dernier jour du mois correctement', () => {
    // Utilise une heure de midi UTC pour eviter les decalages timezone
    const result = formatDateForInput('2024-12-31T12:00:00.000Z');
    expect(result).toBe('2024-12-31');
  });

  it('retourne une chaine vide pour une chaine vide', () => {
    expect(formatDateForInput('')).toBe('');
  });
});

// ===================== notaryInit =====================
describe('notaryInit', () => {
  it('a les valeurs par defaut correctes', () => {
    expect(notaryInit.nom).toBe('');
    expect(notaryInit.prenoms).toBe('');
    expect(notaryInit.email).toBe('');
    expect(notaryInit.type).toBe('Notaire');
    expect(notaryInit.genre).toBe('Masculin');
    expect(notaryInit.profession).toBe('Notaire');
  });

  it('a contactType = physique', () => {
    expect(notaryInit.contactType).toBe('physique');
  });

  it('a pro_contact = true', () => {
    expect(notaryInit.pro_contact).toBe(true);
  });

  it('a appellationCourrier "Mon cher Maitre"', () => {
    expect(notaryInit.appellationCourrier).toBe('Mon cher Maître');
  });
});

// ===================== excludedFields =====================
describe('excludedFields', () => {
  it('contient exactement 6 champs', () => {
    expect(excludedFields).toHaveLength(6);
  });

  it('contient les champs attendus', () => {
    expect(excludedFields).toContain('type');
    expect(excludedFields).toContain('genre');
    expect(excludedFields).toContain('profession');
    expect(excludedFields).toContain('appellationCourrier');
    expect(excludedFields).toContain('contactType');
    expect(excludedFields).toContain('pro_contact');
  });
});

// ===================== isValidEmail (re-export) =====================
describe('isValidEmail (re-export depuis validationHelpers)', () => {
  it('retourne true pour un email valide', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
  });

  it('retourne false pour un email invalide', () => {
    expect(isValidEmail('pas-un-email')).toBe(false);
  });

  it('retourne false pour une chaine vide', () => {
    expect(isValidEmail('')).toBe(false);
  });
});
