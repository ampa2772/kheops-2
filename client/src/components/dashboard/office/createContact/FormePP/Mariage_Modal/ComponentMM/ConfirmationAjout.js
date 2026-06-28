import React, { useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import '../styles.css';
import { setDetailsMariageField } from '../../../../../../../redux/slices/mariageDetailsSlice';

const ConfirmationAjout = ({ onCancel }) => {
  const dispatch = useDispatch();
  const notaryName = useSelector(state => state.mariageDetailsReducer.detailsMariage.notaryName);
  const modalRef = useRef();

  const truncateAndCapitalize = (string, maxLength) => {
    if (!string) return "";

    let truncatedString = "";

    if (string.includes(' ')) {
      const [firstPart] = string.split(' ');
      truncatedString = firstPart.charAt(0).toUpperCase() + firstPart.slice(1).toLowerCase();

      if (truncatedString.length > maxLength) {
        truncatedString = truncatedString.slice(0, maxLength) + '... ';
      }
    } else {
      truncatedString = string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();

      if (truncatedString.length > 15) {
        truncatedString = truncatedString.slice(0, 15) + '...';
      }
    }

    return truncatedString;
  };

  const handleClickOutside = (event) => {
    if (modalRef.current && !modalRef.current.contains(event.target)) {
      event.stopPropagation(); // Empêche la propagation de l'événement pour éviter que d'autres modales ne soient affectées
      onCancel(); // Ferme uniquement la modale ConfirmationAjout
      dispatch(setDetailsMariageField('formMariage', true)); // Rouvre formMariage si nécessaire
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={handleClickOutside}>
      <div className="modal-content_confAjout" ref={modalRef}>
        <div className="titleContainer">
          Voulez-vous ajouter <span className='bold'>Maître {truncateAndCapitalize(notaryName)}</span> à la liste des notaires ?
        </div>
        <div className="boutonsContainer">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
              dispatch(setDetailsMariageField('formMariage', true));
            }}
          >
            Annuler
          </button>
          <button onMouseDown={(e) => {
            e.stopPropagation();
            dispatch(setDetailsMariageField('formAjoutNotaire', true));
            dispatch(setDetailsMariageField('formMariage', false));
            dispatch(setDetailsMariageField('confirmationAjout', false));
            dispatch(setDetailsMariageField('nom', truncateAndCapitalize(notaryName)));
          }}>
            Ok
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationAjout;




