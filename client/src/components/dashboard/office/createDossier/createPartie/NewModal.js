import React, { useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useSelector } from 'react-redux';

const NewModal = ({
  isOpen,
  onClose, // Vient de closeNewModalHandler dans CreatePartie, qui est stable grâce à useCallback
  children,
  mainContactsRef, // Ref pour la liste de suggestions DANS la modale
  setShowContacts, // Setter pour afficher/cacher la liste de suggestions DANS la modale
  showContacts,    // État d'affichage de la liste de suggestions DANS la modale
  allContactsLinkPartie, // Utilisé pour conditionner l'affichage de la liste
  modalContext = 'creation',
  ariaLabel = 'Lier des personnes à une partie',
}) => {
  const modalRef = useRef();
  const previouslyFocusedRef = useRef(null);
  // -- Ajout d'un état local pour forcer un rafraîchissement du composant si besoin (peut-être plus nécessaire)
  // const [refreshFlag, setRefreshFlag] = useState(0);

  // Savoir si la modale principale (CreateContact via Modal.js) est ouverte
  const isMainModalOpen = useSelector((state) => state.layout.createPartieModalIsOpen); // ou isOpenMod si c'est le bon state
  
  // La logique de refreshFlag via linkedSearch n'est probablement plus nécessaire
  // si le re-render de LinkModalContent (enfant) est correct.

  useEffect(() => {
    const handleClickOutside = (event) => {
      // Si la modale principale (CreateContact) est ouverte et que le clic est dedans, ne rien faire.
      const mainModalElement = document.querySelector('.modal-content-fromPartie');
      if (isMainModalOpen && mainModalElement?.contains(event.target)) {
        return;
      }

      // Si le clic est DANS la liste de suggestions (mainContactsRef), ne rien faire.
      if (mainContactsRef.current?.contains(event.target)) {
        return;
      }

      // Si le clic est DANS NewModal (modalRef) mais HORS de la liste de suggestions
      if (modalRef.current?.contains(event.target)) {
        if (showContacts) { // Si la liste de suggestions est ouverte
          setShowContacts(false); // Fermer seulement la liste
        }
        // Ne pas fermer NewModal, ne pas propager si le clic est dans NewModal.
        // event.stopPropagation(); // Peut être nécessaire si d'autres listeners sont affectés.
        return;
      }
      
      // Si le clic est EN DEHORS de NewModal et de la modale principale (si applicable)
      // Alors, fermer la liste de suggestions d'abord, puis la modale.
      if (showContacts) {
        setShowContacts(false);
      } else {
        onClose(); // Ferme NewModal
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, showContacts, onClose, setShowContacts, mainContactsRef, isMainModalOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current = document.activeElement;
    const focusTimer = window.setTimeout(() => {
      modalRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      const previouslyFocused = previouslyFocusedRef.current;
      if (previouslyFocused?.isConnected && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleDialogKeyDown = (event) => {
      if (isMainModalOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (showContacts) {
          setShowContacts(false);
        } else {
          onClose();
        }
        return;
      }

      if (event.key === 'Tab' && modalRef.current) {
        const focusable = Array.from(modalRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
        if (focusable.length === 0) {
          event.preventDefault();
          modalRef.current.focus();
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
      }
    };

    document.addEventListener('keydown', handleDialogKeyDown);
    return () => document.removeEventListener('keydown', handleDialogKeyDown);
  }, [isOpen, isMainModalOpen, onClose, setShowContacts, showContacts]);


  if (!isOpen) return null;

  const contentClassName = `modal-content-partie-link ${
    showContacts && allContactsLinkPartie && allContactsLinkPartie.length > 0
      ? 'modal-content-partie-link_withList'
      : ''
  }`;

  const modalJSX = (
    <div className="modal-overlay-partieLink" data-context={modalContext}>
      {/*
        Le shell possède toujours les dimensions du viewport. Les anciennes
        classes margin/margin-alt utilisaient un wrapper 0 x 0 dans l'état
        normal et rendaient la largeur du dialogue dépendante de la cascade
        CSS de la page hôte.
      */}
      <div
        className={`k-linked-person-modal-shell ${isMainModalOpen ? 'is-contact-form-open' : ''}`}
        data-testid="linked-person-modal-shell"
        data-main-modal-open={isMainModalOpen ? 'true' : 'false'}
      >
        {/* modalRef est sur le contenu réel de NewModal */}
        <div
          className={contentClassName}
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
        >
          <button
            type="button"
            className="k-linked-person-close"
            onClick={onClose}
            aria-label="Fermer la fenêtre des personnes liées"
            title="Fermer"
          >
            <span aria-hidden="true">×</span>
          </button>
          {children}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalJSX, document.body);
};

export default NewModal;
