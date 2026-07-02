// server/routes/cabinetMembers.js
//
// R5b — gestion des membres d'un cabinet (partage multi-identifiants).
// Le PROPRIÉTAIRE du cabinet (Tenant.ownerUserId) invite des utilisateurs
// EXISTANTS par e-mail ; l'invité accepte ; il partage alors l'accès aux
// dossiers/documents/contacts du cabinet (via cabinetAccess + ownershipHelpers).
//
// Toutes les routes sont authentifiées. Aucune donnée sensible renvoyée.

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const auth = require('../middlewares/middleware-auth');
const User = require('../models/App_Users/User');
const Membership = require('../models/Cabinet/Membership');
const { resolveTenantId, getTenant } = require('../services/tenantService');

const ROLES = ['avocat', 'collaborateur', 'secretaire', 'admin'];

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findUserByEmailCI(email) {
  const e = String(email || '').trim();
  if (!e) return null;
  return User.findOne({ email: { $regex: new RegExp(`^${escapeRegex(e)}$`, 'i') } });
}

function sanitizeMembership(m, user) {
  return {
    id: String(m._id),
    userId: m.userId ? String(m.userId) : null,
    email: user ? user.email : undefined,
    firstName: user ? user.firstName : undefined,
    lastName: user ? user.lastName : undefined,
    role: m.role,
    status: m.status,
    invitedBy: m.invitedBy ? String(m.invitedBy) : null,
    createdAt: m.createdAt,
  };
}

async function requireOwner(req) {
  const tenantId = await resolveTenantId(req.user);
  const tenant = await getTenant(tenantId);
  const isOwner = tenant && String(tenant.ownerUserId) === String(req.user);
  return { tenantId, tenant, isOwner };
}

// GET /api/cabinet-members — membres de mon cabinet (propriétaire + invités).
router.get('/', auth, async (req, res) => {
  try {
    const tenantId = await resolveTenantId(req.user);
    const memberships = await Membership.find({ tenantId }).lean();
    const userIds = memberships.map((m) => m.userId).filter(Boolean);
    const users = await User.find({ _id: { $in: userIds } }).select('email firstName lastName').lean();
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const tenant = await getTenant(tenantId);
    return res.json({
      cabinet: tenant ? { id: String(tenant._id), name: tenant.name, ownerUserId: String(tenant.ownerUserId) } : null,
      isOwner: tenant ? String(tenant.ownerUserId) === String(req.user) : false,
      members: memberships.map((m) => sanitizeMembership(m, byId.get(String(m.userId)))),
    });
  } catch (err) {
    console.error('[cabinet-members/list]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/cabinet-members/invite { email, role } — invite un utilisateur existant.
router.post('/invite', auth, async (req, res) => {
  try {
    const { email, role } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Adresse e-mail requise.' });

    const { tenantId, isOwner } = await requireOwner(req);
    if (!isOwner) return res.status(403).json({ error: 'Seul le propriétaire du cabinet peut inviter des membres.' });

    const target = await findUserByEmailCI(email);
    if (!target) {
      return res.status(404).json({
        error: 'Aucun compte Kheops avec cette adresse. La personne doit d\'abord créer son compte.',
      });
    }
    if (String(target._id) === String(req.user)) {
      return res.status(400).json({ error: 'Vous êtes déjà le propriétaire de ce cabinet.' });
    }

    const validRole = ROLES.includes(role) ? role : 'collaborateur';
    const existing = await Membership.findOne({ tenantId, userId: target._id });
    if (existing) {
      existing.role = validRole;
      existing.invitedBy = req.user;
      if (existing.status === 'revoked') existing.status = 'pending';
      await existing.save();
      return res.json({ membership: sanitizeMembership(existing, target) });
    }
    const created = await Membership.create({
      tenantId, userId: target._id, role: validRole, status: 'pending', invitedBy: req.user,
    });
    return res.status(201).json({ membership: sanitizeMembership(created, target) });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(409).json({ error: 'Cette personne est déjà invitée dans ce cabinet.' });
    }
    console.error('[cabinet-members/invite]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/cabinet-members/invitations — invitations en attente ME concernant.
router.get('/invitations', auth, async (req, res) => {
  try {
    const invitations = await Membership.find({ userId: req.user, status: 'pending' }).lean();
    const tenantIds = invitations.map((i) => i.tenantId).filter(Boolean);
    const { getTenant: _gt } = require('../services/tenantService');
    const tenants = await Promise.all(tenantIds.map((t) => _gt(t)));
    const byId = new Map(tenants.filter(Boolean).map((t) => [String(t._id), t]));
    return res.json({
      invitations: invitations.map((i) => ({
        id: String(i._id),
        cabinet: byId.get(String(i.tenantId)) ? byId.get(String(i.tenantId)).name : null,
        role: i.role,
      })),
    });
  } catch (err) {
    console.error('[cabinet-members/invitations]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/cabinet-members/:id/accept — l'invité accepte (consentement explicite).
router.post('/:id/accept', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ error: 'id invalide.' });
    const m = await Membership.findOne({ _id: id, userId: req.user });
    if (!m) return res.status(404).json({ error: 'Invitation introuvable.' });
    m.status = 'active';
    await m.save();
    return res.json({ membership: sanitizeMembership(m, null) });
  } catch (err) {
    console.error('[cabinet-members/accept]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cabinet-members/:id — le propriétaire retire un membre.
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(id))) return res.status(400).json({ error: 'id invalide.' });
    const { tenantId, isOwner } = await requireOwner(req);
    if (!isOwner) return res.status(403).json({ error: 'Seul le propriétaire peut retirer un membre.' });
    const m = await Membership.findOne({ _id: id, tenantId });
    if (!m) return res.status(404).json({ error: 'Membre introuvable.' });
    await m.deleteOne();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[cabinet-members/delete]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
