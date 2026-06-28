// SHIM — Ce composant a été remplacé par AutocompleteField.
// Conservé pour compatibilité. Utiliser AutocompleteField directement.
import React from 'react';
import AutocompleteField from '../../../../common/AutocompleteField';
import { fetchProfessions, resetMatchingProfessions } from '../../../../../../redux/slices/dataSlice';
import { setShowProfession } from '../../../../../../redux/slices/layoutSlice';

const Select_profession_contact = ({ submitAttempted }) => (
  <AutocompleteField
    fieldName="profession"
    placeholder="Profession"
    cssClass="prof"
    fetchAction={fetchProfessions}
    resetAction={resetMatchingProfessions}
    setShowAction={setShowProfession}
    showSelector={state => state.layout.showProfession}
    matchingSelector={state => state.dataReducer.matchingProfessions}
    submitAttempted={submitAttempted}
  />
);

export default Select_profession_contact;
