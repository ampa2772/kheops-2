// client/src/components/common/InlineRichEditor.js
//
// Éditeur de texte riche INLINE (ruban + zone de saisie), sans wrapper
// modal. Conçu pour être intégré directement dans une modale parente,
// par exemple InfoDossierTextModal, sans superposition de fenêtres.
//
// Différences vs EtapeNoteEditor (qui est modal, plein écran) :
//  - Pas de portail vers document.body
//  - Pas d'overlay, pas de wrapper modal
//  - Pas de footer Annuler/Enregistrer (auto-save attendu côté parent)
//  - Pas de title/subtitle (le parent affiche déjà son titre)
//  - onChange appelé à chaque saisie (au lieu de onSave à la fermeture)
//
// Réutilise les classes CSS k-dcm-note-ribbon / k-dcm-note-canvas /
// k-dcm-note-editor / k-dcm-note-group de EtapeNoteEditor.css pour la
// cohérence visuelle.

import React, { useEffect, useRef, useState } from 'react';
import './EtapeNoteEditorInline.css';
// On importe aussi le CSS de l'éditeur modal pour réutiliser les classes
// du ruban (k-dcm-note-ribbon, k-dcm-note-group, etc.).
// eslint-disable-next-line import/no-unresolved
import '../divorceCM/EtapeNoteEditor.css';

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
  try { document.execCommand('styleWithCSS', false, true); } catch (_e) { /* ignore */ }
  document.execCommand(command, false, value);
};

/**
 * Éditeur riche intégré (non-modal).
 *
 * Props :
 * - value (string, HTML) : contenu courant (HTML)
 * - onChange (fn(html)) : appelé à chaque saisie utilisateur, html courant
 * - minHeight (number, px) : hauteur minimale de la zone d'écriture
 * - placeholder (string) : texte affiché quand la zone est vide
 */
const InlineRichEditor = ({
  value,
  onChange,
  minHeight = 320,
  placeholder = 'Commencez à écrire…',
}) => {
  const editorRef = useRef(null);
  const [savedRange, setSavedRange] = useState(null);

  // Pour ne pas écraser ce que l'utilisateur tape, on ne réinjecte le HTML
  // venant de `value` que s'il diffère vraiment de la dernière valeur
  // « externe » connue. Les saisies utilisateur génèrent un onChange qui
  // remonte la valeur au parent, et le parent renvoie la même valeur via
  // `value` — on ne doit alors PAS réécrire innerHTML (sinon perte du
  // curseur à chaque touche).
  const lastExternalValueRef = useRef(null);
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    if (!editorRef.current) return;
    const incoming = value || '';
    if (isFirstRenderRef.current) {
      // Hydratation initiale
      editorRef.current.innerHTML = incoming;
      lastExternalValueRef.current = incoming;
      isFirstRenderRef.current = false;
      return;
    }
    // Si la valeur courante du DOM correspond déjà à ce qu'on aurait écrit,
    // on ne touche pas (sinon on casse le curseur de l'utilisateur).
    if (incoming !== lastExternalValueRef.current && incoming !== editorRef.current.innerHTML) {
      // Mise à jour venant de l'extérieur (ex: changement de dossier)
      editorRef.current.innerHTML = incoming;
      lastExternalValueRef.current = incoming;
    }
  }, [value]);

  const handleInput = () => {
    const html = editorRef.current?.innerHTML || '';
    lastExternalValueRef.current = html;
    onChange?.(html);
  };

  const memorizeSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      // Ne mémoriser que si la sélection est bien dans l'éditeur
      if (editorRef.current && editorRef.current.contains(range.commonAncestorContainer)) {
        setSavedRange(range.cloneRange());
      }
    }
  };

  const restoreSelection = () => {
    if (!savedRange) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  };

  const run = (cmd, value = null) => {
    editorRef.current?.focus({ preventScroll: true });
    restoreSelection();
    exec(cmd, value);
    // Notifier le parent du changement
    handleInput();
  };

  // Détection « éditeur vide » pour afficher le placeholder visuel.
  const isEmpty = (() => {
    if (!value) return true;
    const stripped = String(value).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').trim();
    return stripped.length === 0;
  })();

  return (
    <div className="k-inline-rich-editor">
      {/* Ruban (mêmes classes que EtapeNoteEditor pour cohérence visuelle) */}
      <div className="k-dcm-note-ribbon" onMouseDown={memorizeSelection}>

        {/* Police */}
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

        {/* Style */}
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

        {/* Couleur texte */}
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

        {/* Surlignage */}
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

        {/* Paragraphe */}
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

        {/* Outils */}
        <div className="k-dcm-note-group">
          <div className="k-dcm-note-group-row">
            <button type="button" title="Annuler (Ctrl+Z)" onClick={() => run('undo')}>↶</button>
            <button type="button" title="Retablir (Ctrl+Y)" onClick={() => run('redo')}>↷</button>
            <button type="button" title="Effacer le formatage de la selection" onClick={() => run('removeFormat')}>
              Aₓ
            </button>
          </div>
          <span className="k-dcm-note-group-label">Outils</span>
        </div>
      </div>

      {/* Zone d'écriture */}
      <div className="k-inline-rich-editor-canvas">
        <div
          ref={editorRef}
          className="k-dcm-note-editor"
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onInput={handleInput}
          onBlur={memorizeSelection}
          aria-label="Zone de saisie"
          style={{ minHeight }}
          data-placeholder={isEmpty ? placeholder : undefined}
        />
      </div>
    </div>
  );
};

export default InlineRichEditor;
