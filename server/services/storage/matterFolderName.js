// server/services/storage/matterFolderName.js
// ------------------------------------------------------------------------
// Construit un nom de DOSSIER lisible pour le rangement cloud (OneDrive /
// SharePoint / Google Drive), a partir du nom du dossier et de sa reference :
//
//     "Durand c- Petit — 202601"
//
// - Le nom vient de dossier.dossier.nom (ex. "Durand c/ Petit"). Le "/" etant
//   INTERDIT dans les noms OneDrive/Windows, on le transforme en " c- ".
// - La reference (Dossier.reference, unique par dossier, ex. "202601") sert de
//   NUMERO ANTI-DOUBLON : deux dossiers homonymes obtiennent des suffixes
//   differents, donc des dossiers cloud distincts.
//
// Caracteres interdits par OneDrive/SharePoint/Windows : \ / : * ? " < > |
// (+ pas de point/espace en fin de segment). On borne aussi la longueur.
// ------------------------------------------------------------------------

const RESERVED = /[\\/:*?"<>|]/g;

/** Rend une chaine sure comme segment de chemin cloud. */
function sanitizeSegment(value, fallback = 'Dossier') {
  let out = String(value == null ? '' : value)
    .replace(/\s*c\/\s*/gi, ' c- ')     // "X c/ Y" -> "X c- Y" (/ interdit)
    .replace(RESERVED, '-')             // caracteres interdits -> '-'
    .replace(/\s+/g, ' ')               // espaces multiples -> un seul
    .replace(/[.\s]+$/, '')             // pas de point/espace final (OneDrive)
    .trim();
  if (out.length > 120) out = out.slice(0, 120).replace(/[.\s]+$/, '').trim();
  return out || fallback;
}

/**
 * Nom de dossier cloud lisible = "<nom assaini> — <reference>".
 * @param {string} nom        dossier.dossier.nom
 * @param {string} reference  Dossier.reference (numero unique)
 */
function readableMatterFolder(nom, reference) {
  const base = sanitizeSegment(nom, 'Dossier sans nom');
  const ref = sanitizeSegment(reference, '');
  return ref ? `${base} — ${ref}` : base;
}

module.exports = { readableMatterFolder, sanitizeSegment };
