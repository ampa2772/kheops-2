// server/utils/ownershipHelpers.js
//
// Helpers centralises de verification d'ownership pour eliminer les IDOR
// cross-cabinet recenses dans l'audit securite (rc37).
//
// Toutes les fonctions :
//   - prennent (req, res, id)
//   - logguent ACCESS_DENIED via securityLogger en cas de refus
//   - ecrivent la reponse 4xx dans `res` si refus (le caller doit faire `return`)
//   - retournent `true` si OK, `false` si refus (= la reponse a deja ete envoyee)
//
// Pattern d'usage dans une route :
//   if (!(await ensureDossierOwnership(req, res, dossierId))) return;
//
// Les logs sont volontairement explicites pour faciliter le debug en cas
// d'incident en prod (ex: un legitimate user qui s'auto-bloque suite a un
// lien UserDossier corrompu).

const mongoose = require('mongoose');
const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
const UserContact = require('../models/Folder/modelsLiaisons/UserContact');
const UserContactPM = require('../models/Folder/modelsLiaisons/UserContactPM');
const UserContactPMPublique = require('../models/Folder/modelsLiaisons/UserContactPMPublique');
const UserOfficeUser = require('../models/App_Users/modelsLiaisons/UserOfficeUser');
const Dossier = require('../models/Folder/Dossier');
const { log: secLog, EVT } = require('./securityLogger');

const TAG = '[OwnershipHelpers]';

/**
 * Verifie que l'utilisateur courant est lie au dossier (UserDossier).
 * @returns true si OK, false si refus (response 4xx deja envoyee).
 */
async function ensureDossierOwnership(req, res, dossierId) {
  if (!dossierId || !mongoose.Types.ObjectId.isValid(String(dossierId))) {
    console.warn(`${TAG} dossierId invalide : ${dossierId} (route ${req.method} ${req.originalUrl})`);
    res.status(400).json({ message: 'dossierId invalide.' });
    return false;
  }
  const userId = req.user;
  if (!userId) {
    res.status(401).json({ message: 'Non authentifie.' });
    return false;
  }
  const link = await UserDossier.findOne({ user: userId, dossier: dossierId }).lean();
  if (!link) {
    console.warn(`${TAG} ACCESS_DENIED dossier ${dossierId} pour user ${userId} (route ${req.method} ${req.originalUrl})`);
    secLog(EVT.ACCESS_DENIED, {
      userId: String(userId),
      resourceType: 'dossier',
      resourceId: String(dossierId),
      reason: 'no-userDossier-link',
    }, req);
    res.status(403).json({ message: "Acces refuse : ce dossier n'appartient pas a votre cabinet." });
    return false;
  }
  return true;
}

/**
 * Verifie que l'utilisateur courant est lie au contact (UserContact / PM / PMPublique).
 * Le contact peut etre dans n'importe laquelle des 3 collections : on cherche dans toutes.
 * @returns true si OK, false si refus.
 */
async function ensureContactOwnership(req, res, contactId) {
  if (!contactId || !mongoose.Types.ObjectId.isValid(String(contactId))) {
    console.warn(`${TAG} contactId invalide : ${contactId} (route ${req.method} ${req.originalUrl})`);
    res.status(400).json({ message: 'contactId invalide.' });
    return false;
  }
  const userId = req.user;
  if (!userId) {
    res.status(401).json({ message: 'Non authentifie.' });
    return false;
  }
  const [physLink, pmLink, pmPubLink] = await Promise.all([
    UserContact.findOne({ user: userId, contact: contactId }).lean(),
    UserContactPM.findOne({ user: userId, contactPM: contactId }).lean(),
    UserContactPMPublique.findOne({ user: userId, contactPMPublique: contactId }).lean(),
  ]);
  if (!physLink && !pmLink && !pmPubLink) {
    console.warn(`${TAG} ACCESS_DENIED contact ${contactId} pour user ${userId} (route ${req.method} ${req.originalUrl})`);
    secLog(EVT.ACCESS_DENIED, {
      userId: String(userId),
      resourceType: 'contact',
      resourceId: String(contactId),
      reason: 'no-userContact-link',
    }, req);
    res.status(403).json({ message: "Acces refuse : ce contact n'appartient pas a votre cabinet." });
    return false;
  }
  return true;
}

/**
 * Verifie que l'utilisateur courant est lie a l'OfficeUser (via UserOfficeUser).
 * @returns true si OK, false si refus.
 */
async function ensureOfficeUserOwnership(req, res, officeUserId) {
  if (!officeUserId || !mongoose.Types.ObjectId.isValid(String(officeUserId))) {
    console.warn(`${TAG} officeUserId invalide : ${officeUserId} (route ${req.method} ${req.originalUrl})`);
    res.status(400).json({ message: 'officeUserId invalide.' });
    return false;
  }
  const userId = req.user;
  if (!userId) {
    res.status(401).json({ message: 'Non authentifie.' });
    return false;
  }
  const link = await UserOfficeUser.findOne({ user: userId, officeUser: officeUserId }).lean();
  if (!link) {
    console.warn(`${TAG} ACCESS_DENIED officeUser ${officeUserId} pour user ${userId} (route ${req.method} ${req.originalUrl})`);
    secLog(EVT.ACCESS_DENIED, {
      userId: String(userId),
      resourceType: 'officeUser',
      resourceId: String(officeUserId),
      reason: 'no-userOfficeUser-link',
    }, req);
    res.status(403).json({ message: "Acces refuse : cet utilisateur n'appartient pas a votre cabinet." });
    return false;
  }
  return true;
}

/**
 * Verifie qu'un docId (ObjectId d'un Document embarque dans Dossier.dossier.documents)
 * appartient a un dossier lie a l'utilisateur courant.
 * Coute : 1 query UserDossier + 1 query Dossier.findOne avec index sur 'dossier.documents._id'.
 * @returns { ok: boolean, dossierId?: string }
 */
async function ensureDocOwnership(req, res, docId) {
  if (!docId || !mongoose.Types.ObjectId.isValid(String(docId))) {
    console.warn(`${TAG} docId invalide : ${docId} (route ${req.method} ${req.originalUrl})`);
    res.status(400).json({ message: 'docId invalide.' });
    return { ok: false };
  }
  const userId = req.user;
  if (!userId) {
    res.status(401).json({ message: 'Non authentifie.' });
    return { ok: false };
  }
  const userDossierLinks = await UserDossier.find({ user: userId }).select('dossier').lean();
  const dossierIds = userDossierLinks.map((l) => l.dossier);
  if (dossierIds.length === 0) {
    console.warn(`${TAG} ACCESS_DENIED doc ${docId} : user ${userId} n'a aucun dossier`);
    secLog(EVT.ACCESS_DENIED, {
      userId: String(userId),
      resourceType: 'document',
      resourceId: String(docId),
      reason: 'no-dossier-for-user',
    }, req);
    res.status(403).json({ message: 'Acces refuse.' });
    return { ok: false };
  }
  const dossier = await Dossier.findOne({
    _id: { $in: dossierIds },
    'dossier.documents._id': new mongoose.Types.ObjectId(String(docId)),
  }).select('_id').lean();
  if (!dossier) {
    console.warn(`${TAG} ACCESS_DENIED doc ${docId} : pas dans les dossiers de user ${userId}`);
    secLog(EVT.ACCESS_DENIED, {
      userId: String(userId),
      resourceType: 'document',
      resourceId: String(docId),
      reason: 'doc-not-in-user-dossiers',
    }, req);
    res.status(403).json({ message: 'Acces refuse : ce document n\'appartient pas a votre cabinet.' });
    return { ok: false };
  }
  return { ok: true, dossierId: String(dossier._id) };
}

module.exports = {
  ensureDossierOwnership,
  ensureContactOwnership,
  ensureOfficeUserOwnership,
  ensureDocOwnership,
};
