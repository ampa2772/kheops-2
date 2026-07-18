import React, { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';

const SANITIZE_OPTIONS = {
  ALLOWED_TAGS: ['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'span'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
};

export const sanitizeComposedHtml = (html) => DOMPurify.sanitize(String(html || ''), SANITIZE_OPTIONS);

export const composedHtmlToText = (html) => {
  if (typeof document === 'undefined') return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const container = document.createElement('div');
  container.innerHTML = sanitizeComposedHtml(html);
  return String(container.innerText || container.textContent || '').replace(/\u00a0/g, ' ').trim();
};

const SafeRichTextComposer = ({ value, onChange, label = 'Message', disabled = false, minHeight = 150 }) => {
  const editorRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current || document.activeElement === editorRef.current) return;
    const safe = sanitizeComposedHtml(value);
    if (editorRef.current.innerHTML !== safe) editorRef.current.innerHTML = safe;
  }, [value]);

  const emit = () => {
    if (!editorRef.current) return;
    const safe = sanitizeComposedHtml(editorRef.current.innerHTML);
    onChange?.(safe);
  };

  const format = (command, argument = null) => (event) => {
    event.preventDefault();
    if (disabled) return;
    editorRef.current?.focus();
    try { document.execCommand('styleWithCSS', false, false); } catch (_error) {}
    document.execCommand(command, false, argument);
    emit();
  };

  return (
    <div className="contact-rich-editor">
      <span className="contact-action-label">{label}</span>
      <div className="contact-rich-editor__toolbar" role="toolbar" aria-label="Mise en forme du message">
        <button type="button" onMouseDown={format('bold')} disabled={disabled} aria-label="Gras"><strong>G</strong></button>
        <button type="button" onMouseDown={format('italic')} disabled={disabled} aria-label="Italique"><em>I</em></button>
        <button type="button" onMouseDown={format('underline')} disabled={disabled} aria-label="Souligné"><u>S</u></button>
        <button type="button" onMouseDown={format('insertUnorderedList')} disabled={disabled} aria-label="Liste à puces">• Liste</button>
        <button type="button" onMouseDown={format('insertOrderedList')} disabled={disabled} aria-label="Liste numérotée">1. Liste</button>
        <button type="button" onMouseDown={format('removeFormat')} disabled={disabled} aria-label="Effacer la mise en forme">Effacer</button>
      </div>
      <div
        ref={editorRef}
        className="contact-rich-editor__surface"
        contentEditable={!disabled}
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        data-placeholder="Rédigez votre message…"
        style={{ minHeight }}
        onInput={emit}
        onBlur={() => {
          if (!editorRef.current) return;
          const safe = sanitizeComposedHtml(editorRef.current.innerHTML);
          editorRef.current.innerHTML = safe;
          onChange?.(safe);
        }}
        suppressContentEditableWarning
      />
    </div>
  );
};

export default SafeRichTextComposer;
