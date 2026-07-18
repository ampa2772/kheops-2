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
const { emitToUser } = require('../services/chatSocketHandler');
const { sendCabinetInviteEmail } = require('../utils/sendEmail');

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

// Notifie la personne invitee : push temps reel (socket -> toast + rafraichissement
// live du bouton "Accepter") ET e-mail. Best-effort : une erreur ici ne doit
// JAMAIS faire echouer l'invitation deja enregistree en base.
async function notifyInvitee({ target, tenant, inviterId }) {
  const cabinetName = (tenant && tenant.name) || 'votre cabinet';
  let inviterName = '';
  try {
    const inviter = await User.findById(inviterId).select('firstName lastName email').lean();
    if (inviter) inviterName = `${inviter.firstName || ''} ${inviter.lastName || ''}`.trim() || inviter.email || '';
  } catch (_) { /* nom d'invitant non critique */ }

  // 1) Temps reel : atteint la personne si elle est connectee (room user:<id>).
  //    Le role N'est PAS envoye dans le payload (l'invite le decouvre via
  //    GET /invitations apres coup). emitToUser renvoie false si le socket n'est
  //    pas attache ou si l'utilisateur est hors ligne — l'e-mail prend le relais.
  const delivered = emitToUser(String(target._id), 'cabinet:invitation', { cabinet: cabinetName, invitedByName: inviterName });
  if (!delivered) {
    console.log('[cabinet-members/invite] push temps reel non delivre (utilisateur hors ligne) — e-mail pris en charge');
  }

  // 2) E-mail (best-effort) : couvre le cas ou la personne est hors ligne.
  try {
    if (target.email) {
      await sendCabinetInviteEmail(target.email, { inviterName, cabinetName });
      console.log(`[cabinet-members/invite] ✓ E-mail d'invitation envoye a ${target.email}`);
    }
  } catch (e) { console.warn('[cabinet-members/invite] e-mail invitation echoue:', e.message); }
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

    const { tenantId, tenant, isOwner } = await requireOwner(req);
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
    let membership;
    const existing = await Membership.findOne({ tenantId, userId: target._id });
    const prevStatus = existing ? existing.status : null;
    if (existing) {
      existing.role = validRole;
      existing.invitedBy = req.user;
      if (existing.status === 'revoked') existing.status = 'pending';
      await existing.save();
      membership = existing;
    } else {
      membership = await Membership.create({
        tenantId, userId: target._id, role: validRole, status: 'pending', invitedBy: req.user,
      });
    }

    // Anti-spam : on ne (re)notifie QUE pour une invitation reellement nouvelle
    // (creation, ou re-invitation d'un membre precedemment retire). Re-cliquer
    // « Inviter » sur une invitation deja en attente ne renvoie ni e-mail ni push.
    const isNewInvitation = !existing || prevStatus === 'revoked';
    if (isNewInvitation) {
      // Notifie l'invite (temps reel + e-mail) sans bloquer ni faire echouer la reponse.
      notifyInvitee({ target, tenant, inviterId: req.user }).catch(() => {});
    }

    return res.status(existing ? 200 : 201).json({ membership: sanitizeMembership(membership, target) });
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
