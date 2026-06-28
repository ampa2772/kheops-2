import React, { useRef, useEffect } from 'react';
import './_modal-base.css';

/**
 * BaseModal — Composant réutilisable pour les modaux de Kheops 2.
 *
 * Fournit :
 *   - L'overlay (fond semi-transparent avec classe k-modal-overlay)
 *   - La fermeture au clic extérieur (mousedown hors du contenu)
 *   - La gestion de isOpen / return null
 *
 * Props :
 *   isOpen (bool, défaut: true)        — affiche ou masque la modale
 *   onClose (func)                     — callback appelée au clic hors du contenu
 *   overlayClassName (string)          — classe CSS additionnelle sur l'overlay
 *   contentClassName (string)          — classe CSS sur le div de contenu
 *   children (ReactNode)               — contenu de la modale
 */
const BaseModal = ({
  isOpen = true,
  onClose,
  children,
  overlayClassName = '',
  contentClassName = '',
}) => {
  const contentRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !onClose) return;

    const handleClickOutside = (e) => {
      if (contentRef.current && !contentRef.current.contains(e.target)) {
        onClose();
      }
    };

    // Echap ferme la modale (comportement standard attendu par les utilisateurs).
    // Capture phase + stopPropagation pour passer avant les autres listeners
    // globaux (raccourcis clavier, etc.) qui pourraient interpréter Échap.
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={`k-modal-overlay ${overlayClassName}`.trim()}>
      <div className={contentClassName || undefined} ref={contentRef}>
        {children}
      </div>
    </div>
  );
};

export default BaseModal;
