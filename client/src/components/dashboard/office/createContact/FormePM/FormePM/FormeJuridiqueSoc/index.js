import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  validateFormeJuridique,
  setPersonneMoraleField,
} from '../../../../../../../redux/slices/personneMoraleSlice';
import useComboboxKeyboard from '../../../../../../../hooks/useComboboxKeyboard';


const FormeJuridiqueSoc = ({ submitAttempted }) => {
  const dispatch = useDispatch();
  const errorCPM = useSelector(state => state.personneMoraleReducer.formErrors);
  const contactPM = useSelector(state => state.personneMoraleReducer.personData);

 

  const [showList, setShowList] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  const FormesJuridiques = ["EI", "EURL", "SARL", "SA", "SAS", "SASU", "SNC", "Scop", "SCA", "SCS"];

  const handleChangeFormeJuridique = (event) => {
    const {name, value } = event.target;
    const trimmedValue = value.trim();

    // Réinitialiser autoFilled si l'utilisateur commence à modifier le champ
    if (trimmedValue.length < contactPM.formeJuridique.length) {
      setAutoFilled(false);
    }

    dispatch(setPersonneMoraleField(name, trimmedValue));

    const hasError = trimmedValue === '';
    dispatch(validateFormeJuridique(hasError));

    // Cacher la liste si le champ est vide
    if (!trimmedValue) {
      setShowList(false);
      return;
    }

    const filteredFormes = FormesJuridiques.filter(fj => fj.toLowerCase().startsWith(trimmedValue.toLowerCase()));

    // Modifier ici: Ne pas remplir automatiquement si l'utilisateur est en train d'effacer
    if (filteredFormes.length === 1 && !autoFilled && trimmedValue.length > contactPM.formeJuridique.length) {
      dispatch(setPersonneMoraleField('formeJuridique' ,filteredFormes[0]));
      setShowList(false);
      setAutoFilled(true);
    } else {
      setShowList(filteredFormes.length > 0);
    }
  };





  const handleFormeJuridiqueClick = (formeJuridique) => {
    dispatch(setPersonneMoraleField('formeJuridique', formeJuridique));
    setShowList(false);
    setAutoFilled(true);
  };

  const handleClickOutside = (event) => {
    if (listRef.current && !listRef.current.contains(event.target) && event.target !== inputRef.current) {
      setShowList(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const visibleFormes = useMemo(
    () => FormesJuridiques.filter(fj => fj.toLowerCase().startsWith((contactPM.formeJuridique || '').toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contactPM.formeJuridique],
  );

  const isComboboxOpen = showList && visibleFormes.length > 0;
  const { activeIndex, onKeyDown, listProps, getItemProps, inputProps } =
    useComboboxKeyboard({
      items: visibleFormes,
      isOpen: isComboboxOpen,
      onSelect: (forme) => handleFormeJuridiqueClick(forme),
      onClose: () => setShowList(false),
    });

  return (
    <div className="container_input_nationality_list_nationality">
      <input
        ref={inputRef}
        name="formeJuridique"
        placeholder="Forme Juridique"
        value={contactPM.formeJuridique}
        onChange={handleChangeFormeJuridique}
        onKeyDown={onKeyDown}
        className={`inputAddContact ${submitAttempted && errorCPM.formeJuridique ? 'error' : ''}`}
        {...inputProps}
      />
      {isComboboxOpen && (
        <div className="myInfiniteScrollClass prof" ref={listRef} {...listProps}>
          {visibleFormes.map((formeJuridique, index) => {
            const itemProps = getItemProps(index);
            return (
              <div
                className={`itemCommune${activeIndex === index ? ' is-active' : ''}`}
                key={index}
                onClick={() => handleFormeJuridiqueClick(formeJuridique)}
                {...itemProps}
              >
                {formeJuridique}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FormeJuridiqueSoc;


