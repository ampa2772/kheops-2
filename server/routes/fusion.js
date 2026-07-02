// File: C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_42\Kheops_2\server\routes\fusion.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const path = require('path');

const { findTemplateByName } = require("../utils/fusionUtils");
const Dossier = require("../models/Folder/Dossier");
const StoredDocument = require("../models/Storage/StoredDocument");
const auth = require("../middlewares/middleware-auth");
const { ensureDossierOwnership } = require("../utils/ownershipHelpers");
const audit = require("../utils/auditLogger");

// === NOUVEAUX IMPORTS NÉCESSAIRES POUR LA POPULATION ===
const Contact = require("../models/Folder/Contact");
const ContactPM = require("../models/Folder/ContactPM");
const ContactPMPublique = require("../models/Folder/ContactPMPublique");
const RepresentantLegal = require('../models/Folder/RepresentantLegalPM');
const ContactDirect = require('../models/Folder/ContactDirect');
const ContactRepresentantLegal = require('../models/Folder/modelsLiaisons/ContactRepresentantLegal');
const ContactContactDirect = require('../models/Folder/modelsLiaisons/ContactContactDirect');
const PersonneCharge = require('../models/Folder/PersonneCharge');
const ContactPersonneCharge = require('../models/Folder/modelsLiaisons/ContactPersonneCharge');
// === FIN DES NOUVEAUX IMPORTS ===


// === NOUVELLE FONCTION HELPER (COPIÉE DEPUIS folderDossierInteraction.js) ===
const populatePartieData = async (partie) => {
    if (!partie || !partie.idPartie || !mongoose.Types.ObjectId.isValid(partie.idPartie)) {
        return { ...partie, partieData: partie.partieData || {} };
    }
    const id = partie.idPartie;

    let contactDoc = await Contact.findById(id).lean() ||
                     await ContactPM.findById(id).lean() ||
                     await ContactPMPublique.findById(id).lean();

    if (!contactDoc) {
        return { ...partie, partieData: partie.partieData || {} };
    }

    if (contactDoc.raisonSociale) { // PM Privée
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
    
    if (contactDoc.nom && contactDoc.prenoms) { // Personne Physique
        const PCLinks = await ContactPersonneCharge.find({ contact: id }).lean();
        if (PCLinks.length > 0) {
            const pcIds = PCLinks.map(link => link.personneCharge);
            contactDoc.personnes_en_charge = await PersonneCharge.find({ '_id': { $in: pcIds } }).lean();
        } else {
            contactDoc.personnes_en_charge = [];
        }
    }
    
    return { ...partie, partieData: contactDoc };
};
// === FIN DE LA FONCTION HELPER ===

// === RAFRAÎCHISSEMENT DES CONTACTS/AVOCATS LIÉS ===
// Les tableaux partie.contacts[] et partie.avocats[] contiennent des copies embarquées
// (type Mixed). On les rafraîchit depuis la base pour garantir des données à jour.
const refreshLinkedItems = async (partie) => {
    if (Array.isArray(partie.contacts) && partie.contacts.length > 0) {
        partie.contacts = await Promise.all(partie.contacts.map(async (c) => {
            if (!c || !c._id) return c;
            const fresh = await Contact.findById(c._id).lean()
                || await ContactPM.findById(c._id).lean()
                || await ContactPMPublique.findById(c._id).lean();
            return fresh || c;
        }));
    }
    if (Array.isArray(partie.avocats) && partie.avocats.length > 0) {
        partie.avocats = await Promise.all(partie.avocats.map(async (a) => {
            if (!a || !a._id) return a;
            const fresh = await Contact.findById(a._id).lean()
                || await ContactPM.findById(a._id).lean()
                || await ContactPMPublique.findById(a._id).lean();
            if (fresh) {
                return {
                    ...a,
                    nomOfficeUser: fresh.nom || a.nomOfficeUser,
                    prenomOfficeUser: fresh.prenoms || a.prenomOfficeUser,
                    email: fresh.email || a.email,
                    address: fresh.adresse || a.address,
                    city: fresh.ville || a.city,
                    postalCode: fresh.codePostal || a.postalCode,
                    genre: fresh.genre || a.genre,
                    roleOfficeUser: fresh.type || a.roleOfficeUser,
                };
            }
            return a;
        }));
    }
    return partie;
};
// === FIN RAFRAÎCHISSEMENT ===


router.post("/getTemplates", auth, async (req, res) => {
  try {
    const { name } = req.body;
    const files = await findTemplateByName(name || "");
    return res.json(files);
  } catch (error) {
    console.error("Error in getTemplates:", error);
    res.status(500).json({ error: "Server error during template search" });
  }
});


router.put("/document/color", auth, async (req, res) => {
  const { dossierId, docId, color } = req.body;

  if (!dossierId || !docId) {
    return res.status(400).json({ message: "ID du dossier et du document requis." });
  }

  // SECURITE rc37 : check UserDossier — un user ne peut modifier la couleur
  // que des documents qui sont dans ses propres dossiers.
  if (!(await ensureDossierOwnership(req, res, dossierId))) return;

  const colorRegex = /^#([0-9A-Fa-f]{3}){1,2}$/;
  if (color && !colorRegex.test(color)) {
    return res.status(400).json({ message: "Format de couleur invalide." });
  }

  try {
    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      return res.status(404).json({ message: "Dossier non trouvé." });
    }

    const docToUpdate = dossier.dossier.documents.find(
      (doc) => doc._id.toString() === docId
    );

    if (!docToUpdate) {
      return res.status(404).json({ message: "Document non trouvé dans le dossier." });
    }

    docToUpdate.color = color || null;
    dossier.markModified('dossier');
    await dossier.save();

    res.status(200).json({
      message: "Couleur du document mise à jour.",
      updatedDocument: docToUpdate,
    });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la couleur du document:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
});

router.post("/createDocument", auth, async (req, res) => {
  try {
    const {
      dossierId,
      templateFileName,
      recipients = [],
      templateCategory,
      finalDocumentName,
      subfolderId,
    } = req.body;

    if (!dossierId || !templateFileName) {
      return res.status(400).json({ error: "Missing data (dossierId, templateFileName)" });
    }

    // SECURITE rc37 : check UserDossier
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    let foundDossier = await Dossier.findById(dossierId);
    if (!foundDossier) {
      return res.status(404).json({ error: "Dossier not found" });
    }

    // === POPULATION DES DONNÉES + RAFRAÎCHISSEMENT DES CONTACTS LIÉS ===
    if (foundDossier.dossier && foundDossier.dossier.parties) {
        if (Array.isArray(foundDossier.dossier.parties.pour)) {
            foundDossier.dossier.parties.pour = await Promise.all(
                foundDossier.dossier.parties.pour.map(async (p) => {
                    const populated = await populatePartieData(p);
                    return await refreshLinkedItems(populated);
                })
            );
        }
        if (Array.isArray(foundDossier.dossier.parties.contre)) {
            foundDossier.dossier.parties.contre = await Promise.all(
                foundDossier.dossier.parties.contre.map(async (p) => {
                    const populated = await populatePartieData(p);
                    return await refreshLinkedItems(populated);
                })
            );
        }
    }
    // === FIN POPULATION + RAFRAÎCHISSEMENT ===

    const templateExt = path.extname(templateFileName) || ".docx";
    let docNameFinal = finalDocumentName || templateFileName;
    if (!path.extname(docNameFinal)) {
      docNameFinal += templateExt;
    }
    const recipientString = recipients.map((r) => r.label || r.nom || r.id).join(", ");
    const destinataires = recipients.map((r) => {
      const f = r.fullObject || {};
      return {
        id: r.id || f._id, type: r.type || f.type, nom: f.nom || f.nomOfficeUser || "",
        prenoms: f.prenoms || f.prenomOfficeUser || "", email: f.email || "",
        adresse: f.adresse || f.address || "", ville: f.ville || f.city || "",
        codePostal: f.codePostal || f.postalCode || "", telephone: f.telephone || "",
        pro_contact: f.pro_contact || false,
      };
    });

    const doc = {
      _id: new mongoose.Types.ObjectId(),
      nomDocument: docNameFinal,
      dateCreation: new Date(),
      recipient: recipientString,
      destinataires,
      recipientEmail: destinataires[0]?.email || "",
      categorie: templateCategory || "generated",
      userId: req.user,
      color: null,
      subfolderId: subfolderId || null,
    };

    if (!foundDossier.dossier) foundDossier.dossier = {};
    if (!Array.isArray(foundDossier.dossier.documents)) foundDossier.dossier.documents = [];

    foundDossier.dossier.documents.push(doc);
    foundDossier.markModified("dossier");
    await foundDossier.save();

    console.log(`Document ${doc._id} (${doc.nomDocument}) créé dans dossier ${dossierId}`);
    audit.create(req, 'document', doc._id, {
      dossierId: String(dossierId),
      nomDocument: doc.nomDocument,
      categorie: doc.categorie,
      destinataires: doc.destinataires?.length || 0,
    });
    return res.status(201).json({ message: "Document créé avec succès.", doc, dossier: foundDossier });
  } catch (error) {
    console.error("Error in createDocument:", error);
    res.status(500).json({ error: "Server error during document creation" });
  }
});

router.get("/user-documents/:dossierId", auth, async (req, res) => {
  try {
    const { dossierId } = req.params;
    // SECURITE rc37 : check UserDossier — un user ne peut lister les documents
    // que des dossiers qui lui appartiennent.
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;
    const foundDossier = await Dossier.findById(dossierId);
    if (!foundDossier) {
      return res.status(404).json({ error: "Dossier not found" });
    }
    const documents = foundDossier.dossier?.documents || [];
    return res.json({ documents, total: documents.length });
  } catch (error) {
    console.error("Error in user-documents route:", error);
    res.status(500).json({ error: "Server error retrieving documents" });
  }
});

router.post("/updateDocumentUrl", auth, async (req, res) => {
    // ... (code inchangé)
});

// ========================================================================
// === CORRECTION MAJEURE: Route de suppression de métadonnées robuste ===
// ========================================================================
router.post("/deleteDocument", auth, async (req, res) => {
    const { dossierId, docId } = req.body;
    console.log(`[DEBUG BACKEND ROUTE] 1. Requête reçue pour supprimer le document ${docId} du dossier ${dossierId}`);

    if (!dossierId || !docId) {
        console.error('[DEBUG BACKEND ROUTE] Erreur 400: dossierId ou docId manquant.');
        return res.status(400).json({ error: "Missing dossierId or docId" });
    }

    try {
        if (!mongoose.Types.ObjectId.isValid(dossierId) || !mongoose.Types.ObjectId.isValid(docId)) {
            console.error('[DEBUG BACKEND ROUTE] Erreur 400: Format d\'ID invalide.');
            return res.status(400).json({ error: "Invalid ID format" });
        }

        // SECURITE rc37 : check UserDossier
        if (!(await ensureDossierOwnership(req, res, dossierId))) return;

        const dossier = await Dossier.findById(dossierId);

        if (!dossier) {
            console.error(`[DEBUG BACKEND ROUTE] Erreur 404: Dossier ${dossierId} non trouvé.`);
            return res.status(404).json({ error: "Dossier not found" });
        }

        if (!dossier.dossier || !Array.isArray(dossier.dossier.documents)) {
            console.warn(`[DEBUG BACKEND ROUTE] Le dossier n'a pas de tableau 'documents'. Rien à supprimer.`);
            return res.status(404).json({ error: `Document with ID ${docId} not found in dossier ${dossierId}.` });
        }
        
        const initialDocCount = dossier.dossier.documents.length;

        // Utiliser la méthode Mongoose `pull` pour retirer le sous-document.
        // C'est la méthode la plus fiable pour que Mongoose détecte la modification.
        dossier.dossier.documents.pull(docId);
        
        const newDocCount = dossier.dossier.documents.length;

        if (newDocCount === initialDocCount) {
            console.warn(`[DEBUG BACKEND ROUTE] Erreur 404: Document ${docId} non trouvé dans le tableau du dossier ${dossierId} (pull n'a rien retiré).`);
            return res.status(404).json({ error: `Document with ID ${docId} not found in dossier ${dossierId}.` });
        }

        console.log(`[DEBUG BACKEND ROUTE] 2. Document ${docId} retiré du tableau via pull(). Nombre de documents: ${initialDocCount} -> ${newDocCount}`);
        
        // Pas besoin de `markModified` quand on utilise `pull`.
        console.log('[DEBUG BACKEND ROUTE] 3. Tentative de sauvegarde du dossier...');
        await dossier.save();
        console.log(`[DEBUG BACKEND ROUTE] 4. SUCCÈS: Dossier sauvegardé. Métadonnées du document ${docId} supprimées.`);

        // A17/A19 (reliquat fusion) : la fiche est retirée du dossier — on met
        // aussi en corbeille le fichier stocké correspondant (StoredDocument lié
        // par documentId) et on REND SON ESPACE dans la jauge. Sans cela, le
        // fichier devenait orphelin et comptait dans le quota pour toujours.
        // Best-effort : un échec ici n'annule pas la suppression de la fiche
        // (l'endpoint /verify et la purge rattrapent la dérive).
        let storage = { count: 0, releasedBytes: 0 };
        try {
            // require en ligne anti-cycle (même motif que folderDossierInteraction).
            const { releaseDocument } = require('../services/storage/maintenance');
            storage = await releaseDocument({ documentId: docId, dossierId });
        } catch (e) {
            console.warn('[deleteDocument] libération du stockage échouée (non bloquant):', e.message);
        }

        audit.delete(req, 'document', docId, { dossierId: String(dossierId), storageReleased: storage.count });

        return res.json({ message: "Document metadata deleted successfully", storage });

    } catch (err) {
        console.error("[DEBUG BACKEND ROUTE] ERREUR MAJEURE in deleteDocument:", err);
        res.status(500).json({ error: "Server error deleting document metadata" });
    }
});


router.post("/duplicateDocument", auth, async (req, res) => {
    try {
        const { dossierId, docId } = req.body;
        if (!dossierId || !docId) {
            return res.status(400).json({ error: "Missing dossierId or docId" });
        }

        // SECURITE rc37 : check UserDossier
        if (!(await ensureDossierOwnership(req, res, dossierId))) return;

        const foundDossier = await Dossier.findById(dossierId);
        if (!foundDossier) return res.status(404).json({ error: "Dossier not found" });
        if (!Array.isArray(foundDossier.dossier?.documents)) return res.status(404).json({ error: "Document array not found" });

        const sourceDoc = foundDossier.dossier.documents.find(d => d._id.toString() === docId);
        if (!sourceDoc) return res.status(404).json({ error: "Document not found in dossier" });

        // A17/A19 (reliquat fusion) : si le document source vit dans le stockage
        // en nuage (StoredDocument), dupliquer SEULEMENT la fiche créerait une
        // « copie fantôme » : une fiche avec un nouvel identifiant derrière
        // lequel aucun fichier n'existe. On refuse clairement tant que la copie
        // physique n'est pas câblée (reste-à-faire 🅱️ #4/#12).
        const stored = await StoredDocument.findOne({ documentId: docId, deletedAt: null }).select('_id').lean();
        if (stored) {
            return res.status(409).json({
                error: "DUPLICATE_CLOUD_NOT_SUPPORTED",
                message: "Ce document est conservé dans le stockage en ligne : la duplication ne copierait que sa fiche, pas le fichier lui-même. Téléchargez-le puis redéposez-le dans le dossier pour obtenir une vraie copie.",
            });
        }

        const newDoc = {
            _id: new mongoose.Types.ObjectId(),
            nomDocument: sourceDoc.nomDocument,
            dateCreation: new Date(),
            recipient: sourceDoc.recipient || "",
            destinataires: sourceDoc.destinataires || [],
            recipientEmail: sourceDoc.recipientEmail || "",
            categorie: sourceDoc.categorie || "generated",
            userId: req.user,
            color: sourceDoc.color || null,
            subfolderId: sourceDoc.subfolderId || null,
        };

        foundDossier.dossier.documents.push(newDoc);
        foundDossier.markModified("dossier");
        await foundDossier.save();

        return res.status(201).json({ doc: newDoc, dossier: foundDossier });
    } catch (err) {
        console.error("Error in duplicateDocument:", err);
        res.status(500).json({ error: "Server error duplicating document" });
    }
});

router.post("/renameDocument", auth, async (req, res) => {
  try {
    const { dossierId, docId, newName, newRecipient = null } = req.body;
    if (!dossierId || !docId || !newName || !newName.trim()) {
      return res.status(400).json({ error: "Missing dossierId, docId or valid newName" });
    }

    // SECURITE rc37 : check UserDossier
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    const foundDossier = await Dossier.findById(dossierId);
    if (!foundDossier) return res.status(404).json({ error: "Dossier not found" });
    if (!foundDossier.dossier?.documents) return res.status(404).json({ error: "Document array not found" });

    const docToRename = foundDossier.dossier.documents.find(
      (d) => d._id.toString() === docId
    );
    if (!docToRename) return res.status(404).json({ error: "Document not found in dossier" });
    
    let finalNewName = newName.trim();
    const originalExtension = path.extname(docToRename.nomDocument || '');
    if (originalExtension && !finalNewName.toLowerCase().endsWith(originalExtension.toLowerCase())) {
        finalNewName += originalExtension;
    }
    
    docToRename.nomDocument = finalNewName;
    if (typeof newRecipient === "string") {
      docToRename.recipient = newRecipient.trim();
    }

    foundDossier.markModified("dossier");
    await foundDossier.save();

    return res.json({ message: "Document renommé", doc: docToRename });
  } catch (err) {
    console.error("Error in renameDocument:", err);
    res.status(500).json({ error: "Server error renaming document" });
  }
});

// ========================================================================
// === CORRECTION MAJEURE: Route de création de métadonnées pour D&D =====
// ========================================================================
router.post('/createDroppedDocumentMetadata', auth, async (req, res) => {
  const { dossierId, originalFileName, subfolderId, providedDocId } = req.body;
  console.log(`[DEBUG BACKEND DROP] 1. Requête reçue pour créer les métadonnées pour "${originalFileName}" dans le dossier ${dossierId}`);

  if (!dossierId || !originalFileName) {
    console.error("[DEBUG BACKEND DROP] Données manquantes.");
    return res.status(400).json({ msg: 'Données manquantes (dossierId, originalFileName)' });
  }

  // SECURITE rc37 : check UserDossier — empeche la creation de metadata
  // de doc dans un dossier d'un autre cabinet (etait un trou critique du
  // flow drag-and-drop avec providedDocId).
  if (!(await ensureDossierOwnership(req, res, dossierId))) return;

  // providedDocId permet à l'agent Electron de réserver un ObjectId AVANT
  // l'upload Cloud, pour que le chemin Cloud `Files_Clients/<docId>/<file>`
  // soit connu d'avance. Si l'upload Cloud réussit puis cette route échoue,
  // l'agent peut nettoyer le fichier Cloud à coup sûr (rollback). Sans
  // providedDocId on fonctionne comme avant : le serveur génère l'ID.
  let docObjectId;
  if (providedDocId) {
    if (!mongoose.Types.ObjectId.isValid(providedDocId)) {
      return res.status(400).json({ msg: 'providedDocId invalide (attendu : 24 chars hex)' });
    }
    docObjectId = new mongoose.Types.ObjectId(providedDocId);
  } else {
    docObjectId = new mongoose.Types.ObjectId();
  }

  try {
    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
        console.error(`[DEBUG BACKEND DROP] Dossier ${dossierId} non trouvé.`);
        return res.status(404).json({ msg: 'Dossier non trouvé' });
    }

    const newDocumentMetadata = {
      _id: docObjectId,
      nomDocument: originalFileName,
      dateCreation: new Date(),
      categorie: 'dropped',
      userId: req.user,
      color: null,
      subfolderId: subfolderId || null,
    };
    console.log("[DEBUG BACKEND DROP] 2. Métadonnées à ajouter:", JSON.stringify(newDocumentMetadata, null, 2));

    if (!dossier.dossier) dossier.dossier = {};
    if (!Array.isArray(dossier.dossier.documents)) dossier.dossier.documents = [];

    dossier.dossier.documents.push(newDocumentMetadata);
    console.log(`[DEBUG BACKEND DROP] 3. Document poussé dans le tableau. Taille du tableau: ${dossier.dossier.documents.length}`);
    
    dossier.markModified('dossier');
    
    console.log("[DEBUG BACKEND DROP] 4. Tentative de sauvegarde du dossier...");
    const updatedDossier = await dossier.save();
    console.log("[DEBUG BACKEND DROP] 5. SUCCÈS: Dossier sauvegardé.");

    // MODIFICATION : Renvoyer le dossier complet mis à jour
    res.status(201).json({
        newDocMetadata: newDocumentMetadata,
        updatedDossier: updatedDossier
    });

  } catch (err) {
    console.error('[DEBUG BACKEND DROP] ERREUR MAJEURE lors de la création des métadonnées:', err.message, err.stack);
    res.status(500).send('Erreur serveur lors de la création des métadonnées.');
  }
});


module.exports = router;