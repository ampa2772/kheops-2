/**
 * ariaFieldConfig.js
 * Configuration declarative de TOUS les champs pour chaque type d'entite.
 * Chaque type (Physique, PM, PMPublique) definit ses groupes de champs.
 */

export const FIELD_CONFIGS = {
  Physique: {
    label: 'Personne Physique',
    icon: '\u{1F464}',
    groups: [
      {
        title: 'Identit\u00e9',
        fields: [
          { key: 'nom', label: 'Nom' },
          { key: 'prenoms', label: 'Pr\u00e9noms' },
          { key: 'nom_de_naissance', label: 'Nom de naissance' },
          { key: 'genre', label: 'Genre', inputType: 'select', options: ['Masculin', 'F\u00e9minin', 'Autre'] },
          { key: 'dateNaissance', label: 'Date de naissance', inputType: 'date' },
          { key: 'villeNaissance', label: 'Ville de naissance' },
          { key: 'CP_VilleNaissance', label: 'CP Ville naissance' },
          { key: 'paysNaissance', label: 'Pays de naissance' },
          { key: 'nationalite', label: 'Nationalit\u00e9' },
          { key: 'secu', label: 'N\u00b0 S\u00e9curit\u00e9 Sociale' },
        ],
      },
      {
        title: 'Coordonn\u00e9es',
        fields: [
          { key: 'email', label: 'Email', inputType: 'email' },
          { key: 'telephone', label: 'T\u00e9l\u00e9phone', inputType: 'tel' },
          { key: 'adresse', label: 'Adresse' },
          { key: 'ville', label: 'Ville' },
          { key: 'codePostal', label: 'Code Postal' },
        ],
      },
      {
        title: 'Situation',
        fields: [
          { key: 'profession', label: 'Profession' },
          { key: 'maritalStatus', label: 'Statut Marital' },
          { key: 'appellationCourrier', label: 'Appellation courrier' },
          { key: 'roleFonctionnel', label: 'R\u00f4le fonctionnel', inputType: 'select', options: ['Client_Partie', 'Professionnel_Tiers'] },
          { key: 'pro_contact', label: 'Contact professionnel', inputType: 'boolean' },
        ],
      },
    ],
  },

  PM: {
    label: 'Personne Morale Priv\u00e9e',
    icon: '\u{1F3E2}',
    groups: [
      {
        title: 'Entreprise',
        fields: [
          { key: 'raisonSociale', label: 'Raison Sociale' },
          { key: 'formeJuridique', label: 'Forme Juridique' },
          { key: 'siret', label: 'SIRET' },
          { key: 'numeroRCS', label: 'N\u00b0 RCS' },
          { key: 'NAF_APE', label: 'Code NAF/APE' },
          { key: 'tvaIntracommunautaire', label: 'TVA Intracommunautaire' },
          { key: 'secteurActivite', label: "Secteur d'Activit\u00e9" },
          { key: 'capitalSocial', label: 'Capital Social' },
          { key: 'dateCreationEntreprise', label: 'Date de Cr\u00e9ation', inputType: 'date' },
        ],
      },
      {
        title: 'Coordonn\u00e9es Entreprise',
        fields: [
          { key: 'emailEntreprise', label: 'Email Entreprise', inputType: 'email' },
          { key: 'telephoneEntreprise', label: 'T\u00e9l\u00e9phone Entreprise', inputType: 'tel' },
          { key: 'adresseSiegeSocial', label: 'Adresse Si\u00e8ge Social' },
          { key: 'villePM', label: 'Ville' },
          { key: 'codePostalPM', label: 'Code Postal' },
          { key: 'siteWeb', label: 'Site Web' },
        ],
      },
      {
        title: 'Interlocuteur Principal',
        fields: [
          { key: 'interlocuteurNom', label: 'Nom' },
          { key: 'interlocuteurPrenom', label: 'Pr\u00e9nom' },
          { key: 'interlocuteurFonction', label: 'Fonction' },
          { key: 'interlocuteurEmail', label: 'Email', inputType: 'email' },
          { key: 'interlocuteurTelephone', label: 'T\u00e9l\u00e9phone', inputType: 'tel' },
          { key: 'estRepresentantLegal', label: 'Est repr\u00e9sentant l\u00e9gal', inputType: 'boolean' },
        ],
      },
      {
        title: 'Informations Compl\u00e9mentaires',
        fields: [
          { key: 'representantLegalNom', label: 'Repr\u00e9sentant L\u00e9gal (Nom)' },
          { key: 'representantLegalFonction', label: 'Repr\u00e9sentant L\u00e9gal (Fonction)' },
          { key: 'associesActionnaires', label: 'Associ\u00e9s / Actionnaires' },
          { key: 'contactDirectNom', label: 'Contact Direct (Nom)' },
          { key: 'filiales', label: 'Filiales' },
          { key: 'appellationCourrier', label: 'Appellation Courrier' },
          { key: 'profession', label: 'Profession' },
          { key: 'roleFonctionnel', label: 'R\u00f4le Fonctionnel', inputType: 'select', options: ['Client_Partie', 'Professionnel_Tiers'] },
        ],
      },
    ],
  },

  PMPublique: {
    label: 'Personne Morale Publique',
    icon: '\u{1F3DB}\uFE0F',
    groups: [
      {
        title: 'Organisme',
        fields: [
          { key: 'denomination', label: 'D\u00e9nomination' },
          { key: 'email', label: 'Email', inputType: 'email' },
          { key: 'adresse', label: 'Adresse' },
          { key: 'ville', label: 'Ville' },
          { key: 'codePostal', label: 'Code Postal' },
          { key: 'siteWeb', label: 'Site Web' },
        ],
      },
      {
        title: 'Contact Principal',
        fields: [
          { key: 'contactNom', label: 'Nom du Contact' },
          { key: 'contactPrenom', label: 'Pr\u00e9nom du Contact' },
          { key: 'contactFonction', label: 'Fonction' },
          { key: 'contactEmail', label: 'Email du Contact', inputType: 'email' },
          { key: 'contactTelephone', label: 'T\u00e9l\u00e9phone du Contact', inputType: 'tel' },
          { key: 'genre', label: 'Genre', inputType: 'select', options: ['Masculin', 'Feminin'] },
        ],
      },
      {
        title: 'Interlocuteur Principal',
        fields: [
          { key: 'interlocuteurNom', label: 'Nom' },
          { key: 'interlocuteurPrenom', label: 'Pr\u00e9nom' },
          { key: 'interlocuteurFonction', label: 'Fonction' },
          { key: 'interlocuteurEmail', label: 'Email', inputType: 'email' },
          { key: 'interlocuteurTelephone', label: 'T\u00e9l\u00e9phone', inputType: 'tel' },
          { key: 'estRepresentantLegal', label: 'Est repr\u00e9sentant l\u00e9gal', inputType: 'boolean' },
        ],
      },
      {
        title: 'Divers',
        fields: [
          { key: 'appellationCourrier', label: 'Appellation Courrier' },
          { key: 'profession', label: 'Profession' },
          { key: 'roleFonctionnel', label: 'R\u00f4le Fonctionnel', inputType: 'select', options: ['Client_Partie', 'Professionnel_Tiers'] },
        ],
      },
    ],
  },
};

/**
 * Configuration des champs pour les personnes a charge (enfants et adultes).
 * Utilisee pour rendre les mini-cartes dans le sous-bloc "Personnes a charge".
 */
export const PERSONNE_CHARGE_FIELDS = {
  enfant: [
    { key: 'nom', label: 'Nom' },
    { key: 'prenoms', label: 'Pr\u00e9noms' },
    { key: 'genre', label: 'Genre' },
    { key: 'dateNaissance', label: 'Date de naissance', inputType: 'date' },
    { key: 'nationalite', label: 'Nationalit\u00e9' },
    { key: 'adresse', label: 'Adresse' },
    { key: 'ville', label: 'Ville' },
    { key: 'codePostal', label: 'Code Postal' },
    { key: 'paysNaissance', label: 'Pays de naissance' },
    { key: 'villeNaissance', label: 'Ville de naissance' },
  ],
  adulte: [
    { key: 'nom', label: 'Nom' },
    { key: 'prenoms', label: 'Pr\u00e9noms' },
    { key: 'genre', label: 'Genre' },
    { key: 'maritalStatus', label: 'Statut Marital' },
    { key: 'dateNaissance', label: 'Date de naissance', inputType: 'date' },
    { key: 'nationalite', label: 'Nationalit\u00e9' },
    { key: 'profession', label: 'Profession' },
    { key: 'numeroSecu', label: 'N\u00b0 S\u00e9curit\u00e9 Sociale' },
    { key: 'adresse', label: 'Adresse' },
    { key: 'ville', label: 'Ville' },
    { key: 'codePostal', label: 'Code Postal' },
    { key: 'email', label: 'Email' },
    { key: 'telephone', label: 'T\u00e9l\u00e9phone' },
    { key: 'paysNaissance', label: 'Pays de naissance' },
    { key: 'villeNaissance', label: 'Ville de naissance' },
  ],
};

/**
 * Detecte le type d'entite a partir de ses donnees.
 * CORRECTION : Verifie d'abord les champs structurels (raisonSociale, denomination)
 * avant de se rabattre sur contactType, car :
 *  - ContactPMPublique n'a PAS de champ contactType dans son schema
 *  - Les snapshots embarques dans les dossiers peuvent ne pas avoir contactType
 */
export function detectEntityType(entity) {
  if (!entity) return 'Physique';

  // 1. Verifier les champs structurels en priorite (fiable quelle que soit la source)
  if (entity.raisonSociale) return 'PM';
  if (entity.denomination) return 'PMPublique';

  // 2. Types avocat/notaire/CDJ → toujours stockes dans la collection Contact (Physique)
  const resolvedType = entity.type || entity.roleOfficeUser || '';
  const isAvocatLike = ['Avocat', 'Avocate', 'Notaire', 'Commissaire de justice'].includes(resolvedType);
  if (isAvocatLike) return 'Physique';

  // 3. Fallback sur contactType si present
  if (entity.contactType === 'morale') {
    // Devrait etre attrape par les checks structurels ci-dessus,
    // mais on garde comme filet de securite
    return 'PM';
  }

  return 'Physique';
}

/**
 * Extrait le nom affichable d'une entite.
 */
export function getEntityDisplayName(entity) {
  if (!entity) return 'Entit\u00e9 inconnue';
  if (entity.raisonSociale) return entity.raisonSociale;
  if (entity.denomination) return entity.denomination;
  const nom = entity.nom || entity.nomOfficeUser || '';
  const prenom = entity.prenoms || entity.prenomOfficeUser || '';
  return `${nom} ${prenom}`.trim() || 'Sans nom';
}

/**
 * Formate une date ISO en affichage lisible francais (ex: "05/12/1982").
 */
export function formatDateForDisplay(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return String(dateString);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Formate une date ISO en format input date (YYYY-MM-DD).
 */
export function formatDateForInput(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0];
}
