// client\src/components/dashboard/office/createDossier/createPartie/index.js
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

// Actions Redux spécifiques à ce composant (surtout pour la modale CreateContact)
import {
  setCreatePartieModal,
  setLinkModalIsOpen,
} from '../../../../../redux/slices/layoutSlice';
import { resetFindContact } from '../../../../../redux/slices/findContactSlice';

// Actions pour les parties (setPartie, deletePartie etc.)
import {
  setPartie as setPartieCreate,
  deletePartie as deletePartieCreate,
  setPartieLink as setPartieLinkCreate,
  deleteLinkedAvocat as deleteLinkedAvocatCreate,
  deleteLinkedContact as deleteLinkedContactCreate,
  deleteLinkedAvocatAllPour as deleteLinkedAvocatAllPourCreate,
  deleteLinkedContactAllPour as deleteLinkedContactAllPourCreate,
  setPartiesLinkAllPour as setPartiesLinkAllPourCreate,
  deleteLinkedAvocatAllContre as deleteLinkedAvocatAllContreCreate,
  deleteLinkedContactAllContre as deleteLinkedContactAllContreCreate,
  setPartiesLinkAllContre as setPartiesLinkAllContreCreate,
  resetParties as resetPartiesCreate,
  setShouldPopulateNameFields as setShouldPopulateNameFieldsCreate,
} from '../../../../../redux/slices/partieSlice';

import {
  setPartie as setPartieEdit,
  deletePartie as deletePartieEdit,
  setPartieLink as setPartieLinkEdit,
  deleteLinkedAvocat as deleteLinkedAvocatEdit,
  deleteLinkedContact as deleteLinkedContactEdit,
  deleteLinkedAvocatAllPour as deleteLinkedAvocatAllPourEdit,
  deleteLinkedContactAllPour as deleteLinkedContactAllPourEdit,
  setPartiesLinkAllPour as setPartiesLinkAllPourEdit,
  deleteLinkedAvocatAllContre as deleteLinkedAvocatAllContreEdit,
  deleteLinkedContactAllContre as deleteLinkedContactAllContreEdit,
  setPartiesLinkAllContre as setPartiesLinkAllContreEdit,
  resetParties as resetPartiesEdit,
  setShouldPopulateNameFields as setShouldPopulateNameFieldsEdit,
} from '../../../../../redux/slices/partieEditSlice';


// Autres actions partagées
import {
  searchContacts,
  searchContactsLinkPartie,
  resetContactsLinkPartie,
} from '../../../../../redux/slices/allSearchSlice';
import {
  addLinkedContactToParty,
  removeLinkedContactFromParty,
} from '../../../../../redux/slices/currentDossierSlice';
import {
  setSearchTerm,
  setSearchTermLinkPartie,
  setSearchTermLinkAllPour,
  setSearchTermLinkAllContre,
} from '../../../../../redux/slices/searchTermSlice';


// Styles
import './styles.css';
import './createPartieDark.css';
import '../../createDossier/createDossier/styles.css';

// Hooks personnalisés
import { usePartieHydration } from './hooks/usePartieHydration';
import usePartieData from './hooks/usePartieData';
import { usePartieModal } from './hooks/usePartieModal';
import { usePartieSearch } from './hooks/usePartieSearch';
import { usePartieActions } from './hooks/usePartieActions';
import { useWindowDimensions, calculateDynamicBottom, useOutsideClick } from './fonctions';

// Composants UI
import AddPartieSection from './components/AddPartieSection';
import PartiesBoard from './components/PartiesBoard';
import NewModal from './NewModal';
import Modal from './Modal';
import LinkModalContent from './components/LinkModalContent';
import CreateContact from '../../createContact';


const CreatePartie = ({ mode = 'create', presetDossier = null }) => {
  const dispatch = useDispatch();
  const isEdit = mode === 'edit';

  // Nouveau code
  const partieActions = usePartieActions(mode);

  const {
    parties: normalizedParties,
    pourParties,
    contreParties,
    linkedContactsAllPour,
    linkedAvocatsAllPour,
    linkedContactsAllContre,
    linkedAvocatsAllContre,
    linkedAvocatsPourIds,
    linkedAvocatsContreIds,
    linkedContactsPourIds,
    linkedContactsContreIds,
  } = usePartieData(mode);

  usePartieHydration(mode, presetDossier);

  const user = useSelector((s) => s.login.user);
  const token = useSelector((s) => s.login.token);

  const {
    searchTerm,
    searchTermLinkPartie,
    searchTermLinkAllPour,
    searchTermLinkAllContre,
    allContacts,
    loadingContacts,
    allContactsLinkPartie,
    loadingContactsLinkPartie,
    showSuggestions: showSuggestionsFromSearchHook,
    setShowSuggestions: setShowSuggestionsFromSearchHook,
    handleSearchChange,
    handleSearchChangeLink,
    handleInputFocusLink,
  } = usePartieSearch(mode, normalizedParties, user, token);

  const {
    isNewModalOpen,
    modalData,
    modalType,
    openSingleModal: openSingleModalFromHook,
    openAllPourModal: openAllPourModalFromHook,
    openAllContreModal: openAllContreModalFromHook,
    switchToSide,
    closeModal: closeLinkModal,
  } = usePartieModal(
    normalizedParties,
    linkedContactsAllPour,
    linkedAvocatsAllPour,
    linkedContactsAllContre,
    linkedAvocatsAllContre
  );

  const [isAddingPartie, setIsAddingPartie] = useState(() => {
    if (mode === 'create' && normalizedParties.length === 0) {
      return true;
    }
    return false;
  });

  const [selectedOption, setSelectedOption] = useState(
    mode === 'edit' && presetDossier?.typePartie ? presetDossier.typePartie : 'Pour'
  );

  const [fromCreatePartieProps, setFromCreatePartieProps] = useState(null);
  const [pendingNewContact, setPendingNewContact] = useState(false);
  const createPartieModalIsOpen = useSelector((s) => s.layout.createPartieModalIsOpen);

  const inputRef = useRef();
  const contactsRef = useRef();
  const pourContreContainerRef = useRef();
  const mainContactsRef = useRef();
  const creerContactLinkPartieRef = useRef();

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const adjustmentValue = windowWidth > 768 ? 0.9 : 0.7;

  useEffect(() => {
    const bottom = calculateDynamicBottom(pourParties, contreParties, windowHeight, adjustmentValue);
    document.documentElement.style.setProperty('--dynamic-bottom', `${bottom}vh`);
  }, [pourParties, contreParties, windowHeight, adjustmentValue]);

  useOutsideClick([contactsRef, inputRef, pourContreContainerRef], () => {
    if (showSuggestionsFromSearchHook && isAddingPartie) {
      setShowSuggestionsFromSearchHook(false);
    }
  }, showSuggestionsFromSearchHook && isAddingPartie);


  const wrappedOpenSingleModal = useCallback((partie) => {
    openSingleModalFromHook(partie);
    dispatch(setLinkModalIsOpen(true));
    setIsAddingPartie(false);
    setShowSuggestionsFromSearchHook(false);
  }, [openSingleModalFromHook, setIsAddingPartie, setShowSuggestionsFromSearchHook, dispatch]);

  const wrappedOpenAllPourModal = useCallback(() => {
    openAllPourModalFromHook();
    dispatch(setLinkModalIsOpen(true));
    setIsAddingPartie(false);
    setShowSuggestionsFromSearchHook(false);
  }, [openAllPourModalFromHook, setIsAddingPartie, setShowSuggestionsFromSearchHook, dispatch]);

  const wrappedOpenAllContreModal = useCallback(() => {
    openAllContreModalFromHook();
    dispatch(setLinkModalIsOpen(true));
    setIsAddingPartie(false);
    setShowSuggestionsFromSearchHook(false);
  }, [openAllContreModalFromHook, setIsAddingPartie, setShowSuggestionsFromSearchHook, dispatch]);


  const handleAddNewPartieClick = () => {
    setIsAddingPartie(true);
    setSelectedOption('Pour');
    dispatch(setSearchTerm(''));
  };

  // rc64 : callbacks dédiés pour les boutons "+ Ajouter une personne liée"
  // en bas de chaque panneau (PartyColumn footer). Fixe le côté + focus champ.
  const handleAddPersonForSide = useCallback((side) => {
    setSelectedOption(side);
    setIsAddingPartie(true);
    dispatch(setSearchTerm(''));
    setTimeout(() => {
      try { inputRef.current?.focus(); } catch { /* noop */ }
    }, 50);
  }, [dispatch]);

  const handleContactClickForNewPartie = (contact) => {
    dispatch(partieActions.setPartie(selectedOption, contact));
    dispatch(setSearchTerm(''));
    setSelectedOption('Pour');
    setShowSuggestionsFromSearchHook(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handlePartieTypeChange = (type) => {
    setSelectedOption(type);
  };

  const movePartie = (partieItem, newType) => {
    dispatch(partieActions.deletePartie(partieItem.idPartie));
    const partieDataPayload = partieItem.partieData || {};
    const newPartieData = {
      _id: partieItem.idPartie,
      nomPartie: partieItem.nomPartie,
      ...partieDataPayload
    };
    dispatch(partieActions.setPartie(newType, newPartieData));
  };

  const handleDeletePartie = (idPartie) => dispatch(partieActions.deletePartie(idPartie));

  const handleModifyPartieCallback = useCallback((partieToModify) => {
    const normalizedPartie = {
      ...partieToModify,
      idPartie: partieToModify.idPartie ?? partieToModify._id,
      linkedAvocats: partieToModify.linkedAvocats ?? partieToModify.avocats ?? [],
      linkedContacts: partieToModify.linkedContacts ?? partieToModify.contacts ?? [],
    };
    const dossierParentIdActual = presetDossier?._id;

    if (isEdit) {
      dispatch(setShouldPopulateNameFieldsEdit(false));
    } else {
      dispatch(setShouldPopulateNameFieldsCreate(false));
    }

    dispatch(resetFindContact());          // Purger les données du contact précédemment chargé
    dispatch(setCreatePartieModal(true));
    const newFromCreatePartieProps = {
      mode: mode,
      fromCreatePartieForPartie: {
        isTransformedToPartie: true,
        typePartie: normalizedPartie.typePartie,
      },
      fromCreatePartiesForLink: {
        isLinkedToPartiesGroup: false,
        isLinkedToSinglePartie: false,
        isLinkedToDossier: false,
        linkedPartieId: null,
        linkedGroupType: null,
      },
      modificationInfo: {
        isModification: true,
        contactId: normalizedPartie.idPartie,
        dossierParentId: dossierParentIdActual,
        presetContactData: normalizedPartie.partieData, // Passer les données de la partie ici
      },
    };
    setFromCreatePartieProps(newFromCreatePartieProps);
    setPendingNewContact(false);

    setIsAddingPartie(false);

  }, [dispatch, setIsAddingPartie, setFromCreatePartieProps, mode, presetDossier, isEdit]);

  const handleSupprAvocatLinked = (avocatId) => {
    if (modalType === 'single' && modalData?.idPartie) {
      dispatch(partieActions.deleteLinkedAvocat(modalData.idPartie, avocatId));
      if (isEdit && presetDossier?._id) {
        dispatch(removeLinkedContactFromParty(presetDossier._id, modalData.idPartie, avocatId, true));
      }
    } else if (modalType === 'allPour') {
      dispatch(partieActions.deleteLinkedAvocatAllPour(avocatId));
      if (isEdit && presetDossier?._id) {
        pourParties.forEach((p) => {
          dispatch(removeLinkedContactFromParty(presetDossier._id, p.idPartie, avocatId, true));
        });
      }
    } else if (modalType === 'allContre') {
      dispatch(partieActions.deleteLinkedAvocatAllContre(avocatId));
      if (isEdit && presetDossier?._id) {
        contreParties.forEach((p) => {
          dispatch(removeLinkedContactFromParty(presetDossier._id, p.idPartie, avocatId, true));
        });
      }
    }
  };
  const handleSupprContactLinked = (contactId) => {
    if (modalType === 'single' && modalData?.idPartie) {
      dispatch(partieActions.deleteLinkedContact(modalData.idPartie, contactId));
      if (isEdit && presetDossier?._id) {
        dispatch(removeLinkedContactFromParty(presetDossier._id, modalData.idPartie, contactId, false));
      }
    } else if (modalType === 'allPour') {
      dispatch(partieActions.deleteLinkedContactAllPour(contactId));
      if (isEdit && presetDossier?._id) {
        pourParties.forEach((p) => {
          dispatch(removeLinkedContactFromParty(presetDossier._id, p.idPartie, contactId, false));
        });
      }
    } else if (modalType === 'allContre') {
      dispatch(partieActions.deleteLinkedContactAllContre(contactId));
      if (isEdit && presetDossier?._id) {
        contreParties.forEach((p) => {
          dispatch(removeLinkedContactFromParty(presetDossier._id, p.idPartie, contactId, false));
        });
      }
    }
  };

  const handleContactClickLinkModal = (contact) => {
    if (modalType === 'single' && modalData?.idPartie) {
      dispatch(partieActions.setPartieLink(modalData.idPartie, contact));
      // Auto-save en base en mode edit
      if (isEdit && presetDossier?._id && contact?._id) {
        dispatch(addLinkedContactToParty(presetDossier._id, modalData.idPartie, { existingContactId: contact._id }));
      }
    } else if (modalType === 'allPour') {
      dispatch(partieActions.setPartiesLinkAllPour(contact));
      // Auto-save en base pour chaque partie Pour
      if (isEdit && presetDossier?._id && contact?._id) {
        pourParties.forEach((p) => {
          dispatch(addLinkedContactToParty(presetDossier._id, p.idPartie, { existingContactId: contact._id }));
        });
      }
    } else if (modalType === 'allContre') {
      dispatch(partieActions.setPartiesLinkAllContre(contact));
      // Auto-save en base pour chaque partie Contre
      if (isEdit && presetDossier?._id && contact?._id) {
        contreParties.forEach((p) => {
          dispatch(addLinkedContactToParty(presetDossier._id, p.idPartie, { existingContactId: contact._id }));
        });
      }
    }
    dispatch(resetContactsLinkPartie());
    setShowSuggestionsFromSearchHook(false);
  };

  const closeLinkModalHandler = useCallback(() => {
    closeLinkModal();
    dispatch(setLinkModalIsOpen(false));
    dispatch(resetContactsLinkPartie());
    setShowSuggestionsFromSearchHook(false);
  }, [closeLinkModal, dispatch, setShowSuggestionsFromSearchHook]);

  const sortedLinkedAvocats = useMemo(() => {
    if (!modalData?.linkedAvocats) return [];
    return [...modalData.linkedAvocats].sort((a, b) => {
      const an = a.nom || a.nomOfficeUser || '';
      const bn = b.nom || b.nomOfficeUser || '';
      return an.localeCompare(bn);
    });
  }, [modalData]);

  const currentSetShouldPopulateNameFields = isEdit ? setShouldPopulateNameFieldsEdit : setShouldPopulateNameFieldsCreate;

  // MODIFICATION ICI: Ajout de 'mode' au contexte passé à LinkModalContent
  const linkModalContext = {
    mode: mode, // Passer le mode actuel
    modalType, modalData, dropUp: false, sortedLinkedAvocats,
    linkedContactsPourIds, linkedContactsContreIds, linkedAvocatsPourIds, linkedAvocatsContreIds,
    pourParties, contreParties, parties: normalizedParties,
    inputLinkClasses: `inputNomPartie ${showSuggestionsFromSearchHook ? 'inputNomPartie_bottom' : ''}`,
    searchTermLinkAllPour, searchTermLinkAllContre, searchTermLinkPartie,
    handleSearchChangeLinkPartie: (e) => handleSearchChangeLink(e, modalType),
    handleInputFocusLinkPartie: () => handleInputFocusLink(modalType),
    allContactsLinkPartie,
    showContacts: showSuggestionsFromSearchHook,
    setShowContacts: setShowSuggestionsFromSearchHook,
    mainContactsRef, creerContactLinkPartieRef, dispatch,
    setShouldPopulateNameFields: (val) => dispatch(currentSetShouldPopulateNameFields(val)),
    setCreatePartieModal,
    setFromCreatePartieProps: (newProps) => {
      setFromCreatePartieProps(newProps);
      setPendingNewContact(false);
    },
    handleContactClickLinkPartie: handleContactClickLinkModal,
    handleSupprAvocatLinked, handleSupprContactLinked,
    switchToSide,
  };

  useEffect(() => {
    return () => {
    };
  }, [mode, presetDossier]);


  return (
    <DndProvider backend={HTML5Backend}>
      <Modal
        isOpen={createPartieModalIsOpen}
        onClose={() => {
          dispatch(setCreatePartieModal(false));
          // Préserver les données du formulaire si c'est une création de partie non soumise
          if (fromCreatePartieProps?.fromCreatePartieForPartie?.isTransformedToPartie &&
            !fromCreatePartieProps?.modificationInfo?.isModification) {
            setPendingNewContact(true);
          } else {
            setFromCreatePartieProps(null);
            setPendingNewContact(false);
          }
        }}
        fromModif={!!fromCreatePartieProps?.modificationInfo?.isModification}
      >
        {fromCreatePartieProps && (
          <CreateContact
            fromCreatePartie={fromCreatePartieProps}
            preserveFormData={pendingNewContact}
            onContactCreatedSuccessfully={() => {
              dispatch(setCreatePartieModal(false));
              setFromCreatePartieProps(null);
              setPendingNewContact(false);
            }}
          />
        )}
      </Modal>

      <NewModal
        isOpen={isNewModalOpen}
        onClose={closeLinkModalHandler}
        mainContactsRef={mainContactsRef}
        setShowContacts={setShowSuggestionsFromSearchHook}
        showContacts={showSuggestionsFromSearchHook}
        allContactsLinkPartie={allContactsLinkPartie}
        modalContext={modalType || 'default'}
      >
        <LinkModalContent ctx={linkModalContext} />
      </NewModal>

      <div className="parties-section-container k-parties-dark" data-selected-side={selectedOption}>
        {(pourParties.length > 0 || contreParties.length > 0) && (
          <PartiesBoard
            pourParties={pourParties}
            contreParties={contreParties}
            movePartie={movePartie}
            handleDeletePartie={handleDeletePartie}
            onOpenSinglePartieModal={wrappedOpenSingleModal}
            openAllPourModal={wrappedOpenAllPourModal}
            openAllContreModal={wrappedOpenAllContreModal}
            handleModifyPartie={handleModifyPartieCallback}
            onAddPersonForSide={handleAddPersonForSide}
          />
        )}

        <AddPartieSection
          mode={mode} // Passer le mode à AddPartieSection
          partieToEdit={null}
          parties={normalizedParties}
          isAddingPartieInitially={isAddingPartie}
          onAddNewPartieClick={handleAddNewPartieClick}
          onContactClick={handleContactClickForNewPartie}
          onPartieTypeChange={handlePartieTypeChange}
          selectedOption={selectedOption}
          searchTerm={searchTerm}
          allContacts={allContacts}
          showSuggestions={showSuggestionsFromSearchHook && isAddingPartie}
          searchHandlers={{ handleSearchChange }}
          inputRef={inputRef}
          contactsRef={contactsRef}
          pourContreContainerRef={pourContreContainerRef}
          setFromCreatePartieProps={setFromCreatePartieProps}
          hasPendingContactForm={pendingNewContact}
        />
      </div>
    </DndProvider>
  );
};

export default CreatePartie;