const capitalizeNames = (name) => {
  const lowerCaseWords = ['le', 'sur', 'en', 'devant', 'de', 'la', 'es', 'et', 'd', 'du', 'au'];

  let wordsArray = name
    .toLowerCase()
    .trim()  // Supprimer les espaces de début et de fin
    .split(' ')
    .map((word, i, arr) => {
      // Si le mot est une seule lettre et pas le dernier mot, mettez-le en majuscule et ajoutez une apostrophe
      if (word.length === 1 && i !== arr.length - 1) {
        return word.toUpperCase() + "'";
      }
      // Si le mot est une seule lettre et c'est le dernier mot, mettez-le en majuscule
      if (word.length === 1 && i === arr.length - 1) {
        return word.toUpperCase();
      }
      // Pour tous les autres mots, mettez le premier caractère en majuscule, 
      // sauf s'il s'agit d'un mot spécifié dans `lowerCaseWords`.
      if (i !== 0 && lowerCaseWords.includes(word)) {
        return word;
      }
      // Si le mot est "alencon" ou "besancon", le remplacer par "Alençon" ou "Besançon"
      if (word === 'alencon') {
        return 'Alençon';
      }
      if (word === 'besancon') {
        return 'Besançon';
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    });

  // Rejoignez les mots avec un espace conditionnellement
  let result = "";
  for (let i = 0; i < wordsArray.length; i++) {
    // Si le mot n'est pas le dernier mot du tableau et qu'il se termine par une apostrophe, ne pas ajouter d'espace.
    if (i !== wordsArray.length - 1 && wordsArray[i].endsWith("'")) {
      result += wordsArray[i];
    } else {
      result += wordsArray[i] + " ";
    }
  }

  return result.trim(); // Supprimer tout espace résiduel à la fin.
};


module.exports.capitalizeNames = capitalizeNames;