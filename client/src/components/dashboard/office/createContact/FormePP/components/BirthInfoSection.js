import React from 'react';
import { useDispatch } from 'react-redux';
import SelectCommune from '../../fonctions/SelectCommune';
import AutocompleteField from '../../../../../common/AutocompleteField';
// === L'action est importée depuis le fichier partagé, ce qui est correct ===
import { setContactField } from '../../../../../../redux/slices/createContactSlice';
import { setShowCommunesNaissanceContact } from '../../../../../../redux/slices/layoutSlice';
import { fetchPays, resetMatchingPays } from '../../../../../../redux/slices/dataSlice';
import { setShowPaysNaissance } from '../../../../../../redux/slices/layoutSlice';

const BirthInfoSection = ({ contact, errors, submitAttempted }) => {
    const dispatch = useDispatch();

    const handleChange = (event) => {
        dispatch(setContactField(event.target.name, event.target.value));
    };

    return (
        <fieldset className={`identity ${submitAttempted && (errors.dateNaissance || errors.paysNaissance || errors.villeNaissance || errors.CP_VilleNaissance) ? 'redFieldset' : ''}`}>
            <legend>Naissance</legend>
            <div className="naissanceNationalite">
                <input
                    type="date"
                    name="dateNaissance"
                    value={contact.dateNaissance}
                    onChange={handleChange}
                    placeholder="Date de naissance"
                    required
                    className={`inputAddContact date ${submitAttempted && errors.dateNaissance ? 'error' : ''}`}
                />
                <AutocompleteField
                    fieldName="paysNaissance"
                    placeholder="Pays de naissance"
                    cssClass="pays"
                    fetchAction={fetchPays}
                    resetAction={resetMatchingPays}
                    setShowAction={setShowPaysNaissance}
                    showSelector={state => state.layout.showPaysNaissance}
                    matchingSelector={state => state.dataReducer.matchingPaysNaissance}
                    submitAttempted={submitAttempted}
                />
            </div>
            <SelectCommune
                propriete="villeNaissance"
                proprieteCP="CP_VilleNaissance"
                inputName="villeNaissance"
                inputNameCP="CP_VilleNaissance"
                inputValue={contact.villeNaissance}
                codePostal={contact.CP_VilleNaissance}
                // === La correction cruciale est de passer l'action creator, ce qui est déjà le cas dans votre code. La logique est maintenant fonctionnelle. ===
                setInputValue={setContactField}
                setCodePostal={setContactField}
                // ===========================================================================================================================
                communesSelector={state => state.communesNaissanceContactReducer.communes}
                currentPageSelector={state => state.communesNaissanceContactReducer.currentPage}
                prefix="NAISSANCE_CONTACT"
                placeholder="Ville de naissance"
                classNameMainCont="codepostalville"
                classNameListInput="ville_listeVille reverscol"
                classList="myInfiniteScrollClass naiss heigth"
                classToogleInput="border_top_none"
                submitAttempted={submitAttempted}
                errorPrefix="createContact"
                errorObj="errorForm"
                setShowCommunes={setShowCommunesNaissanceContact}
                show="NaissanceContact"
            />
        </fieldset>
    );
};

export default BirthInfoSection;
