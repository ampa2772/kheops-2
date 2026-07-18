const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

function computeRuntimeSourceHash(serverDirectory) {
  const files = collectRuntimeSourceFiles(serverDirectory).sort();
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(path.relative(serverDirectory, file).replace(/\\/g, '/'));
    hash.update(fs.readFileSync(file));
  }
  return { hash: hash.digest('hex').slice(0, 16), fileCount: files.length };
}

module.exports = {
  IGNORED_DIRECTORIES,
  collectRuntimeSourceFiles,
  computeRuntimeSourceHash,
  ignoredFile,
};
