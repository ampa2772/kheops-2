// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_69\Kheops_2\server\routes\folder\folderSearch.js

// Nouveau code
const express = require("express");
const router = express.Router();
const passport = require("passport"); // <<< IMPORT AJOUTÉ
const mongoose = require("mongoose"); // <<< === CORRECTION : IMPORT DE MONGOOSE AJOUTÉ ===
const auth = require("../../middlewares/middleware-auth");
const { asyncHandler } = require("../../middlewares/folder-middleWare");

// ========================================================================
// Import des modèles
// ========================================================================
const Contact           = require("../../models/Folder/Contact");
const ContactPM         = require("../../models/Folder/ContactPM");
const ContactPMPublique = require("../../models/Folder/ContactPMPublique");
const Dossier           = require("../../models/Folder/Dossier"); // AJOUT : Importer le modèle Dossier
const UserDossier       = require("../../models/Folder/modelsLiaisons/UserDossier"); // <<< IMPORT AJOUTÉ

const UserContact            = require("../../models/Folder/modelsLiaisons/UserContact");
const UserContactPM          = require("../../models/Folder/modelsLiaisons/UserContactPM");
const UserContactPMPublique  = require("../../models/Folder/modelsLiaisons/UserContactPMPublique");

// === NOUVELLES IMPORTATIONS POUR ENRICHIR LES CONTACTS PM ===
const RepresentantLegal = require('../../models/Folder/RepresentantLegalPM');
const ContactDirect = require('../../models/Folder/ContactDirect');
const ContactRepresentantLegal = require('../../models/Folder/modelsLiaisons/ContactRepresentantLegal');
const ContactContactDirect = require('../../models/Folder/modelsLiaisons/ContactContactDirect');


// ========================================================================
// Imports de JSON pour la recherche communes, métiers, pays, etc.
// ========================================================================
const communes = require("../../utils/Datas/france.json");

const paysData = require("../../utils/Datas/pays.json");
const nationalitesData = require("../../utils/Datas/nationalites.json");

const { capitalizeNames } = require("../../utils/fonctions");

const { getAccessibleUserIds } = require("../../services/cabinetAccess");

// ========================================================================
// Routes de récupération / recherche (communes, professions, etc.)
// ========================================================================

// ------------------------------------------------------------------------
// GET /communes
// ------------------------------------------------------------------------
router.get(
  "/communes",
  asyncHandler(async (req, res) => {
    const query = req.query.nom_commune;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    const uniqueCommunes = Array.from(
      communes.reduce(
        (map, obj) => map.set(obj.Nom_commune + obj.Code_postal, obj),
        new Map()
      ).values()
    );

    const modifiedCommunes = uniqueCommunes.map((commune) => ({
      ...commune,
      Nom_commune: commune.Nom_commune.replace(/'/g, " "),
    }));

    const queryParts = query ? query.toLowerCase().split(" ") : [];

    const matchingCommunes = modifiedCommunes
      .filter((commune) => {
        const communeParts = commune.Nom_commune.toLowerCase().split(" ");
        return queryParts.every(
          (part, index) => communeParts[index] && communeParts[index].startsWith(part)
        );
      })
      .sort((a, b) => a.Nom_commune.localeCompare(b.Nom_commune));

    const formattedCommunes = matchingCommunes.map((commune) => ({
      ...uniqueCommunes.find(
        (originalCommune) => originalCommune.Code_postal === commune.Code_postal
      ),
      Nom_commune: capitalizeNames(commune.Nom_commune),
    }));

    const totalPages = Math.ceil(formattedCommunes.length / limit);
    const endIndex = page * limit;
    const communesUntilThisPage = formattedCommunes.slice(0, endIndex);

    res.json({ totalPages, currentPage: page, communes: communesUntilThisPage });
  })
);


// ------------------------------------------------------------------------
// GET /pays
// ------------------------------------------------------------------------
router.get(
  "/pays",
  asyncHandler(async (req, res) => {
    const query = req.query.nom_pays || "";
    const matchingPays = paysData.filter((pays) =>
      pays.toLowerCase().startsWith(query.toLowerCase())
    );
    res.json(matchingPays);
  })
);

// ------------------------------------------------------------------------
// GET /nationalites
// ------------------------------------------------------------------------
router.get(
  "/nationalites",
  asyncHandler(async (req, res) => {
    const query = req.query.nom_nationalite || "";
    const matchingNationalites = nationalitesData.filter((nationalite) =>
      nationalite.toLowerCase().startsWith(query.toLowerCase())
    );
    res.json(matchingNationalites);
  })
);

// ------------------------------------------------------------------------
// GET /notaires => recherche de contacts de type "Notaire"
// SECURITE rc37 (M-11) : `auth` ajoute + filtre par UserContact (intersection
// avec les contacts du cabinet courant). Sans cela, l'endpoint etait public
// et retournait tous les notaires de la base.
// ------------------------------------------------------------------------
router.get(
  "/notaires",
  auth,
  asyncHandler(async (req, res) => {
    const query = req.query.nom;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const totalLimit = page * limit;

    let response = {};

    if (!query || query === "") {
      response = {
        totalPages: 0,
        currentPage: 1,
        notaires: [],
        emptyQuery: true,
      };
    } else {
      // Anti-ReDoS : echapper les metacharacters dans la query user.
      const safeQuery = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexQuery = new RegExp("^" + safeQuery, "i");

      // Restreindre aux contacts lies au user (UserContact)
      const userLinks = await UserContact.find({ user: { $in: await getAccessibleUserIds(req.user) } })
        .select('contact')
        .lean();
      const userContactIds = userLinks.map((l) => l.contact);

      const notaires = await Contact.find({
        _id: { $in: userContactIds },
        type: "Notaire",
        nom: regexQuery,
      })
        .sort({ nom: 1 })
        .limit(totalLimit);

      const totalNotaires = await Contact.countDocuments({
        _id: { $in: userContactIds },
        type: "Notaire",
        nom: regexQuery,
      });
      const totalPages = Math.ceil(totalNotaires / limit);

      if (notaires.length === 0) {
        response = {
          totalPages,
          currentPage: page,
          notaires: [],
          emptyQuery: false,
        };
      } else if (notaires.length === 1) {
        if (query.length < 2) {
          response = {
            message:
              "La requête doit contenir au moins 2 caractères pour un résultat unique.",
            emptyQuery: false,
          };
        } else {
          response = {
            totalPages,
            currentPage: page,
            notaires: [notaires[0]],
            emptyQuery: false,
          };
        }
      } else {
        response = {
          totalPages,
          currentPage: page,
          notaires,
          emptyQuery: false,
        };
      }
    }

    res.status(200).json(response);
  })
);

// ========================================================================
// Routes de recherche plus spécifiques (rechercherContacts, etc.)
// ========================================================================

// ------------------------------------------------------------------------
// POST /rechercherContacts
// ------------------------------------------------------------------------
router.post(
  "/rechercherContacts",
  auth,
  asyncHandler(async (req, res) => {
    const { searchTerm, selectedContactIds = [] } = req.body;
    // SECURITE rc37 (C-09) : on ignore strictement req.body.user (spoofable).
    // Le user effectif est TOUJOURS req.user issu du JWT.
    const user = { _id: req.user };
    if (req.body.user && String(req.body.user._id || '') !== String(req.user)) {
      console.warn(`[POST /rechercherContacts] body.user._id=${req.body.user._id} ignored, using req.user=${req.user}`);
    }

    if (!searchTerm || !searchTerm.trim()) {
      return res.json([]);
    }

    const searchParts = searchTerm.toLowerCase().split(" ").filter(Boolean);

    const conditions = [
      {
        $or: [
          { nom: { $regex: `^${searchTerm.trim()}`, $options: "i" } },
          { prenoms: { $regex: `^${searchTerm.trim()}`, $options: "i" } },
          { nom_de_naissance: { $regex: `^${searchTerm.trim()}`, $options: "i" } },
          { nom: { $regex: `^${searchTerm.trim()}\\s`, $options: "i" } },
          { prenoms: { $regex: `^${searchTerm.trim()}\\s`, $options: "i" } },
          { nom_de_naissance: { $regex: `^${searchTerm.trim()}\\s`, $options: "i" } },
        ],
      },
    ];

    if (searchParts.length === 2) {
      conditions.push(
        {
          nom: { $regex: `^${searchParts[0]}`, $options: "i" },
          prenoms: { $regex: `^${searchParts[1]}`, $options: "i" },
        },
        {
          prenoms: { $regex: `^${searchParts[0]}`, $options: "i" },
          nom: { $regex: `^${searchParts[1]}`, $options: "i" },
        },
        {
          nom_de_naissance: { $regex: `^${searchParts[0]}`, $options: "i" },
          prenoms: { $regex: `^${searchParts[1]}`, $options: "i" },
        },
        {
          prenoms: { $regex: `^${searchParts[0]}`, $options: "i" },
          nom_de_naissance: { $regex: `^${searchParts[1]}`, $options: "i" },
        }
      );
    }

    // ========================================================================
    // === DÉBUT DE LA MODIFICATION : RECHERCHE ENRICHIE POUR ContactPM ========
    // ========================================================================
    const pipelinePM = [
      // 1. Filtrage initial sur la raison sociale et les IDs exclus
      {
        $match: {
          _id: { $nin: selectedContactIds.map(id => new mongoose.Types.ObjectId(id)) },
          raisonSociale: { $regex: `^${searchTerm}`, $options: "i" },
        }
      },
      // 2. Jointure pour le Représentant Légal
      {
        $lookup: {
          from: "contactrepresentantlegals",
          localField: "_id",
          foreignField: "contactPM",
          as: "rl_link"
        }
      },
      {
        $lookup: {
          from: "representantlegals",
          localField: "rl_link.representantLegal",
          foreignField: "_id",
          as: "representantLegalData"
        }
      },
      // 3. Jointure pour le Contact Direct
      {
        $lookup: {
          from: "contactcontactdirects",
          localField: "_id",
          foreignField: "contactPM",
          as: "cd_link"
        }
      },
      {
        $lookup: {
          from: "contactdirects",
          localField: "cd_link.contactDirect",
          foreignField: "_id",
          as: "contactDirectData"
        }
      },
      // 4. Mettre en forme les résultats pour avoir des objets au lieu de tableaux
      {
        $addFields: {
          representantLegal: { $arrayElemAt: ["$representantLegalData", 0] },
          contactDirect: { $arrayElemAt: ["$contactDirectData", 0] }
        }
      },
      // 5. Nettoyer les champs temporaires
      {
        $project: {
          rl_link: 0,
          representantLegalData: 0,
          cd_link: 0,
          contactDirectData: 0
        }
      }
    ];

    const [contactsPhysiques, contactsPM, contactsPMPubliques] = await Promise.all([
      Contact.find({
        pro_contact: false,
        _id: { $nin: selectedContactIds },
        $or: conditions,
      }),
      // Utilisation de la pipeline d'agrégation au lieu de find()
      ContactPM.aggregate(pipelinePM),
      ContactPMPublique.find({
        _id: { $nin: selectedContactIds },
        denomination: { $regex: `^${searchTerm}`, $options: "i" },
      }),
    ]);
    // ========================================================================
    // === FIN DE LA MODIFICATION =============================================
    // ========================================================================


    contactsPhysiques.sort((a, b) => a.nom.localeCompare(b.nom));
    contactsPM.sort((a, b) => a.raisonSociale.localeCompare(b.raisonSociale));
    contactsPMPubliques.sort((a, b) => a.denomination.localeCompare(b.denomination));

    const contactsPhysiquesIds = contactsPhysiques.map((c) => c._id);
    const contactsPMIds = contactsPM.map((c) => c._id);
    const contactsPMPubliquesIds = contactsPMPubliques.map((c) => c._id);

    // On vérifie la liaison user->contact
    const [liaisonsPhysiques, liaisonsPM, liaisonsPMPubliques] = await Promise.all([
      UserContact.find({
        user: { $in: await getAccessibleUserIds(user._id) },
        contact: { $in: contactsPhysiquesIds },
      }).select("contact").lean(),
      UserContactPM.find({
        user: { $in: await getAccessibleUserIds(user._id) },
        contactPM: { $in: contactsPMIds },
      }).select("contactPM").lean(),
      UserContactPMPublique.find({
        user: { $in: await getAccessibleUserIds(user._id) },
        contactPMPublique: { $in: contactsPMPubliquesIds },
      }).select("contactPMPublique").lean(),
    ]);

    const liaisonsPhysiquesSet = new Set(liaisonsPhysiques.map((l) => l.contact.toString()));
    const liaisonsPMSet = new Set(liaisonsPM.map((l) => l.contactPM.toString()));
    const liaisonsPMPubliquesSet = new Set(
      liaisonsPMPubliques.map((l) => l.contactPMPublique.toString())
    );

    let contactsLies = [];

    for (let contact of contactsPhysiques) {
      if (liaisonsPhysiquesSet.has(contact._id.toString())) {
        contactsLies.push(contact);
      }
    }

    for (let contact of contactsPM) {
      if (liaisonsPMSet.has(contact._id.toString())) {
        contactsLies.push(contact);
      }
    }

    for (let contact of contactsPMPubliques) {
      if (liaisonsPMPubliquesSet.has(contact._id.toString())) {
        contactsLies.push(contact);
      }
    }

    // ====================================================================================
    // === DÉBUT DE LA MODIFICATION : AJOUT DU LOG DE DÉBOGAGE DEMANDÉ ===================
    // ====================================================================================
    console.log("========================================================================");
    console.log("[LOG SERVEUR - /rechercherContacts] Résultats de recherche envoyés au client :");
    console.log(JSON.stringify(contactsLies, null, 2)); // Affiche les résultats formatés
    console.log("========================================================================");
    // ====================================================================================
    // === FIN DE LA MODIFICATION =======================================================
    // ====================================================================================

    res.json(contactsLies);
  })
);

// ------------------------------------------------------------------------
// POST /rechercherContactsLink
// ------------------------------------------------------------------------
router.post(
  "/rechercherContactsLink",
  auth,
  asyncHandler(async (req, res) => {
    const { searchTerm, selectedContactIds } = req.body;
    // SECURITE rc37 (C-09) : on ignore req.body.user (spoofable). user effectif = req.user.
    const user = { _id: req.user };
    if (req.body.user && String(req.body.user._id || '') !== String(req.user)) {
      console.warn(`[POST /rechercherContactsLink] body.user._id=${req.body.user._id} ignored, using req.user=${req.user}`);
    }

    if (!searchTerm.trim()) {
      return res.json([]);
    }

    const searchParts = searchTerm.toLowerCase().split(" ").filter(Boolean);

    const conditionsPhysiques = [
      { nom: { $regex: `^${searchTerm.trim()}`, $options: "i" } },
      { prenoms: { $regex: `^${searchTerm.trim()}`, $options: "i" } },
      { nom_de_naissance: { $regex: `^${searchTerm.trim()}`, $options: "i" } },
    ];

    if (searchParts.length === 2) {
      conditionsPhysiques.push(
        {
          nom: { $regex: `^${searchParts[0]}`, $options: "i" },
          prenoms: { $regex: `^${searchParts[1]}`, $options: "i" },
        },
        {
          prenoms: { $regex: `^${searchParts[0]}`, $options: "i" },
          nom: { $regex: `^${searchParts[1]}`, $options: "i" },
        }
      );
    }

    let [contactsPhysiques, contactsPM, contactsPMPubliques] = await Promise.all([
      Contact.find({
        _id: { $nin: selectedContactIds },
        $or: conditionsPhysiques,
      }),
      ContactPM.find({
        _id: { $nin: selectedContactIds },
        raisonSociale: { $regex: `^${searchTerm}`, $options: "i" },
      }),
      ContactPMPublique.find({
        _id: { $nin: selectedContactIds },
        denomination: { $regex: `^${searchTerm}`, $options: "i" },
      }),
    ]);

    const contactsPhysiquesIds = contactsPhysiques.map((c) => c._id);
    const contactsPMIds = contactsPM.map((c) => c._id);
    const contactsPMPubliquesIds = contactsPMPubliques.map((c) => c._id);

    const [liaisonsPhys, liaisonsPM, liaisonsPMPub] = await Promise.all([
      UserContact.find({
        user: { $in: await getAccessibleUserIds(user._id) },
        contact: { $in: contactsPhysiquesIds },
      }).select("contact"),
      UserContactPM.find({
        user: { $in: await getAccessibleUserIds(user._id) },
        contactPM: { $in: contactsPMIds },
      }).select("contactPM"),
      UserContactPMPublique.find({
        user: { $in: await getAccessibleUserIds(user._id) },
        contactPMPublique: { $in: contactsPMPubliquesIds },
      }).select("contactPMPublique"),
    ]);

    const physSet = new Set(liaisonsPhys.map((l) => l.contact.toString()));
    const pmSet = new Set(liaisonsPM.map((l) => l.contactPM.toString()));
    const pubSet = new Set(liaisonsPMPub.map((l) => l.contactPMPublique.toString()));

    contactsPhysiques = contactsPhysiques.filter((contact) =>
      physSet.has(contact._id.toString())
    );
    contactsPM = contactsPM.filter((contact) =>
      pmSet.has(contact._id.toString())
    );
    contactsPMPubliques = contactsPMPubliques.filter((contact) =>
      pubSet.has(contact._id.toString())
    );

    const allContacts = [
      ...contactsPhysiques,
      ...contactsPM,
      ...contactsPMPubliques,
    ];

    allContacts.sort((a, b) => {
      const nameA = a.nom || a.raisonSociale || a.denomination;
      const nameB = b.nom || b.raisonSociale || a.denomination;
      return nameA.localeCompare(nameB);
    });

    res.json(allContacts);
  })
);

// ------------------------------------------------------------------------
// POST /rechercherContactsDossier
// ------------------------------------------------------------------------
router.post(
  "/rechercherContactsDossier",
  auth,
  asyncHandler(async (req, res) => {
    const { searchTerm, selectedContactIds } = req.body;

    if (!searchTerm.trim()) {
      return res.json([]);
    }

    const searchParts = searchTerm.toLowerCase().split(" ").filter(Boolean);

    const conditionsPhysiques = [
      { nom: { $regex: `^${searchTerm.trim()}`, $options: "i" } },
      { prenoms: { $regex: `^${searchTerm.trim()}`, $options: "i" } },
      { nom_de_naissance: { $regex: `^${searchTerm.trim()}`, $options: "i" } },
    ];

    if (searchParts.length === 2) {
      conditionsPhysiques.push(
        {
          nom: { $regex: `^${searchParts[0]}`, $options: "i" },
          prenoms: { $regex: `^${searchParts[1]}`, $options: "i" },
        },
        {
          prenoms: { $regex: `^${searchParts[0]}`, $options: "i" },
          nom: { $regex: `^${searchParts[1]}`, $options: "i" },
        }
      );
    }

    // SECURITE rc37 (C-10) : restreindre aux contacts lies au user.
    // Sans ce filtre, l'API retournait TOUS les contacts de la base qui
    // matchent le terme (B-5 isolation cassee, exploitable cross-cabinet).
    const userId = req.user;
    const [physLinks, pmLinks, pmPubLinks] = await Promise.all([
      UserContact.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('contact').lean(),
      UserContactPM.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('contactPM').lean(),
      UserContactPMPublique.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('contactPMPublique').lean(),
    ]);
    const userContactIds = physLinks.map((l) => l.contact);
    const userPMIds = pmLinks.map((l) => l.contactPM);
    const userPMPubIds = pmPubLinks.map((l) => l.contactPMPublique);

    let [contactsPhysiques, contactsPM, contactsPMPubliques] = await Promise.all([
      Contact.find({
        _id: { $in: userContactIds, $nin: selectedContactIds },
        $or: conditionsPhysiques,
      }),
      ContactPM.find({
        _id: { $in: userPMIds, $nin: selectedContactIds },
        raisonSociale: { $regex: `^${searchTerm}`, $options: "i" },
      }),
      ContactPMPublique.find({
        _id: { $in: userPMPubIds, $nin: selectedContactIds },
        denomination: { $regex: `^${searchTerm}`, $options: "i" },
      }),
    ]);

    // ========================================================================
    // === DÉBUT DE LA MODIFICATION POUR LA CORRECTION DES DOUBLONS ===========
    // ========================================================================
    const allContacts = [
      ...contactsPhysiques,
      ...contactsPM,
      ...contactsPMPubliques,
    ];

    // Fonction pour générer une clé unique basée sur le nom
    const getUniquenessKey = (contact) => {
        if (!contact) return null;
        if (contact.raisonSociale) return `pm-${contact.raisonSociale.toLowerCase().trim()}`;
        if (contact.denomination) return `pmpub-${contact.denomination.toLowerCase().trim()}`;
        if (contact.nom && contact.prenoms) return `pp-${contact.nom.toLowerCase().trim()}-${contact.prenoms.toLowerCase().trim()}`;
        // Fallback pour les cas où seuls nom ou prénoms sont présents
        if (contact.nom) return `pp-${contact.nom.toLowerCase().trim()}-`;
        if (contact.prenoms) return `pp--${contact.prenoms.toLowerCase().trim()}`;
        return `id-${contact._id.toString()}`; // Fallback sur l'ID si aucun nom
    };

    // Utiliser une Map pour garantir l'unicité des contacts par nom
    const uniqueContactsMap = new Map();
    allContacts.forEach(contact => {
      if (contact && contact._id) { // S'assurer que le contact et son ID existent
        const key = getUniquenessKey(contact);
        if (!uniqueContactsMap.has(key)) { // On ne garde que la première occurrence d'un nom
            uniqueContactsMap.set(key, contact);
        }
      }
    });

    const uniqueResults = Array.from(uniqueContactsMap.values());

    // Trier les résultats uniques
    uniqueResults.sort((a, b) => {
      const nameA = a.nom || a.raisonSociale || a.denomination || '';
      const nameB = b.nom || b.raisonSociale || b.denomination || '';
      return nameA.localeCompare(nameB);
    });

    res.json(uniqueResults);
    // ========================================================================
    // === FIN DE LA MODIFICATION =============================================
    // ========================================================================
  })
);

// Nouveau code
// Nouveau code
// Route pour rechercher des dossiers par leur nom pour l'agenda
router.post(
  "/searchDossiersByName",
  passport.authenticate("jwt", { session: false }),
  asyncHandler(async (req, res) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Utilisateur non authentifié." });
    }

    const userId = req.user.id;
    const { searchTerm } = req.body;

    if (!searchTerm || !searchTerm.trim()) {
      return res.json([]);
    }

    // 1. Trouver les dossiers liés à l'utilisateur
    const userDossierLinks = await UserDossier.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('dossier').lean();
    if (!userDossierLinks.length) {
      return res.json([]); // Pas de dossiers pour cet utilisateur
    }
    const dossierIds = userDossierLinks.map(link => link.dossier);

    // 2. Rechercher par nom parmi les dossiers de l'utilisateur
    const regex = new RegExp(searchTerm.trim(), 'i');
    const dossiers = await Dossier.find({
      _id: { $in: dossierIds }, // Recherche uniquement dans les dossiers de l'utilisateur
      'dossier.dossier.nom': regex // La recherche par nom reste la même
    }).limit(20);

    res.json(dossiers);
  })
);


// ------------------------------------------------------------------------
// POST /searchAllUserContacts - Recherche globale de contacts pour l'utilisateur
// ------------------------------------------------------------------------
router.post(
  "/searchAllUserContacts",
  auth,
  asyncHandler(async (req, res) => {
    const { searchTerm } = req.body;
    const userId = req.user;

    if (!searchTerm || !searchTerm.trim()) {
        return res.json([]);
    }

    // Prefix match : les premières lettres tapées doivent correspondre au début du champ
    const searchRegex = new RegExp("^" + searchTerm.trim(), "i");

    // Logique multi-mots pour personne physique (ex: "Dupont Jean" -> nom^Dupont + prenoms^Jean)
    const searchParts = searchTerm.trim().toLowerCase().split(" ").filter(Boolean);

    const userContactsPhysiques = await UserContact.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('contact').lean();
    const userContactsPM = await UserContactPM.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('contactPM').lean();
    const userContactsPMPublique = await UserContactPMPublique.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('contactPMPublique').lean();

    const contactIdsPhysiques = userContactsPhysiques.map(uc => uc.contact);
    const contactIdsPM = userContactsPM.map(uc => uc.contactPM);
    const contactIdsPMPublique = userContactsPMPublique.map(uc => uc.contactPMPublique);

    // ========================================================================
    // Conditions de recherche pour personne physique (prefix + multi-mots)
    // ========================================================================
    const conditionsPhysiques = [
      { nom: searchRegex },
      { prenoms: searchRegex },
      { email: searchRegex },
    ];

    // Si 2 mots, recherche croisée nom+prénom dans les 2 sens
    if (searchParts.length === 2) {
      conditionsPhysiques.push(
        {
          nom: { $regex: "^" + searchParts[0], $options: "i" },
          prenoms: { $regex: "^" + searchParts[1], $options: "i" },
        },
        {
          prenoms: { $regex: "^" + searchParts[0], $options: "i" },
          nom: { $regex: "^" + searchParts[1], $options: "i" },
        }
      );
    }

    // ========================================================================
    // Pipeline d'agrégation pour les personnes morales (ContactPM)
    // ========================================================================
    const contactsPMResults = await ContactPM.aggregate([
        // Étape 1: Ne garder que les contacts de l'utilisateur
        { $match: { _id: { $in: contactIdsPM } } },

        // Étape 2: Jointure (lookup) pour le Représentant Légal
        {
            $lookup: {
                from: 'contactrepresentantlegals',
                localField: '_id',
                foreignField: 'contactPM',
                as: 'rl_link'
            }
        },
        {
            $lookup: {
                from: 'representantlegals',
                localField: 'rl_link.representantLegal',
                foreignField: '_id',
                as: 'representantLegalArr'
            }
        },

        // Étape 3: Jointure (lookup) pour le Contact Direct
        {
            $lookup: {
                from: 'contactcontactdirects',
                localField: '_id',
                foreignField: 'contactPM',
                as: 'cd_link'
            }
        },
        {
            $lookup: {
                from: 'contactdirects',
                localField: 'cd_link.contactDirect',
                foreignField: '_id',
                as: 'contactDirectArr'
            }
        },

        // Étape 4: Créer les champs objets `representantLegal` et `contactDirect`
        {
            $addFields: {
                representantLegal: { $arrayElemAt: ["$representantLegalArr", 0] },
                contactDirect: { $arrayElemAt: ["$contactDirectArr", 0] }
            }
        },

        // Étape 5: Filtre prefix sur raisonSociale, interlocuteur, représentant légal, contact direct
        {
            $match: {
                $or: [
                    { raisonSociale: searchRegex },
                    { emailEntreprise: searchRegex },
                    { interlocuteurNom: searchRegex },
                    { interlocuteurPrenom: searchRegex },
                    { interlocuteurEmail: searchRegex },
                    { 'representantLegal.representantLegalNom': searchRegex },
                    { 'representantLegal.representantLegalPrenom': searchRegex },
                    { 'contactDirect.contactDirectNom': searchRegex },
                    { 'contactDirect.contactDirectPrenom': searchRegex }
                ]
            }
        },

        // Étape 6: Nettoyer les champs temporaires
        { $project: { rl_link: 0, cd_link: 0, representantLegalArr: 0, contactDirectArr: 0 } },

        { $limit: 10 }
    ]);

    // ========================================================================
    // Recherche personne physique (avec multi-mots) et PM publique (prefix)
    // ========================================================================
    const [
        contactsPhysiquesResults,
        contactsPMPubliqueResults
    ] = await Promise.all([
        Contact.find({ _id: { $in: contactIdsPhysiques }, $or: conditionsPhysiques }).limit(10).lean(),
        ContactPMPublique.find({ _id: { $in: contactIdsPMPublique }, $or: [{ denomination: searchRegex }, { email: searchRegex }, { contactEmail: searchRegex }, { interlocuteurEmail: searchRegex }, { contactNom: searchRegex }, { contactPrenom: searchRegex }] }).limit(10).lean()
    ]);
    // ========================================================================
    // === FIN DE LA MODIFICATION =============================================
    // ========================================================================

    const combinedResults = [
        ...contactsPhysiquesResults.map(c => ({ ...c, typeContact: 'physique' })),
        ...contactsPMResults.map(c => ({ ...c, typeContact: 'morale' })),
        ...contactsPMPubliqueResults.map(c => ({ ...c, typeContact: 'moralePMP' }))
    ];

    // LOG CÔTÉ SERVEUR DEMANDÉ
    console.log("[SERVEUR /searchAllUserContacts] Personnes Morales trouvées :", JSON.stringify(contactsPMResults, null, 2));

    combinedResults.sort((a, b) => {
        const nameA = a.nom || a.raisonSociale || a.denomination || '';
        const nameB = b.nom || b.raisonSociale || b.denomination || '';
        return nameA.localeCompare(nameB);
    });

    res.json(combinedResults.slice(0, 15));
  })
);

module.exports = router;