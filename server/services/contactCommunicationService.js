const mongoose = require('mongoose');
const Contact = require('../models/Folder/Contact');
const ContactPM = require('../models/Folder/ContactPM');
const ContactPMPublique = require('../models/Folder/ContactPMPublique');
const Dossier = require('../models/Folder/Dossier');
const DossierContact = require('../models/Folder/modelsLiaisons/DossierContact');
const ContactPartie = require('../models/Folder/modelsLiaisons/ContactPartie');
const Partie = require('../models/Folder/Partie');
const DossierPartie = require('../models/Folder/modelsLiaisons/DossierPartie');
const UserDossier = require('../models/Folder/modelsLiaisons/UserDossier');
const StoredDocument = require('../models/Storage/StoredDocument');
const DocumentHistory = require('../models/Storage/DocumentHistory');
const DocumentTemplate = require('../models/DocumentEditor/DocumentTemplate');
const { getAccessibleUserIds } = require('./cabinetAccess');
const { createDefaultDocument, createDocxBuffer, normalizeStructuredDocument } = require('./documentEditorFormat');
const { saveVersion } = require('./documentHistoryService');
const { resolveTemplate, applyTemplateToDocument } = require('./documentTemplateService');
const { getFileStorage } = require('./fileStorage');
const { stripHtml } = require('./mail/messageNormalization');

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function physicalContact(contact) {
  return {
    id: String(contact._id),
    kind: 'person',
    displayName: [contact.prenoms, contact.nom].filter(Boolean).join(' ').trim() || 'Contact',
    civilite: contact.appellationCourrier || (contact.genre === 'Féminin' || contact.genre === 'Feminin' ? 'Madame' : (contact.genre === 'Masculin' ? 'Monsieur' : '')),
    firstName: contact.prenoms || '',
    lastName: contact.nom || '',
    organization: '',
    address: contact.adresse || '',
    postalCode: contact.codePostal || '',
    city: contact.ville || '',
    emails: unique([contact.email]),
    phones: unique([contact.telephone]),
  };
}

function privateOrganization(contact) {
  return {
    id: String(contact._id),
    kind: 'organization',
    displayName: contact.raisonSociale || 'Organisation',
    civilite: contact.appellationCourrier || '',
    firstName: contact.interlocuteurPrenom || '',
    lastName: contact.interlocuteurNom || contact.contactDirectNom || contact.representantLegalNom || '',
    organization: contact.raisonSociale || '',
    address: contact.adresseSiegeSocial || '',
    postalCode: contact.codePostalPM || '',
    city: contact.villePM || '',
    emails: unique([contact.emailEntreprise, contact.interlocuteurEmail]),
    phones: unique([contact.telephoneEntreprise, contact.interlocuteurTelephone]),
  };
}

function publicOrganization(contact) {
  return {
    id: String(contact._id),
    kind: 'public_organization',
    displayName: contact.denomination || 'Organisme public',
    civilite: contact.appellationCourrier
      || (contact.genre === 'Feminin' ? contact.appellationCourrierFeminin : contact.appellationCourrierMasculin)
      || '',
    firstName: contact.interlocuteurPrenom || contact.contactPrenom || '',
    lastName: contact.interlocuteurNom || contact.contactNom || '',
    organization: contact.denomination || '',
    address: contact.adresse || '',
    postalCode: contact.codePostal || '',
    city: contact.ville || '',
    emails: unique([contact.email, contact.contactEmail, contact.interlocuteurEmail]),
    phones: unique([contact.contactTelephone, contact.interlocuteurTelephone]),
  };
}

async function loadContact(contactId) {
  const [physical, privateOrg, publicOrg] = await Promise.all([
    Contact.findById(contactId).lean(),
    ContactPM.findById(contactId).lean(),
    ContactPMPublique.findById(contactId).lean(),
  ]);
  if (physical) return physicalContact(physical);
  if (privateOrg) return privateOrganization(privateOrg);
  if (publicOrg) return publicOrganization(publicOrg);
  throw Object.assign(new Error('Contact introuvable.'), { statusCode: 404, code: 'CONTACT_NOT_FOUND' });
}

async function linkedDossiers({ userId, contactId }) {
  const [directLinks, parties, contactPartyLinks] = await Promise.all([
    DossierContact.find({ contact: contactId }).select('dossier').lean(),
    Partie.find({ contact: contactId }).select('_id').lean(),
    ContactPartie.find({ contact: contactId }).select('partie').lean(),
  ]);
  const ids = new Set(directLinks.map((row) => String(row.dossier)).filter(Boolean));
  const partyIds = unique([
    ...parties.map((row) => row._id),
    ...contactPartyLinks.map((row) => row.partie),
  ]);
  if (partyIds.length) {
    const rows = await DossierPartie.find({ partie: { $in: partyIds } }).select('dossier').lean();
    rows.forEach((row) => row.dossier && ids.add(String(row.dossier)));
  }
  if (!ids.size) return [];
  const accessibleUsers = await getAccessibleUserIds(userId);
  const links = await UserDossier.find({
    user: { $in: accessibleUsers },
    dossier: { $in: [...ids] },
  }).select('dossier').lean();
  const accessible = new Set(links.map((row) => String(row.dossier)));
  const dossiers = await Dossier.find({ _id: { $in: [...accessible] } }).select('reference dossier.dossier.nom dossier.avocatsResponsables').lean();
  return dossiers.map((dossier) => ({
    id: String(dossier._id),
    reference: dossier.reference || '',
    name: dossier.dossier?.dossier?.nom || '',
    responsibleLawyers: dossier.dossier?.avocatsResponsables || [],
  })).sort((a, b) => b.reference.localeCompare(a.reference, 'fr', { numeric: true }));
}

function valueOrPlaceholder(value, label) {
  const normalized = String(value || '').trim();
  return normalized || `[[À compléter : ${label}]]`;
}

function paragraph(text, marks = {}) {
  return { type: 'paragraph', runs: [{ text: String(text || ''), marks }], align: 'left' };
}

function contactLetterDocument({ contact, dossier, title, object, bodyText = '', bodyHtml = '' }) {
  const doc = createDefaultDocument(title);
  doc.documentType = 'courrier';
  const person = [contact.civilite, contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  const addressee = contact.organization || person || contact.displayName;
  const safeBody = String(bodyText || stripHtml(bodyHtml || '')).trim();
  const bodyBlocks = safeBody
    ? safeBody.split(/\r?\n/).slice(0, 500).map((line) => paragraph(line))
    : [paragraph('[[À compléter : corps du courrier]]')];
  doc.blocks = [
    paragraph(valueOrPlaceholder(addressee, 'destinataire'), { bold: true }),
    ...(person && contact.organization ? [paragraph(person)] : []),
    paragraph(valueOrPlaceholder(contact.address, 'adresse')),
    paragraph(`${valueOrPlaceholder(contact.postalCode, 'code postal')} ${valueOrPlaceholder(contact.city, 'ville')}`),
    paragraph(''),
    paragraph(`Réf. : ${valueOrPlaceholder(dossier?.reference, 'référence du dossier')}`),
    paragraph(`Objet : ${valueOrPlaceholder(object, 'objet')}`, { bold: true }),
    paragraph(''),
    paragraph(valueOrPlaceholder(contact.civilite ? `${contact.civilite},` : '', 'formule d’appel')),
    paragraph(''),
    ...bodyBlocks,
    paragraph(''),
    paragraph('[[À compléter : formule de politesse]]'),
  ];
  return normalizeStructuredDocument(doc);
}

async function selectedTemplate({ tenantId, templateKey, documentType = 'courrier', context = {} }) {
  if (templateKey) {
    return DocumentTemplate.findOne({
      tenantId,
      templateKey: String(templateKey).slice(0, 100),
      active: true,
    }).sort({ version: -1 });
  }
  return resolveTemplate({ tenantId, context: { ...context, documentType } });
}

async function createLetter({ tenantId, userId, dossierId, contact, payload = {} }) {
  if (!dossierId) {
    const error = new Error('Choisissez un dossier pour créer le courrier.');
    error.statusCode = 400;
    error.code = 'LETTER_DOSSIER_REQUIRED';
    throw error;
  }
  const dossier = await Dossier.findOne({ _id: dossierId, $or: [{ tenantId }, { tenantId: null }] });
  if (!dossier) throw Object.assign(new Error('Dossier introuvable.'), { statusCode: 404, code: 'DOSSIER_NOT_FOUND' });
  if (!dossier.tenantId) dossier.tenantId = tenantId;
  const title = String(payload.title || `Courrier - ${contact.displayName}`).trim().slice(0, 220) || 'Courrier';
  let structured = contactLetterDocument({
    contact,
    dossier,
    title,
    object: payload.object,
    bodyText: payload.bodyText,
    bodyHtml: payload.bodyHtml,
  });
  const template = await selectedTemplate({
    tenantId,
    templateKey: payload.templateKey,
    context: { documentType: 'courrier', language: 'fr' },
  });
  if (template) {
    structured = applyTemplateToDocument(structured, template, {
      sections: ['layout', 'header', 'footer', 'signature', 'styles'],
    });
  }
  const documentId = new mongoose.Types.ObjectId();
  const filename = `${title.replace(/[\\/:*?"<>|]/g, '_')}.docx`;
  const buffer = createDocxBuffer(structured);
  let saved;
  let stored;
  try {
    saved = await saveVersion({
      tenantId,
      dossierId,
      documentId,
      userId,
      buffer,
      filename,
      editor: 'kheops',
      origin: 'kheops',
      comment: `Courrier créé depuis le contact ${contact.displayName}`.slice(0, 1000),
      status: 'draft',
      structuredDocument: structured,
      operationKey: payload.idempotencyKey ? `letter:${String(payload.idempotencyKey).slice(0, 160)}` : null,
    });
    stored = await StoredDocument.create({
      tenantId,
      dossierId,
      documentId,
      ownerUserId: userId,
      currentVersionId: saved.version.versionId,
      versions: [{
        versionId: saved.version.versionId,
        storageKey: saved.version.storageKey,
        size: saved.version.size,
        mime: saved.version.mime,
        filename: saved.version.filename,
        createdAt: saved.version.createdAt,
        createdBy: userId,
        editor: 'kheops',
        origin: 'kheops',
        comment: saved.version.comment,
        status: 'draft',
      }],
    });
    if (!dossier.dossier) dossier.dossier = {};
    if (!Array.isArray(dossier.dossier.documents)) dossier.dossier.documents = [];
    dossier.dossier.documents.push({
      _id: documentId,
      nomDocument: filename,
      dateCreation: new Date(),
      recipient: contact.displayName,
      destinataires: [{
        id: contact.id,
        type: contact.kind,
        nom: contact.lastName || contact.organization,
        prenoms: contact.firstName,
        email: contact.emails[0] || '',
        adresse: contact.address,
        ville: contact.city,
        codePostal: contact.postalCode,
        telephone: contact.phones[0] || '',
      }],
      recipientEmail: contact.emails[0] || '',
      categorie: 'courrier',
      userId,
      color: null,
      subfolderId: payload.subfolderId || null,
    });
    dossier.markModified('dossier');
    await dossier.save();
    return {
      documentId: String(documentId),
      dossierId: String(dossierId),
      storedDocumentId: String(stored._id),
      versionId: saved.version.versionId,
      revision: 0,
      title,
      filename,
      status: 'draft',
      template: template ? { key: template.templateKey, version: template.version } : null,
      editor: payload.editor || 'kheops',
    };
  } catch (error) {
    if (stored?._id) await StoredDocument.deleteOne({ _id: stored._id }).catch(() => {});
    if (saved?.history?._id) await DocumentHistory.deleteOne({ _id: saved.history._id }).catch(() => {});
    if (saved?.version?.storageKey) await getFileStorage().delete(saved.version.storageKey).catch(() => {});
    throw error;
  }
}

module.exports = {
  unique,
  physicalContact,
  privateOrganization,
  publicOrganization,
  loadContact,
  linkedDossiers,
  contactLetterDocument,
  createLetter,
};
