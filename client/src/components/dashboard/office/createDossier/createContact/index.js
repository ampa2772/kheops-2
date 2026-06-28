// client/src/components/dashboard/office/createDossier/createContact/index.js

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import './styles.css';
import { searchContactsForDossier } from '../../../../../redux/slices/allSearchSlice';
import { setSearchTermLinkDossier } from '../../../../../redux/slices/searchTermSlice';

// Importer l'action pour ouvrir la modale et l'icône
import { setCreatePartieModal } from '../../../../../redux/slices/layoutSlice';
import ajoutPartieIcon from '../../../../../assets/icone-plus.svg'; // Assurez-vous que le chemin est correct

import {
  formatContact,
  formatProContact,
  useWindowDimensions,
  calculateDynamicBottom,
  getInitials,
  useOutsideClick,
} from '../createPartie/fonctions';

import { addSelectedContact } from '../../../../../redux/slices/dossierInfoSlice';

// On importe le nouveau composant
import LinkedDossierContactItem from './LinkedDossierContactItem';

// Accessibilite - voix synthetique
import HoverToSpeak from '../../../../common/HoverToSpeak';
import { speak, stopSpeaking } from '../../../../../services/speechService';

// Récupérer le mode depuis le store ou via props si CreateDossier le passe
// Pour l'instant, on va supposer qu'il est disponible via le store ou qu'on le fixera plus tard
// const mode = useSelector(state => state.someSlice.mode); // Exemple, à adapter

// Ajout de setFromCreatePartieProps dans les props destructurées
const CreateContactForm = ({ mode, setFromCreatePartieProps }) => { 
  const dispatch = useDispatch();

  const searchTermLinkDossier = useSelector((state) => state.searchTerm.searchTermLinkDossier);
  const isSpeechEnabled = useSelector((state) => state.login.user?.isSpeechEnabled || false);
  const token = useSelector((state) => state.login.token);
  const contacts = useSelector((state) => state.dossierInfos.searchContactsDossier.contacts);
  const selectedContacts = useSelector((state) => state.dossierInfos.selectedContacts);
  const parties = useSelector((state) => state.partieData.parties); // Utilisé pour le filtrage pertinentContacts
  const currentMode = useSelector(state => state.dossierInfos.mode); // Récupérer le mode du dossier parent

  const [isSuggestionsVisible, setIsSuggestionsVisible] = useState(false);

  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  const handleInputChange = (e) => {
    const term = e.target.value;
    dispatch(setSearchTermLinkDossier(term));

    if (term.trim() !== '' && pertinentContacts.length > 0) {
      setIsSuggestionsVisible(true);
    } else {
      setIsSuggestionsVisible(false);
    }
  };

  const handleInputFocus = () => {
    if (searchTermLinkDossier.trim() !== '' && pertinentContacts.length > 0) {
      setIsSuggestionsVisible(true);
    }
  };

  const handleContactSelect = (contact) => {
    dispatch(addSelectedContact(contact));
    setIsSuggestionsVisible(false);
    dispatch(setSearchTermLinkDossier(''));
  };

  useEffect(() => {
    dispatch(setSearchTermLinkDossier(''));
  }, [dispatch]);

  useEffect(() => {
    if (searchTermLinkDossier && searchTermLinkDossier.trim() !== '') {
      dispatch(searchContactsForDossier(searchTermLinkDossier, token, selectedContacts));
    } else {
      setIsSuggestionsVisible(false);
    }
  }, [searchTermLinkDossier, dispatch, token, selectedContacts]);

  const intersectArrays = (arrays) => {
    if (arrays.length === 0) return [];
    return arrays.reduce((acc, array) => {
      return acc.filter((item1) =>
        array.some((item2) => item1._id === item2._id)
      );
    });
  };

  const pourParties = parties.filter((partie) => partie.typePartie === 'Pour');
  const contreParties = parties.filter((partie) => partie.typePartie === 'Contre');

  const partyContactIds = parties.map((partie) => partie.idPartie);

  const linkedContactsFromParties = parties.reduce((acc, partie) => {
    if (partie.linkedContacts && partie.linkedContacts.length > 0) {
      acc = acc.concat(partie.linkedContacts);
    }
    return acc;
  }, []);

  const linkedContactsFromPartiesIds = linkedContactsFromParties.map(contact => contact._id);

  const linkedContactsPerPartiePour = pourParties.map(
    (partie) => partie.linkedContacts || []
  );

  const linkedContactsAllPour = intersectArrays(linkedContactsPerPartiePour);
  const linkedContactsAllPourIds = linkedContactsAllPour.map(contact => contact._id);

  const linkedContactsPerPartieContre = contreParties.map(
    (partie) => partie.linkedContacts || []
  );

  const linkedContactsAllContre = intersectArrays(linkedContactsPerPartieContre);
  const linkedContactsAllContreIds = linkedContactsAllContre.map(contact => contact._id);

  const pertinentContacts = useMemo(() => {
    const filteredContacts = contacts.filter((contact) => {
      const contactId = contact._id;
      if (partyContactIds.includes(contactId)) return false;
      if (linkedContactsFromPartiesIds.includes(contactId)) return false;
      if (linkedContactsAllPourIds.includes(contactId)) return false;
      if (linkedContactsAllContreIds.includes(contactId)) return false;
      // Exclure aussi ceux déjà dans selectedContacts
      if (selectedContacts.some(sc => sc._id === contactId)) return false;
      return true;
    });

    // === NOUVELLE LOGIQUE POUR ÉVITER LES DOUBLONS ===
    const uniqueContacts = [];
    const seenIds = new Set();
    for (const contact of filteredContacts) {
        if (contact && contact._id && !seenIds.has(contact._id)) {
            uniqueContacts.push(contact);
            seenIds.add(contact._id);
        }
    }
    return uniqueContacts;
    // ===============================================
  }, [
    contacts,
    partyContactIds,
    linkedContactsFromPartiesIds,
    linkedContactsAllPourIds,
    linkedContactsAllContreIds,
    selectedContacts
  ]);

  useEffect(() => {
    if (pertinentContacts.length > 0 && searchTermLinkDossier.trim() !== '') {
      setIsSuggestionsVisible(true);
    } else {
      setIsSuggestionsVisible(false);
    }
  }, [pertinentContacts, searchTermLinkDossier]);

  useOutsideClick(suggestionsRef, () => {
    setIsSuggestionsVisible(false);
  }, true);

  // Fonction pour ouvrir la modale de création de contact
  const handleOpenCreateContactModal = () => {
    // Réinitialiser les états du formulaire de contact avant d'ouvrir la modale
    dispatch({ type: 'RESET_FORM_CONTACT' }); 
    dispatch({ type: 'RESET_CONTACT_DIRECT' }); 
    dispatch({ type: 'RESET_REPRESENTANT_LEGAL' }); 
    dispatch({ type: 'RESET_FORM_PMP' }); 
    dispatch({ type: 'RESET_FORM_PMP_PUBLIC' }); 
    dispatch({ type: 'RESET_TOUTE_LISTE' }); 
    dispatch({ type: 'RESET_MARIAGE_DETAILS' }); 
    // dispatch(resetContactAndErrors()); // Si une action globale de reset existe

    // La prop setFromCreatePartieProps est maintenant openDossierContactModal de CreateDossier.
    // Elle s'occupe de configurer contactModalConfig ET d'ouvrir la modale (via setIsDossierContactModalOpen).
    // Nous n'avons plus besoin de dispatcher setCreatePartieModal(true) ici.
    // Elle est normalement dans CreatePartie/index.js et passée à ses enfants.
    // Si CreateContactForm est utilisé par CreateDossier/index.js,
    // alors CreateDossier/index.js doit fournir une fonction similaire ou la propager.
    // Pour l'instant, on met un placeholder.
    // IMPORTANT: La logique de setFromCreatePartieProps doit être implémentée dans le parent
    // et passée ici, ou gérée via Redux si la modale est globale.
    if (typeof setFromCreatePartieProps === 'function') {
        const configForModal = {
            fromCreatePartieForPartie: { isTransformedToPartie: false, typePartie: null },
            fromCreatePartiesForLink: {
                isLinkedToPartiesGroup: false,
                isLinkedToSinglePartie: false,
                isLinkedToDossier: true, 
                linkedPartieId: null,
                linkedGroupType: null,
            },
            modificationInfo: { isModification: false, contactId: null },
            mode: currentMode,
            isContextDossierDirectLink: true // Nouvelle propriété pour identifier ce contexte
        };
        setFromCreatePartieProps(configForModal); // Appelle openDossierContactModal dans CreateDossier
    } else {
        console.error("La prop setFromCreatePartieProps (openDossierContactModal) est manquante ou n'est pas une fonction.");
    }
  };

  return (
    <div className='container_Form_Contact_Dossier'>
      <div className="contact_Recherche">
        {selectedContacts && selectedContacts.length > 0 && (
          <div className="linkedContactsList">
            {selectedContacts.map((contact) => (
              <LinkedDossierContactItem
                key={contact._id}
                contact={contact}
              />
            ))}
          </div>
        )}

        <HoverToSpeak textToSpeak="Section: Ajouter un contact lie au dossier">
          <div className='title_AjoutContactDos'>Ajouter un contact lié au dossier</div>
        </HoverToSpeak>

        <div className="input_liste_contacts_link_dossier input_with_button_CCF"> {/* Ajout de la classe pour le style */}
          <input
            className='nomContactLinkDos input_field_CCF' // Ajout de la classe pour le style
            type="text"
            placeholder="Rechercher des contacts..."
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            ref={inputRef}
            value={searchTermLinkDossier}
            onMouseEnter={() => {
              if (isSpeechEnabled) {
                speak(searchTermLinkDossier ? `Champ Rechercher des contacts, contenu: ${searchTermLinkDossier}` : 'Champ Rechercher des contacts');
              }
            }}
            onMouseLeave={() => { if (isSpeechEnabled) stopSpeaking(); }}
          />
          <HoverToSpeak textToSpeak="Bouton Creer un nouveau contact">
            <button
              type="button"
              className="add_button_CCF" // Nouvelle classe pour le style du bouton
              onClick={handleOpenCreateContactModal}
            >
              <img src={ajoutPartieIcon} alt="Ajouter contact" className="add_icon_CCF" /> {/* Icône */}
            </button>
          </HoverToSpeak>
          {isSuggestionsVisible && pertinentContacts.length > 0 && (
            <div className="result_contact_link_dos" ref={suggestionsRef}>
              {pertinentContacts.map((contact) => (
                <div
                  className='item_result_contact_link_dos'
                 key={contact._id}
                  onClick={() => handleContactSelect(contact)}
                >
                  {formatContact(contact)} {/* MODIFIÉ: formatProContact -> formatContact */}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateContactForm;

// CSS à ajouter (par exemple dans styles.css ou un fichier CSS importé) :
/*
.input_with_button_CCF {
  display: flex;
  align-items: center;
  width: 100%; // Ou la largeur souhaitée
}

.input_field_CCF {
  flex-grow: 1;
  margin-right: 8px; // Espace entre l'input et le bouton
  // Conserver les autres styles de .nomContactLinkDos
}

.add_button_CCF {
  background-color: transparent;
  border: 1px solid #ccc; // Style de bordure exemple
  padding: 6px; // Ajuster le padding
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px; // Exemple
}

.add_button_CCF:hover {
  background-color: #f0f0f0; // Effet au survol
}

.add_icon_CCF {
  width: 16px; // Taille de l'icône
  height: 16px;
}
*/