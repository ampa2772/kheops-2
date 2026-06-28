import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { debounce } from 'lodash';

import { useDispatch, useSelector } from 'react-redux';
import {
  updateNotaryName,
  fetchNotaires,
  updateNotary,
  setDetailsMariageField,
  selectNotaire,
  setAddingText,
  setListeAffich
} from '../../../../../../../redux/slices/mariageDetailsSlice';

import {

  setDisplayNotaires,
  setFormToDisplay,
  setDidUpdateNotaryName,
  setSingleNotaireFullName,
  setDidClickOnListItem,
  setClickedNotaireFullName

} from '../../../../../../../redux/slices/layoutSlice';


const NotaireInputField = () => {
  const dispatch = useDispatch();

  const inputRef = useRef(null);
  const divRef = useRef(null);
  const containerRef = useRef(null);





  const listeNotairesAffich = useSelector(state => state.mariageDetailsReducer.affichagesComposants.listeNotairesAffich);
  const notaryName = useSelector(state => state.mariageDetailsReducer.detailsMariage.notaryName);
  const notaires = useSelector(state => state.mariageDetailsReducer.listeNotaires.notaires);
  const currentPage = useSelector(state => state.mariageDetailsReducer.listeNotaires.currentPage);
  const totalPages = useSelector(state => state.mariageDetailsReducer.listeNotaires.totalPages);

  

  const [prevNotaryName, setPrevNotaryName] = useState(""); // état local pour stocker la valeur précédente
  // ... autres états et refs ...

  // Définir la fonction en dehors de votre composant ou avec useRef à l'intérieur
  const timeoutRef = useRef(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const isAddingText = value.length > prevNotaryName.length;

    dispatch(setDetailsMariageField(name, value));
    
    // Annuler le temporisateur précédent à chaque modification du champ
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (isAddingText) {
      // Si l'utilisateur ajoute du texte, rechercher immédiatement
      dispatch(fetchNotaires({ query: value }));
      dispatch(setAddingText(true));
    } else {
      // Si l'utilisateur supprime du texte, attendre avant de lancer la recherche
      timeoutRef.current = setTimeout(() => {
        dispatch(fetchNotaires({ query: value }));
        dispatch(setAddingText(false));
      }, 300); // Attendre 300ms avant d'exécuter
    }

    setPrevNotaryName(value); // Mettre à jour la valeur précédente avec la valeur actuelle
  };




  const handleScroll = () => {
    if (divRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = divRef.current;
      const scrollPercent = (scrollTop + clientHeight) / scrollHeight * 100;

      if (scrollPercent > 95) {

        if (currentPage < totalPages) {
          dispatch(fetchNotaires({ query: notaryName, page: currentPage + 1 }));
        }
      }
    }
  };

  useEffect(() => {
    if (inputRef.current) {
      if (listeNotairesAffich) {
        inputRef.current.style.borderBottomLeftRadius = '0';
        inputRef.current.style.borderBottomRightRadius = '0';
      } else {
        inputRef.current.style.borderBottomLeftRadius = '5px';
        inputRef.current.style.borderBottomRightRadius = '5px';
      }
    }
  }, [listeNotairesAffich]);

  useEffect(() => {
    if (inputRef.current.value === '') {
     dispatch(setListeAffich(false));
    }
  }, [inputRef]);






  return (
    <div ref={containerRef} className="notaire_container">
      <input
        ref={inputRef}  // Ajoutez la référence ici
        type="text"
        id="notaryName"
        name="notaryName"
        placeholder="Notaire qui a validé le contrat"
        className='marriageNotaire'
        value={notaryName}
        onChange={handleChange}
      />

      {Array.isArray(notaires) && listeNotairesAffich && (
        <div
          ref={divRef}  // Ajoutez la référence ici
          className="myInfiniteScrollClass heigth notaires_list"
          onScroll={handleScroll}
        >

          {notaires.map((notaire, index) => (
            <div
              className='itemNotaire'
              key={index}
              onClick={() => dispatch(selectNotaire(notaire))}
            >
              {notaire.nom}
            </div>
          ))}

        </div>
      )}
    </div>
  );
};

export default NotaireInputField;