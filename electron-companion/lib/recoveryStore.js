// electron-companion/lib/recoveryStore.js
//
// Conservation locale durable d'un .docx que le backend n'a pas confirme.
// La copie est publiee sous un nom unique, verifiee (taille + fsync), puis le
// chemin est rendu a wordSession. Aucun jeton ni secret n'est ecrit sur disque.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function safePart(value, fallback) {
  const cleaned = String(value || '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || fallback;
}

function recoveryFileName(sourcePath, docId, now = new Date()) {
  const sourceName = path.basename(sourcePath || 'document.docx');
  const ext = /\.docx?$/i.test(path.extname(sourceName)) ? path.extname(sourceName) : '.docx';
  const stem = safePart(path.basename(sourceName, path.extname(sourceName)), 'Document').slice(0, 120);
  const id = safePart(docId, 'document').slice(0, 24);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const nonce = crypto.randomBytes(3).toString('hex');
  return `${stem} - NON SYNCHRONISE - ${stamp} - ${id}-${nonce}${ext}`;
}

async function syncFile(filePath) {
  // Sous Windows, FlushFileBuffers (fsync) exige un handle ouvert en ecriture.
  const handle = await fs.promises.open(filePath, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Copie un document vers un emplacement durable et visible.
 * Le fichier source n'est jamais modifie ni supprime par cette fonction.
 */
async function preserve({ sourcePath, recoveryDir, docId, now = new Date() }) {
  if (!sourcePath || !recoveryDir) throw new Error('Chemin de recuperation incomplet.');

  const sourceStat = await fs.promises.stat(sourcePath);
  if (!sourceStat.isFile() || sourceStat.size <= 0) {
    throw new Error('Le fichier local est vide ou illisible.');
  }

  await fs.promises.mkdir(recoveryDir, { recursive: true });
  const destinationPath = path.join(recoveryDir, recoveryFileName(sourcePath, docId, now));
  let destinationCreated = false;

  try {
    await fs.promises.copyFile(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL);
    destinationCreated = true;
    await syncFile(destinationPath);

    const destinationStat = await fs.promises.stat(destinationPath);
    if (!destinationStat.isFile() || destinationStat.size !== sourceStat.size) {
      throw new Error('La verification de la copie de secours a echoue.');
    }

    // La taille seule ne suffit pas : deux fichiers corrompus peuvent avoir le
    // meme nombre d'octets. La copie n'est declaree durable qu'apres egalite
    // SHA-256, et si la source n'a pas change pendant l'operation.
    const [sourceHash, destinationHash] = await Promise.all([
      sha256File(sourcePath),
      sha256File(destinationPath),
    ]);
    const finalSourceStat = await fs.promises.stat(sourcePath);
    if (sourceHash !== destinationHash
      || finalSourceStat.size !== sourceStat.size
      || finalSourceStat.mtimeMs !== sourceStat.mtimeMs) {
      throw new Error("L'integrite SHA-256 de la copie de secours n'a pas pu etre confirmee.");
    }
    return destinationPath;
  } catch (err) {
    if (destinationCreated) {
      try { await fs.promises.rm(destinationPath, { force: true }); } catch (_) {}
    }
    throw err;
  }
}

module.exports = { preserve, recoveryFileName };
