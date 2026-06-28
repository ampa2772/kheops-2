// capitalizeNames.test.js — Tests de la fonction capitalizeNames
import { capitalizeNames } from '../index';

describe('capitalizeNames', () => {
  it('met la premiere lettre en majuscule pour un mot simple', () => {
    expect(capitalizeNames('dupont')).toBe('Dupont');
  });

  it('gere un nom compose avec espace', () => {
    expect(capitalizeNames('jean pierre')).toBe('Jean Pierre');
  });

  it('ajoute une apostrophe apres une lettre seule suivie d un mot', () => {
    expect(capitalizeNames('d avignon')).toBe("D'Avignon");
  });

  it('met en majuscule une lettre seule en fin sans apostrophe', () => {
    expect(capitalizeNames('avenue b')).toBe('Avenue B');
  });

  it('garde les articles en minuscule sauf en premiere position', () => {
    expect(capitalizeNames('paris sur seine')).toBe('Paris sur Seine');
  });

  it('met le premier mot en majuscule meme si c est un article', () => {
    expect(capitalizeNames('le mans')).toBe('Le Mans');
  });

  it('remplace "alencon" par "Alencon" avec cedille', () => {
    expect(capitalizeNames('alencon')).toBe('Alençon');
  });

  it('remplace "besancon" par "Besancon" avec cedille', () => {
    expect(capitalizeNames('besancon')).toBe('Besançon');
  });

  it('supprime les espaces en debut et fin', () => {
    expect(capitalizeNames('  dupont  ')).toBe('Dupont');
  });

  it('gere les prepositions multiples', () => {
    expect(capitalizeNames('saint germain en laye')).toBe('Saint Germain en Laye');
  });

  it('gere les lettres seules consecutives', () => {
    // "l isle d abeau" → "L'Isle D'Abeau"
    const result = capitalizeNames('l isle d abeau');
    expect(result).toBe("L'Isle D'Abeau");
  });

  it('gere un mot tout en majuscules (converti en minuscules d abord)', () => {
    expect(capitalizeNames('PARIS')).toBe('Paris');
  });
});
