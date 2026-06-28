// client/src/components/divorceCM/EtapeNoteEditor.js
//
// Editeur de note d'etape, design inspire du ruban Word :
// - une seule barre horizontale en haut, organisee en groupes
//   (Police, Style, Couleur, Paragraphe, Outils)
// - boutons compacts en ligne, jamais empiles
// - zone d'ecriture centrale large (style "page A4")
// - sauvegarde HTML sanitisee a l'affichage avec DOMPurify
import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useConfirm } from '../common/notifications/ConfirmProvider';
import './EtapeNoteEditor.css';

const FONT_FAMILIES = [
  { value: '', label: '(par defaut)' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Calibri, sans-serif', label: 'Calibri' },
  { value: 'Cambria, serif', label: 'Cambria' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: '"Trebuchet MS", sans-serif', label: 'Trebuchet MS' },
];

const FONT_SIZES = [
  { value: '1', label: '8' },
  { value: '2', label: '10' },
  { value: '3', label: '12' },
  { value: '4', label: '14' },
  { value: '5', label: '18' },
  { value: '6', label: '24' },
  { value: '7', label: '32' },
];

const COLORS = [
  '#000000', '#1f2937', '#dc2626', '#ea580c',
  '#ca8a04', '#16a34a', '#2563eb', '#9333ea',
];

const HIGHLIGHTS = [
  '#fff59d', '#a7f3d0', '#bfdbfe', '#fbcfe8', '#fde68a',
];

const exec = (command, value = null) => {
  // styleWithCSS = true : execCommand genere des spans CSS modernes
  // (font-family, font-size, color...) plutot que les balises <font face="">
  // depreciees, plus stables sur Chrome/Electron recents pour fontName /
  // fontSize sur des selections complexes.
  try { document.execCommand('styleWithCSS', false, true); } catch (_e) { /* ignore */ }
  document.execCommand(command, false, value);
};

const EtapeNoteEditor = ({
  open, onClose,
  etape,                  // (optionnel) deduit title + subtitle a partir de l'etape
  title,                  // (optionnel) titre custom (sinon 'Note d\'etape')
  subtitle,               // (optionnel) sous-titre custom
  initialContent = '',
  onSave,
}) => {
  const computedTitle = title || "Note d'etape";
  const computedSubtitle = subtitle || (etape ? `— Etape ${etape.ordre}. ${etape.label}` : '');
  const editorRef = useRef(null);
  const [savedRange, setSavedRange] = useState(null);
  const confirm = useConfirm();

  useEffect(() => {
    if (!open) return;
    if (editorRef.current) {
      editorRef.current.innerHTML = initialContent || '';
      editorRef.current.focus();
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [open, initialContent]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const memorizeSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      setSavedRange(sel.getRangeAt(0).cloneRange());
    }
  };

  const restoreSelection = () => {
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  };

  const run = (cmd, value = null) => {
    // Important : focus() AVANT restoreSelection().
    // Si on restaure la selection avant le focus, le focus du contenteditable
    // peut reinitialiser le curseur et detruire la selection juste restauree.
    // Sans selection valide, fontName/fontSize/color s'appliquent dans le
    // vide. Avec preventScroll on evite de sauter dans la page.
    editorRef.current?.focus({ preventScroll: true });
    restoreSelection();
    exec(cmd, value);
  };

  const handleSave = () => {
    const html = editorRef.current?.innerHTML || '';
    onSave?.(html);
    onClose?.();
  };

  const handleClear = async () => {
    const ok = await confirm({
      title: 'Effacer la note ?',
      message: 'Effacer tout le contenu de la note ?',
      confirmLabel: 'Effacer',
      cancelLabel: 'Annuler',
      danger: true,
    });
    if (ok) {
      if (editorRef.current) editorRef.current.innerHTML = '';
    }
  };

  if (!open) return null;

  // Portail vers document.body : evite que l'editeur soit clippe par une
  // modale parente (overflow:hidden, transform, contain, etc.) lorsqu'il
  // est invoque depuis InfoDossierTextModal, DescriptionModal, etc.
  //
  // Important : on stoppe la propagation des evenements mousedown / mouseup /
  // click au niveau de l'overlay. Sans cela, les modales parentes qui
  // ecoutent ces evenements sur `document` pour detecter un clic exterieur
  // (DescriptionModal, modales `mousedown` outside-click) verraient un clic
  // dans le portail comme "exterieur" a leur propre conteneur DOM et se
  // fermeraient. Le portail vivant dans document.body n'est pas dans leur
  // ref, d'ou le besoin d'arreter ces evenements ici.
  const stopParentClose = (e) => e.stopPropagation();

  return ReactDOM.createPortal(
    <div
      className="k-dcm-note-overlay"
      onClick={onClose}
      onMouseDown={stopParentClose}
      onMouseUp={stopParentClose}
      role="dialog"
      aria-modal="true"
      aria-label="Editeur de note"
    >
      <div
        className="k-dcm-note-modal"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={stopParentClose}
        onMouseUp={stopParentClose}
      >

        {/* En-tete */}
        <div className="k-dcm-note-header">
          <h3 className="k-dcm-note-title">
            {computedTitle}
            {computedSubtitle && (
              <span className="k-dcm-note-subtitle">{computedSubtitle}</span>
            )}
          </h3>
          <button
            type="button"
            className="k-dcm-note-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {/* Ruban : tous les boutons en ligne, regroupes par categorie */}
        <div className="k-dcm-note-ribbon" onMouseDown={memorizeSelection}>

          {/* Groupe Police */}
          <div className="k-dcm-note-group">
            <div className="k-dcm-note-group-row">
              <select
                className="font-family"
                title="Famille de police"
                onChange={(e) => run('fontName', e.target.value)}
                defaultValue=""
              >
                {FONT_FAMILIES.map(f => (
                  <option key={f.label} value={f.value} style={{ fontFamily: f.value || 'inherit' }}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                className="font-size"
                title="Taille (pt)"
                onChange={(e) => run('fontSize', e.target.value)}
                defaultValue="3"
              >
                {FONT_SIZES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <span className="k-dcm-note-group-label">Police</span>
          </div>

          {/* Groupe Style */}
          <div className="k-dcm-note-group">
            <div className="k-dcm-note-group-row">
              <button type="button" title="Gras (Ctrl+B)" onClick={() => run('bold')}>
                <span className="ic-bold">B</span>
              </button>
              <button type="button" title="Italique (Ctrl+I)" onClick={() => run('italic')}>
                <span className="ic-italic">I</span>
              </button>
              <button type="button" title="Souligne (Ctrl+U)" onClick={() => run('underline')}>
                <span className="ic-underline">U</span>
              </button>
              <button type="button" title="Barre" onClick={() => run('strikeThrough')}>
                <span className="ic-strike">S</span>
              </button>
              <button type="button" title="Indice" onClick={() => run('subscript')}>
                X<sub style={{ fontSize: '0.65em' }}>2</sub>
              </button>
              <button type="button" title="Exposant" onClick={() => run('superscript')}>
                X<sup style={{ fontSize: '0.65em' }}>2</sup>
              </button>
            </div>
            <span className="k-dcm-note-group-label">Style</span>
          </div>

          {/* Groupe Couleur */}
          <div className="k-dcm-note-group">
            <div className="k-dcm-note-group-row k-dcm-note-color-row">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className="k-dcm-note-color-swatch"
                  style={{ background: c }}
                  onClick={() => run('foreColor', c)}
                  aria-label={`Couleur du texte ${c}`}
                  title={`Texte ${c}`}
                />
              ))}
            </div>
            <span className="k-dcm-note-group-label">Couleur du texte</span>
          </div>

          {/* Groupe Surlignage */}
          <div className="k-dcm-note-group">
            <div className="k-dcm-note-group-row k-dcm-note-color-row">
              {HIGHLIGHTS.map(c => (
                <button
                  key={c}
                  type="button"
                  className="k-dcm-note-color-swatch"
                  style={{ background: c }}
                  onClick={() => run('hiliteColor', c)}
                  aria-label={`Surlignage ${c}`}
                  title={`Surligner ${c}`}
                />
              ))}
              <button
                type="button"
                className="k-dcm-note-color-swatch"
                style={{ background: '#ffffff', borderColor: '#9ca3af' }}
                onClick={() => run('hiliteColor', 'transparent')}
                aria-label="Sans surlignage"
                title="Aucun"
              />
            </div>
            <span className="k-dcm-note-group-label">Surlignage</span>
          </div>

          {/* Groupe Paragraphe */}
          <div className="k-dcm-note-group">
            <div className="k-dcm-note-group-row">
              <button type="button" title="Liste a puces" onClick={() => run('insertUnorderedList')}>•≡</button>
              <button type="button" title="Liste numerotee" onClick={() => run('insertOrderedList')}>1≡</button>
              <button type="button" title="Diminuer le retrait" onClick={() => run('outdent')}>⇤≡</button>
              <button type="button" title="Augmenter le retrait" onClick={() => run('indent')}>≡⇥</button>
              <button type="button" title="Aligner a gauche" onClick={() => run('justifyLeft')}>≡⇤</button>
              <button type="button" title="Centrer" onClick={() => run('justifyCenter')}>≡↔</button>
              <button type="button" title="Aligner a droite" onClick={() => run('justifyRight')}>⇥≡</button>
              <button type="button" title="Justifier" onClick={() => run('justifyFull')}>≡≡</button>
            </div>
            <span className="k-dcm-note-group-label">Paragraphe</span>
          </div>

          {/* Groupe Outils */}
          <div className="k-dcm-note-group">
            <div className="k-dcm-note-group-row">
              <button type="button" title="Annuler (Ctrl+Z)" onClick={() => run('undo')}>↶</button>
              <button type="button" title="Retablir (Ctrl+Y)" onClick={() => run('redo')}>↷</button>
              <button type="button" title="Effacer le formatage de la selection" onClick={() => run('removeFormat')}>
                Aₓ
              </button>
              <button type="button" title="Tout effacer" onClick={handleClear} style={{ color: '#b91c1c' }}>
                🗑
              </button>
            </div>
            <span className="k-dcm-note-group-label">Outils</span>
          </div>
        </div>

        {/* Zone d'ecriture (page A4) */}
        <div className="k-dcm-note-canvas">
          <div
            ref={editorRef}
            className="k-dcm-note-editor"
            contentEditable
            suppressContentEditableWarning
            spellCheck
            aria-label="Zone de saisie de la note"
          />
        </div>

        {/* Pied : Annuler / Enregistrer */}
        <div className="k-dcm-note-footer">
          <span className="k-dcm-note-status">
            Astuce : Ctrl+B (gras), Ctrl+I (italique), Ctrl+U (souligne), Ctrl+Z (annuler).
          </span>
          <button type="button" className="k-dcm-btn k-dcm-btn-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="k-dcm-btn k-dcm-btn-primary" onClick={handleSave}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default EtapeNoteEditor;
