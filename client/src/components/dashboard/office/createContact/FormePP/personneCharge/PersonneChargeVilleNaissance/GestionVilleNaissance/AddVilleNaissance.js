import React from 'react';
import { setShowCommunesVilleNaissancePC } from '../../../../../../../../redux/slices/layoutSlice';
import PchCommuneField from '../../PchCommuneField';

const VilleNaissance = ({ submitAttempted }) => (
  <PchCommuneField
    inputName="villeNaissance"
    inputNameCP="codePostalNaissance"
    placeholder="Ville naissance"
    classNameMainCont="container-input-personneCharge"
    classNameListInput="container_input_communes_list_communes AdulteNaissance"
    classList="myInfiniteScrollClass AdulteNaissanceList"
    classToogleInput="border_top_none"
    prefix="NAISSANCE_PC"
    setShowCommunes={setShowCommunesVilleNaissancePC}
    communesReducerKey="communesNaissancePCReducer"
    parentComponent="AjoutVille"
    show="NaissancePC"
    mode="add"
    submitAttempted={submitAttempted}
  />
);

export default VilleNaissance;
