// Kheops_2/server/routes/divorceCM.js
//
// Routes REST pour le module "Divorce par consentement mutuel".
// Contrat principal :
//  - POST  /api/divorce-cm                     -> creation Dossier + DivorceCMData en une operation
//  - GET   /api/divorce-cm/by-dossier/:id      -> fiche divorce associee a un dossier
//  - GET   /api/divorce-cm/:id                 -> fiche par son propre _id
//  - PATCH /api/divorce-cm/:id                 -> mise a jour partielle
//  - POST  /api/divorce-cm/:id/etapes/:code    -> toggle d'une etape de la checklist
//  - GET   /api/divorce-cm/constants           -> referentiels (voies, regimes, etapes)
//
// Pas de DELETE physique : la suppression d'un dossier divorce passe par la
// suppression du Dossier classique (route existante) qui peut entrainer la
// suppression de la fiche associee si l'utilisateur le demande.
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const auth = require('../middlewares/middleware-auth');
const { asyncHandler } = require('../middlewares/folder-middleWare');

const Dossier = require('../models/Folder/Dossier');
const DivorceCMData = require('../models/Divorce/DivorceCMData');
const DivorceCMTemplate = require('../models/Divorce/DivorceCMTemplate');
const Contact = require('../models/Folder/Contact');
const PersonneCharge = require('../models/Folder/PersonneCharge');
const ContactPersonneCharge = require('../models/Folder/modelsLiaisons/ContactPersonneCharge');
const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
const UserContact = require('../models/Folder/modelsLiaisons/UserContact');
const User = require('../models/App_Users/User');

const constants = require('../services/divorceCMConstants');
const audit = require('../utils/auditLogger');

// ============================================================
// Helpers
// ============================================================
function getOwnerUserId(req) {
  return req.user ? String(req.user) : null;
}

function jsonValidationErr(res, msg) {
  return res.status(400).json({ message: msg });
}

// Construit le nom d'affichage du dossier a partir des epoux
function buildDossierName(epoux1, epoux2) {
  const fullName = (e) => {
    if (!e) return '';
    const nomPart = (e.nom || e.nomDeNaissance || '').trim();
    return nomPart;
  };
  const a = fullName(epoux1);
  const b = fullName(epoux2);
  if (a && b) return `${a} - ${b}`;
  if (a) return `${a} (divorce CM)`;
  if (b) return `${b} (divorce CM)`;
  return 'Divorce par consentement mutuel';
}

// Genere une reference unique pour le dossier
function buildDossierReference() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  return `DCM-${stamp}`;
}

// ============================================================
// Synchronisation Divorce CM -> Dossier.parties.pour
//
// Pourquoi : la sidebar PARTIES du composant DossierLeftPanel lit
// uniquement `dossier.dossier.parties.pour[]` et `parties.contre[]`. Le
// module Divorce CM stocke les epoux dans une collection separee
// (DivorceCMData.epoux1/2), donc sans cette synchro la sidebar affiche
// "Aucune partie associee" alors que les epoux sont bien renseignes.
//
// Convention : les deux epoux d'un divorce CM sont placés ensemble dans
// `parties.pour[]` (pas de pour/contre dans un divorce conjoint).
// Les blocs sont marques `_origin: 'divorce_cm_epoux_1'` ou `'_2'` pour
// permettre une re-ecriture idempotente (on remplace uniquement les
// blocs marques, on preserve les parties saisies manuellement par
// l'utilisateur s'il y en a).
// ============================================================
function buildPartyBlockFromEpoux(epoux, role, dossierIdStr) {
  if (!epoux || (!epoux.nom && !epoux.prenoms && !epoux.contactId)) return null;
  // _id stable derive du dossier + role pour garantir l'idempotence
  // (sinon chaque save genererait un nouvel ObjectId et la comparaison
  // JSON.stringify echouerait toujours).
  const stableId = epoux.contactId
    ? String(epoux.contactId)
    : `dcm_${dossierIdStr}_${role}`;
  return {
    _id: stableId,
    nom: (epoux.nom || '').trim(),
    prenoms: (epoux.prenoms || '').trim(),
    civilite: epoux.civilite || '',
    dateNaissance: epoux.dateNaissance || null,
    lieuNaissance: epoux.lieuNaissance || '',
    profession: epoux.profession || '',
    adresse: epoux.adresse || '',
    ville: epoux.ville || '',
    codePostal: epoux.codePostal || '',
    telephone: epoux.telephone || '',
    email: epoux.email || '',
    contactType: 'Physique',
    _origin: `divorce_cm_${role}`,
  };
}

async function syncEpouxToDossierParties(divorce, dossierDoc = null) {
  if (!divorce || !divorce.dossierId) return false;
  const dossier = dossierDoc || await Dossier.findById(divorce.dossierId);
  if (!dossier) return false;

  const dossierIdStr = String(dossier._id);
  const block1 = buildPartyBlockFromEpoux(divorce.epoux1, 'epoux_1', dossierIdStr);
  const block2 = buildPartyBlockFromEpoux(divorce.epoux2, 'epoux_2', dossierIdStr);

  const content = dossier.dossier || {};
  const parties = content.parties || {};
  const currentPour = Array.isArray(parties.pour) ? parties.pour : [];

  // Conserve les parties saisies manuellement (origin != divorce_cm_*)
  const preserved = currentPour.filter((p) => {
    if (!p) return false;
    return p._origin !== 'divorce_cm_epoux_1' && p._origin !== 'divorce_cm_epoux_2';
  });

  const newPour = [...preserved];
  if (block1) newPour.push(block1);
  if (block2) newPour.push(block2);

  // Idempotence : compare avant ecriture pour eviter les saves inutiles
  const oldJson = JSON.stringify(currentPour);
  const newJson = JSON.stringify(newPour);
  if (oldJson === newJson) return false;

  // Assure la structure imbriquee avant d'ecrire
  if (!dossier.dossier) dossier.dossier = {};
  if (!dossier.dossier.parties) dossier.dossier.parties = { pour: [], contre: [] };
  dossier.dossier.parties.pour = newPour;
  if (!Array.isArray(dossier.dossier.parties.contre)) dossier.dossier.parties.contre = [];
  dossier.markModified('dossier.parties.pour');
  await dossier.save();
  return true;
}

// ============================================================
// Propagation REVERSE : DivorceCMData -> Contact
//
// Quand l'utilisateur modifie dans le wizard un epoux qui vient d'un
// contact existant (epoux1/2.contactId defini), on met a jour ce contact
// dans la base. Idem pour les enfants/adultes a charge (synchronisation
// avec les PersonneCharge liees au contact).
//
// Idempotence : on compare les valeurs avant ecriture, et la propagation
// `Contact -> Divorce` (folderContacts.js) compare aussi avant ecriture,
// donc pas de boucle infinie.
//
// Aucune suppression de PCH du contact qui ne sont pas dans le wizard :
// l'utilisateur peut avoir des PCH non liees au divorce (autres dossiers,
// dependances futures, etc.).
// ============================================================
async function propagateDivorceToContacts(divorceData) {
  if (!divorceData) return;
  const ownerUserId = divorceData.ownerUserId ? String(divorceData.ownerUserId) : null;
  if (!ownerUserId) return;

  const civiliteFromGenre = (civilite) => {
    if (civilite === 'Mme') return 'Feminin';
    if (civilite === 'Mlle') return 'Feminin';
    return 'Masculin';
  };

  // Champs Epoux -> Contact
  const contactFieldsFromEpoux = (e) => ({
    civilite: e.civilite || '',
    genre: civiliteFromGenre(e.civilite),
    nom: e.nom || '',
    nom_de_naissance: e.nomDeNaissance || '',
    prenoms: e.prenoms || '',
    dateNaissance: e.dateNaissance || null,
    villeNaissance: e.lieuNaissance || '',
    paysNaissance: e.paysNaissance || '',
    nationalite: e.nationalite || '',
    profession: e.profession || '',
    adresse: e.adresse || '',
    codePostal: e.codePostal || '',
    ville: e.ville || '',
    pays: e.pays || '',
    email: e.email || '',
    telephone: e.telephone || '',
  });

  const enfantKey = (e) => `${(e.nom || '').trim().toLowerCase()}|${(e.prenoms || '').trim().toLowerCase()}|${e.dateNaissance ? new Date(e.dateNaissance).toISOString().slice(0, 10) : ''}`;

  // Map contactId -> liste d'enfants/adultes a synchroniser
  const epouxByContact = new Map();
  if (divorceData.epoux1?.contactId) {
    epouxByContact.set(String(divorceData.epoux1.contactId), { epoux: divorceData.epoux1, slot: 'epoux1' });
  }
  if (divorceData.epoux2?.contactId) {
    epouxByContact.set(String(divorceData.epoux2.contactId), { epoux: divorceData.epoux2, slot: 'epoux2' });
  }
  if (epouxByContact.size === 0) return;

  for (const [contactId, info] of epouxByContact.entries()) {
    if (!mongoose.Types.ObjectId.isValid(contactId)) continue;

    // 1) Mise a jour du Contact (idempotent : Mongoose ne re-ecrit que si
    // les champs changent reellement avec findByIdAndUpdate + new)
    try {
      const contact = await Contact.findById(contactId);
      if (!contact) continue;
      const fields = contactFieldsFromEpoux(info.epoux);
      let changed = false;
      for (const [k, v] of Object.entries(fields)) {
        // Comparer simplement : si la valeur differe, mettre a jour
        const cur = contact[k];
        if (v == null && (cur == null || cur === '')) continue;
        if (cur instanceof Date && v) {
          if (new Date(cur).getTime() !== new Date(v).getTime()) {
            contact[k] = v;
            changed = true;
          }
          continue;
        }
        if ((cur || '') !== (v || '')) {
          contact[k] = v;
          changed = true;
        }
      }
      if (changed) await contact.save();
    } catch (e) {
      console.warn('[propagateDivorceToContacts] Maj contact echouee:', e && e.message);
      continue;
    }

    // 2) Synchronisation enfants + adultes vers les PersonneCharge du contact
    // Les enfants du divorce sont attaches au contact de l'epoux 1 par
    // defaut, sauf si l'enfant a deja un pchId qui pointe vers une PCH
    // d'un autre contact.
    // Strategie : on attache toutes les nouvelles entrees au contactId
    // courant (de la boucle epouxByContact). Si un enfant a deja un pchId
    // qui pointe vers une PCH liee a *cet* contact, on update.
    const toSync = [];
    if (info.slot === 'epoux1') {
      // C'est l'epoux 1 (client) : on attache enfants et adultes a charge
      // a son contact.
      (divorceData.enfants || []).forEach(e => toSync.push({ ...e.toObject ? e.toObject() : e, _kind: 'enfant' }));
      (divorceData.adultesCharge || []).forEach(a => toSync.push({ ...a.toObject ? a.toObject() : a, _kind: 'adulte' }));
    }
    // Pour epoux 2 : on ne replique pas par defaut (les enfants ne sont pas
    // dupliques entre 2 contacts). Si l'utilisateur veut associer les
    // enfants au contact epoux 2 aussi, ce sera fait via une action manuelle.
    if (toSync.length === 0) continue;

    try {
      // Lire les PCH actuelles du contact
      const liaisons = await ContactPersonneCharge.find({ contact: contactId }).lean();
      const pcIds = liaisons.map(l => l.personneCharge);
      const pchs = pcIds.length ? await PersonneCharge.find({ _id: { $in: pcIds } }) : [];
      const pchByKey = new Map();
      const pchById = new Map();
      for (const p of pchs) {
        pchByKey.set(enfantKey(p), p);
        pchById.set(String(p._id), p);
      }

      for (const item of toSync) {
        const isAdulte = item._kind === 'adulte';
        const pchPayload = {
          nom: item.nom || '',
          prenoms: item.prenoms || '',
          dateNaissance: item.dateNaissance || null,
          villeNaissance: item.lieuNaissance || '',
          adresse: item.adresse || '',
          codePostal: item.codePostal || '',
          ville: item.ville || '',
          type: isAdulte ? 'adulte' : 'enfant',
          genre: item.sexe === 'F' ? 'Feminin' : 'Masculin',
          profession: item.profession || '',
        };

        // Match par pchId direct
        let target = item.pchId ? pchById.get(String(item.pchId)) : null;
        // Sinon match par cle
        if (!target) target = pchByKey.get(enfantKey(item));

        if (target) {
          // Update champ par champ (idempotent)
          let changed = false;
          for (const [k, v] of Object.entries(pchPayload)) {
            const cur = target[k];
            if (v == null && (cur == null || cur === '')) continue;
            if (cur instanceof Date && v) {
              if (new Date(cur).getTime() !== new Date(v).getTime()) { target[k] = v; changed = true; }
              continue;
            }
            if ((cur || '') !== (v || '')) { target[k] = v; changed = true; }
          }
          if (changed) await target.save();
        } else {
          // Creer + lier au contact
          const newPC = new PersonneCharge(pchPayload);
          await newPC.save();
          await new ContactPersonneCharge({ contact: contactId, personneCharge: newPC._id }).save();
          // Stocker le pchId dans l'enfant/adulte du divorce (mais on ne
          // sauve pas ici la fiche divorce pour eviter recursion) — on
          // laisse le lien etre etabli au prochain match par cle.
        }
      }
    } catch (e) {
      console.warn('[propagateDivorceToContacts] Sync PCH echouee:', e && e.message);
    }
  }
}

// ============================================================
// GET /api/divorce-cm/constants
// ============================================================
router.get('/constants', auth, (req, res) => {
  res.json({
    voies: constants.VOIES,
    regimesMatrimoniaux: constants.REGIMES_MATRIMONIAUX,
    typesResidence: constants.TYPES_RESIDENCE,
    typesAutoriteParental: constants.TYPES_AUTORITE_PARENTALE,
    formesPrestation: constants.FORMES_PRESTATION,
    modalitesCapital: constants.MODALITES_CAPITAL,
    typesLogement: constants.TYPES_LOGEMENT,
    repartitionsFrais: constants.REPARTITIONS_FRAIS,
    dureesPension: constants.DUREES_PENSION,
    etapesExtrajudiciaire: constants.ETAPES_EXTRAJUDICIAIRE,
    etapesJudiciaire: constants.ETAPES_JUDICIAIRE,
    civilites: constants.CIVILITES,
    sexes: constants.SEXES,
  });
});

// ============================================================
// POST /api/divorce-cm
// Cree simultanement un Dossier et la fiche DivorceCMData associee.
// Body : { divorceData: {...} }  (voie, epoux1, epoux2, mariage, enfants, ...)
// ============================================================
router.post('/', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const incoming = (req.body && req.body.divorceData) || req.body || {};

  // 1) Determiner la voie (judiciaire si un mineur souhaite etre entendu)
  const voie = constants.voieRecommandee(incoming);
  const etapes = constants.etapesInitiales(voie);

  // 2) Creer le Dossier minimal (nom calcule, type_dossier discriminant)
  const dossierName = buildDossierName(incoming.epoux1, incoming.epoux2);

  const dossier = new Dossier({
    reference: buildDossierReference(),
    dossier: {
      dossier: {
        nom: dossierName,
        type_dossier: 'divorce_cm',
        date_Creation_Dossier: new Date(),
      },
      parties: { pour: [], contre: [] },
      contactsDuDossier: [],
      avocatsResponsables: [],
      documents: [],
    },
    factures: [],
    subfolders: [],
  });

  await dossier.save();

  // 2bis) Lier le dossier au user (sans cela, le dossier n'apparait
  // pas dans /last-25-dossiers ni dans la recherche par UserDossier).
  try {
    await new UserDossier({ user: ownerUserId, dossier: dossier._id }).save();
  } catch (linkErr) {
    console.error('[divorceCM] Echec creation UserDossier:', linkErr && linkErr.message);
    // On ne bloque pas la creation de la fiche divorce :
    // le Dossier existe deja, mais il sera orphelin de la liste user.
  }

  // 3) Creer la fiche divorce associee
  const divorce = new DivorceCMData({
    dossierId: dossier._id,
    ownerUserId,
    voie,
    epoux1: incoming.epoux1 || { estClientCabinet: true },
    epoux2: incoming.epoux2 || { estClientCabinet: false },
    mariage: incoming.mariage || {},
    enfants: incoming.enfants || [],
    adultesCharge: incoming.adultesCharge || [],
    prestationCompensatoire: incoming.prestationCompensatoire || {},
    pensionsAlimentaires: incoming.pensionsAlimentaires || [],
    logementFamilial: incoming.logementFamilial || {},
    nomUsage: incoming.nomUsage || {},
    notaire: incoming.notaire || {},
    etapes,
    dates: incoming.dates || {},
    notes: incoming.notes || '',
  });

  await divorce.save();

  // Synchronisation reverse : si epoux1/2 vient d'un contact existant, on
  // met a jour le contact + ses PersonneCharge depuis les donnees saisies
  // dans le wizard. Idempotent et anti-boucle (compare avant ecriture).
  try {
    await propagateDivorceToContacts(divorce);
  } catch (syncErr) {
    console.warn('[divorce-cm POST] Sync reverse echouee:', syncErr && syncErr.message);
  }

  // Synchronisation epoux -> dossier.parties.pour pour que la sidebar
  // PARTIES du dossier affiche les epoux comme parties.
  try {
    await syncEpouxToDossierParties(divorce, dossier);
  } catch (syncErr) {
    console.warn('[divorce-cm POST] Sync parties echouee:', syncErr && syncErr.message);
  }

  audit.create(req, 'divorceCM', divorce._id, {
    dossierId: String(dossier._id),
    voie: divorce.voie,
    epouxNoms: [
      divorce.epoux1?.nom,
      divorce.epoux2?.nom,
    ].filter(Boolean),
  });

  res.status(201).json({
    dossier: dossier.toObject(),
    divorceData: divorce.toObject(),
  });
}));

// ============================================================
// GET /api/divorce-cm/by-dossier/:dossierId
// ============================================================
router.get('/by-dossier/:dossierId', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.dossierId)) {
    return jsonValidationErr(res, 'dossierId invalide.');
  }

  const data = await DivorceCMData.findOne({
    dossierId: req.params.dossierId,
    ownerUserId,
  }).lean();

  if (!data) return res.status(404).json({ message: 'Fiche divorce introuvable.' });

  // Rattrapage idempotent : pour les divorces existants en base avant
  // l'introduction de la synchro, on injecte les epoux dans
  // dossier.parties.pour si necessaire. Re-ecrit uniquement si different.
  // On renvoie aussi le dossier mis a jour pour que le client puisse
  // rafraichir son cache Redux sans avoir a refetch separement.
  let dossierAJour = null;
  try {
    const divorceDoc = await DivorceCMData.findById(data._id);
    if (divorceDoc) {
      const modified = await syncEpouxToDossierParties(divorceDoc);
      if (modified) {
        // Recharge le dossier post-save pour renvoyer la version a jour.
        dossierAJour = await Dossier.findById(divorceDoc.dossierId).lean();
      }
    }
  } catch (syncErr) {
    console.warn('[divorce-cm GET] Sync parties echouee:', syncErr && syncErr.message);
  }

  res.json({ divorceData: data, dossier: dossierAJour });
}));

// ============================================================
// GET /api/divorce-cm/:id
// Restreint a un ObjectId Mongo via le pattern regex pour ne pas
// capturer les chemins litteraux comme /search-contacts, /templates,
// /cabinet-profile.
// ============================================================
router.get('/:id([0-9a-fA-F]{24})', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return jsonValidationErr(res, 'id invalide.');
  }
  const data = await DivorceCMData.findOne({ _id: req.params.id, ownerUserId }).lean();
  if (!data) return res.status(404).json({ message: 'Fiche divorce introuvable.' });
  res.json({ divorceData: data });
}));

// ============================================================
// PATCH /api/divorce-cm/:id
// Mise a jour partielle. Permet de modifier n'importe quelle section
// (epoux1, epoux2, mariage, enfants, prestationCompensatoire, etc.).
// Pattern regex pour eviter la capture des chemins litteraux.
// ============================================================
router.patch('/:id([0-9a-fA-F]{24})', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return jsonValidationErr(res, 'id invalide.');
  }

  const data = await DivorceCMData.findOne({ _id: req.params.id, ownerUserId });
  if (!data) return res.status(404).json({ message: 'Fiche divorce introuvable.' });

  const body = req.body || {};
  const sections = [
    'voie', 'epoux1', 'epoux2', 'mariage', 'enfants', 'adultesCharge',
    'prestationCompensatoire', 'pensionsAlimentaires',
    'logementFamilial', 'nomUsage', 'notaire',
    'dates', 'notes',
  ];

  // Memorise la voie initiale pour detecter un changement et regenerer
  // la checklist d'etapes (12 etapes extrajudiciaire / 9 judiciaire) en
  // preservant les realiseLe et notes deja saisis sur les etapes communes.
  const ancienneVoie = data.voie;

  for (const section of sections) {
    if (Object.prototype.hasOwnProperty.call(body, section)) {
      data[section] = body[section];
      data.markModified(section);
    }
  }

  // Recalculer la voie si les enfants ont change (mineur entendu => judiciaire)
  if (Object.prototype.hasOwnProperty.call(body, 'enfants')) {
    data.voie = constants.voieRecommandee(data);
  }

  // Si la voie a change (manuellement OU via le recalcul ci-dessus),
  // regenere la liste d'etapes correspondante et conserve les progres
  // saisis (date de realisation + notes) sur les codes communs.
  if (ancienneVoie !== data.voie) {
    const nouvellesEtapes = constants.etapesInitiales(data.voie);
    const ancienByCode = new Map((data.etapes || []).map(e => [e.code, e]));
    data.etapes = nouvellesEtapes.map((neu) => {
      const old = ancienByCode.get(neu.code);
      if (old) {
        return {
          ...neu,
          realiseLe: old.realiseLe || null,
          notes: old.notes || '',
        };
      }
      return neu;
    });
    data.markModified('etapes');
  }

  await data.save();

  // Mettre a jour le nom du dossier en cascade si epoux1/epoux2 ont change
  if (body.epoux1 || body.epoux2) {
    try {
      const dossier = await Dossier.findById(data.dossierId);
      if (dossier && dossier.dossier && dossier.dossier.dossier) {
        const newName = buildDossierName(data.epoux1, data.epoux2);
        if (newName && dossier.dossier.dossier.nom !== newName) {
          dossier.dossier.dossier.nom = newName;
          dossier.markModified('dossier.dossier.nom');
          await dossier.save();
        }
      }
    } catch (e) {
      // Pas bloquant : le nom du dossier peut etre rectifie a la main
      console.warn('[divorceCM] Mise a jour du nom du dossier echouee:', e && e.message);
    }
  }

  // Synchronisation reverse : Divorce -> Contact (et PCH liees)
  try {
    await propagateDivorceToContacts(data);
  } catch (syncErr) {
    console.warn('[divorce-cm PATCH] Sync reverse echouee:', syncErr && syncErr.message);
  }

  // Synchronisation epoux -> dossier.parties.pour
  if (body.epoux1 || body.epoux2) {
    try {
      await syncEpouxToDossierParties(data);
    } catch (syncErr) {
      console.warn('[divorce-cm PATCH] Sync parties echouee:', syncErr && syncErr.message);
    }
  }

  audit.update(req, 'divorceCM', data._id, {
    sections: Object.keys(body),
    voie: data.voie,
  });

  res.json({ divorceData: data.toObject() });
}));

// ============================================================
// POST /api/divorce-cm/:id/etapes/:code
// Toggle d'une etape (realisee / non realisee). Body : { realiseLe, notes }.
// Si realiseLe est null/absent, on considere "remettre a non realisee".
// Pattern regex pour eviter la capture des chemins litteraux.
// ============================================================
router.post('/:id([0-9a-fA-F]{24})/etapes/:code', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return jsonValidationErr(res, 'id invalide.');
  }

  const data = await DivorceCMData.findOne({ _id: req.params.id, ownerUserId });
  if (!data) return res.status(404).json({ message: 'Fiche divorce introuvable.' });

  const etape = data.etapes.find(e => e.code === req.params.code);
  if (!etape) return res.status(404).json({ message: 'Etape introuvable.' });

  const { realiseLe, notes } = req.body || {};
  if (realiseLe === null || realiseLe === false) {
    etape.realiseLe = null;
    etape.realisePar = null;
  } else if (realiseLe) {
    etape.realiseLe = new Date(realiseLe);
    etape.realisePar = null; // pourrait recevoir l'OfficeUser actif
  } else {
    // Toggle : si deja realisee, on annule ; sinon on marque maintenant
    if (etape.realiseLe) {
      etape.realiseLe = null;
      etape.realisePar = null;
    } else {
      etape.realiseLe = new Date();
    }
  }
  if (typeof notes === 'string') {
    etape.notes = notes;
  }

  data.markModified('etapes');
  await data.save();

  res.json({ divorceData: data.toObject() });
}));

// ============================================================
// GET /api/divorce-cm/search-contacts?type=epoux|avocat|notaire&q=&limit=
// Recherche dans la base de contacts pour pre-remplir le wizard.
//  - epoux  : tous contacts physiques (filtre par nom/prenoms/nom_de_naissance)
//  - avocat : contacts dont type contient 'avocat' ou pro_contact=true
//  - notaire: contacts de type 'Notaire' (compatible avec /folder/notaires)
// ============================================================
router.get('/search-contacts', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const type = String(req.query.type || 'epoux').toLowerCase();
  const q = String(req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 30);

  if (q.length < 2) return res.json({ contacts: [] });

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safe = escapeRegex(q);
  const startRegex = new RegExp('^' + safe, 'i');
  const containsRegex = new RegExp(safe, 'i');

  // SECURITE rc37 (M-07) : restreindre la recherche aux contacts du cabinet
  // courant (UserContact). Sans ce filtre, l'endpoint search-contacts du
  // wizard divorce CM retournait tous les contacts de la base.
  const userContactLinks = await UserContact.find({ user: ownerUserId })
    .select('contact')
    .lean();
  const userContactIds = userContactLinks.map((l) => l.contact);

  let filter = {};
  if (type === 'notaire') {
    filter = {
      type: { $regex: /notaire/i },
      $or: [
        { nom: startRegex },
        { prenoms: startRegex },
        { raisonSociale: startRegex },
      ],
    };
  } else if (type === 'avocat') {
    filter = {
      $and: [
        {
          $or: [
            { type: { $regex: /avocat/i } },
            { pro_contact: true },
            { roleFonctionnel: 'Professionnel_Tiers' },
          ],
        },
        {
          $or: [
            { nom: startRegex },
            { prenoms: startRegex },
            { raisonSociale: containsRegex },
          ],
        },
      ],
    };
  } else {
    // epoux : contacts physiques (clients/parties), pas pro
    filter = {
      $and: [
        {
          $or: [
            { pro_contact: { $ne: true } },
            { pro_contact: { $exists: false } },
          ],
        },
        {
          $or: [
            { nom: startRegex },
            { prenoms: startRegex },
            { nom_de_naissance: startRegex },
          ],
        },
      ],
    };
  }

  // Application stricte du filtre cabinet : on n'autorise jamais une recherche
  // au-dela des contacts deja lies via UserContact (intersection finale).
  const contacts = await Contact.find({
    _id: { $in: userContactIds },
    ...filter,
  }).limit(limit).lean();

  // Pour les epoux : pour chaque contact, on attache la liste complete des
  // personnes a charge (enfants ET adultes). Le front fait le tri et propose
  // l'import automatique des enfants dans la section Enfants et des adultes
  // dans la section Adultes a charge du wizard divorce.
  if (type === 'epoux' && contacts.length > 0) {
    const ids = contacts.map(c => c._id);
    const liaisons = await ContactPersonneCharge.find({ contact: { $in: ids } }).lean();
    const pcIds = liaisons.map(l => l.personneCharge);
    const personnes = pcIds.length
      ? await PersonneCharge.find({ _id: { $in: pcIds } }).lean()
      : [];
    const pcById = {};
    for (const p of personnes) pcById[String(p._id)] = p;
    const liaisonsByContact = {};
    for (const l of liaisons) {
      const cid = String(l.contact);
      if (!liaisonsByContact[cid]) liaisonsByContact[cid] = [];
      const pc = pcById[String(l.personneCharge)];
      if (pc) liaisonsByContact[cid].push(pc);
    }
    for (const c of contacts) {
      c.personnesCharge = liaisonsByContact[String(c._id)] || [];
    }
  }

  res.json({ contacts });
}));

// ============================================================
// POST /api/divorce-cm/save-as-contact
// Cree un Contact a partir des donnees saisies dans le wizard
// (utilise apres creation du dossier pour les personnes qui n'etaient
// pas encore dans la base de contacts).
// Body : { kind: 'epoux'|'avocat'|'notaire', data: {...} }
// ============================================================
router.post('/save-as-contact', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const { kind, data, personnesCharge } = req.body || {};
  if (!data || typeof data !== 'object') return jsonValidationErr(res, 'data requis.');
  if (!data.nom && !data.raisonSociale) return jsonValidationErr(res, 'nom requis.');

  const isPro = (kind === 'avocat' || kind === 'notaire');
  const typeLabel = kind === 'avocat' ? 'Avocat'
    : kind === 'notaire' ? 'Notaire'
    : (data.type || 'Personne');

  const payload = {
    nom: data.nom || '',
    nomDeNaissance: data.nomDeNaissance || data.nom_de_naissance || '',
    prenoms: data.prenoms || '',
    email: data.email || '',
    telephone: data.telephone || '',
    adresse: data.adresse || '',
    ville: data.ville || '',
    codePostal: data.codePostal || data.code_postal || '',
    type: typeLabel,
    genre: data.genre || (data.civilite === 'Mme' ? 'Feminin' : 'Masculin'),
    contactType: 'physique',
    pro_contact: isPro,
    roleFonctionnel: isPro ? 'Professionnel_Tiers' : 'Client_Partie',
    profession: data.profession || '',
    dateNaissance: data.dateNaissance ? new Date(data.dateNaissance) : null,
    nationalite: data.nationalite || '',
    paysNaissance: data.paysNaissance || '',
    villeNaissance: data.lieuNaissance || data.villeNaissance || '',
  };

  const contact = await Contact.create(payload);

  // Lier le contact a l'utilisateur (sans cela il n'apparait pas dans
  // les recherches de contacts du cabinet).
  try {
    const UserContact = require('../models/Folder/modelsLiaisons/UserContact');
    await new UserContact({ user: ownerUserId, contact: contact._id }).save();
  } catch (linkErr) {
    console.warn('[save-as-contact] UserContact link echoue:', linkErr && linkErr.message);
  }

  // Si des personnes a charge sont fournies (enfants/adultes saisis dans
  // le wizard pour un epoux ex nihilo), on les cree et les lie au contact.
  const createdPCH = [];
  if (Array.isArray(personnesCharge) && personnesCharge.length > 0 && !isPro) {
    for (const pc of personnesCharge) {
      try {
        const newPC = await PersonneCharge.create({
          nom: pc.nom || '',
          prenoms: pc.prenoms || '',
          dateNaissance: pc.dateNaissance ? new Date(pc.dateNaissance) : null,
          villeNaissance: pc.lieuNaissance || pc.villeNaissance || '',
          adresse: pc.adresse || '',
          codePostal: pc.codePostal || '',
          ville: pc.ville || '',
          type: pc.type || 'enfant',
          genre: pc.genre || (pc.sexe === 'F' ? 'Feminin' : 'Masculin'),
          profession: pc.profession || '',
        });
        await new ContactPersonneCharge({ contact: contact._id, personneCharge: newPC._id }).save();
        createdPCH.push(newPC.toObject());
      } catch (e) {
        console.warn('[save-as-contact] PCH create echoue:', e && e.message);
      }
    }
  }

  res.status(201).json({ contact: contact.toObject(), personnesCharge: createdPCH });
}));

// ============================================================
// GET /api/divorce-cm/cabinet-profile
// Renvoie les infos du User connecte pour pre-remplir l'avocat
// du cabinet sur l'epoux 1.
// ============================================================
router.get('/cabinet-profile', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const user = await User.findById(ownerUserId).select(
    'firstName lastName email phone address city postalCode barreau'
  ).lean();
  if (!user) return res.status(404).json({ message: 'Profil utilisateur introuvable.' });
  res.json({
    avocat: {
      prenoms: user.firstName || '',
      nom: user.lastName || '',
      email: user.email || '',
      telephone: user.phone || '',
      adresse: user.address || '',
      ville: user.city || '',
      codePostal: user.postalCode || '',
      barreau: user.barreau || '',
      cabinet: user.firstName && user.lastName ? `Cabinet de Maitre ${user.firstName} ${user.lastName}` : '',
      estTitulaire: true,
    },
  });
}));

// ============================================================
// GET /api/divorce-cm/templates
// Liste tous les templates personnalises pour ce cabinet.
// Renvoie un objet { key: content, ... } pour faciliter la lookup cote client.
// ============================================================
router.get('/templates', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });

  const tpls = await DivorceCMTemplate.find({ ownerUserId }).lean();
  const map = {};
  for (const t of tpls) {
    map[t.key] = t.content || '';
  }
  res.json({ templates: map });
}));

// ============================================================
// PUT /api/divorce-cm/templates/:key
// Cree ou met a jour un template. Body : { content }.
// Si content est vide, le template est supprime (retour aux defauts).
// ============================================================
router.put('/templates/:key', auth, asyncHandler(async (req, res) => {
  const ownerUserId = getOwnerUserId(req);
  if (!ownerUserId) return res.status(401).json({ message: 'Non authentifie.' });
  const officeUserId = await (require('../services/carpaService').resolveActiveOfficeUserId)(req);

  const key = String(req.params.key || '').slice(0, 80);
  if (!key) return jsonValidationErr(res, 'key requise.');
  const content = (req.body && typeof req.body.content === 'string') ? req.body.content : '';

  if (!content) {
    // Suppression : retour au defaut
    await DivorceCMTemplate.deleteOne({ ownerUserId, key });
    return res.json({ key, content: '', removed: true });
  }

  const existing = await DivorceCMTemplate.findOne({ ownerUserId, key });
  if (existing) {
    existing.content = content;
    if (officeUserId) existing.lastModifiedByOfficeUserId = officeUserId;
    await existing.save();
    return res.json({ key, content: existing.content });
  }

  const created = await DivorceCMTemplate.create({
    ownerUserId,
    key,
    content,
    lastModifiedByOfficeUserId: officeUserId,
  });
  res.json({ key: created.key, content: created.content });
}));

module.exports = router;
