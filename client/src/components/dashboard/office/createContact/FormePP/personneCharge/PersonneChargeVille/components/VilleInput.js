import React from 'react';
import { useSelector } from 'react-redux';
import {
  setPersonneChargeField,
  modifierPersonne
} from '../../../../../../../../redux/slices/pchSlice';
import {
  setShowCommunesPC,
  setShowCommunesPCUP
} from '../../../../../../../../redux/slices/layoutSlice';
import SelectCommune from '../../../../fonctions/SelectCommune';

const VilleInput = ({ submitAttempted }) => {
  // Sélectionne le mode ('ADD' ou 'EDIT') depuis le store Redux
  const mode = useSelector((state) => state.PchReducer.mode);
  const isEditMode = mode === 'EDIT';

  // Sélectionne les données et les erreurs en fonction du mode
  const { personne, currentPersonne } = useSelector((state) => state.PchReducer);
  const data = isEditMode ? currentPersonne : personne;

  // Détermine les actions et les sélecteurs à utiliser en fonction du mode
  const updateAction = isEditMode ? modifierPersonne : setPersonneChargeField;
  const setShowCommunesAction = isEditMode ? setShowCommunesPCUP : setShowCommunesPC;
  const communesSelector = isEditMode
    ? (state) => state.communesPersonneChargeUPReducer.communes
    : (state) => state.communesPersonneChargeReducer.communes;
  const currentPageSelector = isEditMode
    ? (state) => state.communesPersonneChargeUPReducer.currentPage
    : (state) => state.communesPersonneChargeReducer.currentPage;
  const errorObj = isEditMode ? 'currentErrors' : 'errors';
  const prefix = isEditMode ? 'PERSONNE_CHARGEUP' : 'PERSONNE_CHARGE';
  const showKey = isEditMode ? 'PCUP' : 'PC';

  return (
    <SelectCommune
      inputName="ville"
      inputNameCP="codePostal"
      inputValue={data?.ville || ''}
      codePostal={data?.codePostal || ''}
      setInputValue={updateAction}
      setCodePostal={updateAction}
      communesSelector={communesSelector}
      currentPageSelector={currentPageSelector}
      placeholder="Ville"
      classNameMainCont="codepostalville"
      classNameListInput="ville_listeVille"
      classList="myInfiniteScrollClass heigth"
      classToogleInput="border_bot_none"
      submitAttempted={isEditMode || submitAttempted} // En mode édition, les erreurs sont toujours potentiellement affichables
      errorPrefix="Pch" // Le reducer est le même pour les deux modes
      propriete="ville"
      proprieteCP="codePostal"
      prefix={prefix}
      setShowCommunes={setShowCommunesAction}
      errorObj={errorObj}
      parentComponent="VilleInput" // Nom du nouveau composant générique
      show={showKey}
    />
  );
};

export default VilleInput;