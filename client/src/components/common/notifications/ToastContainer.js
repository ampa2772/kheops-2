// Container global des toasts. Monté une seule fois à la racine de l'app.
// Affiche la queue Redux en bas à droite avec auto-dismiss après duration.
import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { dismissToast } from '../../../redux/slices/notificationsSlice';
import './ToastContainer.css';

const Icon = ({ type }) => {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (type) {
    case 'success':
      return (
        <svg {...common}>
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'error':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'warning':
      return (
        <svg {...common}>
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'info':
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
  }
};

const Toast = ({ toast }) => {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!toast.duration) return undefined;
    const t = setTimeout(() => dispatch(dismissToast(toast.id)), toast.duration);
    return () => clearTimeout(t);
  }, [toast.id, toast.duration, dispatch]);

  return (
    <div className={`k-toast k-toast--${toast.type}`} role="status" aria-live="polite">
      <span className="k-toast__icon"><Icon type={toast.type} /></span>
      <div className="k-toast__body">
        {toast.title && <div className="k-toast__title">{toast.title}</div>}
        <div className="k-toast__message">{toast.message}</div>
      </div>
      <button
        type="button"
        className="k-toast__close"
        onClick={() => dispatch(dismissToast(toast.id))}
        aria-label="Fermer la notification"
      >
        ×
      </button>
    </div>
  );
};

const ToastContainer = () => {
  const queue = useSelector((s) => s.notifications?.queue) || [];
  if (queue.length === 0) return null;
  return (
    <div className="k-toast-container" aria-live="polite" aria-atomic="false">
      {queue.map((t) => <Toast key={t.id} toast={t} />)}
    </div>
  );
};

export default ToastContainer;
