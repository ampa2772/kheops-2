import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

import {
  blockToEditableHtml,
  blocksToEditableHtml,
  collectStructuredDocument,
  countDocument,
  createEmptyDocument,
  DEFAULT_HORIZONTAL_MARGIN_PX,
  documentToPrintHtml,
  MAX_PAGE_MARGIN_MM,
  MIN_HORIZONTAL_MARGIN_PX,
  mmToPx,
  normalizePageMargins,
  pxToMm,
  replaceInDocument,
} from './documentModel';
import {
  applyDocumentTemplate,
  downloadEditorExport,
  downloadEditorOriginal,
  importEditorDocx,
  listDocumentReferences,
  loadEditorDocument,
  openDocumentReference,
  prepareDocumentPublication,
  reconvertEditorOriginal,
  reloadEditorCanonical,
  saveEditorDocument,
  triggerBlobDownload,
} from './documentEditorApi';
import { createEditorCommandRegistry } from './commandRegistry';
import {
  countPlainText,
  plainTextToStructuredDocument,
  structuredDocumentToPlainText,
} from './plainTextModel';
import DocumentInspectorPanel from './DocumentInspectorPanel';
import ResponsiveRibbon from './ResponsiveRibbon';
import { isFeatureEnabled } from '../../utils/featureFlags';
import useElementWidth from './useElementWidth';
import EmailComposeModal from '../contactActions/EmailComposeModal';
import './KheopsDocumentEditor.css';

const PAGE_DEFAULTS = createEmptyDocument().page;
const MAX_HORIZONTAL_MARGIN_PX = Math.round(mmToPx(MAX_PAGE_MARGIN_MM));
const PAGE_SIZES_MM = Object.freeze({
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
});
const LazyAIAssistantPanel = React.lazy(() => import('../ai/AIAssistantPanel'));

function browserFontSize(pt) {
  if (pt <= 8) return 1;
  if (pt <= 10) return 2;
  if (pt <= 12) return 3;
  if (pt <= 14) return 4;
  if (pt <= 18) return 5;
  if (pt <= 24) return 6;
  return 7;
}

function apiMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

function resolveDocumentTitle(structuredTitle, visibleTitle) {
  const candidate = String(structuredTitle || '').trim();
  const fallback = String(visibleTitle || '').trim() || 'Document sans titre';
  // Certains anciens DOCX ont été enregistrés physiquement sous leur ObjectId.
  // Ce nom technique ne doit pas remplacer le libellé métier déjà visible dans
  // le dossier lorsque l'utilisateur ouvre l'Éditeur Kheops.
  if (!candidate || /^[a-f0-9]{24}$/i.test(candidate)) return fallback;
  return candidate;
}

function CompatibilityBadge({ compatibility, onClick }) {
  if (!compatibility) return null;
  const level = compatibility.level || 'native';
  return (
    <button type="button" className={`kheops-editor-compatibility is-${level}`} title={(compatibility.warnings || []).join('\n') || 'Ouvrir le rapport de compatibilité'} onClick={onClick}>
      {compatibility.label || (level === 'native' ? 'Document Kheops' : 'Compatibilité')}
    </button>
  );
}

/**
 * Éditeur de document autonome.
 *
 * `documentId` accepte indifféremment StoredDocument._id ou son documentId.
 * Le serveur résout l'identifiant canonique et vérifie systématiquement le
 * cabinet. Sans documentId, le composant reste utilisable en mode local via
 * `initialDocument` et `onSaved`.
 */
export default function KheopsDocumentEditor({
  open,
  documentId,
  title = 'Document sans titre',
  initialDocument = null,
  matterId = '',
  matterTitle = '',
  aiSources = [],
  aiEnabled = true,
  onAICitationOpen,
  onAIDocumentCreated,
  onOpenAISettings,
  onOpenAdvancedEditor,
  advancedEditorLoading = false,
  onClose,
  onSaved,
}) {
  const editorRef = useRef(null);
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const imageInputRef = useRef(null);
  const importInputRef = useRef(null);
  const workspaceRef = useRef(null);
  const aiButtonRef = useRef(null);
  const panelTriggerRef = useRef(null);
  const savedRangeRef = useRef(null);
  const selectedReferenceRef = useRef(null);
  const searchCursorRef = useRef({ node: 0, offset: 0 });
  const documentRef = useRef(createEmptyDocument(title));
  const pageRef = useRef(PAGE_DEFAULTS);
  const revisionRef = useRef(0);
  const changeCounterRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const saveFunctionRef = useRef(null);
  const closeFunctionRef = useRef(null);
  const mountedRef = useRef(true);
  const pendingAIProvenanceRef = useRef([]);
  const publicationKeyRef = useRef('');
  const plainTextRef = useRef('');

  const [loading, setLoading] = useState(false);
  const [loadBlocked, setLoadBlocked] = useState(false);
  const [loadBlockCode, setLoadBlockCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [revision, setRevision] = useState(0);
  const [revisions, setRevisions] = useState([]);
  const [documentStatus, setDocumentStatus] = useState('draft');
  const [structuredDocument, setStructuredDocument] = useState(() => createEmptyDocument(title));
  const [fileFormat, setFileFormat] = useState({ kind: 'docx', filename: '', mime: '' });
  const [plainText, setPlainText] = useState('');
  const [documentTitle, setDocumentTitle] = useState(title);
  const [canonicalDocumentId, setCanonicalDocumentId] = useState(documentId || '');
  const [page, setPage] = useState(PAGE_DEFAULTS);
  const [counts, setCounts] = useState({ words: 0, characters: 0, charactersNoSpaces: 0, pages: 1 });
  const [compatibility, setCompatibility] = useState({ level: 'native', label: 'Document Kheops', warnings: [] });
  const [dismissedCompatibilityWarningKey, setDismissedCompatibilityWarningKey] = useState('');
  const [originalAvailable, setOriginalAvailable] = useState(false);
  const [originalFilename, setOriginalFilename] = useState('');
  const [reconvertingOriginal, setReconvertingOriginal] = useState(false);
  const [status, setStatus] = useState('Prêt');
  const [error, setError] = useState('');
  const [showLayout, setShowLayout] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showCompatibility, setShowCompatibility] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [activePanel, setActivePanel] = useState('');
  const [aiTaskType, setAITaskType] = useState('free-question');
  const [selectedText, setSelectedText] = useState('');
  const [inTable, setInTable] = useState(false);
  const [selectionType, setSelectionType] = useState('text');
  const [activeRibbonTab, setActiveRibbonTab] = useState('home');
  const [ribbonCollapsed, setRibbonCollapsed] = useState(() => {
    try { return localStorage.getItem('kheops.editor.ribbonCollapsed') === 'true'; } catch (_error) { return false; }
  });
  const [focusMode, setFocusMode] = useState(false);
  const [fitToWidth, setFitToWidth] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [search, setSearch] = useState('');
  const [replacement, setReplacement] = useState('');
  const [publishingEmail, setPublishingEmail] = useState(false);
  const [openingAdvancedEditor, setOpeningAdvancedEditor] = useState(false);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState([]);
  const workspaceWidth = useElementWidth(workspaceRef, 1024);
  const emailDossiers = useMemo(() => (
    matterId ? [{ id: String(matterId), reference: matterTitle || 'Dossier actif', name: matterTitle || '' }] : []
  ), [matterId, matterTitle]);
  const compatibilityWarnings = Array.isArray(compatibility?.warnings)
    ? compatibility.warnings.filter(Boolean)
    : [];
  const compatibilityWarningKey = compatibilityWarnings.length > 0
    ? `${documentId || canonicalDocumentId || documentTitle}::${compatibilityWarnings.join('\u241e')}`
    : '';
  const showCompatibilityWarning = Boolean(
    compatibilityWarningKey
    && dismissedCompatibilityWarningKey !== compatibilityWarningKey
  );
  const canReconvertOriginal = Boolean(
    documentId
    && originalAvailable
    && /\.doc$/i.test(String(originalFilename || '').trim())
  );

  const hydrate = useCallback((input, metadata = {}) => {
    const source = input && typeof input === 'object' ? input : createEmptyDocument(title);
    const sourcePage = source.page && typeof source.page === 'object' ? source.page : {};
    const nextPage = {
      ...PAGE_DEFAULTS,
      ...sourcePage,
      margins: normalizePageMargins(sourcePage.margins),
    };
    const next = { ...source, page: nextPage };
    const nextFileFormat = metadata.fileFormat?.kind === 'text'
      ? metadata.fileFormat
      : { kind: 'docx', ...(metadata.fileFormat || {}) };
    const nextPlainText = nextFileFormat.kind === 'text'
      ? String(metadata.textContent ?? structuredDocumentToPlainText(next))
      : '';
    documentRef.current = next;
    plainTextRef.current = nextPlainText;
    pageRef.current = nextPage;
    setStructuredDocument(next);
    setFileFormat(nextFileFormat);
    setPlainText(nextPlainText);
    revisionRef.current = Number(metadata.revision || 0);
    setRevision(revisionRef.current);
    setRevisions(Array.isArray(metadata.revisions) ? metadata.revisions : []);
    setDocumentStatus(metadata.status || next.status || 'draft');
    setDocumentTitle(resolveDocumentTitle(next.title, title));
    if (metadata.documentId) setCanonicalDocumentId(String(metadata.documentId));
    setPage(nextPage);
    setCounts(metadata.counts || (nextFileFormat.kind === 'text' ? countPlainText(nextPlainText) : countDocument(next)));
    setCompatibility(metadata.compatibility || { level: 'native', label: 'Document Kheops', warnings: [] });
    setOriginalAvailable(Boolean(metadata.original && metadata.original.available));
    setOriginalFilename(String(metadata.original?.filename || ''));
    setLoadBlocked(false);
    setLoadBlockCode('');
    setDirty(Boolean(metadata.syncPending));
    changeCounterRef.current = metadata.syncPending ? 1 : 0;
    requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      if (editorRef.current) {
        if (nextFileFormat.kind === 'text') editorRef.current.value = nextPlainText;
        else editorRef.current.innerHTML = blocksToEditableHtml(next.blocks);
      }
      if (headerRef.current) {
        const visibleHeader = nextPage.firstPageDifferent && nextPage.firstPageHeader
          ? nextPage.firstPageHeader
          : nextPage.header;
        headerRef.current.innerHTML = blocksToEditableHtml(visibleHeader?.blocks);
      }
      if (footerRef.current) footerRef.current.innerHTML = blocksToEditableHtml(nextPage.footer?.blocks);
    });
  }, [title]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => setCanonicalDocumentId(documentId || ''), [documentId]);

  useEffect(() => {
    if (open) setDismissedCompatibilityWarningKey('');
  }, [documentId, open]);

  useEffect(() => {
    if (fileFormat.kind !== 'text') return;
    if (!['file', 'home', 'insert', 'review', 'view', 'matter', 'ai'].includes(activeRibbonTab)) {
      setActiveRibbonTab('home');
    }
    setShowLayout(false);
    if (['layout', 'template', 'references'].includes(activePanel)) setActivePanel('');
  }, [activePanel, activeRibbonTab, fileFormat.kind]);

  const loadDocument = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setLoadBlocked(false);
    setLoadBlockCode('');
    setError('');
    setStatus('Chargement…');
    try {
      if (documentId) {
        const data = await loadEditorDocument(documentId);
        if (data.exists) {
          hydrate(data.document, data);
          setStatus(data.syncPending
            ? `Brouillon chargé — synchronisation ${data.fileFormat?.kind === 'text' ? 'TXT' : 'DOCX'} à reprendre`
            : `Version ${data.revision} chargée`);
        } else {
          hydrate(initialDocument || createEmptyDocument(title));
          setStatus('Nouveau document — enregistrement automatique actif');
        }
      } else {
        hydrate(initialDocument || createEmptyDocument(title));
        setStatus('Mode local');
      }
    } catch (loadError) {
      setError(apiMessage(loadError, 'Impossible de charger le document.'));
      setStatus('Chargement impossible');
      setLoadBlocked(true);
      setLoadBlockCode(loadError?.response?.data?.error || 'LOAD_FAILED');
      if (loadError?.response?.data?.editorRevision !== undefined) {
        revisionRef.current = Number(loadError.response.data.editorRevision) || 0;
        setRevision(revisionRef.current);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [documentId, hydrate, initialDocument, open, title]);

  useEffect(() => {
    if (open) loadDocument();
  }, [loadDocument, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (activePanel) {
          event.preventDefault();
          setActivePanel('');
          requestAnimationFrame(() => panelTriggerRef.current?.focus?.());
        } else if (showAI) {
          event.preventDefault();
          setShowAI(false);
          requestAnimationFrame(() => aiButtonRef.current?.focus());
        } else if (showCompatibility) {
          event.preventDefault();
          setShowCompatibility(false);
        } else if (!showSearch && !showLayout) closeFunctionRef.current?.();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveFunctionRef.current?.(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setShowSearch(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setShowSearch(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activePanel, open, showAI, showCompatibility, showLayout, showSearch]);

  const collectNow = useCallback(() => {
    if (!editorRef.current) return documentRef.current;
    if (fileFormat.kind === 'text') {
      const next = plainTextToStructuredDocument(plainTextRef.current, documentRef.current, documentTitle);
      documentRef.current = next;
      setStructuredDocument(next);
      return next;
    }
    const next = collectStructuredDocument({
      editor: editorRef.current,
      header: headerRef.current,
      footer: footerRef.current,
      title: documentTitle,
      page: pageRef.current,
      baseDocument: documentRef.current,
    });
    documentRef.current = next;
    setStructuredDocument(next);
    return next;
  }, [documentTitle, fileFormat.kind]);

  const markChanged = useCallback(() => {
    const next = collectNow();
    changeCounterRef.current += 1;
    setCounts(fileFormat.kind === 'text' ? countPlainText(plainTextRef.current) : countDocument(next));
    setDirty(true);
    setError('');
    setStatus('Modifications non enregistrées');
  }, [collectNow, fileFormat.kind]);

  const saveNow = useCallback(async (
    createVersion = false,
    statusOverride = null,
    reasonOverride = null,
    commentOverride = null,
  ) => {
    if (saveInFlightRef.current || loadBlocked) return null;
    const next = collectNow();
    const changeAtStart = changeCounterRef.current;
    const aiProvenanceAtStart = [...pendingAIProvenanceRef.current];
    const aiComment = aiProvenanceAtStart.length
      ? `Proposition IA appliquée : ${aiProvenanceAtStart.map((item) => [item.taskId && `tâche ${item.taskId}`, item.artifactId && `artefact ${item.artifactId}`, item.mode].filter(Boolean).join(' / ')).join(' ; ')}`.slice(0, 500)
      : '';
    const saveReason = reasonOverride || (aiProvenanceAtStart.length ? 'ai_proposal' : (createVersion ? 'manual' : undefined));
    const saveComment = commentOverride != null ? String(commentOverride).slice(0, 500) : (createVersion
      ? `Version créée depuis l’Éditeur Kheops${aiComment ? ` — ${aiComment}` : ''}`.slice(0, 500)
      : aiComment);
    if (!documentId) {
      onSaved?.({ document: next, revision: revisionRef.current, aiProvenance: aiProvenanceAtStart });
      if (aiProvenanceAtStart.length) pendingAIProvenanceRef.current = [];
      setDirty(false);
      setStatus('Enregistré localement');
      return { document: next };
    }
    saveInFlightRef.current = true;
    setSaving(true);
    setError('');
    setStatus(createVersion ? 'Création d’une version…' : 'Enregistrement automatique…');
    try {
      const data = await saveEditorDocument(documentId, {
        document: next,
        ...(fileFormat.kind === 'text' ? { plainText: plainTextRef.current } : {}),
        expectedRevision: revisionRef.current,
        createVersion,
        reason: saveReason,
        comment: saveComment,
        status: statusOverride || documentStatus,
        documentType: next.documentType,
        templateBinding: next.templateBinding,
        localOverrides: next.localOverrides,
      });
      revisionRef.current = Number(data.revision || revisionRef.current + 1);
      if (aiProvenanceAtStart.length) {
        const captured = new Set(aiProvenanceAtStart.map((item) => `${item.taskId || ''}:${item.artifactId || ''}:${item.mode || ''}`));
        pendingAIProvenanceRef.current = pendingAIProvenanceRef.current.filter((item) => !captured.has(`${item.taskId || ''}:${item.artifactId || ''}:${item.mode || ''}`));
      }
      setRevision(revisionRef.current);
      setDocumentStatus(data.status || statusOverride || documentStatus);
      if (Array.isArray(data.revisions) && data.revisions.length) setRevisions(data.revisions);
      else if (createVersion) {
        setRevisions((current) => [{
          revision: revisionRef.current,
          reason: saveReason || 'manual',
          comment: saveComment || '',
          savedAt: new Date().toISOString(),
          status: data.status || statusOverride || documentStatus,
        }, ...current.filter((item) => Number(item.revision) !== Number(revisionRef.current))]);
      }
      setStructuredDocument(data.document || next);
      if (data.fileFormat) setFileFormat(data.fileFormat);
      if (fileFormat.kind === 'text' && typeof data.textContent === 'string') {
        plainTextRef.current = data.textContent;
        setPlainText(data.textContent);
      }
      if (changeAtStart === changeCounterRef.current) setDirty(false);
      if (data.sync && data.sync.canonicalSynced === false) {
        setError(data.sync.message || 'Le brouillon est conservé, mais la copie centrale n’a pas pu être actualisée.');
        setStatus(`Brouillon enregistré — synchronisation ${fileFormat.kind === 'text' ? 'TXT' : 'DOCX'} à reprendre`);
      } else {
        setStatus(createVersion ? `Version ${revisionRef.current} enregistrée` : `Enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
      }
      onSaved?.(data);
      return data;
    } catch (saveError) {
      const conflict = saveError?.response?.status === 409;
      setError(apiMessage(saveError, 'Impossible d’enregistrer le document.'));
      setStatus(conflict ? 'Conflit de version — rechargez le document' : 'Enregistrement interrompu');
      return null;
    } finally {
      saveInFlightRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [collectNow, documentId, documentStatus, fileFormat.kind, loadBlocked, onSaved]);

  saveFunctionRef.current = saveNow;

  const handleOpenAdvancedEditor = useCallback(async () => {
    if (!documentId || !onOpenAdvancedEditor || saving || loading || loadBlocked || openingAdvancedEditor || advancedEditorLoading) return;
    setOpeningAdvancedEditor(true);
    setError('');
    setStatus('Synchronisation avant l’ouverture de l’éditeur avancé…');
    try {
      // Une sauvegarde explicite, même sans modification locale signalée, garantit
      // que le moteur avancé ouvre bien la dernière version canonique du document.
      const saved = await saveNow(false);
      if (!saved || saved?.sync?.canonicalSynced === false) return;
      setStatus('Ouverture de l’éditeur avancé…');
      const opened = await onOpenAdvancedEditor();
      if (!opened && mountedRef.current) {
        setError('L’éditeur avancé est momentanément indisponible. Le document reste ouvert et enregistré dans l’éditeur classique.');
        setStatus('Éditeur avancé indisponible');
      }
    } catch (switchError) {
      if (mountedRef.current) {
        setError(apiMessage(switchError, 'Impossible d’ouvrir l’éditeur avancé. Le document reste intact dans l’éditeur classique.'));
        setStatus('Ouverture de l’éditeur avancé interrompue');
      }
    } finally {
      if (mountedRef.current) setOpeningAdvancedEditor(false);
    }
  }, [advancedEditorLoading, documentId, loadBlocked, loading, onOpenAdvancedEditor, openingAdvancedEditor, saveNow, saving]);

  useEffect(() => {
    if (!open || !dirty || !documentId || saving || status.startsWith('Conflit')) return undefined;
    const timer = setTimeout(() => saveFunctionRef.current?.(false), 2200);
    return () => clearTimeout(timer);
  }, [dirty, documentId, open, saving, status]);

  const rememberSelection = useCallback(() => {
    if (fileFormat.kind === 'text' && editorRef.current) {
      const start = editorRef.current.selectionStart ?? 0;
      const end = editorRef.current.selectionEnd ?? start;
      savedRangeRef.current = { plainText: true, start, end };
      setSelectedText(editorRef.current.value.slice(start, end));
      setInTable(false);
      setSelectionType('text');
      return;
    }
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const root = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    if ([editorRef.current, headerRef.current, footerRef.current].some((container) => container && container.contains(root))) {
      savedRangeRef.current = range.cloneRange();
      setSelectedText(selection.toString());
      setInTable(Boolean(root?.closest?.('table')));
      const reference = root?.closest?.('[data-kheops-reference]');
      selectedReferenceRef.current = reference || null;
      const nextType = reference ? 'reference'
        : root?.closest?.('[data-kheops-image]') ? 'image'
          : headerRef.current?.contains(root) ? 'header'
            : footerRef.current?.contains(root) ? 'footer'
              : root?.closest?.('[data-kheops-signature]') ? 'signature'
                : 'text';
      setSelectionType(nextType);
    }
  }, [fileFormat.kind]);

  const restoreSelection = useCallback(() => {
    const range = savedRangeRef.current;
    if (fileFormat.kind === 'text') {
      editorRef.current?.focus({ preventScroll: true });
      if (range?.plainText) editorRef.current?.setSelectionRange(range.start, range.end);
      return;
    }
    if (!range) {
      editorRef.current?.focus({ preventScroll: true });
      return;
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }, [fileFormat.kind]);

  const insertPlainText = useCallback((value, replaceSelection = true) => {
    const target = editorRef.current;
    if (!target) return;
    const saved = savedRangeRef.current?.plainText ? savedRangeRef.current : null;
    const start = saved?.start ?? target.selectionStart ?? target.value.length;
    const end = replaceSelection ? (saved?.end ?? target.selectionEnd ?? start) : start;
    const insertion = String(value || '');
    const nextValue = `${target.value.slice(0, start)}${insertion}${target.value.slice(end)}`;
    const cursor = start + insertion.length;
    plainTextRef.current = nextValue;
    setPlainText(nextValue);
    savedRangeRef.current = { plainText: true, start: cursor, end: cursor };
    requestAnimationFrame(() => {
      editorRef.current?.focus({ preventScroll: true });
      editorRef.current?.setSelectionRange(cursor, cursor);
    });
    markChanged();
  }, [markChanged]);

  const runCommand = useCallback((command, value = null) => {
    restoreSelection();
    if (fileFormat.kind === 'text') {
      if (command === 'undo' || command === 'redo') {
        document.execCommand(command, false, value);
        requestAnimationFrame(() => {
          if (!editorRef.current) return;
          plainTextRef.current = editorRef.current.value;
          setPlainText(editorRef.current.value);
          markChanged();
        });
      }
      return;
    }
    try { document.execCommand('styleWithCSS', false, true); } catch (_error) { /* navigateur ancien */ }
    document.execCommand(command, false, value);
    rememberSelection();
    markChanged();
  }, [fileFormat.kind, markChanged, rememberSelection, restoreSelection]);

  const applyParagraphLayout = useCallback((kind, value) => {
    restoreSelection();
    const selection = window.getSelection();
    let element = selection?.anchorNode;
    if (element?.nodeType !== Node.ELEMENT_NODE) element = element?.parentElement;
    const block = element?.closest?.('p,h1,h2,h3,h4,h5,h6,li,div');
    if (!block || ![editorRef.current, headerRef.current, footerRef.current].some((root) => root?.contains(block))) return;
    if (kind === 'line') block.style.lineHeight = String(value);
    if (kind === 'before') block.style.marginTop = `${Number(value) || 0}pt`;
    if (kind === 'after') block.style.marginBottom = `${Number(value) || 0}pt`;
    markChanged();
  }, [markChanged, restoreSelection]);

  const handleEditorKeyDown = useCallback((event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    if (event.shiftKey) runCommand('outdent');
    else document.execCommand('insertText', false, '\t');
    if (!event.shiftKey) markChanged();
  }, [markChanged, runCommand]);

  const insertLink = useCallback(() => {
    const url = window.prompt('Adresse du lien (https:// ou mailto:)');
    if (!url) return;
    if (!/^(?:https?:\/\/|mailto:)/i.test(url)) {
      setError('Le lien doit commencer par https://, http:// ou mailto:.');
      return;
    }
    runCommand('createLink', url);
  }, [runCommand]);

  const insertTable = useCallback(() => {
    restoreSelection();
    const cells = Array.from({ length: 3 }, () => '<td><p><br></p></td>').join('');
    const html = `<table data-kheops-table="true"><tbody>${Array.from({ length: 3 }, () => `<tr>${cells}</tr>`).join('')}</tbody></table><p><br></p>`;
    document.execCommand('insertHTML', false, html);
    markChanged();
  }, [markChanged, restoreSelection]);

  const selectedTableContext = useCallback(() => {
    restoreSelection();
    const selection = window.getSelection();
    let node = selection?.anchorNode;
    if (node?.nodeType !== Node.ELEMENT_NODE) node = node?.parentElement;
    const cell = node?.closest?.('td,th');
    const table = cell?.closest?.('table');
    if (!cell || !table || !editorRef.current?.contains(table)) return null;
    return { table, cell, row: cell.parentElement, columnIndex: cell.cellIndex };
  }, [restoreSelection]);

  const editSelectedTable = useCallback((action, value) => {
    const context = selectedTableContext();
    if (!context) {
      setError('Placez d’abord le curseur dans une cellule du tableau.');
      return;
    }
    const { table, cell, row, columnIndex } = context;
    if (action === 'add-row') {
      const nextRow = table.insertRow(row.rowIndex + 1);
      const count = Math.max(1, row.cells.length);
      for (let index = 0; index < count; index += 1) nextRow.insertCell().innerHTML = '<p><br></p>';
    } else if (action === 'delete-row') {
      if (table.rows.length <= 1) {
        setError('Un tableau doit conserver au moins une ligne.');
        return;
      }
      table.deleteRow(row.rowIndex);
    } else if (action === 'add-column') {
      Array.from(table.rows).forEach((tableRow) => {
        const nextCell = tableRow.insertCell(Math.min(columnIndex + 1, tableRow.cells.length));
        nextCell.innerHTML = '<p><br></p>';
      });
    } else if (action === 'delete-column') {
      if (row.cells.length <= 1) {
        setError('Un tableau doit conserver au moins une colonne.');
        return;
      }
      Array.from(table.rows).forEach((tableRow) => {
        if (tableRow.cells[columnIndex]) tableRow.deleteCell(columnIndex);
      });
    } else if (action === 'width') {
      const width = Number(value);
      Array.from(table.rows).forEach((tableRow) => {
        const target = tableRow.cells[columnIndex];
        if (target) target.style.width = width > 0 ? `${Math.min(90, Math.max(5, width))}%` : '';
      });
    } else if (action === 'align') {
      cell.style.textAlign = ['left', 'center', 'right'].includes(value) ? value : 'left';
    } else if (action === 'vertical-align') {
      cell.style.verticalAlign = ['top', 'middle', 'bottom'].includes(value) ? value : 'top';
    }
    rememberSelection();
    markChanged();
    setStatus('Tableau modifié');
  }, [markChanged, rememberSelection, selectedTableContext]);

  const insertPageBreak = useCallback(() => {
    restoreSelection();
    document.execCommand('insertHTML', false, '<hr class="kheops-editor-page-break" data-kheops-page-break="true" contenteditable="false"><p><br></p>');
    markChanged();
  }, [markChanged, restoreSelection]);

  const handleImageFile = useCallback((event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!/^image\/(?:png|jpe?g|gif|webp)$/i.test(file.type) || file.size > 2.5 * 1024 * 1024) {
      setError('Choisissez une image PNG, JPEG, GIF ou WebP de moins de 2,5 Mo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      restoreSelection();
      const alt = file.name.replace(/[<>"']/g, '');
      document.execCommand('insertHTML', false, `<figure class="kheops-editor-image" data-kheops-image="true" style="text-align:center"><img src="${reader.result}" alt="${alt}" style="width:320px;max-width:100%"><figcaption>${alt}</figcaption></figure><p><br></p>`);
      markChanged();
    };
    reader.readAsDataURL(file);
  }, [markChanged, restoreSelection]);

  const updatePage = useCallback((patch) => {
    const current = pageRef.current || PAGE_DEFAULTS;
    const next = { ...current, ...patch, margins: { ...current.margins, ...(patch.margins || {}) } };
    pageRef.current = next;
    setPage(next);
    requestAnimationFrame(markChanged);
  }, [markChanged]);

  const updateHorizontalMargin = useCallback((side, value) => {
    if (side !== 'left' && side !== 'right') return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const pixels = Math.max(
      MIN_HORIZONTAL_MARGIN_PX,
      Math.min(MAX_HORIZONTAL_MARGIN_PX, Math.round(numeric)),
    );
    updatePage({ margins: { [side]: Math.min(MAX_PAGE_MARGIN_MM, pxToMm(pixels)) } });
  }, [updatePage]);

  const showMessage = useCallback((message, isError = false) => {
    if (isError) setError(String(message || 'Une erreur est survenue.'));
    else {
      setError('');
      setStatus(String(message || 'Prêt'));
    }
  }, []);

  const closeInspector = useCallback(() => {
    setActivePanel('');
    requestAnimationFrame(() => panelTriggerRef.current?.focus?.());
  }, []);

  const openPanel = useCallback((panel) => {
    if (panel === 'layout') {
      setActivePanel('');
      setShowAI(false);
      setShowCompatibility(false);
      setShowLayout(true);
      return;
    }
    panelTriggerRef.current = document.activeElement;
    setShowAI(false);
    setShowLayout(false);
    setShowCompatibility(false);
    setActivePanel(panel);
  }, []);

  const insertStructuredBlock = useCallback((block) => {
    if (!block || loadBlocked) return;
    restoreSelection();
    document.execCommand('insertHTML', false, `${blockToEditableHtml(block)}<p><br></p>`);
    rememberSelection();
    markChanged();
  }, [loadBlocked, markChanged, rememberSelection, restoreSelection]);

  const insertSectionBreak = useCallback(() => {
    insertStructuredBlock({ type: 'section-break', breakType: 'next-page' });
    setStatus('Saut de section inséré');
  }, [insertStructuredBlock]);

  const insertDateTime = useCallback(() => {
    const value = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    if (fileFormat.kind === 'text') {
      insertPlainText(value);
      return;
    }
    restoreSelection();
    document.execCommand('insertText', false, value);
    markChanged();
  }, [fileFormat.kind, insertPlainText, markChanged, restoreSelection]);

  const insertMatterToken = useCallback((kind) => {
    const tokens = {
      reference: matterTitle || matterId || '{{dossier.reference}}',
      parties: '{{dossier.parties_et_roles}}',
      lawyer: '{{dossier.avocat_responsable}}',
      court: '{{dossier.juridiction}}',
    };
    const value = tokens[kind] || `{{dossier.${kind}}}`;
    if (fileFormat.kind === 'text') insertPlainText(value);
    else {
      restoreSelection();
      document.execCommand('insertText', false, value);
      markChanged();
    }
    setStatus('Variable de dossier insérée — sa valeur restera explicite tant que le dossier ne la fournit pas');
  }, [fileFormat.kind, insertPlainText, markChanged, matterId, matterTitle, restoreSelection]);

  const updateStructuredDocument = useCallback((patch) => {
    const next = {
      ...documentRef.current,
      ...patch,
      page: patch.page ? { ...documentRef.current.page, ...patch.page } : documentRef.current.page,
      localOverrides: patch.localOverrides
        ? { ...(documentRef.current.localOverrides || {}), ...patch.localOverrides }
        : documentRef.current.localOverrides,
    };
    documentRef.current = next;
    setStructuredDocument(next);
    if (patch.page) {
      pageRef.current = next.page;
      setPage(next.page);
    }
    changeCounterRef.current += 1;
    setDirty(true);
    setStatus('Modification locale non enregistrée');
  }, []);

  const applyTemplate = useCallback(async (template, sections, localOverrides) => {
    if (!documentId) throw new Error('Enregistrez d’abord ce document dans un dossier.');
    const data = await applyDocumentTemplate(documentId, {
      templateKey: template.templateKey,
      version: template.version,
      sections,
      localOverrides,
      expectedRevision: revisionRef.current,
    });
    hydrate(data.document, {
      ...data,
      revisions: [{
        revision: data.revision,
        reason: 'template',
        comment: `Modèle ${template.name} v${template.version} appliqué`,
        savedAt: new Date().toISOString(),
        status: data.status || documentStatus,
      }, ...revisions.filter((item) => Number(item.revision) !== Number(data.revision))],
    });
    setDocumentStatus(data.status || documentStatus);
    setStatus(`Modèle ${template.name} v${template.version} appliqué`);
    onSaved?.(data);
    return data;
  }, [documentId, documentStatus, hydrate, onSaved, revisions]);

  const changeDocumentStatus = useCallback(async (nextStatus) => {
    const previous = documentStatus;
    setDocumentStatus(nextStatus);
    const data = await saveNow(true, nextStatus, 'status', `Statut modifié : ${nextStatus}`);
    if (!data) {
      setDocumentStatus(previous);
      throw new Error('Le statut n’a pas pu être enregistré.');
    }
    setRevisions((current) => [{
      revision: data.revision,
      reason: 'status',
      comment: `Statut modifié : ${nextStatus}`,
      savedAt: new Date().toISOString(),
      status: nextStatus,
    }, ...current.filter((item) => Number(item.revision) !== Number(data.revision))]);
    return data;
  }, [documentStatus, saveNow]);

  const reloadAfterRestore = useCallback(async () => {
    const localDraft = dirty ? collectNow() : null;
    const data = await reloadEditorCanonical(documentId, revisionRef.current, localDraft);
    hydrate(data.document, { ...data, revisions });
    setStatus(`Version restaurée chargée — révision ${data.revision}`);
    onSaved?.(data);
    return data;
  }, [collectNow, dirty, documentId, hydrate, onSaved, revisions]);

  const openSelectedReference = useCallback(async () => {
    const referenceId = selectedReferenceRef.current?.dataset?.kheopsReference;
    if (!referenceId || !documentId) {
      setError('Sélectionnez d’abord une référence structurée.');
      return;
    }
    try {
      const result = await openDocumentReference(documentId, referenceId);
      if (result.target?.downloadUrl) window.open(result.target.downloadUrl, '_blank', 'noopener,noreferrer');
      else setStatus('La référence est valide et accessible.');
    } catch (referenceError) {
      setError(apiMessage(referenceError, 'La pièce référencée ne peut pas être ouverte.'));
    }
  }, [documentId]);

  const checkReferences = useCallback(async () => {
    if (!documentId) return;
    try {
      const references = await listDocumentReferences(documentId);
      const results = await Promise.allSettled(references.map((reference) => openDocumentReference(documentId, reference.referenceId)));
      const invalid = results.filter((result) => result.status === 'rejected').length;
      if (invalid) setError(`${invalid} référence${invalid > 1 ? 's' : ''} ne peut plus être ouverte. Consultez le panneau Références.`);
      else setStatus(`${references.length} référence${references.length > 1 ? 's' : ''} vérifiée${references.length > 1 ? 's' : ''}.`);
    } catch (referenceError) {
      setError(apiMessage(referenceError, 'La vérification des références a échoué.'));
    }
  }, [documentId]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.querySelector('.kheops-editor-modal')?.requestFullscreen?.();
  }, []);

  const findNext = useCallback(() => {
    if (!search || !editorRef.current) return;
    if (fileFormat.kind === 'text') {
      const value = editorRef.current.value;
      const query = search.toLocaleLowerCase('fr');
      const from = Number(searchCursorRef.current.offset) || 0;
      let start = value.toLocaleLowerCase('fr').indexOf(query, from);
      if (start < 0 && from > 0) start = value.toLocaleLowerCase('fr').indexOf(query, 0);
      if (start < 0) {
        searchCursorRef.current = { node: 0, offset: 0 };
        setStatus(`Aucune occurrence de « ${search} »`);
        return;
      }
      editorRef.current.focus({ preventScroll: true });
      editorRef.current.setSelectionRange(start, start + search.length);
      savedRangeRef.current = { plainText: true, start, end: start + search.length };
      searchCursorRef.current = { node: 0, offset: start + search.length };
      setSelectedText(value.slice(start, start + search.length));
      setStatus(`Occurrence « ${search} » sélectionnée`);
      return;
    }
    const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    if (!nodes.length) return;
    const query = search.toLocaleLowerCase('fr');
    let nodeIndex = searchCursorRef.current.node;
    let offset = searchCursorRef.current.offset;
    for (let attempt = 0; attempt < nodes.length + 1; attempt += 1) {
      const node = nodes[nodeIndex % nodes.length];
      const start = (node.nodeValue || '').toLocaleLowerCase('fr').indexOf(query, offset);
      if (start >= 0) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + search.length);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        savedRangeRef.current = range.cloneRange();
        searchCursorRef.current = { node: nodeIndex % nodes.length, offset: start + search.length };
        range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setStatus(`Occurrence « ${search} » sélectionnée`);
        return;
      }
      nodeIndex = (nodeIndex + 1) % nodes.length;
      offset = 0;
    }
    searchCursorRef.current = { node: 0, offset: 0 };
    setStatus(`Aucune occurrence de « ${search} »`);
  }, [fileFormat.kind, search]);

  const replaceCurrent = useCallback(() => {
    if (fileFormat.kind === 'text' && editorRef.current) {
      const start = editorRef.current.selectionStart ?? 0;
      const end = editorRef.current.selectionEnd ?? start;
      if (editorRef.current.value.slice(start, end).toLocaleLowerCase('fr') === search.toLocaleLowerCase('fr')) {
        savedRangeRef.current = { plainText: true, start, end };
        insertPlainText(replacement);
        searchCursorRef.current = { node: 0, offset: start + replacement.length };
      }
      findNext();
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString().toLocaleLowerCase('fr') === search.toLocaleLowerCase('fr')) {
      document.execCommand('insertText', false, replacement);
      markChanged();
    }
    findNext();
  }, [fileFormat.kind, findNext, insertPlainText, markChanged, replacement, search]);

  const replaceAll = useCallback(() => {
    if (!search) return;
    if (fileFormat.kind === 'text') {
      const expression = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const nextValue = plainTextRef.current.replace(expression, replacement);
      plainTextRef.current = nextValue;
      setPlainText(nextValue);
      markChanged();
      setStatus(`Toutes les occurrences de « ${search} » ont été remplacées`);
      return;
    }
    const replaced = replaceInDocument(collectNow(), search, replacement, true);
    documentRef.current = replaced;
    if (editorRef.current) editorRef.current.innerHTML = blocksToEditableHtml(replaced.blocks);
    markChanged();
    setStatus(`Toutes les occurrences de « ${search} » ont été remplacées`);
  }, [collectNow, fileFormat.kind, markChanged, replacement, search]);

  const importDocx = useCallback(async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file || !documentId) return;
    if (fileFormat.kind === 'text') {
      setError('Un fichier Word ne peut pas remplacer ce TXT. Créez un nouveau document DOCX pour conserver les deux fichiers.');
      return;
    }
    const confirmed = window.confirm(
      dirty
        ? 'Ce document contient des modifications non enregistrées. Elles seront d’abord conservées dans une version, puis le fichier Word importé deviendra la version de travail. Continuer ?'
        : 'Le fichier Word importé deviendra une nouvelle version de travail. Le document actuel et le fichier original resteront conservés dans l’historique. Continuer ?'
    );
    if (!confirmed) {
      setStatus('Import annulé — votre document reste inchangé');
      return;
    }
    if (dirty) {
      const saved = await saveNow(true);
      if (!saved) return;
    }
    setSaving(true);
    setError('');
    setStatus('Import et analyse du document Word…');
    try {
      const data = await importEditorDocx(documentId, file, revisionRef.current);
      hydrate(data.document, {
        ...data,
        revisions: [{
          revision: data.revision,
          reason: 'import',
          comment: 'Import du document Word original',
          savedAt: new Date().toISOString(),
          status: data.status || documentStatus,
        }, ...revisions.filter((item) => Number(item.revision) !== Number(data.revision))],
      });
      setStatus(`Document importé — ${data.compatibility?.label || 'analyse terminée'}`);
      onSaved?.(data);
    } catch (importError) {
      setError(apiMessage(importError, 'Impossible d’importer ce document Word.'));
      setStatus('Import interrompu');
    } finally {
      setSaving(false);
    }
  }, [dirty, documentId, documentStatus, fileFormat.kind, hydrate, onSaved, revisions, saveNow]);

  const reloadCanonical = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    setError('');
    setStatus('Rechargement de la version centrale…');
    try {
      // Si le DOM contient un brouillon non sauvegardé (notamment après un
      // conflit), il est envoyé avec la requête et archivé côté serveur AVANT
      // le remplacement. Une simple confirmation locale ne suffirait pas à le
      // protéger : ce contenu n'existe encore nulle part ailleurs.
      const localDraft = dirty ? collectNow() : null;
      const data = await reloadEditorCanonical(documentId, revisionRef.current, localDraft);
      hydrate(data.document, { ...data, revisions });
      setStatus(`Version centrale rechargée — révision ${data.revision}`);
      onSaved?.(data);
    } catch (reloadError) {
      setError(apiMessage(reloadError, 'Impossible de recharger la version centrale.'));
      setLoadBlocked(true);
      setLoadBlockCode(reloadError?.response?.data?.error || 'RELOAD_FAILED');
      setStatus('Rechargement interrompu');
    } finally {
      setLoading(false);
    }
  }, [collectNow, dirty, documentId, hydrate, onSaved, revisions]);

  const confirmReloadCanonical = useCallback(async () => {
    if (dirty) {
      const confirmed = window.confirm(
        'Une version plus récente existe. Votre brouillon local sera conservé dans l’historique avant de charger la version centrale. Continuer ?'
      );
      if (!confirmed) {
        setStatus('Rechargement annulé — votre brouillon reste affiché');
        return;
      }
    }
    await reloadCanonical();
  }, [dirty, reloadCanonical]);

  const reconvertOriginal = useCallback(async () => {
    if (!canReconvertOriginal || reconvertingOriginal) return;

    const confirmationMessage = dirty
      ? 'Le fichier .doc original va être reconverti. Votre brouillon affiché sera d’abord archivé dans l’historique, puis la version reconvertie deviendra la nouvelle version de travail. Continuer ?'
      : 'Le fichier .doc original va être reconverti et deviendra une nouvelle version de travail. La version actuelle et le fichier original resteront conservés dans l’historique. Continuer ?';
    if (!window.confirm(confirmationMessage)) {
      setStatus('Reconversion annulée — le document actuel reste affiché');
      return;
    }

    const expectedRevision = revisionRef.current;
    const localDraft = dirty ? collectNow() : null;
    const changeCounterAtStart = changeCounterRef.current;
    setReconvertingOriginal(true);
    setError('');
    setStatus('Reconversion du fichier .doc original…');
    try {
      const data = await reconvertEditorOriginal(documentId, expectedRevision, localDraft);
      if (!data?.document || typeof data.document !== 'object') {
        throw new Error('La reconversion n’a retourné aucun document valide.');
      }
      if (changeCounterRef.current !== changeCounterAtStart) {
        setError('Le document a été modifié pendant la reconversion. La nouvelle version serveur n’a pas remplacé votre brouillon affiché. Sécurisez vos changements avant de recharger.');
        setStatus('Reconversion terminée côté serveur — brouillon local conservé à l’écran');
        return;
      }
      hydrate(data.document, {
        ...data,
        original: data.original || { available: true, filename: originalFilename },
        revisions: Array.isArray(data.revisions) ? data.revisions : revisions,
      });
      setStatus(`Original reconverti — révision ${data.revision}`);
      onSaved?.(data);
    } catch (reconversionError) {
      const message = apiMessage(reconversionError, 'Impossible de reconvertir le fichier .doc original.');
      setError(`${message} Le document affiché reste inchangé.`);
      setStatus('Reconversion interrompue — document actuel conservé');
    } finally {
      setReconvertingOriginal(false);
    }
  }, [canReconvertOriginal, collectNow, dirty, documentId, hydrate, onSaved, originalFilename, reconvertingOriginal, revisions]);

  const exportDocument = useCallback(async (format) => {
    try {
      if (dirty) {
        const saved = await saveNow(false);
        if (!saved) return;
      }
      if (documentId) {
        const file = await downloadEditorExport(documentId, format);
        triggerBlobDownload(file.blob, file.filename);
      } else if (format === 'txt' && fileFormat.kind === 'text') {
        triggerBlobDownload(new Blob([plainTextRef.current], { type: 'text/plain;charset=utf-8' }), fileFormat.filename || `${documentTitle}.txt`);
      } else if (format === 'json') {
        triggerBlobDownload(new Blob([JSON.stringify(collectNow(), null, 2)], { type: 'application/json' }), `${documentTitle}.kheops.json`);
      } else {
        setError(`Enregistrez d’abord ce document dans un dossier pour l’exporter en ${fileFormat.kind === 'text' ? 'TXT' : 'DOCX'}.`);
      }
    } catch (exportError) {
      setError(apiMessage(exportError, 'Export impossible.'));
    }
  }, [collectNow, dirty, documentId, documentTitle, fileFormat, saveNow]);

  const printPdf = useCallback(() => {
    // `noopener` peut volontairement faire renvoyer `null` par Chromium, ce qui
    // empêcherait d'écrire l'aperçu. La page est entièrement générée localement ;
    // on coupe le lien avec l'ouvreur avant d'injecter le document.
    const popup = window.open('about:blank', '_blank');
    if (!popup) {
      setError('Le navigateur a bloqué l’aperçu. Autorisez les fenêtres contextuelles pour imprimer en PDF.');
      return;
    }
    try { popup.opener = null; } catch (_error) { /* déjà isolée par le navigateur */ }
    popup.document.open();
    popup.document.write(documentToPrintHtml(collectNow()));
    popup.document.close();
  }, [collectNow]);

  const downloadOriginal = useCallback(async () => {
    try {
      const file = await downloadEditorOriginal(documentId);
      triggerBlobDownload(file.blob, file.filename);
    } catch (downloadError) {
      setError(apiMessage(downloadError, 'Le fichier original n’est pas disponible.'));
    }
  }, [documentId]);

  const prepareEmailPublication = useCallback(async () => {
    const publicationDocumentId = canonicalDocumentId || documentId;
    if (!publicationDocumentId || !matterId || publishingEmail) {
      if (!matterId) setError('Ce document doit être lié à un dossier avant son envoi par e-mail.');
      return;
    }
    setPublishingEmail(true);
    setError('');
    try {
      if (dirty) {
        const saved = await saveNow(false);
        if (!saved) return;
      }
      if (!publicationKeyRef.current) {
        const suffix = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        publicationKeyRef.current = `editor-email:${publicationDocumentId}:${suffix}`;
      }
      const publication = await prepareDocumentPublication(publicationDocumentId, {
        expectedRevision: revisionRef.current,
        formats: ['docx', 'pdf'],
        comment: 'Version exacte gelée avant envoi par e-mail',
      }, publicationKeyRef.current);
      const frozenVersionId = publication?.frozenVersion?.versionId;
      const artifacts = ['docx', 'pdf'].map((format) => ({
        format,
        artifact: publication?.artifacts?.[format],
      }));
      if (!frozenVersionId || artifacts.some(({ artifact }) => !artifact?.ready || !artifact?.artifactId)) {
        throw new Error("Les versions DOCX et PDF exactes n'ont pas pu être préparées.");
      }
      setEmailAttachments(artifacts.map(({ format, artifact }) => ({
        artifactId: artifact.artifactId,
        documentId: publication.documentId || publicationDocumentId,
        format: artifact.format || format,
        versionId: artifact.versionId || frozenVersionId,
        versionLabel: artifact.versionId || frozenVersionId,
        filename: artifact.filename || `${documentTitle}.${format}`,
        mime: artifact.mime,
        size: artifact.size,
      })));
      setStatus('Version documentaire figée — vérifiez le message avant envoi');
      setShowEmailComposer(true);
      publicationKeyRef.current = '';
    } catch (publicationError) {
      setError(apiMessage(publicationError, "Impossible de préparer la version exacte pour l'e-mail."));
    } finally {
      setPublishingEmail(false);
    }
  }, [canonicalDocumentId, dirty, documentId, documentTitle, matterId, publishingEmail, saveNow]);

  const openAssistant = useCallback((taskType = 'free-question') => {
    if (!aiEnabled) return;
    rememberSelection();
    setAITaskType(taskType || 'free-question');
    setActivePanel('');
    setShowLayout(false);
    setShowCompatibility(false);
    setShowAI(true);
  }, [aiEnabled, rememberSelection]);

  const closeAssistant = useCallback(() => {
    setShowAI(false);
    requestAnimationFrame(() => aiButtonRef.current?.focus());
  }, []);

  const applyAIResult = useCallback((mode, text, provenance = {}) => {
    const proposal = String(text || '');
    if (!proposal || loadBlocked) return;
    if (mode === 'replace') {
      const accepted = window.confirm('Remplacer la sélection par cette proposition IA ? Le document restera un brouillon jusqu’à votre enregistrement et votre validation.');
      if (!accepted) return;
    }
    if (fileFormat.kind === 'text') {
      const selected = savedRangeRef.current?.plainText ? savedRangeRef.current : null;
      if (mode !== 'replace' && selected) {
        savedRangeRef.current = { plainText: true, start: selected.end, end: selected.end };
      }
      insertPlainText(mode === 'append' ? `\n${proposal}` : proposal);
      pendingAIProvenanceRef.current.push({
        taskId: provenance.taskId ? String(provenance.taskId) : '',
        artifactId: provenance.artifactId ? String(provenance.artifactId) : '',
        mode,
        appliedAt: new Date().toISOString(),
      });
      setStatus(mode === 'replace' ? 'Proposition IA remplacée après validation humaine' : 'Proposition IA insérée — document à relire');
      return;
    }
    restoreSelection();
    const selection = window.getSelection();
    if (mode !== 'replace' && selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, mode === 'append' ? `\n${proposal}` : proposal);
    } else {
      document.execCommand('insertText', false, proposal);
    }
    pendingAIProvenanceRef.current.push({
      taskId: provenance.taskId ? String(provenance.taskId) : '',
      artifactId: provenance.artifactId ? String(provenance.artifactId) : '',
      mode,
      appliedAt: new Date().toISOString(),
    });
    rememberSelection();
    markChanged();
    setStatus(mode === 'replace' ? 'Proposition IA remplacée après validation humaine' : 'Proposition IA insérée — document à relire');
  }, [fileFormat.kind, insertPlainText, loadBlocked, markChanged, rememberSelection, restoreSelection]);

  const toggleRibbon = useCallback(() => {
    setRibbonCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem('kheops.editor.ribbonCollapsed', String(next)); } catch (_error) {}
      return next;
    });
  }, []);

  const handleClose = useCallback(async () => {
    if (dirty && !status.startsWith('Conflit')) {
      const saved = await saveNow(false);
      if (!saved) return;
    }
    if (dirty && status.startsWith('Conflit')) {
      const discard = window.confirm('Cette copie est en conflit avec une version plus récente. Fermer sans enregistrer vos changements locaux ?');
      if (!discard) return;
    }
    onClose?.();
  }, [dirty, onClose, saveNow, status]);

  closeFunctionRef.current = handleClose;

  if (!open) return null;

  const landscape = page.orientation === 'landscape';
  const baseSize = PAGE_SIZES_MM[page.format] || PAGE_SIZES_MM.A4;
  const physicalWidth = landscape ? baseSize[1] : baseSize[0];
  const physicalHeight = landscape ? baseSize[0] : baseSize[1];
  const pageBorderCssStyle = page.border?.style === 'single' ? 'solid' : page.border?.style;
  const logicalPageWidth = physicalWidth * 3.7795275591;
  const availablePageWidth = Math.max(260, workspaceWidth - (workspaceWidth < 768 ? 20 : 68));
  const fittedScale = Math.min(1, availablePageWidth / logicalPageWidth);
  const pageScale = Math.max(.3, Math.min(2, fitToWidth ? fittedScale : zoom));
  const sheetStyle = {
    '--kheops-page-width': `${physicalWidth}mm`,
    '--kheops-page-height': `${physicalHeight}mm`,
    '--kheops-margin-top': `${page.margins?.top ?? PAGE_DEFAULTS.margins.top}mm`,
    '--kheops-margin-right': `${page.margins?.right ?? PAGE_DEFAULTS.margins.right}mm`,
    '--kheops-margin-bottom': `${page.margins?.bottom ?? PAGE_DEFAULTS.margins.bottom}mm`,
    '--kheops-margin-left': `${page.margins?.left ?? PAGE_DEFAULTS.margins.left}mm`,
    '--kheops-total-page-height': `${physicalHeight * Math.max(1, counts.pages)}mm`,
    '--kheops-page-color': page.pageColor || '#ffffff',
    '--kheops-column-count': Math.max(1, Math.min(3, Number(page.columns) || 1)),
    '--kheops-header-distance': `${Math.max(0, Number(page.headerDistance) || 12.7)}mm`,
    '--kheops-footer-distance': `${Math.max(0, Number(page.footerDistance) || 12.7)}mm`,
  };

  const commandContext = {
    documentId,
    matterId,
    originalAvailable,
    inTable,
    selectionType,
    ribbonCollapsed,
    focusMode,
    showGuides,
    isPlainText: fileFormat.kind === 'text',
    marginLeftPx: Math.round(mmToPx(page.margins?.left ?? pxToMm(DEFAULT_HORIZONTAL_MARGIN_PX))),
    marginRightPx: Math.round(mmToPx(page.margins?.right ?? pxToMm(DEFAULT_HORIZONTAL_MARGIN_PX))),
    minHorizontalMarginPx: MIN_HORIZONTAL_MARGIN_PX,
    maxHorizontalMarginPx: MAX_HORIZONTAL_MARGIN_PX,
  };
  const editorCommands = createEditorCommandRegistry({
    save: () => saveNow(false),
    createVersion: () => saveNow(true),
    exec: runCommand,
    fontSize: (value) => runCommand('fontSize', browserFontSize(Number(value))),
    paragraphLayout: applyParagraphLayout,
    horizontalMargin: updateHorizontalMargin,
    insertLink,
    insertTable,
    insertImage: () => imageInputRef.current?.click(),
    insertPageBreak,
    insertSectionBreak,
    insertDateTime,
    insertMatterToken,
    openPanel,
    openSelectedReference,
    checkReferences,
    editTable: editSelectedTable,
    importDocx: () => importInputRef.current?.click(),
    exportDocument,
    printPdf,
    downloadOriginal,
    emailDocument: prepareEmailPublication,
    close: handleClose,
    toggleSearch: () => setShowSearch((value) => !value),
    openLayout: () => { setActivePanel(''); setShowAI(false); setShowCompatibility(false); setShowLayout(true); },
    openCompatibility: () => { setActivePanel(''); setShowAI(false); setShowLayout(false); setShowCompatibility(true); },
    openAssistant,
    fitWidth: () => setFitToWidth(true),
    actualSize: () => { setFitToWidth(false); setZoom(1); },
    zoomBy: (amount) => { setFitToWidth(false); setZoom((current) => Math.max(.3, Math.min(2, Number((current + amount).toFixed(2))))); },
    toggleRibbon,
    toggleFocus: () => setFocusMode((value) => !value),
    toggleGuides: () => setShowGuides((value) => !value),
    toggleFullscreen,
  }, commandContext);

  const stopPortalPropagation = (event) => event.stopPropagation();
  const content = (
    <div
      className="kheops-editor-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Éditeur Kheops"
      onMouseDown={stopPortalPropagation}
      onClick={stopPortalPropagation}
    >
      <section className={`kheops-editor-modal${focusMode ? ' is-focus-mode' : ''}${fileFormat.kind === 'text' ? ' is-plain-text' : ''}`}>
        <header className="kheops-editor-topbar">
          <div className="kheops-editor-brand">
            <span className="kheops-editor-logo" aria-hidden="true">K</span>
            <div>
              <strong>Éditeur Kheops</strong>
              <input
                value={documentTitle}
                onChange={(event) => { setDocumentTitle(event.target.value); requestAnimationFrame(markChanged); }}
                aria-label="Titre du document"
                maxLength={250}
              />
            </div>
          </div>
          <div className="kheops-editor-top-actions">
            <CompatibilityBadge compatibility={compatibility} onClick={() => { setShowAI(false); setShowLayout(false); setShowCompatibility(true); }} />
            <button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('undo')} aria-label="Annuler (Ctrl+Z)" title="Annuler (Ctrl+Z)">↶</button>
            <button type="button" className="quick-action" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand('redo')} aria-label="Rétablir (Ctrl+Y)" title="Rétablir (Ctrl+Y)">↷</button>
            {onOpenAdvancedEditor && documentId && (
              <button
                type="button"
                className="kheops-editor-advanced-action"
                onClick={handleOpenAdvancedEditor}
                disabled={openingAdvancedEditor || advancedEditorLoading || saving || loading || loadBlocked || status.startsWith('Conflit')}
                aria-label="Ouvrir dans l’éditeur avancé"
                title="Sauvegarder puis ouvrir ce document dans l’éditeur avancé"
              >
                <span aria-hidden="true">▦</span>
                <span className="full-label">Éditeur avancé</span>
                <span className="compact-label" aria-hidden="true">Avancé</span>
              </button>
            )}
            {aiEnabled && <button ref={aiButtonRef} type="button" className="assistant" aria-label="Ouvrir l’Assistant IA" onClick={() => openAssistant('free-question')}><span aria-hidden="true">✦</span><span className="full-label">Assistant IA</span></button>}
            <button type="button" className="secondary kheops-editor-email-action" onClick={prepareEmailPublication} disabled={publishingEmail || saving || loading || loadBlocked || !documentId || !matterId} aria-label="Envoyer une version figée par e-mail"><span aria-hidden="true">@</span><span className="full-label">Envoyer</span></button>
            <button type="button" className="secondary" onClick={() => saveNow(true)} disabled={saving || loading || loadBlocked}>Créer une version</button>
            <button type="button" className="primary" aria-label="Enregistrer" onClick={() => saveNow(false)} disabled={saving || loading || loadBlocked}><span className="full-label">Enregistrer</span><span className="compact-label" aria-hidden="true">✓</span></button>
            <button type="button" className="close" onClick={handleClose} aria-label="Fermer l’Éditeur Kheops">×</button>
          </div>
        </header>

        <ResponsiveRibbon
          commands={editorCommands}
          context={commandContext}
          activeTab={activeRibbonTab}
          onActiveTabChange={setActiveRibbonTab}
          collapsed={ribbonCollapsed}
          onToggleCollapsed={toggleRibbon}
          onRememberSelection={rememberSelection}
          responsive={isFeatureEnabled('responsiveEditor')}
        />

        {fileFormat.kind === 'text' && (
          <div className="kheops-editor-plain-text-notice" role="status">
            <strong>Mode texte brut (.txt)</strong>
            <span>La mise en forme, les tableaux, les images, les marges, les en-têtes et les signatures sont désactivés. Le fichier reste un TXT.</span>
          </div>
        )}

        {showSearch && (
          <div className="kheops-editor-search" role="search">
            <label>Rechercher <input value={search} onChange={(event) => { setSearch(event.target.value); searchCursorRef.current = { node: 0, offset: 0 }; }} autoFocus /></label>
            <label>Remplacer par <input value={replacement} onChange={(event) => setReplacement(event.target.value)} /></label>
            <button type="button" onClick={findNext}>Suivant</button>
            <button type="button" onClick={replaceCurrent}>Remplacer</button>
            <button type="button" onClick={replaceAll}>Tout remplacer</button>
            <button type="button" className="close-search" onClick={() => setShowSearch(false)} aria-label="Fermer la recherche">×</button>
          </div>
        )}

        <div className="kheops-editor-body">
          <main ref={workspaceRef} className="kheops-editor-workspace">
            {loading ? (
              <div className="kheops-editor-loading" role="status">Chargement du document…</div>
            ) : loadBlocked ? (
              <div className="kheops-editor-load-blocked" role="alert">
                <strong>Le document n’a pas été ouvert dans l’éditeur.</strong>
                <p>{error || 'Son contenu n’a pas pu être chargé sans risque.'}</p>
                <p>Aucune copie vide ne sera enregistrée et le fichier existant reste inchangé.</p>
                <div>
                  {loadBlockCode === 'EDITOR_STATE_STALE' ? (
                    <button type="button" onClick={reloadCanonical}>Recharger la version actuelle</button>
                  ) : (
                    <button type="button" onClick={loadDocument}>Réessayer</button>
                  )}
                  <button type="button" onClick={onClose}>Choisir une autre méthode</button>
                </div>
              </div>
            ) : fileFormat.kind === 'text' ? (
              <div className="kheops-editor-plain-text-surface" style={{ zoom: pageScale }} data-fit-to-width={fitToWidth ? 'true' : 'false'}>
                <textarea
                  ref={editorRef}
                  className="kheops-editor-plain-text-input"
                  value={plainText}
                  wrap="soft"
                  spellCheck="true"
                  aria-label="Contenu du fichier texte brut"
                  onChange={(event) => {
                    plainTextRef.current = event.target.value;
                    setPlainText(event.target.value);
                    markChanged();
                  }}
                  onSelect={rememberSelection}
                  onKeyUp={rememberSelection}
                  onMouseUp={rememberSelection}
                />
              </div>
            ) : (
              <div className={`kheops-editor-page-stack${showGuides ? '' : ' hide-guides'}`} style={{ ...sheetStyle, zoom: pageScale }} data-pages={counts.pages} data-fit-to-width={fitToWidth ? 'true' : 'false'}>
                <article
                  className="kheops-editor-sheet"
                  style={{
                    ...sheetStyle,
                    background: page.pageColor || '#ffffff',
                    ...(pageBorderCssStyle && pageBorderCssStyle !== 'none' ? {
                      border: `${Math.max(1, Number(page.border.width) || 1)}px ${pageBorderCssStyle} ${page.border.color || '#000000'}`,
                    } : {}),
                  }}
                  aria-label={`Document de ${counts.pages} page${counts.pages > 1 ? 's' : ''}`}
                >
                {page.watermark && <span className="kheops-editor-watermark" aria-hidden="true">{page.watermark}</span>}
                <div
                  ref={headerRef}
                  className="kheops-editor-header-area"
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="En-tête — cliquez pour modifier"
                  onInput={markChanged}
                  onKeyDown={handleEditorKeyDown}
                  onKeyUp={rememberSelection}
                  onMouseUp={rememberSelection}
                  aria-label="En-tête du document"
                />
                <div
                  ref={editorRef}
                  className="kheops-editor-content"
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck="true"
                  data-placeholder="Commencez à rédiger votre document…"
                  onInput={markChanged}
                  onKeyUp={rememberSelection}
                  onMouseUp={rememberSelection}
                  aria-label="Contenu du document"
                />
                {structuredDocument.signature && structuredDocument.signature.source !== 'none'
                  && (structuredDocument.signature.text || structuredDocument.signature.image) && (
                  <aside
                    className={`kheops-editor-signature is-${structuredDocument.signature.alignment || 'right'}`}
                    data-kheops-signature="true"
                    tabIndex="0"
                    aria-label={structuredDocument.signature.altText || 'Signature'}
                    onFocus={() => setSelectionType('signature')}
                    onClick={() => setSelectionType('signature')}
                  >
                    {(/^(?:data:image\/(?:png|jpe?g|gif|webp);base64,|https:\/\/)/i.test(structuredDocument.signature.image || ''))
                      && <img src={structuredDocument.signature.image} alt={structuredDocument.signature.altText || 'Signature'} />}
                    {structuredDocument.signature.text && <p>{structuredDocument.signature.text}</p>}
                  </aside>
                )}
                <div className="kheops-editor-footer-wrap">
                  <div
                    ref={footerRef}
                    className="kheops-editor-footer-area"
                    contentEditable
                    suppressContentEditableWarning
                    data-placeholder="Pied de page — cliquez pour modifier"
                    onInput={markChanged}
                    onKeyUp={rememberSelection}
                    onMouseUp={rememberSelection}
                    aria-label="Pied de page du document"
                  />
                  {page.showPageNumbers && <span className="kheops-editor-page-number" aria-label="Numéros de page">Page 1 sur {counts.pages}</span>}
                </div>
                </article>
                {counts.pages > 1 && (
                  <ol className="kheops-editor-page-index" aria-label="Repères des pages">
                    {Array.from({ length: counts.pages }, (_, index) => <li key={index}>Page {index + 1}</li>)}
                  </ol>
                )}
              </div>
            )}
          </main>

          {showAI && aiEnabled && (
            <React.Suspense fallback={<aside className="kheops-editor-panel-loading" role="status">Chargement de l’Assistant IA…</aside>}>
              <LazyAIAssistantPanel
                matterId={matterId}
                matterTitle={matterTitle || 'Dossier actif'}
                documentId={documentId}
                documentTitle={documentTitle}
                documentRevision={revision}
                availableSources={aiSources}
                selectedText={selectedText}
                initialTaskType={aiTaskType}
                onClose={closeAssistant}
                onApply={applyAIResult}
                onOpenCitation={(citation) => {
                  if (onAICitationOpen) onAICitationOpen(citation);
                  else setStatus(`Source citée : ${citation.documentTitle || citation.sourceLabel || citation.documentId || 'document du dossier'}`);
                }}
                onDocumentCreated={onAIDocumentCreated}
                onOpenSettings={onOpenAISettings}
              />
            </React.Suspense>
          )}

          {showLayout && fileFormat.kind !== 'text' && (
            <aside className="kheops-editor-layout-panel" aria-label="Mise en page">
              <div className="layout-heading"><strong>Mise en page</strong><button type="button" onClick={() => setShowLayout(false)}>×</button></div>
              <label>Orientation
                <select value={page.orientation} onChange={(event) => updatePage({ orientation: event.target.value })}>
                  <option value="portrait">Portrait</option><option value="landscape">Paysage</option>
                </select>
              </label>
              <label>Format de page
                <select value={page.format || 'A4'} onChange={(event) => updatePage({ format: event.target.value })}>
                  <option value="A4">A4</option><option value="A3">A3</option><option value="Letter">Letter</option><option value="Legal">Legal</option>
                </select>
              </label>
              <label>Colonnes
                <select value={page.columns || 1} onChange={(event) => updatePage({ columns: Number(event.target.value) })}>
                  <option value="1">Une</option><option value="2">Deux</option><option value="3">Trois</option>
                </select>
              </label>
              <fieldset>
                <legend>Marges (mm)</legend>
                {['top', 'right', 'bottom', 'left'].map((side) => (
                  <label key={side}>{({ top: 'Haut', right: 'Droite', bottom: 'Bas', left: 'Gauche' })[side]}
                    <input
                      type="number"
                      min={side === 'left' || side === 'right' ? pxToMm(MIN_HORIZONTAL_MARGIN_PX) : 5}
                      max={MAX_PAGE_MARGIN_MM}
                      step={side === 'left' || side === 'right' ? 'any' : 0.1}
                      value={page.margins?.[side] ?? PAGE_DEFAULTS.margins[side]}
                      onChange={(event) => updatePage({ margins: { [side]: Number(event.target.value) } })}
                    />
                  </label>
                ))}
              </fieldset>
              <label className="checkbox"><input type="checkbox" checked={page.showPageNumbers !== false} onChange={(event) => updatePage({ showPageNumbers: event.target.checked })} /> Numéroter les pages</label>
              <label className="checkbox"><input type="checkbox" checked={Boolean(page.firstPageDifferent)} onChange={(event) => updatePage({ firstPageDifferent: event.target.checked })} /> Première page différente</label>
              <label className="checkbox"><input type="checkbox" checked={Boolean(page.oddEvenDifferent)} onChange={(event) => updatePage({ oddEvenDifferent: event.target.checked })} /> Pages paires et impaires différentes</label>
              <label>Distance de l’en-tête (mm)<input type="number" min="0" max="60" step="0.1" value={page.headerDistance ?? 12.7} onChange={(event) => updatePage({ headerDistance: Number(event.target.value) })} /></label>
              <label>Distance du pied (mm)<input type="number" min="0" max="60" step="0.1" value={page.footerDistance ?? 12.7} onChange={(event) => updatePage({ footerDistance: Number(event.target.value) })} /></label>
              <label>Couleur de page<input type="color" value={page.pageColor || '#ffffff'} onChange={(event) => updatePage({ pageColor: event.target.value })} /></label>
              <label>Filigrane<input value={page.watermark || ''} maxLength="120" onChange={(event) => updatePage({ watermark: event.target.value })} placeholder="Ex. CONFIDENTIEL" /></label>
              <fieldset><legend>Bordure de page</legend>
                <label>Style<select value={page.border?.style || 'none'} onChange={(event) => updatePage({ border: { ...(page.border || {}), style: event.target.value } })}><option value="none">Aucune</option><option value="single">Continue</option><option value="dashed">Tirets</option><option value="double">Double</option></select></label>
                <label>Couleur<input type="color" value={page.border?.color || '#000000'} onChange={(event) => updatePage({ border: { ...(page.border || {}), color: event.target.value } })} /></label>
              </fieldset>
              <p>Les traits pointillés indiquent les sauts explicites. Le DOCX exporté conserve ces réglages structurés.</p>
            </aside>
          )}

          {showCompatibility && (
            <aside className="kheops-editor-layout-panel kheops-editor-compatibility-panel" aria-label="Rapport de compatibilité">
              <div className="layout-heading"><strong>Rapport de compatibilité</strong><button type="button" onClick={() => setShowCompatibility(false)} aria-label="Fermer le rapport de compatibilité">×</button></div>
              <span className={`compatibility-level is-${compatibility?.level || 'native'}`}>{compatibility?.label || 'Document Kheops'}</span>
              {(compatibility?.warnings || []).length > 0 ? (
                <ul>{compatibility.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul>
              ) : (
                <p>Les éléments structurés de ce document sont compatibles avec l’Éditeur Kheops. Vérifiez tout de même le rendu final après export vers un autre éditeur.</p>
              )}
              <p>Le document original et les versions précédentes restent conservés. Aucune conversion complexe n’est appliquée silencieusement.</p>
              {canReconvertOriginal && (
                <div className="kheops-editor-reconvert-original" aria-busy={reconvertingOriginal}>
                  <strong>Original Word historique disponible</strong>
                  <p>
                    Recréez explicitement une version de travail depuis <b>{originalFilename}</b>.
                    La version actuelle et le brouillon éventuel seront conservés dans l’historique.
                  </p>
                  <button
                    type="button"
                    onClick={reconvertOriginal}
                    disabled={reconvertingOriginal || saving || loading}
                  >
                    {reconvertingOriginal ? 'Reconversion…' : 'Reconvertir depuis l’original'}
                  </button>
                </div>
              )}
            </aside>
          )}

          {activePanel && (
            <DocumentInspectorPanel
              panel={activePanel}
              onClose={closeInspector}
              documentId={canonicalDocumentId || documentId}
              document={structuredDocument}
              revision={revision}
              documentStatus={documentStatus}
              revisions={revisions}
              selectedText={selectedText}
              matterId={matterId}
              matterTitle={matterTitle}
              onApplyTemplate={applyTemplate}
              onInsertReference={insertStructuredBlock}
              onChangeStatus={changeDocumentStatus}
              onUpdateDocument={updateStructuredDocument}
              onRestored={reloadAfterRestore}
              onMessage={showMessage}
            />
          )}
        </div>

        {(error || showCompatibilityWarning) && (
          <div className={`kheops-editor-message ${error ? 'is-error' : 'is-warning'}`} role={error ? 'alert' : 'status'}>
            <div>
              {error || compatibilityWarnings[0]}
              {!error && compatibilityWarnings.length > 1 && <span> (+{compatibilityWarnings.length - 1} autres avertissements)</span>}
            </div>
            {status.startsWith('Conflit') && <button type="button" onClick={confirmReloadCanonical}>Recharger la dernière version</button>}
            <button
              type="button"
              onClick={() => {
                if (error) setError('');
                else setDismissedCompatibilityWarningKey(compatibilityWarningKey);
              }}
              aria-label="Masquer le message"
            >×</button>
          </div>
        )}

        <footer className="kheops-editor-statusbar">
          <span className={saving ? 'is-saving' : ''}>{saving ? 'Enregistrement…' : status}</span>
          <span>{dirty ? '● Modifié' : '✓ À jour'} · Révision {revision}</span>
          <span>{counts.pages} page{counts.pages > 1 ? 's' : ''} · {counts.words} mot{counts.words > 1 ? 's' : ''} · {counts.characters} caractères</span>
          <div className="kheops-editor-zoom-control" role="group" aria-label="Zoom du document">
            <span className="visually-hidden">Zoom du document</span>
            <button type="button" onClick={() => { setFitToWidth(false); setZoom((value) => Math.max(.3, Number((value - .1).toFixed(2)))); }} aria-label="Réduire le zoom">−</button>
            <input aria-label="Zoom du document" type="range" min="30" max="200" step="10" value={Math.round(pageScale * 100)} onChange={(event) => { setFitToWidth(false); setZoom(Number(event.target.value) / 100); }} />
            <button type="button" onClick={() => { setFitToWidth(false); setZoom((value) => Math.min(2, Number((value + .1).toFixed(2)))); }} aria-label="Augmenter le zoom">+</button>
            <button type="button" className={fitToWidth ? 'is-active' : ''} onClick={() => setFitToWidth(true)} aria-pressed={fitToWidth}>Ajuster · {Math.round(pageScale * 100)} %</button>
          </div>
        </footer>

        <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleImageFile} />
        <input ref={importInputRef} className="visually-hidden" type="file" aria-label="Importer un document Word" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={importDocx} />
      </section>
      <EmailComposeModal
        open={showEmailComposer}
        attachments={emailAttachments}
        dossiers={emailDossiers}
        initialDossierId={matterId ? String(matterId) : ''}
        onClose={() => { setShowEmailComposer(false); setEmailAttachments([]); }}
        onSent={() => setStatus('E-mail envoyé et archivé avec la version documentaire exacte')}
      />
    </div>
  );

  return ReactDOM.createPortal(content, document.body);
}

export { KheopsDocumentEditor };
export { resolveDocumentTitle };
