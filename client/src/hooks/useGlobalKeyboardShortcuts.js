// Hook qui installe un listener global keydown au niveau document.
// Mappe les combinaisons clavier sur des actions Redux (modales) ou des
// navigations React Router. Monté une seule fois dans App.js.
//
// Convention : on utilise Ctrl sur Windows/Linux et Cmd sur Mac via
// `event.metaKey || event.ctrlKey`.
//
// Raccourcis :
//   Ctrl+K        → ouvrir la recherche globale de dossier
//   Ctrl+N        → ouvrir la modale "+"  (créer dossier / contact / mail)
//   Ctrl+Shift+N  → nouveau divorce par consentement mutuel
//   Ctrl+,        → aller dans Paramètres
//   Ctrl+H        → revenir au Bureau (home)
//   F1 / Ctrl+/   → afficher la modale d'aide raccourcis
//   Esc           → fermer la modale d'aide raccourcis si ouverte
//
// Comportement défensif :
//   - Si l'utilisateur est en train de taper dans un input/textarea/select
//     ou un contenteditable, on n'intercepte PAS Ctrl+N (laisser le formulaire
//     respirer). On garde Ctrl+K et F1 actifs car ils ouvrent l'aide globale.
//   - On preventDefault() sur les combinaisons interceptées pour ne pas
//     déclencher le raccourci natif du navigateur.
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  openAllSearchModal,
  toggleCreateModal,
  openShortcutsHelpModal,
  closeShortcutsHelpModal,
} from '../redux/slices/layoutSlice';

const isTypingTarget = (target) => {
  if (!target) return false;
  const tag = (target.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
};

export const useGlobalKeyboardShortcuts = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isShortcutsHelpOpen = useSelector((s) => s.layout?.isShortcutsHelpModalOpen);
  const isAuthenticated = useSelector((s) => s.login?.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const k = (e.key || '').toLowerCase();
      const typing = isTypingTarget(e.target);

      // F1 ou Ctrl+/ → modale d'aide raccourcis
      if (k === 'f1' || (ctrl && (k === '/' || k === '?'))) {
        e.preventDefault();
        if (isShortcutsHelpOpen) dispatch(closeShortcutsHelpModal());
        else dispatch(openShortcutsHelpModal());
        return;
      }

      // Esc → si la modale d'aide est ouverte, on la ferme. Sinon,
      // on laisse passer (les modales internes ont leur propre Esc).
      if (k === 'escape' && isShortcutsHelpOpen) {
        dispatch(closeShortcutsHelpModal());
        return;
      }

      // Ctrl+K → recherche globale (toujours actif, même en train de saisir)
      if (ctrl && k === 'k' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        dispatch(openAllSearchModal());
        return;
      }

      // Ctrl+Shift+N → nouveau divorce CM (avant Ctrl+N car plus spécifique)
      if (ctrl && e.shiftKey && k === 'n') {
        e.preventDefault();
        navigate('/dashboard/createDivorceCM');
        return;
      }

      // Ctrl+N → modale "+"  (uniquement hors saisie, pour ne pas piéger
      //  l'utilisateur qui veut juste taper un caractère)
      if (ctrl && k === 'n' && !e.shiftKey && !e.altKey && !typing) {
        e.preventDefault();
        dispatch(toggleCreateModal());
        return;
      }

      // Ctrl+, → Paramètres (raccourci macOS standard pour les préférences)
      if (ctrl && k === ',') {
        e.preventDefault();
        navigate('/dashboard/parametres');
        return;
      }

      // Ctrl+H → retour Bureau (home). Désactivé pendant la saisie.
      if (ctrl && k === 'h' && !e.shiftKey && !e.altKey && !typing) {
        e.preventDefault();
        navigate('/dashboard');
        return;
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dispatch, navigate, isShortcutsHelpOpen, isAuthenticated]);
};

export default useGlobalKeyboardShortcuts;
