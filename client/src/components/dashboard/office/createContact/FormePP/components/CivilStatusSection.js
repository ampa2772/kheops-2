import React, { useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useMediaQuery } from 'react-responsive';
import AutocompleteField from '../../../../../common/AutocompleteField';
import { setMaritalStatus, setContactField } from '../../../../../../redux/slices/createContactSlice';
import { setDetailsMariageField } from '../../../../../../redux/slices/mariageDetailsSlice';
import { fetchNationalites, resetMatchingNationalites } from '../../../../../../redux/slices/dataSlice';
import { setShowNationalites } from '../../../../../../redux/slices/layoutSlice';
import hommeIMG from '../../../../../../assets/homme.svg';
import femmeIMG from '../../../../../../assets/femme.svg';
import HoverToSpeak from '../../../../../common/HoverToSpeak';

const CivilStatusSection = ({ contact, errors, submitAttempted, onOpenPersonneChargeModal }) => {
    const dispatch = useDispatch();
    const { statusMaritauxGenre, currentStatusMarital } = useSelector(state => state.createContactReducer.contactDetails);
    const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);
    const isDesktopOrLaptop = useMediaQuery({ query: '(min-width: 768px)' });

    const [showOptionsMaritalStatus, setShowOptionsMaritalStatus] = useState(false);
    const maritalStatusRef = useRef();

    const statusText = isDesktopOrLaptop ? 'Statut marital' : 'Statut';

    const handleMaritalStatusChange = (selectedOption) => {
        dispatch(setMaritalStatus(selectedOption));
        setShowOptionsMaritalStatus(false);
    };

    const handleOpenMariageModal = (e) => {
        e.stopPropagation();
        dispatch(setDetailsMariageField('modaleMariage', true));
        dispatch(setDetailsMariageField('formMariage', true));
    };

    const personnesCharge = useSelector((state) => state.PchReducer.liste);

    // === CORRECTION : La logique de clic sur le genre est simplifiée et fiabilisée ===
    // On appelle directement l'action `setContactField` avec 'genre' et la nouvelle valeur.
    // Le reducer se chargera de la logique complexe (ajuster le statut marital, etc.).
    const handleGenreClick = (genre) => {
        dispatch(setContactField('genre', genre));
    };
    // === FIN CORRECTION ===

    return (
        <fieldset className={`identity ${submitAttempted && (errors.nationalite || errors.maritalStatus) ? 'redFieldset' : ''}`}>
            <legend>&Eacute;tat civil</legend>
            <div className="container-status-contact">

                {/* New Centered Group */}
                <div className="centered-civil-status-group">
                    {/* Marital Status in Green Rectangle */}
                    <div className="genre_statusMat">
                        <div ref={maritalStatusRef} className={`select_marital_status contactMS ${showOptionsMaritalStatus ? 'showOptions' : ''} ${submitAttempted && errors.maritalStatus ? 'error' : ''}`}>
                            <div
                                className={`show_select_option_matrimonial ${contact.maritalStatus ? `new_class_STM` : ''} ${showOptionsMaritalStatus ? 'bord' : ''} ${!isSidebarOpen && isDesktopOrLaptop ? 'widthPlus' : ''}`}
                                onClick={() => setShowOptionsMaritalStatus(!showOptionsMaritalStatus)}
                            >
                                {currentStatusMarital || statusText}
                                {(currentStatusMarital === 'Mariée' || currentStatusMarital === 'Marié') && (
                                    <span className="maritalStatusButton" onClick={handleOpenMariageModal}>D</span>
                                )}
                                {showOptionsMaritalStatus && (
                                    <div className="options_status">
                                        {statusMaritauxGenre.map(option => (
                                            <HoverToSpeak textToSpeak={option} key={option}>
                                                <p onClick={() => handleMaritalStatusChange(option)}>{option}</p>
                                            </HoverToSpeak>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    {/* Gender Icons */}
                    <div className="select-genre genre_contact_civil_status">
                        <HoverToSpeak textToSpeak="Masculin">
                            <div
                                className={`gender-option gender-option--masculin ${contact.genre === 'Masculin' ? 'selected' : ''}`}
                                onClick={() => handleGenreClick('Masculin')}
                                title="Masculin"
                            >
                                <img className='gender_man' src={hommeIMG} alt="Masculin" />
                            </div>
                        </HoverToSpeak>
                        <HoverToSpeak textToSpeak="Féminin">
                            <div
                                className={`gender-option gender-option--feminin ${contact.genre === 'Feminin' ? 'selected' : ''}`}
                                onClick={() => handleGenreClick('Feminin')}
                                title="Féminin"
                            >
                                <img className='gender_man' src={femmeIMG} alt="Féminin" />
                            </div>
                        </HoverToSpeak>
                    </div>
                </div>

                <AutocompleteField
                    fieldName="nationalite"
                    placeholder="Nationalité"
                    cssClass="nat"
                    fetchAction={fetchNationalites}
                    resetAction={resetMatchingNationalites}
                    setShowAction={setShowNationalites}
                    showSelector={state => state.layout.showNationalites}
                    matchingSelector={state => state.dataReducer.matchingNationalities}
                    submitAttempted={submitAttempted}
                />
                <HoverToSpeak textToSpeak={(() => {
                    if (personnesCharge.length === 0) return 'Personnes à charge';
                    const nbEnfants = personnesCharge.filter(p => p.type === 'enfant').length;
                    const nbAdultes = personnesCharge.filter(p => p.type === 'adulte').length;
                    const parts = [];
                    if (nbEnfants > 0) parts.push(`${nbEnfants} enfant${nbEnfants > 1 ? 's' : ''}`);
                    if (nbAdultes > 0) parts.push(`${nbAdultes} adulte${nbAdultes > 1 ? 's' : ''}`);
                    return parts.join(', ');
                })()}>
                    <div
                        className={`personnes-charge ${personnesCharge.length > 0 ? 'has-personnes-charge' : ''}`}
                        onClick={onOpenPersonneChargeModal}
                    >
                        {(() => {
                            if (personnesCharge.length === 0) return 'Personnes à charge';
                            const nbEnfants = personnesCharge.filter(p => p.type === 'enfant').length;
                            const nbAdultes = personnesCharge.filter(p => p.type === 'adulte').length;
                            const parts = [];
                            if (nbEnfants > 0) parts.push(`${nbEnfants} enfant${nbEnfants > 1 ? 's' : ''}`);
                            if (nbAdultes > 0) parts.push(`${nbAdultes} adulte${nbAdultes > 1 ? 's' : ''}`);
                            return parts.join(', ');
                        })()}
                    </div>
                </HoverToSpeak>
            </div>
        </fieldset>
    );
};

export default CivilStatusSection;
