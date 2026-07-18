const express = require('express');
// Utilise @googleapis/gmail (léger, ~735 Ko) au lieu de googleapis complet (123 Mo)
const { gmail: gmailApi } = require('@googleapis/gmail');
const { OAuth2Client: GmailOAuth2Client } = require('googleapis-common');
require('dotenv').config();
const { Buffer } = require('buffer');
const path = require('path');
const fs = require('fs');
const mime = require('mime-types');
const multer = require('multer');
const { buildFileStorage } = require('../services/fileStorage');
const MailComposer = require('nodemailer/lib/mail-composer');
const auth = require('../middlewares/middleware-auth');
const User = require('../models/App_Users/User');
const Dossier = require('../models/Folder/Dossier');
const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');

// --- IMPORTS POUR LA COLLECTE EXHAUSTIVE DES CONTACTS ---
const Contact = require('../models/Folder/Contact');
const ContactPM = require('../models/Folder/ContactPM');
const ContactPMPublique = require('../models/Folder/ContactPMPublique');
const UserContact = require('../models/Folder/modelsLiaisons/UserContact');
const UserContactPM = require('../models/Folder/modelsLiaisons/UserContactPM');
const UserContactPMPublique = require('../models/Folder/modelsLiaisons/UserContactPMPublique');

const RepresentantLegal = require('../models/Folder/RepresentantLegalPM');
const ContactDirect = require('../models/Folder/ContactDirect');
const ContactRepresentantLegal = require('../models/Folder/modelsLiaisons/ContactRepresentantLegal');
const ContactContactDirect = require('../models/Folder/modelsLiaisons/ContactContactDirect');

// --- MODIFICATION : Import depuis le fichier de config centralisé ---
// On supprime la configuration locale d'OAuth2 pour utiliser celle partagée
const { oauth2Client } = require('../config/googleConfig');

function createRequestGmailAuth(refreshToken) {
  const client = new GmailOAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL,
  );
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

// --- Helper Microsoft Graph (Outlook) — pour les utilisateurs connectés via Microsoft ---
const msGraphMail = require('../utils/microsoftGraphMail');

// SECURITE rc37 (M-06) : decryption transparente des refresh tokens.
// Les tokens existants en clair (legacy) sont retournes tels quels par
// decryptIfNeeded, et seront chiffres lors d'une prochaine ecriture.
const { decryptIfNeeded } = require('../utils/tokenCrypto');
const audit = require('../utils/auditLogger');
const { getAccessibleUserIds } = require('../services/cabinetAccess');
const { escapeHtml } = require('../utils/escapeHtml');
const {
  eligibleNotificationEmails,
  isEligibleNotificationSender,
} = require('../services/mail/mailNotificationEligibility');

const router = express.Router();

// --- Chemin racine des fichiers clients (configurable via variable d'environnement) ---
// Fonction dynamique pour lire le chemin à chaque appel (mis à jour par main.js lors du changement de compte)
function getFilesClientsRoot() {
  return process.env.FILES_CLIENTS_PATH || path.join("C:\\", "Files_Clients");
}

/*
──────────────────────────────────────────────────────────────
  1.  CONFIGURATION OAUTH2 GOOGLE (SUPPRIMÉE ICI, IMPORTÉE)
────────────────────────────────────────────────────────────── */
// oauth2Client est maintenant importé de ../config/googleConfig.js

/*
──────────────────────────────────────────────────────────────
  2.  MULTER — AVEC LIMITES DE SÉCURITÉ
────────────────────────────────────────────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 Mo max (limite Gmail)
    files: 1,                    // 1 fichier à la fois
  },
});

/*
──────────────────────────────────────────────────────────────
  3.  MIDDLEWARE : getAuthenticatedGmailClient (INCHANGÉ)
────────────────────────────────────────────────────────────── */
const getAuthenticatedGmailClient = async (req, res, next) => {
  try {
    const user = await User.findById(req.user);
    if (!user || !user.googleRefreshToken) {
      throw new Error('AUTH_REQUIRED');
    }
    // SECURITE rc37 (M-06) : decryption transparente avant utilisation OAuth.
    const refreshTokenPlain = decryptIfNeeded(user.googleRefreshToken);
    if (!refreshTokenPlain) {
      console.warn(`[mails] refresh token Google indechiffrable pour user ${req.user} (clef rotee ?). Forcer re-OAuth.`);
      throw new Error('AUTH_REFRESH_FAILED');
    }
    const requestAuth = createRequestGmailAuth(refreshTokenPlain);
    const { credentials } = await requestAuth.refreshAccessToken();
    requestAuth.setCredentials({
      ...credentials,
      refresh_token: credentials.refresh_token || refreshTokenPlain,
    });
    req.gmail = gmailApi({ version: 'v1', auth: requestAuth });
    next();
  } catch (error) {
    if (error.response?.data?.error === 'invalid_grant') {
      try {
        await User.findByIdAndUpdate(req.user, { $set: { googleRefreshToken: null } });
      } catch (dbError) {
        console.error(`Erreur lors de la suppression du refresh token invalide pour l'utilisateur ${req.user}:`, dbError);
      }
      next(new Error('AUTH_REFRESH_FAILED'));
    } else {
      next(new Error('AUTH_REQUIRED'));
    }
  }
};

/*
──────────────────────────────────────────────────────────────
  3 bis.  MIDDLEWARE SOURCE-AWARE : getAuthenticatedMailContext
────────────────────────────────────────────────────────────── */
// Détecte la source d'auth de l'utilisateur :
//  - Si microsoftRefreshToken existe → req.mailSource = 'microsoft', valide le token
//  - Sinon si googleRefreshToken existe → req.mailSource = 'google', monte req.gmail
//  - Sinon → AUTH_REQUIRED
// Microsoft est prioritaire si les deux sont présents (l'utilisateur s'est
// reconnecté plus récemment via Microsoft).
const getAuthenticatedMailContext = async (req, res, next) => {
  try {
    const user = await User.findById(req.user);
    if (!user) throw new Error('AUTH_REQUIRED');

    if (user.microsoftRefreshToken) {
      try {
        // Valide le refresh token Microsoft en récupérant un access token
        await msGraphMail.getAccessTokenForUser(req.user);
        req.mailSource = 'microsoft';
        return next();
      } catch (msErr) {
        // Fix 2026-07-04 : QUEL QUE SOIT l'échec Microsoft (refresh KO, réseau,
        // token indéchiffrable...), si un refresh Google existe on tente Google.
        // L'ancien filtre (message === 'AUTH_REFRESH_FAILED' uniquement) 401-isait
        // un utilisateur Google valide dès qu'un token Microsoft cassé traînait.
        if (user.googleRefreshToken) {
          console.warn(`[mails] (mailContext) echec Microsoft (${msErr && msErr.message}), repli sur Google user=${req.user}`);
          // Continue vers le bloc Google ci-dessous
        } else {
          throw msErr;
        }
      }
    }

    if (user.googleRefreshToken) {
      const refreshTokenPlain = decryptIfNeeded(user.googleRefreshToken);
      if (!refreshTokenPlain) {
        console.warn(`[mails] (mailContext) refresh Google indechiffrable user=${req.user}`);
        throw new Error('AUTH_REFRESH_FAILED');
      }
      const requestAuth = createRequestGmailAuth(refreshTokenPlain);
      const { credentials } = await requestAuth.refreshAccessToken();
      requestAuth.setCredentials({
        ...credentials,
        refresh_token: credentials.refresh_token || refreshTokenPlain,
      });
      req.gmail = gmailApi({ version: 'v1', auth: requestAuth });
      req.mailSource = 'google';
      return next();
    }

    throw new Error('AUTH_REQUIRED');
  } catch (error) {
    if (error.response?.data?.error === 'invalid_grant') {
      try {
        const u = await User.findById(req.user);
        if (u && u.googleRefreshToken) await User.findByIdAndUpdate(req.user, { $set: { googleRefreshToken: null } });
      } catch (_) {}
      return next(new Error('AUTH_REFRESH_FAILED'));
    }
    if (error.message === 'AUTH_REQUIRED' || error.message === 'AUTH_REFRESH_FAILED') {
      return next(error);
    }
    return next(new Error('AUTH_REQUIRED'));
  }
};

/*
──────────────────────────────────────────────────────────────
  4.  MIDDLEWARE D'ERREURS SPÉCIFIQUE GMAIL (INCHANGÉ)
────────────────────────────────────────────────────────────── */
const handleGmailAuthErrors = (err, req, res, next) => {
  let status = 500, message = 'Erreur interne Gmail.';
  if (err.message === 'AUTH_REQUIRED') { status = 401; message = 'Authentification Google ou Microsoft requise ou expirée.'; }
  else if (err.message === 'AUTH_REFRESH_FAILED') { status = 401; message = 'Impossible de rafraîchir la session.'; }
  else if (err.response) { status = err.response.status || 500; message = err.response.data?.error?.message || `Erreur API mail (${status}).`; }
  if (res.headersSent) return next(err);
  res.status(status).json({ message });
};

/*
──────────────────────────────────────────────────────────────
  5. HELPERS (INCHANGÉS)
────────────────────────────────────────────────────────────── */
const extractAttachments = (parts = []) => {
  let attachments = [];
  for (const p of parts) {
    if (p.filename && p.body?.attachmentId) attachments.push({ filename: p.filename, mimeType: p.mimeType || 'application/octet-stream', size: p.body.size || 0, attachmentId: p.body.attachmentId });
    if (p.parts?.length) attachments = attachments.concat(extractAttachments(p.parts));
  }
  return attachments;
};
const getBody = (payload) => {
  let bodyData = '', mimeType = payload.mimeType || '';
  function find(parts = []) { let html = '', text = ''; for (const part of parts) { const dispHeader = (part.headers || []).find(h => h.name.toLowerCase() === 'content-disposition'); if (dispHeader && dispHeader.value.toLowerCase().includes('attachment')) continue; if (part.body?.data) { const partMimeType = part.mimeType || ''; const decodedData = Buffer.from(part.body.data, 'base64').toString('utf8'); if (partMimeType === 'text/html') { html = decodedData; if (mimeType.includes('multipart/alternative')) break; } else if (partMimeType === 'text/plain' && !html) text = decodedData; } if (part.parts?.length && !(html && mimeType.includes('multipart/alternative'))) { const sub = find(part.parts); if (sub.html) html = sub.html; if (sub.text && !html) text = sub.text; if (html && mimeType.includes('multipart/alternative')) break; } } return { html, text }; }
  if (payload.body?.data && !payload.parts?.length) return Buffer.from(payload.body.data, 'base64').toString('utf8');
  if (payload.parts?.length) { const bodies = find(payload.parts); bodyData = bodies.html || bodies.text; }
  return bodyData || '';
};
const fetchMessageMetadata = async (gmail, messages) => (await Promise.all((messages || []).map(async (m) => { if (!m?.id) return null; try { const { data } = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From', 'Subject'] }); if (!data?.payload?.headers) return null; const headers = data.payload.headers; const fromHdr = headers.find(h => h.name.toLowerCase() === 'from'); const subjHdr = headers.find(h => h.name.toLowerCase() === 'subject'); return { id: m.id, from: fromHdr?.value || 'N/A', subject: subjHdr?.value || '(Sans objet)', snippet: data.snippet || '' }; } catch (e) { if (e.message === 'AUTH_REQUIRED' || e.message === 'AUTH_REFRESH_FAILED' || [401, 403].includes(e.response?.status)) throw e; return null; } }))).filter(Boolean);

/*
──────────────────────────────────────────────────────────────
  6. HELPER POUR LA NOTIFICATION (INCHANGÉ)
────────────────────────────────────────────────────────────── */
async function getAllUserEmailsAndNamesFromDB(userId) {
  const emailMap = new Map();

  const addEmailAndInfo = (email, contactName, dossierName, dossierId, fullContact, source, role = null) => {
    if (email && typeof email === 'string' && email.includes('@')) {
      const lowerCaseEmail = email.toLowerCase();
      if (!emailMap.has(lowerCaseEmail)) {
        emailMap.set(lowerCaseEmail, { contexts: [], fullContact: null });
      }
      const emailEntry = emailMap.get(lowerCaseEmail);
      if (!emailEntry.fullContact && fullContact) {
        emailEntry.fullContact = fullContact;
      }
      const contextPayload = {
        contactName: contactName || 'Contact non nommé',
        dossierName: dossierName,
        dossierId: dossierId,
        source: source,
        role: role
      };

      const existingContext = emailEntry.contexts.find(ctx =>
        (ctx.dossierId ? String(ctx.dossierId) === String(dossierId) : !dossierId) &&
        ctx.source === source &&
        ctx.role === role
      );

      if (!existingContext) {
        emailEntry.contexts.push(contextPayload);
      }
    }
  };

  const formatName = (contact) => {
    if (!contact) return '';
    return contact.raisonSociale || contact.denomination || `${contact.prenoms || ''} ${contact.nom || ''}`.trim();
  };

  const [userContacts, userContactsPM, userContactsPMPublique] = await Promise.all([
    UserContact.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('contact').lean(),
    UserContactPM.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('contactPM').lean(),
    UserContactPMPublique.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('contactPMPublique').lean(),
  ]);

  const allContactIdsPhysique = userContacts.map(l => l.contact).filter(Boolean);
  const allContactIdsPM = userContactsPM.map(l => l.contactPM).filter(Boolean);
  const allContactIdsPMPublique = userContactsPMPublique.map(l => l.contactPMPublique).filter(Boolean);

  const [allPhysique, allPM, allPMPublique] = await Promise.all([
    Contact.find({ _id: { $in: allContactIdsPhysique } }).lean(),
    ContactPM.find({ _id: { $in: allContactIdsPM } }).lean(),
    ContactPMPublique.find({ _id: { $in: allContactIdsPMPublique } }).lean(),
  ]);

  for (const contact of allPhysique) {
    addEmailAndInfo(contact.email, formatName(contact), null, null, contact, 'Contact Global');
  }

  for (const contact of allPMPublique) {
    addEmailAndInfo(contact.email, formatName(contact), null, null, contact, 'Contact Global', 'Organisation');
    if (contact.contactEmail) {
      const contactName = `${contact.contactPrenom || ''} ${contact.contactNom || ''}`.trim();
      addEmailAndInfo(contact.contactEmail, formatName(contact), null, null, contact, 'Contact Global', `Contact (${contactName})`);
    }
  }

  for (const pm of allPM) {
    addEmailAndInfo(pm.emailEntreprise, formatName(pm), null, null, pm, 'Contact Global', 'Société');
    const rlLink = await ContactRepresentantLegal.findOne({ contactPM: pm._id }).lean();
    if (rlLink) {
      const rl = await RepresentantLegal.findById(rlLink.representantLegal).lean();
      if (rl && rl.representantLegalEmail) {
        const rlName = `${rl.representantLegalPrenom || ''} ${rl.representantLegalNom || ''}`.trim();
        addEmailAndInfo(rl.representantLegalEmail, formatName(pm), null, null, pm, 'Contact Global', `Rep. Légal${rlName ? ` (${rlName})` : ''}`);
      }
    }
    const cdLink = await ContactContactDirect.findOne({ contactPM: pm._id }).lean();
    if (cdLink) {
      const cd = await ContactDirect.findById(cdLink.contactDirect).lean();
      if (cd && cd.contactDirectEmail) {
        const cdName = `${cd.contactDirectPrenom || ''} ${cd.contactDirectNom || ''}`.trim();
        addEmailAndInfo(cd.contactDirectEmail, formatName(pm), null, null, pm, 'Contact Global', `Contact Direct${cdName ? ` (${cdName})` : ''}`);
      }
    }
  }

  const userDossierLinks = await UserDossier.find({ user: { $in: await getAccessibleUserIds(userId) } }).select('dossier').lean();
  if (userDossierLinks.length > 0) {
    const dossierIds = userDossierLinks.map(link => link.dossier);
    const dossiers = await Dossier.find({ _id: { $in: dossierIds } }).lean();

    for (const dossier of dossiers) {
      const d = dossier.dossier;
      if (!d || !d.dossier) continue;
      const currentDossierName = d.dossier.nom;
      const currentDossierId = dossier._id.toString();

      const allEntitiesInDossier = [
        ...(d.contactsDuDossier || []),
        ...(d.avocatsResponsables || []),
        ...(d.parties?.pour || []).flatMap(p => [p.partieData, ...(p.contacts || []), ...(p.avocats || [])]),
        ...(d.parties?.contre || []).flatMap(p => [p.partieData, ...(p.contacts || []), ...(p.avocats || [])]),
      ].filter(Boolean);

      for (const entity of allEntitiesInDossier) {
        const entityName = entity.nomPartie || formatName(entity);
        addEmailAndInfo(entity.email || entity.emailEntreprise, entityName, currentDossierName, currentDossierId, entity, 'Contexte Dossier');

        if (entity.raisonSociale) { // PM Privée
          if (entity.interlocuteurEmail && entity.interlocuteurEmail !== entity.emailEntreprise) {
            const intName = `${entity.interlocuteurPrenom || ''} ${entity.interlocuteurNom || ''}`.trim();
            addEmailAndInfo(entity.interlocuteurEmail, entityName, currentDossierName, currentDossierId, entity, 'Contexte Dossier', `Interlocuteur${intName ? ` (${intName})` : ''}`);
          }
          const pmId = entity._id;
          if (pmId) {
            const rlLink = await ContactRepresentantLegal.findOne({ contactPM: pmId }).lean();
            if (rlLink) {
              const rl = await RepresentantLegal.findById(rlLink.representantLegal).lean();
              if (rl && rl.representantLegalEmail) {
                const rlName = `${rl.representantLegalPrenom || ''} ${rl.representantLegalNom || ''}`.trim();
                addEmailAndInfo(rl.representantLegalEmail, entityName, currentDossierName, currentDossierId, entity, 'Contexte Dossier', `Rep. Légal${rlName ? ` (${rlName})` : ''}`);
              }
            }
            const cdLink = await ContactContactDirect.findOne({ contactPM: pmId }).lean();
            if (cdLink) {
              const cd = await ContactDirect.findById(cdLink.contactDirect).lean();
              if (cd && cd.contactDirectEmail) {
                const cdName = `${cd.contactDirectPrenom || ''} ${cd.contactDirectNom || ''}`.trim();
                addEmailAndInfo(cd.contactDirectEmail, entityName, currentDossierName, currentDossierId, entity, 'Contexte Dossier', `Contact Direct${cdName ? ` (${cdName})` : ''}`);
              }
            }
          }
        }

        if (entity.denomination) { // PM Publique
          if (entity.contactEmail) {
            const contactName = `${entity.contactPrenom || ''} ${entity.contactNom || ''}`.trim();
            addEmailAndInfo(entity.contactEmail, entityName, currentDossierName, currentDossierId, entity, 'Contexte Dossier', `Contact (${contactName})`);
          }
        }
      }
    }
  }
  return emailMap;
}

// ========================================================================
// === NOUVEL HELPER : findContactNameByEmail (INCHANGÉ)
// ========================================================================
function findContactNameByEmail(dossierObject, emailToFind) {
  if (!dossierObject || !emailToFind) return null;
  const emailToFindLower = emailToFind.toLowerCase().trim();
  const allParties = [
    ...(dossierObject.dossier?.parties?.pour || []),
    ...(dossierObject.dossier?.parties?.contre || []),
  ];
  const allEntities = [...allParties, ...(dossierObject.dossier?.contactsDuDossier || [])];
  for (const entity of allEntities) {
    if (entity.partieData) {
      if (entity.partieData.email?.toLowerCase().trim() === emailToFindLower) {
        const name = entity.nomPartie || `${entity.partieData.prenoms || ''} ${entity.partieData.nom || ''}`;
        return name.trim();
      }
    }
    if (entity.contacts) {
      for (const contact of entity.contacts) {
        if (contact.email?.toLowerCase().trim() === emailToFindLower) {
          const name = `${contact.prenoms || ''} ${contact.nom || ''}`;
          return name.trim();
        }
      }
    }
    if (entity.avocats) {
      for (const avocat of entity.avocats) {
        if (avocat.email?.toLowerCase().trim() === emailToFindLower) {
          const name = `Maître ${avocat.prenomOfficeUser || ''} ${avocat.nomOfficeUser || ''}`;
          return name.trim();
        }
      }
    }
    if (entity.email && entity.email.toLowerCase().trim() === emailToFindLower) {
      const name = `${entity.prenoms || ''} ${entity.nom || ''}`.trim() || entity.raisonSociale || entity.denomination;
      return name.trim();
    }
  }
  return null;
}

function extractSenderEmail(fromHeader) {
  if (!fromHeader) return null;
  const match = fromHeader.match(/<(.+?)>/);
  return match ? match[1].toLowerCase() : fromHeader.toLowerCase();
}

/*
──────────────────────────────────────────────────────────────
  7. ROUTES API GMAIL (INCHANGÉES)
────────────────────────────────────────────────────────────── */

const requireGoogleAuth = [auth, getAuthenticatedGmailClient];
// Nouveau middleware combiné qui supporte Google ET Microsoft selon l'utilisateur
const requireMailAuth = [auth, getAuthenticatedMailContext];

router.get('/notifications/count', requireMailAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur Kheops non trouvé.' });
    }
    const currentUserEmail = user.email.toLowerCase();
    const kheopsEmailsMap = await getAllUserEmailsAndNamesFromDB(req.user);
    const eligibleEmails = eligibleNotificationEmails(kheopsEmailsMap, currentUserEmail);
    if (eligibleEmails.length === 0) {
      return res.json({ notificationCount: 0 });
    }

    if (req.mailSource === 'microsoft') {
      // Côté Microsoft Graph : pas de filtre $search natif scalable. On échantillonne
      // les 50 derniers messages et on compte les expéditeurs présents en BDD Kheops.
      const lowerSet = new Set(eligibleEmails);
      const count = await msGraphMail.countFromContacts(req.user, lowerSet);
      return res.json({ notificationCount: count });
    }

    // Google (existant)
    const { gmail } = req;
    const fromQuery = `from:(${eligibleEmails.join(' OR ')})`;
    const gmailQuery = `(in:inbox OR in:spam) ${fromQuery}`;
    const { data } = await gmail.users.messages.list({ userId: 'me', q: gmailQuery });
    res.json({ notificationCount: data.resultSizeEstimate || 0 });
  } catch (e) {
    next(e);
  }
});

router.post('/check-email-presence', requireMailAuth, async (req, res, next) => {
  try {
    const { emailId, candidateDossierIds } = req.body;

    if (!emailId || !Array.isArray(candidateDossierIds) || candidateDossierIds.length === 0) {
      return res.status(400).json({ message: "emailId et un tableau de candidateDossierIds sont requis." });
    }

    let fromHeader, dateHeader;
    if (req.mailSource === 'microsoft') {
      const m = await msGraphMail.getMessageMetadata(req.user, emailId);
      fromHeader = msGraphMail._formatFrom(m.from);
      dateHeader = m.receivedDateTime;
    } else {
      const { gmail } = req;
      const { data: messageData } = await gmail.users.messages.get({
        userId: 'me',
        id: emailId,
        format: 'metadata',
        metadataHeaders: ['From', 'Date']
      });
      fromHeader = messageData.payload.headers.find(h => h.name.toLowerCase() === 'from')?.value || '';
      dateHeader = messageData.payload.headers.find(h => h.name.toLowerCase() === 'date')?.value;
    }

    const senderEmailMatch = fromHeader.match(/<(.+?)>/);
    const senderEmail = senderEmailMatch ? senderEmailMatch[1] : fromHeader;

    if (!dateHeader) {
      return res.status(400).json({ message: "Impossible de déterminer la date de l'email." });
    }

    const date = new Date(dateHeader).toLocaleDateString('fr-CA');

    // SECURITE rc38 (A1) : ne considérer QUE les dossiers du cabinet courant.
    // Sans ce filtre, un user pouvait sonder des dossierIds arbitraires (oracle
    // d'existence + noms de sous-dossiers) appartenant à d'autres cabinets.
    const accessibleDossierLinks = await UserDossier
      .find({ user: { $in: await getAccessibleUserIds(req.user) } })
      .select('dossier').lean();
    const accessibleDossierSet = new Set(accessibleDossierLinks.map((l) => String(l.dossier)));
    const scopedCandidateIds = candidateDossierIds.filter((id) => accessibleDossierSet.has(String(id)));
    if (scopedCandidateIds.length === 0) {
      return res.json({ dossiersContainingEmail: [] });
    }

    const candidateDossiers = await Dossier.find({ _id: { $in: scopedCandidateIds } });
    if (candidateDossiers.length === 0) {
      return res.json({ dossiersContainingEmail: [] });
    }

    const dossiersContainingEmail = [];

    for (const dossier of candidateDossiers) {
      let subfolderBaseName = findContactNameByEmail(dossier, senderEmail);
      if (!subfolderBaseName) {
        subfolderBaseName = fromHeader.split('<')[0].trim().replace(/[^a-zA-Z0-9\s-]/g, '');
        if (!subfolderBaseName) subfolderBaseName = "Expediteur inconnu";
      }

      const expectedSubfolderName = `${date} - ${subfolderBaseName.trim()}`;

      const subfolderExists = (dossier.subfolders || []).some(sf => sf.name === expectedSubfolderName);

      if (subfolderExists) {
        dossiersContainingEmail.push(dossier._id.toString());
      }
    }

    res.json({ dossiersContainingEmail });

  } catch (error) {
    console.error("Erreur dans /check-email-presence:", error);
    next(error);
  }
});

// Helper commun pour construire un objet "notification" à partir d'un message
// (source-agnostique : reçoit les champs déjà extraits)
function _buildNotification({ id, fromHeader, senderEmail, subject, snippet, date, attachmentCount, kheopsContactsMap }) {
  const contactData = kheopsContactsMap.get(senderEmail);
  const primaryContext = contactData.contexts[0];
  const contactInfoArray = contactData.contexts.filter(c => c.dossierId !== null);
  const uniqueContactNames = [...new Set(contactData.contexts.map(c => c.contactName))];
  return {
    id,
    kheopsContactName: primaryContext.contactName,
    kheopsContactNames: uniqueContactNames,
    allContactContexts: contactData.contexts,
    emailRole: primaryContext.role,
    kheopsMatchingDossiers: contactInfoArray,
    from: fromHeader,
    subject: subject || '(Sans objet)',
    snippet: snippet || '',
    date: date ? new Date(date).toISOString() : new Date().toISOString(),
    attachmentCount: attachmentCount || 0,
    senderContact: contactInfoArray.length === 0 ? contactData.fullContact : null,
  };
}

router.get('/notifications/list', requireMailAuth, async (req, res, next) => {
  try {
    const { pageToken } = req.query;
    const user = await User.findById(req.user);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur Kheops non trouvé.' });
    }
    const currentUserEmail = user.email.toLowerCase();
    const kheopsContactsMap = await getAllUserEmailsAndNamesFromDB(req.user);
    if (kheopsContactsMap.size === 0) return res.json({ notifications: [], nextPageToken: null });

    if (req.mailSource === 'microsoft') {
      // On récupère un échantillon de messages récents et on filtre par sender
      const { messages, nextPageToken } = await msGraphMail.listInboxRaw(req.user, { pageToken, maxResults: 50 });
      const notifications = [];
      for (const m of messages) {
        const addr = m.from?.emailAddress?.address?.toLowerCase();
        if (!isEligibleNotificationSender(addr, currentUserEmail, kheopsContactsMap)) continue;
        notifications.push(_buildNotification({
          id: m.id,
          fromHeader: msGraphMail._formatFrom(m.from),
          senderEmail: addr,
          subject: m.subject,
          snippet: m.bodyPreview,
          date: m.receivedDateTime,
          attachmentCount: m.hasAttachments ? 1 : 0, // approximatif (on ne fetch pas les détails ici)
          kheopsContactsMap,
        }));
      }
      return res.json({ notifications, nextPageToken });
    }

    // Google (existant)
    const { gmail } = req;
    const fromQuery = `from:(${Array.from(kheopsContactsMap.keys()).join(' OR ')})`;
    const gmailQuery = `(in:inbox OR in:spam) ${fromQuery}`;

    const listResponse = await gmail.users.messages.list({ userId: 'me', q: gmailQuery, maxResults: 20, pageToken: pageToken || undefined });
    if (!listResponse.data.messages || listResponse.data.messages.length === 0) return res.json({ notifications: [], nextPageToken: null });

    const detailPromises = listResponse.data.messages.map(message => gmail.users.messages.get({ userId: 'me', id: message.id, format: 'full' }).catch(e => null));
    const detailResponses = (await Promise.all(detailPromises)).filter(Boolean);

    const notifications = [];
    for (const response of detailResponses) {
      const { data } = response;
      const fromHeader = data.payload.headers.find(h => h.name.toLowerCase() === 'from')?.value;
      const senderEmail = extractSenderEmail(fromHeader);
      if (isEligibleNotificationSender(senderEmail, currentUserEmail, kheopsContactsMap)) {
        const subjectHeader = data.payload.headers.find(h => h.name.toLowerCase() === 'subject')?.value;
        const dateHeader = data.payload.headers.find(h => h.name.toLowerCase() === 'date')?.value;
        notifications.push(_buildNotification({
          id: data.id,
          fromHeader,
          senderEmail,
          subject: subjectHeader,
          snippet: data.snippet,
          date: dateHeader,
          attachmentCount: extractAttachments(data.payload.parts || []).length,
          kheopsContactsMap,
        }));
      }
    }
    res.json({ notifications, nextPageToken: listResponse.data.nextPageToken || null });
  } catch (e) { next(e); }
});

router.get('/emails', requireMailAuth, async (req, res, next) => {
  try {
    if (req.mailSource === 'microsoft') {
      const result = await msGraphMail.listInbox(req.user, { pageToken: req.query.pageToken });
      return res.json(result);
    }
    const { gmail } = req;
    const { data } = await gmail.users.messages.list({ userId: 'me', maxResults: 20, q: 'in:inbox OR in:spam', pageToken: req.query.pageToken || undefined });
    const meta = await fetchMessageMetadata(gmail, data.messages || []);
    res.json({ emails: meta, nextPageToken: data.nextPageToken || null });
  } catch (e) { next(e); }
});

router.get('/email/:id', requireMailAuth, async (req, res, next) => {
  try {
    if (req.mailSource === 'microsoft') {
      const r = await msGraphMail.getMessage(req.user, req.params.id);
      return res.json({ id: r.id, from: r.from, subject: r.subject, body: r.body, attachments: r.attachments });
    }
    const { gmail } = req;
    const { data } = await gmail.users.messages.get({ userId: 'me', id: req.params.id, format: 'full' });
    if (!data.payload) return res.status(404).json({ message: 'Contenu du message introuvable.' });
    const from = (data.payload.headers.find(h => h.name.toLowerCase() === 'from'))?.value || 'N/A';
    const subject = (data.payload.headers.find(h => h.name.toLowerCase() === 'subject'))?.value || '(Sans objet)';
    res.json({ id: data.id, from, subject, body: getBody(data.payload), attachments: extractAttachments(data.payload.parts) });
  } catch (e) { next(e); }
});

router.get('/email/:messageId/attachment/:attachmentId', requireMailAuth, async (req, res, next) => {
  try {
    const { messageId, attachmentId } = req.params;
    let fileData, defaultName, mimeType;

    if (req.mailSource === 'microsoft') {
      const att = await msGraphMail.getAttachmentContent(req.user, messageId, attachmentId);
      fileData = att.contentBuffer;
      defaultName = att.filename;
      mimeType = req.query.mimeType || att.mimeType || 'application/octet-stream';
    } else {
      const { gmail } = req;
      const { data } = await gmail.users.messages.attachments.get({ userId: 'me', messageId, id: attachmentId });
      if (!data?.data) return res.status(404).json({ message: 'Données de la pièce jointe introuvables.' });
      fileData = Buffer.from(data.data, 'base64url');
      defaultName = `attachment_${attachmentId}`;
      mimeType = req.query.mimeType || 'application/octet-stream';
    }

    const safeName = path.basename(decodeURIComponent(req.query.filename || defaultName)).replace(/[^a-zA-Z0-9_\-.\s]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    res.setHeader('Content-Type', mimeType);
    res.send(fileData);
  } catch (e) { next(e); }
});

router.get('/email/:messageId/attachment/:attachmentId/content', requireMailAuth, async (req, res, next) => {
  try {
    const { messageId, attachmentId } = req.params;
    let fileData, mimeType;

    if (req.mailSource === 'microsoft') {
      const att = await msGraphMail.getAttachmentContent(req.user, messageId, attachmentId);
      fileData = att.contentBuffer;
      mimeType = req.query.mimeType || att.mimeType || mime.lookup(req.query.filename) || 'application/octet-stream';
    } else {
      const { gmail } = req;
      const { data } = await gmail.users.messages.attachments.get({ userId: 'me', messageId, id: attachmentId });
      if (!data?.data) return res.status(404).json({ message: 'Contenu de la pièce jointe introuvable.' });
      fileData = Buffer.from(data.data, 'base64url');
      mimeType = req.query.mimeType || mime.lookup(req.query.filename) || 'application/octet-stream';
    }
    res.setHeader('Content-Type', mimeType);
    res.send(fileData);
  } catch (e) { next(e); }
});

router.get('/email/:id/full-content', requireMailAuth, async (req, res, next) => {
  try {
    if (req.mailSource === 'microsoft') {
      const r = await msGraphMail.getMessage(req.user, req.params.id);
      const attachmentsWithContent = [];
      for (const att of r.attachments) {
        const c = await msGraphMail.getAttachmentContent(req.user, req.params.id, att.attachmentId);
        attachmentsWithContent.push({ ...att, content: c.contentBase64 });
      }
      return res.json({
        id: r.id, from: r.from, subject: r.subject,
        date: r.date || new Date().toISOString(),
        body: r.body,
        attachments: attachmentsWithContent,
      });
    }
    const { gmail } = req;
    const { data: messageData } = await gmail.users.messages.get({ userId: 'me', id: req.params.id, format: 'full' });
    if (!messageData.payload) return res.status(404).json({ message: 'Contenu du message introuvable.' });
    const attachmentsRaw = extractAttachments(messageData.payload.parts || []);
    const attachmentsWithContent = [];
    for (const att of attachmentsRaw) {
      const { data: attachmentData } = await gmail.users.messages.attachments.get({ userId: 'me', messageId: req.params.id, id: att.attachmentId });
      attachmentsWithContent.push({ ...att, content: attachmentData.data });
    }
    const from = (messageData.payload.headers.find(h => h.name.toLowerCase() === 'from'))?.value || 'N/A';
    const subject = (messageData.payload.headers.find(h => h.name.toLowerCase() === 'subject'))?.value || '(Sans objet)';
    const date = (messageData.payload.headers.find(h => h.name.toLowerCase() === 'date'))?.value || new Date().toISOString();
    res.json({ id: messageData.id, from, subject, date, body: getBody(messageData.payload), attachments: attachmentsWithContent });
  } catch (e) { next(e); }
});

// S26 #18b : ajout schema Joi (place APRES multer pour que req.body soit parse)
const validateBody = require('../middlewares/validateBody');
const { sendEmailSchema } = require('../validation/mailSchemas');

router.post('/send-email', [auth, getAuthenticatedMailContext, upload.single('attachment'), validateBody(sendEmailSchema)], async (req, res, next) => {
  try {
    const { subject, body, docId, nomDocument, subfolderName } = req.body;
    const toList = (req.body.to || '').split(/[\s,]+/).filter(email => email && email.includes('@')).join(', ');
    if (!toList || !body) return res.status(400).json({ message: 'Destinataire(s) valide(s) et corps requis.' });

    // Construction des pièces jointes (commun aux deux sources)
    const attachments = [];
    if (req.file) {
      attachments.push({ filename: req.file.originalname, content: req.file.buffer, contentType: req.file.mimetype });
    } else if (docId && nomDocument) {
      // SECURITE rc37 (C-03) : path traversal — `nomDocument`,
      // `subfolderName`, `docId` etaient interpoles bruts dans path.join,
      // permettant a un attaquant authentifie d'envoyer en piece jointe
      // n'importe quel fichier du PC (ex: nomDocument="../../etc/passwd").
      // Defense 1 : path.basename() neutralise les "../" sur chaque composant.
      // Defense 2 : verification que le path resolu reste sous root.
      const safeDocId = path.basename(String(docId));
      const safeSubfolder = path.basename(String(subfolderName || ''));
      const safeName = path.basename(String(nomDocument));
      if (!safeDocId || !safeName) {
        return res.status(400).json({ message: 'docId/nomDocument invalides.' });
      }
      const root = getFilesClientsRoot();
      // Lecture du document client via la couche de stockage agnostique
      // (Phase 4). En mode LOCAL (defaut, Electron) : comportement disque
      // STRICTEMENT inchange. En mode GCS : lecture par cle docId/subfolder/nom.
      const clientDocsStorage = buildFileStorage({ ...process.env, FILE_STORAGE_LOCAL_ROOT: root });

      if (clientDocsStorage.kind === 'local') {
        const fullPath = path.resolve(root, safeDocId, safeSubfolder, safeName);
        const rootResolved = path.resolve(root);
        if (!fullPath.startsWith(rootResolved + path.sep) && fullPath !== rootResolved) {
          console.warn(`[mails/send-email] Path traversal bloque user=${req.user} fullPath="${fullPath}"`);
          return res.status(400).json({ message: 'Chemin invalide.' });
        }
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          attachments.push({ filename: safeName, content: fs.readFileSync(fullPath), contentType: mime.lookup(fullPath) || "application/octet-stream" });
        }
      } else {
        // Stockage cloud (GCS) : cle = docId/subfolder/nom (structure identique
        // a l'arborescence Files_Clients). Les composants sont deja sanitises
        // (path.basename) ; sanitizeKey rejette en plus toute traversee.
        const docKey = [safeDocId, safeSubfolder, safeName].filter(Boolean).join('/');
        if (await clientDocsStorage.exists(docKey)) {
          const content = await clientDocsStorage.read(docKey);
          attachments.push({ filename: safeName, content, contentType: mime.lookup(safeName) || "application/octet-stream" });
        }
      }
    }

    if (req.mailSource === 'microsoft') {
      await msGraphMail.sendMail(req.user, { to: toList, subject, body, attachments });
      audit.create(req, 'email-sent', null, {
        source: 'microsoft', to: toList, subject: subject || '(sans objet)',
        attachments: attachments.length,
      });
      return res.status(200).json({ message: 'Email envoyé avec succès via Outlook !' });
    }

    // Google (existant)
    const { gmail } = req;
    const rawMessage = Buffer.from(await new MailComposer({
      to: toList, subject: subject || '(Sans objet)', text: body, html: `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`, attachments,
    }).compile().build()).toString('base64url');
    const { data } = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: rawMessage } });
    audit.create(req, 'email-sent', data.id, {
      source: 'google', to: toList, subject: subject || '(sans objet)',
      attachments: attachments.length,
    });
    res.status(200).json({ message: 'Email envoyé avec succès !', id: data.id });
  } catch (e) { next(e); }
});

router.post('/auth/logout', auth, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user, { $set: { googleRefreshToken: null, microsoftRefreshToken: null } });
    res.status(200).json({ message: 'Session déconnectée côté serveur.' });
  } catch (error) { next(error); }
});

/*
──────────────────────────────────────────────────────────────
  8.  MIDDLEWARE ERREURS FINAL & EXPORTS (INCHANGÉ)
────────────────────────────────────────────────────────────── */
router.use(handleGmailAuthErrors);

module.exports = {
  mailRouter: router,
  oauth2Client, // Export depuis le fichier config pour cohérence, mais export local pour compatibilité existante
};
