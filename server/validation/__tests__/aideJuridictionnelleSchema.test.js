// Tests A20 — validation structurelle du snapshot Aide juridictionnelle.
// Mêmes options Joi que le middleware validateBody (stripUnknown, abortEarly:false).

const { aideJuridictionnelleSchema } = require('../aideJuridictionnelleSchema');

const OPTS = { stripUnknown: true, abortEarly: false, convert: true };
const validate = (body) => aideJuridictionnelleSchema.validate(body, OPTS);

// Forme vide envoyée par la modale (cf. client AJModal.js emptyForm()).
const emptyForm = {
  demandeur: { nationalite: {}, situationPro: {} },
  assurancePJ: {},
  representant: {},
  conjoint: {},
  personnesACharge: [],
  affaireOppose: {},
  demande: {},
  auxiliaire: {},
  dispenses: {},
  ressources: [{ type: 'salaires' }],
  patrimoine: { proprietaireDe: [] },
  prestationsVersees: [],
  attestation: {},
};

test('la forme vide de la modale passe telle quelle', () => {
  const { error } = validate(emptyForm);
  expect(error).toBeUndefined();
});

test('un formulaire réaliste passe (textes, nombres, booléens, tableaux)', () => {
  const { error, value } = validate({
    demandeur: {
      nom: 'Durand', prenoms: 'Marie', dateNaissance: '1980-05-12',
      nationalite: { francaise: true },
      situationPro: { profession: 'Infirmière', salaireMensuel: 2100 },
    },
    personnesACharge: [{ nom: 'Durand', prenoms: 'Léo', lien: 'enfant' }],
    ressources: [{ type: 'salaires', montant: 2100, justificatif: true }],
    patrimoine: { proprietaireDe: [{ nature: 'appartement', valeur: 150000 }] },
  });
  expect(error).toBeUndefined();
  expect(value.demandeur.situationPro.salaireMensuel).toBe(2100);
});

test('🔒 les sections inconnues sont retirées (pas de pollution du dossier)', () => {
  const { error, value } = validate({
    demandeur: { nom: 'X' },
    isAdmin: true,
    sectionPirate: { role: 'owner' },
  });
  expect(error).toBeUndefined();
  expect(value.isAdmin).toBeUndefined();
  expect(value.sectionPirate).toBeUndefined();
  expect(value.demandeur.nom).toBe('X');
});

test('🔒 un champ texte géant (> 2000 caractères) est rejeté', () => {
  const { error } = validate({ demandeur: { nom: 'a'.repeat(2001) } });
  expect(error).toBeDefined();
});

test('🔒 une clé dangereuse (constructor) est retirée par le motif de clé', () => {
  const body = { demandeur: JSON.parse('{"constructor": {"x": 1}, "nom": "X"}') };
  const { error, value } = validate(body);
  expect(error).toBeUndefined();
  expect(Object.prototype.hasOwnProperty.call(value.demandeur, 'constructor')).toBe(false);
  expect(value.demandeur.nom).toBe('X');
});

test('🔒 une imbrication trop profonde (> 4 niveaux) est rejetée', () => {
  const { error } = validate({
    demandeur: { a: { b: { c: { d: { e: { f: 'trop profond' } } } } } },
  });
  expect(error).toBeDefined();
});

test('🔒 un tableau démesuré (> 50 personnes à charge) est rejeté', () => {
  const { error } = validate({
    personnesACharge: Array.from({ length: 51 }, (_, i) => ({ nom: `P${i}` })),
  });
  expect(error).toBeDefined();
});

test('updatedAt envoyé par le client est ignoré (le serveur pose le sien)', () => {
  const { error, value } = validate({ demandeur: { nom: 'X' }, updatedAt: '2020-01-01' });
  expect(error).toBeUndefined();
  expect(value.updatedAt).toBeUndefined();
});
