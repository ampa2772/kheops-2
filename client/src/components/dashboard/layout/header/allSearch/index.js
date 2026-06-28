import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import "./styles.css";
import currentsUsersIcon from '../../../../../assets/loupe.svg';
import AllSearchModal from './allSearchModal'; // Import du nouveau composant modale
import { openAllSearchModal, closeAllSearchModal } from '../../../../../redux/slices/layoutSlice';

const CurrentsUsersIcon = () => {
  const dispatch = useDispatch();
  // L'état d'ouverture est dans Redux pour pouvoir être déclenché depuis
  // le raccourci clavier global Ctrl+K (cf. useGlobalKeyboardShortcuts).
  const isModalOpen = useSelector((s) => s.layout.isAllSearchModalOpen);

  const handleIconClick = (e) => {
    e.stopPropagation();
    dispatch(openAllSearchModal());
  };

  const closeModal = useCallback(() => {
    dispatch(closeAllSearchModal());
  }, [dispatch]);

  // La fermeture se fait désormais uniquement via le bouton (X) ou la sélection,
  // ce qui est une meilleure pratique pour les modales de recherche.

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleIconClick(e);
    }
  };

  return (
    <>
      <div
        onClick={handleIconClick}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Ouvrir la recherche globale de dossier"
        title="Recherche globale de dossier"
      >
        <img src={currentsUsersIcon} alt="" aria-hidden="true" className="currents-users-change-icon" />
      </div>
      {isModalOpen && (
        <div className="modal-overlay all-search-overlay" onClick={closeModal}>
          <div className="all-search-modal-container" onClick={e => e.stopPropagation()}>
            <AllSearchModal closeModal={closeModal} />
          </div>
        </div>
      )}
    </>
  );
};

export default CurrentsUsersIcon;