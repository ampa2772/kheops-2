// Kheops_2/server/routes/presence.js
//
// Routes "presence en ligne" pour la modale Utilisateurs connectes (header).
// S'appuie sur les sockets actifs declares via `presence:set-office-user`
// dans chatSocketHandler.

const express = require('express');
const router = express.Router();

const auth = require('../middlewares/middleware-auth');
const { asyncHandler } = require('../middlewares/folder-middleWare');

const UserOfficeUser = require('../models/App_Users/modelsLiaisons/UserOfficeUser');
const { getConnectedOfficeUserIds } = require('../services/chatSocketHandler');

function getOwnerUserId(req) {
  return req.user ? String(req.user) : null;
}

// GET /api/presence/connected
// Renvoie la liste des OfficeUsers du cabinet du user courant avec un flag
// `online` (true si au moins un socket a declare cet OfficeUser comme actif).
router.get('/connected', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const links = await UserOfficeUser.find({ user: ownerUserId })
    .populate('officeUser')
    .lean();
  const connectedSet = getConnectedOfficeUserIds();

  const officeUsers = links
    .map((l) => l.officeUser)
    .filter((ou) => ou && ou._id)
    .map((ou) => ({
      _id: String(ou._id),
      prenomOfficeUser: ou.prenomOfficeUser || '',
      nomOfficeUser: ou.nomOfficeUser || '',
      roleOfficeUser: ou.roleOfficeUser || '',
      genre: ou.genre || '',
      mainOfficeUser: !!ou.mainOfficeUser,
      isAvocat: !!ou.isAvocat,
      online: connectedSet.has(String(ou._id)),
    }));

  res.json({
    officeUsers,
    connectedCount: officeUsers.filter((u) => u.online).length,
    totalCount: officeUsers.length,
  });
}));

module.exports = router;
