// SHIM — Ce composant a été remplacé par AutocompleteField.
// Conservé pour compatibilité. Utiliser AutocompleteField directement.
import React from 'react';
import AutocompleteField from '../../../../common/AutocompleteField';
import { fetchNationalites, resetMatchingNationalites } from '../../../../../../redux/slices/dataSlice';
import { setShowNationalites } from '../../../../../../redux/slices/layoutSlice';

const Select_nationalite_contact = ({ submitAttempted }) => (
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
);

export default Select_nationalite_contact;
