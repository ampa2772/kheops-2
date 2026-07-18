// Nouveau code
import React, { useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import CreateDossier from '../createDossier';
import FullScreenLoader from '../../../common/FullScreenLoader';
import { resetDossier } from '../../../../redux/slices/dossierInfoSlice';
import { resetParties as resetPartiesEdit } from '../../../../redux/slices/partieEditSlice';
import { setCreatePartieModal } from '../../../../redux/slices/layoutSlice'; // Importer l'action pour fermer MMC
import './EditDossierModal.css';

// Nouveau code
const EditDossierModal = ({ dossier, onClose }) => {
  const createDossierRef = useRef(); // Ref pour l'élément racine de <CreateDossier> (<div class="createDosMain">)
  const dispatch = useDispatch();
  const createPartieModalIsOpen = useSelector((state) => state.layout.createPartieModalIsOpen);
  // ========================================================================
  // CORRECTIF CRITIQUE : Surveiller AUSSI modifyingContactId.
  // createPartieModalIsOpen = modale de CRÉATION/AJOUT de partie
  // modifyingContactId = modale de MODIFICATION d'un contact lié (LinkedContactItem)
  // Les deux sont des modales enfants qui ne doivent PAS fermer MGD.
  // ========================================================================
  const modifyingContactId = useSelector((state) => state.layout.modifyingContactId);
  const linkModalIsOpen = useSelector((state) => state.layout.linkModalIsOpen);

  const handleActualClose = useCallback(() => {
    dispatch(resetDossier());
    dispatch(resetPartiesEdit());
    onClose();
  }, [onClose, dispatch]);

  const handleClickOutsideMainContent = useCallback((e) => {
    // Déterminer si UNE quelconque modale enfant est ouverte
    const anyChildModalOpen = createPartieModalIsOpen || !!modifyingContactId || linkModalIsOpen;

    // === DEBUG ===
    const hasFlag = document.body.hasAttribute('data-mmc-closing');
    const hasOverlay = !!e.target.closest('.modal-overlay-top');
    const hasContent = !!e.target.closest('.modal-content-fromPartie');
    const inCreateDossier = createDossierRef.current && createDossierRef.current.contains(e.target);
    console.log(`[EditDossierModal] mousedown | flag=${hasFlag} overlay=${hasOverlay} content=${hasContent} inCreateDossier=${inCreateDossier} createPartieOpen=${createPartieModalIsOpen} modifyingContactId=${modifyingContactId} linkModalIsOpen=${linkModalIsOpen} anyChildOpen=${anyChildModalOpen} target=`, e.target.className);
    // === FIN DEBUG ===

    // ========================================================================
    // === CORRECTIF : Ignorer les clics provenant des modales enfants ===
    // ========================================================================
    // 1. Flag DOM posé par Modal.js quand l'overlay de la modale enfant est cliqué
    if (hasFlag) {
      console.log('[EditDossierModal] → IGNORÉ (flag data-mmc-closing)');
      return;
    }
    // 2. Clic directement sur/dans un élément de la modale enfant
    if (hasOverlay || hasContent) {
      console.log('[EditDossierModal] → IGNORÉ (overlay/content détecté)');
      return;
    }
    // ========================================================================

    // 3. Si une modale enfant était ouverte, on la ferme mais on préserve MGD
    if (anyChildModalOpen) {
      if (createPartieModalIsOpen) {
        dispatch(setCreatePartieModal(false));
      }
      // modifyingContactId est géré par Modal.js via onClose → handleCloseModal
      console.log('[EditDossierModal] → Modale enfant fermée, MGD préservée');
      return;
    }

    // 4. Aucune modale enfant ouverte. Fermer MGD si clic en dehors de CreateDossier.
    if (createDossierRef.current && !createDossierRef.current.contains(e.target)) {
      console.log('[EditDossierModal] → MGD FERMÉE (handleActualClose)');
      handleActualClose();
    }
  }, [handleActualClose, createPartieModalIsOpen, modifyingContactId, linkModalIsOpen, dispatch]);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutsideMainContent);
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideMainContent);
    };
  }, [handleClickOutsideMainContent]);

  // Le formulaire de la modale possède son propre scroll. Empêcher la page
  // située derrière de défiler, puis restaurer exactement son état à la
  // fermeture (sans interférer avec les classes des modales enfants).
  useEffect(() => {
    if (!dossier) return undefined;

    const body = document.body;
    const classWasAlreadyPresent = body.classList.contains('edit-dossier-modal-open');
    if (!classWasAlreadyPresent) {
      body.classList.add('edit-dossier-modal-open');
    }

    return () => {
      if (!classWasAlreadyPresent) {
        body.classList.remove('edit-dossier-modal-open');
      }
    };
  }, [dossier]);

  const { loadingEdit } = useSelector((s) => s.currentDossier || {});

  if (!dossier) {
    // console.error("[EDIT-MODAL] Aucun dossier fourni à la modale d'édition.");
    return null;
  }

  // La clé reste importante pour forcer un re-render propre de CreateDossier si le `dossier` (presetDossier) change.
  const createDossierKey = dossier._id ? `edit-dossier-${dossier._id}` : `edit-dossier-new-${Date.now()}`;


  return ReactDOM.createPortal(
    <>
      {loadingEdit && <FullScreenLoader />}
      {/* L'overlay n'a plus besoin de son propre onMouseDown si document gère tout */}
      <div className="k-modal-overlay edit-modal__overlay">
        {/* .edit-modal__content n'a plus besoin de onMouseDown non plus */}
        <div
          className="edit-modal__content"
          role="dialog"
          aria-modal="true"
          aria-label="Modifier le dossier"
        >
          <CreateDossier
            ref={createDossierRef} // Passer la ref à CreateDossier
            key={createDossierKey}
            mode="edit"
            presetDossier={dossier}
            onClose={handleActualClose}
            embedded
          />
        </div>
      </div>
    </>,
    document.getElementById('root')
  );
};

export default EditDossierModal;
