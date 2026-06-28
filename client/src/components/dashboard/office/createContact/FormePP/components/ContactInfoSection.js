import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import SelectCommune from '../../fonctions/SelectCommune';
// === L'action est importée depuis le fichier partagé, ce qui est correct ===
import { setContactField } from '../../../../../../redux/slices/createContactSlice';
import { setShowCommunesContact } from '../../../../../../redux/slices/layoutSlice';

const formatTelephone = (num) => {
    const formattedNum = num.replace(/\D/g, '').split('').map((digit, index) => {
        if (index % 2 === 1) {
            return digit + ' ';
        }
        return digit;
    }).join('');
    return formattedNum.trim();
};

const ContactInfoSection = ({ contact, errors, validEmail, submitAttempted }) => {
    const dispatch = useDispatch();
    const { emailExistsError } = useSelector(state => state.createContactReducer.formErrors);

    const handleChange = (event) => {
        const { name, value } = event.target;
        let formattedValue = value;
        if (name === 'telephone') {
            formattedValue = formatTelephone(value);
        }
        dispatch(setContactField(name, formattedValue));
    };

    return (
        <fieldset className={`identity ${submitAttempted && (errors.adresse || errors.ville || errors.codePostal || errors.email || !validEmail || errors.telephone || emailExistsError) ? 'redFieldset' : ''}`}>
            <legend>Coordonn&eacute;es</legend>
            <input
                type="text"
                name="adresse"
                value={contact.adresse}
                onChange={handleChange}
                placeholder="Adresse"
                required
                className={`inputAddContact ${submitAttempted && errors.adresse ? 'error' : ''}`}
            />
            <SelectCommune
                propriete="ville"
                proprieteCP="codePostal"
                inputName="ville"
                inputNameCP="codePostal"
                inputValue={contact.ville}
                codePostal={contact.codePostal}
                // === La correction cruciale est de passer l'action creator, ce qui est déjà le cas dans votre code. La logique est maintenant fonctionnelle. ===
                setInputValue={setContactField}
                setCodePostal={setContactField}
                // ===========================================================================================================================
                communesSelector={state => state.communesContactReducer.communes}
                currentPageSelector={state => state.communesContactReducer.currentPage}
                prefix="CONTACT"
                placeholder="Ville"
                classNameMainCont="codepostalville"
                classNameListInput="ville_listeVille"
                classList="myInfiniteScrollClass heigth"
                classToogleInput="border_bot_none"
                submitAttempted={submitAttempted}
                errorPrefix="createContact"
                errorObj="errorForm"
                setShowCommunes={setShowCommunesContact}
                show="VilleContact"
            />
            <div className="email_tel_contact">
                <input
                    type="email"
                    name="email"
                    value={contact.email}
                    onChange={handleChange}
                    placeholder="Email"
                    required
                    className={`inputAddContact ${submitAttempted && (errors.email || !validEmail || emailExistsError) ? 'error' : ''}`}
                />
                <input
                    type="tel"
                    name="telephone"
                    value={contact.telephone}
                    onChange={handleChange}
                    placeholder="Téléphone"
                    required
                    className={`inputAddContact ${submitAttempted && errors.telephone ? 'error' : ''}`}
                />
            </div>
        </fieldset>
    );
};

export default ContactInfoSection;