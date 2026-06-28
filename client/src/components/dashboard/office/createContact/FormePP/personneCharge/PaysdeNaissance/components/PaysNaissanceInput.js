import React, { useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { pays } from '../../../../pays';
import { setPersonneChargeField, modifierPersonne } from '../../../../../../../../redux/slices/pchSlice';
import { setShowPaysNaissancePC } from '../../../../../../../../redux/slices/layoutSlice';
import useComboboxKeyboard from '../../../../../../../../hooks/useComboboxKeyboard';

const PaysNaissanceInput = ({ submitAttempted }) => {
  const dispatch = useDispatch();
  const inputPaysNaissanceRef = useRef(null);
  const myPaysNaissanceScrollDiv = useRef(null);

  // Sélection des états nécessaires depuis le store Redux
  const { mode, personne, currentPersonne, errors, currentErrors } = useSelector((state) => state.PchReducer);
  const showPaysNaissancePC = useSelector(state => state.layout.showPaysNaissancePC);

  // Logique pour déterminer si on est en mode édition
  const isEditMode = mode === 'EDIT';

  // Sélection des données et des erreurs en fonction du mode
  const data = isEditMode ? currentPersonne : personne;
  const formErrors = isEditMode ? currentErrors : errors;
  const effectiveSubmitAttempted = isEditMode || submitAttempted;

  // Gestionnaire de clic sur un pays dans la liste
  const handlePaysNaissanceClick = (paysNaissance) => {
    const action = isEditMode ? modifierPersonne : setPersonneChargeField;
    dispatch(action('paysNaissance', paysNaissance));
    dispatch(setShowPaysNaissancePC(false));
  };

  // Gestionnaire de saisie dans le champ
  const handlePaysNaissanceInputChange = (event) => {
    const { name, value } = event.target;
    const action = isEditMode ? modifierPersonne : setPersonneChargeField;
    dispatch(action(name, value));

    if (value.trim() === '') {
      dispatch(setShowPaysNaissancePC(false));
    } else {
      dispatch(setShowPaysNaissancePC(true));
    }
  };

  // Effet pour la visibilité de la liste et le style du champ
  useEffect(() => {
    if (inputPaysNaissanceRef.current) {
      if (showPaysNaissancePC && data?.paysNaissance) {
        inputPaysNaissanceRef.current.classList.add('border_top_none');
      } else {
        inputPaysNaissanceRef.current.classList.remove('border_top_none');
      }
    }
  }, [showPaysNaissancePC, data?.paysNaissance]);

  // Effet pour gérer les clics en dehors du composant
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        myPaysNaissanceScrollDiv.current &&
        !myPaysNaissanceScrollDiv.current.contains(event.target) &&
        event.target !== inputPaysNaissanceRef.current
      ) {
        dispatch(setShowPaysNaissancePC(false));
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dispatch, showPaysNaissancePC]);

  const visiblePays = useMemo(() => (
    pays
      .filter(p => p.toLowerCase().startsWith((data?.paysNaissance || '').toLowerCase()))
      .sort()
  ), [data?.paysNaissance]);

  const isComboboxOpen = !!data?.paysNaissance && !!showPaysNaissancePC && visiblePays.length > 0;
  const {
    activeIndex,
    onKeyDown,
    listProps,
    getItemProps,
    inputProps,
  } = useComboboxKeyboard({
    items: visiblePays,
    isOpen: isComboboxOpen,
    onSelect: (p) => handlePaysNaissanceClick(p),
    onClose: () => dispatch(setShowPaysNaissancePC(false)),
  });

  return (
    <div className="container_input_paysNaissance_list_paysNaissance PaysNaissance">
      <input
        name="paysNaissance"
        ref={inputPaysNaissanceRef}
        type="text"
        placeholder="Pays de naissance"
        value={data?.paysNaissance || ''}
        onChange={handlePaysNaissanceInputChange}
        onFocus={handlePaysNaissanceInputChange}
        onKeyDown={onKeyDown}
        className={`${effectiveSubmitAttempted && formErrors.paysNaissance ? 'error' : ''}`}
        {...inputProps}
      />
      {isComboboxOpen && (
        <div className="myInfiniteScrollClass PaysNaissanceList" ref={myPaysNaissanceScrollDiv} {...listProps}>
          {visiblePays.map((paysItem, index) => {
            const itemProps = getItemProps(index);
            return (
              <div
                className={`itemCommune${activeIndex === index ? ' is-active' : ''}`}
                key={index}
                onClick={() => handlePaysNaissanceClick(paysItem)}
                {...itemProps}
              >
                {paysItem}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PaysNaissanceInput;