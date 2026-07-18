import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  DOCUMENT_EDITOR_MODES,
  DOCUMENT_OPENING_MODES,
  chooseRecommendedDocumentEditor,
  getOpeningModeMeta,
  isDocumentEditorMode,
  normalizeDocumentOpeningAvailability,
} from '../../constants/documentOpening';
import './openWithMenu.css';

const OpenWithMenu = ({
  availability,
  defaultMode = DOCUMENT_OPENING_MODES.ASK,
  label = 'Ouvrir le document',
  disabled = false,
  busy = false,
  onOpenDefault,
  onOpen,
  onChoose,
  onDownload,
  onPreviewPdf,
  onManagePreferences,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();
  const normalized = useMemo(
    () => normalizeDocumentOpeningAvailability(availability || {}),
    [availability]
  );
  const automaticMode = chooseRecommendedDocumentEditor(normalized, normalized.preference);
  const effectiveMode = isDocumentEditorMode(defaultMode)
    ? defaultMode
    : (defaultMode === DOCUMENT_OPENING_MODES.AUTOMATIC ? automaticMode : null);
  const effectiveMeta = effectiveMode ? getOpeningModeMeta(effectiveMode) : null;

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setIsOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        rootRef.current?.querySelector('.open-with-menu__toggle')?.focus();
      }
    };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [isOpen]);

  const toggle = () => {
    if (disabled || busy) return;
    setIsOpen((current) => {
      const next = !current;
      if (next) window.setTimeout(() => itemRefs.current.find(Boolean)?.focus(), 0);
      return next;
    });
  };

  const handleMain = () => {
    if (disabled || busy) return;
    if (onOpenDefault) {
      onOpenDefault();
    } else if (effectiveMode && normalized.methods[effectiveMode]?.available === true) {
      onOpen?.(effectiveMode);
    } else {
      onChoose?.();
    }
  };

  const selectMode = (mode) => {
    if (normalized.methods[mode]?.available !== true || busy) return;
    setIsOpen(false);
    onOpen?.(mode);
  };

  const moveFocus = (event, index) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const focusable = itemRefs.current.filter(Boolean);
    if (!focusable.length) return;
    const current = focusable.indexOf(itemRefs.current[index]);
    let next = current;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = focusable.length - 1;
    else next = (current + (event.key === 'ArrowDown' ? 1 : -1) + focusable.length) % focusable.length;
    focusable[next]?.focus();
  };

  return (
    <div ref={rootRef} className={`open-with-menu ${className}`.trim()}>
      <div className="open-with-menu__split">
        <button
          type="button"
          className="open-with-menu__main"
          onClick={handleMain}
          disabled={disabled || busy}
          title={effectiveMeta ? `${label} — ${effectiveMeta.shortLabel}` : label}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h11l5 5v13H4zM15 3v6h5M8 14h8M12 10v8" /></svg>
          <span>{busy ? 'Ouverture…' : label}</span>
          {effectiveMeta && <small>{effectiveMeta.shortLabel}</small>}
        </button>
        <button
          type="button"
          className="open-with-menu__toggle"
          aria-label="Ouvrir avec une autre méthode"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          aria-controls={menuId}
          onClick={toggle}
          disabled={disabled || busy}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" /></svg>
        </button>
      </div>

      {isOpen && (
        <div id={menuId} className="open-with-menu__popover" role="menu" aria-label="Ouvrir avec">
          <div className="open-with-menu__heading">OUVRIR AVEC…</div>
          {DOCUMENT_EDITOR_MODES.map((mode, index) => {
            const meta = getOpeningModeMeta(mode);
            const method = normalized.methods[mode];
            const available = method.available === true;
            return (
              <button
                key={mode}
                ref={(node) => { itemRefs.current[index] = node; }}
                type="button"
                role="menuitem"
                className={`open-with-menu__item ${!available ? 'is-unavailable' : ''}`}
                aria-disabled={!available}
                onClick={() => selectMode(mode)}
                onKeyDown={(event) => moveFocus(event, index)}
              >
                <span className="open-with-menu__item-icon" aria-hidden="true">
                  {mode === DOCUMENT_OPENING_MODES.KHEOPS ? 'K' : mode === DOCUMENT_OPENING_MODES.GOOGLE_DOCS ? 'G' : 'W'}
                </span>
                <span className="open-with-menu__item-text">
                  <strong>{meta.shortLabel}</strong>
                  <small>{available ? meta.badge : method.reason}</small>
                </span>
                {effectiveMode === mode && <span className="open-with-menu__current" title="Méthode par défaut">✓</span>}
              </button>
            );
          })}

          {(onDownload || onPreviewPdf || onManagePreferences) && <div className="open-with-menu__separator" />}
          {onDownload && (
            <button type="button" role="menuitem" className="open-with-menu__utility" onClick={() => { setIsOpen(false); onDownload(); }}>
              <span aria-hidden="true">↓</span> Télécharger le document
            </button>
          )}
          {onPreviewPdf && (
            <button type="button" role="menuitem" className="open-with-menu__utility" onClick={() => { setIsOpen(false); onPreviewPdf(); }}>
              <span aria-hidden="true">▤</span> Prévisualiser en PDF
            </button>
          )}
          {onManagePreferences && (
            <button type="button" role="menuitem" className="open-with-menu__utility" onClick={() => { setIsOpen(false); onManagePreferences(); }}>
              <span aria-hidden="true">⚙</span> Modifier la méthode par défaut
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default OpenWithMenu;
