// Système de confirmation in-app, remplace `window.confirm()`.
// Usage :
//   const confirm = useConfirm();
//   if (await confirm({ title: 'Supprimer ?', message: '...', confirmLabel: 'Supprimer', danger: true })) {
//     ...
//   }
//
// La promesse renvoyée résout :
//   true  → l'utilisateur a cliqué le bouton de confirmation
//   false → l'utilisateur a cliqué Annuler / Échap / clic en dehors
import React, { createContext, useCallback, useContext, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import './ConfirmModal.css';

const ConfirmContext = createContext(null);

export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    // Fallback non-bloquant si le provider n'est pas monté (tests, etc.) :
    // on retombe sur window.confirm pour ne pas casser l'app.
    return async (opts) => window.confirm(opts?.message || 'Confirmer ?');
  }
  return ctx;
};

const defaultOpts = {
  title: 'Confirmer',
  message: '',
  confirmLabel: 'Confirmer',
  cancelLabel: 'Annuler',
  danger: false,
};

export const ConfirmProvider = ({ children }) => {
  const [opts, setOpts] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setOpts({ ...defaultOpts, ...options });
    });
  }, []);

  const finish = useCallback((value) => {
    if (resolverRef.current) {
      const r = resolverRef.current;
      resolverRef.current = null;
      r(value);
    }
    setOpts(null);
  }, []);

  // Escape cancels. Enter follows the focused button's native action so that
  // choosing Cancel with the keyboard cannot accidentally authorize a transfer.
  useEffect(() => {
    if (!opts) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [opts, finish]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && createPortal(
        <div
          className="k-confirm-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) finish(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="k-confirm-title"
        >
          <div className={`k-confirm-modal ${opts.danger ? 'k-confirm-modal--danger' : ''}`}>
            <h3 id="k-confirm-title" className="k-confirm-title">{opts.title}</h3>
            {opts.message && <p className="k-confirm-message">{opts.message}</p>}
            <div className="k-confirm-actions">
              <button
                type="button"
                className="k-confirm-btn k-confirm-btn--cancel"
                onClick={() => finish(false)}
                autoFocus
              >
                {opts.cancelLabel}
              </button>
              <button
                type="button"
                className={`k-confirm-btn ${opts.danger ? 'k-confirm-btn--danger' : 'k-confirm-btn--primary'}`}
                onClick={() => finish(true)}
              >
                {opts.confirmLabel}
              </button>
            </div>
          </div>
        </div>, document.body
      )}
    </ConfirmContext.Provider>
  );
};

export default ConfirmProvider;
