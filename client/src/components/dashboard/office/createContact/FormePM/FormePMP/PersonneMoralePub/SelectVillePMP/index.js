import React from 'react';
import { useSelector } from 'react-redux';

import {
  setPersonneMoralePubliqueField
} from '../../../../../../../../redux/slices/contactPMPubliqueSlice';

import {
  setShowCommunesPMP,
} from '../../../../../../../../redux/slices/layoutSlice';

import SelectCommune from '../../../../fonctions/SelectCommune';


const AjoutVille = ({ submitAttempted }) => {
  const contactPMP = useSelector(state => state.contactPMPubliqueReducer.personneMorale);

  return (
    <SelectCommune
      inputName="ville"
      inputNameCP="codePostal"
      inputValue={contactPMP.ville}
      codePostal={contactPMP.codePostal}
      setInputValue={setPersonneMoralePubliqueField}
      setCodePostal={setPersonneMoralePubliqueField}
      communesSelector={state => state.communesPMPReducer.communes}
      currentPageSelector={state => state.communesPMPReducer.currentPage}
      placeholder="Ville"
      classNameMainCont="codepostalville"
      classNameListInput={`ville_listeVille`}
      classList="myInfiniteScrollClass heigth"
      classToogleInput="border_bot_none"
      submitAttempted={submitAttempted}
      errorPrefix="contactPMPublique"
      propriete="ville"
      proprieteCP="codePostal"
      prefix={'PMP'}
      setShowCommunes={setShowCommunesPMP}
      errorObj="errors"
      parentComponent="AjoutVille"
      show='PMP'
    />
  );
};

export default AjoutVille;
