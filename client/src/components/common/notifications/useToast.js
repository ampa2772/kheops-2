// Hook helper pour exposer les toasts avec une API simple :
//   const toast = useToast();
//   toast.success('Document créé');
//   toast.error('Échec', { title: 'Erreur réseau' });
//
// L'API renvoie l'id du toast créé, ce qui permet de le dismisser
// manuellement avec toast.dismiss(id) si besoin.
import { useDispatch } from 'react-redux';
import { useCallback, useMemo } from 'react';
import { showToast, dismissToast, clearAllToasts } from '../../../redux/slices/notificationsSlice';

export const useToast = () => {
  const dispatch = useDispatch();

  const make = useCallback((type) => (message, opts = {}) => {
    const action = dispatch(showToast({ type, message, ...opts }));
    return action?.payload?.id;
  }, [dispatch]);

  return useMemo(() => ({
    success: make('success'),
    error:   make('error'),
    warning: make('warning'),
    info:    make('info'),
    dismiss: (id) => dispatch(dismissToast(id)),
    clear:   () => dispatch(clearAllToasts()),
  }), [make, dispatch]);
};
