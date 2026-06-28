// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_29 - Copie\Kheops_2\client\src\components\dashboard\office\createDossier\createPartie\hooks\usePartieSearch.js
import { useRef, useCallback, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { debounce } from 'lodash';

import {
  searchContacts,
  searchContactsLinkPartie,
  resetContactsLinkPartie, // Ajouté pour le reset
} from '../../../../../../redux/slices/allSearchSlice';
import {
  setSearchTerm,
  setSearchTermLinkPartie,
  setSearchTermLinkAllPour,
  setSearchTermLinkAllContre,
} from '../../../../../../redux/slices/searchTermSlice';

/**
 * Hook pour gérer la logique de recherche de contacts.
 * Inclut la gestion des termes de recherche (simple, lié),
 * le debounce des appels API, et les handlers d'input.
 *
 * @param {string} mode - 'create' ou 'edit'
 * @param {Array} parties - La liste actuelle des parties (pour filtrer la recherche simple).
 * @param {object} user - L'objet utilisateur connecté.
 * @param {string} token - Le token d'authentification.
 * @returns {object} Un objet contenant les états de recherche et les gestionnaires.
 */
export const usePartieSearch = (mode, parties, user, token) => {
  const dispatch = useDispatch();

  // Sélection des termes de recherche depuis Redux
  const searchTerm = useSelector((s) => s.searchTerm.searchTerm);
  const searchTermLinkPartie = useSelector((s) => s.searchTerm.searchTermLinkPartie);
  const searchTermLinkAllPour = useSelector((s) => s.searchTerm.searchTermLinkAllPour);
  const searchTermLinkAllContre = useSelector((s) => s.searchTerm.searchTermLinkAllContre);

  // Sélection des résultats de recherche
   const {
    all: allContacts,
    loading: loadingContacts,
  } = useSelector((s) => s.allSearchReducer);
  const {
    all: allContactsLinkPartie,
    loading: loadingContactsLinkPartie,
  } = useSelector((s) => s.linkedSearchReducer);


  // État local pour l'affichage des suggestions (commun aux deux recherches)
  const [showSuggestions, setShowSuggestions] = useState(false);


  // Références pour le debounce
  const debouncedSearchContactsRef = useRef(
    debounce((value, currentPartiesIds) => {
      dispatch(searchContacts(value, user, token, currentPartiesIds));
    }, 150) // Délai légèrement augmenté pour confort
  ).current;

  const debouncedSearchContactsLinkRef = useRef(
    debounce((value) => {
      dispatch(searchContactsLinkPartie(value, user, token));
    }, 150)
  ).current;

  // Handlers pour les inputs de recherche
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    dispatch(setSearchTerm(value));
    const currentPartiesIds = parties.map((p) => p.idPartie || p._id); // Utilise idPartie normalisé
    debouncedSearchContactsRef(value, currentPartiesIds);
  }, [dispatch, parties, user, token, debouncedSearchContactsRef]);


  // Handler unifié pour la recherche dans la modale de lien
  // Le 'modalType' déterminera quelle action setSearchTermLink... appeler.
   const handleSearchChangeLink = useCallback((e, modalTypeContext) => {
        const value = e.target.value;
        switch (modalTypeContext) {
            case 'allPour':
                dispatch(setSearchTermLinkAllPour(value));
                break;
            case 'allContre':
                dispatch(setSearchTermLinkAllContre(value));
                break;
            case 'single':
            default: // Par défaut ou si 'single'
                dispatch(setSearchTermLinkPartie(value));
                break;
        }
        debouncedSearchContactsLinkRef(value);
    }, [dispatch, debouncedSearchContactsLinkRef]);


  // Handler pour le focus de l'input de lien
  // Détermine si on doit afficher les suggestions basées sur le terme existant.
  const handleInputFocusLink = useCallback((modalTypeContext) => {
        let currentSearchTerm = '';
        switch (modalTypeContext) {
            case 'allPour':
                currentSearchTerm = searchTermLinkAllPour;
                break;
            case 'allContre':
                currentSearchTerm = searchTermLinkAllContre;
                break;
            case 'single':
            default:
                currentSearchTerm = searchTermLinkPartie;
                break;
        }
        // Affiche les suggestions seulement s'il y a un terme ET des résultats
         if (currentSearchTerm && allContactsLinkPartie.length > 0) {
             setShowSuggestions(true);
        } else {
             setShowSuggestions(false); // Cache si pas de terme ou pas de résultat
         }
    }, [searchTermLinkPartie, searchTermLinkAllPour, searchTermLinkAllContre, allContactsLinkPartie]); // Ajout de allContactsLinkPartie aux dépendances

  // Handler pour le clic sur une suggestion de lien
    const handleContactClickLink = useCallback((contact, modalTypeContext, modalData) => {
        // Ici, la logique de dispatch pour lier le contact (qui était dans CreatePartie)
        // sera appelée depuis le composant parent, car elle dépend des actions usePartieActions.
        // Ce hook ne fait que gérer la partie "recherche" et affichage des suggestions.

        // Reset des termes de recherche et fermeture des suggestions après sélection
        dispatch(resetContactsLinkPartie()); // Action unique qui reset les 3 searchTerms liés et la liste
        setShowSuggestions(false);

    }, [dispatch]);


   // Effet pour contrôler l'affichage global des suggestions (basé sur les deux types de recherche)
    useEffect(() => {
        const hasSimpleSearchTerm = !!searchTerm;
        const hasSimpleResults = !loadingContacts && allContacts.length > 0;

        const hasLinkedSearchTerm = !!searchTermLinkPartie || !!searchTermLinkAllPour || !!searchTermLinkAllContre;
        const hasLinkedResults = !loadingContactsLinkPartie && allContactsLinkPartie.length > 0;

        // Doit afficher si :
        // - Recherche simple active ET résultats dispos
        // OU
        // - Recherche liée active ET résultats dispos
        const shouldShow = (hasSimpleSearchTerm && hasSimpleResults) || (hasLinkedSearchTerm && hasLinkedResults);

        setShowSuggestions(shouldShow);

    }, [
        searchTerm, loadingContacts, allContacts,
        searchTermLinkPartie, searchTermLinkAllPour, searchTermLinkAllContre,
        loadingContactsLinkPartie, allContactsLinkPartie
    ]);


  return {
    // Termes de recherche
    searchTerm,
    searchTermLinkPartie,
    searchTermLinkAllPour,
    searchTermLinkAllContre,
    // Listes de suggestions et états de chargement
    allContacts,
    loadingContacts,
    allContactsLinkPartie,
    loadingContactsLinkPartie,
     // État d'affichage des suggestions
    showSuggestions,
    setShowSuggestions, // Exporte le setter si besoin de contrôle externe (ex: useOutsideClick)
    // Handlers
    handleSearchChange,
    handleSearchChangeLink,
    handleInputFocusLink,
    // Pas handleContactClickLink ici, car le dispatch dépend du contexte (single/all) et des actions
  };
};