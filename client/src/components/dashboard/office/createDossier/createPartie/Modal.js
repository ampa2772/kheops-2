// Modal.js
import React, { useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import PropTypes from 'prop-types';
import { useSelector } from 'react-redux';
import './styles.css';
// La fonction useOutsideClick n'est plus nécessaire ici, nous gérons directement.

const Modal = ({ isOpen, onClose, children, fromModif = false }) => {
  const modalRef = useRef(null); // Référence au contenu de la modale
  const isSidebarOpen = useSelector((state) => state.layout.isSidebarOpen);
  const findContact = useSelector((state) => state.findContactReducer.contact);

  // États des "sous-modales" ouvertes par CreateContact
  const typeContactModalIsOpen = useSelector(state => state.layout.typeContactModalIsOpen);
  const createPersonneChargeModalIsOpen = useSelector(state => state.layout.createPersonneChargeModalIsOpen);
  const modaleMariageIsOpen = useSelector(state => state.mariageDetailsReducer.affichagesComposants.modaleMariage);
  const showRepLegModalIsOpen = useSelector(state => state.layout.showRepLegModal);
  const showContDirectIsOpen = useSelector(state => state.layout.showContDirect);

  const isAnySubModalOpen =
    typeContactModalIsOpen ||
    createPersonneChargeModalIsOpen ||
    modaleMariageIsOpen ||
    showRepLegModalIsOpen ||
    showContDirectIsOpen;

  // Gestionnaire pour les clics sur l'overlay
  const handleOverlayMouseDown = useCallback((event) => {
    // Se ferme uniquement si le clic est directement sur l'overlay
    // ET si aucune sous-modale (ouverte PAR CETTE MODALE MMC) n'est ouverte.
    if (event.target === event.currentTarget) {
      if (isAnySubModalOpen) {
        // Une sous-modale de MMC est ouverte. MMC ne se ferme pas.
        event.stopPropagation();
        return;
      }
      // ================================================================
      // CORRECTIF : Poser un flag temporaire sur document.body AVANT de
      // fermer la modale. EditDossierModal lit ce flag pour savoir que
      // ce clic provient de l'overlay MMC et ne doit pas fermer MGD.
      // Le flag est nécessaire car après onClose(), le DOM de Modal peut
      // être détruit par React avant que le handler document ne s'exécute,
      // rendant e.target.closest('.modal-overlay-top') inutilisable.
      // ================================================================
      console.log('[Modal.js] Clic overlay détecté → pose flag data-mmc-closing + onClose()');
      document.body.setAttribute('data-mmc-closing', 'true');
      setTimeout(() => {
        document.body.removeAttribute('data-mmc-closing');
        console.log('[Modal.js] Flag data-mmc-closing retiré (50ms)');
      }, 50);

      onClose();
      event.stopPropagation();
    }
  }, [onClose, isAnySubModalOpen]);

  // Gestionnaire pour empêcher la propagation des clics depuis le contenu
  const handleContentMouseDown = useCallback((event) => {
    event.stopPropagation();
  }, []);


  // Effet pour ajouter/supprimer le style 'modal-open' sur le body
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('modal-open-from-partie');
    } else {
      document.body.classList.remove('modal-open-from-partie');
    }
    return () => {
      document.body.classList.remove('modal-open-from-partie');
    };
  }, [isOpen]);


  if (!isOpen) return null;

  let modalClass = '';

  if (fromModif) {
    const isLinkedToSinglePartie =
      children?.props?.fromCreatePartie?.fromCreatePartiesForLink?.isLinkedToSinglePartie;

    let contactType = '';
    if (findContact?.contact) contactType = 'physique';
    else if (findContact?.contactPM) contactType = 'morale-private';
    else if (findContact?.contactPMPublique) contactType = 'morale-public';
    else contactType = 'inconnu';

    if (isLinkedToSinglePartie) {
      switch (contactType) {
        case 'physique': modalClass = 'modification-linked-physique'; break;
        case 'morale-private': modalClass = 'modification-linked-morale-private'; break;
        case 'morale-public': modalClass = 'modification-linked-morale-public'; break;
        default: modalClass = 'modification-linked-inconnu';
      }
    } else {
      switch (contactType) {
        case 'physique': modalClass = 'modification-partie-physique'; break;
        case 'morale-private': modalClass = 'modification-partie-morale-private'; break;
        case 'morale-public': modalClass = 'modification-partie-morale-public'; break;
        default: modalClass = 'modification-partie-inconnu';
      }
    }
  } else {
    modalClass = 'ajout-partie';
  }

  const modalJSX = (
    <div className="modal-overlay modal-overlay-top" onMouseDown={handleOverlayMouseDown}> {/* Gestionnaire sur l'overlay */}
      <div
        className={`modal-content-fromPartie ${isSidebarOpen ? 'mLeftFP' : ''} ${modalClass}`}
        ref={modalRef}
        onMouseDown={handleContentMouseDown} // Empêche la propagation depuis le contenu
      >
        {children}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalJSX, document.body);
};

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node,
  fromModif: PropTypes.bool,
};

Modal.defaultProps = {
  children: null,
  fromModif: false,
};

export default Modal;
