import React, { useRef, useState, useMemo, useLayoutEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { SketchPicker } from 'react-color';
import ReactDOM from 'react-dom';
import './styles.css';

import { updateDocumentColor, updateSubfolder } from '../../../../../redux/slices/currentDossierSlice';
import { initSocket } from '../../../../../services/socketService';

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

// --- Helpers pour le nouvel affichage des documents ---
const getDocExtension = (doc) => {
  const name = doc?.nomDocument || '';
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : '';
};

const getDocTypeBadge = (doc) => {
  const ext = getDocExtension(doc);
  if (ext === 'pdf') return { label: 'PDF', cls: 'doc-badge--pdf' };
  if (ext === 'doc' || ext === 'docx') return { label: 'DOC', cls: 'doc-badge--doc' };
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return { label: 'XLS', cls: 'doc-badge--xls' };
  if (ext === 'txt') return { label: 'TXT', cls: 'doc-badge--txt' };
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'zip' || ext === 'gif') {
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
    ghost.querySelectorAll('.threeDotsIcon, .download-doc-btn').forEach(el => el.remove());
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
  onDoubleClick,
  onThreeDotsClick,
  onDownload,
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
          backgroundColor: doc.color || undefined,
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

        {doc.nomDocument?.toLowerCase().endsWith('.txt') && onDownload && (
          <div
            className="download-doc-btn"
            onClick={(e) => onDownload(e, doc)}
            onMouseEnter={(e) => { e.stopPropagation(); stopSpeaking(); }}
            title="Telecharger"
          >
            <img src={TelechargerIcon} alt="Telecharger" className="download-doc-icon" />
          </div>
        )}
        <div
          className={`threeDotsIcon ${isSelected ? 'activeDot' : ''}`}
          onClick={(e) => onThreeDotsClick(e, doc._id, 'document')}
          onMouseEnter={(e) => { e.stopPropagation(); stopSpeaking(); }}
          title="Options"
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
          className={`threeDotsIcon ${isSelected ? 'activeDot' : ''}`}
          onClick={(e) => onThreeDotsClick(e, subfolder._id, 'subfolder')}
          onMouseEnter={(e) => { e.stopPropagation(); stopSpeaking(); }}
          title="Options"
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
  uploadError,
  isUploading,
  newlyCreatedDocId,
  newlyCreatedDocLabels,
  sortMode = 'date-desc',
  classifyDocument,
}) => {
  const dispatch = useDispatch();
  const toast = useToast();
  const [showSendModal, setShowSendModal] = useState(false);
  const [emailData, setEmailData] = useState({ to: '', docs: [], displayName: '', isLocalAttachment: false });
  const [emailChoiceData, setEmailChoiceData] = useState(null); // Modale intermédiaire PM privée
  const [colorPickerItemId, setColorPickerItemId] = useState(null);
  const [liveColor, setLiveColor] = useState(null);
  const [miniModalItemType, setMiniModalItemType] = useState(null);
  const [flipUp, setFlipUp] = useState(false);
  const [miniModalPosition, setMiniModalPosition] = useState({ top: 0, left: 0 });
  const colorPickerModalRef = useRef(null);
  const miniModalRef = useRef(null);
  const { dossier: currentDossier } = useSelector(state => state.currentDossier);
  const token = useSelector(state => state.login.token);

  // ── Verrouillage collaboratif ────────────────────────────────────────────
  // Démarre le polling sur les documents visibles et expose acquire/release.
  const visibleDocIds = useMemo(() => documents.map(d => d._id).filter(Boolean), [documents]);
  useDocumentLockPolling(visibleDocIds);
  const { tryOpen: tryAcquireDocLock } = useDocumentLock();

  // ── Drag custom mouse-based (indépendant de HTML5 drag / startDrag) ─────
  // Sur mousedown sur une ligne : enregistre la position. Au-delà de 5 px de
  // mouvement : crée un ghost qui suit la souris, et highlight les targets
  // (subfolder ou breadcrumb retour). Au mouseup : si on est sur un target,
  // déclenche le move ; sinon annule. Si pas de mouvement = simple click.
  const handleSourceMouseDown = useCallback((e, doc) => {
    if (e.button !== 0) return; // left click only
    // Ignore clicks sur les sous-éléments interactifs (menu ⋮, télécharger)
    if (e.target.closest('.threeDotsIcon, .download-doc-btn, .colorOptionContainer, .actionBtn, input, .doc-row__title--editing')) return;

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

  useLayoutEffect(() => {
    const handleClickOutside = (event) => {
      const isClickingInsideMiniModal = miniModalRef.current && miniModalRef.current.contains(event.target);
      const isClickingInsideColorPicker = colorPickerModalRef.current && colorPickerModalRef.current.contains(event.target);

      if (!isClickingInsideMiniModal && !isClickingInsideColorPicker) {
        setMiniModalItemId(null);
        setColorPickerItemId(null);
      }
    };

    if (miniModalItemId || colorPickerItemId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [miniModalItemId, colorPickerItemId, setMiniModalItemId, setColorPickerItemId]);

  const onThreeDotsClick = (e, itemId, itemType) => {
    e.stopPropagation();
    stopSpeaking();

    if (miniModalItemId === itemId) {
      setMiniModalItemId(null);
      return;
    }

    // Capturer la position du bouton ⋮ pour le portal
    const dotEl = e.currentTarget;
    const dotRect = dotEl.getBoundingClientRect();

    // Détection moitié basse → flipUp
    const docListEl = dotEl.closest('.docList');
    let shouldFlipUp = false;
    if (docListEl) {
      const listRect = docListEl.getBoundingClientRect();
      shouldFlipUp = dotRect.top > listRect.top + listRect.height / 2;
    }
    setFlipUp(shouldFlipUp);

    // Position pour le portal (fixed par rapport au viewport)
    setMiniModalPosition({
      top: shouldFlipUp ? dotRect.top - 4 : dotRect.bottom + 4,
      left: dotRect.right + 4,
    });

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
        return;
      }
    } catch (lockErr) {
      // Erreur réseau lors de l'acquisition : on log et on continue (mieux
      // vaut laisser ouvrir que bloquer en cas de panne du service de verrou)
      console.warn('[DocumentLock] Acquisition impossible, ouverture sans verrou:', lockErr.message);
    }

    // ── Étape 2 : ouverture effective du document ───────────────────────
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
        }
      } catch (error) {
        console.error('[Electron] Erreur IPC:', error);
        toast.error("Erreur lors de l'ouverture du document.");
      }
      return;
    }
    // Fallback WebSocket (mode navigateur)
    try {
      const socket = initSocket();
      if (socket && socket.connected) {
        socket.emit('message', JSON.stringify({ type: 'display-file', data: doc }));
      } else {
        toast.error("La connexion avec l'application de bureau Kheops n'est pas active.");
        console.error('[SocketService] Impossible d\'ouvrir le document car le WebSocket n\'est pas connecté.');
      }
    } catch (error) {
      console.error("Erreur lors de l'envoi de la commande d'ouverture:", error);
      toast.error("Une erreur est survenue lors de la communication avec l'application de bureau.");
    }
  };

  // ======= Télécharger un document (.txt) =======
  const handleDownloadDocument = async (e, doc) => {
    e.stopPropagation();
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
    } else {
      toast.warning("Le téléchargement nécessite l'application de bureau Kheops.");
    }
  };

  const itemForPicker = miniModalItemType === 'subfolder'
    ? subfolders.find(i => i._id === colorPickerItemId)
    : documents.find(i => i._id === colorPickerItemId);

  const renderMiniModal = (item, type) => {
    const modalStyle = {
      position: 'fixed',
      top: flipUp ? 'auto' : `${miniModalPosition.top}px`,
      bottom: flipUp ? `${window.innerHeight - miniModalPosition.top}px` : 'auto',
      left: `${miniModalPosition.left}px`,
      transform: 'translateX(-100%)',
    };
    return ReactDOM.createPortal(
      <div ref={miniModalRef} className="miniModal miniModal-portal" style={modalStyle}>
        {type === 'document' && (
          <>
            <HoverToSpeak textToSpeak="Dupliquer le document">
              <div className="actionBtn duplicateBtn" onClick={(e) => { e.stopPropagation(); handleDuplicateDocument(item); }}>
                <img src={Dupliquer} alt="Dupliquer" className="actionIcon" /> Dupliquer
              </div>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak="Renommer le document">
              <div className="actionBtn renameBtn" onClick={(e) => { e.stopPropagation(); handleRenameDocument(item); }}>
                <img src={Renommer} alt="Renommer" className="actionIcon" /> Renommer
              </div>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak="Envoyer le document par mail">
              <div className="actionBtn sendBtn" onClick={(e) => handleSendClick(e, item)}>
                <img src={Envoyer} alt="Envoyer" className="actionIcon sendIcon"/> Envoyer
              </div>
            </HoverToSpeak>
            <div className="colorOptionContainer">
              <HoverToSpeak textToSpeak="Colorer le document, ouvrir la palette de couleurs">
                <div className="colorOptionHeader" onClick={(e) => { e.stopPropagation(); setColorPickerItemId(item._id); setLiveColor(item.color || '#ffffff'); setMiniModalItemId(null); }}>
                  <span className="color-palette-label">
                    <img src={ColorIcon} alt="Colorer" className="actionIcon" /> Colorer
                  </span>
                </div>
              </HoverToSpeak>
            </div>
            <HoverToSpeak textToSpeak="Supprimer le document">
              <div className="actionBtn deleteBtn" onClick={(e) => { e.stopPropagation(); confirmDeleteItem(item, 'document'); }}>
                <img src={SupprDoc} alt="Supprimer" className="actionIcon deleteIcon" /> Supprimer
              </div>
            </HoverToSpeak>
          </>
        )}
        {type === 'subfolder' && (
          <>
            <HoverToSpeak textToSpeak="Renommer le dossier">
              <div className="actionBtn renameBtn" onClick={(e) => { e.stopPropagation(); handleRenameSubfolder(item); }}>
                <img src={Renommer} alt="Renommer" className="actionIcon" /> Renommer
              </div>
            </HoverToSpeak>
            <HoverToSpeak textToSpeak="Envoyer le dossier par mail">
              <div className="actionBtn sendBtn" onClick={(e) => handleSendSubfolderClick(e, item)}>
                <img src={Envoyer} alt="Envoyer" className="actionIcon sendIcon"/> Envoyer
              </div>
            </HoverToSpeak>
            <div className="colorOptionContainer">
              <HoverToSpeak textToSpeak="Colorer le dossier, ouvrir la palette de couleurs">
                <div className="colorOptionHeader" onClick={(e) => { e.stopPropagation(); setColorPickerItemId(item._id); setLiveColor(item.color || '#ffffff'); setMiniModalItemId(null); }}>
                  <span className="color-palette-label">
                    <img src={ColorIcon} alt="Colorer" className="actionIcon" /> Colorer
                  </span>
                </div>
              </HoverToSpeak>
            </div>
            <HoverToSpeak textToSpeak="Supprimer le dossier">
              <div className="actionBtn deleteBtn" onClick={(e) => { e.stopPropagation(); confirmDeleteItem(item, 'subfolder'); }}>
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
      {uploadError && <p className="errorMessage">Erreur : {uploadError}</p>}
      {isUploading && <p className="uploadingMessage">Ajout du document en cours...</p>}
      {!isUploading && subfolders.length === 0 && documents.length === 0 && !isDraggingOver && (
        <p className="drop-instruction">Glissez un fichier ici ou recherchez un modèle</p>
      )}
      {!isUploading && isDraggingOver && <p className="drop-instruction">Relâchez pour ajouter le fichier</p>}

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
            onDoubleClick={handleOpenDocument}
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

      {isDraggingOver && <div className="drop-overlay">Relâchez pour ajouter</div>}

      {showSendModal && (
        <SendEmailModal
          recipient={emailData.to}
          docs={emailData.docs}
          displayName={emailData.displayName}
          onClose={() => setShowSendModal(false)}
          isLocalAttachment={emailData.isLocalAttachment}
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