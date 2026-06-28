// Kheops_2/server/routes/folder/folderStats.js
//
// Agregation statistique des dossiers de l'utilisateur courant pour
// alimenter la page Graphiques.
//
// Une seule route GET /api/folder/stats?from=&to= retourne en un appel :
//   - byType            : repartition par type_dossier
//   - byStatus          : actifs vs clotures (deduit des factures payees)
//   - createdByMonth    : nombre de dossiers crees par mois sur la periode
//   - topByRevenue      : top 10 dossiers par CA encaisse
//   - billingStatuses   : nb factures pending / paid / archived
//   - revenueByMonth    : CA encaisse par mois (paiements)
//   - issuedByMonth     : facturation emise par mois (date de facture)
//   - totals            : totaux agreges (CA, factures, dossiers, etc.)
//
// Filtre par UserDossier pour ne retourner que les dossiers du user courant.

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const auth = require('../../middlewares/middleware-auth');
const { asyncHandler } = require('../../middlewares/folder-middleWare');

const Dossier = require('../../models/Folder/Dossier');
const UserDossier = require('../../models/Folder/modelsLiaisons/UserDossier');

// ============================================================
// Helpers
// ============================================================
function monthKey(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function arrondi(n) {
  return Math.round((n || 0) * 100) / 100;
}

function normalizeType(raw) {
  if (!raw) return 'Non classe';
  const s = String(raw).trim();
  if (!s) return 'Non classe';
  // Capitalise la premiere lettre, garde le reste tel quel.
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================
// GET /api/folder/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
// ============================================================
router.get(
  '/stats',
  auth,
  asyncHandler(async (req, res) => {
    const userId = req.user;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'ID utilisateur invalide.' });
    }

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const fromValid = from && !isNaN(from.getTime());
    const toValid = to && !isNaN(to.getTime());

    // -------- Liste des dossiers du user --------
    const links = await UserDossier.find({ user: userId }).select('dossier').lean();
    const dossierIds = links.map((l) => l.dossier);
    if (dossierIds.length === 0) {
      return res.json(emptyPayload(from, to));
    }

    const dossiers = await Dossier.find({ _id: { $in: dossierIds } })
      .select('reference dateCreation _lastUpdated dossier factures')
      .lean();

    // ------------------------------------------------------------
    // Agregations
    // ------------------------------------------------------------
    const byType = {};                        // type -> count
    const createdByMonth = {};                // 'YYYY-MM' -> count
    const billingStatuses = { pending: 0, paid: 0, archived: 0 };
    const revenueByMonth = {};                // 'YYYY-MM' -> total encaisse
    const issuedByMonth = {};                 // 'YYYY-MM' -> total facture
    const revenueByDossier = {};              // dossierId -> total encaisse
    const issuedByDossier = {};               // dossierId -> total facture

    let totalCA = 0;
    let totalIssued = 0;
    let totalFactures = 0;
    let totalPayments = 0;
    let activeCount = 0;
    let closedCount = 0;
    let unbilledCount = 0;

    // Pour le top, on conserve un index nom/reference par dossierId.
    const dossierMeta = {};

    for (const d of dossiers) {
      const did = String(d._id);
      const dossierContent = d.dossier || {};
      const details = dossierContent.dossier || {};
      const type = normalizeType(details.type_dossier);
      const dateCreation = d.dateCreation || details.date_Creation_Dossier;

      dossierMeta[did] = {
        reference: d.reference,
        nom: details.nom || d.reference || 'Dossier',
        type,
      };

      // Filtre periode sur la date de creation (pour byType, createdByMonth)
      const inPeriode =
        (!fromValid || (dateCreation && new Date(dateCreation) >= from)) &&
        (!toValid || (dateCreation && new Date(dateCreation) <= to));

      if (inPeriode) {
        byType[type] = (byType[type] || 0) + 1;
        const key = monthKey(dateCreation);
        if (key) createdByMonth[key] = (createdByMonth[key] || 0) + 1;
      }

      // Statuts (sur tous les dossiers du user, pas filtre periode)
      const factures = d.factures || [];
      let dossierHasUnpaid = false;
      let dossierHasFacture = false;

      for (const f of factures) {
        dossierHasFacture = true;
        totalFactures += 1;
        const ttc = Number(f.totalTTC) || 0;
        const status = f.status || 'pending';
        billingStatuses[status] = (billingStatuses[status] || 0) + 1;
        if (status === 'pending') dossierHasUnpaid = true;

        // Issued (par date de creation de la facture)
        const dateFacture = f.dateCreation ? new Date(f.dateCreation) : null;
        if (dateFacture && !isNaN(dateFacture.getTime())) {
          const inPer =
            (!fromValid || dateFacture >= from) &&
            (!toValid || dateFacture <= to);
          if (inPer) {
            totalIssued += ttc;
            issuedByDossier[did] = (issuedByDossier[did] || 0) + ttc;
            const k = monthKey(dateFacture);
            if (k) issuedByMonth[k] = (issuedByMonth[k] || 0) + ttc;
          }
        }

        // Revenue (par date de paiement) — agrege uniquement les paiements.
        for (const p of (f.payments || [])) {
          const datePaie = p.date ? new Date(p.date) : null;
          if (!datePaie || isNaN(datePaie.getTime())) continue;
          if (fromValid && datePaie < from) continue;
          if (toValid && datePaie > to) continue;
          const montant = Number(p.amount) || 0;
          totalCA += montant;
          totalPayments += 1;
          revenueByDossier[did] = (revenueByDossier[did] || 0) + montant;
          const k = monthKey(datePaie);
          if (k) revenueByMonth[k] = (revenueByMonth[k] || 0) + montant;
        }
      }

      // Statut deduit du dossier :
      //  - "actif"   : au moins une facture impayee
      //  - "cloture" : toutes les factures payees ou archivees
      //  - "non factures" : aucune facture emise
      if (!dossierHasFacture) {
        unbilledCount += 1;
      } else if (dossierHasUnpaid) {
        activeCount += 1;
      } else {
        closedCount += 1;
      }
    }

    // ------------------------------------------------------------
    // Top par CA (10 plus gros)
    // ------------------------------------------------------------
    const topByRevenue = Object.entries(revenueByDossier)
      .map(([did, total]) => ({
        dossierId: did,
        reference: dossierMeta[did]?.reference || '?',
        nom: dossierMeta[did]?.nom || '(dossier supprime)',
        type: dossierMeta[did]?.type || 'Non classe',
        total: arrondi(total),
        issued: arrondi(issuedByDossier[did] || 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // ------------------------------------------------------------
    // Reponse
    // ------------------------------------------------------------
    res.json({
      periode: { from: fromValid ? from : null, to: toValid ? to : null },
      totals: {
        nbDossiers: dossiers.length,
        actifs: activeCount,
        clotures: closedCount,
        nonFactures: unbilledCount,
        totalCA: arrondi(totalCA),
        totalIssued: arrondi(totalIssued),
        totalFactures,
        totalPayments,
      },
      byType: Object.entries(byType).map(([name, value]) => ({ name, value })),
      byStatus: [
        { name: 'Actifs', value: activeCount, key: 'active' },
        { name: 'Clotures', value: closedCount, key: 'closed' },
        { name: 'Non factures', value: unbilledCount, key: 'unbilled' },
      ],
      createdByMonth: Object.entries(createdByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count })),
      revenueByMonth: Object.entries(revenueByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, total]) => ({ month, total: arrondi(total) })),
      issuedByMonth: Object.entries(issuedByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, total]) => ({ month, total: arrondi(total) })),
      topByRevenue,
      billingStatuses: [
        { name: 'En attente', value: billingStatuses.pending || 0, key: 'pending' },
        { name: 'Payees', value: billingStatuses.paid || 0, key: 'paid' },
        { name: 'Archivees', value: billingStatuses.archived || 0, key: 'archived' },
      ],
    });
  })
);

function emptyPayload(from, to) {
  return {
    periode: { from: from || null, to: to || null },
    totals: {
      nbDossiers: 0, actifs: 0, clotures: 0, nonFactures: 0,
      totalCA: 0, totalIssued: 0, totalFactures: 0, totalPayments: 0,
    },
    byType: [],
    byStatus: [
      { name: 'Actifs', value: 0, key: 'active' },
      { name: 'Clotures', value: 0, key: 'closed' },
      { name: 'Non factures', value: 0, key: 'unbilled' },
    ],
    createdByMonth: [],
    revenueByMonth: [],
    issuedByMonth: [],
    topByRevenue: [],
    billingStatuses: [
      { name: 'En attente', value: 0, key: 'pending' },
      { name: 'Payees', value: 0, key: 'paid' },
      { name: 'Archivees', value: 0, key: 'archived' },
    ],
  };
}

module.exports = router;
