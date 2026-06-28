// Kheops_2/server/routes/agendaRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

// Importer les modèles
const AgendaEvent = require('../models/AgendaEvents/AgendaEvent');
const DossierEventLink = require('../models/AgendaEvents/DossierEventLink');
const Dossier = require('../models/Folder/Dossier');

// Middleware d'authentification
const auth = require('../middlewares/middleware-auth');
const { asyncHandler } = require('../middlewares/folder-middleWare');
const { ensureDossierOwnership } = require('../utils/ownershipHelpers');
const audit = require('../utils/auditLogger');

// Rate-limit pour la migration one-shot de categorisation des evenements.
// Operation cher (lecture + N updates Mongo) qu'aucun usage normal ne demande
// plus d'une fois par utilisateur ; un attaquant authentifie qui spammerait
// l'endpoint pourrait faire un mini-DoS sur la DB. 5 req/h/IP suffit.
const migrateCategoriesLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Trop de requetes, reessayez dans une heure.' },
});

/**
 * @route   GET /api/agenda/tasks
 * @desc    Récupérer les 25 tâches les plus urgentes pour l'utilisateur
 * @access  Privé
 */
router.get('/tasks', auth, asyncHandler(async (req, res) => {
  const userId = req.user;
  const now = new Date();
  const tasks = await AgendaEvent.find({
    createdBy: userId,
    type: 'task',
    startDate: { $gte: now }
  })
  .sort({ startDate: 'asc' })
  .limit(25)
  .populate('dossier');

  res.status(200).json(tasks);
}));


/**
 * @route   GET /api/agenda/dossier/:dossierId
 * @desc    Récupérer tous les événements liés à un dossier spécifique
 * @access  Privé
 */
router.get('/dossier/:dossierId', auth, asyncHandler(async (req, res) => {
  const { dossierId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(dossierId)) {
    return res.status(400).json({ message: "L'ID du dossier fourni est invalide." });
  }

  // SECURITE rc37 (M-10) : check UserDossier — sans ce filtre, un user
  // pouvait lister les events/audiences/RDV d'un dossier d'un autre cabinet.
  if (!(await ensureDossierOwnership(req, res, dossierId))) return;

  const events = await AgendaEvent.find({ dossier: dossierId }).populate('dossier').sort({ startDate: 'asc' });
  res.status(200).json(events);
}));

/**
 * @route   GET /api/agenda/events
 * @desc    Récupérer tous les événements d'agenda pour l'utilisateur authentifié
 * @access  Privé
 */
router.get('/events', auth, asyncHandler(async (req, res) => {
  const userId = req.user;
  const events = await AgendaEvent.find({ createdBy: userId }).populate('dossier').sort({ startDate: 'asc' });
  res.status(200).json(events);
}));

/**
 * @route   POST /api/agenda/events
 * @desc    Créer un nouvel événement d'agenda, potentiellement lié à un dossier
 * @access  Privé
 */
const validateBody = require('../middlewares/validateBody');
const { createEventSchema, updateEventSchema } = require('../validation/agendaSchemas');

router.post('/events', auth, validateBody(createEventSchema), asyncHandler(async (req, res) => {
  const { title, startDate, endDate, description, dossierId, type, deadline } = req.body;
  const userId = req.user;

  if (!title) {
    return res.status(400).json({ message: "Le titre est requis." });
  }

  let eventStartDate, eventEndDate;

  if (type === 'task') {
    if (!deadline) {
      return res.status(400).json({ message: "La date d'échéance est requise pour une tâche." });
    }
    eventStartDate = new Date(deadline);
    eventEndDate = new Date(deadline);
  } else {
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Les dates de début et de fin sont requises pour un événement." });
    }
    eventStartDate = startDate;
    eventEndDate = endDate;
  }

  // Vérifier si le dossierId est valide et si le dossier existe (si dossierId est fourni)
  if (dossierId) {
    if (!mongoose.Types.ObjectId.isValid(dossierId)) {
      return res.status(400).json({ message: "L'ID du dossier fourni est invalide." });
    }
    const dossierExists = await Dossier.findById(dossierId);
    if (!dossierExists) {
      return res.status(404).json({ message: "Le dossier spécifié pour la liaison n'a pas été trouvé." });
    }
  }

  const newAgendaEvent = new AgendaEvent({
    title,
    startDate: eventStartDate,
    endDate: eventEndDate,
    description: description || '',
    type: type || 'event',
    createdBy: userId,
    dossier: dossierId || null,
  });

  let savedEvent = await newAgendaEvent.save();

  if (savedEvent.dossier) {
    savedEvent = await savedEvent.populate('dossier');
  }

  audit.create(req, 'agendaEvent', savedEvent._id, {
    type: savedEvent.type,
    title: savedEvent.title,
    dossierId: savedEvent.dossier?._id ? String(savedEvent.dossier._id) : null,
  });

  res.status(201).json(savedEvent);
}));

/**
 * @route   PUT /api/agenda/events/:eventId
 * @desc    Mettre à jour un événement d'agenda
 * @access  Privé
 */
router.put('/events/:eventId', auth, validateBody(updateEventSchema), asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { title, startDate, endDate, description, dossierId, type, deadline } = req.body;
  const userId = req.user;

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({ message: "L'ID de l'événement est invalide." });
  }

  const eventToUpdate = await AgendaEvent.findById(eventId);
  if (!eventToUpdate) {
    return res.status(404).json({ message: "Événement non trouvé." });
  }

  if (eventToUpdate.createdBy.toString() !== userId) {
    return res.status(403).json({ message: "Vous n'êtes pas autorisé à modifier cet événement." });
  }

  // Mise à jour des champs
  eventToUpdate.title = title || eventToUpdate.title;
  eventToUpdate.description = description !== undefined ? description : eventToUpdate.description;
  eventToUpdate.type = type || eventToUpdate.type;

  if (type === 'task') {
    if (deadline) {
      eventToUpdate.startDate = new Date(deadline);
      eventToUpdate.endDate = new Date(deadline);
    }
  } else {
    eventToUpdate.startDate = startDate || eventToUpdate.startDate;
    eventToUpdate.endDate = endDate || eventToUpdate.endDate;
  }

  // Gérer la liaison au dossier (permet de lier ou de délier)
  if (dossierId === null) {
    eventToUpdate.dossier = null;
  } else if (dossierId && mongoose.Types.ObjectId.isValid(dossierId)) {
    eventToUpdate.dossier = dossierId;
  }

  const updatedEvent = await eventToUpdate.save();
  await updatedEvent.populate('dossier');

  audit.update(req, 'agendaEvent', updatedEvent._id, {
    type: updatedEvent.type,
    title: updatedEvent.title,
  });

  res.status(200).json(updatedEvent);
}));

/**
 * @route   DELETE /api/agenda/events/:eventId
 * @desc    Supprimer un événement d'agenda et ses liaisons
 * @access  Privé
 */
router.delete('/events/:eventId', auth, asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const userId = req.user;

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({ message: "L'ID de l'événement fourni est invalide." });
  }

  const eventToDelete = await AgendaEvent.findById(eventId);

  if (!eventToDelete) {
    return res.status(404).json({ message: "Événement non trouvé." });
  }

  if (eventToDelete.createdBy && eventToDelete.createdBy.toString() !== userId) {
    return res.status(403).json({ message: "Vous n'êtes pas autorisé à supprimer cet événement." });
  }

  await AgendaEvent.findByIdAndDelete(eventId);

  const deleteLinkResult = await DossierEventLink.deleteMany({ agendaEvent: eventId });
  console.log(`Événement ${eventId} supprimé. Liaisons supprimées: ${deleteLinkResult.deletedCount}`);

  audit.delete(req, 'agendaEvent', eventId, {
    type: eventToDelete.type,
    title: eventToDelete.title,
    cascadeLinks: deleteLinkResult.deletedCount,
  });

  res.status(200).json({ message: "Événement et ses liaisons supprimés avec succès.", eventId });
}));

/**
 * @route   POST /api/agenda/migrate-categories-by-title
 * @desc    Migration one-shot : pour les événements de l'utilisateur courant,
 *          déduit la catégorie en se basant sur le titre. Utile après la
 *          correction du bug de couleurs incohérentes dans la modale de
 *          création (les anciens événements peuvent être mal catégorisés).
 *
 *          Heuristique appliquée (insensible à la casse) :
 *           - "audience"               → category 'audience'
 *           - "rdv" ou "rendez-vous"   → category 'rdv'
 *           - "téléphone", "appel", "réunion" → category 'reunion'
 *           - "personnel"              → category 'personnel'
 *           - sinon                    → catégorie inchangée
 *
 *          Le payload optionnel { dryRun: true } permet de PRÉVISUALISER les
 *          changements sans les appliquer (utile pour vérifier).
 * @access  Privé
 */
router.post('/migrate-categories-by-title', migrateCategoriesLimiter, auth, asyncHandler(async (req, res) => {
  const userId = req.user;
  const dryRun = !!(req.body && req.body.dryRun);

  // Helper : déduit la catégorie cible à partir du titre
  const inferCategory = (title) => {
    if (!title) return null;
    const t = String(title).toLowerCase();
    if (t.includes('audience')) return 'audience';
    if (t.includes('rdv') || t.includes('rendez-vous') || t.includes('rendezvous')) return 'rdv';
    if (t.includes('téléphone') || t.includes('telephone') || t.includes('appel') || t.includes('réunion') || t.includes('reunion')) return 'reunion';
    if (t.includes('personnel') || t.includes('perso')) return 'personnel';
    return null;
  };

  // On ne touche PAS aux tâches (event.type === 'task') — elles sont gérées séparément
  const events = await AgendaEvent.find({
    createdBy: userId,
    $or: [{ type: { $ne: 'task' } }, { type: { $exists: false } }],
  }).select('_id title category type').lean();

  const changes = [];
  for (const ev of events) {
    const inferred = inferCategory(ev.title);
    if (inferred && inferred !== ev.category) {
      changes.push({
        eventId: String(ev._id),
        title: ev.title,
        oldCategory: ev.category || null,
        newCategory: inferred,
      });
    }
  }

  if (dryRun) {
    return res.json({
      dryRun: true,
      total: events.length,
      changes,
      changesCount: changes.length,
    });
  }

  // Appliquer les changements
  for (const c of changes) {
    await AgendaEvent.updateOne(
      { _id: c.eventId, createdBy: userId },
      { $set: { category: c.newCategory } }
    );
  }

  res.json({
    dryRun: false,
    total: events.length,
    changes,
    changesCount: changes.length,
    applied: true,
  });
}));

module.exports = router;
