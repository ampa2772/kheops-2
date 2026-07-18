const crypto = require('crypto');
const path = require('path');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { simpleParser } = require('mailparser');
const Dossier = require('../../models/Folder/Dossier');
const DocumentEditorState = require('../../models/DocumentEditor/DocumentEditorState');
const DocumentHistory = require('../../models/Storage/DocumentHistory');
const AgendaEvent = require('../../models/AgendaEvents/AgendaEvent');
const DossierEventLink = require('../../models/AgendaEvents/DossierEventLink');
const AIContextCache = require('../../models/AI/AIContextCache');
const { resolveDocumentContent } = require('../documentContentService');
const { getProviderForStorageKey } = require('../storage');
const { redactPersonalData } = require('./redaction');
const { AIError } = require('./errors');

const EXTRACTOR_VERSION = 'kheops-context-v1';
const MAX_DOCUMENTS = 50;
const SEGMENT_SIZE = 1800;
const STOP_WORDS = new Set('avec dans pour sans sous mais donc alors cette comme plus moins entre être avoir faire sont vous nous elle ils elles des les une un aux par sur que qui quoi dont leur leurs ses son sa ces est été'.split(' '));

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function escapeSourceContent(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeSourceAttribute(value) {
  return String(value || '').replace(/["'<>\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function blocksToSegments(blocks, output = [], state = { paragraph: 0 }) {
  for (const block of blocks || []) {
    if (!block) continue;
    if (Array.isArray(block.runs)) {
      const text = block.runs.map((run) => run.text || '').join('').trim();
      if (text) output.push({ text, anchor: { paragraph: ++state.paragraph, blockId: block.id || null } });
    }
    if (block.type === 'table') {
      for (const row of block.rows || []) for (const cell of row.cells || []) blocksToSegments(cell.blocks, output, state);
    }
  }
  return output;
}

function paragraphsToSegments(text, anchors = {}) {
  const paragraphs = String(text || '').split(/\n+/).map((entry) => entry.trim()).filter(Boolean);
  const output = [];
  let current = '';
  let startParagraph = 1;
  const push = (endParagraph) => {
    if (!current) return;
    output.push({ text: current.trim(), anchor: { ...anchors, paragraph: startParagraph, endParagraph } });
    current = '';
  };
  paragraphs.forEach((paragraph, index) => {
    if (current && current.length + paragraph.length + 1 > SEGMENT_SIZE) {
      push(index);
      startParagraph = index + 1;
    }
    current += `${current ? '\n' : ''}${paragraph}`;
  });
  push(paragraphs.length);
  return output;
}

async function extractPdf(buffer) {
  const pages = [];
  let counter = 0;
  const pagerender = async (pageData) => {
    const content = await pageData.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });
    const text = content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim();
    pages.push({ page: ++counter, text });
    return text;
  };
  const result = await pdfParse(buffer, { pagerender });
  const nativeText = pages.map((page) => page.text).join('\n\n').trim() || String(result.text || '').trim();
  const scanned = nativeText.length < Math.max(50, Number(result.numpages || 1) * 20);
  return {
    text: nativeText,
    segments: pages.length
      ? pages.flatMap((page) => paragraphsToSegments(page.text, { page: page.page }))
      : paragraphsToSegments(nativeText),
    warning: scanned ? 'PDF probablement scanné : texte natif insuffisant, OCR requis mais non disponible sur ce serveur.' : null,
  };
}

async function extractBuffer(buffer, filename, mime) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.docx' || /wordprocessingml/i.test(mime || '')) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value || '', segments: paragraphsToSegments(result.value || ''), warning: null };
  }
  if (ext === '.pdf' || mime === 'application/pdf') return extractPdf(buffer);
  if (ext === '.eml' || mime === 'message/rfc822') {
    const mail = await simpleParser(buffer, { skipHtmlToText: false, skipTextToHtml: true });
    const headers = [`Objet: ${mail.subject || ''}`, `De: ${mail.from?.text || ''}`, `À: ${mail.to?.text || ''}`, `Date: ${mail.date?.toISOString?.() || ''}`].join('\n');
    const text = `${headers}\n\n${mail.text || stripHtml(mail.html)}`;
    return { text, segments: paragraphsToSegments(text), warning: null };
  }
  if (['.txt', '.md', '.csv'].includes(ext) || /^text\//i.test(mime || '')) {
    const text = buffer.toString('utf8');
    return { text, segments: paragraphsToSegments(text), warning: null };
  }
  if (ext === '.html' || ext === '.htm' || mime === 'text/html') {
    const text = stripHtml(buffer.toString('utf8'));
    return { text, segments: paragraphsToSegments(text), warning: null };
  }
  if (ext === '.json' || mime === 'application/json') {
    let parsed;
    try { parsed = JSON.parse(buffer.toString('utf8')); } catch (_) { parsed = buffer.toString('utf8'); }
    const text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2);
    return { text, segments: paragraphsToSegments(text), warning: null };
  }
  throw new AIError('AI_CONTEXT_FORMAT_UNSUPPORTED', `Le format ${ext || mime || 'inconnu'} n’est pas pris en charge.`, { statusCode: 415 });
}

async function extractDocument({ tenantId, matterId, document, cacheEnabled = process.env.AI_CONTEXT_CACHE_ENABLED === 'true' }) {
  const documentId = document._id;
  const native = await DocumentEditorState.findOne({ tenantId, documentId }).select('structuredDocument revision updatedAt').lean();
  if (native) {
    const versionId = `native:${native.revision}`;
    const segments = blocksToSegments(native.structuredDocument?.blocks || []);
    const text = segments.map((segment) => segment.text).join('\n\n');
    return { text, segments, versionId, checksum: sha256(text), mime: 'application/x-kheops-document', filename: document.nomDocument || 'Document Kheops', warning: null };
  }
  const content = await resolveDocumentContent({
    tenantId, dossierId: matterId, documentId, fallbackFilename: document.nomDocument,
  });
  if (!content?.buffer) throw new AIError('AI_CONTEXT_DOCUMENT_MISSING', `Le contenu de « ${document.nomDocument || documentId} » est indisponible.`, { statusCode: 409 });
  const checksum = sha256(content.buffer);
  const versionId = String(content.versionId || `sha256:${checksum}`);
  if (cacheEnabled) {
    const cached = await AIContextCache.findOne({ tenantId, matterId, documentId, versionId, extractorVersion: EXTRACTOR_VERSION })
      .select('+text +segments').lean();
    if (cached && cached.checksum === checksum) return { ...cached, warning: cached.extractionWarning };
  }
  const extracted = await extractBuffer(content.buffer, content.filename || document.nomDocument, content.mime);
  const result = {
    ...extracted,
    versionId,
    checksum,
    mime: content.mime,
    filename: content.filename || document.nomDocument,
  };
  if (cacheEnabled) {
    await AIContextCache.findOneAndUpdate(
      { tenantId, matterId, documentId, versionId, extractorVersion: EXTRACTOR_VERSION },
      {
        $set: {
          checksum, mime: result.mime, filename: result.filename, text: result.text,
          segments: result.segments, extractionWarning: result.warning,
          expiresAt: new Date(Date.now() + Number(process.env.AI_CONTEXT_CACHE_TTL_DAYS || 30) * 86400000),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  return result;
}

async function extractHistoryVersion({ tenantId, matterId, document, version, cacheEnabled = process.env.AI_CONTEXT_CACHE_ENABLED === 'true' }) {
  const documentId = document._id;
  const versionId = String(version.versionId);
  if (cacheEnabled) {
    const cached = await AIContextCache.findOne({ tenantId, matterId, documentId, versionId, extractorVersion: EXTRACTOR_VERSION })
      .select('+text +segments').lean();
    if (cached && (!version.checksum || cached.checksum === version.checksum)) return { ...cached, warning: cached.extractionWarning };
  }
  let buffer;
  if (version.structuredDocument) {
    const segments = blocksToSegments(version.structuredDocument.blocks || []);
    const text = segments.map((segment) => segment.text).join('\n\n');
    return { text, segments, versionId, checksum: version.structuredChecksum || sha256(text), mime: 'application/x-kheops-document', filename: version.filename || document.nomDocument, warning: null };
  }
  const provider = await getProviderForStorageKey(tenantId, version.storageKey);
  buffer = await provider.downloadVersion({ storageKey: version.storageKey });
  const checksum = sha256(buffer);
  const extracted = await extractBuffer(buffer, version.filename || document.nomDocument, version.mime);
  const result = { ...extracted, versionId, checksum, mime: version.mime, filename: version.filename || document.nomDocument };
  if (cacheEnabled) {
    await AIContextCache.findOneAndUpdate(
      { tenantId, matterId, documentId, versionId, extractorVersion: EXTRACTOR_VERSION },
      {
        $set: {
          checksum, mime: result.mime, filename: result.filename, text: result.text,
          segments: result.segments, extractionWarning: result.warning,
          expiresAt: new Date(Date.now() + Number(process.env.AI_CONTEXT_CACHE_TTL_DAYS || 30) * 86400000),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  return result;
}

async function extractRequestedDocumentVersions({ tenantId, matterId, document, manifest }) {
  const requestedVersion = manifest.requestedVersions?.[String(document._id)];
  if (!requestedVersion && !manifest.includeAllVersions) {
    return [await extractDocument({ tenantId, matterId, document })];
  }
  const history = await DocumentHistory.findOne({ tenantId, dossierId: matterId, documentId: document._id }).lean();
  if (!history) {
    if (requestedVersion) throw new AIError('AI_CONTEXT_VERSION_NOT_FOUND', `La version demandée de « ${document.nomDocument} » est introuvable.`, { statusCode: 409 });
    return [await extractDocument({ tenantId, matterId, document })];
  }
  if (requestedVersion) {
    const version = (history.versions || []).find((entry) => String(entry.versionId) === String(requestedVersion));
    if (!version) throw new AIError('AI_CONTEXT_VERSION_NOT_FOUND', `La version demandée de « ${document.nomDocument} » est introuvable.`, { statusCode: 409 });
    return [await extractHistoryVersion({ tenantId, matterId, document, version })];
  }
  const limit = Math.max(1, Math.min(50, Number(process.env.AI_MAX_VERSIONS_PER_DOCUMENT || 10)));
  const versions = [...(history.versions || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
  const extracted = [];
  for (const version of versions) extracted.push(await extractHistoryVersion({ tenantId, matterId, document, version }));
  return extracted.length ? extracted : [await extractDocument({ tenantId, matterId, document })];
}

function queryTerms(instruction, taskType) {
  return [...new Set(`${taskType || ''} ${instruction || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]{3,}/g) || [])].filter((term) => !STOP_WORDS.has(term)).slice(0, 50);
}

function segmentScore(segment, terms, index) {
  const haystack = segment.text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let score = index === 0 ? 0.2 : 0;
  for (const term of terms) if (haystack.includes(term)) score += 1 + Math.min(3, haystack.split(term).length - 2);
  if (/\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/.test(segment.text)) score += 0.1;
  return score;
}

function selectPassages(extractions, { instruction, taskType, maxCharacters }) {
  const terms = queryTerms(instruction, taskType);
  const candidates = [];
  extractions.forEach((source, sourceIndex) => {
    (source.segments || []).forEach((segment, index) => candidates.push({ sourceIndex, segment, score: segmentScore(segment, terms, index), index }));
  });
  candidates.sort((a, b) => b.score - a.score || a.sourceIndex - b.sourceIndex || a.index - b.index);
  const perSource = new Map();
  const selected = [];
  let characters = 0;
  for (const candidate of candidates) {
    if ((perSource.get(candidate.sourceIndex) || 0) >= Number(process.env.AI_MAX_PASSAGES_PER_DOCUMENT || 8)) continue;
    if (characters + candidate.segment.text.length > maxCharacters && selected.length) continue;
    selected.push(candidate);
    characters += candidate.segment.text.length;
    perSource.set(candidate.sourceIndex, (perSource.get(candidate.sourceIndex) || 0) + 1);
    if (characters >= maxCharacters) break;
  }
  return selected.sort((a, b) => a.sourceIndex - b.sourceIndex || a.index - b.index);
}

function safeMatterSnapshot(dossier, manifest = {}) {
  const details = dossier.dossier?.dossier || {};
  const snapshot = { reference: dossier.reference };
  const noGranularChoice = !manifest.includeMetadata && !manifest.includeContacts && !manifest.includeNotes;
  if (manifest.includeMetadata || noGranularChoice) {
    Object.assign(snapshot, {
      nom: details.nom || null,
      type: details.type_dossier || null,
      description: details.description_dossier || null,
      dateCreation: details.date_Creation_Dossier || dossier.dateCreation || null,
      juridiction: details.selectedTribunalAffaire || null,
    });
  }
  if (manifest.includeContacts) {
    snapshot.parties = dossier.dossier?.parties || { pour: [], contre: [] };
    snapshot.contacts = dossier.dossier?.contactsDuDossier || [];
    snapshot.avocatsResponsables = dossier.dossier?.avocatsResponsables || [];
  }
  if (manifest.includeNotes) snapshot.notes = details.informationsComplementaires || null;
  return snapshot;
}

function assertSelectionSource(manifest, allowedById) {
  if (!manifest.selectedText || !manifest.currentDocumentId) return;
  if (!allowedById.has(String(manifest.currentDocumentId))) {
    throw new AIError('AI_CONTEXT_SELECTION_DOCUMENT_FORBIDDEN', 'Le document associé à la sélection n’appartient pas à ce dossier.', { statusCode: 403 });
  }
}

function assertConfidentialTransfer(document, manifest, allowConfidentialByPolicy) {
  const confidential = document?.confidential === true || /confidentiel|secret/i.test(document?.categorie || '');
  if (!confidential) return;
  if (!allowConfidentialByPolicy) {
    throw new AIError('AI_CONFIDENTIAL_CONTEXT_FORBIDDEN', `La politique de connexion interdit l’envoi du document « ${document.nomDocument || document._id} ».`, { statusCode: 403 });
  }
  if (manifest.allowConfidentialDocuments !== true) {
    throw new AIError('AI_CONFIDENTIAL_CONTEXT_CONFIRMATION_REQUIRED', `Le document « ${document.nomDocument || document._id} » nécessite une confirmation explicite de confidentialité.`, { statusCode: 409 });
  }
}

async function matterTimeline(matterId) {
  const links = await DossierEventLink.find({ dossier: matterId }).select('agendaEvent').lean();
  const linkedIds = links.map((link) => link.agendaEvent);
  const events = await AgendaEvent.find({
    $or: [{ dossier: matterId }, ...(linkedIds.length ? [{ _id: { $in: linkedIds } }] : [])],
  }).select('title startDate endDate description type updatedAt').sort({ startDate: 1 }).lean();
  return events.map((event) => ({
    id: String(event._id), title: event.title, startDate: event.startDate,
    endDate: event.endDate, description: event.description, type: event.type,
    version: event.updatedAt,
  }));
}

async function buildContext({ tenantId, matterId, manifest, instruction, taskType, allowConfidentialByPolicy = false }) {
  if (manifest.selectedText && String(manifest.selectedText).length > 30000) throw new AIError('AI_CONTEXT_SELECTION_TOO_LARGE', 'La sélection dépasse 30 000 caractères.', { statusCode: 413 });
  const dossier = await Dossier.findOne({ _id: matterId, tenantId }).lean();
  if (!dossier) throw new AIError('AI_MATTER_NOT_FOUND', 'Dossier introuvable dans ce cabinet.', { statusCode: 404 });
  const allDocuments = dossier.dossier?.documents || [];
  const allowedById = new Map(allDocuments.map((document) => [String(document._id), document]));
  assertSelectionSource(manifest, allowedById);
  const excluded = new Set((manifest.excludedDocumentIds || []).map(String));
  const requestedIds = [...new Set((manifest.documentIds || []).map(String))].filter((id) => !excluded.has(id));
  if (requestedIds.length > MAX_DOCUMENTS) throw new AIError('AI_CONTEXT_TOO_MANY_DOCUMENTS', `Au maximum ${MAX_DOCUMENTS} documents peuvent être transmis.`, { statusCode: 413 });
  const documents = requestedIds.map((id) => {
    const document = allowedById.get(id);
    if (!document) throw new AIError('AI_CONTEXT_DOCUMENT_FORBIDDEN', 'Un document demandé n’appartient pas à ce dossier.', { statusCode: 403 });
    return document;
  });
  const extractions = [];
  for (const document of documents) {
    assertConfidentialTransfer(document, manifest, allowConfidentialByPolicy);
    const versions = await extractRequestedDocumentVersions({ tenantId, matterId, document, manifest });
    for (const extracted of versions) {
      extractions.push({
        ...extracted,
        documentId: document._id,
        label: `${document.nomDocument || extracted.filename}${versions.length > 1 ? ` — version ${extracted.versionId}` : ''}`,
      });
    }
  }
  const maxCharacters = Math.max(1000, Math.min(2000000, Number(manifest.maxCharacters || 200000)));
  const selected = selectPassages(extractions, { instruction, taskType, maxCharacters });
  const warnings = extractions.map((source) => source.warning).filter(Boolean);
  const anchors = [];
  const sections = [];
  if (manifest.includeMatterData) {
    let matterText = JSON.stringify(safeMatterSnapshot(dossier, manifest), null, 2).slice(0, Math.min(50000, maxCharacters));
    if (manifest.redactionCategories?.length) matterText = redactPersonalData(matterText, manifest.redactionCategories);
    const id = `S${anchors.length + 1}`;
    anchors.push({ sourceId: id, sourceType: 'matter', documentId: null, versionId: String(dossier._lastUpdated?.getTime?.() || dossier._lastUpdated || ''), label: `Dossier ${dossier.reference}`, checksum: sha256(matterText), excerpt: matterText.slice(0, 500), page: null, paragraph: null });
    sections.push(`<SOURCE id="${id}" type="matter" label="${safeSourceAttribute(`Dossier ${dossier.reference}`)}">\n${escapeSourceContent(matterText)}\n</SOURCE>`);
  }
  if (manifest.includeTimeline) {
    let timelineText = JSON.stringify(await matterTimeline(matterId), null, 2).slice(0, 50000);
    if (manifest.redactionCategories?.length) timelineText = redactPersonalData(timelineText, manifest.redactionCategories);
    const id = `S${anchors.length + 1}`;
    anchors.push({ sourceId: id, sourceType: 'matter', documentId: null, versionId: String(dossier._lastUpdated || ''), label: `Chronologie du dossier ${dossier.reference}`, checksum: sha256(timelineText), excerpt: timelineText.slice(0, 500), page: null, paragraph: null });
    sections.push(`<SOURCE id="${id}" type="matter" label="${safeSourceAttribute(`Chronologie du dossier ${dossier.reference}`)}">\n${escapeSourceContent(timelineText)}\n</SOURCE>`);
  }
  if (manifest.selectedText) {
    let text = String(manifest.selectedText);
    if (manifest.redactionCategories?.length) text = redactPersonalData(text, manifest.redactionCategories);
    const id = `S${anchors.length + 1}`;
    anchors.push({ sourceId: id, sourceType: 'selection', documentId: manifest.currentDocumentId || null, versionId: null, label: 'Sélection utilisateur', checksum: sha256(text), excerpt: text.slice(0, 500), page: null, paragraph: null });
    sections.push(`<SOURCE id="${id}" type="selection" label="Sélection utilisateur">\n${escapeSourceContent(text)}\n</SOURCE>`);
  }
  for (const item of selected) {
    const source = extractions[item.sourceIndex];
    let text = item.segment.text;
    if (manifest.redactionCategories?.length) text = redactPersonalData(text, manifest.redactionCategories);
    const id = `S${anchors.length + 1}`;
    const anchor = {
      sourceId: id, sourceType: 'document', documentId: source.documentId,
      versionId: source.versionId, label: source.label, mime: source.mime,
      checksum: source.checksum, excerpt: text.slice(0, 500),
      page: item.segment.anchor?.page || null, paragraph: item.segment.anchor?.paragraph || null,
      blockId: item.segment.anchor?.blockId || null,
    };
    anchors.push(anchor);
    sections.push(`<SOURCE id="${id}" type="document" label="${safeSourceAttribute(source.label)}" version="${safeSourceAttribute(source.versionId)}">\n${escapeSourceContent(text)}\n</SOURCE>`);
  }
  if (!sections.length && warnings.some((warning) => /OCR requis/i.test(warning))) {
    throw new AIError('AI_CONTEXT_OCR_REQUIRED', 'Le document sélectionné ne contient pas assez de texte natif. Un OCR est requis avant l’analyse.', { statusCode: 422, details: { warnings } });
  }
  if (!sections.length) throw new AIError('AI_CONTEXT_EMPTY', 'Sélectionnez au moins une source ou une donnée de dossier.', { statusCode: 400 });
  return { contextText: sections.join('\n\n'), anchors, warnings, selectedCharacters: sections.join('').length, requestedDocuments: documents.length };
}

function citedAnchors(text, anchors) {
  const ids = new Set((String(text || '').match(/\[S\d+\]/g) || []).map((id) => id.slice(1, -1)));
  return anchors.filter((anchor) => ids.has(anchor.sourceId));
}

module.exports = {
  EXTRACTOR_VERSION,
  stripHtml,
  escapeSourceContent,
  safeSourceAttribute,
  blocksToSegments,
  paragraphsToSegments,
  extractBuffer,
  extractDocument,
  extractHistoryVersion,
  extractRequestedDocumentVersions,
  queryTerms,
  selectPassages,
  buildContext,
  citedAnchors,
  matterTimeline,
  assertConfidentialTransfer,
  safeMatterSnapshot,
  assertSelectionSource,
};
