import React from 'react';
import { setShowCommunesNaissancePCUP } from '../../../../../../../../redux/slices/layoutSlice';
import PchCommuneField from '../../PchCommuneField';

const VilleNaissancePC = ({ submitAttempted }) => (
  <PchCommuneField
    inputName="villeNaissance"
    inputNameCP="codePostalNaissance"
    placeholder="Ville naissance"
    classNameMainCont="container-input-personneCharge"
    classNameListInput="container_input_communes_list_communes AdulteNaissance"
    classList="myInfiniteScrollClass AdulteNaissanceList"
    classToogleInput="border_top_none"
    prefix="NAISSANCE_PCUP"
    setShowCommunes={setShowCommunesNaissancePCUP}
    communesReducerKey="communesNaissancePersonneChargeUPReducer"
    show="NaissancePCUP"
    mode="edit"
    submitAttempted={true}
  />
);

export default VilleNaissancePC;
