import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchCommunesGeneric,
  resetCommunesGeneric
} from '../../../../../redux/slices/genericCommunesSlice';
import useComboboxKeyboard from '../../../../../hooks/useComboboxKeyboard';


function findErrorObject(obj, targetKey) {  
  if (obj.hasOwnProperty(targetKey)) {
    return obj[targetKey];
  } else {
    for (let key in obj) {
      if (obj[key] instanceof Object) {
        const result = findErrorObject(obj[key], targetKey);
        if (result) return result;
      }
    }
  }
  return null;
}

const SelectCommune = ({
  inputName,
  inputNameCP,
  inputValue,
  setInputValue,
  codePostal,
  setCodePostal,
  communesSelector,
  currentPageSelector,
  show,
  placeholder,
  classNameMainCont,
  classNameListInput,
  classList,
  classToogleInput,
  submitAttempted,
  prefix,
  errorPrefix,
  propriete,
  proprieteCP,
  setShowCommunes,
  errorObj,
}) => {
  const dispatch = useDispatch();
  const inputRef = useRef(null);
  const myInfiniteScrollDiv = useRef(null);
  const [hasCommuneClicked, setHasCommuneClicked] = useState(false);
  const [scrolledPercentage, setScrolledPercentage] = useState(0);

  const stateForReducer = useSelector(state => state[`${errorPrefix}Reducer`]);

  const foundErrorObj = findErrorObject(stateForReducer, errorObj);

  const errors = foundErrorObj ? foundErrorObj[propriete] : null;
  const errorsCP = foundErrorObj ? foundErrorObj[proprieteCP] : null;
  const communes = useSelector(communesSelector);
  const currentPageCommunes = useSelector(currentPageSelector);
  const showCommunes = useSelector(state => state.layout[`showCommunes${show}`]);  

  const handleScroll = (event) => {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    const scrolled = (scrollTop / (scrollHeight - clientHeight)) * 100;
    setScrolledPercentage(scrolled);
  };

  const fetchMoreCommunes = () => {
    dispatch(fetchCommunesGeneric({ query: inputValue, page: currentPageCommunes + 1, prefix }));
  };

  useEffect(() => {
    if (scrolledPercentage > 95) {
      fetchMoreCommunes();
    }
  }, [scrolledPercentage, dispatch, inputValue, currentPageCommunes, prefix]);

  const handleCommuneClick = (communeName, postalCode) => {
    dispatch(setInputValue(inputName, communeName));
    dispatch(setCodePostal(inputNameCP, postalCode));
    dispatch(setShowCommunes(false));
    dispatch(resetCommunesGeneric(prefix));
  };

  // === LOGIQUE DE L'ANCIENNE VERSION CONSERVÉE INTÉGRALEMENT ===
  useEffect(() => {
    switch (true) {
      case (inputValue === ''):
        dispatch(setShowCommunes(false));
        dispatch(setCodePostal(inputNameCP,''));
        break;

      case (communes.length === 0):
        dispatch(setShowCommunes(false));
        break;

      case (communes.length === 1 && !hasCommuneClicked):
        handleCommuneClick(communes[0].Nom_commune, communes[0].Code_postal);
        setHasCommuneClicked(true);
        break;

      case (communes.length === 1 && hasCommuneClicked):
        dispatch(setShowCommunes(false));
        break;

      case (communes.length > 1 && hasCommuneClicked):
        setHasCommuneClicked(false);
        break;

      default:
        let matchingCommunes = communes.filter(commune => commune.Nom_commune.toLowerCase() === inputValue.toLowerCase());
        let exactMatch = matchingCommunes.find(commune => commune.Nom_commune.toLowerCase() === inputValue.toLowerCase() && commune.Code_postal === codePostal);

        if (exactMatch) {
          dispatch(setShowCommunes(false));
          handleCommuneClick(exactMatch.Nom_commune, exactMatch.Code_postal);
        } else if (matchingCommunes.length === 1) {
          handleCommuneClick(matchingCommunes[0].Nom_commune, matchingCommunes[0].Code_postal);
        } else {
          dispatch(setShowCommunes(true));
          dispatch(setCodePostal(inputNameCP, ''));
        }
    }

    if (inputRef.current) {
      if (showCommunes) {
        inputRef.current.classList.add(classToogleInput);
      } else {
        inputRef.current.classList.remove(classToogleInput);
      }
    }
  }, [inputValue, communes, showCommunes, codePostal, hasCommuneClicked, dispatch, setInputValue, setCodePostal, setShowCommunes, classToogleInput, inputName, inputNameCP, prefix]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (myInfiniteScrollDiv.current && !myInfiniteScrollDiv.current.contains(event.target) && event.target !== inputRef.current) {
        dispatch(resetCommunesGeneric(prefix));
      } else if (event.target === inputRef.current) {
        if (!showCommunes) {
          dispatch(fetchCommunesGeneric({ query: inputValue, prefix }));
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCommunes, dispatch, inputValue, prefix, myInfiniteScrollDiv, inputRef, resetCommunesGeneric]);

  const handleChange = (e) => {
    const newValue = e.target.value;
    dispatch(setInputValue(inputName, newValue));
    if (newValue) {
      dispatch(fetchCommunesGeneric({ query: newValue, prefix }));
    } else {
      dispatch(resetCommunesGeneric(prefix));
    }
  };

  // Liste filtrée et déduplicquée + filtrée pour exclure Code_postal arrays.
  // Mémoïsée pour stabiliser l'identité (sinon useEffect [items] du hook
  // reset l'index à chaque rendu).
  const visibleCommunes = useMemo(() => (
    communes
      .reduce((acc, current) => {
        const existingCommune = acc.find(c => c.Nom_commune === current.Nom_commune && c.Code_postal === current.Code_postal);
        return existingCommune ? acc : acc.concat([current]);
      }, [])
      .filter(c => !Array.isArray(c.Code_postal))
  ), [communes]);

  const isComboboxOpen = !!inputValue && !!showCommunes && visibleCommunes.length > 0;
  const {
    activeIndex,
    onKeyDown: onComboboxKeyDown,
    listProps,
    getItemProps,
    inputProps: comboboxInputProps,
  } = useComboboxKeyboard({
    items: visibleCommunes,
    isOpen: isComboboxOpen,
    onSelect: (commune) => handleCommuneClick(commune.Nom_commune, commune.Code_postal),
    onClose: () => dispatch(setShowCommunes(false)),
  });

  return (
    <div className={classNameMainCont}>
      <div className={classNameListInput}>
        <input
          ref={inputRef}
          type="text"
          name={inputName}
          value={inputValue}
          onChange={handleChange}
          onFocus={handleChange}
          onKeyDown={onComboboxKeyDown}
          placeholder={placeholder}
          className={`inputAddContact ${submitAttempted && errors ? 'error' : ''}`}
          {...comboboxInputProps}
        />
        {isComboboxOpen && (
          <div className={classList} ref={myInfiniteScrollDiv} onScroll={handleScroll} {...listProps}>
            {visibleCommunes.map((commune, index) => {
              const hasSameName = communes.some(c => c.Nom_commune === commune.Nom_commune && c.Code_postal !== commune.Code_postal);
              const itemProps = getItemProps(index);
              return (
                <div
                  className={`itemCommune${activeIndex === index ? ' is-active' : ''}`}
                  key={`${commune.Code_postal}-${index}`}
                  onClick={() => handleCommuneClick(commune.Nom_commune, commune.Code_postal)}
                  {...itemProps}
                >
                  {`${commune.Nom_commune.length > 17 ? commune.Nom_commune.substring(0, 17) + '...' : commune.Nom_commune}${hasSameName ? ` (${commune.Code_postal})` : ` (${commune.Code_postal.slice(0, 2)})`}`}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <input
        type="text"
        name={inputNameCP}
        value={codePostal}
        onChange={(e) => dispatch(setCodePostal(inputNameCP, e.target.value))}
        placeholder="Code postal"
        className={`inputAddContact ${submitAttempted && errorsCP ? 'error' : ''}`}
      />
    </div>
  );
};

export default SelectCommune;