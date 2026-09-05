const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Identifiant de la représentation canonique hachée. Toute évolution de la
// canonisation ci-dessous doit changer cette valeur : le manifeste et le
// journal de démarrage l'exposent pour qu'une empreinte ne soit jamais comparée
// à une autre calculée autrement (les anciennes révisions gardent leur ancien
// manifeste, aucun mode de compatibilité n'est nécessaire).
const HASH_ALGORITHM = 'kheops-src-v2';

// Doit rester aligné avec .gcloudignore : seuls les fichiers JavaScript/JSON
// réellement copiés dans l'image Cloud Run participent à l'empreinte.
const IGNORED_DIRECTORIES = new Set(['node_modules', '__tests__', 'coverage', 'scripts']);

function ignoredFile(name) {
  return name === 'build-manifest.json'
    || name === 'user.json'
    || name === 'jest.config.js'
    || name.endsWith('.test.js')
    || /^debug_.*\.js$/i.test(name);
}

// Un chemin relatif à la racine serveur (séparateur "/" ou natif) désigne-t-il
// un fichier retenu par l'empreinte ? Mêmes règles que collectRuntimeSourceFiles,
// sans lecture du disque : sert à juger un chemin rapporté par Git (fichier non
// suivi qui entrerait dans l'image) avec exactement les mêmes exclusions.
function isRuntimeSourcePath(relativePath) {
  const parts = String(relativePath).split(/[\\/]/).filter(Boolean);
  if (parts.length === 0) return false;
  const name = parts[parts.length - 1];
  if (parts.slice(0, -1).some((directory) => IGNORED_DIRECTORIES.has(directory))) return false;
  return !ignoredFile(name) && (name.endsWith('.js') || name.endsWith('.json'));
}

function collectRuntimeSourceFiles(directory, fileList = []) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectRuntimeSourceFiles(fullPath, fileList);
    } else if (!ignoredFile(entry.name) && (entry.name.endsWith('.js') || entry.name.endsWith('.json'))) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

// Chemin canonique d'un fichier : relatif à la racine serveur, séparateur "/"
// quel que soit le système, forme Unicode NFC (un nom accentué est identique
// qu'il vienne d'un système qui le stocke composé ou décomposé). Jamais de
// chemin absolu : l'emplacement de l'arborescence ne participe pas à l'empreinte.
function relativeSourcePath(serverDirectory, file, pathModule = path) {
  return pathModule.relative(serverDirectory, file).split(pathModule.sep).join('/').normalize('NFC');
}

// Contenu canonique : texte décodé en UTF-8, BOM initial retiré, CRLF et CR
// ramenés à LF. Rien d'autre n'est altéré : tout autre changement d'un
// caractère change l'empreinte. Aucune métadonnée (dates, droits) n'intervient.
function canonicalizeSourceContent(buffer) {
  let text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n');
}

// Tri par comparaison binaire des octets UTF-8 : indépendant de la locale, du
// séparateur natif et de l'ordre de lecture du système de fichiers.
function compareBinary(left, right) {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

// Empreinte d'un ensemble d'entrées { relativePath, content } déjà relatives à
// la racine serveur. Chaque champ est préfixé par sa longueur en octets pour
// qu'aucune frontière chemin/contenu ne soit ambiguë.
function computeCanonicalSourceHash(entries) {
  const canonical = entries
    .map((entry) => ({
      relativePath: String(entry.relativePath).normalize('NFC'),
      content: canonicalizeSourceContent(entry.content),
    }))
    .sort((left, right) => compareBinary(left.relativePath, right.relativePath));
  const hash = crypto.createHash('sha256');
  hash.update(`${HASH_ALGORITHM}\n`);
  for (const { relativePath, content } of canonical) {
    const pathBytes = Buffer.from(relativePath, 'utf8');
    const contentBytes = Buffer.from(content, 'utf8');
    hash.update(`${pathBytes.length}:`);
    hash.update(pathBytes);
    hash.update('\n');
    hash.update(`${contentBytes.length}:`);
    hash.update(contentBytes);
    hash.update('\n');
  }
  return { hash: hash.digest('hex').slice(0, 16), fileCount: canonical.length, hashAlgorithm: HASH_ALGORITHM };
}

function computeRuntimeSourceHash(serverDirectory) {
  const entries = collectRuntimeSourceFiles(serverDirectory).map((file) => ({
    relativePath: relativeSourcePath(serverDirectory, file),
    content: fs.readFileSync(file),
  }));
  return computeCanonicalSourceHash(entries);
}

module.exports = {
  HASH_ALGORITHM,
  IGNORED_DIRECTORIES,
  canonicalizeSourceContent,
  collectRuntimeSourceFiles,
  computeCanonicalSourceHash,
  computeRuntimeSourceHash,
  ignoredFile,
  isRuntimeSourcePath,
  relativeSourcePath,
};
