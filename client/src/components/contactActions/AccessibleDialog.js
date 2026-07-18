import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const AccessibleDialog = ({
  open,
  onClose,
  titleId,
  descriptionId,
  className = '',
  children,
  busy = false,
}) => {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => {
      const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
      (focusable?.[0] || dialogRef.current)?.focus?.();
    });

    const onKeyDown = (event) => {
      if (!dialogRef.current) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!busyRef.current) onCloseRef.current?.();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && ['s', 'f', 'h'].includes(String(event.key || '').toLowerCase())) {
        // Une modale de courrier/e-mail ouverte au-dessus de l'éditeur doit
        // rester le seul contexte actif : on ne déclenche pas les raccourcis
        // Enregistrer/Rechercher de l'éditeur situé derrière.
        event.stopImmediatePropagation();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter((node) => !node.hasAttribute('disabled') && node.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => previousFocusRef.current?.focus?.());
    };
  }, [open]);

  if (!open) return null;
  return ReactDOM.createPortal(
    <div
      className="contact-action-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className={`contact-action-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId || undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
};

export default AccessibleDialog;
