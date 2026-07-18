// Kheops_2/server/routes/folder/folderRechercheAvancee.js
// ------------------------------------------------------------------------
// Recherche avancee par criteres croises (loupe du header -> Bureau).
//
//   POST /api/folder/rechercheAvancee
//     Filtre les dossiers accessibles au user par criteres COMBINES (ET) :
//     nom, partie, contact/intervenant, gestionnaire, type, reference,
//     plage de dates de creation. Tri + limite (25/50/100/200/500).
//     Reponse : { results: [dossiers], total }.
//
//   POST /api/folder/rechercheAvanceeSuggestions
//     Autocomplete : valeurs distinctes issues des dossiers du user pour
//     les champs nom / type / reference. Reponse : string[].
//     (Les criteres partie/contact utilisent /searchAllUserContacts cote
//      client ; le gestionnaire est filtre depuis officeUsers en local.)
//
// Securite (identique aux autres routes /folder) :
//   - middleware `auth` -> req.user (id du JWT, non spoofable).
//   - cloisonnement cabinet : getAccessibleUserIds(req.user) + UserDossier.
//   - regex utilisateur echappees (anti-ReDoS / anti-injection d'operateur).
// ------------------------------------------------------------------------

const express = require("express");
const router = express.Router();

const auth = require("../../middlewares/middleware-auth");
const { asyncHandler } = require("../../middlewares/folder-middleWare");
const Dossier = require("../../models/Folder/Dossier");
const UserDossier = require("../../models/Folder/modelsLiaisons/UserDossier");
const { getAccessibleUserIds } = require("../../services/cabinetAccess");

// Echappe les metacaracteres regex (meme helper que folderDossierInteraction).
const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MAX_TERM = 100;
const RA_LIMITS = [25, 50, 100, 200, 500];

// Filtre « contient » insensible a la casse pour une valeur saisie par l'user.
const contains = (val) => ({ $regex: escapeRegExp(String(val).trim()), $options: "i" });

// ------------------------------------------------------------------------
// TYPE / NATURE de dossier : traduction LIBELLE <-> CODE.
// Les dossiers « tribunal » (TGI/CASS/CPH/...) NE stockent PAS leur nature dans
// `dossier.dossier.type_dossier` (qui reste vide) mais dans
// `dossier.dossier.selectedTribunalAffaire.type`, sous forme de CODE MINUSCULE
// ('cass','cph','tgi'...). L'UI, elle, affiche un LIBELLE ('CASS','CPH','TJ'...)
// calcule cote client. La recherche doit donc interroger les DEUX champs et
// traduire le libelle saisi vers le(s) code(s) reel(s). Miroir serveur des tables
// client dossiersListe/index.js (TRIBUNAL_LABEL / TRIBUNAL_FULL_LABEL).
const TRIBUNAL_CODE_LABELS = {
  tgi:   ["tgi", "tj", "tribunal judiciaire"],
  tco:   ["tco", "tribunal de commerce"],
  cph:   ["cph", "conseil de prud'hommes", "prudhommes", "prud"],
  ta:    ["ta", "tribunal administratif"],
  cass:  ["cass", "cour d'assises", "assises"],
  ccd:   ["ccd", "cour criminelle departementale", "cour criminelle"],
  te:    ["te", "tribunal pour enfants"],
  tprx:  ["tprx", "tribunal de proximite"],
  ca:    ["ca", "cour d'appel"],
  caa:   ["caa", "cour administrative d'appel"],
  cdad:  ["cdad", "conseil departemental d'acces au droit"],
  tbrtj: ["tbrtj", "tribunal paritaire des baux ruraux"],
};
// Code juridiction -> libelle court (pour peupler la liste deroulante).
const TRIBUNAL_CODE_TO_LABEL = {
  tgi: "TJ", tco: "TCO", cph: "CPH", ta: "TA", cass: "CASS", ccd: "CCD",
  te: "TE", tprx: "TPRX", ca: "CA", caa: "CAA", cdad: "CDAD", tbrtj: "TBRTJ",
};
// Libelle lisible des type_dossier non-tribunal connus.
const TYPE_DOSSIER_TO_LABEL = { divorce_cm: "Divorce CM" };

// Codes juridiction dont l'un des libelles CONTIENT le terme saisi (minuscule).
function tribunalCodesForTerm(term) {
  const t = String(term).trim().toLowerCase();
  if (!t) return [];
  const codes = [];
  for (const [code, labels] of Object.entries(TRIBUNAL_CODE_LABELS)) {
    if (labels.some((l) => l.includes(t))) codes.push(code);
  }
  return codes;
}

// Condition Mongo « dossier SANS type_dossier ET SANS juridiction ».
const SANS_TYPE_COND = {
  $and: [
    { $or: [{ "dossier.dossier.type_dossier": { $in: [null, ""] } }, { "dossier.dossier.type_dossier": { $exists: false } }] },
    { $or: [{ "dossier.dossier.selectedTribunalAffaire.type": { $in: [null, ""] } }, { "dossier.dossier.selectedTribunalAffaire": { $exists: false } }] },
  ],
};

// Valide/normalise une valeur texte : null si vide, undefined si trop longue.
function readTerm(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (t.length > MAX_TERM) return undefined; // signal « trop long »
  return t;
}

// _id des dossiers accessibles au user (cloisonnement cabinet).
async function accessibleDossierIds(reqUser) {
  const links = await UserDossier
    .find({ user: { $in: await getAccessibleUserIds(reqUser) } })
    .select("dossier")
    .lean();
  return links.map((l) => l.dossier);
}

// ------------------------------------------------------------------------
// POST /rechercheAvancee — recherche croisee
// ------------------------------------------------------------------------
router.post(
  "/rechercheAvancee",
  auth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};

    // Lecture + validation longueur des criteres texte.
    const terms = {};
    for (const key of ["nom", "partie", "contact", "gestionnaire", "type", "reference"]) {
      const t = readTerm(body[key]);
      if (t === undefined) {
        return res.status(400).json({ message: `Critere « ${key} » trop long (max ${MAX_TERM}).` });
      }
      if (t) terms[key] = t;
    }

    // Plage de dates (optionnelle). On borne au jour entier en UTC de facon
    // deterministe : la borne haute a 23:59:59.999Z quel que soit le fuseau du
    // serveur (Cloud Run tourne en UTC ; setHours() aurait dependu du fuseau).
    const parseDay = (v, end) => {
      if (!v) return null;
      const d = new Date(v);
      if (isNaN(d.getTime())) return null;
      const day = d.toISOString().split("T")[0]; // 'AAAA-MM-JJ'
      return new Date(`${day}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
    };
    const dateDebut = parseDay(body.dateDebut, false);
    const dateFin = parseDay(body.dateFin, true);

    // Tri.
    const SORT_FIELDS = {
      dateCreation: "dateCreation",
      nom: "dossier.dossier.nom",
      type: "dossier.dossier.type_dossier",
      reference: "reference",
    };
    const sortField = SORT_FIELDS[body.sortBy] || "dateCreation";
    const sortDir = body.sortDir === "asc" ? 1 : -1;

    // Limite.
    const limit = RA_LIMITS.includes(Number(body.limit)) ? Number(body.limit) : 25;

    // Cloisonnement cabinet.
    const dossierIds = await accessibleDossierIds(req.user);
    if (dossierIds.length === 0) return res.json({ results: [], total: 0 });

    // Construction du filtre : ET entre criteres, OR interne par critere.
    const and = [];

    if (terms.nom) and.push({ "dossier.dossier.nom": contains(terms.nom) });
    if (terms.reference) and.push({ reference: contains(terms.reference) });
    if (terms.type) {
      const rawRx = contains(terms.type);
      const t = terms.type.trim().toLowerCase();
      // On interroge type_dossier ET la juridiction (selectedTribunalAffaire.type),
      // + on traduit le libelle saisi vers le(s) code(s) reel(s).
      const typeOr = [
        { "dossier.dossier.type_dossier": rawRx },
        { "dossier.dossier.selectedTribunalAffaire.type": rawRx },
      ];
      for (const c of tribunalCodesForTerm(terms.type)) {
        typeOr.push({ "dossier.dossier.selectedTribunalAffaire.type": c });
      }
      if (/divorce|dcm|consentement/.test(t)) {
        typeOr.push({ "dossier.dossier.type_dossier": "divorce_cm" });
      }
      if (/sans type|sans nature|aucun type|aucune nature/.test(t)) {
        typeOr.push(SANS_TYPE_COND);
      }
      and.push({ $or: typeOr });
    }

    if (terms.partie) {
      const rx = contains(terms.partie);
      and.push({ $or: [
        { "dossier.parties.pour.nomPartie": rx },
        { "dossier.parties.contre.nomPartie": rx },
        { "dossier.parties.pour.partieData.nom": rx },
        { "dossier.parties.pour.partieData.prenoms": rx },
        { "dossier.parties.pour.partieData.raisonSociale": rx },
        { "dossier.parties.pour.partieData.denomination": rx },
        { "dossier.parties.contre.partieData.nom": rx },
        { "dossier.parties.contre.partieData.prenoms": rx },
        { "dossier.parties.contre.partieData.raisonSociale": rx },
        { "dossier.parties.contre.partieData.denomination": rx },
        // Divorce CM : parties a plat (pas de partieData).
        { "dossier.parties.pour.nom": rx },
        { "dossier.parties.pour.prenoms": rx },
        { "dossier.parties.contre.nom": rx },
        { "dossier.parties.contre.prenoms": rx },
        // Repli : le nom du dossier contient souvent les parties.
        { "dossier.dossier.nom": rx },
      ] });
    }

    if (terms.contact) {
      const rx = contains(terms.contact);
      and.push({ $or: [
        { "dossier.contactsDuDossier.denomination": rx },
        { "dossier.contactsDuDossier.raisonSociale": rx },
        { "dossier.contactsDuDossier.nom": rx },
        { "dossier.contactsDuDossier.prenoms": rx },
        { "dossier.contactsDuDossier.contactNom": rx },
        { "dossier.contactsDuDossier.contactPrenom": rx },
        { "dossier.contactsDuDossier.email": rx },
        { "dossier.contactsDuDossier.contactEmail": rx },
      ] });
    }

    if (terms.gestionnaire) {
      const rx = contains(terms.gestionnaire);
      and.push({ $or: [
        { "dossier.dossier.responsables.nomOfficeUser": rx },
        { "dossier.dossier.responsables.prenomOfficeUser": rx },
        { "dossier.dossier.responsables.email": rx },
        { "dossier.avocatsResponsables.nomOfficeUser": rx },
        { "dossier.avocatsResponsables.prenomOfficeUser": rx },
      ] });
    }

    if (dateDebut || dateFin) {
      // Filtre ET tri s'appuient sur le MEME champ dateCreation (toujours
      // present, jamais modifie apres creation — c'est aussi le champ de tri de
      // la liste « Dossiers recents »), pour un ordre coherent avec le filtrage.
      const range = {};
      if (dateDebut) range.$gte = dateDebut;
      if (dateFin) range.$lte = dateFin;
      and.push({ dateCreation: range });
    }

    const filter = { _id: { $in: dossierIds } };
    if (and.length) filter.$and = and;

    const total = await Dossier.countDocuments(filter);
    const results = await Dossier
      .find(filter)
      .sort({ [sortField]: sortDir })
      .limit(limit)
      .lean();

    return res.json({ results, total });
  })
);

// ------------------------------------------------------------------------
// POST /rechercheAvanceeSuggestions — autocomplete (nom / type / reference)
// ------------------------------------------------------------------------
router.post(
  "/rechercheAvanceeSuggestions",
  auth,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const term = readTerm(body.term);
    if (term === undefined) return res.status(400).json({ message: "Terme trop long." });

    const dossierIds = await accessibleDossierIds(req.user);
    if (dossierIds.length === 0) return res.json([]);
    const baseMatch = { _id: { $in: dossierIds } };
    const t = term ? term.toLowerCase() : "";

    // Champ TYPE / NATURE : liste LISIBLE de TOUTES les natures presentes —
    // type_dossier (ex. Divorce CM) + juridictions (selectedTribunalAffaire.type
    // -> CASS/CPH/TJ...) + une entree « Sans type » si des dossiers n'ont ni l'un
    // ni l'autre. (Avant : distinct sur le seul type_dossier -> juridictions et
    // dossiers sans type invisibles dans le deroulant.)
    if (body.field === "type") {
      const [rawTypes, tribCodes, nbSansType] = await Promise.all([
        Dossier.distinct("dossier.dossier.type_dossier", baseMatch),
        Dossier.distinct("dossier.dossier.selectedTribunalAffaire.type", baseMatch),
        Dossier.countDocuments({ ...baseMatch, ...SANS_TYPE_COND }),
      ]);
      const labels = new Set();
      for (const v of rawTypes) {
        if (typeof v === "string" && v.trim()) labels.add(TYPE_DOSSIER_TO_LABEL[v] || v);
      }
      for (const c of tribCodes) {
        if (typeof c === "string" && c.trim()) labels.add(TRIBUNAL_CODE_TO_LABEL[c] || c.toUpperCase());
      }
      if (nbSansType > 0) labels.add("Sans type");
      return res.json(
        Array.from(labels)
          .filter((l) => !t || l.toLowerCase().includes(t))
          .sort((a, b) => a.localeCompare(b, "fr"))
          .slice(0, 50),
      );
    }

    // nom / reference : valeurs distinctes brutes (inchange).
    const FIELD_PATHS = { nom: "dossier.dossier.nom", reference: "reference" };
    const path = FIELD_PATHS[body.field];
    if (!path) return res.json([]);

    const match = { ...baseMatch };
    if (term) match[path] = contains(term);
    const values = await Dossier.distinct(path, match);
    const suggestions = values
      .filter((v) => typeof v === "string" && v.trim() !== "")
      .sort((a, b) => a.localeCompare(b, "fr"))
      .slice(0, 10);
    return res.json(suggestions);
  })
);

module.exports = router;
