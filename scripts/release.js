#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * scripts/release.js
 *
 * Automatise toute la chaîne de mise en ligne d'une nouvelle version de
 * Kheops 2 : calcul des empreintes, mise à jour du site public, upload
 * sur Google Cloud Storage, vérification post-upload.
 *
 * À LANCER APRÈS :
 *  - avoir bumpé `package.json` ET `client/src/buildInfo.js` à la
 *    nouvelle version (par ex. 2.0.17-rc1) ;
 *  - avoir lancé `npm run package` qui doit avoir produit
 *      dist/KHEOPS2-Setup.exe
 *      dist/KHEOPS2-Setup.exe.blockmap
 *      dist/latest.yml
 *
 * Ce que fait le script :
 *   1. Lit la version courante depuis package.json.
 *   2. Vérifie que les artefacts du build existent et que latest.yml
 *      annonce bien cette même version (garde-fou contre l'oubli du
 *      bump buildInfo.js).
 *   3. Recalcule SHA-256 hex (pour la vérification d'intégrité côté
 *      utilisateur) et SHA-512 base64 (pour le manifeste auto-update).
 *      Mesure la taille réelle en octets et en Mo.
 *   4. Met à jour site/public/index.html : badge, version, taille,
 *      SHA-256 (deux endroits), footer.
 *   5. Met à jour HOSTING.md : version, taille, SHA-256, SHA-512, date.
 *   6. Uploade les trois artefacts (EXE, blockmap, latest.yml) sur
 *      gs://kheops-2-app-download/ via gcloud storage cp.
 *      latest.yml est uploadé avec Cache-Control no-cache pour que
 *      electron-updater détecte la nouvelle version sans délai.
 *   7. Uploade la page corrigée sur gs://kheops-2-app-site/ avec
 *      Cache-Control no-cache.
 *   8. Vérifie publiquement (HEAD + GET) :
 *      - latest.yml annonce la bonne version ;
 *      - l'EXE a la bonne taille (Content-Length) ;
 *      - le site contient la bonne version dans badge + footer +
 *        section téléchargement ;
 *      - le site contient le bon SHA-256.
 *      Échoue avec exit code 1 si une vérification ne passe pas.
 *
 * Usage :
 *   node scripts/release.js
 *   node scripts/release.js --dry-run     # logs sans modifier rien
 *   node scripts/release.js --skip-upload # met à jour les fichiers
 *                                         # locaux mais ne pousse pas
 *                                         # vers GCS
 *
 * Pré-requis :
 *   - gcloud CLI authentifié sur le compte propriétaire
 *     (apma2772@gmail.com), projet kheops-2-app actif.
 *   - Node 18+ (utilise fetch natif).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// --- Constantes -----------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');

const PATHS = {
  pkg: path.join(ROOT, 'package.json'),
  buildInfo: path.join(ROOT, 'client', 'src', 'buildInfo.js'),
  exe: path.join(ROOT, 'dist', 'KHEOPS2-Setup.exe'),
  blockmap: path.join(ROOT, 'dist', 'KHEOPS2-Setup.exe.blockmap'),
  latestYml: path.join(ROOT, 'dist', 'latest.yml'),
  indexHtml: path.join(ROOT, 'site', 'public', 'index.html'),
  hostingMd: path.join(ROOT, 'HOSTING.md'),
};

const BUCKET_DOWNLOAD = 'gs://kheops-2-app-download';
const BUCKET_SITE = 'gs://kheops-2-app-site';

const PUBLIC_URLS = {
  latestYml: 'https://storage.googleapis.com/kheops-2-app-download/latest.yml',
  exe: 'https://storage.googleapis.com/kheops-2-app-download/KHEOPS2-Setup.exe',
  indexHtml: 'https://storage.googleapis.com/kheops-2-app-site/index.html',
};

// --- Args -----------------------------------------------------------------

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_UPLOAD = process.argv.includes('--skip-upload') || DRY_RUN;

// --- Helpers --------------------------------------------------------------

function log(level, msg) {
  const prefix = { info: '•', ok: '✓', warn: '⚠', err: '✗', step: '▶' }[level] || '·';
  console.log(`${prefix} ${msg}`);
}

function die(msg) {
  log('err', msg);
  process.exit(1);
}

function run(cmd) {
  if (DRY_RUN) {
    log('info', `[dry-run] ${cmd}`);
    return '';
  }
  log('info', `> ${cmd}`);
  return execSync(cmd, { stdio: 'inherit' });
}

function writeFileMaybe(p, content) {
  if (DRY_RUN) {
    log('info', `[dry-run] écriture ${path.relative(ROOT, p)} (${content.length} octets)`);
    return;
  }
  fs.writeFileSync(p, content, 'utf8');
  log('ok', `${path.relative(ROOT, p)} mis à jour`);
}

async function httpHead(url) {
  const res = await fetch(url, { method: 'HEAD' });
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
  };
}

async function httpGet(url) {
  const res = await fetch(url);
  return {
    status: res.status,
    body: await res.text(),
    headers: Object.fromEntries(res.headers.entries()),
  };
}

// --- 1. Lire la version courante -----------------------------------------

function loadVersion() {
  const pkg = JSON.parse(fs.readFileSync(PATHS.pkg, 'utf8'));
  const version = pkg.version;
  if (!version || !/^\d+\.\d+\.\d+(-rc\d+)?$/.test(version)) {
    die(`Version invalide dans package.json : ${version}`);
  }
  return version;
}

// --- 2. Vérifier les artefacts du build ----------------------------------

function checkArtifacts(version) {
  for (const key of ['exe', 'blockmap', 'latestYml']) {
    if (!fs.existsSync(PATHS[key])) {
      die(`Artefact manquant : ${PATHS[key]}. Lancez 'npm run package' d'abord.`);
    }
  }
  const yml = fs.readFileSync(PATHS.latestYml, 'utf8');
  if (!yml.includes(`version: ${version}`)) {
    die(`latest.yml n'annonce pas la version ${version}. Vérifiez le bump de buildInfo.js et refaites un build complet.`);
  }
  // Vérifier aussi buildInfo.js pour éviter le drift #29 historique
  if (fs.existsSync(PATHS.buildInfo)) {
    const bi = fs.readFileSync(PATHS.buildInfo, 'utf8');
    if (!bi.includes(`'${version}'`) && !bi.includes(`"${version}"`)) {
      die(`client/src/buildInfo.js ne contient pas la version ${version}. Bump oublié.`);
    }
  }
}

// --- 3. Empreintes + taille ----------------------------------------------

function computeHashes() {
  const buf = fs.readFileSync(PATHS.exe);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const sha512Base64 = crypto.createHash('sha512').update(buf).digest('base64');
  const sizeBytes = buf.length;
  const sizeMb = Math.round(sizeBytes / 1024 / 1024);
  return { sha256, sha512Base64, sizeBytes, sizeMb };
}

// --- 4. Mettre à jour index.html -----------------------------------------

function updateIndexHtml({ version, sha256, sizeMb }) {
  let html = fs.readFileSync(PATHS.indexHtml, 'utf8');
  const before = html;

  // Badge de version (hero)
  html = html.replace(
    /<span class="badge-version">v[0-9A-Za-z.\-]+<\/span>/g,
    `<span class="badge-version">v${version}</span>`,
  );

  // Footer-tag de version
  html = html.replace(
    /<span class="footer-tag">v[0-9A-Za-z.\-]+<\/span>/g,
    `<span class="footer-tag">v${version}</span>`,
  );

  // Version dans la fiche téléchargement
  html = html.replace(
    /(<span class="download-spec-label">Version<\/span>\s*<span class="download-spec-value">)[^<]+(<\/span>)/,
    `$1${version}$2`,
  );

  // Taille dans la fiche téléchargement
  html = html.replace(
    /(<span class="download-spec-label">Taille<\/span>\s*<span class="download-spec-value">)~?\d+\s*Mo(<\/span>)/,
    `$1~${sizeMb} Mo$2`,
  );

  // Taille dans le hero (liste « ~157 Mo Téléchargement »)
  html = html.replace(
    /<strong>~\d+\s*Mo<\/strong>(\s*<span>Téléchargement)/,
    `<strong>~${sizeMb} Mo</strong>$1`,
  );

  // SHA-256 (toutes les occurrences hex 64 chars)
  html = html.replace(/[0-9a-f]{64}/g, sha256);

  if (html === before) {
    log('warn', "index.html n'a pas changé (déjà à jour ou patron non reconnu)");
  } else {
    writeFileMaybe(PATHS.indexHtml, html);
  }
}

// --- 5. Mettre à jour HOSTING.md -----------------------------------------

function updateHostingMd({ version, sha256, sha512Base64, sizeBytes, sizeMb }) {
  let md = fs.readFileSync(PATHS.hostingMd, 'utf8');
  const before = md;
  const today = new Date().toISOString().slice(0, 10);

  md = md.replace(/Dernière mise à jour : \d{4}-\d{2}-\d{2}/, `Dernière mise à jour : ${today}`);

  // Ligne « Contenu » du bucket installeur
  md = md.replace(
    /\| Contenu \| `KHEOPS2-Setup\.exe`[^|]*\|/,
    `| Contenu | \`KHEOPS2-Setup.exe\` (~${sizeMb} MB), \`KHEOPS2-Setup.exe.blockmap\`, \`latest.yml\` |`,
  );

  // Ligne « Version »
  md = md.replace(
    /\| Version \| [^|]+\|/,
    `| Version | **${version}** (au ${today}) |`,
  );

  // Ligne « Taille »
  md = md.replace(
    /\| Taille \| [^|]+\|/,
    `| Taille | ~${sizeMb} MB (${sizeBytes.toLocaleString('fr-FR').replace(/ /g, ' ')} octets) |`,
  );

  // Ligne SHA256
  md = md.replace(
    /\| \*\*SHA256\*\* \| `[^`]+` \|/,
    `| **SHA256** | \`${sha256}\` |`,
  );

  // Ligne SHA512 (ajoutée S27 si elle n'existe pas)
  if (md.includes('**SHA512 (latest.yml)**')) {
    md = md.replace(
      /\| \*\*SHA512 \(latest\.yml\)\*\* \| `[^`]+` \|/,
      `| **SHA512 (latest.yml)** | \`${sha512Base64}\` |`,
    );
  } else {
    md = md.replace(
      /(\| \*\*SHA256\*\* \| `[^`]+` \|)/,
      `$1\n| **SHA512 (latest.yml)** | \`${sha512Base64}\` |`,
    );
  }

  if (md === before) {
    log('warn', "HOSTING.md n'a pas changé (déjà à jour ou patron non reconnu)");
  } else {
    writeFileMaybe(PATHS.hostingMd, md);
  }
}

// --- 6. Upload des artefacts sur GCS -------------------------------------

function uploadArtifacts() {
  if (SKIP_UPLOAD) {
    log('warn', "Upload sauté (--skip-upload ou --dry-run)");
    return;
  }
  run(`gcloud storage cp "${PATHS.exe}" "${PATHS.blockmap}" ${BUCKET_DOWNLOAD}/`);
  run(`gcloud storage cp --cache-control="no-cache,max-age=0" "${PATHS.latestYml}" ${BUCKET_DOWNLOAD}/latest.yml`);
  run(`gcloud storage cp --cache-control="no-cache,max-age=0" "${PATHS.indexHtml}" ${BUCKET_SITE}/index.html`);
}

// --- 7. Vérification publique --------------------------------------------

async function verifyPublic({ version, sha256, sizeBytes }) {
  if (SKIP_UPLOAD) {
    log('warn', "Vérification publique sautée (--skip-upload)");
    return true;
  }

  const ts = Date.now();
  const yml = await httpGet(`${PUBLIC_URLS.latestYml}?t=${ts}`);
  const exe = await httpHead(`${PUBLIC_URLS.exe}?t=${ts}`);
  const site = await httpGet(`${PUBLIC_URLS.indexHtml}?t=${ts}`);

  const checks = [
    {
      name: 'latest.yml annonce la version',
      ok: yml.status === 200 && yml.body.includes(`version: ${version}`),
      got: (yml.body.match(/version: \S+/) || ['(absent)'])[0],
    },
    {
      name: 'EXE accessible HTTP 200',
      ok: exe.status === 200,
      got: `HTTP ${exe.status}`,
    },
    {
      name: 'EXE Content-Length correct',
      ok: Number(exe.headers['content-length']) === sizeBytes,
      got: `${exe.headers['content-length']} octets`,
    },
    {
      name: 'Site contient le badge de version à jour',
      ok: site.status === 200 && site.body.includes(`badge-version">v${version}<`),
      got: (site.body.match(/badge-version">v[^<]+/) || ['(absent)'])[0],
    },
    {
      name: 'Site contient le footer de version à jour',
      ok: site.status === 200 && site.body.includes(`footer-tag">v${version}<`),
      got: (site.body.match(/footer-tag">v[^<]+/) || ['(absent)'])[0],
    },
    {
      name: 'Site contient le bon SHA-256',
      ok: site.status === 200 && site.body.includes(sha256),
      got: (site.body.match(/[0-9a-f]{64}/) || ['(absent)'])[0],
    },
  ];

  console.log('');
  log('step', 'Vérification publique :');
  let allOk = true;
  for (const c of checks) {
    if (c.ok) {
      log('ok', `${c.name}  →  ${c.got}`);
    } else {
      log('err', `${c.name}  →  ${c.got}`);
      allOk = false;
    }
  }
  return allOk;
}

// --- main ----------------------------------------------------------------

(async () => {
  log('step', `Release Kheops 2 — ${new Date().toISOString()}`);
  if (DRY_RUN) log('warn', 'MODE DRY-RUN : aucune modification de fichier ni upload');

  const version = loadVersion();
  log('info', `Version cible : ${version}`);

  checkArtifacts(version);
  log('ok', 'Artefacts présents et cohérents avec la version');

  const { sha256, sha512Base64, sizeBytes, sizeMb } = computeHashes();
  log('info', `Taille EXE  : ${sizeBytes.toLocaleString('fr-FR').replace(/ /g, ' ')} octets (~${sizeMb} Mo)`);
  log('info', `SHA-256     : ${sha256}`);
  log('info', `SHA-512 b64 : ${sha512Base64.slice(0, 40)}…`);

  log('step', 'Mise à jour des fichiers locaux');
  updateIndexHtml({ version, sha256, sizeMb });
  updateHostingMd({ version, sha256, sha512Base64, sizeBytes, sizeMb });

  log('step', 'Upload Google Cloud Storage');
  uploadArtifacts();

  log('step', 'Vérification publique');
  const ok = await verifyPublic({ version, sha256, sizeBytes });

  console.log('');
  if (ok) {
    log('ok', `Release ${version} terminée avec succès`);
    log('info', `Téléchargement : ${PUBLIC_URLS.exe}`);
    log('info', `Page publique : ${PUBLIC_URLS.indexHtml}`);
    process.exit(0);
  } else {
    log('err', `Release ${version} : au moins une vérification a échoué`);
    process.exit(1);
  }
})().catch((err) => {
  log('err', `Erreur fatale : ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
