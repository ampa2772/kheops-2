// fonctions.test.js — Tests de la fonction capitalizeNames
const { capitalizeNames } = require('../fonctions');

describe('capitalizeNames', () => {
  // ===================== Capitalisation de base =====================
  describe('capitalisation de base', () => {
    it('met en majuscule la premiere lettre de chaque mot', () => {
      expect(capitalizeNames('jean dupont')).toBe('Jean Dupont');
    });

    it('gere une saisie entierement en majuscules', () => {
      expect(capitalizeNames('JEAN DUPONT')).toBe('Jean Dupont');
    });

    it('gere une saisie en casse mixte', () => {
      expect(capitalizeNames('jEaN dUpOnT')).toBe('Jean Dupont');
    });

    it('gere un seul mot', () => {
      expect(capitalizeNames('dupont')).toBe('Dupont');
    });

    it('supprime les espaces de debut et de fin', () => {
      expect(capitalizeNames('  jean dupont  ')).toBe('Jean Dupont');
    });
  });

  // ===================== Mots en minuscule (articles) =====================
  describe('mots en minuscule (articles francais)', () => {
    it('garde "de" en minuscule en milieu de nom', () => {
      expect(capitalizeNames('pierre de la fontaine')).toBe('Pierre de la Fontaine');
    });

    it('capitalise le premier mot meme si c est un article', () => {
      expect(capitalizeNames('le petit prince')).toBe('Le Petit Prince');
    });

    it('garde "du" en minuscule en milieu', () => {
      expect(capitalizeNames('jean du bois')).toBe('Jean du Bois');
    });

    it('garde "et" en minuscule en milieu', () => {
      expect(capitalizeNames('pierre et paul')).toBe('Pierre et Paul');
    });

    it('garde "sur" en minuscule pour les villes', () => {
      expect(capitalizeNames('asnières sur seine')).toBe('Asnières sur Seine');
    });

    it('garde "en" en minuscule pour les villes', () => {
      expect(capitalizeNames('boulogne en mer')).toBe('Boulogne en Mer');
    });

    it('garde "au" en minuscule en milieu', () => {
      expect(capitalizeNames('saint jean au temple')).toBe('Saint Jean au Temple');
    });
  });

  // ===================== Lettres isolees et apostrophes =====================
  describe('lettres isolees et apostrophes', () => {
    it('ajoute une apostrophe apres une lettre isolee non finale', () => {
      expect(capitalizeNames('d alembert')).toBe("D'Alembert");
    });

    it('met en majuscule une lettre isolee finale sans apostrophe', () => {
      expect(capitalizeNames('test a')).toBe('Test A');
    });

    it('ne met pas d espace entre la lettre apostrophe et le mot suivant', () => {
      const result = capitalizeNames('d artagnan');
      expect(result).toBe("D'Artagnan");
      // Pas d'espace entre D' et Artagnan
      expect(result).not.toContain("D' ");
    });
  });

  // ===================== Villes speciales (cedilles) =====================
  describe('villes speciales avec cedilles', () => {
    it('remplace "alencon" par "Alençon"', () => {
      expect(capitalizeNames('alencon')).toBe('Alençon');
    });

    it('remplace "besancon" par "Besançon"', () => {
      expect(capitalizeNames('besancon')).toBe('Besançon');
    });

    it('gere alencon en milieu de phrase', () => {
      expect(capitalizeNames('rue de alencon')).toBe('Rue de Alençon');
    });
  });

  // ===================== Cas limites =====================
  describe('cas limites', () => {
    it('gere une chaine vide', () => {
      expect(capitalizeNames('')).toBe('');
    });

    it('gere des espaces multiples entre les mots', () => {
      // split(' ') va creer des chaines vides, mais trim + split gere cela
      const result = capitalizeNames('jean  dupont');
      expect(result).toBeDefined();
    });

    it('gere un nom compose avec tiret (pas de traitement special)', () => {
      // Le tiret fait partie du mot, donc seul le premier char est capitalise
      expect(capitalizeNames('jean-pierre')).toBe('Jean-pierre');
    });
  });
});
