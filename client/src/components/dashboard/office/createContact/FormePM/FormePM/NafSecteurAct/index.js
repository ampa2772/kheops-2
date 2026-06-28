import React, { useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import SecteursAct from './index.json';
import { setMatchingSecteursActLabel } from '../../../../../../../redux/slices/layoutSlice';

import {
  setPersonneMoraleField,
} from '../../../../../../../redux/slices/personneMoraleSlice';
import useComboboxKeyboard from '../../../../../../../hooks/useComboboxKeyboard';


const NafSecteurAct = ({ submitAttempted }) => {
  const dispatch = useDispatch();
  const errors = useSelector((state) => state.personneMoraleReducer.formErrors);
  const contactPM = useSelector(state => state.personneMoraleReducer.personData);

  const matchingSecteursActLabel = useSelector(state => state.layout.matchingSecteursActLabel);


  const [previousInputLength, setPreviousInputLength] = useState(0);

  const [showList, setShowList] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [wasEmptyBeforeTyping, setWasEmptyBeforeTyping] = useState(true);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  const SecteursActLabel = SecteursAct.map(secteurAct => secteurAct.label);

  const handleChangeSecteurAct = (event) => {
   
    const {name, value } = event.target;
    const inputValueLower = value.toLowerCase().trim();
    const inputWords = inputValueLower.split(' ');

    const isAddingText = inputValueLower.length > previousInputLength;


    // Mettez à jour previousInputLength après avoir vérifié si du texte est ajouté ou supprimé
    setPreviousInputLength(inputValueLower.length);

    // Réinitialiser autoFilled seulement si on ajoute du texte
    if (isAddingText) {
      setAutoFilled(false);
    }

    dispatch(setPersonneMoraleField(name, value));

    if (!value) {
      setWasEmptyBeforeTyping(true);
      dispatch(setMatchingSecteursActLabel([]));
      dispatch(setPersonneMoraleField('NAF_APE', ''));
      setShowList(false);
      return;
    } else {
      setWasEmptyBeforeTyping(false);
    }

    const secteurActSet = new Set();
    let filteredSecteursActLabel = SecteursActLabel.filter(item => {
      const itemWords = item.toLowerCase().split(' ');
      // Vérifiez si le début de la chaîne saisie correspond exactement au début d'un label
      return inputWords.every((word, index) => itemWords[index]?.startsWith(word)) &&
             !secteurActSet.has(item.toLowerCase()) &&
             secteurActSet.add(item.toLowerCase());
    });
  
    // Si aucun label ne correspond à la recherche "commence par", effectuez la recherche "contient le mot"
    if (filteredSecteursActLabel.length === 0) {
      filteredSecteursActLabel = SecteursActLabel.filter(item => {
        return inputWords.some(word => item.toLowerCase().includes(word)) &&
               !secteurActSet.has(item.toLowerCase()) &&
               secteurActSet.add(item.toLowerCase());
      });
    }

    if (filteredSecteursActLabel.length === 0) {
      // Aucun secteur correspondant n'a été trouvé après les deux tentatives.
      // Vous pouvez ici vider le champ NAF_APE.
      dispatch(setPersonneMoraleField('NAF_APE', ''));
    }
  


    dispatch(setMatchingSecteursActLabel(filteredSecteursActLabel));
    setShowList(filteredSecteursActLabel.length > 1);

    // Auto-remplissage si un seul élément correspondant
    if (filteredSecteursActLabel.length === 1) {
      if (isAddingText && !autoFilled) {
        // Déclenchez l'auto-remplissage seulement si du texte est ajouté et autoFilled est false
        const label = filteredSecteursActLabel[0];
        const secteurObj = SecteursAct.find(secteur => secteur.label.toLowerCase() === label.toLowerCase());

        if (secteurObj) {
          dispatch(setPersonneMoraleField('NAF_APE', secteurObj.id));
          dispatch(setPersonneMoraleField(name, label));
          setAutoFilled(true);
        }
      }
    }

  };







  const handleChangeNAF_APE = (event) => {
    const {name, value} = event.target;
    const formattedValue = value.toUpperCase().trim(); // Convertir en majuscules et supprimer les espaces blancs
    // Utiliser formattedValue ici au lieu de value
    dispatch(setPersonneMoraleField(name, formattedValue));

    // Trouver le secteur d'activité correspondant
    const secteurObj = SecteursAct.find(secteur => secteur.id.toUpperCase() === formattedValue);
    if (secteurObj) {
      dispatch(setPersonneMoraleField('secteurActivite', secteurObj.label));
    } 
    else {
      // Réinitialiser le secteur d'activité si aucun code NAF/APE correspondant n'est trouvé
      dispatch(setPersonneMoraleField('secteurActivite', ''));
    }
  };

  const handleSecteurClick = (secteurLabel) => {
    // Filtrer tous les objets secteur correspondant au label sélectionné
    const secteursCorrespondants = SecteursAct.filter(secteur => secteur.label === secteurLabel);

    // Utiliser une expression régulière pour trouver le code NAF/APE le plus spécifique
    const regex = /\d+[A-Z]$/; // Recherche un code qui se termine par des chiffres suivis d'une lettre
    const secteurObj = secteursCorrespondants.find(secteur => regex.test(secteur.id)) || secteursCorrespondants[0];

    if (secteurObj) {
      dispatch(setPersonneMoraleField('secteurActivite' ,secteurLabel));
      dispatch(setPersonneMoraleField('NAF_APE', secteurObj.id)); // Mettre à jour le code NAF/APE
      dispatch(setMatchingSecteursActLabel([]));
      setShowList(false);
    }
  };


  const handleClickOutside = (event) => {
    if (listRef.current && !listRef.current.contains(event.target) && event.target !== inputRef.current) {
      setShowList(false);
    }
  };

  // Attacher et détacher l'écouteur pour les clics à l'extérieur
  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const truncateWithEllipsis = (text, maxLength) => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  };

  const isComboboxOpen = showList && matchingSecteursActLabel.length > 0;
  const {
    activeIndex,
    onKeyDown,
    listProps,
    getItemProps,
    inputProps,
  } = useComboboxKeyboard({
    items: matchingSecteursActLabel,
    isOpen: isComboboxOpen,
    onSelect: (label) => handleSecteurClick(label),
    onClose: () => setShowList(false),
  });

  return (
    <div className="inputContainer">
      <div className="container_input_nationality_list_nationality">
        <input
          ref={inputRef}
          name="secteurActivite"
          placeholder="Secteur d'activité"
          value={contactPM.secteurActivite}
          // value={contactPM.secteurActivite}
          onChange={handleChangeSecteurAct}
          onKeyDown={onKeyDown}
          className={`inputAddContact`}
          {...inputProps}
        />
        {isComboboxOpen && (
          <div className="myInfiniteScrollClass prof" ref={listRef} {...listProps}>
            {matchingSecteursActLabel.map((secteurAct, index) => {
              const itemProps = getItemProps(index);
              return (
                <div
                  className={`itemCommune${activeIndex === index ? ' is-active' : ''}`}
                  key={index}
                  onClick={() => handleSecteurClick(secteurAct)}
                  {...itemProps}
                >
                  {truncateWithEllipsis(secteurAct, 32)}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <input
        name="NAF_APE"
        placeholder="(NAF/APE)"
        value={contactPM.NAF_APE}
        onChange={handleChangeNAF_APE}
        className={`inputAddContact`}
      />
    </div>
  );
};

export default NafSecteurAct;

