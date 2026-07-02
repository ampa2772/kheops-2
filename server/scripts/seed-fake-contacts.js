// server/scripts/seed-fake-contacts.js
//
// SEED — Crée des contacts fictifs (personnes physiques) réalistes en français
// et les rattache à un utilisateur (UserContact) pour qu'ils apparaissent dans
// son annuaire.
//
//   Dry-run (par défaut, n'écrit RIEN) :
//     node scripts/seed-fake-contacts.js
//   Appliquer :
//     node scripts/seed-fake-contacts.js --apply
//   Options :
//     --count 200            nombre de contacts (défaut 200)
//     --first Pierre --last Jalet   cible par prénom/nom (défaut Pierre/Jalet)
//     --email a@b.fr         cible par e-mail exact (prioritaire sur --first/--last)
//
// Réversibilité : en mode --apply, écrit la liste des _id créés dans
//   scripts/seed-output-<timestamp>.json  (pour un éventuel retrait ultérieur).
//
// Note bash (PATH cassé) : préfixer par
//   export PATH="/usr/bin:/bin:/c/Program Files/Git/usr/bin:/c/Program Files/nodejs:$PATH"

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
function argValue(flag, def) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
}
const COUNT = parseInt(argValue('--count', '200'), 10) || 200;
const TARGET_FIRST = argValue('--first', 'Pierre');
const TARGET_LAST = argValue('--last', 'Jalet');
const TARGET_EMAIL = argValue('--email', null);

// --- Jeux de données français ---------------------------------------------
const PRENOMS_H = ['Jean', 'Pierre', 'Michel', 'Alain', 'Philippe', 'Nicolas', 'Julien', 'Thomas', 'Antoine', 'Laurent', 'David', 'Sébastien', 'Olivier', 'Vincent', 'Guillaume', 'François', 'Maxime', 'Romain', 'Christophe', 'Benoît', 'Hugo', 'Louis', 'Paul', 'Étienne', 'Frédéric'];
const PRENOMS_F = ['Marie', 'Nathalie', 'Isabelle', 'Sophie', 'Catherine', 'Sylvie', 'Anne', 'Julie', 'Camille', 'Émilie', 'Céline', 'Sandrine', 'Aurélie', 'Laura', 'Chloé', 'Manon', 'Léa', 'Sarah', 'Claire', 'Christine', 'Valérie', 'Hélène', 'Nadia', 'Élodie', 'Pauline'];
const NOMS = ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Lefèvre', 'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Martinez', 'Legrand', 'Garnier', 'Faure', 'Rousseau', 'Blanc', 'Guerin', 'Muller', 'Henry', 'Roussel', 'Nicolas'];
const VILLES = [
  ['Paris', '75011'], ['Marseille', '13006'], ['Lyon', '69003'], ['Toulouse', '31000'],
  ['Nice', '06000'], ['Nantes', '44000'], ['Montpellier', '34000'], ['Strasbourg', '67000'],
  ['Bordeaux', '33000'], ['Lille', '59000'], ['Rennes', '35000'], ['Reims', '51100'],
  ['Le Havre', '76600'], ['Rouen', '76000'], ['Bernay', '27300'], ['Évreux', '27000'],
  ['Caen', '14000'], ['Dijon', '21000'], ['Angers', '49000'], ['Grenoble', '38000'],
];
const RUES = ['rue de la République', 'avenue Victor Hugo', 'rue des Lilas', 'boulevard Voltaire', 'rue Jean Jaurès', 'place de la Mairie', 'rue du Général de Gaulle', 'impasse des Acacias', 'rue Pasteur', 'avenue de la Gare', 'rue de Paris', 'chemin des Vignes', 'rue Gambetta', 'allée des Tilleuls', 'rue de l\'Église'];
const PROFESSIONS = ['Enseignant', 'Infirmier', 'Comptable', 'Artisan', 'Commerçant', 'Ingénieur', 'Employé', 'Cadre', 'Retraité', 'Agriculteur', 'Médecin', 'Ouvrier', 'Technicien', 'Restaurateur', 'Chauffeur', 'Électricien', 'Plombier', 'Secrétaire', 'Vendeur', 'Sans profession'];
const MARITAL = ['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)', 'Pacsé(e)'];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const stripAccents = (s) => s.normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '');
const pad2 = (n) => String(n).padStart(2, '0');

function randomPhone() {
  const prefix = rand(['06', '07', '01', '02', '03', '09']);
  let rest = '';
  for (let i = 0; i < 4; i++) rest += ' ' + pad2(randInt(0, 99));
  return prefix + rest;
}

function randomBirthDate() {
  const year = randInt(1950, 2004);
  const month = randInt(0, 11);
  const day = randInt(1, 28);
  return new Date(Date.UTC(year, month, day));
}

function buildContact(i) {
  const isH = Math.random() < 0.5;
  const prenoms = rand(isH ? PRENOMS_H : PRENOMS_F);
  const nom = rand(NOMS);
  const [ville, cp] = rand(VILLES);
  const [villeN, cpN] = rand(VILLES);
  const genre = isH ? 'Masculin' : 'Féminin';
  const appellation = isH ? 'Monsieur' : 'Madame';
  const emailUser = `${stripAccents(prenoms).toLowerCase()}.${stripAccents(nom).toLowerCase()}${i}`;
  return {
    nom,
    prenoms,
    nom_de_naissance: nom,
    email: `${emailUser}@example.fr`,
    telephone: randomPhone(),
    adresse: `${randInt(1, 120)} ${rand(RUES)}`,
    ville,
    codePostal: cp,
    type: 'Client',
    genre,
    appellationCourrier: appellation,
    dateNaissance: randomBirthDate(),
    nationalite: 'Française',
    profession: rand(PROFESSIONS),
    maritalStatus: rand(MARITAL),
    paysNaissance: 'France',
    villeNaissance: villeN,
    CP_VilleNaissance: cpN,
    pro_contact: false,
    contactType: 'physique',
    roleFonctionnel: 'Client_Partie',
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI manquant (.env). Abandon.');
    process.exit(1);
  }

  console.log('==============================================================');
  console.log(`  Seed contacts fictifs — mode ${APPLY ? 'APPLY (écriture réelle)' : 'DRY-RUN (aucune écriture)'}`);
  console.log(`  Cible : ${TARGET_EMAIL ? `email=${TARGET_EMAIL}` : `${TARGET_FIRST} ${TARGET_LAST}`} | Nombre : ${COUNT}`);
  console.log('==============================================================\n');

  await mongoose.connect(uri);

  const User = require(path.join(__dirname, '..', 'models', 'App_Users', 'User'));
  const Contact = require(path.join(__dirname, '..', 'models', 'Folder', 'Contact'));
  const UserContact = require(path.join(__dirname, '..', 'models', 'Folder', 'modelsLiaisons', 'UserContact'));

  // --- Retrouver l'utilisateur cible ---
  let user;
  if (TARGET_EMAIL) {
    user = await User.findOne({ email: new RegExp(`^${TARGET_EMAIL}$`, 'i') });
  } else {
    const matches = await User.find({
      firstName: new RegExp(`^${TARGET_FIRST}$`, 'i'),
      lastName: new RegExp(`^${TARGET_LAST}$`, 'i'),
    }).select('email firstName lastName');
    if (matches.length > 1) {
      console.error(`Plusieurs comptes "${TARGET_FIRST} ${TARGET_LAST}" trouvés — précisez avec --email :`);
      matches.forEach((m) => console.error(`  - ${m.email} (${m._id})`));
      await mongoose.disconnect();
      process.exit(1);
    }
    user = matches[0];
  }

  if (!user) {
    console.error('Utilisateur cible introuvable. Utilisez --email <adresse> ou --first/--last.');
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`Utilisateur cible : ${user.firstName} ${user.lastName} <${user.email}> (${user._id})\n`);

  // --- Générer les contacts ---
  const contacts = Array.from({ length: COUNT }, (_, i) => buildContact(i + 1));
  console.log('Exemples générés :');
  contacts.slice(0, 3).forEach((c) => {
    console.log(`  - ${c.prenoms} ${c.nom} | ${c.email} | ${c.telephone} | ${c.ville} | ${c.profession} | né(e) ${c.dateNaissance.toISOString().slice(0, 10)}`);
  });
  console.log('');

  if (!APPLY) {
    console.log(`DRY-RUN : ${COUNT} contacts seraient créés et rattachés à ${user.email}. Aucune écriture.`);
    console.log('Relancer avec --apply pour écrire.');
    await mongoose.disconnect();
    return;
  }

  // --- Insertion réelle ---
  const createdIds = [];
  for (const data of contacts) {
    const c = await Contact.create(data);
    await UserContact.create({ user: user._id, contact: c._id });
    createdIds.push(String(c._id));
  }

  const outFile = path.join(__dirname, `seed-output-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ user: String(user._id), email: user.email, count: createdIds.length, contactIds: createdIds }, null, 2));

  console.log(`✅ ${createdIds.length} contacts créés et rattachés à ${user.email}.`);
  console.log(`   Liste des _id créés : ${outFile}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Erreur :', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
