// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_62\Kheops_2\server\routes\folder\folderDossierInvoice.js
const mongoose = require("mongoose");
const express = require("express");
const router = express.Router();

const auth = require("../../middlewares/middleware-auth");
const { asyncHandler } = require("../../middlewares/folder-middleWare");
const { ensureDossierOwnership } = require("../../utils/ownershipHelpers");
const UserDossier = require("../../models/Folder/modelsLiaisons/UserDossier");

// — chemins corrigés (deux niveaux au-dessus) —
const Dossier = require("../../models/Folder/Dossier");
const { getAccessibleUserIds } = require("../../services/cabinetAccess");

// ========================================================================
// Routes pour la facturation des dossiers
// ========================================================================

// --- NOUVELLE ROUTE : Créer ou mettre à jour une facture (Upsert) ---
router.post(
  "/dossier/:dossierId/upsert-invoice",
  auth,
  asyncHandler(async (req, res) => {
    const { dossierId } = req.params;
    const { invoiceData } = req.body;

    if (!invoiceData || !invoiceData._id) {
      return res.status(400).json({ message: "Données de facture invalides pour l'upsert." });
    }

    // SECURITE rc37 : check UserDossier
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      return res.status(404).json({ message: "Dossier non trouvé." });
    }

    if (!dossier.factures) {
      dossier.factures = [];
    }

    const invoiceIndex = dossier.factures.findIndex(inv => inv._id === invoiceData._id);

    if (invoiceIndex > -1) {
      dossier.factures[invoiceIndex] = {
          ...dossier.factures[invoiceIndex].toObject(),
          ...invoiceData
      };
      console.log(`[API upsert-invoice] Facture ID ${invoiceData._id} mise à jour.`);
    } else {
      dossier.factures.push(invoiceData);
      console.log(`[API upsert-invoice] Nouvelle facture ID ${invoiceData._id} créée.`);
    }

    dossier.markModified('factures');
    const updatedDossier = await dossier.save();

    res.status(200).json({
      message: "Facture sauvegardée avec succès.",
      dossier: updatedDossier
    });
  })
);


// --- MODIFIÉ: Route pour ajouter une facture (enregistre les billedItems) ---
router.post(
  "/dossier/:dossierId/add-invoice",
  auth,
  asyncHandler(async (req, res) => {
    const { dossierId } = req.params;
    const { invoiceData } = req.body;

    // Validation pour s'assurer que les données de base sont présentes
    if (!invoiceData || !invoiceData.nomDocument || invoiceData.totalTTC === undefined) {
      return res.status(400).json({ message: "Données de facture invalides." });
    }

    // SECURITE rc37 : check UserDossier
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    const dossier = await Dossier.findById(dossierId);
    if (!dossier) {
      return res.status(404).json({ message: "Dossier non trouvé." });
    }

    // S'assurer que le tableau 'factures' existe
    if (!Array.isArray(dossier.factures)) {
      dossier.factures = [];
    }

    // === MODIFICATION : Création de l'objet facture avec les nouveaux champs ===
    const newInvoice = {
      _id: new mongoose.Types.ObjectId(),
      nomDocument: invoiceData.nomDocument,
      totalTTC: invoiceData.totalTTC,
      dateCreation: new Date(),
      status: 'pending',
      // On récupère la nouvelle liste détaillée
      billedItems: invoiceData.billedItems || [],
    };

    dossier.factures.push(newInvoice);
    // =========================================================================

    dossier._lastUpdated = new Date();

    const updatedDossier = await dossier.save();

    res.status(201).json({
      message: "Facture ajoutée avec succès.",
      dossier: updatedDossier
    });
  })
);

// --- NOUVELLES ROUTES POUR LA GESTION DES FACTURES ---

/**
 * @route   POST /api/folder/dossier/:dossierId/invoice/:invoiceId/payment
 * @desc    Ajouter un paiement à une facture spécifique.
 * @access  Privé
 */
router.post(
  "/dossier/:dossierId/invoice/:invoiceId/payment",
  auth,
  asyncHandler(async (req, res) => {
    const { dossierId, invoiceId } = req.params;
    const { amount } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ message: "Le montant du paiement est invalide." });
    }

    // SECURITE rc37 : check UserDossier
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    const dossier = await Dossier.findById(dossierId);
    if (!dossier) return res.status(404).json({ message: "Dossier non trouvé." });
    
    const invoice = dossier.factures.id(invoiceId);
    if (!invoice) return res.status(404).json({ message: "Facture non trouvée dans le dossier." });

    invoice.payments.push({ amount: parseFloat(amount) });
    
    // --- MODIFICATION : Logique d'auto-archivage ---
    const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const epsilon = 0.005; // Marge pour les erreurs de calcul en virgule flottante
    
    if (totalPaid >= invoice.totalTTC - epsilon) {
      invoice.status = 'archived';
      invoice.archivedDate = new Date();
      console.log(`[AUTO-ARCHIVE] Facture ${invoiceId} soldée. Statut changé à 'archived'.`);
    } else if (invoice.status === 'paid') {
      // Si un paiement est ajouté à une facture déjà marquée comme payée (ce qui ne devrait pas arriver)
      // on s'assure qu'elle reste 'paid' et non 'pending'.
      // Ce cas est peu probable mais constitue une sécurité.
    }
    // --- FIN DE LA MODIFICATION ---
    
    dossier.markModified('factures');
    
    await dossier.save();
    res.json(dossier);
  })
);


/**
 * @route   PUT /api/folder/dossier/:dossierId/invoice/:invoiceId/archive
 * @desc    Archiver une facture.
 * @access  Privé
 */
router.put(
  "/dossier/:dossierId/invoice/:invoiceId/archive",
  auth,
  asyncHandler(async (req, res) => {
    const { dossierId, invoiceId } = req.params;

    // SECURITE rc37 : check UserDossier
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    const dossier = await Dossier.findById(dossierId);
    if (!dossier) return res.status(404).json({ message: "Dossier non trouvé." });

    const invoice = dossier.factures.id(invoiceId);
    if (!invoice) return res.status(404).json({ message: "Facture non trouvée." });
    
    const totalPaid = (invoice.payments || []).reduce((sum, p) => sum + p.amount, 0);
    const epsilon = 0.005; 
    const isEffectivelyPaid = totalPaid >= invoice.totalTTC - epsilon;

    if (invoice.status === 'pending' && isEffectivelyPaid) {
      invoice.status = 'paid';
      console.log(`[ARCHIVE ROUTE] Le statut de la facture ${invoiceId} a été corrigé de 'pending' à 'paid' car elle est soldée.`);
    }

    if (invoice.status !== 'paid') {
      return res.status(400).json({ 
        message: `Seules les factures entièrement payées peuvent être archivées. Restant dû: ${(invoice.totalTTC - totalPaid).toFixed(2)}€` 
      });
    }

    invoice.status = 'archived';
    invoice.archivedDate = new Date(); // ENREGISTRE LA DATE D'ARCHIVAGE

    dossier.markModified('factures');
    
    await dossier.save();
    res.json(dossier);
  })
);

/**
 * @route   GET /api/folder/invoice-details/:invoiceId
 * @desc    Récupérer les détails d'une facture (maintenant simplifié).
 * @access  Privé
 */
router.get('/invoice-details/:invoiceId', auth, asyncHandler(async (req, res) => {
  const { invoiceId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
    return res.status(400).json({ message: 'ID de facture invalide.' });
  }

  // SECURITE rc37 : restreindre la recherche aux dossiers du user.
  // Sans ce filtre, l'API renvoyait le detail (billedItems, montants, status,
  // payments) de N'IMPORTE QUELLE facture en devinant l'invoiceId.
  const userDossierLinks = await UserDossier.find({ user: { $in: await getAccessibleUserIds(req.user) } }).select('dossier').lean();
  const userDossierIds = userDossierLinks.map((l) => l.dossier);
  if (userDossierIds.length === 0) {
    return res.status(404).json({ message: 'Facture non trouvée.' });
  }

  // Trouver le dossier qui contient cette facture, parmi les dossiers du user
  const dossier = await Dossier.findOne({
    _id: { $in: userDossierIds },
    'factures._id': invoiceId,
  });
  if (!dossier) {
    return res.status(404).json({ message: 'Facture non trouvée.' });
  }

  const invoice = dossier.factures.id(invoiceId);
  if (!invoice) {
    return res.status(404).json({ message: 'Détails de la facture introuvables dans le dossier.' });
  }

  // La route renvoie maintenant directement la facture avec ses "billedItems"
  res.json({
    invoice,
  });
}));

module.exports = router;