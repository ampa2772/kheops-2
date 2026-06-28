// PchCommuneField.js — Generic wrapper for PersonneCharge commune fields
// Replaces AddVilleNaissance and ModifVilleNaissance
import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import {
  setPersonneChargeField,
  modifierPersonne,
} from '../../../../../../redux/slices/pchSlice';
import SelectCommune from '../../fonctions/SelectCommune';

const PchCommuneField = ({
  inputName,
  inputNameCP,
  placeholder,
  classNameMainCont,
  classNameListInput,
  classList,
  classToogleInput,
  submitAttempted,
  prefix,
  setShowCommunes,
  parentComponent,
  show,
  communesReducerKey,
  mode = 'add', // 'add' or 'edit'
}) => {
  const { personne, currentPersonne } = useSelector((state) => state.PchReducer);

  const data = mode === 'edit' ? currentPersonne : personne;
  const errorObj = mode === 'edit' ? 'currentErrors' : 'errors';

  // Wrappers qui dispatchent toujours avec la forme objet explicite,
  // indépendamment de l'ordre des arguments reçus de SelectCommune.
  // useMemo indispensable : sans lui, SelectCommune voit des nouvelles refs
  // à chaque render, ce qui fait boucler son useEffect (-> crash écran blanc).
  const updateAction = useMemo(
    () => (mode === 'edit'
      ? (field, value) => modifierPersonne({ propriete: field, valeur: value })
      : (field, value) => setPersonneChargeField({ field, value })),
    [mode]
  );

  const communesSelector = useMemo(
    () => (state) => state[communesReducerKey].communes,
    [communesReducerKey]
  );
  const currentPageSelector = useMemo(
    () => (state) => state[communesReducerKey].currentPage,
    [communesReducerKey]
  );

  return (
    <SelectCommune
      inputName={inputName}
      inputNameCP={inputNameCP}
      inputValue={data[inputName]}
      codePostal={data[inputNameCP]}
      setInputValue={updateAction}
      setCodePostal={updateAction}
      communesSelector={communesSelector}
      currentPageSelector={currentPageSelector}
      placeholder={placeholder}
      classNameMainCont={classNameMainCont}
      classNameListInput={classNameListInput}
      classList={classList}
      classToogleInput={classToogleInput}
      submitAttempted={submitAttempted}
      errorPrefix="Pch"
      propriete={inputName}
      proprieteCP={inputNameCP}
      prefix={prefix}
      setShowCommunes={setShowCommunes}
      errorObj={errorObj}
      parentComponent={parentComponent}
      show={show}
    />
  );
};

export default PchCommuneField;
