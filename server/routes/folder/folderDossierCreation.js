// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_61 - Copie\Kheops_2\server\routes\folder\folderDossierCreation.js
const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();

const auth = require("../../middlewares/middleware-auth");
const { asyncHandler } = require("../../middlewares/folder-middleWare");
const audit = require("../../utils/auditLogger");

// S27 #18b reliquat : garde structurelle Joi top-level pour /createDossier.
const validateBody = require("../../middlewares/validateBody");
const { createDossierSchema } = require("../../validation/dossierSchemas");

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

const snapshotService = require("../../services/snapshotService");
const { getAccessibleUserIds } = require("../../services/cabinetAccess");
const { ensureDossierOwnership, ensureContactOwnership } = require("../../utils/ownershipHelpers");


// ========================================================================
// Routes pour Dossier, Partie, Role, et liaisons (Création)
// ========================================================================

// ------------------------------------------------------------------------
// Créer un dossier (entité de base, potentiellement non utilisée)
// ------------------------------------------------------------------------
router.post(
  "/dossier",
  auth,
  asyncHandler(async (req, res) => {
    const dossier = new Dossier(req.body);
    await dossier.save();
    res.json(dossier);
  })
);

// ------------------------------------------------------------------------
// Créer une partie
// ------------------------------------------------------------------------
router.post(
  "/partie",
  auth,
  asyncHandler(async (req, res) => {
    const partie = new Partie(req.body);
    await partie.save();
    res.json(partie);
  })
);

// ------------------------------------------------------------------------
// Créer un rôle
// ------------------------------------------------------------------------
router.post(
  "/role",
  auth,
  asyncHandler(async (req, res) => {
    const role = new Role(req.body);
    await role.save();
    res.json(role);
  })
);

// ------------------------------------------------------------------------
// Liaisons : ContactPartie, DossierPartie, ContactRole, DossierContact
// ------------------------------------------------------------------------
// SECURITE rc38 (A1) : ces routes bas-niveau créent des LIENS entre des
// dossier/contact identifiés par le corps de la requête. Sans contrôle
// d'appartenance, elles constituent des primitives IDOR d'écriture (rattacher
// son contact au dossier d'un autre cabinet, etc.). On vérifie donc l'ownership
// de chaque id de dossier/contact présent dans le body.
router.post(
  "/contactpartie",
  auth,
  asyncHandler(async (req, res) => {
    if (req.body.contact && !(await ensureContactOwnership(req, res, req.body.contact))) return;
    const contactPartie = new ContactPartie(req.body);
    await contactPartie.save();
    res.json(contactPartie);
  })
);

router.post(
  "/dossierpartie",
  auth,
  asyncHandler(async (req, res) => {
    if (req.body.dossier && !(await ensureDossierOwnership(req, res, req.body.dossier))) return;
    const dossierPartie = new DossierPartie(req.body);
    await dossierPartie.save();
    res.json(dossierPartie);
  })
);

router.post(
  "/contactrole",
  auth,
  asyncHandler(async (req, res) => {
    if (req.body.contact && !(await ensureContactOwnership(req, res, req.body.contact))) return;
    const contactRole = new ContactRole(req.body);
    await contactRole.save();
    res.json(contactRole);
  })
);

router.post(
  "/dossiercontact",
  auth,
  asyncHandler(async (req, res) => {
    if (req.body.dossier && !(await ensureDossierOwnership(req, res, req.body.dossier))) return;
    if (req.body.contact && !(await ensureContactOwnership(req, res, req.body.contact))) return;
    const dossierContact = new DossierContact(req.body);
    await dossierContact.save();
    res.json(dossierContact);
  })
);

// ========================================================================
// Création d'un dossier avec une référence auto-incrémentée
// ========================================================================

// Fonction pour générer la référence d'un dossier
const generateReference = async () => {
  const currentYear = new Date().getFullYear();
  const regex = new RegExp(`^${currentYear}`);

  const lastDossier = await Dossier.find({ reference: regex })
    .sort({ reference: -1 })
    .limit(1);

  let nextRank = 1;
  if (lastDossier.length > 0) {
    const lastReference = lastDossier[0].reference;
    nextRank = parseInt(lastReference.slice(4)) + 1;
  }

  return `${currentYear}${String(nextRank).padStart(2, "0")}`;
};

// ------------------------------------------------------------------------
// POST /createDossier
// SÉCURITÉ : `auth` requis. On ignore strictement `req.body.userId` (qui
// permettait de spoofer le user créateur du dossier sans authentification)
// et on utilise UNIQUEMENT `req.user` issu du JWT vérifié.
// ------------------------------------------------------------------------
router.post(
  "/createDossier",
  auth,
  validateBody(createDossierSchema),
  asyncHandler(async (req, res) => {
    const Contact = require("../../models/Folder/Contact");
    const { dossierData } = req.body;
    const userId = String(req.user);
    console.log(`[createDossier] ▶ DEBUT | userId (req.user): ${userId}`);
    console.log(`[createDossier] dossierData.dossier?.nom: ${dossierData?.dossier?.nom}`);
    console.log(`[createDossier] Parties pour: ${dossierData?.parties?.pour?.length || 0} | contre: ${dossierData?.parties?.contre?.length || 0}`);
    const reference = await generateReference();

    /* 1️⃣ – garantir un _id et réunir tous les contacts */
    const ensureId = (o) => { if (o && !o._id) o._id = new mongoose.Types.ObjectId(); };
    const collected = [];
    const collect = (o) => { if (o) collected.push(o); };

    ["pour", "contre"].forEach((side) =>
      (dossierData.parties?.[side] || []).forEach((p) => {
        // partieData n'a pas _id (retiré côté client), mais idPartie est le vrai _id du contact
        if (p.partieData && !p.partieData._id && p.idPartie) {
          p.partieData._id = p.idPartie;
        }
        ensureId(p.partieData); collect(p.partieData);
        (p.avocats || []).forEach((a) => { ensureId(a); collect(a); });
        (p.contacts || []).forEach((c) => { ensureId(c); collect(c); });
      })
    );
    (dossierData.contactsDuDossier || []).forEach((c) => { ensureId(c); collect(c); });
    (dossierData.avocatsResponsables || []).forEach((a) => { ensureId(a); collect(a); });

    /* 2️⃣ – tentative d'upsert dans la bonne collection selon le type de contact */
    const getModelForContact = (c) => {
      if (c.raisonSociale) return ContactPM;
      if (c.denomination) return ContactPMPublique;
      return Contact;
    };

    // SECURITE rc38 (A1) : l'ancien upsert `findOneAndUpdate({_id}, {...c, userId},
    // {upsert:true})` permettait d'ÉCRASER puis de S'APPROPRIER (userId=attaquant)
    // le Contact d'un autre cabinet en passant son _id. On n'écrit désormais dans
    // le master QUE si le contact n'existe pas encore (création) ou s'il appartient
    // déjà au cabinet courant. Un _id référençant un contact d'un AUTRE cabinet est
    // refusé (la requête entière échoue pour éviter tout embarquement illégitime).
    const accessibleIds = await getAccessibleUserIds(userId);
    const foreignRefs = [];
    try {
      await Promise.all(
        collected.map(async (c) => {
          const Model = getModelForContact(c);
          const existing = await Model.findById(c._id).select('userId').lean();
          if (existing) {
            const ownerId = existing.userId ? String(existing.userId) : null;
            if (ownerId && !accessibleIds.includes(ownerId)) {
              foreignRefs.push(String(c._id));
              return; // ne PAS écraser un contact d'un autre cabinet
            }
            await Model.updateOne({ _id: c._id }, { ...c, userId });
          } else {
            await Model.create({ ...c, _id: c._id, userId });
          }
        })
      );
    } catch (upsertErr) {
      console.warn("Upsert contact warning :", upsertErr.message);
    }

    if (foreignRefs.length > 0) {
      console.warn(`[createDossier] ACCESS_DENIED : contacts hors cabinet référencés par user ${userId}: ${foreignRefs.join(', ')}`);
      return res.status(403).json({
        message: "Accès refusé : un ou plusieurs contacts référencés n'appartiennent pas à votre cabinet.",
      });
    }

    /* 3️⃣ – création du dossier principal */
    const savedDossier = await new Dossier({
      reference,
      dossier: dossierData,
      dateCreation: new Date(),
    }).save();
    console.log(`[createDossier] ✅ Dossier créé: _id=${savedDossier._id} | reference=${savedDossier.reference}`);
    console.log(`[createDossier] Dossier.dossier.dossier.nom: ${savedDossier.dossier?.dossier?.nom}`);

    try {
      await new UserDossier({ user: userId, dossier: savedDossier._id }).save();
      console.log(`[createDossier] ✅ UserDossier créé: user=${userId}, dossier=${savedDossier._id}`);
    } catch (linkError) {
      console.error(`[createDossier] ❌ ERREUR création UserDossier pour dossier ${savedDossier._id}:`, linkError.message);
      // Le dossier existe mais le lien a échoué — dossier orphelin potentiel
    }

    /* 4️⃣ – liaisons contacts ↔ dossier (hors responsables) */
    const contactIds = collected.map((c) => c._id.toString());
    const responsables = (dossierData.avocatsResponsables || []).map((r) => r._id.toString());
    const uniques = [...new Set(contactIds)].filter((id) => !responsables.includes(id));

    for (const id of uniques) {
      await new DossierContact({ dossier: savedDossier._id, contact: id }).save();
    }

    audit.create(req, 'dossier', savedDossier._id, {
      reference: savedDossier.reference,
      nom: dossierData?.dossier?.nom,
      type: dossierData?.dossier?.type_dossier,
      partiesCount: (dossierData.parties?.pour?.length || 0) + (dossierData.parties?.contre?.length || 0),
    });

    console.log(`[createDossier] ✅ FIN — Envoi réponse 201 avec dossier._id: ${savedDossier._id}`);
    return res.status(201).json({
      message: "Dossier créé avec succès",
      dossier: savedDossier,
    });
  })
);

module.exports = router;