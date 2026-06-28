import { isValidEmail, countErrors } from '../validationHelpers';

describe('isValidEmail', () => {
  test('retourne true pour un email standard valide', () => {
    expect(isValidEmail('test@example.com')).toBe(true);
  });

  test('retourne true pour un email avec sous-domaine', () => {
    expect(isValidEmail('user@mail.example.com')).toBe(true);
  });

  test('retourne true pour un email avec caractères spéciaux avant @', () => {
    expect(isValidEmail('user.name+tag@example.com')).toBe(true);
  });

  test('retourne false pour null', () => {
    expect(isValidEmail(null)).toBe(false);
  });

  test('retourne false pour undefined', () => {
    expect(isValidEmail(undefined)).toBe(false);
  });

  test('retourne false pour une chaîne vide', () => {
    expect(isValidEmail('')).toBe(false);
  });

  test('retourne false pour un non-string (number)', () => {
    expect(isValidEmail(42)).toBe(false);
  });

  test('retourne false sans @', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
  });

  test('retourne false sans domaine', () => {
    expect(isValidEmail('user@')).toBe(false);
  });

  test('retourne false sans partie locale', () => {
    expect(isValidEmail('@example.com')).toBe(false);
  });
});

describe('countErrors', () => {
  test('compte les valeurs truthy dans un objet mixte', () => {
    expect(countErrors({ nom: true, email: false, ville: true })).toBe(2);
  });

  test('retourne 0 pour un objet vide', () => {
    expect(countErrors({})).toBe(0);
  });

  test('retourne 0 quand toutes les valeurs sont false', () => {
    expect(countErrors({ nom: false, email: false })).toBe(0);
  });

  test('retourne le total quand toutes les valeurs sont true', () => {
    expect(countErrors({ nom: true, email: true, ville: true })).toBe(3);
  });
});
