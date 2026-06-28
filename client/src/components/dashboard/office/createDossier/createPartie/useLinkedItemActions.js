// useLinkedItemActions.js — Shared logic for LinkedContactItem and LinkedDossierContactItem
import { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setModifyingContactId, setIsOpen } from '../../../../../redux/slices/layoutSlice';
import { resetFindContact } from '../../../../../redux/slices/findContactSlice';
import { useOutsideClick } from './fonctions';

/**
 * Shared hook for linked item components (contact or dossier contact).
 * Handles: modal open/close, hover states, options menu, outside click.
 *
 * @param {string} contactId - The _id of the contact
 * @returns {Object} All handlers and state needed by the linked item
 */
const useLinkedItemActions = (contactId) => {
  const dispatch = useDispatch();

  // Options menu
  const optionsRef = useRef();
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  useOutsideClick(optionsRef, () => setIsOptionsOpen(false), isOptionsOpen);
  const handleOptionsClick = () => setIsOptionsOpen((prev) => !prev);

  // Hover states
  const [isModifierHovered, setIsModifierHovered] = useState(false);
  const [isSupprimerHovered, setIsSupprimerHovered] = useState(false);

  // Modal management
  const modifyingContactId = useSelector((state) => state.layout.modifyingContactId);
  const isModalOpen = modifyingContactId === contactId;
  const handleModifierClick = () => {
    dispatch(resetFindContact());        // Purger les données du contact précédemment chargé
    dispatch(setModifyingContactId(contactId));
  };
  const handleCloseModal = () => dispatch(setModifyingContactId(null));

  useEffect(() => {
    dispatch(setIsOpen(isModalOpen));
  }, [isModalOpen, dispatch]);

  // Dossier ID for fromCreatePartie
  const dossierIdFromStore = useSelector(state => state.currentDossier.dossier?._id);

  return {
    dispatch,
    optionsRef,
    isOptionsOpen,
    handleOptionsClick,
    isModifierHovered,
    setIsModifierHovered,
    isSupprimerHovered,
    setIsSupprimerHovered,
    isModalOpen,
    handleModifierClick,
    handleCloseModal,
    dossierIdFromStore,
  };
};

export default useLinkedItemActions;
