import React, { useRef, useEffect, useState, useCallback } from 'react';
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
}) => {
  const modalRef = useRef();
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


  if (!isOpen) return null;

  // Détermine la classe de la modale pour gérer la marge gauche si la Modal principale (CreateContact) est ouverte
  const modalWrapperClassName = isMainModalOpen // Utiliser la variable correcte indiquant si CreateContact est ouvert
    ? 'modal-content-partie-link-margin' // Avec marge (si CreateContact est ouvert à gauche)
    : 'modal-content-partie-link-margin-alt'; // Sans marge spéciale (ou centré)


  const contentClassName = `modal-content-partie-link ${
    showContacts && allContactsLinkPartie && allContactsLinkPartie.length > 0
      ? 'modal-content-partie-link_withList'
      : ''
  }`;

  const modalJSX = (
    <div className="modal-overlay-partieLink" data-context={modalContext}>
      {/* Le wrapper est utilisé pour le positionnement global si CreateContact est ouvert */}
      <div className={modalWrapperClassName}>
        {/* modalRef est sur le contenu réel de NewModal */}
        <div className={contentClassName} ref={modalRef} /*data-refresh={refreshFlag}*/>
          {children}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalJSX, document.body);
};

export default NewModal;