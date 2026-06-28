import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setDetailsMariageField
} from '../../../../../../../redux/slices/mariageDetailsSlice';


import {

  setShowCommunesNotaire,
} from '../../../../../../../redux/slices/layoutSlice.js';

import SelectCommune from '../../../fonctions/SelectCommune.js';



const Select_commune_notaire = () => {



  const dispatch = useDispatch();

  const mariageDetailsReducer = useSelector(state => state.mariageDetailsReducer);
  const notary = mariageDetailsReducer.notary; 
  const submitAttempted = mariageDetailsReducer.validity.submitAttempted;

  



  return (

    <SelectCommune
    inputName="ville"
    inputNameCP="codePostal"
    inputValue={notary.ville}
    codePostal={notary.codePostal}
    setInputValue={setDetailsMariageField}
    setCodePostal={setDetailsMariageField}
    communesSelector={state => state.communesNotaireReducer.communes}
    currentPageSelector={state => state.communesNotaireReducer.currentPage}
    placeholder="Ville"
    classNameMainCont="codepostalville"
    classNameListInput={`ville_listeVille`}
    classList="myInfiniteScrollClass heigth"
    classToogleInput="border_bot_none"
    submitAttempted={submitAttempted}
    errorPrefix="mariageDetails"
    propriete="ville"
    proprieteCP="codePostal"
    prefix={'NOTAIRE_MARIAGE'}
    setShowCommunes={setShowCommunesNotaire}
    errorObj="errors"
    parentComponent="AjoutVille"
    show='Notaire'
  />
  

   
  );
};


export default Select_commune_notaire;


