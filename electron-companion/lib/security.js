// electron-companion/lib/security.js
//
// Garde-fous du serveur local. Objectif ABSOLU : un site tiers ne doit JAMAIS
// pouvoir piloter le compagnon (ouvrir/modifier un document), meme s'il connait
// l'adresse 127.0.0.1:8080.
//
// Defenses cumulees :
//   1. Bind 127.0.0.1 uniquement (fait cote localServer/main) — pas de LAN.
//   2. Controle strict de l'Origin : refuse toute origine hors allowlist Kheops.
//   3. En-tete anti-CSRF obligatoire (X-Kheops-Companion) : force un preflight
//      CORS ; le compagnon ne l'autorise que pour les origines Kheops, donc un
//      site tiers ne peut pas l'envoyer en cross-origin.
//   4. Jeton de session compagnon (X-Kheops-Companion-Token) exige sur les
//      actions sensibles, revalide aupres du backend (le compagnon ne detient
//      AUCUN secret).
//   5. Gestion du preflight Private Network Access (public -> 127.0.0.1).

const { COMPANION_HEADER, getAllowedOrigins } = require('./config');

function originAllowed(origin) {
  if (!origin) return false; // on EXIGE un Origin (les fetch navigateur en envoient toujours)
  return getAllowedOrigins().has(origin);
}

/**
 * Pose les en-tetes CORS si l'origine est autorisee. Retourne true si l'origine
 * est acceptee, false sinon (l'appelant doit alors refuser la requete).
 */
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) return false;

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', `Content-Type, ${COMPANION_HEADER}, x-kheops-companion-token`);
  res.setHeader('Access-Control-Max-Age', '600');
  // Private Network Access / Local Network Access : autorise une page publique
  // (https) a joindre 127.0.0.1. On pose le header de facon INCONDITIONNELLE — sur
  // le prevol OPTIONS ET sur la reponse reelle (GET/POST) — car Chrome verifie ce
  // header tantot sur le prevol, tantot sur la reponse reelle selon la version.
  // L'ancienne pose conditionnelle (uniquement si le header de requete etait
  // present, ce qui n'arrive QUE sur le prevol) laissait le fetch reel bloque ->
  // l'app croyait le compagnon absent alors qu'il tourne. Reste gate par
  // originAllowed() ci-dessus : seules les origines Kheops recoivent ce header.
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  return true;
}

/**
 * Repond au preflight OPTIONS. 204 si origine autorisee, 403 sinon.
 */
function handlePreflight(req, res) {
  const ok = applyCors(req, res);
  res.writeHead(ok ? 204 : 403);
  res.end();
}

/**
 * Verifie une requete sensible : Origin autorisee + en-tete anti-CSRF present.
 * Pose aussi les en-tetes CORS pour la reponse. Retourne { ok, status, reason }.
 */
function guard(req, res) {
  if (!applyCors(req, res)) {
    return { ok: false, status: 403, reason: 'origin-not-allowed' };
  }
  if (req.headers[COMPANION_HEADER] !== '1') {
    return { ok: false, status: 403, reason: 'missing-anticsrf-header' };
  }
  return { ok: true };
}

module.exports = { applyCors, handlePreflight, guard, originAllowed };
