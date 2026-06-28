// Modale d'aide listant les raccourcis clavier de l'app.
// S'ouvre via F1 ou Ctrl+? (cf useGlobalKeyboardShortcuts).
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { closeShortcutsHelpModal } from '../../redux/slices/layoutSlice';
import './ShortcutsHelpModal.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const SHORTCUTS = [
  {
    section: 'Navigation',
    items: [
      { keys: [MOD, 'K'], label: 'Ouvrir la recherche globale (dossiers, contacts)' },
      { keys: [MOD, 'N'], label: 'Nouveau dossier / contact / mail' },
      { keys: [MOD, 'Shift', 'N'], label: 'Nouveau divorce par consentement mutuel' },
      { keys: [MOD, 'H'], label: 'Retour à l\'accueil (Bureau)' },
      { keys: [MOD, ','], label: 'Aller dans Paramètres' },
    ],
  },
  {
    section: 'Aide',
    items: [
      { keys: ['F1'], label: 'Afficher / fermer cette aide' },
      { keys: ['Échap'], label: 'Fermer la modale ouverte' },
    ],
  },
];

const Key = ({ children }) => <kbd className="k-shortcut-key">{children}</kbd>;

const ShortcutsHelpModal = () => {
  const dispatch = useDispatch();
  const isOpen = useSelector((s) => s.layout?.isShortcutsHelpModalOpen);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onClick = (e) => {
      if (e.target.classList?.contains('k-shortcut-overlay')) {
        dispatch(closeShortcutsHelpModal());
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [isOpen, dispatch]);

  if (!isOpen) return null;

  return (
    <div className="k-shortcut-overlay" role="dialog" aria-modal="true" aria-labelledby="k-shortcut-title">
      <div className="k-shortcut-modal">
        <div className="k-shortcut-head">
          <h3 id="k-shortcut-title" className="k-shortcut-title">Raccourcis clavier</h3>
          <button
            type="button"
            className="k-shortcut-close"
            onClick={() => dispatch(closeShortcutsHelpModal())}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {SHORTCUTS.map((sec) => (
          <section key={sec.section} className="k-shortcut-section">
            <h4 className="k-shortcut-section-title">{sec.section}</h4>
            <ul className="k-shortcut-list">
              {sec.items.map((it, i) => (
                <li key={i} className="k-shortcut-row">
                  <span className="k-shortcut-keys">
                    {it.keys.map((key, idx) => (
                      <React.Fragment key={idx}>
                        {idx > 0 && <span className="k-shortcut-plus">+</span>}
                        <Key>{key}</Key>
                      </React.Fragment>
                    ))}
                  </span>
                  <span className="k-shortcut-label">{it.label}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <div className="k-shortcut-foot">
          <span>Astuce : <Key>F1</Key> rouvre cette aide à tout moment.</span>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsHelpModal;
