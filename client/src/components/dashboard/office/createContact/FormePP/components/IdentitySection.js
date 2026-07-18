import React from 'react';
import { useDispatch } from 'react-redux';
import ContactTypeSwitch from '../ContactTypeSwitch';
import { setContactField } from '../../../../../../redux/slices/createContactSlice';

const IdentitySection = ({ contact, errors, submitAttempted, shouldHideSelectTypeContact, fromCreatePartie }) => {
    const dispatch = useDispatch();

    const handleChange = (event) => {
        dispatch(setContactField(event.target.name, event.target.value));
    };

    const linkContext = fromCreatePartie?.fromCreatePartiesForLink || {};
    const linkedPersonContext = !!(
        linkContext.isLinkedToSinglePartie || linkContext.isLinkedToPartiesGroup
    ) && !fromCreatePartie?.modificationInfo?.isModification;

    return (
        <fieldset className={`identity ${submitAttempted && (errors.type || errors.nom || errors.prenoms) ? 'redFieldset' : ''}`}>
            <legend>Identit&eacute;</legend>
            {!shouldHideSelectTypeContact && (
                <ContactTypeSwitch
                    submitAttempted={submitAttempted}
                    linkedPersonContext={linkedPersonContext}
                />
            )}

            <div className="nom_prenom_contact">
                <input
                    type="text"
                    name="nom"
                    placeholder="Nom"
                    value={contact.nom}
                    onChange={handleChange}
                    className={`inputAddContact ${submitAttempted && errors.nom ? 'error' : ''} largeur`}
                />
                <input
                    type="text"
                    name="nom_de_naissance"
                    placeholder="Nom de naissance"
                    value={contact.nom_de_naissance}
                    onChange={handleChange}
                    className="inputAddContact"
                />
                <input
                    type="text"
                    name="prenoms"
                    placeholder="Prénoms"
                    value={contact.prenoms}
                    onChange={handleChange}
                    className={`inputAddContact ${submitAttempted && errors.prenoms ? 'error' : ''}`}
                />
            </div>

            {/* Appellation courrier (PP uniquement) : pre-remplie par ContactTypeSwitch,
                librement editable par l'utilisateur. */}
            <input
                type="text"
                name="appellationCourrier"
                placeholder="Appellation courrier (ex: Cher Monsieur, Maître...)"
                value={contact.appellationCourrier || ''}
                onChange={handleChange}
                className="inputAddContact appellation-courrier-input"
            />
        </fieldset>
    );
};

export default IdentitySection;
