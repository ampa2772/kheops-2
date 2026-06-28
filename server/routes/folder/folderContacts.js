// C:\Mes_Projets2\Kheops\Kheops_2_Test_Fusion_69\Kheops_2\server\routes\folder\folderContacts.js

const express = require("express");
const router = express.Router();

// ========================================================================
// Import des modèles pour les Contacts
// ========================================================================
const Contact = require("../../models/Folder/Contact");
const ContactPM = require("../../models/Folder/ContactPM");
const ContactPMPublique = require("../../models/Folder/ContactPMPublique");
const DetailMariage = require("../../models/Folder/DetailMariage");
const PersonneCharge = require("../../models/Folder/PersonneCharge");

const ContactDetailMariage = require("../../models/Folder/modelsLiaisons/ContactDetailMariage");
const ContactNotaireMariage = require("../../models/Folder/modelsLiaisons/ContactNotaireMariage");
const ContactPersonneCharge = require("../../models/Folder/modelsLiaisons/ContactPersonneCharge");

const UserContact = require("../../models/Folder/modelsLiaisons/UserContact");
const UserContactPM = require("../../models/Folder/modelsLiaisons/UserContactPM");
const UserContactPMPublique = require("../../models/Folder/modelsLiaisons/UserContactPMPublique");

// Middleware d'authentification
const auth = require("../../middlewares/middleware-auth");
const { ensureContactOwnership } = require("../../utils/ownershipHelpers");
const { log: secLog, EVT } = require('../../utils/securityLogger');
const audit = require("../../utils/auditLogger");
// Autres middlewares spécifiques
const {
  validateContactData,
  checkContactExists, // Middleware toujours importé mais plus utilisé pour /contact
  asyncHandler,
  validateContactPMData,
  validateContactPMPubliqueData
} = require("../../middlewares/folder-middleWare");

// S27 #18b reliquat : garde structurelle Joi top-level (defense en profondeur,
// vient en amont des validateContactData/PM/PMPublique existants).
const validateBody = require("../../middlewares/validateBody");
const {
  createContactSchema,
  updateContactSchema,
  createContactPMSchema,
  updateContactPMSchema,
  createContactPMPubliqueSchema,
  updateContactPMPubliqueSchema,
  checkContactSchema,
  findOrCreateTribunalSchema,
  createPersonneChargeSchema,
  updatePersonneChargeSchema,
} = require("../../validation/contactSchemas");

// Helper de propagation des modifications dans les copies embarquées des dossiers
const propagateEntityToDossiers = require("../../services/propagateEntityToDossiers");

// ========================================================================
// Helper : propage les personnes à charge actuelles d'un contact dans tous
// les dossiers de l'utilisateur où ce contact figure (en tant que partie).
// Recharge la liste depuis la base et écrit dans partieData.personnes_en_charge.
// ========================================================================
async function propagatePersonnesChargeToDossiers(contactId, userId) {
  const Dossier = require("../../models/Folder/Dossier");
  const UserDossier = require("../../models/Folder/modelsLiaisons/UserDossier");

  const contactIdStr = contactId.toString();

  // 1. Lire les personnes à charge actuelles du contact
  const liaisons = await ContactPersonneCharge.find({ contact: contactId });
  const pcIds = liaisons.map((l) => l.personneCharge);
  const personnesCharge = pcIds.length > 0
    ? (await PersonneCharge.find({ _id: { $in: pcIds } }).lean())
    : [];

  // 2. Trouver tous les dossiers de l'utilisateur
  const userDossierLinks = await UserDossier.find({ user: userId }).select("dossier").lean();
  const userDossierIds = userDossierLinks.map((link) => link.dossier);
  if (userDossierIds.length === 0) return 0;

  const allUserDossiers = await Dossier.find({ _id: { $in: userDossierIds } });

  let totalUpdated = 0;
  for (const dossier of allUserDossiers) {
    let modified = false;
    const d = dossier.dossier;
    if (!d || !d.parties) continue;

    const sides = [d.parties.pour || [], d.parties.contre || []];
    for (const side of sides) {
      for (const partie of side) {
        const matchById = partie.idPartie && partie.idPartie.toString() === contactIdStr;
        const matchByPartieData = partie.partieData && partie.partieData._id && partie.partieData._id.toString() === contactIdStr;
        if (matchById || matchByPartieData) {
          if (!partie.partieData) partie.partieData = {};
          partie.partieData.personnes_en_charge = personnesCharge;
          modified = true;
        }
      }
    }

    if (modified) {
      dossier.markModified("dossier");
      await dossier.save();
      totalUpdated++;
    }
  }

  console.log(`[PROPAGATION PCH] ${totalUpdated} dossier(s) mis à jour pour contact ${contactIdStr}.`);
  return totalUpdated;
}

// ========================================================================
// Helper : propage les modifications d'un Contact (epoux ou ses personnes
// a charge) dans les fiches DivorceCMData ou ce contact figure comme epoux1
// ou epoux2 (lien via epouxN.contactId).
//
// - Synchronise les champs etat civil + adresse + contact des epoux
// - Ajoute/met a jour les enfants du divorce a partir des personnesCharge
//   de type 'enfant' du contact (dedoublonnage par nom+prenoms+dateNaissance)
// - NE supprime jamais d'enfant deja saisi : laisse l'utilisateur garder la
//   main sur la liste finale du divorce
// ========================================================================
async function propagateContactToDivorces(contactId, updatedContact, userId) {
  if (!contactId || !updatedContact) return 0;
  const DivorceCMData = require("../../models/Divorce/DivorceCMData");

  const contactIdStr = String(contactId);
  const ownerUserIdStr = String(userId || '');

  const filter = {
    $or: [
      { 'epoux1.contactId': contactId },
      { 'epoux2.contactId': contactId },
    ],
  };
  if (ownerUserIdStr) filter.ownerUserId = ownerUserIdStr;

  const divorces = await DivorceCMData.find(filter);
  if (divorces.length === 0) return 0;

  // Recharger les personnes a charge actuelles du contact
  const liaisons = await ContactPersonneCharge.find({ contact: contactId }).lean();
  const pcIds = liaisons.map(l => l.personneCharge);
  const pchs = pcIds.length
    ? await PersonneCharge.find({ _id: { $in: pcIds } }).lean()
    : [];
  const enfantsPCH = pchs.filter(p => !p.type || String(p.type).toLowerCase() === 'enfant');
  const adultesPCH = pchs.filter(p => String(p.type || '').toLowerCase() === 'adulte');

  // Champs Contact -> Epoux (mapping fidele a handleSelectContact cote client)
  const epouxFieldsFromContact = (c) => ({
    civilite: (c.genre === 'Feminin' || c.genre === 'Féminin') ? 'Mme' : 'M.',
    nom: c.nom || '',
    nomDeNaissance: c.nom_de_naissance || c.nomDeNaissance || '',
    prenoms: c.prenoms || '',
    dateNaissance: c.dateNaissance || null,
    lieuNaissance: c.villeNaissance || c.lieuNaissance || '',
    paysNaissance: c.paysNaissance || 'France',
    nationalite: c.nationalite || 'francaise',
    profession: c.profession || '',
    adresse: c.adresse || '',
    codePostal: c.codePostal || '',
    ville: c.ville || '',
    pays: c.pays || 'France',
    email: c.email || '',
    telephone: c.telephone || '',
  });

  const enfantKey = (e) => `${(e.nom || '').trim().toLowerCase()}|${(e.prenoms || '').trim().toLowerCase()}|${e.dateNaissance ? new Date(e.dateNaissance).toISOString().slice(0, 10) : ''}`;

  // Compare deux valeurs en gerant Date et string vide / null indifferemment.
  const valuesEqual = (a, b) => {
    if (a == null && (b == null || b === '')) return true;
    if (b == null && (a == null || a === '')) return true;
    if (a instanceof Date || b instanceof Date) {
      return new Date(a).getTime() === new Date(b).getTime();
    }
    return (a || '') === (b || '');
  };

  let totalUpdated = 0;
  for (const div of divorces) {
    let changed = false;
    const fields = epouxFieldsFromContact(updatedContact);

    // Maj epoux1/epoux2 : ne reecrit que les champs qui changent vraiment.
    const updateEpoux = (slot) => {
      const cur = div[slot];
      if (!cur) return;
      let slotChanged = false;
      for (const [k, v] of Object.entries(fields)) {
        if (!valuesEqual(cur[k], v)) {
          cur[k] = v;
          slotChanged = true;
        }
      }
      if (slotChanged) {
        div.markModified(slot);
        changed = true;
      }
    };
    if (div.epoux1?.contactId && String(div.epoux1.contactId) === contactIdStr) {
      updateEpoux('epoux1');
    }
    if (div.epoux2?.contactId && String(div.epoux2.contactId) === contactIdStr) {
      updateEpoux('epoux2');
    }

    // Synchro enfants : update ou ajout (jamais de suppression).
    const enfants = div.enfants || [];
    const enfantKeys = new Map(enfants.map((e, i) => [enfantKey(e), i]));
    for (const pc of enfantsPCH) {
      const baseFields = {
        nom: pc.nom || '',
        prenoms: pc.prenoms || '',
        sexe: (pc.genre === 'Feminin' || pc.genre === 'Féminin') ? 'F' : 'M',
        dateNaissance: pc.dateNaissance || null,
        lieuNaissance: pc.villeNaissance || '',
        pchId: pc._id,
      };
      const key = enfantKey(baseFields);
      if (enfantKeys.has(key)) {
        const idx = enfantKeys.get(key);
        const existing = enfants[idx];
        // Idempotence : ne reecrit que si quelque chose change.
        let itemChanged = false;
        for (const [k, v] of Object.entries(baseFields)) {
          if (!valuesEqual(existing[k], v)) itemChanged = true;
        }
        if (itemChanged) {
          enfants[idx] = {
            ...(typeof existing.toObject === 'function' ? existing.toObject() : existing),
            ...baseFields,
          };
          changed = true;
        }
      } else {
        enfants.push({
          ...baseFields,
          scolarite: { etablissement: '', classe: '', ville: '' },
          residence: { type: '', detailAlternance: '', droitVisiteHebergement: '', vacancesScolaires: '' },
          autoriteParentale: 'conjointe',
          souhaiteEtreEntendu: false,
        });
        enfantKeys.set(key, enfants.length - 1);
        changed = true;
      }
    }
    if (changed) {
      div.enfants = enfants;
      div.markModified('enfants');
    }

    // Synchro adultes a charge : meme logique que les enfants, dans la
    // section adultesCharge.
    const adultes = div.adultesCharge || [];
    const adulteKeys = new Map(adultes.map((a, i) => [enfantKey(a), i]));
    let adultesChanged = false;
    for (const pc of adultesPCH) {
      const baseFields = {
        nom: pc.nom || '',
        prenoms: pc.prenoms || '',
        sexe: (pc.genre === 'Feminin' || pc.genre === 'Féminin') ? 'F' : 'M',
        dateNaissance: pc.dateNaissance || null,
        lieuNaissance: pc.villeNaissance || '',
        adresse: pc.adresse || '',
        codePostal: pc.codePostal || '',
        ville: pc.ville || '',
        pchId: pc._id,
      };
      const key = enfantKey(baseFields);
      if (adulteKeys.has(key)) {
        const idx = adulteKeys.get(key);
        const existing = adultes[idx];
        let itemChanged = false;
        for (const [k, v] of Object.entries(baseFields)) {
          if (!valuesEqual(existing[k], v)) itemChanged = true;
        }
        if (itemChanged) {
          adultes[idx] = {
            ...(typeof existing.toObject === 'function' ? existing.toObject() : existing),
            ...baseFields,
          };
          adultesChanged = true;
        }
      } else {
        adultes.push({
          ...baseFields,
          lien: '',
          motif: '',
          aLaChargeDe: 'commun',
        });
        adulteKeys.set(key, adultes.length - 1);
        adultesChanged = true;
      }
    }
    if (adultesChanged) {
      div.adultesCharge = adultes;
      div.markModified('adultesCharge');
      changed = true;
    }

    if (changed) {
      await div.save();
      totalUpdated++;
    }
  }

  if (totalUpdated > 0) {
    console.log(`[PROPAGATION DIVORCE CM] ${totalUpdated} fiche(s) divorce mise(s) a jour pour contact ${contactIdStr}.`);
  }
  return totalUpdated;
}

// ========================================================================
// Helper : reconstruit l'objet dossier complet à retourner au client après
// une opération inline (pour rafraîchir le store currentDossier côté front).
// ========================================================================
async function buildFullDossierResponse(dossierId) {
  if (!dossierId) return null;
  const Dossier = require("../../models/Folder/Dossier");
  const dossier = await Dossier.findById(dossierId).lean();
  return dossier;
}

// ========================================================================
// NOUVEAU HELPER : Vérification de l'unicité de l'email
// ========================================================================
async function isEmailInUse(email) {
  if (!email || typeof email !== 'string') return { inUse: false };
  const emailLower = email.toLowerCase();
  const regex = new RegExp(`^${emailLower}$`, 'i');

  const modelsAndFields = [
    { model: Contact, fields: ['email'], name: 'Personne Physique' },
    { model: ContactPM, fields: ['emailEntreprise', 'interlocuteurEmail'], name: 'PM Privée' }, // Ajout interlocuteurEmail
    { model: ContactPMPublique, fields: ['email', 'contactEmail', 'interlocuteurEmail'], name: 'PM Publique' }
  ];

  for (const { model, fields } of modelsAndFields) {
    const orConditions = fields.map(field => ({ [field]: regex }));
    const found = await model.findOne({ $or: orConditions });
    if (found) {
      return { inUse: true };
    }
  }

  return { inUse: false };
}

// ========================================================================
// Routes pour les contacts
// ========================================================================

// ------------------------------------------------------------------------
// Route pour obtenir un contact par ID
// ------------------------------------------------------------------------
router.get(
  "/contact/:id",
  auth,
  asyncHandler(async (req, res) => {
    const contactId = req.params.id;
    let response = {};

    console.log(`[LOG SERVEUR] Début de la recherche du contact avec l'ID : ${contactId}`);

    // SECURITE rc37 : check UserContact* (3 tables) — sans cela un user
    // pouvait lire les contacts (PP, PM privee, PM publique) d'un autre
    // cabinet en devinant l'ObjectId.
    if (!(await ensureContactOwnership(req, res, contactId))) return;

    // Tentative de trouver le contact en tant que Personne Physique
    let contact = await Contact.findById(contactId);
    if (contact) {
      console.log("[LOG SERVEUR] Contact trouvé en tant que Personne Physique:", contact);
      response.contact = contact;

      // Récupérer DetailMariage lié au contact via la table de liaison
      const contactDetailMariage = await ContactDetailMariage.findOne({
        contact: contactId,
      });
      if (contactDetailMariage) {
        // Récupérer les détails de mariage
        const detailMariageDoc = await DetailMariage.findById(
          contactDetailMariage.detailMariage
        );
        if (detailMariageDoc) {
          console.log("[LOG SERVEUR] Détails de mariage trouvés:", detailMariageDoc);
          let detailMariage = detailMariageDoc.toObject();

          // Récupérer le notaire lié via la table de liaison
          const contactNotaireMariage = await ContactNotaireMariage.findOne({
            detailMariage: detailMariage._id,
          });
          if (contactNotaireMariage) {
            const notary = await Contact.findById(contactNotaireMariage.notary);
            if (notary) {
              console.log("[LOG SERVEUR] Notaire trouvé:", notary);
              detailMariage.notary = notary;
            } else {
              console.log("[LOG SERVEUR] Aucun notaire trouvé pour ce détail de mariage.");
            }
          } else {
            console.log(
              "[LOG SERVEUR] Aucune liaison avec un notaire trouvée pour ce détail de mariage."
            );
          }

          response.detailMariage = detailMariage;
        } else {
          console.log("[LOG SERVEUR] Aucun détail de mariage trouvé pour ce contact.");
        }
      }

      // Récupérer Personnes à Charge liées au contact via la table de liaison
      const contactPersonneCharges = await ContactPersonneCharge.find({
        contact: contactId,
      });
      if (contactPersonneCharges && contactPersonneCharges.length > 0) {
        const personnesCharge = [];
        for (const liaison of contactPersonneCharges) {
          const personneCharge = await PersonneCharge.findById(
            liaison.personneCharge
          );
          if (personneCharge) {
            personnesCharge.push(personneCharge);
          }
        }
        console.log("[LOG SERVEUR] Personnes à charge trouvées:", personnesCharge);
        response.personnesCharge = personnesCharge;
      } else {
        console.log("[LOG SERVEUR] Aucune personne à charge trouvée pour ce contact.");
      }

      console.log("[LOG SERVEUR] Réponse complète pour Personne Physique:", response);
      return res.json(response);
    }

    // ====================================================================================
    // === PERSONNE MORALE PRIVÉE =========================================================
    // ====================================================================================
    let contactPM = await ContactPM.findById(contactId);
    if (contactPM) {
      console.log("[LOG SERVEUR] Contact trouvé en tant que Personne Morale Privée:", JSON.stringify(contactPM, null, 2));
      response.contactPM = contactPM;

      // NOTE: L'interlocuteur est maintenant intégré dans contactPM, plus besoin de requêtes supplémentaires

      console.log("==========================================================");
      console.log("[LOG SERVEUR] OBJET RÉPONSE FINAL ENVOYÉ AU CLIENT (PM Privée) :");
      console.log(JSON.stringify(response, null, 2));
      console.log("==========================================================");
      return res.json(response);
    }

    // Tentative de trouver le contact en tant que Personne Morale Publique
    let contactPMPublique = await ContactPMPublique.findById(contactId);
    if (contactPMPublique) {
      console.log(
        "[LOG SERVEUR] Contact trouvé en tant que Personne Morale Publique:",
        contactPMPublique
      );
      response.contactPMPublique = contactPMPublique;

      console.log(
        "[LOG SERVEUR] Réponse complète pour Personne Morale Publique:",
        response
      );
      return res.json(response);
    }

    // Si le contact n'est trouvé dans aucune collection
    console.log(`[LOG SERVEUR] Aucun contact trouvé avec l'ID : ${contactId}`);
    res.status(404).json({ message: "Contact non trouvé" });
  })
);

// ------------------------------------------------------------------------
// Route pour créer un nouveau contact (Personne Physique)
// ------------------------------------------------------------------------
router.post(
  "/contact",
  auth,
  validateBody(createContactSchema),
  validateContactData,
  asyncHandler(async (req, res) => {
    const { contact, options } = req.body;
    const contactTypeNot = options.contactType || "contact";

    // SECURITE rc37 (C-06) : on ignore strictement options.userId (spoofable)
    // et on utilise UNIQUEMENT req.user issu du JWT verifie. Sans cela, un
    // attaquant pouvait creer un contact lie au cabinet d'une victime.
    const ownerUserId = String(req.user);
    if (options.userId && String(options.userId) !== ownerUserId) {
      console.warn(`[POST /contact] options.userId=${options.userId} ignored, using req.user=${ownerUserId}`);
    }

    // Verification d'unicite d'email desactivee

    // Creation du contact
    const newContact = new Contact(contact);
    await newContact.save();
    console.log("Contact créé:", newContact);

    // Liaison avec l'utilisateur (req.user, jamais options.userId)
    const newUserContact = new UserContact({
      user: ownerUserId,
      contact: newContact._id,
    });
    await newUserContact.save();
    console.log("Contact lié à l'utilisateur:", newUserContact);

    audit.create(req, 'contact-physique', newContact._id, {
      nom: newContact.nom,
      prenoms: newContact.prenoms,
      contactType: contactTypeNot,
      pro: !!contact.pro_contact,
    });

    // Si le type de contact est "notaireMariage" ou si c'est un pro_contact => on arrête
    if (
      contactTypeNot === "notaireMariage" ||
      contact.pro_contact === true
    ) {
      return res.json(newContact);
    }

    // Si des options sont présentes, gérer les détails supplémentaires
    if (Object.keys(options).length > 0) {
      const { detailMariage, personnesCharge } = options;
      const keysToCheck = [
        "marriageLocation",
        "marriageDate",
        "contractDate",
        "notaryName",
      ];
      if (detailMariage && keysToCheck.some((key) => detailMariage[key])) {
        // Création des détails de mariage
        const { notary, ...detailMariageFields } = detailMariage;
        const newDetailMariage = new DetailMariage(detailMariageFields);
        await newDetailMariage.save();
        console.log("Détails de mariage créés:", newDetailMariage);
        // Liaison du contact avec les détails de mariage
        const newContactDetailMariage = new ContactDetailMariage({
          contact: newContact._id,
          detailMariage: newDetailMariage._id,
        });
        await newContactDetailMariage.save();
        console.log(
          "Contact lié aux détails de mariage:",
          newContactDetailMariage
        );
        // Si un notaire est présent, le lier avec le détail du mariage
        if (Object.keys(notary).length > 0 && notary._id) {
          const existingNotary = await Contact.findById(notary._id);
          if (existingNotary && existingNotary.type === "Notaire") {
            const newContactNotaireMariage = new ContactNotaireMariage({
              contact: newContact._id,
              detailMariage: newDetailMariage._id,
              notary: existingNotary._id,
            });
            await newContactNotaireMariage.save();
            console.log(
              "Le contact, le détail de mariage et le notaire ont été liés:",
              newContactNotaireMariage
            );
          }
        }
      }

      // Gestion des personnes à charge
      if (personnesCharge && personnesCharge.length > 0) {
        for (const pc of personnesCharge) {
          const newPersonneCharge = new PersonneCharge(pc);
          await newPersonneCharge.save();
          console.log("Personne à charge créée:", newPersonneCharge);

          const newContactPersonneCharge = new ContactPersonneCharge({
            contact: newContact._id,
            personneCharge: newPersonneCharge._id,
          });
          await newContactPersonneCharge.save();
          console.log(
            "Contact lié à la personne à charge:",
            newContactPersonneCharge
          );
        }
      }
    }

    res.json(newContact);
  })
);

// ------------------------------------------------------------------------
// Route pour créer un nouveau contact (Personne Morale Privée)
// ------------------------------------------------------------------------
router.post(
  "/contactPM",
  auth,
  validateBody(createContactPMSchema),
  validateContactPMData,
  asyncHandler(async (req, res) => {
    // NOTE: representantLegal et contactDirect ne sont plus utilises separement,
    // les donnees doivent etre dans 'contact' (interlocuteur*)
    const { contact, user } = req.body;

    // SECURITE rc37 (C-06) : on ignore body.user._id (spoofable) et on utilise
    // req.user. Sans cela, un attaquant pouvait creer un ContactPM lie au
    // cabinet d'une victime.
    const ownerUserId = String(req.user);
    if (user && user._id && String(user._id) !== ownerUserId) {
      console.warn(`[POST /contactPM] body.user._id=${user._id} ignored, using req.user=${ownerUserId}`);
    }

    // Verification d'unicite d'email desactivee

    // Creation du contact personne morale
    const newContactPM = new ContactPM(contact);
    await newContactPM.save();
    console.log("ContactPM créé:", newContactPM);

    // Liaison avec l'utilisateur (req.user, jamais body.user._id)
    const userContactPM = new UserContactPM({
      user: ownerUserId,
      contactPM: newContactPM._id,
    });
    await userContactPM.save();
    console.log("ContactPM lié à l'utilisateur:", userContactPM);

    audit.create(req, 'contact-pm', newContactPM._id, {
      raisonSociale: newContactPM.raisonSociale,
    });

    res.status(201).json(newContactPM);
  })
);

// ------------------------------------------------------------------------
// Route pour créer un nouveau contact (Personne Morale Publique)
// ------------------------------------------------------------------------
router.post(
  "/contactPMPublique",
  auth,
  validateBody(createContactPMPubliqueSchema),
  validateContactPMPubliqueData,
  asyncHandler(async (req, res) => {
    const { contactData, user } = req.body;

    // SECURITE rc37 (C-06) : on ignore body.user._id (spoofable) et on utilise
    // req.user. Sans cela, un attaquant pouvait creer un ContactPMPublique lie
    // au cabinet d'une victime.
    const userId = String(req.user);
    if (user && user._id && String(user._id) !== userId) {
      console.warn(`[POST /contactPMPublique] body.user._id=${user._id} ignored, using req.user=${userId}`);
    }

    // Verification d'unicite d'email desactivee

    const newContactPMPublique = new ContactPMPublique(contactData);
    await newContactPMPublique.save();

    const newUserContactPMPublique = new UserContactPMPublique({
      user: userId,
      contactPMPublique: newContactPMPublique._id,
    });
    await newUserContactPMPublique.save();

    audit.create(req, 'contact-pmpub', newContactPMPublique._id, {
      denomination: newContactPMPublique.denomination,
    });

    res.status(201).json(newContactPMPublique);
  })
);

// ------------------------------------------------------------------------
// Route pour modifier un contact (Personne Physique)
// ------------------------------------------------------------------------
router.put(
  "/contact/:id",
  auth,
  validateBody(updateContactSchema),
  validateContactData, // Valide req.body.contact (les données du formulaire)
  asyncHandler(async (req, res) => {
    const contactId = req.params.id;
    const userId = req.user;
    const { contact, options } = req.body;

    // SECURITE rc37 (C-07) : check ownership avant modification
    if (!(await ensureContactOwnership(req, res, contactId))) return;

    const updatedContact = await Contact.findByIdAndUpdate(contactId, contact, {
      new: true,
      runValidators: true,
    });

    if (!updatedContact) {
      return res.status(404).json({ message: "Contact (Physique) non trouvé" });
    }
    console.log("Contact (Physique) mis à jour:", updatedContact);

    audit.update(req, 'contact-physique', contactId, {
      fields: contact ? Object.keys(contact) : [],
    });

    // ====================================================================
    // Synchronisation des personnes à charge (diff add/update/delete)
    // ====================================================================
    if (options && Array.isArray(options.personnesCharge)) {
      const incoming = options.personnesCharge;

      // Liaisons existantes en base
      const existingLinks = await ContactPersonneCharge.find({ contact: contactId });
      const existingIds = existingLinks.map((l) => l.personneCharge.toString());

      // IDs reçus (ceux qui ont déjà un _id en base)
      const incomingIds = incoming
        .filter((pc) => pc && pc._id)
        .map((pc) => pc._id.toString());

      // 1. Supprimer ceux qui ne sont plus dans la liste reçue
      const toDelete = existingIds.filter((id) => !incomingIds.includes(id));
      for (const pcId of toDelete) {
        await PersonneCharge.findByIdAndDelete(pcId);
        await ContactPersonneCharge.deleteOne({ contact: contactId, personneCharge: pcId });
      }

      // 2. Mettre à jour les existants et créer les nouveaux
      for (const pc of incoming) {
        const { _id, id, position, ...pcData } = pc; // eslint-disable-line no-unused-vars
        if (_id && existingIds.includes(_id.toString())) {
          // Update
          await PersonneCharge.findByIdAndUpdate(_id, pcData, { runValidators: true });
        } else {
          // Create + lier
          const newPC = new PersonneCharge(pcData);
          await newPC.save();
          await new ContactPersonneCharge({ contact: contactId, personneCharge: newPC._id }).save();
        }
      }

      // 3. Propager les personnes à charge dans les snapshots des dossiers
      await propagatePersonnesChargeToDossiers(contactId, userId);
    }

    // Propagation dans les copies embarquées de tous les dossiers
    const nbPropagated = await propagateEntityToDossiers(contactId, updatedContact.toObject(), userId);
    console.log(`[PUT /contact/:id] Propagation terminée : ${nbPropagated} dossier(s) mis à jour.`);

    // Propagation specifique aux fiches DivorceCMData ou ce contact figure
    // comme epoux1 ou epoux2 (synchronise etat civil, adresse, enfants).
    try {
      await propagateContactToDivorces(contactId, updatedContact.toObject(), userId);
    } catch (e) {
      console.warn('[PUT /contact/:id] Propagation divorce CM echouee:', e && e.message);
    }

    res.json(updatedContact);
  })
);

// ------------------------------------------------------------------------
// Routes CRUD inline pour les personnes à charge (utilisé par l'onglet ARIA)
// ------------------------------------------------------------------------

// POST : ajouter une personne à charge à un contact existant
router.post(
  "/contact/:contactId/personne-charge",
  auth,
  validateBody(createPersonneChargeSchema),
  asyncHandler(async (req, res) => {
    const { contactId } = req.params;
    const userId = req.user;
    const { personneCharge: pcData, dossierId } = req.body;

    if (!pcData || !pcData.type || !pcData.genre) {
      return res.status(400).json({ message: "type et genre sont requis." });
    }
    if (!pcData.nom && !pcData.prenoms) {
      return res.status(400).json({ message: "Au moins le nom ou le prénom doit être rempli." });
    }

    // SECURITE rc37 (C-08) : check ownership du contact via UserContact*
    if (!(await ensureContactOwnership(req, res, contactId))) return;

    const contactExists = await Contact.findById(contactId);
    if (!contactExists) {
      return res.status(404).json({ message: "Contact non trouvé." });
    }

    const newPC = new PersonneCharge(pcData);
    await newPC.save();
    await new ContactPersonneCharge({ contact: contactId, personneCharge: newPC._id }).save();

    await propagatePersonnesChargeToDossiers(contactId, userId);

    // Propagation aux fiches divorce CM ou ce contact est epoux
    try {
      await propagateContactToDivorces(contactId, contactExists.toObject ? contactExists.toObject() : contactExists, userId);
    } catch (e) {
      console.warn('[POST personne-charge] Propagation divorce CM echouee:', e && e.message);
    }

    const updatedDossier = await buildFullDossierResponse(dossierId);
    res.json({ personneCharge: newPC, updatedDossier });
  })
);

// PUT : modifier un champ d'une personne à charge
router.put(
  "/personne-charge/:pcId",
  auth,
  validateBody(updatePersonneChargeSchema),
  asyncHandler(async (req, res) => {
    const { pcId } = req.params;
    const userId = req.user;
    const { data, dossierId } = req.body;

    // SECURITE rc37 (C-08) : remonter pcId -> ContactPersonneCharge.contact
    // -> UserContact.user et verifier que c'est bien req.user.
    const linkPC = await ContactPersonneCharge.findOne({ personneCharge: pcId }).lean();
    if (!linkPC) {
      return res.status(404).json({ message: "Personne a charge non trouvee." });
    }
    if (!(await ensureContactOwnership(req, res, linkPC.contact))) return;

    const updated = await PersonneCharge.findByIdAndUpdate(pcId, data, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      return res.status(404).json({ message: "Personne à charge non trouvée." });
    }

    // Trouver le contact lié pour la propagation
    const liaison = await ContactPersonneCharge.findOne({ personneCharge: pcId });
    if (liaison) {
      await propagatePersonnesChargeToDossiers(liaison.contact, userId);
      try {
        const contactDoc = await Contact.findById(liaison.contact).lean();
        if (contactDoc) await propagateContactToDivorces(liaison.contact, contactDoc, userId);
      } catch (e) {
        console.warn('[PUT personne-charge] Propagation divorce CM echouee:', e && e.message);
      }
    }

    const updatedDossier = await buildFullDossierResponse(dossierId);
    res.json({ personneCharge: updated, updatedDossier });
  })
);

// DELETE : supprimer une personne à charge
router.delete(
  "/personne-charge/:pcId",
  auth,
  asyncHandler(async (req, res) => {
    const { pcId } = req.params;
    const userId = req.user;
    const { dossierId } = req.query;

    const liaison = await ContactPersonneCharge.findOne({ personneCharge: pcId });
    const contactId = liaison ? liaison.contact : null;

    // SECURITE rc37 (C-08) : verifier l'ownership via le contact lie.
    // Si pas de liaison, on refuse aussi pour ne pas permettre la suppression
    // de PCH orphelines (qui pourraient appartenir a une autre cabinet).
    if (!contactId) {
      console.warn(`[DELETE /personne-charge] PCH ${pcId} sans liaison contact, refus.`);
      return res.status(404).json({ message: "Personne a charge introuvable." });
    }
    if (!(await ensureContactOwnership(req, res, contactId))) return;

    await PersonneCharge.findByIdAndDelete(pcId);
    await ContactPersonneCharge.deleteOne({ personneCharge: pcId });

    if (contactId) {
      await propagatePersonnesChargeToDossiers(contactId, userId);
    }

    const updatedDossier = await buildFullDossierResponse(dossierId);
    res.json({ deletedId: pcId, updatedDossier });
  })
);

// ------------------------------------------------------------------------
// Route pour modifier un contact (Personne Morale Privée)
// ------------------------------------------------------------------------
router.put(
  "/contactPM/:id",
  auth,
  validateBody(updateContactPMSchema),
  validateContactPMData, // Valide req.body.contact (les données du formulaire PM)
  asyncHandler(async (req, res) => {
    const contactId = req.params.id;
    const userId = req.user;
    const { contact } = req.body;

    // SECURITE rc37 (C-07) : check ownership avant modification
    if (!(await ensureContactOwnership(req, res, contactId))) return;

    // 1. Mise à jour de l'entité ContactPM principale
    const updatedContactPM = await ContactPM.findByIdAndUpdate(
      contactId,
      contact, // Contient les champs directs de ContactPM (incluant interlocuteur*)
      { new: true, runValidators: true }
    );

    if (!updatedContactPM) {
      return res.status(404).json({ message: "ContactPM (Privé) non trouvé" });
    }
    console.log("ContactPM (Privé) mis à jour:", updatedContactPM);

    audit.update(req, 'contact-pm', contactId, {
      fields: contact ? Object.keys(contact) : [],
    });

    // NOTE: Suppression de la logique de mise à jour des entités liées (RepresentantLegal, ContactDirect)
    // car elles sont désormais intégrées dans ContactPM.

    // Propagation dans les copies embarquées de tous les dossiers
    const nbPropagated = await propagateEntityToDossiers(contactId, updatedContactPM.toObject(), userId);
    console.log(`[PUT /contactPM/:id] Propagation terminée : ${nbPropagated} dossier(s) mis à jour.`);

    res.json(updatedContactPM);
  })
);

// ------------------------------------------------------------------------
// Route pour modifier un contact (Personne Morale Publique)
// ------------------------------------------------------------------------
router.put(
  "/contactPMPublique/:id",
  auth,
  validateBody(updateContactPMPubliqueSchema),
  validateContactPMPubliqueData, // Valide req.body.contactData
  asyncHandler(async (req, res) => {
    const contactId = req.params.id;
    const userId = req.user;
    const { contactData } = req.body;

    // SECURITE rc37 (C-07) : check ownership avant modification
    if (!(await ensureContactOwnership(req, res, contactId))) return;

    const updatedContactPMPublique = await ContactPMPublique.findByIdAndUpdate(
      contactId,
      contactData, // Contient les champs directs de ContactPMPublique
      { new: true, runValidators: true }
    );

    if (!updatedContactPMPublique) {
      return res.status(404).json({ message: "ContactPMPublique non trouvé" });
    }
    console.log("ContactPMPublique mis à jour:", updatedContactPMPublique);

    audit.update(req, 'contact-pmpub', contactId, {
      fields: contactData ? Object.keys(contactData) : [],
    });

    // Propagation dans les copies embarquées de tous les dossiers
    const nbPropagated = await propagateEntityToDossiers(contactId, updatedContactPMPublique.toObject(), userId);
    console.log(`[PUT /contactPMPublique/:id] Propagation terminée : ${nbPropagated} dossier(s) mis à jour.`);

    res.json(updatedContactPMPublique);
  })
);

// ------------------------------------------------------------------------
// Route pour vérifier si un contact existe
// ------------------------------------------------------------------------
router.post(
  "/check-contact",
  auth,
  validateBody(checkContactSchema),
  asyncHandler(async (req, res) => {
    const { nom, email, dateNaissance } = req.body;
    const userId = req.user;

    if (!userId) {
      return res.status(401).json({ msg: "Utilisateur non authentifié." });
    }

    const existingContact = await Contact.findOne({
      nom,
      email,
      dateNaissance,
      userId: userId
    });

    if (existingContact) {
      return res
        .status(400)
        .json({
          msg: "Un contact avec le même nom, email et date de naissance existe déjà",
        });
    } else {
      return res
        .status(200)
        .json({
          msg: "Aucun contact avec le même nom, email et date de naissance n'a été trouvé",
        });
    }
  })
);

// ========================================================================
// FIND-OR-CREATE TRIBUNAL → ContactPMPublique
// Cherche un ContactPMPublique existant par denomination + codePostal.
// S'il existe, le retourne ; sinon, le crée à partir des données tribunal.
// ========================================================================
router.post(
  '/find-or-create-tribunal',
  auth,
  validateBody(findOrCreateTribunalSchema),
  asyncHandler(async (req, res) => {
    const { nom_etablissement, numero_et_libelle_voie, code_postal, ligne_d_acheminement, adresse_mail, nu_tel } = req.body;

    if (!nom_etablissement) {
      return res.status(400).json({ message: 'nom_etablissement requis.' });
    }

    // SECURITE rc37 (M-12) : restreindre la recherche aux ContactPMPublique
    // deja lies au cabinet courant (UserContactPMPublique). Sans ce filtre,
    // un cabinet pouvait recuperer la fiche d'un tribunal cree par un autre
    // cabinet (info disclosure + pollution).
    const userId = req.user;
    const userPubLinks = await UserContactPMPublique.find({ user: userId })
      .select('contactPMPublique')
      .lean();
    const userPubIds = userPubLinks.map((l) => l.contactPMPublique);

    const query = {
      _id: { $in: userPubIds },
      denomination: nom_etablissement,
    };
    if (code_postal) query.codePostal = code_postal;

    let existing = await ContactPMPublique.findOne(query);
    if (existing) {
      return res.status(200).json({ contact: existing, created: false });
    }

    // Créer un nouveau ContactPMPublique
    const newContact = new ContactPMPublique({
      denomination: nom_etablissement || '',
      adresse: numero_et_libelle_voie || '',
      codePostal: code_postal || '',
      ville: ligne_d_acheminement || '',
      email: adresse_mail || '',
      contactTelephone: nu_tel || '',
      roleFonctionnel: 'Professionnel_Tiers',
    });
    await newContact.save();

    // Creer la liaison UserContactPMPublique (les champs du schema sont
    // `user` et `contactPMPublique`, pas userId/contactPMPubliqueId).
    // Note : userId a deja ete declare plus haut pour la recherche.
    await UserContactPMPublique.findOneAndUpdate(
      { user: userId, contactPMPublique: newContact._id },
      { user: userId, contactPMPublique: newContact._id },
      { upsert: true, new: true }
    );

    return res.status(201).json({ contact: newContact, created: true });
  })
);

module.exports = router;