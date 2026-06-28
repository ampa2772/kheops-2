import React from 'react';
import { useSelector } from 'react-redux';

import {
  setPersonneMoraleField
} from '../../../../../../../redux/slices/personneMoraleSlice';

import {
  setShowCommunesPM,
} from '../../../../../../../redux/slices/layoutSlice';

import SelectCommune from '../../../fonctions/SelectCommune';


const AjoutVille = ({ submitAttempted }) => {
  const contactPM = useSelector((state) => state.personneMoraleReducer.personData);

  return (
    <SelectCommune
      inputName="villePM"
      inputNameCP="codePostalPM"
      inputValue={contactPM.villePM}
      codePostal={contactPM.codePostalPM}
      setInputValue={setPersonneMoraleField}
      setCodePostal={setPersonneMoraleField}
      communesSelector={state => state.communesPMReducer.communes}
      currentPageSelector={state => state.communesPMReducer.currentPage}
      placeholder="Ville"
      classNameMainCont="codepostalville"
      classNameListInput={`ville_listeVille`}
      classList="myInfiniteScrollClass heigth"
      classToogleInput="border_bot_none"
      submitAttempted={submitAttempted}
      errorPrefix="personneMorale"
      propriete="villePM"
      proprieteCP="codePostalPM"
      prefix={'PM'}
      setShowCommunes={setShowCommunesPM}
      errorObj="formErrors"
      parentComponent="AjoutVille"
      show='PM'
    />
  );
};

export default AjoutVille;
