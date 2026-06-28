// SHIM — Ce composant a été remplacé par AutocompleteField.
// Conservé pour compatibilité. Utiliser AutocompleteField directement.
import React from 'react';
import AutocompleteField from '../../../../common/AutocompleteField';
import { fetchPays, resetMatchingPays } from '../../../../../../redux/slices/dataSlice';
import { setShowPaysNaissance } from '../../../../../../redux/slices/layoutSlice';

const Select_pays_naissance_contact = ({ submitAttempted }) => (
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
);

export default Select_pays_naissance_contact;
