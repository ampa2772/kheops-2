import React, { useRef, useState, useMemo, useLayoutEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { SketchPicker } from 'react-color';
import ReactDOM from 'react-dom';
import './styles.css';

import { fetchAllDocumentsInDossier, updateDocumentColor, updateSubfolder } from '../../../../../redux/slices/currentDossierSlice';
// Compagnon Electron mince (mode web) : ouverture des .docx dans Microsoft Word.
import {
  openDocumentInWord,
  triggerCompanionInstall,
  detectCompanion,
  getCompanionInstallerInfo,
} from '../../../../../services/companion/companionClient';
import { downloadWordDocument, classifyWordDownloadError } from '../../../../../services/wordDocumentClient';
import { downloadDroppedDocument } from '../../../../../services/droppedFileService';
import DocumentImportAffordance from './DocumentImportAffordance';
import { getDocumentCompatibility, listExternalSessions, openExternalDocument } from '../../../../../services/externalDocumentEditing';
import useDocumentOpening from '../../../../../hooks/useDocumentOpening';
import { updateDocumentOpeningPreferences } from '../../../../../services/documentOpeningClient';
import {
  loadDocumentPreviewInWindow,
  reserveDocumentPreviewWindow,
} from '../../../../../services/documentBrowserPreview';
import { DocumentOpeningModal, TextDocumentPreviewModal } from '../../../../documentOpening';
import { DOCUMENT_OPENING_MODES } from '../../../../../constants/documentOpening';
import {
  DOCUMENT_FILE_OPENING_ACTIONS,
  classifyDocumentFileOpening,
  getDocumentFileExtension,
} from '../../../../../constants/documentFileRouting';
import { KheopsDocumentEditor } from '../../../../documentEditor';
import { previewDocumentAsPdf } from '../../../../../services/documentPdfPreview';
import { isFeatureEnabled } from '../../../../../utils/featureFlags';
import { getDossierColorKey, resolveDocumentColor } from '../../../../../constants/documentColors';

// Verrouillage collaboratif de documents (cross-PC)
import { useDocumentLock } from '../../../../../hooks/useDocumentLock';
import { useDocumentLockPolling } from '../../../../../hooks/useDocumentLockPolling';
import { selectLockForDoc, selectIsDocLockedByOther } from '../../../../../redux/slices/documentLockSlice';

import Dupliquer from '../../../../../assets/dupliquer.svg';
import SupprDoc from '../../../../../assets/supprGreen.svg';
import Renommer from '../../../../../assets/renommer.svg';
import Envoyer from '../../../../../assets/envoyer-un-mail.svg';
import ColorIcon from '../../../../../assets/palette-de-couleurs.svg';
import SousDossier from '../../../../../assets/dossierF.svg';
import TelechargerIcon from '../../../../../assets/telecharger.svg';

import SendEmailModal from './SendEmailModal';
import HoverToSpeak from '../../../../common/HoverToSpeak';
import { stopSpeaking } from '../../../../../services/speechService';
import { useToast } from '../../../../common/notifications/useToast';
import ExternalEditingSessionModal from './ExternalEditingSessionModal';
import DocumentHistoryModal from './DocumentHistoryModal';
import DocumentSyncDetailsModal from '../../../../documentSync/DocumentSyncDetailsModal';
import {
  calculateDocumentActionMenuLayout,
  getVisibleViewportRect,
} from './documentActionMenuLayout';

const DOCUMENT_ACTION_MENU_ID = 'document-actions-menu';
const DOCUMENT_ACTION_MENU_MARGIN = 12;
const DOCUMENT_ACTION_MENU_GAP = 4;

// --- Helpers pour le nouvel affichage des documents ---
const getDocTypeBadge = (doc) => {
  const ext = getDocumentFileExtension(doc);
  if (ext === 'pdf') return { label: 'PDF', cls: 'doc-badge--pdf' };
  if (ext === 'doc' || ext === 'docx') return { label: 'DOC', cls: 'doc-badge--doc' };
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return { label: 'XLS', cls: 'doc-badge--xls' };
  if (ext === 'txt') return { label: 'TXT', cls: 'doc-badge--txt' };
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp') {
    return { label: 'IMG', cls: 'doc-badge--img' };
  }
  return { label: ext ? ext.toUpperCase().slice(0, 3) : 'DOC', cls: 'doc-badge--doc' };
};

const formatDocDate = (value) => {
  if (!value) return { date: null, time: null };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: null, time: null };
  const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const dayShort = d.toLocaleDateString('fr-FR', { weekday: 'short' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return { date, time: `${dayShort} ${time}` };
};

// Format relatif pour "Ouvert par X depuis Y min" (basé sur lockedAt timestamp)
const formatLockedSince = (lockedAt) => {
    if (!lockedAt) return '';
    const seconds = Math.floor((Date.now() - lockedAt) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h${(minutes % 60).toString().padStart(2, '0')}`;
};

// Crée le ghost qui suit la souris pendant le drag custom mouse-based.
// C'est un clone de la ligne source, semi-transparent, à largeur figée, sans
// les boutons d'action interactifs (menu ⋮, télécharger). Le clone hérite des
// styles d'origine pour ressembler le plus possible au document déplacé.
//
// Subtilité : la ligne reçoit son look (fond foncé, couleur de texte, layout
// grid, etc.) via un sélecteur ancestral `.dossier-v2__main .docListItem.doc-row`.
// Une fois clonée puis attachée à `body`, elle perd ce contexte parent et donc
// son look. On copie donc les computed styles clés depuis la source vers le
// clone ET ses enfants visibles (badge, titre, sous-titre, date), ce qui nous
// donne un rendu pixel-fidèle indépendant du chemin DOM du clone.
const GHOST_PROPS = [
  'backgroundColor', 'color', 'border', 'borderRadius', 'boxSizing',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'gap', 'columnGap', 'rowGap',
  'display', 'alignItems', 'justifyContent',
  'gridTemplateColumns', 'gridTemplateRows',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
  'letterSpacing', 'textTransform', 'textShadow',
];
const GHOST_CHILD_SELECTORS = [
  '.doc-row__badge',
  '.doc-row__main', '.doc-row__title', '.doc-row__subtitle',
  '.doc-row__date', '.doc-row__date-main', '.doc-row__date-sub',
];
const copyComputedStyle = (src, dst) => {
  if (!src || !dst) return;
  const cs = window.getComputedStyle(src);
  GHOST_PROPS.forEach(p => {
    const v = cs[p];
    if (v) dst.style[p] = v;
  });
};
const createDragGhost = (sourceRow) => {
  const fallback = () => {
    const el = document.createElement('div');
    el.className = 'k-drag-ghost k-drag-ghost--fallback';
    el.textContent = 'Document';
    return el;
  };
  if (!sourceRow || typeof sourceRow.cloneNode !== 'function') return fallback();
  try {
    const rect = sourceRow.getBoundingClientRect();
    const ghost = sourceRow.cloneNode(true);
    ghost.classList.add('k-drag-ghost');
    ghost.removeAttribute('draggable');
    // Retirer les éléments interactifs qui n'ont aucun sens dans le ghost
    ghost.querySelectorAll('.threeDotsIcon, .download-doc-btn, .doc-row__open-controls').forEach(el => el.remove());
    ghost.style.width = `${Math.round(rect.width)}px`;
    ghost.style.height = `${Math.round(rect.height)}px`;
    // Copier les computed styles depuis la source pour preserver le look
    copyComputedStyle(sourceRow, ghost);
    GHOST_CHILD_SELECTORS.forEach(sel => {
      copyComputedStyle(sourceRow.querySelector(sel), ghost.querySelector(sel));
    });
    return ghost;
  } catch (_err) {
    return fallback();
  }
};

// --- SOUS-COMPOSANT : Document ---
// Drag custom 100% basé sur mousedown/mousemove/mouseup global (pas HTML5
// drag, pas startDrag Electron). Garantit que ça marche sur tout : Chromium,
// Electron sandbox, Windows + macOS. Le ghost est un clone CSS qui suit la
// souris ; les targets (subfolder, breadcrumb retour) sont identifiés via
// data-attributes et highlighted via classList direct (pas React state).
const DraggableDocument = ({
  doc,
  resolvedColor,
  onDoubleClick,
  onThreeDotsClick,
  onDownload,
  onOpen,
  onOpenWith,
  isSelected,
  newlyCreatedDocId,
  newlyCreatedDocLabels,
  children,
  lockedByOther,
  lockInfo,
  onSourceMouseDown,
  // rc78 : édition inline du titre directement sur la card (clic sur le titre
  // OU menu ⋮ Renommer). La card garde son badge / date / sous-titre ; seul
  // .doc-row__title bascule de <div> à <input> à la même position et avec la
  // même typo pour éviter tout saut visuel.
  isRenaming,
  renameValue,
  onTitleClick,
  onRenameChange,
  onRenameKeyDown,
  onRenameBlur,
}) => {
  const displayText = getDisplayTextOldMode(doc, newlyCreatedDocId, newlyCreatedDocLabels);
  const textToSpeak = formatDisplayTextForSpeech(displayText);

  // Decoupage du libelle pour l'affichage enrichi
  const titleStripped = (doc?.nomDocument || displayText)
    .replace(/\.(docx|pdf|doc|rtf|txt|xls|xlsx|csv|zip|jpg|jpeg|png|gif)$/i, m => m); // garde extension
  const subtitleParts = displayText.split(' - ').filter(Boolean);
  const subtitle = subtitleParts.length > 1
    ? subtitleParts.slice(1, -1).join(' \u2014 ') || subtitleParts.slice(0, -1).join(' \u2014 ')
    : null;

  const badge = getDocTypeBadge(doc);
  const { date: shortDate, time: dayTime } = formatDocDate(doc?.dateCreation);

  const lockTitle = lockedByOther && lockInfo
    ? `Document ouvert par ${lockInfo.displayName || 'un autre utilisateur'} depuis ${formatLockedSince(lockInfo.lockedAt)}`
    : `Cree le: ${new Date(doc.dateCreation).toLocaleString('fr-FR')}\nCategorie: ${doc.categorie || 'N/A'}\nGlissez pour deplacer · Maj+glissez pour exporter vers une autre application`;

  return (
    <HoverToSpeak textToSpeak={textToSpeak}>
      <div
        className={`docListItem doc-row${lockedByOther ? ' doc-row--locked' : ''}${isRenaming ? ' doc-row--renaming' : ''}`}
        role="group"
        aria-label={`Document ${doc?.nomDocument || displayText || 'sans titre'}`}
        draggable={!lockedByOther && !isRenaming}
        onMouseDown={(e) => {
          if (lockedByOther || isRenaming) return;
          // Shift+mousedown = drag externe vers une autre app (ChatGPT,
          // Claude, Explorer Windows…). On déclenche startFileDrag IMMÉDIATEMENT
          // au mousedown, pas au dragstart : sur Electron Windows, l'IPC
          // asynchrone vers le main process ne peut pas se synchroniser avec
          // le dragstart natif depuis tous les enfants de la ligne (le browser
          // ne « rattrape » le startDrag tardif que depuis du texte sélectionnable
          // comme le titre, mais pas depuis le badge ou la date). En tirant
          // au mousedown, on donne suffisamment de marge à l'IPC pour atteindre
          // le main avant que le drag de fichier OS doive être amorcé.
          if (e.shiftKey) {
            if (window.electron?.startFileDrag) {
              window.electron.startFileDrag(doc);
            }
            return; // ne pas démarrer le drag custom mouse-based
          }
          if (onSourceMouseDown) onSourceMouseDown(e, doc);
        }}
        onDragStart={(e) => {
          // Le HTML5 dragstart fire car draggable={true}. On bloque toujours
          // le drag HTML5 par défaut (qui sinon créerait une .url) :
          //  - Shift : startFileDrag a déjà été appelé au mousedown, le drag
          //    de fichier OS Electron est en cours.
          //  - Sans Shift : drag interne ; le drag custom mouse-based prend
          //    la main via onMouseDown.
          e.preventDefault();
        }}
        onDoubleClick={() => onDoubleClick(doc)}
        title={lockTitle}
        aria-disabled={lockedByOther ? 'true' : undefined}
        style={{
          backgroundColor: resolvedColor,
          opacity: lockedByOther ? 0.55 : 1,
          cursor: lockedByOther ? 'not-allowed' : 'grab',
        }}
      >
        <div className={`doc-row__badge ${badge.cls}`} aria-hidden="true">
          {badge.label}
        </div>

        <div className="doc-row__main">
          {isRenaming ? (
            <input
              className="doc-row__title doc-row__title--editing"
              type="text"
              value={renameValue}
              onChange={onRenameChange}
              onKeyDown={(e) => onRenameKeyDown && onRenameKeyDown(e, doc, 'document')}
              onBlur={() => onRenameBlur && onRenameBlur(doc, 'document')}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              onFocus={(e) => e.target.select()}
              aria-label="Renommer le document"
            />
          ) : (
            <div
              className="doc-row__title"
              onClick={(e) => {
                if (lockedByOther || !onTitleClick) return;
                e.stopPropagation();
                onTitleClick(doc);
              }}
              title={lockedByOther ? undefined : 'Cliquer pour renommer'}
            >
              {titleStripped}
              {lockedByOther && (
                <span className="doc-row__lock" aria-label="Document verrouillé">
                  {' '}🔒
                </span>
              )}
            </div>
          )}
          {subtitle && (
            <div className="doc-row__subtitle">{subtitle}</div>
          )}
          {lockedByOther && lockInfo && (
            <div className="doc-row__lock-info">
              Ouvert par <strong>{lockInfo.displayName || 'un autre utilisateur'}</strong>
              {lockInfo.lockedAt ? ` · depuis ${formatLockedSince(lockInfo.lockedAt)}` : ''}
            </div>
          )}
          {/* Fallback sur l'ancien rendu pour la compatibilite (lecture rapide) */}
          <span className="k-sr-only">{displayText}</span>
        </div>

        {(shortDate || dayTime) && (
          <div className="doc-row__date">
            {shortDate && <span className="doc-row__date-main">{shortDate}</span>}
            {dayTime && <span className="doc-row__date-sub">{dayTime}</span>}
          </div>
        )}

        <div className="doc-row__open-controls" onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="doc-row__open-main"
            onClick={(e) => { e.stopPropagation(); onOpen?.(doc); }}
            disabled={lockedByOther || isRenaming}
            title="Ouvrir le document avec votre méthode habituelle"
          >
            Ouvrir le document
          </button>
          <button
            type="button"
            className="doc-row__open-more"
            onClick={(e) => { e.stopPropagation(); onOpenWith?.(doc); }}
            disabled={lockedByOther || isRenaming}
            aria-label="Ouvrir avec une autre méthode"
            title="Ouvrir avec…"
          >⌄</button>
        </div>

        {/* Icône Télécharger : historiquement limitée aux .txt (export texte) ;
            élargie aux .docx/.doc depuis que le téléchargement serveur existe
            en mode web (GET /api/word/:docId/download), et à TOUS les fichiers
            DÉPOSÉS (drag & drop web → stockage cabinet, PDF/images/etc.). */}
        {(/\.(txt|docx?)$/i.test(doc.nomDocument || '') || doc.categorie === 'dropped') && onDownload && (
          <div
            className="download-doc-btn"
            onClick={(e) => onDownload(e, doc)}
            onDoubleClick={(e) => e.stopPropagation()}
            onMouseEnter={(e) => { e.stopPropagation(); stopSpeaking(); }}
            title="Telecharger"
          >
            <img src={TelechargerIcon} alt="Telecharger" className="download-doc-icon" />
          </div>
        )}
        <div
          id={`document-actions-trigger-${doc._id}`}
          className={`threeDotsIcon ${isSelected ? 'activeDot' : ''}`}
          onClick={(e) => onThreeDotsClick(e, doc._id, 'document')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault();
              onThreeDotsClick(e, doc._id, 'document');
            }
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onMouseEnter={(e) => { e.stopPropagation(); stopSpeaking(); }}
          title="Options"
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={isSelected}
          aria-controls={isSelected ? DOCUMENT_ACTION_MENU_ID : undefined}
          aria-label={`Options du document ${doc.nomDocument || ''}`.trim()}
        >&#x22EE;</div>
        {children}
      </div>
    </HoverToSpeak>
  );
};

// Wrapper qui injecte l'état de verrou depuis Redux dans DraggableDocument.
// Évite de faire un useSelector dans la mapList (Hook conditionnel = invalide).
const DraggableDocumentWithLock = (props) => {
  const lockedByOther = useSelector((s) => selectIsDocLockedByOther(s, props.doc?._id));
  const lockInfo = useSelector((s) => selectLockForDoc(s, props.doc?._id));
  return <DraggableDocument {...props} lockedByOther={lockedByOther} lockInfo={lockInfo} />;
};

// --- SOUS-COMPOSANT : Sous-Dossier ---
// Cible de drop passive pour le drag custom : identifié par
// data-kheops-subfolder-id. Le DocumentList lit ce data-attribute via
// elementFromPoint dans son mousemove/mouseup global, pas besoin de drag
// handlers HTML5 sur le sous-dossier lui-même.
const DroppableSubfolder = ({ subfolder, onThreeDotsClick, onNavigate, isSelected, documentCount, isRenaming, renameValue, onTitleClick, onRenameChange, onRenameKeyDown, onRenameBlur, children }) => {
  const textToSpeak = `Dossier ${subfolder.name}, contient ${documentCount} élément${documentCount > 1 ? 's' : ''}`;
  const folderClasses = `docListItem is-subfolder`;
  const tooltipText = `Dossier: ${subfolder.name}`;

  return (
    <HoverToSpeak textToSpeak={textToSpeak}>
      <div
        className={folderClasses}
        data-kheops-subfolder-id={subfolder._id}
        onClick={() => { if (!isRenaming) onNavigate(subfolder); }}
        title={tooltipText}
        style={{ backgroundColor: subfolder.color || 'transparent' }}
      >
        <img src={SousDossier} alt="Sous-dossier" className="subfolder-icon" />
        <span className="subfolder-name">
          {isRenaming ? (
            <input
              className="subfolder-name-input"
              type="text"
              value={renameValue}
              onChange={onRenameChange}
              onKeyDown={(e) => onRenameKeyDown && onRenameKeyDown(e, subfolder, 'subfolder')}
              onBlur={() => onRenameBlur && onRenameBlur(subfolder, 'subfolder')}
              onMouseDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              autoFocus
              onFocus={(e) => e.target.select()}
              aria-label="Renommer le sous-dossier"
            />
          ) : (
            <span
              className="subfolder-name-text"
              onClick={(e) => {
                if (!onTitleClick) return;
                e.stopPropagation();
                onTitleClick(subfolder);
              }}
              title="Cliquer sur le nom pour renommer"
            >
              {subfolder.name}
            </span>
          )}
        </span>
        {documentCount > 0 && <span className="subfolder-item-count">({documentCount})</span>}
        <div
          id={`document-actions-trigger-${subfolder._id}`}
          className={`threeDotsIcon ${isSelected ? 'activeDot' : ''}`}
          onClick={(e) => onThreeDotsClick(e, subfolder._id, 'subfolder')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault();
              onThreeDotsClick(e, subfolder._id, 'subfolder');
            }
          }}
          onMouseEnter={(e) => { e.stopPropagation(); stopSpeaking(); }}
          title="Options"
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={isSelected}
          aria-controls={isSelected ? DOCUMENT_ACTION_MENU_ID : undefined}
          aria-label={`Options du sous-dossier ${subfolder.name || ''}`.trim()}
        >⋮</div>
        {children}
      </div>
    </HoverToSpeak>
  );
};

const getDisplayTextOldMode = (doc, newlyCreatedDocId, newlyCreatedDocLabels) => {
  let docDate = doc.dateCreation;
  const parsedDate = new Date(doc.dateCreation);
  if (typeof doc.dateCreation === 'string' && !isNaN(parsedDate.getTime())) {
    docDate = parsedDate.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
  } else if (doc.dateCreation instanceof Date && !isNaN(doc.dateCreation)) {
    docDate = doc.dateCreation.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' });
  } else { docDate = 'Date inconnue'; }
  let recipientLabelToShow = doc.recipient || '';
  if (doc._id === newlyCreatedDocId) { recipientLabelToShow = newlyCreatedDocLabels; }
  if (doc.categorie === 'dropped') { return doc.nomDocument; }
  if (doc.nomDocument && doc.nomDocument.includes(' - ')) {
    const parts = doc.nomDocument.split(' - ');
    if (parts.length >= 3 && parts[1].match(/^[0-9a-fA-F]{24}$/)) { return `${parts[0]} - ${parts[2]}`; }
    return doc.nomDocument;
  }
  if ((doc.categorie === 'selectOneDestinataire' || doc.categorie === 'selectMultiDestinataire') && recipientLabelToShow) {
    return `${doc.nomDocument} - ${recipientLabelToShow} - ${docDate}`;
  }
  return `${doc.nomDocument} - ${docDate}`;
};

const formatDisplayTextForSpeech = (text) => {
  if (!text) return '';
  let speechText = text;
  const dayReplacements = {
    'dim.': 'dimanche', 'lun.': 'lundi', 'mar.': 'mardi',
    'mer.': 'mercredi', 'jeu.': 'jeudi', 'ven.': 'vendredi', 'sam.': 'samedi',
  };
  for (const [short, long] of Object.entries(dayReplacements)) {
    speechText = speechText.replace(new RegExp(short, 'gi'), long);
  }
  speechText = speechText.replace(/\.(docx|pdf|doc|rtf)$/i, '');
  speechText = speechText.replace(/\s+-\s+/g, ', ');
  return speechText;
};

const DocumentList = ({
  subfolders,
  documents,
  allDocuments,
  onNavigateToSubfolder,
  currentSubfolderId,
  handleMoveDocumentToSubfolder,
  handleRenameSubfolder,
  miniModalItemId,
  setMiniModalItemId,
  handleDuplicateDocument,
  handleRenameDocument,
  confirmDeleteItem,
  renamingItemId,
  setRenamingItemId,
  renameValue,
  setRenameValue,
  handleRenameValueChange,
  handleRenameKeyDown,
  handleRenameBlur,
  validateRename,
  isDraggingOver,
  handleDragOver,
  handleDragEnter,
  handleDragLeave,
  handleDrop,
  handleImportFiles,
  isImportingFiles = false,
  uploadError,
  isUploading,
  newlyCreatedDocId,
  newlyCreatedDocLabels,
  sortMode = 'date-desc',
  classifyDocument,
}) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const [showSendModal, setShowSendModal] = useState(false);
  const [emailData, setEmailData] = useState({ to: '', docs: [], displayName: '', isLocalAttachment: false });
  const [emailChoiceData, setEmailChoiceData] = useState(null); // Modale intermédiaire PM privée
  const [colorPickerItemId, setColorPickerItemId] = useState(null);
  const [liveColor, setLiveColor] = useState(null);
  const [miniModalItemType, setMiniModalItemType] = useState(null);
  const [miniModalPosition, setMiniModalPosition] = useState({
    top: 0,
    left: 0,
    maxHeight: 0,
    placement: 'bottom',
    ready: false,
  });
  const [activeOpeningDocument, setActiveOpeningDocument] = useState(null);
  const [pendingOpeningAction, setPendingOpeningAction] = useState(null);
  const [openingPurpose, setOpeningPurpose] = useState('open');
  const [editorDocument, setEditorDocument] = useState(null);
  const [textPreviewDocument, setTextPreviewDocument] = useState(null);
  const [externalSession, setExternalSession] = useState(null);
  const [historyDocument, setHistoryDocument] = useState(null);
  const [syncDocument, setSyncDocument] = useState(null);
  const colorPickerModalRef = useRef(null);
  const miniModalRef = useRef(null);
  const miniModalTriggerRef = useRef(null);
  const openingRequestInFlightRef = useRef(false);
  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  const token = useSelector(state => state.login.token);
  const user = useSelector(state => state.login.user);
  const dossierTypeColorKey = useMemo(() => getDossierColorKey(currentDossier), [currentDossier]);
  const resolveColorForDocument = useCallback((document) => resolveDocumentColor({
    document,
    documentPreferences: user?.documentColorPreferences,
    dossierPreferences: user?.dossierColorPreferences,
    dossierTypeKey: dossierTypeColorKey,
  }), [user?.documentColorPreferences, user?.dossierColorPreferences, dossierTypeColorKey]);

  // ── Verrouillage collaboratif ────────────────────────────────────────────
  // Démarre le polling sur les documents visibles et expose acquire/release.
  const visibleDocIds = useMemo(() => documents.map(d => d._id).filter(Boolean), [documents]);
  useDocumentLockPolling(visibleDocIds);
  const { tryOpen: tryAcquireDocLock, release: releaseDocLock } = useDocumentLock();

  React.useEffect(() => {
    const onWordConflict = (event) => {
      const message = event?.detail?.message
        || 'Une autre version de ce document a été enregistrée pendant votre édition.';
      toast.error(
        `${message} Votre version et la version actuelle ont toutes les deux été conservées. Ouvrez l’historique pour choisir celle à garder.`,
        { title: 'Conflit de versions Word' },
      );
    };
    window.addEventListener('kheops:word-version-conflict', onWordConflict);
    return () => window.removeEventListener('kheops:word-version-conflict', onWordConflict);
  }, [toast]);

  // ── Drag custom mouse-based (indépendant de HTML5 drag / startDrag) ─────
  // Sur mousedown sur une ligne : enregistre la position. Au-delà de 5 px de
  // mouvement : crée un ghost qui suit la souris, et highlight les targets
  // (subfolder ou breadcrumb retour). Au mouseup : si on est sur un target,
  // déclenche le move ; sinon annule. Si pas de mouvement = simple click.
  const handleSourceMouseDown = useCallback((e, doc) => {
    if (e.button !== 0) return; // left click only
    // Ignore clicks sur les sous-éléments interactifs (menu ⋮, télécharger)
    if (e.target.closest('.threeDotsIcon, .download-doc-btn, .doc-row__open-controls, .colorOptionContainer, .actionBtn, input, .doc-row__title--editing')) return;

    // Capture le DOM de la ligne source AVANT que e ne soit recyclé par React.
    // Le clone servira de ghost semi-transparent dans le mousemove.
    const sourceRow = e.currentTarget;
    // Offset du curseur dans la ligne au moment du clic. On le préserve
    // pendant le drag pour que la pointe du curseur reste à la même position
    // relative dans le ghost (ex : si on clique sur le titre, la pointe reste
    // sur le titre du ghost).
    const sourceRect = sourceRow.getBoundingClientRect();
    const offsetX = e.clientX - sourceRect.left;
    const offsetY = e.clientY - sourceRect.top;
    let ghost = null;
    let lastTarget = null;
    const startX = e.clientX;
    const startY = e.clientY;

    // === rc79 : auto-scroll pendant le drag ===
    // Identifie le scroll container ancestor de la card source pour scroller la
    // liste docs vers le haut/bas quand la souris approche d'un bord (hot zone
    // 60px, vitesse 2-12 px/frame proportionnelle à la distance au bord).
    // Utile quand la cible (sous-dossier) est hors champ.
    let scrollContainer = sourceRow.parentElement;
    while (scrollContainer) {
      const cs = getComputedStyle(scrollContainer);
      if (
        (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
        scrollContainer.scrollHeight > scrollContainer.clientHeight
      ) break;
      scrollContainer = scrollContainer.parentElement;
    }
    let lastClientY = e.clientY;
    let scrollRafId = null;
    const AUTOSCROLL_HOT_ZONE = 60;
    const AUTOSCROLL_MIN_SPEED = 2;
    const AUTOSCROLL_MAX_SPEED = 12;
    const tickScroll = () => {
      if (!scrollContainer) {
        scrollRafId = null;
        return;
      }
      const rect = scrollContainer.getBoundingClientRect();
      const distFromTop = lastClientY - rect.top;
      const distFromBottom = rect.bottom - lastClientY;
      let delta = 0;
      if (distFromTop >= 0 && distFromTop < AUTOSCROLL_HOT_ZONE) {
        const ratio = 1 - (distFromTop / AUTOSCROLL_HOT_ZONE);
        delta = -Math.round(AUTOSCROLL_MIN_SPEED + (AUTOSCROLL_MAX_SPEED - AUTOSCROLL_MIN_SPEED) * ratio);
      } else if (distFromBottom >= 0 && distFromBottom < AUTOSCROLL_HOT_ZONE) {
        const ratio = 1 - (distFromBottom / AUTOSCROLL_HOT_ZONE);
        delta = Math.round(AUTOSCROLL_MIN_SPEED + (AUTOSCROLL_MAX_SPEED - AUTOSCROLL_MIN_SPEED) * ratio);
      }
      if (delta !== 0) {
        const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
        scrollContainer.scrollTop = Math.max(0, Math.min(maxScroll, scrollContainer.scrollTop + delta));
      }
      scrollRafId = requestAnimationFrame(tickScroll);
    };

    const onMouseMove = (ev) => {
      lastClientY = ev.clientY;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      if (!ghost && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        ghost = createDragGhost(sourceRow);
        document.body.appendChild(ghost);
        if (scrollContainer && !scrollRafId) {
          scrollRafId = requestAnimationFrame(tickScroll);
        }
      }

      if (ghost) {
        ghost.style.top = (ev.clientY - offsetY) + 'px';
        ghost.style.left = (ev.clientX - offsetX) + 'px';

        // Détection target sous le curseur
        const below = document.elementFromPoint(ev.clientX, ev.clientY);
        const sf = below?.closest('[data-kheops-subfolder-id]');
        const back = below?.closest('[data-kheops-back-breadcrumb]');
        let newTarget = sf || back || null;
        // En mode sous-dossier, la zone racine de la liste (en dehors d'un
        // subfolder ou du breadcrumb retour) devient une cible valide :
        // drop = remontée du doc à la racine du dossier.
        if (!newTarget && currentSubfolderId) {
          const docList = below?.closest('[data-kheops-current-subfolder-id]');
          if (docList && docList.getAttribute('data-kheops-current-subfolder-id')) {
            newTarget = docList;
          }
        }
        if (newTarget !== lastTarget) {
          if (lastTarget) lastTarget.classList.remove('drop-target-active');
          if (newTarget) newTarget.classList.add('drop-target-active');
          lastTarget = newTarget;
        }
      }
    };

    const onMouseUp = (ev) => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (scrollRafId) {
        cancelAnimationFrame(scrollRafId);
        scrollRafId = null;
      }
      if (lastTarget) lastTarget.classList.remove('drop-target-active');
      if (ghost) ghost.remove();
      // Pas de drag effectif (juste un click) → laisse le click passer
      if (!ghost) return;

      const below = document.elementFromPoint(ev.clientX, ev.clientY);
      const sf = below?.closest('[data-kheops-subfolder-id]');
      const back = below?.closest('[data-kheops-back-breadcrumb]');
      if (sf) {
        handleMoveDocumentToSubfolder(doc._id, sf.getAttribute('data-kheops-subfolder-id'));
      } else if (back) {
        handleMoveDocumentToSubfolder(doc._id, null);
      } else if (currentSubfolderId) {
        // Drop dans la zone racine de la liste, en mode sous-dossier :
        // on remonte le doc à la racine du dossier.
        const docList = below?.closest('[data-kheops-current-subfolder-id]');
        if (docList && docList.getAttribute('data-kheops-current-subfolder-id')) {
          handleMoveDocumentToSubfolder(doc._id, null);
        }
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [handleMoveDocumentToSubfolder, currentSubfolderId]);

  // ── Feedback startDrag : toast si le fichier n'est pas synchronisé ─────
  // Le main process renvoie 'file-missing' quand un doc cloud-only n'a pas
  // encore été pull en local. Cas typique : exports texte générés serveur.
  useLayoutEffect(() => {
    if (!window.electron?.onStartFileDragResult) return;
    const unsubscribe = window.electron.onStartFileDragResult((payload) => {
      if (!payload || payload.success) return;
      if (payload.error === 'file-missing-fetching') {
        // L'agent vient de lancer un téléchargement Cloud automatique.
        // L'utilisateur retentera le drag dans quelques secondes.
        toast.info(
          `Téléchargement automatique de "${payload.nomDocument || 'ce document'}" en cours. Réessayez le glisser-déposer dans quelques secondes.`,
          { title: 'Document en cours de synchronisation' }
        );
      } else if (payload.error === 'file-fetched') {
        // Le téléchargement automatique a abouti : doc dispo en local.
        toast.success(
          `"${payload.nomDocument || 'Le document'}" est prêt. Vous pouvez maintenant le glisser-déposer.`,
          { title: 'Document synchronisé' }
        );
      } else if (payload.error === 'file-missing-no-cloud') {
        // Téléchargement automatique a échoué (fichier introuvable sur le Cloud).
        toast.warning(
          `Le document n'a pas pu être récupéré depuis le Cloud (${payload.message || 'erreur inconnue'}). Il a peut-être été supprimé ou n'a jamais été uploadé.`,
          { title: 'Document indisponible' }
        );
      } else if (payload.error === 'file-missing') {
        // Cas legacy (auto-fetch non dispatché) — message historique.
        toast.warning(
          "Document pas encore synchronisé localement. Faites Ouvrir (double-clic) une fois pour le télécharger, puis réessayez le glisser-déposer.",
          { title: 'Document non disponible localement' }
        );
      } else if (payload.error === 'no-root-path') {
        toast.error("Configuration locale manquante : impossible de glisser le document.");
      } else if (payload.error === 'invalid-doc') {
        toast.error("Document invalide : glisser-déposer impossible.");
      } else if (payload.error === 'exception') {
        toast.error(`Erreur drag : ${payload.message || 'inconnue'}`);
      }
    });
    return unsubscribe;
  }, [toast]);

  const sortedSubfolders = useMemo(() => {
    return [...subfolders].sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  }, [subfolders]);

  const sortedDocuments = useMemo(() => {
    const sign = sortMode === 'date-asc' ? 1 : -1;
    return [...documents].sort((a, b) => sign * (new Date(a.dateCreation) - new Date(b.dateCreation)));
  }, [documents, sortMode]);

  // Decoupage RECENTS / ANTERIEURS : recents = meme jour que le doc le plus recent
  const { recentDocs, olderDocs, recentDateLabel } = useMemo(() => {
    if (sortedDocuments.length === 0) {
      return { recentDocs: [], olderDocs: [], recentDateLabel: null };
    }
    const dates = sortedDocuments
      .map(d => new Date(d.dateCreation))
      .filter(d => !Number.isNaN(d.getTime()))
      .map(d => d.getTime());
    if (dates.length === 0) {
      return { recentDocs: sortedDocuments, olderDocs: [], recentDateLabel: null };
    }
    const mostRecentTs = Math.max(...dates);
    const mostRecent = new Date(mostRecentTs);
    const sameDay = (ts) => {
      const d = new Date(ts);
      return d.getFullYear() === mostRecent.getFullYear()
        && d.getMonth() === mostRecent.getMonth()
        && d.getDate() === mostRecent.getDate();
    };
    const recentDocs = sortedDocuments.filter(d => {
      const t = new Date(d.dateCreation).getTime();
      return !Number.isNaN(t) && sameDay(t);
    });
    const olderDocs = sortedDocuments.filter(d => !recentDocs.includes(d));
    const recentDateLabel = mostRecent.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).toUpperCase();
    return { recentDocs, olderDocs, recentDateLabel };
  }, [sortedDocuments]);

  const restoreMiniModalTriggerFocus = useCallback(() => {
    const trigger = miniModalTriggerRef.current;
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected && typeof trigger.focus === 'function') {
        trigger.focus();
      }
    });
  }, []);

  const closeMiniModal = useCallback((restoreFocus = false) => {
    setMiniModalItemId(null);
    if (restoreFocus) restoreMiniModalTriggerFocus();
  }, [restoreMiniModalTriggerFocus, setMiniModalItemId]);

  const focusMiniModalItem = useCallback((item) => {
    if (!item) return;
    try {
      item.focus({ preventScroll: true });
    } catch (_) {
      item.focus();
    }
    if (typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, []);

  const updateMiniModalPosition = useCallback(() => {
    const menu = miniModalRef.current;
    const trigger = miniModalTriggerRef.current;
    if (!menu || !trigger) return;
    if (!trigger.isConnected) {
      setMiniModalItemId(null);
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const layout = calculateDocumentActionMenuLayout({
      anchorRect: triggerRect,
      menuWidth: menuRect.width || menu.offsetWidth,
      menuHeight: menu.scrollHeight || menuRect.height,
      viewportRect: getVisibleViewportRect(window),
      margin: DOCUMENT_ACTION_MENU_MARGIN,
      gap: DOCUMENT_ACTION_MENU_GAP,
    });

    setMiniModalPosition((previous) => {
      const next = { ...layout, ready: true };
      if (
        previous.ready
        && previous.top === next.top
        && previous.left === next.left
        && previous.maxHeight === next.maxHeight
        && previous.placement === next.placement
      ) {
        return previous;
      }
      return next;
    });
  }, [setMiniModalItemId]);

  useLayoutEffect(() => {
    if (!miniModalItemId) return undefined;

    let animationFrame = 0;
    const schedulePositionUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateMiniModalPosition);
    };
    const handleViewportScroll = (event) => {
      if (miniModalRef.current?.contains(event.target)) return;
      schedulePositionUpdate();
    };

    schedulePositionUpdate();
    window.addEventListener('resize', schedulePositionUpdate);
    window.addEventListener('scroll', handleViewportScroll, true);
    window.visualViewport?.addEventListener('resize', schedulePositionUpdate);
    window.visualViewport?.addEventListener('scroll', schedulePositionUpdate);

    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(schedulePositionUpdate)
      : null;
    if (resizeObserver && miniModalRef.current) resizeObserver.observe(miniModalRef.current);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', schedulePositionUpdate);
      window.removeEventListener('scroll', handleViewportScroll, true);
      window.visualViewport?.removeEventListener('resize', schedulePositionUpdate);
      window.visualViewport?.removeEventListener('scroll', schedulePositionUpdate);
      resizeObserver?.disconnect();
    };
  }, [miniModalItemId, miniModalItemType, updateMiniModalPosition]);

  useLayoutEffect(() => {
    if (!miniModalItemId || !miniModalPosition.ready) return;
    const firstItem = miniModalRef.current?.querySelector('[role="menuitem"]');
    focusMiniModalItem(firstItem);
  }, [focusMiniModalItem, miniModalItemId, miniModalPosition.ready]);

  useLayoutEffect(() => {
    const handleClickOutside = (event) => {
      const isClickingInsideMiniModal = miniModalRef.current && miniModalRef.current.contains(event.target);
      const isClickingInsideColorPicker = colorPickerModalRef.current && colorPickerModalRef.current.contains(event.target);

      if (!isClickingInsideMiniModal && !isClickingInsideColorPicker) {
        setMiniModalItemId(null);
        setColorPickerItemId(null);
      }
    };
    const handleEscape = (event) => {
      if (event.key !== 'Escape' || !miniModalItemId) return;
      event.preventDefault();
      closeMiniModal(true);
    };

    if (miniModalItemId || colorPickerItemId) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [closeMiniModal, miniModalItemId, colorPickerItemId, setMiniModalItemId, setColorPickerItemId]);

  const handleMiniModalKeyDown = useCallback((event) => {
    const menuItems = Array.from(
      miniModalRef.current?.querySelectorAll('[role="menuitem"]') || [],
    );
    const currentIndex = menuItems.indexOf(document.activeElement);

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMiniModal(true);
      return;
    }

    let targetIndex = null;
    if (event.key === 'ArrowDown') targetIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % menuItems.length;
    if (event.key === 'ArrowUp') targetIndex = currentIndex < 0 ? menuItems.length - 1 : (currentIndex - 1 + menuItems.length) % menuItems.length;
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = menuItems.length - 1;

    if (targetIndex !== null && menuItems[targetIndex]) {
      event.preventDefault();
      focusMiniModalItem(menuItems[targetIndex]);
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && document.activeElement?.getAttribute('role') === 'menuitem') {
      event.preventDefault();
      document.activeElement.click();
    }
  }, [closeMiniModal, focusMiniModalItem]);

  const onThreeDotsClick = (e, itemId, itemType) => {
    e.stopPropagation();
    stopSpeaking();

    const dotEl = e.currentTarget;
    miniModalTriggerRef.current = dotEl;

    if (miniModalItemId === itemId) {
      setMiniModalItemId(null);
      return;
    }

    setMiniModalPosition((previous) => ({ ...previous, ready: false }));
    setMiniModalItemType(itemType);
    setMiniModalItemId(itemId);
  };

  const handleColorChange = (itemId, type, color) => {
    if (!currentDossier?._id || !token) return;
    const newColor = color === 'transparent' ? null : color;
    if (type === 'document') {
      dispatch(updateDocumentColor(currentDossier._id, itemId, newColor, token));
    } else if (type === 'subfolder') {
      dispatch(updateSubfolder(currentDossier._id, itemId, { color: newColor }, token));
    }
  };

  const handleSendClick = (e, doc) => {
    e.stopPropagation();

    // ========================================================================
    // === CORRECTIF : Chercher l'email ACTUEL dans les parties du dossier ===
    // ========================================================================
    // doc.destinataires[0].email est un snapshot figé au moment de la création
    // du document. Si le contact a été modifié depuis, cette valeur est périmée.
    // On cherche d'abord l'email à jour dans les parties du dossier Redux.
    //
    // IMPORTANT : destinataires[0].id est un ID COMPOSITE comme :
    //   "pour-507f1f77...", "contre-contact-507f1f77...", "dossier-507f1f77..."
    // Il faut en extraire l'ObjectId MongoDB (24 chars hexa) pour le comparer.
    // ========================================================================
    let email = '';
    const destinataireCompositeId = doc?.destinataires?.[0]?.id;

    if (destinataireCompositeId && currentDossier?.dossier?.parties) {
      // Extraire le vrai ObjectId MongoDB depuis l'ID composite
      const objectIdMatch = destinataireCompositeId.match(/([a-f0-9]{24})$/i);
      const actualEntityId = objectIdMatch ? objectIdMatch[1] : destinataireCompositeId;

      const { pour = [], contre = [] } = currentDossier.dossier.parties;
      const allEntities = [...pour, ...contre].flatMap(p => [
        p.partieData,
        ...(p.avocats || []),
        ...(p.contacts || []),
      ].filter(Boolean));

      // Aussi chercher dans contactsDuDossier (cas "dossier-ID")
      const dossierContacts = currentDossier?.dossier?.contactsDuDossier || [];
      const allSearchable = [...allEntities, ...dossierContacts];

      const found = allSearchable.find(entity =>
        entity._id && entity._id.toString() === actualEntityId
      );

      // ====================================================================
      // === PM Privée : modale intermédiaire si 2 emails disponibles ===
      // ====================================================================
      if (found && found.raisonSociale) {
        const emailEntreprise = found.emailEntreprise;
        const emailInterlocuteur = found.interlocuteurEmail;
        const hasBothEmails = emailEntreprise && emailInterlocuteur;
        const hasSingleEmail = emailEntreprise || emailInterlocuteur;

        if (hasBothEmails) {
          // 2 emails → afficher la modale intermédiaire de choix
          const interlocuteurName = `${found.interlocuteurPrenom || ''} ${found.interlocuteurNom || ''}`.trim();
          setEmailChoiceData({
            entity: found,
            doc: doc,
            choices: [
              {
                label: `Email de l'entreprise`,
                sublabel: found.raisonSociale,
                email: emailEntreprise,
              },
              {
                label: interlocuteurName || 'Interlocuteur principal',
                sublabel: `Interlocuteur principal${found.interlocuteurFonction ? ` — ${found.interlocuteurFonction}` : ''}`,
                email: emailInterlocuteur,
              },
            ],
          });
          setMiniModalItemId(null);
          console.log('[handleSendClick] PM privée avec 2 emails → modale intermédiaire');
          return; // Ne pas ouvrir SendEmailModal directement
        } else if (hasSingleEmail) {
          email = emailEntreprise || emailInterlocuteur;
          console.log('[handleSendClick] PM privée avec 1 seul email:', email);
        } else {
          console.log('[handleSendClick] PM privée sans email défini');
        }
      } else if (found?.email) {
        // Personne physique ou PM publique : champ email standard
        email = found.email;
        console.log('[handleSendClick] Email à jour trouvé dans parties:', email, '(ID composite:', destinataireCompositeId, '→ extrait:', actualEntityId, ')');
      } else {
        console.log('[handleSendClick] Aucune correspondance pour ID composite:', destinataireCompositeId, '→ extrait:', actualEntityId);
      }
    }

    // Fallback : utiliser le snapshot du document si aucune correspondance trouvée
    if (!email) {
      email = doc?.destinataires?.[0]?.email || doc?.recipientEmail || doc?.email || '';
      console.log('[handleSendClick] Email fallback (snapshot document):', email);
    }
    // ========================================================================

    const emailWithSpace = email ? `${email} ` : '';
    const hasElectronIPC = !!(window && window.electron && typeof window.electron.getLocalFile === 'function');
    const displayName = getDisplayTextOldMode(doc, newlyCreatedDocId, newlyCreatedDocLabels);
    setEmailData({ to: emailWithSpace, docs: [doc], displayName, isLocalAttachment: hasElectronIPC });
    setShowSendModal(true);
    setMiniModalItemId(null);
  };

  // === Handler pour le choix email dans la modale intermédiaire PM privée ===
  const handleEmailChoice = (choice) => {
    const emailWithSpace = choice.email ? `${choice.email} ` : '';
    const doc = emailChoiceData.doc;
    const displayName = getDisplayTextOldMode(doc, newlyCreatedDocId, newlyCreatedDocLabels);
    const hasElectronIPC = !!(window && window.electron && typeof window.electron.getLocalFile === 'function');
    setEmailData({ to: emailWithSpace, docs: [doc], displayName, isLocalAttachment: hasElectronIPC });
    setShowSendModal(true);
    setEmailChoiceData(null);
    setMiniModalItemId(null);
  };

  const handleSendSubfolderClick = (e, subfolder) => {
    e.stopPropagation();
    const docsInSubfolder = allDocuments.filter(d => d.subfolderId === subfolder._id);
    if (docsInSubfolder.length === 0) {
        toast.warning("Ce sous-dossier est vide. Il n'y a aucun document à envoyer.");
        setMiniModalItemId(null);
        return;
    }
    const hasElectronIPC = !!(window && window.electron && typeof window.electron.getLocalFile === 'function');
    setEmailData({
        to: '',
        docs: docsInSubfolder,
        displayName: `Documents du dossier ${subfolder.name}`,
        isLocalAttachment: hasElectronIPC,
    });
    setShowSendModal(true);
    setMiniModalItemId(null);
  };

  const handleOpenDocument = async (doc) => {
    // ── Étape 1 : tenter d'acquérir le verrou collaboratif ──────────────
    // Si un autre utilisateur a déjà ouvert ce document (même compte sur un
    // autre PC, ou collègue du cabinet), on bloque l'ouverture et on affiche
    // qui le détient.
    try {
      const lockResult = await tryAcquireDocLock(doc._id);
      if (!lockResult.granted) {
        const owner = lockResult.lockedBy?.displayName || 'un autre utilisateur';
        const since = lockResult.lockedBy?.lockedAt
          ? formatLockedSince(lockResult.lockedBy.lockedAt)
          : '';
        toast.warning(
          `Document ouvert par ${owner}${since ? ` depuis ${since}` : ''}. Réessayez plus tard ou demandez-lui de le fermer.`,
          { title: 'Document verrouillé' }
        );
        return null;
      }
    } catch (lockErr) {
      // Erreur réseau lors de l'acquisition : on log et on continue (mieux
      // vaut laisser ouvrir que bloquer en cas de panne du service de verrou)
      console.warn('[DocumentLock] Acquisition impossible, ouverture sans verrou:', lockErr.message);
    }

    // ── Étape 2 : ouverture effective du document ───────────────────────
    // IMPORTANT : si l'ouverture n'aboutit PAS à une session Word suivie
    // (échec compagnon, simple téléchargement, fichier non-Word...), on
    // LIBÈRE le verrou acquis à l'étape 1. Sinon le document restait marqué
    // « verrouillé » ~90s (TTL serveur) après chaque tentative échouée, et
    // l'utilisateur se voyait lui-même comme « un autre utilisateur ».
    // Mode Electron : utiliser IPC direct
    if (window.electron?.openDocument) {
      try {
        // On passe le JWT pour que le main process puisse, après ouverture,
        // surveiller la fermeture du fichier (Office ~$ ou fallback file-lock)
        // et libérer automatiquement le verrou serveur dès que l'utilisateur
        // ferme le document — sans qu'il ait besoin de cliquer quoi que ce soit.
        const result = await window.electron.openDocument(doc, { jwtToken: token });
        if (!result.success) {
          console.error('[Electron] Erreur ouverture document:', result.error);
          toast.error("Erreur lors de l'ouverture du document : " + result.error);
          releaseDocLock(doc._id);
          return null;
        }
        return { mode: 'word_desktop', documentId: doc._id };
      } catch (error) {
        console.error('[Electron] Erreur IPC:', error);
        toast.error("Erreur lors de l'ouverture du document.");
        releaseDocLock(doc._id);
        return null;
      }
    }
    // ── Mode WEB (navigateur) : ouverture dans Microsoft Word via le
    //    COMPAGNON Electron mince (agent local sur 127.0.0.1). Remplace
    //    l'ancien fallback Socket.IO vers l'app desktop complete. ──────────
    const ext = (doc?.nomDocument || '').split('.').pop()?.toLowerCase();
    const isWord = ext === 'doc' || ext === 'docx';
    if (!isWord) {
      // Fichier déposé (PDF, image, etc.) : on le télécharge pour que
      // l'utilisateur l'ouvre avec l'application associée. Pas de session Word
      // suivie -> le verrou n'a pas lieu d'être conservé.
      if (doc.categorie === 'dropped') {
        try {
          await downloadDroppedDocument(doc);
          toast.success("Document téléchargé — ouvrez-le avec l'application associée.", { title: 'Téléchargement' });
        } catch (error) {
          console.error('[Open web dropped] Erreur:', error);
          toast.error('Le téléchargement a échoué. Réessayez dans un instant.');
        } finally {
          releaseDocLock(doc._id);
        }
        return null;
      }
      toast.info("L'ouverture locale via le compagnon Kheops concerne les documents Word (.docx).");
      releaseDocLock(doc._id);
      return null;
    }
    try {
      await openDocumentInWord(doc._id, { fileName: doc.nomDocument });
      toast.info('Ouverture dans Microsoft Word…', { title: 'Compagnon Kheops' });
      return { mode: 'word_desktop', documentId: doc._id };
    } catch (error) {
      console.error("[Companion] Ouverture impossible:", error);
      // Aucune session Word ne suivra : libérer le verrou avant les replis.
      releaseDocLock(doc._id);
      // NE PAS presumer « compagnon absent » sur toute erreur : s'il repond au
      // ping /health, il TOURNE — l'echec vient d'autre chose (jeton, doc, reseau).
      // Afficher « pas installe » serait trompeur (bug rapporte : la modale
      // reapparaissait alors que le compagnon tournait). On distingue les 2 cas.
      let present = false;
      try { present = await detectCompanion(); } catch (_) { present = false; }
      if (present) {
        toast.error(
          "Le compagnon est bien lancé, mais l'ouverture a échoué. Le document va être téléchargé — ouvrez-le avec Word.",
          { title: 'Compagnon Kheops' }
        );
        try {
          await downloadWordDocument(doc._id, doc.nomDocument);
        } catch (dlErr) {
          console.error('[Download repli] Erreur:', dlErr);
          toast.error(classifyWordDownloadError(dlErr).message);
        }
        return null;
      }
      // Compagnon reellement absent : proposer l'installeur, et sinon offrir un
      // REPLI 100 % navigateur — télécharger le .docx pour l'ouvrir soi-même.
      const installer = getCompanionInstallerInfo();
      if (!installer.available) {
        toast.info(
          `${installer.unavailableReason} Le document va être téléchargé pour que vous puissiez l'ouvrir vous-même.`,
          { title: `Compagnon Kheops — ${installer.platformLabel}` },
        );
        try {
          await downloadWordDocument(doc._id, doc.nomDocument);
          toast.success('Document téléchargé — ouvrez-le avec Word.', { title: 'Téléchargement' });
        } catch (dlErr) {
          console.error('[Download repli] Erreur:', dlErr);
          toast.error(classifyWordDownloadError(dlErr).message);
        }
        return null;
      }
      const wantInstall = window.confirm(
        "Le compagnon Kheops n'est pas installé sur cet ordinateur.\n\n"
        + "Il permet d'ouvrir les documents directement dans Microsoft Word.\n\n"
        + `OK : télécharger l'installateur pour ${installer.platformLabel}.\n`
        + "Annuler : télécharger simplement le document pour l'ouvrir vous-même."
      );
      if (wantInstall) {
        const started = triggerCompanionInstall();
        if (started) {
          toast.info(
            `Téléchargement en cours. ${installer.installHint} Puis réessayez d'ouvrir le document.`,
            { title: `Installation du compagnon — ${installer.platformLabel}` }
          );
        } else {
          toast.error("Le téléchargement de l'installateur n'a pas pu démarrer.");
        }
      } else {
        try {
          await downloadWordDocument(doc._id, doc.nomDocument);
          toast.success('Document téléchargé — ouvrez-le avec Word.', { title: 'Téléchargement' });
        } catch (dlErr) {
          console.error('[Download repli] Erreur:', dlErr);
          toast.error(classifyWordDownloadError(dlErr).message);
        }
      }
      return null;
    }
  };

  // ======= Télécharger un document =======
  const handleDownloadDocument = useCallback(async (e, doc) => {
    e?.stopPropagation?.();
    stopSpeaking();
    if (window.electron?.downloadDocument) {
      try {
        const result = await window.electron.downloadDocument(doc);
        if (!result.success && result.error !== 'cancelled') {
          console.error('[Download] Erreur:', result.error);
          toast.error("Erreur lors du téléchargement : " + result.error);
        }
      } catch (error) {
        console.error('[Download] Erreur IPC:', error);
        toast.error("Erreur lors du téléchargement.");
      }
    } else if (doc.categorie === 'dropped') {
      // Mode WEB, fichier DÉPOSÉ (drag & drop) : ses octets vivent dans le
      // stockage du cabinet (StoredDocument), pas sous documents/<docId>.docx.
      try {
        await downloadDroppedDocument(doc);
      } catch (error) {
        console.error('[Download web dropped] Erreur:', error);
        const status = error?.response?.status;
        toast.error(status === 404
          ? "Ce fichier n'a pas d'exemplaire sur le serveur (probablement déposé avec l'ancienne application de bureau)."
          : 'Le téléchargement a échoué. Réessayez dans un instant.');
      }
    } else {
      // Mode WEB : téléchargement direct depuis le serveur (documents/<docId>.docx).
      // Plus besoin de l'application de bureau.
      try {
        await downloadWordDocument(doc._id, doc.nomDocument);
      } catch (error) {
        console.error('[Download web] Erreur:', error);
        toast.error(classifyWordDownloadError(error).message);
      }
    }
  }, [toast]);

  const handleBrowserDocumentPreview = useCallback(async (doc, previewKind) => {
    let previewWindow;
    try {
      // Reserve avant toute attente reseau afin que le navigateur reconnaisse
      // bien le geste utilisateur et ne bloque pas le nouvel onglet.
      previewWindow = reserveDocumentPreviewWindow(doc?.nomDocument || 'Document');
    } catch (error) {
      toast.warning(
        `${error?.message || "Le navigateur a bloqué l'ouverture du document."} Le fichier va être téléchargé.`,
        { title: 'Ouverture dans le navigateur indisponible' },
      );
      await handleDownloadDocument(null, doc);
      return { mode: 'download', documentId: doc?._id, fallbackFrom: 'browser_preview' };
    }

    try {
      await loadDocumentPreviewInWindow(doc?._id, previewKind, previewWindow);
      return {
        mode: 'browser_preview',
        documentId: doc?._id,
        previewKind,
        readOnly: true,
      };
    } catch (error) {
      const message = error?.response?.data?.message
        || error?.response?.data?.error
        || error?.message
        || "Le document n'a pas pu être ouvert dans le navigateur.";
      toast.warning(`${message} Le fichier va être téléchargé.`, {
        title: 'Ouverture dans le navigateur indisponible',
      });
      await handleDownloadDocument(null, doc);
      return { mode: 'download', documentId: doc?._id, fallbackFrom: 'browser_preview' };
    }
  }, [handleDownloadDocument, toast]);

  const handlePreviewPdf = async (doc) => {
    if (!doc?._id) return;
    try {
      await previewDocumentAsPdf(doc._id);
      toast.info("L'aperçu est prêt. Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF ».");
    } catch (previewError) {
      const message = previewError?.response?.data?.message
        || previewError.message
        || "Impossible de préparer l'aperçu PDF.";
      if (previewError.code === 'PDF_PREVIEW_POPUP_BLOCKED') toast.warning(message);
      else toast.error(message);
    }
  };

  const acquireAlternativeLock = async (doc) => {
    try {
      const lockResult = await tryAcquireDocLock(doc._id);
      if (!lockResult.granted) {
        const owner = lockResult.lockedBy?.displayName || 'un autre utilisateur';
        toast.warning(`Document ouvert par ${owner}. Réessayez plus tard.`, { title: 'Document verrouillé' });
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[DocumentOpening] Verrou indisponible, protection par versions activée:', err.message);
      return true;
    }
  };

  const handleOpenUsingMode = async (mode, doc) => {
    if (mode === DOCUMENT_OPENING_MODES.BROWSER_PREVIEW) {
      setTextPreviewDocument(doc);
      return { mode, documentId: doc._id, readOnly: true };
    }
    if (mode === 'word_desktop') return handleOpenDocument(doc);

    if (mode === 'kheops') {
      if (!(await acquireAlternativeLock(doc))) return null;
      setEditorDocument(doc);
      return { mode, documentId: doc._id };
    }

    if (mode === 'word_web' || mode === 'google_docs') {
      const providerLabel = mode === 'word_web' ? 'votre OneDrive' : 'votre Google Drive';
      const consentKey = mode === 'word_web' ? 'oneDrive' : 'googleDrive';
      const consents = openingController.availability?.preference?.externalTransferConsents || {};
      let consent = consents[consentKey] === true;
      if (!consent) {
        consent = window.confirm(
          `Une copie de travail de ce document va être placée dans ${providerLabel}.\n\n`
          + 'Kheops 2 conservera le document original et son historique. Continuer ?',
        );
        if (consent) {
          updateDocumentOpeningPreferences({
            externalTransferConsents: { [consentKey]: true },
          }).catch(() => {});
        }
      }
      if (!consent) {
        return null;
      }
      let convertToGoogle = false;
      if (mode === 'google_docs'
        && openingController.availability?.policy?.allowGoogleConversion === true) {
        if (getDocumentFileExtension(doc) === 'txt') {
          const confirmedTextImport = window.confirm(
            'Google Docs va importer une copie de ce fichier texte. Le fichier .txt original restera inchangé dans Kheops 2. Continuer ?',
          );
          if (!confirmedTextImport) return null;
          convertToGoogle = true;
        } else {
          convertToGoogle = window.confirm(
            'Voulez-vous convertir cette copie en document Google natif ?\n\n'
            + 'OK : convertir (la mise en page peut légèrement changer).\n'
            + 'Annuler : conserver le format Word .docx — recommandé.',
          );
        }
      }

      // Cet appel est volontairement placé AVANT le premier await : après un
      // clic dans la modale, Chrome autorise encore l'onglet. En mode
      // automatique (après la vérification réseau), il peut rester bloqué ; le
      // lien explicite de la modale de session prend alors le relais.
      const externalTab = window.open('about:blank', '_blank');
      if (!(await acquireAlternativeLock(doc))) {
        try { externalTab?.close(); } catch (_) {}
        return null;
      }
      try {
        const compatibility = await getDocumentCompatibility(doc._id).catch(() => null);
        if (mode === 'google_docs' && compatibility?.level === 'complex') {
          const continueInGoogle = window.confirm(
            'Ce document contient des éléments Word complexes. Microsoft Word est recommandé pour mieux préserver sa mise en page.\n\n'
            + `${(compatibility.warnings || []).slice(0, 3).join('\n')}\n\n`
            + 'Continuer quand même dans Google Docs ?',
          );
          if (!continueInGoogle) {
            try { externalTab?.close(); } catch (_) {}
            return null;
          }
        }
        const result = await openExternalDocument(doc._id, mode, {
          consentExternalTransfer: true,
          keepRemoteCopy: true,
          convertToGoogle,
        });
        if (externalTab && !externalTab.closed) {
          try { externalTab.opener = null; } catch (_) {}
          externalTab.location.replace(result.openUrl);
        }
        setExternalSession(result.session);
        try {
          localStorage.setItem('kheopsExternalEditingSession', JSON.stringify({
            documentId: result.session.documentId,
            sessionId: result.session.id,
          }));
        } catch (_) {}
        toast.success(
          externalTab
            ? `Document ouvert dans ${mode === 'word_web' ? 'Word pour le web' : 'Google Docs'}. Revenez ensuite synchroniser vos modifications.`
            : `La copie est prête. Cliquez sur « Rouvrir » dans la fenêtre pour lancer ${mode === 'word_web' ? 'Word pour le web' : 'Google Docs'}.`,
          { title: 'Copie de travail créée' },
        );
        return result;
      } catch (err) {
        try { externalTab?.close(); } catch (_) {}
        throw err;
      } finally {
        // La copie distante est protégée par baseVersionId + historique. On ne
        // garde pas un verrou local pendant tout le temps passé dans un onglet externe.
        releaseDocLock(doc._id);
      }
    }

    throw new Error("Méthode d'ouverture inconnue.");
  };

  const openingController = useDocumentOpening({
    document: activeOpeningDocument,
    onOpen: handleOpenUsingMode,
    onDownload: () => {
      if (activeOpeningDocument) handleDownloadDocument({ stopPropagation: () => {} }, activeOpeningDocument);
    },
    onPreviewPdf: activeOpeningDocument && getDocumentFileExtension(activeOpeningDocument) === 'docx'
      ? () => handlePreviewPdf(activeOpeningDocument)
      : undefined,
    onManagePreferences: () => navigate('/dashboard/parametres', { state: { activeTab: 'documentOpening' } }),
  });

  const requestDocumentOpening = useCallback((doc, forceChooser = false, purpose = 'open') => {
    if (openingRequestInFlightRef.current) return;
    openingRequestInFlightRef.current = true;
    const routing = classifyDocumentFileOpening(doc);
    setMiniModalItemId(null);

    if (routing.action === DOCUMENT_FILE_OPENING_ACTIONS.BROWSER_PREVIEW) {
      const opening = handleBrowserDocumentPreview(doc, routing.previewKind);
      Promise.resolve(opening).finally(() => { openingRequestInFlightRef.current = false; });
      return opening;
    }

    if (routing.action === DOCUMENT_FILE_OPENING_ACTIONS.DOWNLOAD) {
      const download = handleDownloadDocument(null, doc);
      Promise.resolve(download).finally(() => { openingRequestInFlightRef.current = false; });
      return download;
    }

    setActiveOpeningDocument(doc);
    setOpeningPurpose(purpose);
    setPendingOpeningAction({ docId: String(doc._id), forceChooser, nonce: Date.now() });
    return undefined;
  }, [handleBrowserDocumentPreview, handleDownloadDocument, setMiniModalItemId]);

  const rememberExternalSession = useCallback((session) => {
    setExternalSession(session);
    try {
      localStorage.setItem('kheopsExternalEditingSession', JSON.stringify({
        documentId: session.documentId,
        sessionId: session.id,
      }));
    } catch (_) {}
  }, []);

  const resumeExternalSession = useCallback(async (doc) => {
    setMiniModalItemId(null);
    try {
      const sessions = await listExternalSessions(doc._id);
      const active = sessions.find((session) => ['open', 'synced', 'conflict'].includes(session.state));
      if (!active) {
        toast.info('Aucune session Word pour le web ou Google Docs à reprendre pour ce document.');
        return null;
      }
      rememberExternalSession(active);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Impossible de récupérer la session externe.');
    }
  }, [rememberExternalSession, setMiniModalItemId, toast]);

  React.useEffect(() => {
    let marker = null;
    try { marker = JSON.parse(localStorage.getItem('kheopsExternalEditingSession') || 'null'); } catch (_) {}
    if (!marker?.documentId || externalSession) return;
    if (!documents.some((doc) => String(doc._id) === String(marker.documentId))) return;
    let active = true;
    listExternalSessions(marker.documentId)
      .then((sessions) => {
        if (!active) return;
        const session = sessions.find((item) => String(item.id) === String(marker.sessionId))
          || sessions.find((item) => ['open', 'synced', 'conflict'].includes(item.state));
        if (session) setExternalSession(session);
        else {
          try { localStorage.removeItem('kheopsExternalEditingSession'); } catch (_) {}
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, [documents, externalSession]);

  React.useEffect(() => {
    if (!pendingOpeningAction || !activeOpeningDocument) return;
    if (String(activeOpeningDocument._id) !== pendingOpeningAction.docId) return;
    setPendingOpeningAction(null);
    const run = pendingOpeningAction.forceChooser
      ? openingController.showChooser()
      : openingController.openDocument();
    Promise.resolve(run).finally(() => { openingRequestInFlightRef.current = false; });
  }, [activeOpeningDocument, openingController, pendingOpeningAction]);

  React.useEffect(() => {
    const openAISource = (event) => {
      const documentId = event?.detail?.documentId;
      if (!documentId) return;
      const source = (allDocuments || []).find((document) => String(document._id) === String(documentId));
      if (source) requestDocumentOpening(source, false);
      else toast.info('La version source n’est plus visible dans ce dossier.');
    };
    window.addEventListener('kheops:open-ai-source', openAISource);
    return () => window.removeEventListener('kheops:open-ai-source', openAISource);
  }, [allDocuments, requestDocumentOpening, toast]);

  // Après création, le thunk conserve la demande pendant la navigation vers le dossier.
  React.useEffect(() => {
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('kheopsPendingDocumentOpen') || 'null'); } catch (_) {}
    if (!pending?.doc?._id || String(pending.dossierId) !== String(currentDossier?._id)) return;
    try { sessionStorage.removeItem('kheopsPendingDocumentOpen'); } catch (_) {}
    requestDocumentOpening(pending.doc, false, pending.reason === 'created' ? 'create' : 'open');
  }, [currentDossier?._id, requestDocumentOpening]);

  React.useEffect(() => {
    const onCreated = (event) => {
      const pending = event.detail;
      if (!pending?.doc?._id || String(pending.dossierId) !== String(currentDossier?._id)) return;
      try { sessionStorage.removeItem('kheopsPendingDocumentOpen'); } catch (_) {}
      requestDocumentOpening(pending.doc, false, pending.reason === 'created' ? 'create' : 'open');
    };
    window.addEventListener('kheops:document-created', onCreated);
    return () => window.removeEventListener('kheops:document-created', onCreated);
  }, [currentDossier?._id, requestDocumentOpening]);

  const itemForPicker = miniModalItemType === 'subfolder'
    ? subfolders.find(i => i._id === colorPickerItemId)
    : documents.find(i => i._id === colorPickerItemId);

  const renderMiniModal = (item, type) => {
    const modalStyle = {
      position: 'fixed',
      top: `${miniModalPosition.top}px`,
      left: `${miniModalPosition.left}px`,
      maxHeight: `${miniModalPosition.maxHeight}px`,
      visibility: miniModalPosition.ready ? 'visible' : 'hidden',
    };
    return ReactDOM.createPortal(
      <div
        id={DOCUMENT_ACTION_MENU_ID}
        ref={miniModalRef}
        className="miniModal miniModal-portal"
        style={modalStyle}
        role="menu"
        aria-orientation="vertical"
        aria-labelledby={`document-actions-trigger-${item._id}`}
        aria-label={type === 'document' ? 'Actions du document' : 'Actions du sous-dossier'}
        data-placement={miniModalPosition.placement}
        onKeyDown={handleMiniModalKeyDown}
      >
        {type === 'document' && (
          <>
            <HoverToSpeak textToSpeak="Ouvrir le document">
              <div role="menuitem" tabIndex={-1} className="actionBtn openBtn" onClick={(e) => { e.stopPropagation(); requestDocumentOpening(item, false); }}>
                <span className="actionIcon actionIcon--text" aria-hidden="true">↗</span> Ouvrir le document
              </div>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak="Ouvrir avec une autre méthode">
              <div role="menuitem" tabIndex={-1} className="actionBtn openWithBtn" onClick={(e) => { e.stopPropagation(); requestDocumentOpening(item, true); }}>
                <span className="actionIcon actionIcon--text" aria-hidden="true">⌄</span> Ouvrir avec…
              </div>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak="Consulter l'historique des versions">
              <div role="menuitem" tabIndex={-1} className="actionBtn historyBtn" onClick={(e) => { e.stopPropagation(); setHistoryDocument(item); setMiniModalItemId(null); }}>
                <span className="actionIcon actionIcon--text" aria-hidden="true">↶</span> Historique des versions
              </div>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak="Reprendre une édition dans Word pour le web ou Google Docs">
              <div role="menuitem" tabIndex={-1} className="actionBtn externalSessionBtn" onClick={(e) => { e.stopPropagation(); resumeExternalSession(item); }}>
                <span className="actionIcon actionIcon--text" aria-hidden="true">☁</span> Reprendre une édition externe
              </div>
            </HoverToSpeak>
            {isFeatureEnabled('documentSyncV2') && (
              <HoverToSpeak textToSpeak="Voir les copies, versions et conflits de synchronisation">
                <div role="menuitem" tabIndex={-1} className="actionBtn syncDetailsBtn" onClick={(e) => { e.stopPropagation(); setSyncDocument(item); setMiniModalItemId(null); }}>
                  <span className="actionIcon actionIcon--text" aria-hidden="true">⇄</span> État de synchronisation
                </div>
              </HoverToSpeak>
            )}
            <HoverToSpeak textToSpeak="Dupliquer le document">
              <div role="menuitem" tabIndex={-1} className="actionBtn duplicateBtn" onClick={(e) => { e.stopPropagation(); handleDuplicateDocument(item); }}>
                <img src={Dupliquer} alt="Dupliquer" className="actionIcon" /> Dupliquer
              </div>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak="Renommer le document">
              <div role="menuitem" tabIndex={-1} className="actionBtn renameBtn" onClick={(e) => { e.stopPropagation(); handleRenameDocument(item); }}>
                <img src={Renommer} alt="Renommer" className="actionIcon" /> Renommer
              </div>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak="Envoyer le document par mail">
              <div role="menuitem" tabIndex={-1} className="actionBtn sendBtn" onClick={(e) => handleSendClick(e, item)}>
                <img src={Envoyer} alt="Envoyer" className="actionIcon sendIcon"/> Envoyer
              </div>
            </HoverToSpeak>
            <div className="colorOptionContainer">
              <HoverToSpeak textToSpeak="Colorer le document, ouvrir la palette de couleurs">
                <div role="menuitem" tabIndex={-1} className="colorOptionHeader" onClick={(e) => { e.stopPropagation(); setColorPickerItemId(item._id); setLiveColor(item.color || '#ffffff'); setMiniModalItemId(null); }}>
                  <span className="color-palette-label">
                    <img src={ColorIcon} alt="Colorer" className="actionIcon" /> Colorer
                  </span>
                </div>
              </HoverToSpeak>
            </div>
            <HoverToSpeak textToSpeak="Supprimer le document">
              <div role="menuitem" tabIndex={-1} className="actionBtn deleteBtn" onClick={(e) => { e.stopPropagation(); confirmDeleteItem(item, 'document'); }}>
                <img src={SupprDoc} alt="Supprimer" className="actionIcon deleteIcon" /> Supprimer
              </div>
            </HoverToSpeak>
          </>
        )}
        {type === 'subfolder' && (
          <>
            <HoverToSpeak textToSpeak="Renommer le dossier">
              <div role="menuitem" tabIndex={-1} className="actionBtn renameBtn" onClick={(e) => { e.stopPropagation(); handleRenameSubfolder(item); }}>
                <img src={Renommer} alt="Renommer" className="actionIcon" /> Renommer
              </div>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak="Envoyer le dossier par mail">
              <div role="menuitem" tabIndex={-1} className="actionBtn sendBtn" onClick={(e) => handleSendSubfolderClick(e, item)}>
                <img src={Envoyer} alt="Envoyer" className="actionIcon sendIcon"/> Envoyer
              </div>
            </HoverToSpeak>
            <div className="colorOptionContainer">
              <HoverToSpeak textToSpeak="Colorer le dossier, ouvrir la palette de couleurs">
                <div role="menuitem" tabIndex={-1} className="colorOptionHeader" onClick={(e) => { e.stopPropagation(); setColorPickerItemId(item._id); setLiveColor(item.color || '#ffffff'); setMiniModalItemId(null); }}>
                  <span className="color-palette-label">
                    <img src={ColorIcon} alt="Colorer" className="actionIcon" /> Colorer
                  </span>
                </div>
              </HoverToSpeak>
            </div>
            <HoverToSpeak textToSpeak="Supprimer le dossier">
              <div role="menuitem" tabIndex={-1} className="actionBtn deleteBtn" onClick={(e) => { e.stopPropagation(); confirmDeleteItem(item, 'subfolder'); }}>
                <img src={SupprDoc} alt="Supprimer" className="actionIcon deleteIcon" /> Supprimer
              </div>
            </HoverToSpeak>
          </>
        )}
      </div>,
      document.body
    );
  };

  return (
    <div
      className={`docList ${isDraggingOver ? 'draggingOver' : ''}`}
      data-kheops-current-subfolder-id={currentSubfolderId || ''}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <DocumentImportAffordance
        onImportFiles={handleImportFiles}
        disabled={isImportingFiles}
      />
      {uploadError && <p className="errorMessage">Erreur : {uploadError}</p>}
      {isUploading && <p className="uploadingMessage">Ajout du document en cours...</p>}
      {!isUploading && subfolders.length === 0 && documents.length === 0 && !isDraggingOver && (
        <p className="drop-instruction">Aucun document stocké. Vous pouvez aussi rechercher un modèle.</p>
      )}
      {!isUploading && isDraggingOver && (
        <div className="drop-overlay" role="status" aria-live="polite">
          <span className="drop-overlay__icon" aria-hidden="true">&#8595;</span>
          <span>Relâchez pour ajouter le document</span>
          <span className="drop-overlay__hint">Jusqu’à 100 Mo par fichier · exécutables et scripts refusés</span>
        </div>
      )}

      {sortedSubfolders.map(subfolder => (
        <DroppableSubfolder
          key={subfolder._id}
          subfolder={subfolder}
          onThreeDotsClick={onThreeDotsClick}
          onNavigate={onNavigateToSubfolder}
          isSelected={miniModalItemId === subfolder._id}
          documentCount={allDocuments.filter(d => d.subfolderId === subfolder._id).length}
          isRenaming={renamingItemId === subfolder._id}
          renameValue={renameValue}
          onTitleClick={handleRenameSubfolder}
          onRenameChange={handleRenameValueChange}
          onRenameKeyDown={handleRenameKeyDown}
          onRenameBlur={handleRenameBlur}
        />

      ))}

      {(() => {
        const renderRow = (doc) => (
          <DraggableDocumentWithLock
            key={doc._id}
            doc={doc}
            resolvedColor={resolveColorForDocument(doc)}
            onDoubleClick={(docToOpen) => requestDocumentOpening(docToOpen, false)}
            onOpen={(docToOpen) => requestDocumentOpening(docToOpen, false)}
            onOpenWith={(docToOpen) => requestDocumentOpening(docToOpen, true)}
            onThreeDotsClick={onThreeDotsClick}
            onDownload={handleDownloadDocument}
            isSelected={miniModalItemId === doc._id}
            newlyCreatedDocId={newlyCreatedDocId}
            newlyCreatedDocLabels={newlyCreatedDocLabels}
            onSourceMouseDown={handleSourceMouseDown}
            isRenaming={renamingItemId === doc._id}
            renameValue={renameValue}
            onTitleClick={handleRenameDocument}
            onRenameChange={handleRenameValueChange}
            onRenameKeyDown={handleRenameKeyDown}
            onRenameBlur={handleRenameBlur}
          />
        );

        const showSections = (recentDocs.length > 0 && olderDocs.length > 0);
        if (!showSections) {
          return sortedDocuments.map(renderRow);
        }
        return (
          <>
            <div className="docList-section-header">
              <span className="docList-section-title">
                <span className="docList-section-dot" aria-hidden="true">&#x25CB;</span>
                R&Eacute;CENTS {recentDateLabel ? `\u00B7 ${recentDateLabel}` : ''}
              </span>
              <span className="docList-section-count">
                {recentDocs.length} document{recentDocs.length > 1 ? 's' : ''}
              </span>
            </div>
            {recentDocs.map(renderRow)}
            <div className="docList-section-header docList-section-header--secondary">
              <span className="docList-section-title">
                <span className="docList-section-dot" aria-hidden="true">&#x25CB;</span>
                ANT&Eacute;RIEURS
              </span>
              <span className="docList-section-count">
                {olderDocs.length} document{olderDocs.length > 1 ? 's' : ''}
              </span>
            </div>
            {olderDocs.map(renderRow)}
          </>
        );
      })()}

      {showSendModal && (
        <SendEmailModal
          recipient={emailData.to}
          docs={emailData.docs}
          displayName={emailData.displayName}
          onClose={() => setShowSendModal(false)}
          isLocalAttachment={emailData.isLocalAttachment}
        />
      )}

      <DocumentOpeningModal {...openingController.modalProps} purpose={openingPurpose} />

      <TextDocumentPreviewModal
        isOpen={Boolean(textPreviewDocument)}
        document={textPreviewDocument}
        onClose={() => setTextPreviewDocument(null)}
        onDownload={() => {
          if (textPreviewDocument) {
            handleDownloadDocument({ stopPropagation: () => {} }, textPreviewDocument);
          }
        }}
      />

      {editorDocument && (
        <KheopsDocumentEditor
          open
          documentId={editorDocument._id}
          title={editorDocument.nomDocument}
          matterId={currentDossier?._id || ''}
          matterTitle={currentDossier?.dossier?.dossier?.nom || currentDossier?.reference || 'Dossier actif'}
          aiEnabled={isFeatureEnabled('aiAssistant')}
          aiSources={(allDocuments || []).map((document) => ({
            id: document._id,
            documentId: document._id,
            label: document.nomDocument || 'Document sans titre',
            version: document.currentVersionId || document.version || 'courante',
            pages: document.pages || null,
            categorie: document.categorie || '',
            confidential: document.confidential === true,
            kind: String(document._id) === String(editorDocument._id) ? 'current-document' : 'document',
            selectable: document.deletedAt == null,
          }))}
          onAICitationOpen={(citation) => {
            const sourceId = citation?.documentId || citation?.sourceId;
            const source = (allDocuments || []).find((document) => String(document._id) === String(sourceId));
            if (source) requestDocumentOpening(source, false);
            else toast.info('La version source n’est plus visible dans ce dossier.');
          }}
          onAIDocumentCreated={(result) => {
            if (currentDossier?._id) dispatch(fetchAllDocumentsInDossier(currentDossier._id, token));
            const created = result?.document || result;
            toast.success(
              created?.nomDocument || created?.title
                ? `Brouillon « ${created.nomDocument || created.title} » créé et à valider.`
                : 'Brouillon IA créé et à valider.',
              { title: 'Assistant IA' },
            );
          }}
          onOpenAISettings={() => navigate('/dashboard/parametres', { state: { activeTab: 'ai' } })}
          onClose={() => {
            releaseDocLock(editorDocument._id);
            setEditorDocument(null);
          }}
        />
      )}

      {externalSession && (
        <ExternalEditingSessionModal
          session={externalSession}
          onSynced={() => toast.success('Nouvelle version enregistrée.', { title: 'Synchronisation' })}
          onClose={(result) => {
            if (result?.closed) {
              try { localStorage.removeItem('kheopsExternalEditingSession'); } catch (_) {}
            }
            setExternalSession(null);
          }}
        />
      )}

      {historyDocument && (
        <DocumentHistoryModal document={historyDocument} onClose={() => setHistoryDocument(null)} />
      )}

      {syncDocument && (
        <DocumentSyncDetailsModal
          document={syncDocument}
          dossierId={currentDossier?._id}
          onClose={() => setSyncDocument(null)}
        />
      )}

      {/* === Modale intermédiaire de choix email pour PM privée === */}
      {emailChoiceData && ReactDOM.createPortal(
        <div className="email-choice-overlay" onClick={() => setEmailChoiceData(null)}>
          <div className="email-choice-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="email-choice-title">Envoyer à</h3>
            <p className="email-choice-subtitle">{emailChoiceData.entity.raisonSociale}</p>
            <div className="email-choice-options">
              {emailChoiceData.choices.map((choice) => (
                <div
                  key={choice.email}
                  className="email-choice-option"
                  onClick={() => handleEmailChoice(choice)}
                >
                  <div className="email-choice-option-label">{choice.label}</div>
                  <div className="email-choice-option-sublabel">{choice.sublabel}</div>
                  <div className="email-choice-option-email">{choice.email}</div>
                </div>
              ))}
            </div>
            <button
              className="email-choice-cancel"
              onClick={() => setEmailChoiceData(null)}
            >
              Annuler
            </button>
          </div>
        </div>,
        document.body
      )}

      {miniModalItemId && (() => {
        const item = documents.find(d => d._id === miniModalItemId)
          || subfolders.find(s => s._id === miniModalItemId);
        if (!item) return null;
        const type = documents.find(d => d._id === miniModalItemId) ? 'document' : 'subfolder';
        return renderMiniModal(item, type);
      })()}

      {colorPickerItemId && itemForPicker && ReactDOM.createPortal(
        <div className="color-picker-modal-overlay">
          <div ref={colorPickerModalRef} onClick={(e) => e.stopPropagation()}>
            <SketchPicker
              color={liveColor}
              onChange={(color) => setLiveColor(color.hex)}
              onChangeComplete={(color) => handleColorChange(itemForPicker._id, miniModalItemType, color.hex)}
              presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505', '#BD10E0', '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B', '#FFFFFF']}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default DocumentList;
