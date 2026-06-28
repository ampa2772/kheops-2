// server/middlewares/folder-middleWare.js

const mongoose = require('mongoose');
const TypeContact = require('../models/Folder/TypeContact');
const Contact     = require('../models/Folder/Contact');


// Middleware to validate MongoDB ObjectId
const validateObjectIdParam = (idName) => (req, res, next) => {
  const id = req.params[idName] || req.body[idName];
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'ID invalide' });
  }
  next();
};

// Middleware to validate TypeContact data
const validateTypeContactData = (req, res, next) => {
  const { masculin } = req.body;
  if (!masculin) {
    return res.status(400).send('Le champ Masculin au moins doit être rempli.');
  }
  next();
};

// Middleware to check if TypeContact already exists
const checkTypeContactExists = async (req, res, next) => {
  const { masculin } = req.body;
  const existingTypeContact = await TypeContact.findOne({ masculin });
  if (existingTypeContact) {
    return res.status(400).send('Ce type de contact existe déjà.');
  }
  next();
};

// Middleware to validate Contact data — Désactivé : aucun champ requis
const validateContactData = (req, res, next) => {
  next();
};

// Middleware to check if Contact already exists
const checkContactExists = async (req, res, next) => {
  const { contact } = req.body;
  const existingContact = await Contact.findOne({
    nom: contact.nom,
    email: contact.email,
    dateNaissance: contact.dateNaissance
  });
  if (existingContact) {
    return res.status(400).json({ msg: 'Un contact avec le même nom, email et date de naissance existe déjà' });
  }
  next();
};

// Middleware to validate ContactPM data — Désactivé : aucun champ requis
const validateContactPMData = (req, res, next) => {
  next();
};

// Middleware to validate ContactPMPublique data — Désactivé : aucun champ requis
const validateContactPMPubliqueData = (req, res, next) => {
  next();
};

// Middleware to handle async errors
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  validateObjectIdParam,
  validateTypeContactData,
  checkTypeContactExists,
  validateContactData,
  checkContactExists,
  asyncHandler,
  validateContactPMData,
  validateContactPMPubliqueData
};

