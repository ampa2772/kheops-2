import React, { useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import professions from '../../../../metiers.json';
import {
  setPersonneChargeField,
  modifierPersonne
} from '../../../../../../../../redux/slices/pchSlice';
import {
  setShowProfessionPC
} from '../../../../../../../../redux/slices/layoutSlice';
import useComboboxKeyboard from '../../../../../../../../hooks/useComboboxKeyboard';

const ProfessionInput = ({ submitAttempted }) => {
  const dispatch = useDispatch();
  const inputRefProfession = useRef(null);
  const myProfessionScrollDiv = useRef(null);
  const professionNames = professions.map(profession => profession.name);

  // Sélection de tous les états nécessaires depuis le store Redux
  const { mode, personne, currentPersonne, errors, currentErrors } = useSelector((state) => state.PchReducer);
  const showProfessionPC = useSelector(state => state.layout.showProfessionPC);

  // Logique pour déterminer si on est en mode édition
  const isEditMode = mode === 'EDIT';

  // Sélection des données et des erreurs en fonction du mode
  const data = isEditMode ? currentPersonne : personne;
  const formErrors = isEditMode ? currentErrors : errors;

  // Fonction pour gérer le clic sur une profession dans la liste
  const handleProfessionClick = (profession) => {
    const action = isEditMode ? modifierPersonne : setPersonneChargeField;
    dispatch(action('profession', profession));
    dispatch(setShowProfessionPC(false)); // Cacher la liste après sélection
  };

  // Gestionnaire de saisie dans le champ de profession
  const handleProfessionInputChange = (event) => {
    const { name, value } = event.target;
    const action = isEditMode ? modifierPersonne : setPersonneChargeField;
    dispatch(action(name, value));

    if (value.trim() === '') {
      dispatch(setShowProfessionPC(false));
    } else {
      dispatch(setShowProfessionPC(true));
    }
  };

  // Effet pour la visibilité de la liste et le style du champ
  useEffect(() => {
    if (inputRefProfession.current) {
      if (showProfessionPC && data?.profession) {
        inputRefProfession.current.classList.add('border_bot_none');
      } else {
        inputRefProfession.current.classList.remove('border_bot_none');
      }
    }
  }, [showProfessionPC, data?.profession]);

  // Effet pour gérer les clics en dehors du composant
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        myProfessionScrollDiv.current &&
        !myProfessionScrollDiv.current.contains(event.target) &&
        event.target !== inputRefProfession.current
      ) {
        dispatch(setShowProfessionPC(false));
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dispatch]);

  const visibleProfessions = useMemo(() => (
    professionNames
      .filter(p => p.toLowerCase().startsWith((data?.profession || '').toLowerCase()))
      .sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [data?.profession]);

  const isComboboxOpen = !!data?.profession && !!showProfessionPC && visibleProfessions.length > 0;
  const {
    activeIndex,
    onKeyDown,
    listProps,
    getItemProps,
    inputProps,
  } = useComboboxKeyboard({
    items: visibleProfessions,
    isOpen: isComboboxOpen,
    onSelect: (p) => handleProfessionClick(p),
    onClose: () => dispatch(setShowProfessionPC(false)),
  });

  return (
    <div className="container_input_communes_list_communes">
      <input
        name="profession"
        ref={inputRefProfession}
        type="text"
        placeholder="Profession"
        value={data?.profession || ''}
        onChange={handleProfessionInputChange}
        onFocus={handleProfessionInputChange} // Ouvre la liste au focus si du texte est présent
        onKeyDown={onKeyDown}
        className={`${(submitAttempted || isEditMode) && formErrors.profession ? 'error' : ''}`}
        {...inputProps}
      />

      {isComboboxOpen && (
        <div className="myInfiniteScrollClass" ref={myProfessionScrollDiv} {...listProps}>
          {visibleProfessions.map((profession, index) => {
            const itemProps = getItemProps(index);
            return (
              <div
                className={`itemCommune${activeIndex === index ? ' is-active' : ''}`}
                key={index}
                onClick={() => handleProfessionClick(profession)}
                {...itemProps}
              >
                {profession.length > 24 ? profession.substring(0, 24) + '...' : profession}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProfessionInput;