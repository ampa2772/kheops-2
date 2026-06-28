import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { nationalites } from '../../../../nationalites';
import {
  setPersonneChargeField,
  modifierPersonne
} from '../../../../../../../../redux/slices/pchSlice';
import {
  setShowNationalitesAdulte,
} from '../../../../../../../../redux/slices/layoutSlice';
import useComboboxKeyboard from '../../../../../../../../hooks/useComboboxKeyboard';

const NationalityInput = ({ submitAttempted }) => {
  const dispatch = useDispatch();
  const inputNationaliteRef = useRef(null);
  const myNationaliteScrollDiv = useRef(null);

  // Sélection de tous les états nécessaires depuis le store Redux
  const { mode, personne, currentPersonne, errors, currentErrors } = useSelector((state) => state.PchReducer);
  const showNationalitesAdulte = useSelector(state => state.layout.showNationalitesAdulte);

  // Logique pour déterminer si on est en mode édition
  const isEditMode = mode === 'EDIT';

  // Sélection des données et des erreurs en fonction du mode
  const data = isEditMode ? currentPersonne : personne;
  const formErrors = isEditMode ? currentErrors : errors;

  // États locaux (identiques pour l'ajout et la modification)
  const [hasNationaliteClicked, setHasNationaliteClicked] = useState(false);
  const [matchingNationalities, setMatchingNationalities] = useState([]);

  // Helper pour dispatcher correctement selon le mode
  const dispatchField = (fieldName, fieldValue) => {
    if (isEditMode) {
      dispatch(modifierPersonne({ propriete: fieldName, valeur: fieldValue }));
    } else {
      dispatch(setPersonneChargeField({ field: fieldName, value: fieldValue }));
    }
  };

  // Gestionnaire de clic sur une nationalité dans la liste
  const handleNationaliteClick = (nationality) => {
    dispatchField('nationalite', nationality);
  };

  // Gestionnaire de saisie dans le champ de nationalité
  const handleNationalityInputChange = (event) => {
    const { name, value } = event.target;
    dispatchField(name, value);

    const filteredNationalities = nationalites.filter(nationalite =>
      nationalite.toLowerCase().startsWith(value.toLowerCase())
    );
    setMatchingNationalities(filteredNationalities);

    if (value === '') {
      dispatch(setShowNationalitesAdulte(false));
    } else {
      dispatch(setShowNationalitesAdulte(filteredNationalities.length > 1 || !hasNationaliteClicked));
    }
  };

  // Effet pour l'auto-complétion et la visibilité de la liste
  useEffect(() => {
    if (matchingNationalities.length === 1 && !hasNationaliteClicked) {
      handleNationaliteClick(matchingNationalities[0]);
      dispatch(setShowNationalitesAdulte(false));
      setHasNationaliteClicked(true);
    }

    if (matchingNationalities.length !== 1) {
      setHasNationaliteClicked(false);
    }

    if (matchingNationalities.length === 0) {
      dispatch(setShowNationalitesAdulte(false));
    }

    if (inputNationaliteRef.current) {
      if (showNationalitesAdulte) {
        inputNationaliteRef.current.classList.add('border_bot_none');
      } else {
        inputNationaliteRef.current.classList.remove("border_bot_none");
      }
    }
  }, [matchingNationalities, hasNationaliteClicked, showNationalitesAdulte]);

  // Effet pour gérer les clics en dehors du composant
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        myNationaliteScrollDiv.current &&
        !myNationaliteScrollDiv.current.contains(event.target) &&
        event.target !== inputNationaliteRef.current
      ) {
        dispatch(setShowNationalitesAdulte(false));
      } else if (event.target === inputNationaliteRef.current) {
        handleNationalityInputChange({ 
          target: { value: data?.nationalite || '', name: 'nationalite' } 
        });
        if (matchingNationalities.length === 1) {
          dispatch(setShowNationalitesAdulte(false));
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [myNationaliteScrollDiv, showNationalitesAdulte, matchingNationalities, data]);

  const visibleNationalities = useMemo(() => (
    nationalites
      .filter(n => n.toLowerCase().startsWith((data?.nationalite || '').toLowerCase()))
      .sort()
  ), [data?.nationalite]);

  const isComboboxOpen = !!data?.nationalite && !!showNationalitesAdulte && visibleNationalities.length > 0;
  const {
    activeIndex,
    onKeyDown,
    listProps,
    getItemProps,
    inputProps,
  } = useComboboxKeyboard({
    items: visibleNationalities,
    isOpen: isComboboxOpen,
    onSelect: (n) => {
      handleNationaliteClick(n);
      dispatch(setShowNationalitesAdulte(false));
    },
    onClose: () => dispatch(setShowNationalitesAdulte(false)),
  });

  return (
    <div className="container_input_nationality_list_nationality">
      <input
        ref={inputNationaliteRef}
        name="nationalite"
        type="text"
        placeholder="Nationalité"
        value={data?.nationalite || ''}
        onChange={handleNationalityInputChange}
        onKeyDown={onKeyDown}
        className={`${(submitAttempted || isEditMode) && formErrors.nationalite ? 'error' : ''}`}
        {...inputProps}
      />
      {isComboboxOpen && (
        <div className="myInfiniteScrollClass" ref={myNationaliteScrollDiv} {...listProps}>
          {visibleNationalities.map((nationalite, index) => {
            const itemProps = getItemProps(index);
            return (
              <div
                className={`itemCommune${activeIndex === index ? ' is-active' : ''}`}
                key={index}
                onClick={() => {
                  handleNationaliteClick(nationalite);
                  dispatch(setShowNationalitesAdulte(false));
                }}
                {...itemProps}
              >
                {nationalite}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NationalityInput;