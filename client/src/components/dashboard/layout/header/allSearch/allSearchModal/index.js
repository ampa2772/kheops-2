import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { searchDossiersByParties, searchAllUserContacts } from '../../../../../../redux/slices/allSearchSlice';
import { setCurrentDossier } from '../../../../../../redux/slices/currentDossierSlice';
import { setSearchNavigationContactId } from '../../../../../../redux/slices/layoutSlice';
import { useNavigate } from 'react-router-dom';
import HoverToSpeak from '../../../../../common/HoverToSpeak';

// ========================================================================
// Helpers pour l'affichage des contacts
// ========================================================================
const getContactDisplayName = (contact) => {
  if (contact.typeContact === 'physique') {
    return `${contact.nom || ''} ${contact.prenoms || ''}`.trim();
  }
  if (contact.typeContact === 'morale') {
    return contact.raisonSociale || '';
  }
  if (contact.typeContact === 'moralePMP') {
    return contact.denomination || '';
  }
  return '';
};

const getContactTypeLabel = (type) => {
  switch (type) {
    case 'physique': return 'Personne';
    case 'morale': return 'Société';
    case 'moralePMP': return 'Public';
    default: return '';
  }
};

// Icônes SVG par type de contact
const ContactIcon = ({ type }) => {
  if (type === 'physique') {
    return (
      <svg className="contact-type-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
        <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'morale') {
    return (
      <svg className="contact-type-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="7" width="18" height="14" rx="1" stroke="currentColor" strokeWidth="2" />
        <path d="M7 7V5a2 2 0 012-2h6a2 2 0 012 2v2" stroke="currentColor" strokeWidth="2" />
        <line x1="7" y1="11" x2="7" y2="14" stroke="currentColor" strokeWidth="2" />
        <line x1="12" y1="11" x2="12" y2="14" stroke="currentColor" strokeWidth="2" />
        <line x1="17" y1="11" x2="17" y2="14" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  // moralePMP
  return (
    <svg className="contact-type-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 21h18M5 21V7l7-4 7 4v14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <rect x="9" y="10" width="2" height="3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="10" width="2" height="3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="16" width="4" height="5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
};

// Icône dossier SVG
const DossierIcon = () => (
  <svg className="dossier-type-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 7V5a2 2 0 012-2h4l2 2h8a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const AllSearchModal = ({ closeModal }) => {
  const dispatch = useDispatch();
  const token = useSelector(state => state.login.token);
  const navigate = useNavigate();
  const debounceRef = useRef(null);

  const [searchValue, setSearchValue] = useState('');
  // Index global du résultat sélectionné (clavier ↑/↓). 0 par défaut sur le
  // premier dossier ; quand il n'y a plus de dossier, sur le premier contact.
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedRef = useRef(null);

  // Selectors dossiers
  const loadingDossiers = useSelector(state => state.allSearchReducer.loadingDossiers);
  const dossierResults = useSelector(state => state.allSearchReducer.dossierResults);

  // Selectors contacts
  const loadingContacts = useSelector(state => state.globalContactsSearch.loadingAllUserContacts);
  const contactResults = useSelector(state => state.globalContactsSearch.allUserContactsResults);

  // Logique de visibilité
  const isLoading = loadingDossiers || loadingContacts;
  const hasDossierResults = dossierResults && dossierResults.length > 0;
  const hasContactResults = contactResults && contactResults.length > 0;
  const hasAnyResults = hasDossierResults || hasContactResults;
  const isListVisible = searchValue.trim() !== '' && !isLoading && hasAnyResults;

  // Recherche avec debounce (300ms) — 2 appels API en parallèle
  const handleChange = (e) => {
    const value = e.target.value;
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim() !== '') {
      debounceRef.current = setTimeout(() => {
        dispatch(searchDossiersByParties(value, token));
        dispatch(searchAllUserContacts(value, token));
      }, 300);
    }
  };

  // Cleanup debounce au démontage
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleDossierClick = (dossier) => {
    dispatch(setCurrentDossier(dossier));
    closeModal();
    navigate('/dashboard/dossier');
  };

  const handleContactClick = (contact) => {
    // Reset des formulaires avant navigation (même logique que dossierCreateModal)
    dispatch({ type: 'RESET_CONTACT_DIRECT' });
    dispatch({ type: 'RESET_REPRESENTANT_LEGAL' });
    dispatch({ type: 'RESET_FORM_PMP' });
    dispatch({ type: 'RESET_FORM_PMP_PUBLIC' });
    dispatch({ type: 'RESET_FORM_CONTACT' });
    dispatch({ type: 'RESET_TOUTE_LISTE' });
    dispatch({ type: 'RESET_MARIAGE_DETAILS' });
    // Stocker l'ID du contact pour que CreateContact le charge en mode modification
    dispatch(setSearchNavigationContactId(contact._id));
    closeModal();
    navigate('/dashboard/createContact');
  };

  // Liste plate des résultats pour la navigation clavier (dossiers d'abord,
  // puis contacts). L'index global de chaque ligne suit cet ordre :
  //   indexes [0..dossiers.length-1]            = dossiers
  //   indexes [dossiers.length..total-1]         = contacts
  const flatResults = useMemo(() => {
    const flat = [];
    (dossierResults || []).forEach((d) => flat.push({ kind: 'dossier', data: d }));
    (contactResults || []).forEach((c) => flat.push({ kind: 'contact', data: c }));
    return flat;
  }, [dossierResults, contactResults]);

  const totalResults = flatResults.length;

  // Reset de l'index sélectionné quand la liste change (nouvelle recherche).
  useEffect(() => {
    setSelectedIndex(0);
  }, [totalResults]);

  // Scroll auto pour garder le résultat sélectionné visible.
  useEffect(() => {
    if (selectedRef.current && typeof selectedRef.current.scrollIntoView === 'function') {
      selectedRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  // Clavier : Échap ferme, ↑/↓ navigue, Entrée valide la sélection.
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      closeModal();
      return;
    }
    if (totalResults === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % totalResults);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i <= 0 ? totalResults - 1 : i - 1));
    } else if (e.key === 'Enter') {
      const sel = flatResults[selectedIndex];
      if (!sel) return;
      e.preventDefault();
      if (sel.kind === 'dossier') handleDossierClick(sel.data);
      else if (sel.kind === 'contact') handleContactClick(sel.data);
    }
  }, [closeModal, totalResults, flatResults, selectedIndex]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Helpers pour appliquer la classe / le ref sur la ligne sélectionnée
  const dossierStartIndex = 0;
  const contactStartIndex = (dossierResults || []).length;
  const isDossierSelected = (idx) => selectedIndex === dossierStartIndex + idx;
  const isContactSelected = (idx) => selectedIndex === contactStartIndex + idx;

  return (
    <div className="all-search-modal">
      <div className="all-search-container">
        {/* Input avec icône loupe intégrée */}
        <div className={`all-search-input-wrapper ${isListVisible || (searchValue.trim() !== '' && isLoading) ? 'has-content-below' : ''}`}>
          <svg className="all-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Rechercher un dossier ou un contact..."
            value={searchValue}
            onChange={handleChange}
            className="all-search-input"
            autoFocus
          />
        </div>

        {/* Compteur de résultats */}
        {isListVisible && (
          <div className="all-search-result-count">
            {hasDossierResults && (
              <span>{dossierResults.length} dossier{dossierResults.length > 1 ? 's' : ''}</span>
            )}
            {hasDossierResults && hasContactResults && <span> &mdash; </span>}
            {hasContactResults && (
              <span>{contactResults.length} contact{contactResults.length > 1 ? 's' : ''}</span>
            )}
          </div>
        )}

        {/* Résultats — directement collés à l'input */}
        {searchValue.trim() !== '' && (
          <div className={`results-container ${isListVisible ? 'visible' : ''}`}>
            {isLoading && (
              <div className="search-loading-message">
                <div className="search-loading-spinner" />
                <span>Recherche en cours...</span>
              </div>
            )}

            {isListVisible && (
              <div className="search-results-sections">
                {/* Section Dossiers */}
                {hasDossierResults && (
                  <>
                    <div className="search-section-header search-section-dossiers">
                      <DossierIcon />
                      <span>Dossiers</span>
                    </div>
                    <ul className="listeSearchDossiers">
                      {dossierResults.map((dossier, idx) => {
                        const pourParties = dossier.dossier?.parties?.pour || [];
                        const contreParties = dossier.dossier?.parties?.contre || [];
                        const typeDossier = dossier.dossier?.dossier?.type_dossier;
                        const isDivorceCM = typeDossier === 'divorce_cm';
                        const nomDossier = dossier.dossier?.dossier?.nom || '';

                        // Pour les divorces CM les parties sont vides : on derive
                        // les noms depuis dossier.dossier.nom au format "EPOUX1 - EPOUX2".
                        let pourName, contreName, separator;
                        if (isDivorceCM) {
                          const parts = nomDossier.split(/\s+-\s+/);
                          pourName = parts[0] || nomDossier;
                          contreName = parts[1] || '';
                          separator = 'et';
                        } else {
                          pourName = pourParties.length > 0
                            ? pourParties[0].partieData?.raisonSociale || pourParties[0].partieData?.denomination || pourParties[0].nomPartie || 'PartiePour'
                            : '';
                          contreName = contreParties.length > 0
                            ? contreParties[0].partieData?.raisonSociale || contreParties[0].partieData?.denomination || contreParties[0].nomPartie || 'PartieContre'
                            : '';
                          separator = 'c/';
                        }

                        const textToSpeak = contreName ? `${pourName} ${separator} ${contreName}` : pourName;

                        const selected = isDossierSelected(idx);
                        return (
                          <HoverToSpeak key={dossier._id} textToSpeak={textToSpeak}>
                            <li
                              ref={selected ? selectedRef : null}
                              className={`search-result-item search-result-dossier${selected ? ' is-selected' : ''}`}
                              onClick={() => handleDossierClick(dossier)}
                              onMouseEnter={() => setSelectedIndex(dossierStartIndex + idx)}
                              title={textToSpeak}
                            >
                              <span className="partie-pour-search">{pourName}</span>
                              {contreName && (
                                <>
                                  <span className="partie-separator-search">{separator}</span>
                                  <span className="partie-contre-search">{contreName}</span>
                                </>
                              )}
                            </li>
                          </HoverToSpeak>
                        );
                      })}
                    </ul>
                  </>
                )}

                {/* Section Contacts */}
                {hasContactResults && (
                  <>
                    <div className="search-section-header search-section-contacts">
                      <ContactIcon type="physique" />
                      <span>Contacts</span>
                    </div>
                    <ul className="listeSearchContacts">
                      {contactResults.map((contact, idx) => {
                        const displayName = getContactDisplayName(contact);
                        const typeLabel = getContactTypeLabel(contact.typeContact);
                        const selected = isContactSelected(idx);
                        return (
                          <HoverToSpeak key={contact._id} textToSpeak={displayName}>
                            <li
                              ref={selected ? selectedRef : null}
                              className={`search-result-item search-result-contact contact-type-${contact.typeContact}${selected ? ' is-selected' : ''}`}
                              onClick={() => handleContactClick(contact)}
                              onMouseEnter={() => setSelectedIndex(contactStartIndex + idx)}
                              title={displayName}
                            >
                              <ContactIcon type={contact.typeContact} />
                              <span className="contact-name-search">{displayName}</span>
                              <span className={`contact-type-badge badge-${contact.typeContact}`}>{typeLabel}</span>
                            </li>
                          </HoverToSpeak>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            )}

            {!isLoading && searchValue.trim() !== '' && !hasAnyResults && (
              <div className="search-no-results-message">
                <svg className="search-no-results-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M8 8l6 6M14 8l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <p>Aucun résultat trouvé pour &laquo;&nbsp;{searchValue}&nbsp;&raquo;</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hint clavier */}
      <div className="all-search-hint">
        <kbd>↑</kbd><kbd>↓</kbd> naviguer · <kbd>↵</kbd> ouvrir · <kbd>Échap</kbd> fermer
      </div>
    </div>
  );
};

export default AllSearchModal;
