// electron-app/services/aideJuridictionnelleGenerator.js
//
// Génère le cerfa 15626*02 (aide juridictionnelle) rempli, par superposition
// (overlay) de texte/croix aux coordonnées de la carte cartographiée en
// Phase 0. Lit le snapshot `aideJuridictionnelle` du dossier (Phase 1).
//
// La carte stocke déjà y = hauteurPage - bottom (origine bas-gauche),
// convention identique à pdf-lib → x,y utilisables tels quels.
// Les 4 tableaux répétitifs (personnes à charge, adversaires, ressources,
// prestations) ne sont pas encore cartographiés : leurs champs absents de
// la carte sont simplement ignorés (dégradation propre).

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const ASSET_DIR = path.join(__dirname, "..", "assets", "aj");
const CERFA_PATH = path.join(ASSET_DIR, "cerfa_15626-02.pdf");
const MAP_PATH = path.join(ASSET_DIR, "cerfa_15626_map.json");

// Réglages de rendu (ajustables d'un seul endroit) :
// - FONT_SIZE : taille du texte de remplissage (un cran au-dessus de 8.5).
// - LIFT_PT   : remontée verticale ≈ 3 mm pour écrire ~1 mm au-dessus du
//   trait, comme à la main. NE s'applique PAS aux cases à cocher.
const FONT_SIZE = 10;
const LIFT_PT = 2; // ≈0,7 mm — vise un texte ~1 mm au-dessus du trait

// --- helpers d'accès au snapshot ---
const get = (obj, p) => p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

function noAccents(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Coche la case dont le mot-clé matche une valeur texte libre (situation
// familiale / pro saisies en texte libre dans la modale).
function matchKey(value, keyword) {
  return noAccents(value).includes(keyword);
}

// Civilité déduite du genre de la fiche client (fallback dossier si le
// snapshot ne la précise pas). "" si indéterminé → on ne coche rien.
function mapCiv(genre) {
  const g = noAccents(genre);
  if (!g) return "";
  if (g.startsWith("mme") || g.includes("madame") || g.includes("femme") || g === "f") return "madame";
  if (g.includes("monsieur") || g.includes("homme") || g === "m" || g === "mr" || g.startsWith("m")) return "monsieur";
  return "";
}

// Nationalité française déduite de la fiche client (fallback dossier).
function isFrench(nat) {
  const n = noAccents(nat);
  return !!n && (n.includes("franc") || n.includes("french"));
}

// BINDINGS : id de champ (carte Phase 0) -> resolver(snapshot).
// { text: fn } => fn renvoie une chaîne (dessinée si non vide).
// { check: fn } => fn renvoie un booléen (croix "X" si vrai).
function buildBindings(aj, client) {
  client = client || {};
  const d = aj.demandeur || {};
  const nat = d.nationalite || {};
  const pro = d.situationPro || {};
  const rep = aj.representant || {};
  const c = aj.conjoint || {};
  const op = aj.affaireOppose || {};
  const dm = aj.demande || {};
  const ax = aj.auxiliaire || {};
  const di = aj.dispenses || {};
  const pa = aj.patrimoine || {};
  const at = aj.attestation || {};
  // Fallbacks déduits de la fiche client du dossier si le snapshot ne
  // précise pas l'info (l'utilisateur peut toujours surcharger via la modale).
  const civResolved = d.civilite || mapCiv(client.genre);
  const natResolved = nat.type || (isFrench(client.nationalite) ? "francaise" : "");
  const sf = noAccents(
    d.situationFamiliale || client.situationFamiliale || client.etatCivil
    || client.situation_familiale || client.statutMarital || ""
  );
  const pr = noAccents(pro.type);
  const proprioDe = Array.isArray(pa.proprietaireDe) ? pa.proprietaireDe : [];

  const T = (v) => ({ text: () => (v == null || v === "" ? "" : String(v)) });
  const C = (b) => ({ check: () => !!b });

  const B = {
    // --- Demandeur ---
    civilite_madame: C(civResolved === "madame"),
    civilite_monsieur: C(civResolved === "monsieur"),
    nom_naissance: T(d.nomNaissance),
    nom_usage: T(d.nomUsage),
    prenoms: T(d.prenoms),
    date_naissance: T(d.dateNaissance),
    lieu_naissance: T(d.lieuNaissance),
    nat_francaise: C(natResolved === "francaise"),
    nat_ue: C(natResolved === "ue"),
    nat_autre: C(natResolved === "autre"),
    nat_preciser: T(nat.preciser),
    sit_celibataire: C(sf.includes("celib")),
    sit_marie: C(sf.includes("mari")),
    sit_divorce: C(sf.includes("divorc")),
    sit_pacse: C(sf.includes("pacs")),
    sit_concubin: C(sf.includes("concub")),
    sit_veuf: C(sf.includes("veu")),
    adresse: T(d.adresse),
    code_postal: T(d.codePostal),
    commune: T(d.commune),
    pays: T(d.pays),
    telephone: T(d.telephone),
    courriel: T(d.courriel),
    pro_cdi: C(matchKey(pr, "cdi") || matchKey(pr, "fonctionnaire")),
    pro_cdd: C(matchKey(pr, "cdd") || matchKey(pr, "stage") || matchKey(pr, "interim")),
    pro_artisan: C(matchKey(pr, "artisan") || matchKey(pr, "commerc") || matchKey(pr, "liberal")),
    pro_chomage: C(matchKey(pr, "chom")),
    pro_apprentissage: C(matchKey(pr, "apprent")),
    pro_etudes: C(matchKey(pr, "etud")),
    pro_retraite: C(matchKey(pr, "retrait")),
    pro_autre: C(matchKey(pr, "autre")),
    pro_preciser: T(pro.preciser),
    num_caf: T(d.numCAF),
    num_fiscal: T(d.numFiscal),
    ref_avis: T(d.refAvisImposition),
    // --- Représentant légal ---
    rep_nom_prenom: T(rep.nomPrenom),
    rep_parent: C(matchKey(rep.statut, "parent")),
    rep_tuteur: C(matchKey(rep.statut, "tuteur")),
    rep_curateur: C(matchKey(rep.statut, "curateur")),
    rep_autre: C(matchKey(rep.statut, "autre")),
    rep_statut: T(rep.statut),
    rep_adresse: T(rep.adresse),
    rep_code_postal: T(rep.codePostal),
    rep_commune: T(rep.commune),
    rep_pays: T(rep.pays),
    rep_telephone: T(rep.telephone),
    rep_courriel: T(rep.courriel),
    // --- Conjoint ---
    conj_civ_madame: C(c.civilite === "madame"),
    conj_civ_monsieur: C(c.civilite === "monsieur"),
    conj_nom_naissance: T(c.nomNaissance),
    conj_nom_usage: T(c.nomUsage),
    conj_prenoms: T(c.prenoms),
    conj_date_naissance: T(c.dateNaissance),
    conj_lieu_naissance: T(c.lieuNaissance),
    // --- Affaire / demande ---
    oppose_oui: C(op.oppose === "oui"),
    oppose_non: C(op.oppose === "non"),
    oppose_preciser: T(op.preciser),
    proc_souhaitez: C(dm.procedure === "souhaite"),
    proc_juge_saisi: C(dm.procedure === "juge_saisi"),
    proc_deja_jugee: C(dm.procedure === "deja_jugee"),
    expose_affaire: T(dm.exposeAffaire),
    deja_aj1_oui: C(dm.dejaBeneficieAJ === true),
    deja_aj1_non: C(dm.dejaBeneficieAJ === false),
    deja_aj2_oui: C(dm.dejaBeneficieAJ === true),
    deja_aj2_non: C(dm.dejaBeneficieAJ === false),
    etesvous_demandeur: C(dm.role === "demandeur"),
    etesvous_defendeur: C(dm.role === "defendeur"),
    juridiction_saisie: T(dm.juridictionSaisie),
    date_convocation: T(dm.dateConvocation),
    recours_oui: C(dm.recours === true),
    recours_non: C(dm.recours === false),
    executer_oui: C(dm.executer === true),
    executer_non: C(dm.executer === false),
    // --- Auxiliaire de justice ---
    desig1_select: C(ax.mode === "designation"),
    desig1_avocat: C(ax.mode === "designation" && ax.type === "avocat"),
    desig1_huissier: C(ax.mode === "designation" && ax.type === "huissier"),
    desig1_notaire: C(ax.mode === "designation" && ax.type === "notaire"),
    desig1_autre: C(ax.mode === "designation" && ax.type === "autre"),
    desig1_autre_preciser: T(ax.mode === "designation" ? ax.autrePreciser : ""),
    desig2_select: C(ax.mode === "deja_choisi"),
    desig2_avocat: C(ax.mode === "deja_choisi" && ax.type === "avocat"),
    desig2_huissier: C(ax.mode === "deja_choisi" && ax.type === "huissier"),
    desig2_notaire: C(ax.mode === "deja_choisi" && ax.type === "notaire"),
    desig2_autre: C(ax.mode === "deja_choisi" && ax.type === "autre"),
    desig2_autre_preciser: T(ax.mode === "deja_choisi" ? ax.autrePreciser : ""),
    aux_adresse: T(ax.adresse),
    aux_code_postal: T(ax.codePostal),
    aux_commune: T(ax.commune),
    aux_pays: T(ax.pays),
    aux_telephone: T(ax.telephone),
    aux_courriel: T(ax.courriel),
    // --- Dispenses ---
    disp_rsa: C(di.rsa),
    disp_aspa: C(di.aspa),
    disp_cnda: C(di.cnda),
    disp_victime: C(di.victime),
    // --- Patrimoine / attestation ---
    epargne_total: T(pa.epargneTotal),
    proprio_oui: C(pa.proprietaire === true),
    proprio_non: C(pa.proprietaire === false),
    proprio_logement: C(proprioDe.includes("logement")),
    proprio_autre: C(proprioDe.includes("autre")),
    patrimoine_desc: T(pa.description),
    consent_oui: C(at.consentElectronique === true),
    consent_non: C(at.consentElectronique === false),
    fait_lieu: T(at.faitLieu),
    fait_date: T(at.faitDate),
  };

  // --- Tableaux répétitifs (cartographiés : 5 PAC, 5 adversaires,
  //     8 types de ressources × 3 colonnes, 3 prestations) ---
  const pac = Array.isArray(aj.personnesACharge) ? aj.personnesACharge : [];
  for (let i = 0; i < 5; i++) {
    const r = pac[i] || {};
    B[`pac_${i}_nomPrenom`] = T(r.nomPrenom);
    B[`pac_${i}_lien`] = T(r.lien);
    B[`pac_${i}_dateNaissance`] = T(r.dateNaissance);
    B[`pac_${i}_vit`] = C(r.vitAvec);
    B[`pac_${i}_charge`] = C(r.aCharge);
  }

  const adv = Array.isArray(aj.adversaires) ? aj.adversaires : [];
  for (let i = 0; i < 5; i++) {
    const r = adv[i] || {};
    B[`adv_${i}_nomRaison`] = T(r.nomRaison);
    B[`adv_${i}_adresse`] = T(r.adresse);
  }

  const res = Array.isArray(aj.ressources) ? aj.ressources : [];
  const RES_KEYS = [
    "salaires", "revenus_agricoles", "allocations_chomage", "indemnites",
    "pensions_retraites", "pensions_alimentaires", "ressources_etranger", "autre_revenu",
  ];
  RES_KEYS.forEach((key) => {
    const row = res.find((x) => x && x.type === key) || {};
    B[`res_${key}_demandeur`] = T(row.demandeur);
    B[`res_${key}_conjoint`] = T(row.conjoint);
    B[`res_${key}_personnes`] = T(row.personnes);
  });

  const prest = Array.isArray(aj.prestationsVersees) ? aj.prestationsVersees : [];
  for (let i = 0; i < 3; i++) {
    const r = prest[i] || {};
    B[`prest_${i}_type`] = T(r.type);
    B[`prest_${i}_montant`] = T(r.montant);
    B[`prest_${i}_dest`] = T(r.destinataireRelation);
  }

  return B;
}

function clientName(dossierData) {
  try {
    const pour = dossierData?.dossier?.parties?.pour || [];
    const pd = pour[0]?.partieData || {};
    const raw =
      pd.raisonSociale ||
      pd.denomination ||
      (pd.nom ? `${pd.prenoms || pd.prenom || ""} ${pd.nom}`.trim() : "") ||
      dossierData?.dossier?.dossier?.nom ||
      "Dossier";
    return String(raw).replace(/[<>:"/\\|?*]/g, "_").trim().substring(0, 60) || "Dossier";
  } catch (_) {
    return "Dossier";
  }
}

/**
 * Génère le PDF rempli.
 * @param {Object} dossierData - dossier complet (API), contient .aideJuridictionnelle
 * @returns {Promise<{ pdfBytes: Buffer, fileName: string }>}
 */
async function generateAideJuridictionnellePdf(dossierData) {
  const aj = (dossierData && dossierData.aideJuridictionnelle) || {};

  if (!fs.existsSync(CERFA_PATH)) {
    throw new Error(`Modèle cerfa introuvable : ${CERFA_PATH}`);
  }
  const baseBytes = fs.readFileSync(CERFA_PATH);
  const map = JSON.parse(fs.readFileSync(MAP_PATH, "utf-8"));

  const pdfDoc = await PDFDocument.load(baseBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  const black = rgb(0.05, 0.05, 0.05);

  const client = (dossierData && dossierData.dossier && dossierData.dossier.parties
    && Array.isArray(dossierData.dossier.parties.pour) && dossierData.dossier.parties.pour[0]
    && dossierData.dossier.parties.pour[0].partieData) || {};
  const bindings = buildBindings(aj, client);

  for (const f of map) {
    const b = bindings[f.id];
    if (!b) continue;
    const pageIndex = (f.page || 1) - 1;
    const page = pages[pageIndex];
    if (!page) continue;

    if (f.type === "checkbox") {
      if (b.check && b.check()) {
        page.drawText("X", { x: f.x, y: f.y, size: FONT_SIZE, font, color: black });
      }
    } else if (f.type === "cells") {
      // Champ "à cases" : un caractère centré par cellule, segments
      // distribués sur leur largeur (pad = décalage du séparateur "/").
      let val = b.text ? String(b.text() || "") : "";
      if (val) {
        if (f.filter === "digits") val = val.replace(/\D/g, "");
        const centers = [];
        for (const s of f.segments || []) {
          const effX0 = s.x0 + (s.pad || 0);
          const cellW = (s.x1 - effX0) / s.n;
          for (let k = 0; k < s.n; k++) {
            centers.push(effX0 + (k + 0.5) * cellW);
          }
        }
        const size = FONT_SIZE;
        const chars = val.split("");
        for (let i = 0; i < chars.length && i < centers.length; i++) {
          const ch = chars[i];
          const w = font.widthOfTextAtSize(ch, size);
          page.drawText(ch, {
            x: centers[i] - w / 2,
            y: f.y + LIFT_PT,
            size,
            font,
            color: black,
          });
        }
      }
    } else {
      const val = b.text ? b.text() : "";
      if (val) {
        page.drawText(String(val), {
          x: f.x,
          y: f.y + LIFT_PT,
          size: FONT_SIZE,
          font,
          color: black,
        });
      }
    }
  }

  const out = await pdfDoc.save();
  const fileName = `Aide_juridictionnelle_${clientName(dossierData)}.pdf`;
  return { pdfBytes: Buffer.from(out), fileName };
}

module.exports = { generateAideJuridictionnellePdf };
