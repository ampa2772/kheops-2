// Kheops_2/server/routes/cabinet.js
//
// Routes REST du module Cabinet (depenses + bilan + recurrences + import CSV).
// Toutes JWT-protegees, scope par ownerUserId (req.user).
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const auth = require('../middlewares/middleware-auth');
const { asyncHandler } = require('../middlewares/folder-middleWare');
const { ensureDossierOwnership } = require('../utils/ownershipHelpers');
const audit = require('../utils/auditLogger');

const CabinetExpense = require('../models/Cabinet/CabinetExpense');
const CabinetRecurringExpense = require('../models/Cabinet/CabinetRecurringExpense');

const constants = require('../services/cabinetConstants');
const cabinetService = require('../services/cabinetService');

// ============================================================
// Helpers internes
// ============================================================
function getOwnerUserId(req) {
  return req.user ? String(req.user) : null;
}
function jsonValidationErr(res, msg) {
  return res.status(400).json({ message: msg });
}

// ============================================================
// GET /api/cabinet/constants
// ============================================================
router.get('/constants', auth, (req, res) => {
  res.json({
    categoriesDepenses: constants.CATEGORIES_DEPENSES,
    modesPaiement: constants.MODES_PAIEMENT,
    frequences: constants.FREQUENCES,
    tauxTVA: constants.TAUX_TVA,
  });
});

// ============================================================
// === DEPENSES ===============================================
// ============================================================

// GET /api/cabinet/expenses?from=&to=&categorie=&dossierId=
router.get('/expenses', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const filter = { ownerUserId };
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }
  if (req.query.categorie) filter.categorie = req.query.categorie;
  if (req.query.dossierId && mongoose.Types.ObjectId.isValid(req.query.dossierId)) {
    filter.dossierId = req.query.dossierId;
  }

  const expenses = await CabinetExpense.find(filter).sort({ date: -1, createdAt: -1 }).lean();
  res.json({ expenses });
}));

// POST /api/cabinet/expenses
router.post('/expenses', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const body = req.body || {};
  if (!body.libelle) return jsonValidationErr(res, 'Libelle requis.');
  if (!body.categorie) return jsonValidationErr(res, 'Categorie requise.');
  const ht = Number(body.montantHT);
  if (!Number.isFinite(ht) || ht < 0) return jsonValidationErr(res, 'Montant HT invalide.');

  // SECURITE rc37 : si un dossierId est fourni, verifier qu'il appartient
  // au cabinet courant. Sans cela, un user peut creer une depense liee a
  // un dossier d'un autre cabinet (pollution metadata).
  if (body.dossierId && mongoose.Types.ObjectId.isValid(body.dossierId)) {
    if (!(await ensureDossierOwnership(req, res, body.dossierId))) return;
  }

  const expense = new CabinetExpense({
    ownerUserId,
    date: body.date ? new Date(body.date) : new Date(),
    libelle: body.libelle,
    categorie: body.categorie,
    montantHT: ht,
    tauxTVA: body.tauxTVA != null ? Number(body.tauxTVA) : 20,
    montantTTC: Number(body.montantTTC) || 0,                          // sera recalcule par pre-save
    devise: body.devise || 'EUR',
    modePaiement: body.modePaiement || '',
    fournisseurNom: body.fournisseurNom || '',
    fournisseurSiret: body.fournisseurSiret || '',
    tvaDeductible: body.tvaDeductible !== undefined ? !!body.tvaDeductible
      : (constants.CATEGORIE_BY_CODE[body.categorie]?.tvaDeductibleParDefaut ?? true),
    dossierId: body.dossierId && mongoose.Types.ObjectId.isValid(body.dossierId) ? body.dossierId : null,
    sourceImport: body.sourceImport || 'manuel',
    notes: body.notes || '',
  });

  await expense.save();
  audit.create(req, 'cabinetExpense', expense._id, {
    libelle: expense.libelle,
    categorie: expense.categorie,
    montantTTC: expense.montantTTC,
    dossierId: expense.dossierId ? String(expense.dossierId) : null,
  });
  res.status(201).json({ expense: expense.toObject() });
}));

// GET /api/cabinet/expenses/:id
router.get('/expenses/:id', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return jsonValidationErr(res, 'id invalide.');
  const expense = await CabinetExpense.findOne({ _id: req.params.id, ownerUserId }).lean();
  if (!expense) return res.status(404).json({ message: 'Depense introuvable.' });
  res.json({ expense });
}));

// PATCH /api/cabinet/expenses/:id
router.patch('/expenses/:id', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return jsonValidationErr(res, 'id invalide.');
  const expense = await CabinetExpense.findOne({ _id: req.params.id, ownerUserId });
  if (!expense) return res.status(404).json({ message: 'Depense introuvable.' });

  const body = req.body || {};
  // SECURITE rc37 : si un dossierId est fourni dans le PATCH, verifier ownership.
  if (body.dossierId && mongoose.Types.ObjectId.isValid(body.dossierId)) {
    if (!(await ensureDossierOwnership(req, res, body.dossierId))) return;
  }
  const champs = [
    'date', 'libelle', 'categorie', 'montantHT', 'tauxTVA', 'montantTTC',
    'devise', 'modePaiement', 'fournisseurNom', 'fournisseurSiret',
    'tvaDeductible', 'dossierId', 'notes',
  ];
  for (const champ of champs) {
    if (Object.prototype.hasOwnProperty.call(body, champ)) {
      if (champ === 'date' && body[champ]) expense[champ] = new Date(body[champ]);
      else if (['montantHT', 'tauxTVA', 'montantTTC'].includes(champ)) {
        const n = Number(body[champ]);
        if (Number.isFinite(n)) expense[champ] = n;
      } else if (champ === 'dossierId') {
        expense[champ] = (body[champ] && mongoose.Types.ObjectId.isValid(body[champ])) ? body[champ] : null;
      } else {
        expense[champ] = body[champ];
      }
    }
  }
  await expense.save();
  audit.update(req, 'cabinetExpense', expense._id, {
    fields: Object.keys(body),
  });
  res.json({ expense: expense.toObject() });
}));

// DELETE /api/cabinet/expenses/:id
router.delete('/expenses/:id', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return jsonValidationErr(res, 'id invalide.');
  const result = await CabinetExpense.deleteOne({ _id: req.params.id, ownerUserId });
  if (result.deletedCount > 0) {
    audit.delete(req, 'cabinetExpense', req.params.id);
  }
  res.json({ ok: true });
}));

// ============================================================
// === RECURRENCES ============================================
// ============================================================

// GET /api/cabinet/recurring-expenses
router.get('/recurring-expenses', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const recs = await CabinetRecurringExpense.find({ ownerUserId }).sort({ active: -1, prochaineGenerationLe: 1 }).lean();
  res.json({ recurrences: recs });
}));

// POST /api/cabinet/recurring-expenses
router.post('/recurring-expenses', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const body = req.body || {};
  if (!body.libelle) return jsonValidationErr(res, 'Libelle requis.');
  if (!body.categorie) return jsonValidationErr(res, 'Categorie requise.');
  if (!body.frequence) return jsonValidationErr(res, 'Frequence requise.');
  if (!body.dateDebut) return jsonValidationErr(res, 'Date de debut requise.');

  const ht = Number(body.montantHT);
  if (!Number.isFinite(ht) || ht < 0) return jsonValidationErr(res, 'Montant HT invalide.');

  // SECURITE rc37 : check ownership dossier si fourni
  if (body.dossierId && mongoose.Types.ObjectId.isValid(body.dossierId)) {
    if (!(await ensureDossierOwnership(req, res, body.dossierId))) return;
  }

  const rec = new CabinetRecurringExpense({
    ownerUserId,
    libelle: body.libelle,
    categorie: body.categorie,
    montantHT: ht,
    tauxTVA: body.tauxTVA != null ? Number(body.tauxTVA) : 20,
    montantTTC: Number(body.montantTTC) || 0,
    devise: body.devise || 'EUR',
    modePaiement: body.modePaiement || '',
    fournisseurNom: body.fournisseurNom || '',
    fournisseurSiret: body.fournisseurSiret || '',
    tvaDeductible: body.tvaDeductible !== undefined ? !!body.tvaDeductible
      : (constants.CATEGORIE_BY_CODE[body.categorie]?.tvaDeductibleParDefaut ?? true),
    dossierId: body.dossierId && mongoose.Types.ObjectId.isValid(body.dossierId) ? body.dossierId : null,
    notes: body.notes || '',
    frequence: body.frequence,
    jourMois: body.jourMois ? Number(body.jourMois) : 1,
    dateDebut: new Date(body.dateDebut),
    dateFin: body.dateFin ? new Date(body.dateFin) : null,
    automatique: body.automatique !== false,                            // par defaut true
    active: body.active !== false,
  });

  await rec.save();
  res.status(201).json({ recurrence: rec.toObject() });
}));

// PATCH /api/cabinet/recurring-expenses/:id
router.patch('/recurring-expenses/:id', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return jsonValidationErr(res, 'id invalide.');
  const rec = await CabinetRecurringExpense.findOne({ _id: req.params.id, ownerUserId });
  if (!rec) return res.status(404).json({ message: 'Recurrence introuvable.' });

  const body = req.body || {};
  // SECURITE rc37 : check ownership dossier si fourni
  if (body.dossierId && mongoose.Types.ObjectId.isValid(body.dossierId)) {
    if (!(await ensureDossierOwnership(req, res, body.dossierId))) return;
  }
  const champs = [
    'libelle', 'categorie', 'montantHT', 'tauxTVA', 'montantTTC', 'devise',
    'modePaiement', 'fournisseurNom', 'fournisseurSiret', 'tvaDeductible',
    'dossierId', 'notes', 'frequence', 'jourMois', 'dateDebut', 'dateFin',
    'automatique', 'active',
  ];
  for (const champ of champs) {
    if (Object.prototype.hasOwnProperty.call(body, champ)) {
      if (['dateDebut', 'dateFin'].includes(champ) && body[champ]) rec[champ] = new Date(body[champ]);
      else if (['montantHT', 'tauxTVA', 'montantTTC', 'jourMois'].includes(champ)) {
        const n = Number(body[champ]);
        if (Number.isFinite(n)) rec[champ] = n;
      } else if (champ === 'dossierId') {
        rec[champ] = (body[champ] && mongoose.Types.ObjectId.isValid(body[champ])) ? body[champ] : null;
      } else {
        rec[champ] = body[champ];
      }
    }
  }
  await rec.save();
  res.json({ recurrence: rec.toObject() });
}));

// DELETE /api/cabinet/recurring-expenses/:id
router.delete('/recurring-expenses/:id', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return jsonValidationErr(res, 'id invalide.');
  await CabinetRecurringExpense.deleteOne({ _id: req.params.id, ownerUserId });
  res.json({ ok: true });
}));

// POST /api/cabinet/recurring-expenses/:id/generate
// Genere manuellement une occurrence (que la recurrence soit en mode auto ou manuel).
router.post('/recurring-expenses/:id/generate', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return jsonValidationErr(res, 'id invalide.');
  const rec = await CabinetRecurringExpense.findOne({ _id: req.params.id, ownerUserId });
  if (!rec) return res.status(404).json({ message: 'Recurrence introuvable.' });
  const expense = await cabinetService.genererOccurrence(rec, { dateCible: req.body?.dateCible });
  res.json({ expense: expense ? expense.toObject() : null, recurrence: rec.toObject() });
}));

// POST /api/cabinet/recurring-expenses/sweep
// Sweep les recurrences automatiques dues. Renvoie le nombre de
// CabinetExpense crees.
router.post('/recurring-expenses/sweep', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const result = await cabinetService.sweepAutomatiques(ownerUserId);
  res.json(result);
}));

// ============================================================
// === BILAN ==================================================
// ============================================================

// GET /api/cabinet/bilan?from=&to=
router.get('/bilan', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const bilan = await cabinetService.calculerBilan(ownerUserId, {
    from: req.query.from || null,
    to: req.query.to || null,
  });
  res.json(bilan);
}));

// GET /api/cabinet/profitability?from=&to=
// Rentabilite par dossier
router.get('/profitability', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const result = await cabinetService.calculerRentabiliteDossiers(ownerUserId, {
    from: req.query.from || null,
    to: req.query.to || null,
  });
  res.json({ profitability: result });
}));

// ============================================================
// === IMPORT CSV BANCAIRE ====================================
// ============================================================
// Format attendu (header obligatoire) :
//   date;libelle;debit;credit
// Les credits sont ignores (ils correspondent a des entrees, qui sont
// gerees par la facturation existante).
// Les debits sont importes comme depenses non-classees (categorie 'autre')
// que l'utilisateur peut ensuite ajuster manuellement.
router.post('/csv-import', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const { csvText, categorieParDefaut } = req.body || {};
  if (!csvText || typeof csvText !== 'string') return jsonValidationErr(res, 'csvText requis.');
  const lignes = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lignes.length === 0) return res.json({ imported: 0, ignored: 0, errors: [] });

  const sep = lignes[0].includes(';') ? ';' : ',';
  const header = lignes[0].split(sep).map(s => s.toLowerCase().trim());
  const idxDate = header.findIndex(h => h.includes('date'));
  const idxLibelle = header.findIndex(h => h.includes('libelle') || h.includes('label') || h.includes('description'));
  const idxDebit = header.findIndex(h => h.includes('debit') || h === 'sortie');
  const idxCredit = header.findIndex(h => h.includes('credit') || h === 'entree');
  const idxMontant = header.findIndex(h => h === 'montant' || h === 'amount');

  let imported = 0;
  let ignored = 0;
  const errors = [];

  for (let i = 1; i < lignes.length; i++) {
    const cells = lignes[i].split(sep);
    const date = idxDate >= 0 ? (cells[idxDate] || '').trim() : '';
    const libelle = idxLibelle >= 0 ? (cells[idxLibelle] || '').trim() : `Import bancaire ${i}`;
    const parseNum = (v) => parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.')) || 0;
    let debit = idxDebit >= 0 ? parseNum(cells[idxDebit]) : 0;
    const credit = idxCredit >= 0 ? parseNum(cells[idxCredit]) : 0;
    // Format montant unique avec signe
    if (idxMontant >= 0 && idxDebit < 0 && idxCredit < 0) {
      const m = parseNum(cells[idxMontant]);
      if (m < 0) debit = Math.abs(m);
    }

    // Ignore les credits (ce sont des entrees, pas des sorties)
    if (credit > 0 && debit === 0) { ignored += 1; continue; }
    if (debit <= 0) { ignored += 1; continue; }

    const dt = new Date(date);
    if (isNaN(dt.getTime())) { errors.push({ ligne: i + 1, raison: 'Date invalide' }); continue; }

    try {
      const exp = new CabinetExpense({
        ownerUserId,
        date: dt,
        libelle,
        categorie: categorieParDefaut || 'autre',
        montantHT: Math.round((debit / 1.2) * 100) / 100,                  // TVA 20% par defaut
        tauxTVA: 20,
        montantTTC: debit,
        devise: 'EUR',
        modePaiement: 'prelevement',
        sourceImport: 'csv_banque',
        tvaDeductible: false,                                              // par securite, l'utilisateur ajuste apres import
        notes: 'Import bancaire — ajuster categorie et TVA si necessaire.',
      });
      await exp.save();
      imported += 1;
    } catch (e) {
      errors.push({ ligne: i + 1, raison: e.message });
    }
  }

  res.json({ imported, ignored, errors });
}));

// ============================================================
// === EXPORT (pour comptable) ================================
// ============================================================
// GET /api/cabinet/export?from=&to=
// Renvoie un CSV listant toutes les depenses sur la periode.
router.get('/export', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const filter = { ownerUserId };
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }
  const depenses = await CabinetExpense.find(filter).sort({ date: 1 }).lean();

  const headers = ['Date', 'Libelle', 'Categorie', 'Fournisseur', 'Montant HT', 'TVA', 'Montant TTC', 'TVA deductible', 'Mode paiement', 'Notes'];
  const rows = [headers.join(';')];
  for (const e of depenses) {
    const dt = e.date ? new Date(e.date).toISOString().slice(0, 10) : '';
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(';') || s.includes('\n') ? `"${s}"` : s;
    };
    rows.push([
      dt,
      escape(e.libelle),
      escape(e.categorie),
      escape(e.fournisseurNom || ''),
      String(e.montantHT || 0).replace('.', ','),
      String(e.montantTVA || 0).replace('.', ','),
      String(e.montantTTC || 0).replace('.', ','),
      e.tvaDeductible ? 'Oui' : 'Non',
      escape(e.modePaiement || ''),
      escape(e.notes || ''),
    ].join(';'));
  }

  const csv = '﻿' + rows.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="depenses_cabinet_${(req.query.from || 'debut')}_${(req.query.to || 'fin')}.csv"`);
  res.send(csv);
}));

module.exports = router;
