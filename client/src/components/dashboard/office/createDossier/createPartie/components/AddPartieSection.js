// C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_Fusion_36 - Copie\Kheops_2\client\src\components\dashboard\office\createDossier\createPartie\components\AddPartieSection.js
import React, { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import HoverToSpeak from '../../../../../common/HoverToSpeak';
import { speak, stopSpeaking } from '../../../../../../services/speechService';
import useComboboxKeyboard from '../../../../../../hooks/useComboboxKeyboard';

// --- Assets ---
import ajouterLogoPath from '../../../../../../assets/ajouter_responsable.svg';
import ajoutPartie from '../../../../../../assets/icone-plus.svg';
// import fleche_envoi from '../../../../../../assets/fleche-envoi.svg'; // Pas utilisé ici
import PourContre from '../../../../../../assets/PourContre.svg';

// --- Helpers ---
import { formatContact } from '../fonctions';

// --- Actions Redux (pour création contact) ---
import { setCreatePartieModal } from '../../../../../../redux/slices/layoutSlice';
import { setShouldPopulateNameFields } from '../../../../../../redux/slices/partieSlice';
// Correction: setShouldPopulateNameFields sera dynamiquement celui de partieActions ou partieEditActions via usePartieActions
// mais l'import direct ici est moins critique car il s'agit d'un booléen.

const AddPartieSection = ({
    mode, // 'create' | 'edit' (mode du dossier parent)
    partieToEdit, // Toujours null ici car cette section est pour l'ajout
    parties,
    isAddingPartieInitially,
    onAddNewPartieClick,
    onContactClick,
    onPartieTypeChange,
    selectedOption,
    searchTerm,
    allContacts,
    showSuggestions,
    searchHandlers,
    inputRef,
    contactsRef,
    pourContreContainerRef,
    setFromCreatePartieProps, // Fonction pour mettre à jour l'état dans CreatePartie/index.js
    hasPendingContactForm = false, // true si la modale a déjà été ouverte sans validation
}) => {
    const dispatch = useDispatch();
    const isSpeechEnabled = useSelector((state) => state.login.user?.isSpeechEnabled || false);
    const [isAddingPartie, setIsAddingPartie] = useState(isAddingPartieInitially);

    useEffect(() => {
        setIsAddingPartie(isAddingPartieInitially);
    }, [isAddingPartieInitially]);

    // Les classes pour l'input lui-même (affectant les border-radius)
    const inputClasses = `inputNomPartie ${!searchTerm ? 'inputNomPartie_empty' : ''} ${showSuggestions && isAddingPartie && allContacts.length > 0
            ? parties.length > 3
                ? 'inputNomPartie_top_border' // Nouvelle classe pour les bordures quand la liste est en haut
                : 'inputNomPartie_bottom_border' // Nouvelle classe pour les bordures quand la liste est en bas
            : '' // Pas de classe de bordure spécifique si la liste n'est pas affichée
        }`;

    const containerFormNomPartieClasses = `container_form_nom_partie`;

    // Déterminer les classes pour optionsInput en fonction du mode
    const optionsInputClasses = ` ${mode === 'edit' ? 'optionsInputEdit' : 'optionsInput'}`;

    const pourContreContainerClasses = `pour-contre-container ${showSuggestions && isAddingPartie && allContacts.length > 0 && parties.length > 3
            ? 'pour-contre-container_top_visual_adjustment'
            : ''
        }`;

    const listeContactsClasses = `liste_contacts_to_partie ${parties.length > 3 ? 'liste_contacts_to_partie_top_position' : 'liste_contacts_to_partie_bottom_position'
        }`;


    const handleInternalAddNewPartie = () => {
        setIsAddingPartie(true);
        if (onAddNewPartieClick) {
            onAddNewPartieClick();
        }
    };

    // Liste filtrée des contacts éligibles à l'ajout en partie (exclut ceux
    // déjà présents). Mémoïsée pour stabiliser l'identité passée au hook
    // clavier — sinon le useEffect [items] reset l'index à chaque rendu.
    const filteredContacts = useMemo(
        () => (allContacts || []).filter(
            (c) => !parties.some((p) => (p.idPartie || p._id) === c._id),
        ),
        [allContacts, parties],
    );

    const isComboboxOpen = showSuggestions && isAddingPartie && filteredContacts.length > 0;
    const {
        activeIndex,
        onKeyDown: onComboboxKeyDown,
        listProps,
        getItemProps,
        inputProps,
    } = useComboboxKeyboard({
        items: filteredContacts,
        isOpen: isComboboxOpen,
        onSelect: (contact) => onContactClick(contact),
        onClose: () => searchHandlers.setShowSuggestions(false),
    });

    const renderAddPartieButton = () => (
        <div className="form_partie_container">
            <HoverToSpeak textToSpeak="Bouton Creer une nouvelle partie">
                <button className="bouton_form_partie" onClick={handleInternalAddNewPartie}>
                    Créer une nouvelle partie
                    <img src={ajouterLogoPath} alt="Ajouter" className="k-icon-sm" />
                </button>
            </HoverToSpeak>
        </div>
    );

    const renderAddPartieForm = () => (
        // Changement ici : .container_form_nom_partie devient le parent direct de .optionsInput et de l'input
        <div className={containerFormNomPartieClasses}> {/* Cette div aura position: relative */}
            {/* ★ S27 P6 (2.0.12-rc1, refonte cartoon 2.0.17-rc1) :
                deux petits bonhommes (cartoon arrondi) pour choisir le côté
                de la nouvelle partie AVANT la sélection du contact.
                  - Vert + badge "+"   : POUR (demandeur, attaque/demande)
                  - Orange + bouclier  : CONTRE (défendeur, attaqué)
                Le bonhomme du côté sélectionné est mis en avant (entouré
                + opacité plus marquée + léger relief). Le toggle icône
                Pour/Contre historique et le glisser-déposer restent
                disponibles ailleurs dans le composant. */}
            <div
                className="pch-bonhomme-row"
                style={{
                    display: 'flex',
                    gap: '20px',
                    marginBottom: '12px',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    flexWrap: 'nowrap',
                }}
            >
                {/* === Bonhomme POUR === */}
                <HoverToSpeak textToSpeak={`Bouton ajouter le prochain contact comme partie POUR${selectedOption === 'Pour' ? ' (selectionne)' : ''}`}>
                    <button
                        type="button"
                        onClick={() => onPartieTypeChange('Pour')}
                        className={`pch-bonhomme pch-bonhomme--pour ${selectedOption === 'Pour' ? 'is-active' : ''}`}
                        title="Ajouter comme partie POUR (demandeur)"
                        aria-pressed={selectedOption === 'Pour'}
                        style={{
                            background: 'transparent',
                            border: `2px solid ${selectedOption === 'Pour' ? '#16a34a' : 'transparent'}`,
                            borderRadius: '12px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: selectedOption === 'Pour' ? 1 : 0.78,
                            boxShadow: selectedOption === 'Pour' ? '0 4px 14px rgba(22, 163, 74, 0.25)' : 'none',
                            transition: 'all 160ms ease',
                            width: 'auto',
                        }}
                    >
                        <svg viewBox="0 0 80 96" width="48" height="58" aria-hidden="true">
                            {/* Corps */}
                            <path d="M 12 92 Q 12 50 40 50 Q 68 50 68 92 Z" fill="#16a34a" />
                            <ellipse cx="40" cy="92" rx="28" ry="4" fill="#0f3818" opacity="0.25" />
                            {/* Tête */}
                            <circle cx="40" cy="30" r="22" fill="#16a34a" />
                            {/* Yeux */}
                            <circle cx="32" cy="28" r="3.2" fill="#fff" />
                            <circle cx="48" cy="28" r="3.2" fill="#fff" />
                            <circle cx="32.5" cy="29" r="1.6" fill="#0f3818" />
                            <circle cx="48.5" cy="29" r="1.6" fill="#0f3818" />
                            {/* Sourire */}
                            <path d="M 31 37 Q 40 44 49 37" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                            {/* Badge + (geste positif : la partie demande / attaque) */}
                            <circle cx="64" cy="14" r="11" fill="#22c55e" stroke="#fff" strokeWidth="2.2" />
                            <line x1="64" y1="9" x2="64" y2="19" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
                            <line x1="59" y1="14" x2="69" y2="14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
                        </svg>
                        <span
                            style={{
                                fontSize: '11px',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                color: selectedOption === 'Pour' ? '#16a34a' : '#9ca3af',
                                textTransform: 'uppercase',
                            }}
                        >
                            Pour
                        </span>
                    </button>
                </HoverToSpeak>

                {/* === Bonhomme CONTRE === */}
                <HoverToSpeak textToSpeak={`Bouton ajouter le prochain contact comme partie CONTRE${selectedOption === 'Contre' ? ' (selectionne)' : ''}`}>
                    <button
                        type="button"
                        onClick={() => onPartieTypeChange('Contre')}
                        className={`pch-bonhomme pch-bonhomme--contre ${selectedOption === 'Contre' ? 'is-active' : ''}`}
                        title="Ajouter comme partie CONTRE (défendeur)"
                        aria-pressed={selectedOption === 'Contre'}
                        style={{
                            background: 'transparent',
                            border: `2px solid ${selectedOption === 'Contre' ? '#ea580c' : 'transparent'}`,
                            borderRadius: '12px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: selectedOption === 'Contre' ? 1 : 0.78,
                            boxShadow: selectedOption === 'Contre' ? '0 4px 14px rgba(234, 88, 12, 0.25)' : 'none',
                            transition: 'all 160ms ease',
                            width: 'auto',
                        }}
                    >
                        <svg viewBox="0 0 80 96" width="48" height="58" aria-hidden="true">
                            {/* Corps */}
                            <path d="M 12 92 Q 12 50 40 50 Q 68 50 68 92 Z" fill="#ea580c" />
                            <ellipse cx="40" cy="92" rx="28" ry="4" fill="#3a1a05" opacity="0.25" />
                            {/* Tête */}
                            <circle cx="40" cy="30" r="22" fill="#ea580c" />
                            {/* Yeux */}
                            <circle cx="32" cy="28" r="3.2" fill="#fff" />
                            <circle cx="48" cy="28" r="3.2" fill="#fff" />
                            <circle cx="32.5" cy="29" r="1.6" fill="#3a1a05" />
                            <circle cx="48.5" cy="29" r="1.6" fill="#3a1a05" />
                            {/* Sourcils légèrement froncés (défense) */}
                            <path d="M 25 21 L 35 24" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
                            <path d="M 45 24 L 55 21" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
                            {/* Bouche neutre */}
                            <path d="M 34 39 Q 40 42 46 39" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                            {/* Bouclier (geste défensif : la partie se défend) */}
                            <path d="M 64 4 L 76 9 V 18 Q 64 26 64 26 Q 52 18 52 9 V 4 Z" fill="#f97316" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
                        </svg>
                        <span
                            style={{
                                fontSize: '11px',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                color: selectedOption === 'Contre' ? '#ea580c' : '#9ca3af',
                                textTransform: 'uppercase',
                            }}
                        >
                            Contre
                        </span>
                    </button>
                </HoverToSpeak>
            </div>
            <div className={optionsInputClasses} ref={pourContreContainerRef}> {/* Sera position: absolute */}
                <div className="container_option">
                    <div
                        className="CreerPartie"
                        onClick={() => {
                            if (hasPendingContactForm) {
                                // Réouverture : on saute les resets, on rouvre simplement la modale
                                dispatch(setCreatePartieModal(true));
                            } else {
                                // Première ouverture : reset complet + nouveau fromCreatePartieProps
                                dispatch({ type: 'RESET_CONTACT_DIRECT' });
                                dispatch({ type: 'RESET_REPRESENTANT_LEGAL' });
                                dispatch({ type: 'RESET_FORM_PMP' });
                                dispatch({ type: 'RESET_FORM_PMP_PUBLIC' });
                                dispatch({ type: 'RESET_FORM_CONTACT' });
                                dispatch({ type: 'RESET_TOUTE_LISTE' });
                                dispatch({ type: 'RESET_MARIAGE_DETAILS' });
                                dispatch(setShouldPopulateNameFields(true));
                                dispatch(setCreatePartieModal(true));
                                setFromCreatePartieProps({
                                    fromCreatePartieForPartie: {
                                        isTransformedToPartie: true,
                                        typePartie: selectedOption,
                                    },
                                    fromCreatePartiesForLink: {
                                        isLinkedToPartiesGroup: false,
                                        isLinkedToSinglePartie: false,
                                        isLinkedToDossier: false,
                                        linkedPartieId: null,
                                        linkedGroupType: null,
                                    },
                                    modificationInfo: { isModification: false, contactId: null },
                                    mode: mode,
                                });
                            }
                        }}
                    >
                        <img src={ajoutPartie} alt="Ajouter" className="k-icon-sm" />
                    </div>
                </div>

                <div className={pourContreContainerClasses} > {/* pour-contre-container n'est plus une ref ici, car optionsInput est la ref principale pour positionnement */}
                    <HoverToSpeak textToSpeak={`Bouton Pour${selectedOption === 'Pour' ? ' (selectionne)' : ''}`}>
                        <div
                            className={`pour-contre-option-pour ${selectedOption === 'Pour' ? 'selectedPour' : ''}`}
                            onClick={() => onPartieTypeChange('Pour')}
                        >
                            <div className="PourContre">
                                <img src={PourContre} alt="Pour" className="k-icon-sm" />
                            </div>
                        </div>
                    </HoverToSpeak>
                    <HoverToSpeak textToSpeak={`Bouton Contre${selectedOption === 'Contre' ? ' (selectionne)' : ''}`}>
                        <div
                            className={`pour-contre-option-contre ${selectedOption === 'Contre' ? 'selectedContre' : ''}`}
                            onClick={() => onPartieTypeChange('Contre')}
                        >
                            <div className="PourContre">
                                <img src={PourContre} alt="Contre" className="k-icon-sm" />
                            </div>
                        </div>
                    </HoverToSpeak>
                </div>
            </div>

            <input
                ref={inputRef}
                type="text"
                className={inputClasses}
                value={searchTerm}
                onChange={searchHandlers.handleSearchChange}
                onKeyDown={onComboboxKeyDown}
                onFocus={() => {
                    if (searchTerm && allContacts.length > 0) {
                        // La gestion de l'affichage est faite par usePartieSearch/CreatePartie
                    }
                }}
                disabled={false}
                placeholder={"Rechercher ou créer une partie..."}
                onMouseEnter={() => {
                    if (isSpeechEnabled) {
                        speak(searchTerm ? `Champ de recherche, contenu: ${searchTerm}` : 'Champ Rechercher ou creer une partie');
                    }
                }}
                onMouseLeave={() => { if (isSpeechEnabled) stopSpeaking(); }}
                {...inputProps}
            />
            {isComboboxOpen && (
                <div ref={contactsRef} className={listeContactsClasses} {...listProps}>
                    {filteredContacts.map((contact, idx) => {
                        const itemProps = getItemProps(idx);
                        return (
                            <div
                                key={contact._id}
                                className={`itemContact${activeIndex === idx ? ' is-active' : ''}`}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    onContactClick(contact);
                                }}
                                {...itemProps}
                            >
                                {formatContact(contact)}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    if (isAddingPartie) {
        return renderAddPartieForm();
    }

    // Dès qu'une partie existe, les deux CTA contextualisés des colonnes
    // deviennent l'unique point d'entrée. Le CTA général serait redondant.
    if (parties.length > 0) {
        return null;
    }

    return renderAddPartieButton();
};

export default AddPartieSection;
