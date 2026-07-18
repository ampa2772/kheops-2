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
const User = require("../../models/App_Users/User");
const AgendaEvent = require("../../models/AgendaEvents/AgendaEvent");
const { getFileStorage } = require("../../services/fileStorage");
const PizZip = require("pizzip");

// ── Calcul du bilan CÔTÉ SERVEUR (mode web pur) ──────────────────────────
// Historiquement, le calcul (durée des RDV + nb de caractères des .docx) et
// la génération étaient faits dans l'app de bureau Electron via socket.io.
// En web pur, cet agent n'existe plus → « Calcul en attente… » infini.
// On refait ici : événements = durée × tarif ; documents = temps de frappe
// estimé (caractères ÷ 200 c/min) × tarif, en lisant le .docx dans le stockage.

// Clé du .docx serveur (identique à server/routes/word.js).
function docxStorageKey(docId) {
  const safe = String(docId).replace(/[^a-zA-Z0-9_-]/g, "_");
  return `documents/${safe}.docx`;
}

// Nombre de caractères de texte d'un .docx (lecture du word/document.xml).
function countDocxChars(buffer) {
  try {
    const zip = new PizZip(buffer);
    const file = zip.file("word/document.xml");
    if (!file) return null;
    const xml = file.asText();
    const runs = xml.match(/<w:t[^>]*>[\s\S]*?<\/w:t>/g) || [];
    const text = runs
      .map((r) => r.replace(/<[^>]+>/g, ""))
      .join("")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    return text.length;
  } catch (e) {
    return null;
  }
}

const EXCLUDED_DOC_CATEGORIES = new Set([
  "dropped",
  "facture",
  "email_body",
  "email_attachment",
]);

/**
 * Calcule les prestations facturables NON archivées d'un dossier (helper
 * partagé par compute-bilan et invoice/sync) : RDV (durée × tarif) +
 * documents (temps de frappe estimé × tarif, .docx lu dans le stockage).
 */
async function computeBilanData(dossier, userId) {
  const user = await User.findById(userId).select("hourlyRate vatRate").lean();
  const hourlyRate = Number(user && user.hourlyRate) || 0;
  const vatRate = Number(user && user.vatRate) || 0;

    // Prestations déjà facturées DÉFINITIVEMENT (dans une facture archivée)
    // + date de la dernière facture archivée : on ne re-facture pas l'ancien.
    const factures = Array.isArray(dossier.factures) ? dossier.factures : [];
    const archived = factures.filter((f) => f.status === "archived");
    const billedIds = new Set(
      archived.flatMap((f) => (f.billedItems || []).map((i) => String(i.id)))
    );
    let lastArchivedDate = null;
    archived.forEach((f) => {
      const d = f.archivedDate || f.dateCreation;
      if (d && (!lastArchivedDate || new Date(d) > lastArchivedDate)) {
        lastArchivedDate = new Date(d);
      }
    });
    const isAfter = (d) => !lastArchivedDate || new Date(d) > lastArchivedDate;

    // ── Événements (RDV) : durée × tarif horaire ──
    const events = await AgendaEvent.find({ dossier: dossier._id }).lean();
    const eventLines = events
      .filter((e) => (e.type === "event" || !e.type))
      .filter((e) => !billedIds.has(String(e._id)))
      .filter((e) => e.startDate && isAfter(e.startDate))
      .map((e) => {
        const hours =
          e.endDate && e.startDate
            ? Math.max(0, (new Date(e.endDate) - new Date(e.startDate)) / 3600000)
            : 0;
        const total_ht = Math.round(hours * hourlyRate * 100) / 100;
        return {
          id: String(e._id),
          type: "event",
          description: e.title || "Événement",
          date_prestation: e.startDate,
          hours: Math.round(hours * 100) / 100,
          total_ht,
          auto_ht: total_ht,
        };
      });

    // ── Documents : temps de frappe estimé (caractères ÷ 200 c/min) × tarif ──
    const storage = getFileStorage();
    const docs = (dossier.dossier && dossier.dossier.documents ? dossier.dossier.documents : [])
      .filter((d) => !EXCLUDED_DOC_CATEGORIES.has(d.categorie))
      .filter((d) => !billedIds.has(String(d._id)))
      .filter((d) => d.dateCreation && isAfter(d.dateCreation));

    const docLines = [];
    for (const d of docs) {
      let charCount = null;
      let note = null;
      try {
        if (/\.docx?$/i.test(d.nomDocument || "")) {
          const key = docxStorageKey(d._id);
          if (await storage.exists(key)) {
            charCount = countDocxChars(await storage.read(key));
          } else {
            note = "fichier-absent";
          }
        } else {
          note = "type-non-facturable";
        }
      } catch (err) {
        charCount = null;
        note = "lecture-impossible";
      }
      let total_ht = 0;
      if (typeof charCount === "number" && charCount > 0) {
        const hours = charCount / 200 / 60;
        total_ht = Math.round(hours * hourlyRate * 100) / 100;
      }
      docLines.push({
        id: String(d._id),
        type: "document",
        description: (d.nomDocument || "Document").replace(/\.(docx?|pdf|rtf)$/i, ""),
        date_prestation: d.dateCreation,
        charCount,
        note,
        total_ht,
        auto_ht: total_ht,
      });
    }

    return { hourlyRate, vatRate, events: eventLines, documents: docLines };
}

/**
 * @route POST /api/folder/dossier/:dossierId/invoice/compute-bilan
 * @desc  Calcule (serveur) les prestations facturables non archivées.
 *        Remplace le calcul socket/Electron. Lignes en HT.
 */
router.post(
  "/dossier/:dossierId/invoice/compute-bilan",
  auth,
  asyncHandler(async (req, res) => {
    const { dossierId } = req.params;
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;
    const dossier = await Dossier.findById(dossierId);
    if (!dossier) return res.status(404).json({ message: "Dossier non trouvé." });
    res.json(await computeBilanData(dossier, req.user));
  })
);

/**
 * @route POST /api/folder/dossier/:dossierId/invoice/sync
 * @desc  SYNCHRONISE la facture active avec le contenu réel du dossier :
 *        recalcule les lignes (RDV + documents), PRÉSERVE les prix modifiés à
 *        la main sur les lignes déjà facturées (même id), retire les lignes
 *        dont la source a disparu, met à jour le total, crée la facture si
 *        besoin. Appelée automatiquement à l'ouverture de l'onglet Facturation
 *        et par le sous-onglet « Factures ».
 */
router.post(
  "/dossier/:dossierId/invoice/sync",
  auth,
  asyncHandler(async (req, res) => {
    const { dossierId } = req.params;
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    const dossier = await Dossier.findById(dossierId);
    if (!dossier) return res.status(404).json({ message: "Dossier non trouvé." });

    const { vatRate, events, documents } = await computeBilanData(dossier, req.user);
    const computed = [...events, ...documents];

    if (!Array.isArray(dossier.factures)) dossier.factures = [];
    const invoice = dossier.factures.find((f) => f.status !== "archived") || null;

    // Index des lignes existantes : on préserve leur prix (modifs manuelles).
    const existing = new Map(
      ((invoice && invoice.billedItems) || []).map((i) => [String(i.id), i])
    );

    const items = computed.map((l) => ({
      id: l.id,
      type: l.type,
      description: l.description,
      date_prestation: l.date_prestation || new Date(),
      total_ht: existing.has(l.id) ? existing.get(l.id).total_ht : l.total_ht,
    }));

    const sumHT = items.reduce((s, i) => s + (Number(i.total_ht) || 0), 0);
    const totalTTC = Math.round(sumHT * (1 + vatRate / 100) * 100) / 100;

    if (!invoice) {
      if (items.length === 0 || totalTTC <= 0) {
        // Rien à facturer et pas de facture : ne rien créer.
        return res.json({ dossier, synced: false });
      }
      dossier.factures.push({
        _id: require("crypto").randomUUID(),
        nomDocument: `Facture ${dossier.reference || ""}.docx`.replace("  ", " "),
        totalTTC,
        dateCreation: new Date(),
        status: "pending",
        payments: [],
        billedItems: items,
      });
    } else {
      invoice.billedItems = items;
      invoice.totalTTC = totalTTC;
      // Statut recalculé vs paiements (une facture soldée s'archive ; une
      // facture ré-augmentée au-dessus des paiements redevient en cours).
      const totalPaid = (invoice.payments || []).reduce((s, p) => s + p.amount, 0);
      const epsilon = 0.005;
      if (totalTTC > 0 && totalPaid >= totalTTC - epsilon) {
        invoice.status = "archived";
        if (!invoice.archivedDate) invoice.archivedDate = new Date();
      } else if (invoice.status !== "pending") {
        invoice.status = "pending";
        invoice.archivedDate = undefined;
      }
    }

    dossier.markModified("factures");
    const updated = await dossier.save();
    res.json({ dossier: updated, synced: true });
  })
);

/**
 * @route PUT /api/folder/dossier/:dossierId/invoice/:invoiceId/payments
 * @desc  Remplace tout l'historique des paiements (ajout/modif/suppression en
 *        une fois). Recalcule le statut (soldée → archivée).
 */
router.put(
  "/dossier/:dossierId/invoice/:invoiceId/payments",
  auth,
  asyncHandler(async (req, res) => {
    const { dossierId, invoiceId } = req.params;
    const { payments } = req.body;
    if (!Array.isArray(payments)) {
      return res.status(400).json({ message: "Le champ 'payments' doit être une liste." });
    }
    if (!(await ensureDossierOwnership(req, res, dossierId))) return;

    const dossier = await Dossier.findById(dossierId);
    if (!dossier) return res.status(404).json({ message: "Dossier non trouvé." });
    const invoice = dossier.factures.id(invoiceId);
    if (!invoice) return res.status(404).json({ message: "Facture non trouvée." });

    const clean = [];
    for (const p of payments) {
      const amount = parseFloat(p && p.amount);
      if (!isFinite(amount) || amount <= 0) continue;
      clean.push({
        amount: Math.round(amount * 100) / 100,
        date: p.date ? new Date(p.date) : new Date(),
        note: typeof p.note === "string" ? p.note.slice(0, 300) : "",
      });
    }
    invoice.payments = clean;

    const totalPaid = clean.reduce((s, p) => s + p.amount, 0);
    const epsilon = 0.005;
    if (totalPaid >= invoice.totalTTC - epsilon) {
      invoice.status = "archived";
      if (!invoice.archivedDate) invoice.archivedDate = new Date();
    } else if (invoice.status !== "pending") {
      // Repasse en cours si on retire un paiement qui la soldait.
      invoice.status = "pending";
      invoice.archivedDate = undefined;
    }

    dossier.markModified("factures");
    await dossier.save();
    res.json(dossier);
  })
);

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