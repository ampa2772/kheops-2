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
const UserContact = require("../../models/Folder/modelsLiaisons/UserContact");
const UserContactPM = require("../../models/Folder/modelsLiaisons/UserContactPM");
const UserContactPMPublique = require("../../models/Folder/modelsLiaisons/UserContactPMPublique");

const snapshotService = require("../../services/snapshotService");
const { getAccessibleUserIds } = require("../../services/cabinetAccess");
const {
  ensureDossierOwnership,
  ensureContactOwnership,
  getAccessibleRelationEntityIds,
} = require("../../utils/ownershipHelpers");
const { materializeMatterFolder } = require("../../services/storage/matterFolderMaterializer");
const { resolveTenantId } = require("../../services/tenantService");
const { normalizeDossierParties } = require("../../services/dossierPartyRelations");

const isValidObjectId = (value) => Boolean(
  value && mongoose.Types.ObjectId.isValid(String(value)),
);

const requireRelationIds = (req, res, fields) => {
  for (const field of fields) {
    const value = req.body?.[field];
    if (!isValidObjectId(value)) {
      res.status(400).json({ message: `${field} invalide ou manquant.` });
      return false;
    }
  }
  return true;
};

/**
 * Les anciens documents Partie ne portent ni tenantId ni userId. Leur
 * appartenance se déduit donc, sans migration destructive :
 *   1. du contact principal de la partie lorsqu'il existe ;
 *   2. à défaut, d'un DossierPartie déjà relié à un dossier accessible.
 * Une partie sans aucune de ces preuves reste fermée par défaut.
 */
const ensurePartieOwnership = async (req, res, partieId) => {
  const partie = await Partie.findById(partieId).select('contact').lean();
  if (!partie) {
    res.status(403).json({ message: "Accès refusé : cette partie n'appartient pas à votre cabinet." });
    return false;
  }

  if (partie.contact) {
    return ensureContactOwnership(req, res, partie.contact);
  }

  const dossierLinks = await DossierPartie.find({ partie: partieId }).select('dossier').lean();
  const dossierIds = dossierLinks.map((link) => link.dossier).filter(Boolean);
  if (dossierIds.length > 0) {
    const accessibleUserIds = await getAccessibleUserIds(req.user);
    const accessibleLink = await UserDossier.findOne({
      user: { $in: accessibleUserIds },
      dossier: { $in: dossierIds },
    }).lean();
    if (accessibleLink) return true;
  }

  res.status(403).json({ message: "Accès refusé : cette partie n'appartient pas à votre cabinet." });
  return false;
};

// Role est historiquement un référentiel global (son modèle ne possède aucun
// tenantId). On valide donc strictement son identifiant et son existence ; les
// autres extrémités de ContactRole portent l'isolation cabinet.
const ensureRoleExists = async (res, roleId) => {
  const exists = await Role.exists({ _id: roleId });
  if (exists) return true;
  res.status(404).json({ message: 'Rôle introuvable.' });
  return false;
};


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
    const dossier = new Dossier({ ...req.body, tenantId: await resolveTenantId(req.user) });
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
    if (!requireRelationIds(req, res, ['contact', 'partie'])) return;
    if (!(await ensureContactOwnership(req, res, req.body.contact))) return;
    if (!(await ensurePartieOwnership(req, res, req.body.partie))) return;
    const contactPartie = new ContactPartie(req.body);
    await contactPartie.save();
    res.json(contactPartie);
  })
);

router.post(
  "/dossierpartie",
  auth,
  asyncHandler(async (req, res) => {
    if (!requireRelationIds(req, res, ['dossier', 'partie'])) return;
    if (!(await ensureDossierOwnership(req, res, req.body.dossier))) return;
    if (!(await ensurePartieOwnership(req, res, req.body.partie))) return;
    const dossierPartie = new DossierPartie(req.body);
    await dossierPartie.save();
    res.json(dossierPartie);
  })
);

router.post(
  "/contactrole",
  auth,
  asyncHandler(async (req, res) => {
    if (!requireRelationIds(req, res, ['contact', 'role'])) return;
    const hasContactLie = Boolean(req.body?.contactLie);
    const hasPartie = Boolean(req.body?.partie);
    if (!hasContactLie && !hasPartie) {
      return res.status(400).json({ message: 'contactLie ou partie doit être renseigné.' });
    }
    if (hasContactLie && !isValidObjectId(req.body.contactLie)) {
      return res.status(400).json({ message: 'contactLie invalide.' });
    }
    if (hasPartie && !isValidObjectId(req.body.partie)) {
      return res.status(400).json({ message: 'partie invalide.' });
    }
    if (!(await ensureContactOwnership(req, res, req.body.contact))) return;
    if (hasContactLie && !(await ensureContactOwnership(req, res, req.body.contactLie))) return;
    if (hasPartie && !(await ensurePartieOwnership(req, res, req.body.partie))) return;
    if (!(await ensureRoleExists(res, req.body.role))) return;
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
    const tenantId = await resolveTenantId(userId);
    console.log(`[createDossier] ▶ DEBUT | userId (req.user): ${userId}`);
    console.log(`[createDossier] dossierData.dossier?.nom: ${dossierData?.dossier?.nom}`);
    console.log(`[createDossier] Parties pour: ${dossierData?.parties?.pour?.length || 0} | contre: ${dossierData?.parties?.contre?.length || 0}`);
    const reference = await generateReference();

    // Frontiere canonique : les avocats/contacts et leurs roles restent
    // embarques dans le snapshot, mais sans doublon ni classement ambigu.
    dossierData.parties = normalizeDossierParties(dossierData.parties);

    /* 1️⃣ – garantir un _id et réunir tous les contacts */
    // Seuls les identifiants générés ICI par le serveur peuvent donner lieu à
    // la création d'une fiche : un _id inconnu fourni par le client est refusé
    // (sinon n'importe quel ObjectId — celui d'un membre d'un autre cabinet —
    // pouvait devenir une fiche « plantée » dans le carnet).
    const generatedIds = new Set();
    const ensureId = (o) => {
      if (o && !o._id) {
        o._id = new mongoose.Types.ObjectId();
        generatedIds.add(String(o._id));
      }
    };
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
    //
    // Les schémas Contact / PM / PM publique ne portent AUCUN champ userId :
    // l'appartenance se lit exclusivement dans les tables de liaison
    // (UserContact*), comme partout ailleurs. Le contrôle se fait donc AVANT la
    // moindre écriture, sur tous les identifiants embarqués.
    const invalidRef = collected.find((c) => !isValidObjectId(c._id));
    if (invalidRef) {
      return res.status(400).json({
        message: "Identifiant de relation invalide dans le dossier.",
        code: 'INVALID_DOSSIER_RELATION_ID',
      });
    }
    const relationIds = Array.from(new Set(collected.map((c) => String(c._id))));
    const relationAccess = await getAccessibleRelationEntityIds(userId, relationIds);
    const accessibleContactIds = new Set(relationAccess.contactIds.map(String));
    const internalLawyerIds = new Set(relationAccess.officeUserIds.map(String));
    const foreignRefs = [];
    const unknownRefs = [];
    const contactsToUpdate = [];
    const contactsToCreate = [];
    const seenIds = new Set();
    await Promise.all(
      collected.map(async (c) => {
        const id = String(c._id);
        if (seenIds.has(id)) return;
        seenIds.add(id);
        // Un avocat interne (OfficeUser / utilisateur du cabinet) n'est pas
        // une fiche du carnet : rien à écrire dans les collections de contacts.
        if (internalLawyerIds.has(id)) return;
        if (accessibleContactIds.has(id)) {
          contactsToUpdate.push(c);
          return;
        }
        const exists = await Contact.exists({ _id: id })
          || await ContactPM.exists({ _id: id })
          || await ContactPMPublique.exists({ _id: id });
        if (exists) foreignRefs.push(id); // fiche d'un AUTRE cabinet : refus
        else if (generatedIds.has(id)) contactsToCreate.push(c);
        else unknownRefs.push(id); // _id choisi par le client : jamais honoré
      })
    );

    if (foreignRefs.length > 0) {
      console.warn(`[createDossier] ACCESS_DENIED : contacts hors cabinet référencés par user ${userId}: ${foreignRefs.join(', ')}`);
      return res.status(403).json({
        message: "Accès refusé : un ou plusieurs contacts référencés n'appartiennent pas à votre cabinet.",
      });
    }
    if (unknownRefs.length > 0) {
      console.warn(`[createDossier] UNKNOWN_RELATION : contacts inconnus référencés par user ${userId}: ${unknownRefs.join(', ')}`);
      return res.status(400).json({
        message: "Un ou plusieurs contacts référencés n'existent pas dans votre carnet.",
        code: 'UNKNOWN_DOSSIER_RELATION',
      });
    }

    // Une fiche créée depuis le dossier appartient au cabinet dès sa création
    // (lien User* comme pour les routes de création de contact) ; sans ce lien
    // elle était immédiatement « hors cabinet » (masquée à la lecture, PUT 403).
    const linkForContact = (c) => {
      const Model = getModelForContact(c);
      if (Model === ContactPM) return new UserContactPM({ user: userId, contactPM: c._id }).save();
      if (Model === ContactPMPublique) return new UserContactPMPublique({ user: userId, contactPMPublique: c._id }).save();
      return new UserContact({ user: userId, contact: c._id }).save();
    };
    try {
      await Promise.all([
        ...contactsToUpdate.map((c) => getModelForContact(c).updateOne({ _id: c._id }, { ...c, userId })),
        ...contactsToCreate.map(async (c) => {
          await getModelForContact(c).create({ ...c, _id: c._id, userId });
          await linkForContact(c);
        }),
      ]);
    } catch (upsertErr) {
      console.warn("Upsert contact warning :", upsertErr.message);
    }

    // Les identifiants documentaires sont exclusivement générés par MongoDB.
    // Un _id fourni dans le JSON permettrait sinon de fabriquer une collision
    // avec un document d'un autre cabinet puis de contourner les contrôles IDOR.
    if (Array.isArray(dossierData.documents)) {
      dossierData.documents = dossierData.documents.map((document) => {
        const safeDocument = { ...(document || {}) };
        delete safeDocument._id;
        return safeDocument;
      });
    }

    /* 3️⃣ – création du dossier principal */
    const savedDossier = await new Dossier({
      reference,
      tenantId,
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

    // MATERIALISATION CLOUD (fire-and-forget, jamais bloquant) : cree le dossier
    // au VRAI NOM (Kheops2/Dossiers/<nom — reference>) sur le cloud de
    // l'utilisateur (SharePoint perso si active, sinon OneDrive/Google Drive du
    // cabinet), pour qu'il soit visible hors appli (explorateur/bureau via synchro).
    materializeMatterFolder(userId, savedDossier)
      .then((r) => {
        if (r.ok) console.log(`[createDossier] ☁️ Dossier cloud materialise (${r.provider}) : ${r.label}`);
        else console.log(`[createDossier] ☁️ Materialisation cloud sautee : ${r.reason}`);
      })
      .catch(() => {});

    console.log(`[createDossier] ✅ FIN — Envoi réponse 201 avec dossier._id: ${savedDossier._id}`);
    return res.status(201).json({
      message: "Dossier créé avec succès",
      dossier: savedDossier,
    });
  })
);

module.exports = router;
