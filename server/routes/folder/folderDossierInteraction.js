// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_72 - Copie - 4 - Copie\Kheops_2\server\routes\folder\folderDossierInteraction.js
const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();

const auth = require("../../middlewares/middleware-auth");
const { asyncHandler } = require("../../middlewares/folder-middleWare");
const { log: secLog, EVT } = require('../../utils/securityLogger');
const { ensureDossierOwnership } = require('../../utils/ownershipHelpers');
const audit = require('../../utils/auditLogger');
// A20 — validation structurelle du snapshot Aide juridictionnelle.
const validateBody = require('../../middlewares/validateBody');
const { aideJuridictionnelleSchema } = require('../../validation/aideJuridictionnelleSchema');

// — chemins corrigés (deux niveaux au-dessus) —
const Dossier = require("../../models/Folder/Dossier");
const Partie = require("../../models/Folder/Partie");
const Role = require("../../models/Folder/Role");
const UserDossier = require("../../models/Folder/modelsLiaisons/UserDossier");

const DossierPartie = require("../../models/Folder/modelsLiaisons/DossierPartie");
const ContactPartie = require("../../models/Folder/modelsLiaisons/ContactPartie");
const ContactRole = require("../../models/Folder/modelsLiaisons/ContactRole");
const DossierContact = require("../../models/Folder/modelsLiaisons/DossierContact");

const Contact = require("../../models/Folder/Contact");
const ContactPM = require("../../models/Folder/ContactPM");
const ContactPMPublique = require("../../models/Folder/ContactPMPublique");

// === NOUVEAUX IMPORTS NÉCESSAIRES ===
const PersonneCharge = require('../../models/Folder/PersonneCharge');
const ContactPersonneCharge = require('../../models/Folder/modelsLiaisons/ContactPersonneCharge');
const RepresentantLegal = require('../../models/Folder/RepresentantLegalPM');
const ContactDirect = require('../../models/Folder/ContactDirect');
const ContactRepresentantLegal = require('../../models/Folder/modelsLiaisons/ContactRepresentantLegal');
const ContactContactDirect = require('../../models/Folder/modelsLiaisons/ContactContactDirect');
// =====================================


const OfficeUser = require("../../models/App_Users/OfficeUser");
const snapshotService = require("../../services/snapshotService");
const propagateEntityToDossiers = require("../../services/propagateEntityToDossiers");
const { getAccessibleUserIds } = require('../../services/cabinetAccess');
const { getCabinetRole, canDeleteDossier } = require('../../services/cabinetRoles');

// ========================================================================
// Routes d'interaction avec les dossiers
// ========================================================================

// ------------------------------------------------------------------------
// Route pour récupérer les 25 derniers dossiers créés (SÉCURISÉE)
// ------------------------------------------------------------------------
router.get(
  "/last-25-dossiers",
  auth, // Utilisation du middleware d'authentification
  asyncHandler(async (req, res) => {
    console.log("=== [GET] /last-25-dossiers - Received Request ===");
    const userId = req.user; // L'ID vient du token JWT, c'est sécurisé.

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.error("ID utilisateur invalide depuis le token:", userId);
      return res.status(400).json({ message: "ID utilisateur invalide dans le token." });
    }

    // Rattrapage idempotent : creer les liens UserDossier manquants pour les
    // divorces CM crees avant l'ajout du lien systematique dans la route
    // POST /api/divorce-cm. Sans cela, ces dossiers n'apparaitraient jamais
    // dans la liste des dossiers recents ni dans la recherche.
    try {
      const DivorceCMData = require("../../models/Divorce/DivorceCMData");
      const userDivorces = await DivorceCMData
        .find({ ownerUserId: String(userId) })
        .select("dossierId")
        .lean();
      if (userDivorces.length > 0) {
        const divorceDossierIds = userDivorces.map(d => d.dossierId);
        const existingLinks = await UserDossier
          .find({ user: userId, dossier: { $in: divorceDossierIds } })
          .select("dossier")
          .lean();
        const linkedSet = new Set(existingLinks.map(l => l.dossier.toString()));
        const missing = divorceDossierIds.filter(id => !linkedSet.has(id.toString()));
        if (missing.length > 0) {
          await UserDossier.insertMany(missing.map(id => ({ user: userId, dossier: id })));
          console.log(`[last-25-dossiers] Rattrapage : ${missing.length} UserDossier cree(s) pour des divorces CM orphelins`);
        }
      }
    } catch (repairErr) {
      console.error("[last-25-dossiers] Echec rattrapage divorces CM orphelins:", repairErr && repairErr.message);
      // Non bloquant : la query principale continue meme si le rattrapage echoue.
    }

    const userDossiers = await UserDossier.find({ user: { $in: await getAccessibleUserIds(userId) } }).select("dossier");
    console.log(`[last-25-dossiers] UserDossier trouvés: ${userDossiers.length}`);

    if (userDossiers.length === 0) {
      return res.json([]);
    }

    const dossierIds = userDossiers.map((ud) => ud.dossier);

    const lastDossiers = await Dossier.find({ _id: { $in: dossierIds } })
      .sort({ dateCreation: -1 })
      .limit(25);

    console.log(`[last-25-dossiers] Dossiers retournés: ${lastDossiers.length}`);
    if (userDossiers.length !== lastDossiers.length) {
      console.warn(`[last-25-dossiers] ⚠️ Incohérence: ${userDossiers.length} liens UserDossier mais ${lastDossiers.length} dossiers trouvés en base`);
      const returnedIds = new Set(lastDossiers.map(d => d._id.toString()));
      const missingIds = dossierIds.filter(id => !returnedIds.has(id.toString()));
      if (missingIds.length > 0) {
        console.warn(`[last-25-dossiers] Dossiers manquants (lien sans dossier): ${missingIds.join(', ')}`);
      }
    }

    res.json(lastDossiers);
  })
);


// ========================================================================
// === CORRECTION MAJEURE : Route de mise à jour d'entité avec propagation
// === CORRECTION 2 : Fallback multi-collections + support OfficeUser
// ========================================================================
router.put(
  "/updateEntityInDossier/:id",
  auth,
  asyncHandler(async (req, res) => {
    const entityIdToUpdate = req.params.id;
    const { entityType, data: updatedContactData, dossierId: initiatingDossierId } = req.body;
    const userId = req.user;

    console.log(`[PROPAGATION] Début de la mise à jour globale pour l'entité ${entityIdToUpdate} de type ${entityType}.`);

    if (!entityIdToUpdate || !entityType || !updatedContactData) {
      return res.status(400).json({ message: "Données manquantes (entityId, entityType, data)." });
    }

    // SECURITE rc37 (C-11) : verifier que l'entite a modifier appartient au
    // cabinet courant. Selon entityType, on cherche dans Contact / ContactPM /
    // ContactPMPublique / OfficeUser. Sans ce check, n'importe quel user
    // pouvait modifier le profil d'un OfficeUser ou contact d'un autre cabinet
    // (via fallback multi-collections).
    //
    // rc38 (A2) : le check doit utiliser getAccessibleUserIds (perimetre CABINET),
    // pas `user: userId` brut, sinon un collaborateur du meme cabinet se voit
    // refuser la modification d'un contact partage (regression du partage R5b).
    {
      const UserContactM = require('../../models/Folder/modelsLiaisons/UserContact');
      const UserContactPMM = require('../../models/Folder/modelsLiaisons/UserContactPM');
      const UserContactPMPubliqueM = require('../../models/Folder/modelsLiaisons/UserContactPMPublique');
      const UserOfficeUserM = require('../../models/App_Users/modelsLiaisons/UserOfficeUser');
      const accessibleIds = await getAccessibleUserIds(userId);
      const [pLink, pmLink, pubLink, ouLink] = await Promise.all([
        UserContactM.findOne({ user: { $in: accessibleIds }, contact: entityIdToUpdate }).lean(),
        UserContactPMM.findOne({ user: { $in: accessibleIds }, contactPM: entityIdToUpdate }).lean(),
        UserContactPMPubliqueM.findOne({ user: { $in: accessibleIds }, contactPMPublique: entityIdToUpdate }).lean(),
        UserOfficeUserM.findOne({ user: { $in: accessibleIds }, officeUser: entityIdToUpdate }).lean(),
      ]);
      if (!pLink && !pmLink && !pubLink && !ouLink) {
        console.warn(`[updateEntityInDossier] ACCESS_DENIED entity=${entityIdToUpdate} user=${userId} type=${entityType}`);
        secLog(EVT.ACCESS_DENIED, {
          userId: String(userId),
          resourceType: 'entity-' + entityType,
          resourceId: String(entityIdToUpdate),
          reason: 'no-link-in-any-collection',
        }, req);
        return res.status(403).json({ message: "Acces refuse : cette entite n'appartient pas a votre cabinet." });
      }
    }

    // rc38 (A2) : le dossier initiateur est charge PUIS renvoye tel quel a la fin
    // (Etape 4). Sans verification d'appartenance, un attaquant pouvait passer un
    // dossierId d'un AUTRE cabinet et recuperer son contenu integral dans la
    // reponse (fuite en lecture cross-cabinet). On valide l'appartenance AVANT
    // toute mutation pour echouer tot. dossierId reste optionnel : s'il est absent,
    // on ne renvoie simplement pas de dossier initiateur.
    if (initiatingDossierId) {
      if (!(await ensureDossierOwnership(req, res, initiatingDossierId))) return;
    }

    // Étape 1: Mettre à jour l'entité maître
    // CORRECTION : Si l'entité n'est pas trouvée dans la collection indiquée par entityType,
    // on essaie toutes les autres collections en fallback. Cela corrige les cas où le frontend
    // envoie un entityType incorrect (ex: 'Physique' au lieu de 'PM' pour une entité sans contactType).
    const modelsByType = {
      Physique: Contact,
      Avocat: Contact,
      Notaire: Contact,
      "Commissaire de justice": Contact,
      PM: ContactPM,
      PMPublique: ContactPMPublique,
    };

    const primaryModel = modelsByType[entityType];
    if (!primaryModel) {
      return res.status(400).json({ message: `Type d'entité inconnu: ${entityType}` });
    }

    let updatedEntityMaster = await primaryModel.findByIdAndUpdate(
      entityIdToUpdate, updatedContactData, { new: true, runValidators: true }
    );

    // Fallback : essayer les autres collections si l'entité n'est pas dans la collection primaire
    if (!updatedEntityMaster) {
      console.log(`[PROPAGATION] Entité ${entityIdToUpdate} non trouvée dans ${entityType}, tentative fallback multi-collections...`);
      const fallbackModels = [Contact, ContactPM, ContactPMPublique, OfficeUser]
        .filter(m => m !== primaryModel);

      for (const FallbackModel of fallbackModels) {
        try {
          updatedEntityMaster = await FallbackModel.findByIdAndUpdate(
            entityIdToUpdate, updatedContactData, { new: true, runValidators: true }
          );
          if (updatedEntityMaster) {
            console.log(`[PROPAGATION] ✅ Entité trouvée en fallback dans la collection ${FallbackModel.modelName}`);
            break;
          }
        } catch (fallbackErr) {
          // Erreur de validation dans cette collection → continuer avec la suivante
          console.log(`[PROPAGATION] Fallback ${FallbackModel.modelName} échoué: ${fallbackErr.message}`);
        }
      }
    }

    if (!updatedEntityMaster) {
      return res.status(404).json({
        message: `Entité ID ${entityIdToUpdate} non trouvée dans aucune collection (type demandé: ${entityType}).`
      });
    }
    console.log(`[PROPAGATION] Entité maître ${entityIdToUpdate} mise à jour (collection: ${updatedEntityMaster.constructor.modelName}).`);

    // Étape 2 & 3: Propager via le helper centralisé
    const nbPropagated = await propagateEntityToDossiers(entityIdToUpdate, updatedEntityMaster.toObject(), userId);
    console.log(`[updateEntityInDossier] Propagation terminée : ${nbPropagated} dossier(s) mis à jour.`);

    // Étape 4: Récupérer le dossier initiateur mis à jour pour le renvoyer.
    // Appartenance déjà vérifiée en amont (ensureDossierOwnership). dossierId
    // est optionnel : sans lui, on renvoie la seule entité mise à jour.
    let finalUpdatedDossier = null;
    if (initiatingDossierId) {
      finalUpdatedDossier = await Dossier.findById(initiatingDossierId);
      if (!finalUpdatedDossier) {
        console.error(`[PROPAGATION] Erreur critique: Le dossier initiateur ${initiatingDossierId} n'a pas été retrouvé après la mise à jour.`);
        return res.status(404).json({ message: "Le dossier initiateur est introuvable après la mise à jour." });
      }
    }

    res.json({
      message: "Entité mise à jour et propagée avec succès.",
      updatedEntity: updatedEntityMaster,
      updatedDossier: finalUpdatedDossier,
    });
  })
);


// ------------------------------------------------------------------------
// Recherche de dossiers par parties (searchDossiersByParties)
// ------------------------------------------------------------------------
router.post(
  "/searchDossiersByParties",
  auth,
  asyncHandler(async (req, res) => {
    const { searchTerm } = req.body;

    // rc38 (A2) : searchTerm doit etre une chaine ; on borne sa longueur pour
    // eviter les regex demesurees. Toute autre valeur (objet, tableau — vecteur
    // d'injection d'operateur Mongo) est rejetee.
    if (typeof searchTerm !== 'string' || !searchTerm.trim()) {
      return res.json([]);
    }
    if (searchTerm.length > 100) {
      return res.status(400).json({ message: 'Terme de recherche trop long (max 100 caractères).' });
    }

    // rc38 (A2) : le terme est interpole dans des $regex. Sans echappement des
    // metacaracteres, un terme comme "(a+)+$" provoque un ReDoS et des tokens
    // comme ".*" cassent la logique de recherche. On echappe systematiquement.
    const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rawTerm = searchTerm.trim();
    const safeTerm = escapeRegExp(rawTerm);

    // SECURITE rc37 : restreindre la recherche aux dossiers du user.
    // Sans ce filtre, l'API retournait tous les dossiers de la base qui
    // matchaient le terme (B-5 isolation cassee).
    const userDossierLinks = await UserDossier.find({ user: { $in: await getAccessibleUserIds(req.user) } }).select('dossier').lean();
    const userDossierIds = userDossierLinks.map((l) => l.dossier);
    if (userDossierIds.length === 0) return res.json([]);

    const searchParts = rawTerm.toLowerCase().split(" ").filter(Boolean).map(escapeRegExp);

    const conditions = [
      // ── nomPartie (nom complet, Pour + Contre) ──
      {
        "dossier.parties.pour.nomPartie": {
          $regex: `^${safeTerm}`,
          $options: "i",
        },
      },
      {
        "dossier.parties.contre.nomPartie": {
          $regex: `^${safeTerm}`,
          $options: "i",
        },
      },
      // nomPartie avec espace après (mot entier)
      {
        "dossier.parties.pour.nomPartie": {
          $regex: `^${safeTerm}\\s`,
          $options: "i",
        },
      },
      {
        "dossier.parties.contre.nomPartie": {
          $regex: `^${safeTerm}\\s`,
          $options: "i",
        },
      },

      // ── partieData.nom (nom de famille seul, Pour + Contre) ──
      {
        "dossier.parties.pour.partieData.nom": {
          $regex: `^${safeTerm}`,
          $options: "i",
        },
      },
      {
        "dossier.parties.contre.partieData.nom": {
          $regex: `^${safeTerm}`,
          $options: "i",
        },
      },

      // ── partieData.prenoms (prénom seul, Pour + Contre) ──
      {
        "dossier.parties.pour.partieData.prenoms": {
          $regex: `^${safeTerm}`,
          $options: "i",
        },
      },
      {
        "dossier.parties.contre.partieData.prenoms": {
          $regex: `^${safeTerm}`,
          $options: "i",
        },
      },

      // ── raisonSociale (PM privée, Pour + Contre) ──
      {
        "dossier.parties.pour.partieData.raisonSociale": {
          $regex: `^${safeTerm}`,
          $options: "i",
        },
      },
      {
        "dossier.parties.pour.partieData.raisonSociale": {
          $regex: `^${safeTerm}\\s`,
          $options: "i",
        },
      },
      {
        "dossier.parties.contre.partieData.raisonSociale": {
          $regex: `^${safeTerm}`,
          $options: "i",
        },
      },
      {
        "dossier.parties.contre.partieData.raisonSociale": {
          $regex: `^${safeTerm}\\s`,
          $options: "i",
        },
      },

      // ── denomination (PM publique, Pour + Contre) ──
      {
        "dossier.parties.pour.partieData.denomination": {
          $regex: `^${safeTerm}`,
          $options: "i",
        },
      },
      {
        "dossier.parties.pour.partieData.denomination": {
          $regex: `^${safeTerm}\\s`,
          $options: "i",
        },
      },
      {
        "dossier.parties.contre.partieData.denomination": {
          $regex: `^${safeTerm}`,
          $options: "i",
        },
      },
      {
        "dossier.parties.contre.partieData.denomination": {
          $regex: `^${safeTerm}\\s`,
          $options: "i",
        },
      },

      // ── nom du dossier (couvre les divorces CM, dont les parties sont vides
      // mais dont le nom contient les noms des deux epoux : "DUPONT - MARTIN")
      {
        "dossier.dossier.nom": {
          $regex: safeTerm,
          $options: "i",
        },
      },
    ];

    // ── Recherche croisée nom + prénom (2 mots) ──
    if (searchParts.length === 2) {
      conditions.push(
        // Pour : nomPartie croisé avec raisonSociale
        {
          "dossier.parties.pour.nomPartie": {
            $regex: `^${searchParts[0]}`,
            $options: "i",
          },
          "dossier.parties.pour.partieData.raisonSociale": {
            $regex: `^${searchParts[1]}`,
            $options: "i",
          },
        },
        {
          "dossier.parties.pour.partieData.raisonSociale": {
            $regex: `^${searchParts[0]}`,
            $options: "i",
          },
          "dossier.parties.pour.nomPartie": {
            $regex: `^${searchParts[1]}`,
            $options: "i",
          },
        },
        // Contre : nomPartie croisé avec raisonSociale
        {
          "dossier.parties.contre.nomPartie": {
            $regex: `^${searchParts[0]}`,
            $options: "i",
          },
          "dossier.parties.contre.partieData.raisonSociale": {
            $regex: `^${searchParts[1]}`,
            $options: "i",
          },
        },
        {
          "dossier.parties.contre.partieData.raisonSociale": {
            $regex: `^${searchParts[0]}`,
            $options: "i",
          },
          "dossier.parties.contre.nomPartie": {
            $regex: `^${searchParts[1]}`,
            $options: "i",
          },
        },
        // Pour : nom croisé avec prenoms
        {
          "dossier.parties.pour.partieData.nom": {
            $regex: `^${searchParts[0]}`,
            $options: "i",
          },
          "dossier.parties.pour.partieData.prenoms": {
            $regex: `^${searchParts[1]}`,
            $options: "i",
          },
        },
        {
          "dossier.parties.pour.partieData.prenoms": {
            $regex: `^${searchParts[0]}`,
            $options: "i",
          },
          "dossier.parties.pour.partieData.nom": {
            $regex: `^${searchParts[1]}`,
            $options: "i",
          },
        },
        // Contre : nom croisé avec prenoms
        {
          "dossier.parties.contre.partieData.nom": {
            $regex: `^${searchParts[0]}`,
            $options: "i",
          },
          "dossier.parties.contre.partieData.prenoms": {
            $regex: `^${searchParts[1]}`,
            $options: "i",
          },
        },
        {
          "dossier.parties.contre.partieData.prenoms": {
            $regex: `^${searchParts[0]}`,
            $options: "i",
          },
          "dossier.parties.contre.partieData.nom": {
            $regex: `^${searchParts[1]}`,
            $options: "i",
          },
        }
      );
    }

    const foundDossiers = await Dossier.find({
      _id: { $in: userDossierIds },
      $or: conditions,
    });
    return res.json(foundDossiers);
  })
);

// ------------------------------------------------------------------------
// Route pour ajouter un contact lié à une partie d'un dossier
// ------------------------------------------------------------------------
router.post(
  "/addLinkedContactToParty",
  auth,
  asyncHandler(async (req, res) => {
    const { dossierId, partyId, linkedContactData } = req.body;
    if (!dossierId || !partyId || !linkedContactData) {
      return res
        .status(400)
        .json({
          message: "dossierId, partyId et linkedContactData sont requis.",
        });
    }

    // SECURITE rc37 : check UserDossier
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    // *** MODIFICATION ICI ***
    // On utilise l'ID existant plutôt que de créer un nouveau contact
    if (!linkedContactData.existingContactId) {
      return res
        .status(400)
        .json({
          message: "existingContactId est requis dans linkedContactData.",
        });
    }

    // Essayer de trouver le contact dans toutes les collections possibles
    let contactToLink = await Contact.findById(linkedContactData.existingContactId)
      || await ContactPM.findById(linkedContactData.existingContactId)
      || await ContactPMPublique.findById(linkedContactData.existingContactId);

    if (!contactToLink) {
      return res
        .status(404)
        .json({ message: "Le contact existant est introuvable." });
    }
    // *** FIN MODIFICATION ***


    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      return res.status(404).json({ message: "Dossier non trouvé." });
    }

    let partieTrouvee = null;
    let isPourPartie = false;
    if (dossier.dossier.parties && Array.isArray(dossier.dossier.parties.pour)) {
      partieTrouvee = dossier.dossier.parties.pour.find(
        (p) => p.partieData && String(p.partieData._id) === partyId
      );
      if (partieTrouvee) isPourPartie = true;
    }
    if (
      !partieTrouvee &&
      dossier.dossier.parties &&
      Array.isArray(dossier.dossier.parties.contre)
    ) {
      partieTrouvee = dossier.dossier.parties.contre.find(
        (p) => p.partieData && String(p.partieData._id) === partyId
      );
    }
    if (!partieTrouvee) {
      return res
        .status(404)
        .json({ message: "Partie non trouvée dans le dossier." });
    }

    // ---------------------------------------------------------------------
    // NOUVELLE LOGIQUE : SI LE CONTACT EST AVOCAT, ON L'AJOUTE DANS 'avocats'
    // SINON ON L'AJOUTE DANS 'contacts'.
    // On utilise le contactToLink trouvé.
    // ---------------------------------------------------------------------
    const isAvocat = contactToLink.pro_contact === true && (contactToLink.type === 'Avocat' || contactToLink.type === 'Avocate');

    if (isAvocat) {
      if (!partieTrouvee.avocats) {
        partieTrouvee.avocats = [];
      }
      // Éviter les doublons
      if (!partieTrouvee.avocats.some(av => String(av._id) === String(contactToLink._id))) {
        partieTrouvee.avocats.push(contactToLink);
      }
    } else {
      if (!partieTrouvee.contacts) {
        partieTrouvee.contacts = [];
      }
      // Éviter les doublons
      if (!partieTrouvee.contacts.some(ct => String(ct._id) === String(contactToLink._id))) {
        partieTrouvee.contacts.push(contactToLink);
      }
    }

    dossier.markModified("dossier");
    await dossier.save();

    res.json({
      message: "Contact lié ajouté avec succès à la partie.",
      contactLier: contactToLink, // Renvoyer le contact lié
      dossier,
    });
  })
);

// ------------------------------------------------------------------------
// Route pour supprimer un contact lié d'une partie d'un dossier
// ------------------------------------------------------------------------
router.post(
  "/removeLinkedContactFromParty",
  auth,
  asyncHandler(async (req, res) => {
    const { dossierId, partyId, contactId, isAvocat } = req.body;
    if (!dossierId || !partyId || !contactId) {
      return res
        .status(400)
        .json({ message: "dossierId, partyId et contactId sont requis." });
    }

    // SECURITE rc37 : check UserDossier
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      return res.status(404).json({ message: "Dossier non trouvé." });
    }

    let partieTrouvee = null;
    if (dossier.dossier.parties && Array.isArray(dossier.dossier.parties.pour)) {
      partieTrouvee = dossier.dossier.parties.pour.find(
        (p) => p.partieData && String(p.partieData._id) === partyId
      );
    }
    if (
      !partieTrouvee &&
      dossier.dossier.parties &&
      Array.isArray(dossier.dossier.parties.contre)
    ) {
      partieTrouvee = dossier.dossier.parties.contre.find(
        (p) => p.partieData && String(p.partieData._id) === partyId
      );
    }
    if (!partieTrouvee) {
      return res
        .status(404)
        .json({ message: "Partie non trouvée dans le dossier." });
    }

    if (isAvocat) {
      if (partieTrouvee.avocats) {
        partieTrouvee.avocats = partieTrouvee.avocats.filter(
          (av) => String(av._id) !== String(contactId)
        );
      }
    } else {
      if (partieTrouvee.contacts) {
        partieTrouvee.contacts = partieTrouvee.contacts.filter(
          (ct) => String(ct._id) !== String(contactId)
        );
      }
    }

    dossier.markModified("dossier");
    await dossier.save();

    res.json({
      message: "Contact lié supprimé avec succès de la partie.",
      dossier,
    });
  })
);

// ========================================================================
// === MODIFICATION MAJEURE : Route pour récupérer un dossier par ID ======
// ========================================================================
router.get(
  "/dossier/:id",
  auth,
  asyncHandler(async (req, res) => {
    const dossierId = req.params.id;
    console.log("GET /api/folder/dossier/:id =>", dossierId);

    // SECURITE rc37 : check UserDossier — eq la verification deja en place
    // sur le PUT de cette meme route (l.784 historique). Sans cela un user
    // pouvait lire le contenu integral d'un dossier d'un autre cabinet
    // (parties, contacts populates, documents, factures) via un simple GET.
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    let dossierDoc = await Dossier.findById(dossierId);
    if (!dossierDoc) {
      return res.status(404).json({ error: "Dossier introuvable" });
    }

    // Assurer que les structures de base existent
    if (!dossierDoc.dossier) dossierDoc.dossier = {};
    if (!dossierDoc.dossier.parties) dossierDoc.dossier.parties = { pour: [], contre: [] };
    if (!dossierDoc.dossier.dossier) dossierDoc.dossier.dossier = {};

    // === GARANTIE CRUCIALE : Initialisation du tableau documents ===
    if (!dossierDoc.dossier.documents) {
      dossierDoc.dossier.documents = [];
    }

    // ================== DÉBUT DE LA LOGIQUE DE POPULATION CORRIGÉE ==================
    const populatePartieData = async (partie) => {
      if (!partie || !partie.idPartie || !mongoose.Types.ObjectId.isValid(partie.idPartie)) {
        return { ...partie, partieData: partie.partieData || {} };
      }
      const id = partie.idPartie;

      // Essayer de trouver dans les 3 collections de contacts
      let contactDoc = await Contact.findById(id).lean() ||
        await ContactPM.findById(id).lean() ||
        await ContactPMPublique.findById(id).lean();

      if (!contactDoc) {
        return { ...partie, partieData: partie.partieData || {} };
      }

      // Si c'est une Personne Morale Privée, peupler le RL et le CD
      if (contactDoc.raisonSociale) {
        const rlLink = await ContactRepresentantLegal.findOne({ contactPM: id }).lean();
        if (rlLink) {
          const rlDoc = await RepresentantLegal.findById(rlLink.representantLegal).lean();
          if (rlDoc) contactDoc.representantLegal = rlDoc;
        }
        const cdLink = await ContactContactDirect.findOne({ contactPM: id }).lean();
        if (cdLink) {
          const cdDoc = await ContactDirect.findById(cdLink.contactDirect).lean();
          if (cdDoc) contactDoc.contactDirect = cdDoc;
        }
      }

      // Si c'est une Personne Physique, peupler les personnes à charge
      if (contactDoc.nom && contactDoc.prenoms) {
        const PCLinks = await ContactPersonneCharge.find({ contact: id }).lean();
        if (PCLinks.length > 0) {
          const pcIds = PCLinks.map(link => link.personneCharge);
          const personnesCharge = await PersonneCharge.find({ '_id': { $in: pcIds } }).lean();
          contactDoc.personnes_en_charge = personnesCharge;
        } else {
          contactDoc.personnes_en_charge = [];
        }
      }

      return { ...partie, partieData: contactDoc };
    };
    // ================== FIN DE LA LOGIQUE DE POPULATION CORRIGÉE ==================

    // ================== RAFRAÎCHISSEMENT DES CONTACTS/AVOCATS LIÉS ==================
    // Les tableaux partie.contacts[] et partie.avocats[] contiennent des copies embarquées
    // (type Mixed). On les rafraîchit depuis la base pour garantir des données à jour.
    const refreshLinkedItems = async (partie) => {
      // Rafraîchir les contacts liés
      if (Array.isArray(partie.contacts) && partie.contacts.length > 0) {
        partie.contacts = await Promise.all(partie.contacts.map(async (c) => {
          if (!c || !c._id) return c;
          const fresh = await Contact.findById(c._id).lean()
            || await ContactPM.findById(c._id).lean()
            || await ContactPMPublique.findById(c._id).lean();
          return fresh || c; // fallback sur la copie embarquée si introuvable
        }));
      }
      // Rafraîchir les avocats liés (mapping des champs OfficeUser)
      if (Array.isArray(partie.avocats) && partie.avocats.length > 0) {
        partie.avocats = await Promise.all(partie.avocats.map(async (a) => {
          if (!a || !a._id) return a;
          const fresh = await Contact.findById(a._id).lean()
            || await ContactPM.findById(a._id).lean()
            || await ContactPMPublique.findById(a._id).lean();
          if (fresh) {
            const mapped = {
              ...a,
              nomOfficeUser: fresh.nom || fresh.raisonSociale || fresh.denomination || a.nomOfficeUser,
              prenomOfficeUser: fresh.prenoms || a.prenomOfficeUser,
              email: fresh.email || a.email,
              address: fresh.adresse || fresh.adresseSiegeSocial || a.address,
              city: fresh.ville || fresh.villePM || a.city,
              postalCode: fresh.codePostal || fresh.codePostalPM || a.postalCode,
              genre: fresh.genre || a.genre,
              roleOfficeUser: fresh.type || a.roleOfficeUser,
            };
            // Préserver les champs email spécifiques aux PM privées
            if (fresh.raisonSociale) {
              mapped.raisonSociale = fresh.raisonSociale;
              mapped.emailEntreprise = fresh.emailEntreprise;
              mapped.interlocuteurEmail = fresh.interlocuteurEmail;
              mapped.interlocuteurNom = fresh.interlocuteurNom;
              mapped.interlocuteurPrenom = fresh.interlocuteurPrenom;
              mapped.interlocuteurFonction = fresh.interlocuteurFonction;
            }
            // Préserver les champs email spécifiques aux PM publiques
            if (fresh.denomination) {
              mapped.denomination = fresh.denomination;
              mapped.contactEmail = fresh.contactEmail;
              mapped.contactNom = fresh.contactNom;
              mapped.contactPrenom = fresh.contactPrenom;
            }
            return mapped;
          }
          return a;
        }));
      }
      return partie;
    };
    // ================== FIN RAFRAÎCHISSEMENT ==================

    if (dossierDoc.dossier.parties.pour && Array.isArray(dossierDoc.dossier.parties.pour)) {
      dossierDoc.dossier.parties.pour = await Promise.all(
        dossierDoc.dossier.parties.pour.map(async (p) => {
          const populated = await populatePartieData(p);
          return await refreshLinkedItems(populated);
        })
      );
    } else {
      dossierDoc.dossier.parties.pour = [];
    }

    if (dossierDoc.dossier.parties.contre && Array.isArray(dossierDoc.dossier.parties.contre)) {
      dossierDoc.dossier.parties.contre = await Promise.all(
        dossierDoc.dossier.parties.contre.map(async (p) => {
          const populated = await populatePartieData(p);
          return await refreshLinkedItems(populated);
        })
      );
    } else {
      dossierDoc.dossier.parties.contre = [];
    }

    // === DEBUG : Logger les emails des contacts dans les parties ===
    const logPartieContacts = (parties, side) => {
      (parties || []).forEach((p, i) => {
        (p.contacts || []).forEach((c, j) => {
          console.log(`[GET /dossier] ${side}[${i}].contacts[${j}]: _id=${c._id} nom=${c.nom} email=${c.email}`);
        });
      });
    };
    logPartieContacts(dossierDoc.dossier.parties.pour, 'pour');
    logPartieContacts(dossierDoc.dossier.parties.contre, 'contre');
    // === FIN DEBUG ===

    res.json(dossierDoc);
  })
);

/* ------------------------------------------------------------------------
   PUT /api/folder/dossier/:id  ► édition complète d’un dossier
------------------------------------------------------------------------ */
router.put(
  "/dossier/:id",
  auth,
  asyncHandler(async (req, res) => {
    console.log("====== SERVER PUT /dossier/:id ======");

    console.log("Dossier ID from params:", req.params.id);
    const dossierId = req.params.id;
    const updatedDataFromRequest = req.body; // Ce que le client envoie
    const userId = req.user; // Correction: req.user est directement l'ID de l'utilisateur

    /* 1. contrôle ownership ------------------------------------------------ */
    const dossier = await Dossier.findById(dossierId);
    if (!dossier) return res.status(404).json({ message: "Dossier introuvable" });
    const isLinked = await UserDossier.findOne({ user: userId, dossier: dossierId });
    if (!isLinked) {
      console.error(`Accès refusé pour user ${userId} sur dossier ${dossierId}. Liaison UserDossier non trouvée.`);
      secLog(EVT.ACCESS_DENIED, {
        userId: String(userId),
        resourceType: 'dossier',
        resourceId: String(dossierId),
        reason: 'no-userDossier-link',
      }, req);
      return res.status(403).json({ message: "Accès refusé." });
    }

    /* 2. hook versioning-ready (si utilisé) -------------------------------- */
    // await snapshotService.beforeUpdate(dossier);

    /* 3. mise à jour ------------------------------------------------------- */
    const dossierDataToSave = { ...updatedDataFromRequest };
    delete dossierDataToSave.saveSnapshot;

    if (dossierDataToSave.dossier) {
      if (!dossier.dossier.dossier) dossier.dossier.dossier = {};
      const existingData = typeof dossier.dossier.dossier.toObject === 'function'
        ? dossier.dossier.dossier.toObject()
        : { ...dossier.dossier.dossier };
      dossier.dossier.dossier = { ...existingData, ...dossierDataToSave.dossier };
    }
    if (dossierDataToSave.parties) {
      dossier.dossier.parties = dossierDataToSave.parties;
    }
    if (dossierDataToSave.liensCommunes) {
      dossier.dossier.liensCommunes = dossierDataToSave.liensCommunes;
    }
    if (dossierDataToSave.contactsDuDossier) {
      dossier.dossier.contactsDuDossier = dossierDataToSave.contactsDuDossier;
    }
    if (dossierDataToSave.avocatsResponsables) {
      dossier.dossier.avocatsResponsables = dossierDataToSave.avocatsResponsables;
    }

    // <<< NOUVELLE LOGIQUE : Recalculer le nom du dossier avant de sauvegarder >>>
    if (dossier.dossier && dossier.dossier.parties) {
      const pour = dossier.dossier.parties.pour || [];
      const contre = dossier.dossier.parties.contre || [];

      let pourFirst = pour.length > 0 ? pour[0].nomPartie : "";
      let contreFirst = contre.length > 0 ? contre[0].nomPartie : "";

      if (pour.length > 1) pourFirst += " et autres…";
      if (contre.length > 1) contreFirst += " et autres…";

      let newDossierNom = "";
      if (pourFirst && contreFirst) {
        newDossierNom = `${pourFirst} c/ ${contreFirst}`;
      } else {
        newDossierNom = pourFirst || (contreFirst ? `c/ ${contreFirst}` : "Dossier sans nom");
      }

      if (dossier.dossier.dossier) {
        dossier.dossier.dossier.nom = newDossierNom;
      }
    }
    // <<< FIN DE LA NOUVELLE LOGIQUE >>>

    dossier.markModified('dossier');
    dossier.markModified('dossier.dossier');
    dossier._lastUpdated = new Date();

    await dossier.save();

    audit.update(req, 'dossier', dossier._id, {
      reference: dossier.reference,
      nom: dossier.dossier?.dossier?.nom,
      sections: Object.keys(updatedDataFromRequest || {}),
    });

    res.json(dossier);
  })
);

// ========================================================================
// === NOUVELLES ROUTES POUR LES SOUS-DOSSIERS ============================
// ========================================================================

/**
 * @route   POST /api/folder/dossier/:dossierId/subfolder
 * @desc    Ajouter un sous-dossier à un dossier existant.
 * @access  Privé
 */
router.post('/dossier/:dossierId/subfolder', auth, asyncHandler(async (req, res) => {
  const { dossierId } = req.params;
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Le nom du sous-dossier est requis." });
  }

  // SECURITE rc37 : check UserDossier
  if (!(await ensureDossierOwnership(req, res, dossierId))) return;

  const dossier = await Dossier.findById(dossierId);
  if (!dossier) {
    return res.status(404).json({ message: "Dossier non trouvé." });
  }

  // Vérification d'unicité du nom de sous-dossier (case-insensitive)
  const trimmedName = name.trim();
  const duplicate = dossier.subfolders.some(
    sf => sf.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (duplicate) {
    return res.status(409).json({ message: `Un sous-dossier nommé "${trimmedName}" existe déjà.` });
  }

  // Couleur par défaut jaune (#F8E71C, identique au preset jaune du color picker côté client).
  // L'utilisateur peut la changer ensuite via la palette de couleurs.
  dossier.subfolders.push({ name: trimmedName, color: '#F8E71C' });
  await dossier.save();

  const newSf = dossier.subfolders[dossier.subfolders.length - 1];
  audit.create(req, 'subfolder', newSf._id, { dossierId: String(dossier._id), name: trimmedName });

  res.status(201).json(dossier);
}));

/**
 * @route   PUT /api/folder/dossier/:dossierId/subfolder/:subfolderId
 * @desc    Mettre à jour un sous-dossier (renommer, colorer).
 * @access  Privé
 */
router.put('/dossier/:dossierId/subfolder/:subfolderId', auth, asyncHandler(async (req, res) => {
  const { dossierId, subfolderId } = req.params;
  const { name, color } = req.body;

  // SECURITE rc37 : check UserDossier
  if (!(await ensureDossierOwnership(req, res, dossierId))) return;

  const dossier = await Dossier.findById(dossierId);
  if (!dossier) {
    return res.status(404).json({ message: "Dossier non trouvé." });
  }

  const subfolder = dossier.subfolders.id(subfolderId);
  if (!subfolder) {
    return res.status(404).json({ message: "Sous-dossier non trouvé." });
  }

  // Vérification d'unicité lors du renommage (exclut le sous-dossier courant)
  if (name) {
    const trimmedName = name.trim();
    const duplicate = dossier.subfolders.some(
      sf => sf._id.toString() !== subfolderId && sf.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      return res.status(409).json({ message: `Un sous-dossier nommé "${trimmedName}" existe déjà.` });
    }
    subfolder.name = trimmedName;
  }
  if (color) subfolder.color = color;

  await dossier.save();

  audit.update(req, 'subfolder', subfolderId, {
    dossierId: String(dossier._id),
    fields: [name && 'name', color && 'color'].filter(Boolean),
  });

  res.status(200).json(dossier);
}));

/**
 * @route   DELETE /api/folder/dossier/:dossierId/subfolder/:subfolderId
 * @desc    Supprimer un sous-dossier et TOUS les documents qu'il contient.
 * @access  Privé
 */
router.delete('/dossier/:dossierId/subfolder/:subfolderId', auth, asyncHandler(async (req, res) => {
  const { dossierId, subfolderId } = req.params;

  // SECURITE rc37 : check UserDossier — la suppression cascade des documents
  // d'un sous-dossier etait possible sur le dossier d'un autre cabinet.
  if (!(await ensureDossierOwnership(req, res, dossierId))) return;

  const dossier = await Dossier.findById(dossierId);
  if (!dossier) {
    return res.status(404).json({ message: "Dossier non trouvé." });
  }

  const subfolderToDelete = dossier.subfolders.id(subfolderId);
  if (!subfolderToDelete) {
    return res.status(404).json({ message: "Sous-dossier non trouvé." });
  }

  // --- MODIFICATION MAJEURE : Supprimer les documents liés ---
  if (dossier.dossier?.documents) {
    dossier.dossier.documents = dossier.dossier.documents.filter(doc => {
      // Conserver le document seulement si son subfolderId n'est pas celui à supprimer
      return !doc.subfolderId || doc.subfolderId.toString() !== subfolderId;
    });
    dossier.markModified('dossier.documents');
  }
  // -------------------------------------------------------------

  // Supprimer le sous-dossier de la liste
  dossier.subfolders.pull(subfolderId);

  const updatedDossier = await dossier.save();

  audit.delete(req, 'subfolder', subfolderId, {
    dossierId: String(dossier._id),
    name: subfolderToDelete?.name,
  });

  // Renvoyer l'objet du sous-dossier supprime pour l'agent local et le dossier mis a jour
  res.status(200).json({
    message: "Sous-dossier et son contenu supprimés avec succès.",
    updatedDossier: updatedDossier,
    deletedSubfolder: subfolderToDelete
  });
}));

/**
 * @route   PUT /api/folder/dossier/:dossierId/document/:docId/movetosubfolder
 * @desc    Déplacer un document dans un sous-dossier.
 * @access  Privé
 */
router.put('/dossier/:dossierId/document/:docId/movetosubfolder', auth, asyncHandler(async (req, res) => {
  const { dossierId, docId } = req.params;
  const { subfolderId } = req.body;

  // SECURITE rc37 : check UserDossier
  if (!(await ensureDossierOwnership(req, res, dossierId))) return;

  const dossier = await Dossier.findById(dossierId);
  if (!dossier) return res.status(404).json({ message: "Dossier non trouvé." });
  if (!dossier.dossier || !Array.isArray(dossier.dossier.documents)) return res.status(404).json({ message: "Structure des documents du dossier invalide." });
  const docToMove = dossier.dossier.documents.find(doc => doc._id.toString() === docId);
  if (!docToMove) return res.status(404).json({ message: "Document non trouvé dans le dossier." });

  docToMove.subfolderId = subfolderId ? new mongoose.Types.ObjectId(subfolderId) : null;
  dossier.markModified('dossier.documents');
  await dossier.save();

  res.status(200).json(dossier);
}));

// --- NOUVELLE ROUTE POUR AJOUTER UN DOCUMENT/SOUS-DOSSIER DEPUIS UN EMAIL ---
router.post('/dossier/:dossierId/add-document-from-email', auth, asyncHandler(async (req, res) => {
  const { dossierId } = req.params;
  const { subfolder, documents } = req.body;

  // SECURITE rc37 : check UserDossier
  if (!(await ensureDossierOwnership(req, res, dossierId))) return;

  const dossier = await Dossier.findById(dossierId);
  if (!dossier) return res.status(404).json({ message: "Dossier non trouvé." });

  let subfolderId = null;

  if (subfolder && subfolder.name) {
    const existingSubfolder = dossier.subfolders.find(sf => sf.name === subfolder.name.trim());
    if (existingSubfolder) {
      subfolderId = existingSubfolder._id;
      console.log(`[add-document-from-email] Sous-dossier existant réutilisé: ${subfolder.name} (ID: ${subfolderId})`);
    } else {
      const newSubfolder = { name: subfolder.name.trim() };
      dossier.subfolders.push(newSubfolder);
      subfolderId = dossier.subfolders[dossier.subfolders.length - 1]._id;
      console.log(`[add-document-from-email] Nouveau sous-dossier créé: ${subfolder.name} (ID: ${subfolderId})`);
    }
  }

  // S'assurer que le tableau de documents existe
  if (!dossier.dossier.documents) {
    dossier.dossier.documents = [];
  }

  if (documents && Array.isArray(documents)) {
    documents.forEach(docMeta => {
      // === DÉBUT DE LA MODIFICATION ===
      // Vérifier si un document avec le même nom existe déjà dans le sous-dossier
      const documentExists = dossier.dossier.documents.some(
        doc => doc.nomDocument === docMeta.name && String(doc.subfolderId) === String(subfolderId)
      );

      if (!documentExists) {
        const newDoc = {
          _id: new mongoose.Types.ObjectId(),
          nomDocument: docMeta.name,
          dateCreation: new Date(),
          categorie: docMeta.category,
          userId: req.user,
          subfolderId: subfolderId,
          subfolderName: docMeta.subfolderName || null,
        };
        dossier.dossier.documents.push(newDoc);
        console.log(`[add-document-from-email] Document "${docMeta.name}" ajouté.`);
      } else {
        console.log(`[add-document-from-email] Document "${docMeta.name}" existe déjà. Ignoré.`);
      }
      // === FIN DE LA MODIFICATION ===
    });
  }

  dossier.markModified('subfolders');
  dossier.markModified('dossier.documents');
  const updatedDossier = await dossier.save();

  res.status(201).json({
    message: "Éléments ajoutés avec succès.",
    dossier: updatedDossier
  });
}));

// ========================================================================
// === SUPPRESSION COMPLÈTE D'UN DOSSIER (cascade) ========================
// ========================================================================

const AgendaEvent = require("../../models/AgendaEvents/AgendaEvent");
const DossierEventLink = require("../../models/AgendaEvents/DossierEventLink");

/**
 * @route   DELETE /api/folder/dossier/:dossierId
 * @desc    Supprime un dossier et TOUT son contenu : documents, sous-dossiers,
 *          événements/tâches liés (AgendaEvent + DossierEventLink), lien UserDossier.
 * @access  Privé
 */
router.delete('/dossier/:dossierId', auth, asyncHandler(async (req, res) => {
  const { dossierId } = req.params;
  const userId = req.user;

  console.log(`=== [DELETE] /api/folder/dossier/${dossierId} — userId: ${userId} ===`);

  if (!mongoose.Types.ObjectId.isValid(dossierId)) {
    return res.status(400).json({ message: "ID de dossier invalide." });
  }

  // 1. Vérifier que le dossier existe
  const dossier = await Dossier.findById(dossierId);
  if (!dossier) {
    return res.status(404).json({ message: "Dossier introuvable." });
  }

  // 2. Vérifier l'appartenance au CABINET (rc38/A7) : ensureDossierOwnership
  // utilise getAccessibleUserIds → un membre du cabinet peut supprimer un
  // dossier partagé (au lieu de l'ancien check self-only qui cassait R5b),
  // mais AUCUN dossier d'un autre cabinet n'est accessible.
  if (!(await ensureDossierOwnership(req, res, dossierId))) return;

  // 3. Garde de RÔLE (A7) : la suppression est une action destructrice et
  // irréversible (cascade documents/événements). Seuls owner/admin/avocat
  // peuvent supprimer ; secrétaire et collaborateur sont refusés.
  const role = await getCabinetRole(userId);
  if (!canDeleteDossier(role)) {
    console.warn(`[DELETE dossier] ACCESS_DENIED role=${role} user=${userId} dossier=${dossierId}`);
    secLog(EVT.ACCESS_DENIED, {
      userId: String(userId),
      resourceType: 'dossier',
      resourceId: String(dossierId),
      reason: `role-forbidden:${role}`,
    }, req);
    return res.status(403).json({ message: "Accès refusé : votre rôle ne permet pas de supprimer un dossier." });
  }

  // 3. Supprimer les événements/tâches liés via DossierEventLink
  const links = await DossierEventLink.find({ dossier: dossierId });
  const eventIds = links.map(link => link.agendaEvent);

  let deletedEventsCount = 0;
  if (eventIds.length > 0) {
    const result = await AgendaEvent.deleteMany({ _id: { $in: eventIds } });
    deletedEventsCount = result.deletedCount;
    console.log(`[DELETE dossier] ${deletedEventsCount} événement(s)/tâche(s) supprimé(s).`);
  }

  // 4. Supprimer les DossierEventLink
  await DossierEventLink.deleteMany({ dossier: dossierId });

  // 5. Supprimer le lien UserDossier
  await UserDossier.deleteMany({ dossier: dossierId });

  // A17 : mettre en corbeille les documents stockés du dossier et RENDRE leur
  // quota. Sans ça, ils devenaient des orphelins comptant l'espace à jamais.
  let storageCleanup = { count: 0, releasedBytes: 0 };
  try {
    const { releaseDossierDocuments } = require('../../services/storage/maintenance');
    storageCleanup = await releaseDossierDocuments({ dossierId });
    if (storageCleanup.count > 0) {
      console.log(`[DELETE dossier] ${storageCleanup.count} document(s) stocké(s) mis en corbeille, ${storageCleanup.releasedBytes} octet(s) rendus au quota.`);
    }
  } catch (storageErr) {
    console.warn('[DELETE dossier] Nettoyage stockage échoué (non bloquant):', storageErr.message);
  }

  // 6. Supprimer le dossier lui-même
  await Dossier.findByIdAndDelete(dossierId);

  console.log(`[DELETE dossier] Dossier ${dossierId} supprimé avec succès.`);

  audit.delete(req, 'dossier', dossierId, {
    cascadeEvents: deletedEventsCount,
    cascadeLinks: links.length,
  });

  res.status(200).json({
    message: "Dossier et tout son contenu supprimés avec succès.",
    deletedDossierId: dossierId,
    deletedEventsCount,
    deletedEventIds: eventIds.map(id => id.toString()),
  });
}));

// ========================================================================
// === AIDE JURIDICTIONNELLE (cerfa 15626*02) =============================
// Snapshot persisté et éditable des données du formulaire. La modale
// front pré-remplit depuis le dossier, l'utilisateur complète/corrige,
// puis "Envoyer" sauvegarde ici ; la génération du PDF (overlay) lira
// ce sous-document.
// ========================================================================

/**
 * @route   GET /api/folder/dossier/:dossierId/aide-juridictionnelle
 * @desc    Récupérer le snapshot AJ d'un dossier (objet vide si jamais saisi).
 * @access  Privé
 */
router.get('/dossier/:dossierId/aide-juridictionnelle', auth, asyncHandler(async (req, res) => {
  const { dossierId } = req.params;

  // SECURITE : check UserDossier (même garde que les autres sous-ressources)
  if (!(await ensureDossierOwnership(req, res, dossierId))) return;

  const dossier = await Dossier.findById(dossierId).select('aideJuridictionnelle');
  if (!dossier) {
    return res.status(404).json({ message: "Dossier non trouvé." });
  }

  res.json(dossier.aideJuridictionnelle || {});
}));

/**
 * @route   PUT /api/folder/dossier/:dossierId/aide-juridictionnelle
 * @desc    Enregistrer/mettre à jour le snapshot AJ (merge superficiel des
 *          sections fournies par la modale).
 * @access  Privé
 */
router.put('/dossier/:dossierId/aide-juridictionnelle', auth, validateBody(aideJuridictionnelleSchema), asyncHandler(async (req, res) => {
  const { dossierId } = req.params;

  // SECURITE : check UserDossier
  if (!(await ensureDossierOwnership(req, res, dossierId))) return;

  const dossier = await Dossier.findById(dossierId);
  if (!dossier) {
    return res.status(404).json({ message: "Dossier non trouvé." });
  }

  const incoming = (req.body && typeof req.body === 'object' && !Array.isArray(req.body))
    ? req.body
    : {};
  const existing = dossier.aideJuridictionnelle
    ? (typeof dossier.aideJuridictionnelle.toObject === 'function'
        ? dossier.aideJuridictionnelle.toObject()
        : dossier.aideJuridictionnelle)
    : {};

  dossier.aideJuridictionnelle = { ...existing, ...incoming, updatedAt: new Date() };
  dossier.markModified('aideJuridictionnelle');
  await dossier.save();

  audit.update(req, 'dossier-aide-juridictionnelle', dossier._id, {
    dossierId: String(dossier._id),
    sections: Object.keys(incoming),
  });

  res.status(200).json(dossier.aideJuridictionnelle);
}));

module.exports = router;