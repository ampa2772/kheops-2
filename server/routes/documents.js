const express = require('express');
const router = express.Router();
const auth = require('../middlewares/middleware-auth');
const { asyncHandler } = require('../middlewares/folder-middleWare');
const { ensureDossierOwnership } = require('../utils/ownershipHelpers');
const audit = require('../utils/auditLogger');

// Import des nouveaux modèles
const JsonDocument = require('../models/JsonDocuments/JsonDocument');
const JsonTemplate = require('../models/JsonDocuments/JsonTemplate');

// ========================================================================
// Routes pour les documents JSON structurés
// ========================================================================

// ------------------------------------------------------------------------
// GET /api/documents/templates
// Récupère la liste de tous les modèles disponibles.
// ------------------------------------------------------------------------
router.get('/templates', auth, asyncHandler(async (req, res) => {
    const templates = await JsonTemplate.find().select('name description');
    res.json(templates);
}));

// ------------------------------------------------------------------------
// GET /api/documents/dossier/:dossierId
// Récupère la liste des métadonnées de tous les documents d'un dossier.
// (sans le contenu chiffré pour alléger la réponse)
// SÉCURITÉ rc37 : check UserDossier — un user ne peut lister que les
// documents JSON des dossiers qui lui appartiennent.
// ------------------------------------------------------------------------
router.get('/dossier/:dossierId', auth, asyncHandler(async (req, res) => {
    if (!(await ensureDossierOwnership(req, res, req.params.dossierId))) return;
    // Filtre supplementaire par ownerId pour blinder en cas de doc orphelin.
    const documents = await JsonDocument.find({
        dossierId: req.params.dossierId,
        ownerId: req.user,
    })
        .select('-encryptedContent')
        .sort({ createdAt: -1 });

    res.json(documents);
}));

// ------------------------------------------------------------------------
// GET /api/documents/:id
// Récupère un document unique avec son contenu chiffré.
// SÉCURITÉ rc37 : filtre par ownerId. Un user ne peut lire que ses propres
// documents JSON. Sans ce filtre, n'importe qui pouvait lire l'encryptedContent
// d'un autre cabinet en devinant l'ObjectId.
// ------------------------------------------------------------------------
router.get('/:id', auth, asyncHandler(async (req, res) => {
    const document = await JsonDocument.findOne({
        _id: req.params.id,
        ownerId: req.user,
    });
    if (!document) {
        return res.status(404).json({ message: "Document non trouvé" });
    }
    res.json(document);
}));

// ------------------------------------------------------------------------
// POST /api/documents
// Crée un nouveau document.
// SÉCURITÉ rc37 : check UserDossier sur le dossierId fourni — on n'autorise
// la creation d'un doc JSON que si l'user est lie au dossier cible.
// ------------------------------------------------------------------------
router.post('/', auth, asyncHandler(async (req, res) => {
    const { name, encryptedContent, dossierId } = req.body;

    if (!name || !encryptedContent || !dossierId) {
        return res.status(400).json({ message: "Les champs 'name', 'encryptedContent' et 'dossierId' sont requis." });
    }

    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    const newDocument = new JsonDocument({
        name,
        encryptedContent,
        dossierId,
        ownerId: req.user,
    });

    await newDocument.save();
    audit.create(req, 'jsonDocument', newDocument._id, {
      name: newDocument.name,
      dossierId: String(dossierId),
    });
    res.status(201).json(newDocument);
}));

// ------------------------------------------------------------------------
// PUT /api/documents/:id
// Met à jour un document existant (son contenu et/ou son nom).
// ------------------------------------------------------------------------
router.put('/:id', auth, asyncHandler(async (req, res) => {
    const { name, encryptedContent } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (encryptedContent) updateData.encryptedContent = encryptedContent;

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "Aucune donnée à mettre à jour." });
    }

    const updatedDocument = await JsonDocument.findOneAndUpdate(
        { _id: req.params.id, ownerId: req.user },
        { $set: updateData },
        { new: true }
    );

    if (!updatedDocument) {
        return res.status(404).json({ message: "Document non trouvé ou vous n'avez pas la permission de le modifier." });
    }

    audit.update(req, 'jsonDocument', req.params.id, { fields: Object.keys(updateData) });
    res.json(updatedDocument);
}));

// ------------------------------------------------------------------------
// DELETE /api/documents/:id
// Supprime un document.
// ------------------------------------------------------------------------
router.delete('/:id', auth, asyncHandler(async (req, res) => {
    const deletedDocument = await JsonDocument.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.user
    });

    if (!deletedDocument) {
        return res.status(404).json({ message: "Document non trouvé ou vous n'avez pas la permission de le supprimer." });
    }

    audit.delete(req, 'jsonDocument', req.params.id);
    res.json({ message: "Document supprimé avec succès." });
}));


module.exports = router;
