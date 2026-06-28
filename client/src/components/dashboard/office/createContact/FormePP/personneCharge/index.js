import React, { useState, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  addToListe,
  prev,
  next,
  setPersonneChargeField,
  modifierPersonne,
  setFormType,
  deletePersonneCharge
} from '../../../../../../redux/slices/pchSlice';

import CloseButton from '../../../../../../assets/bouton-supprimer.svg';
import Fleche from '../../../../../../assets/fleche.svg';
import Suppr from '../../../../../../assets/supprPC.svg';

import "./styles.css";

// --- MODIFICATION : Import du nouveau formulaire générique ---
import PersonneChargeForm from './PersonneChargeForm';
// Les anciens imports sont supprimés


const CreatePersonneChargeModal = ({ onClose }) => {

  const dispatch = useDispatch();
  const modalContentRef = useRef(null);

  const {
    mode,
    isRightArrow,
    isLeftArrow,
    currentFormType,
  } = useSelector((state) => state.PchReducer);

  // Modale ouvrir fermer
  const handleCloseClick = () => {
    if (onClose) {
      onClose();
    }
  };

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (modalContentRef.current && !modalContentRef.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [onClose]);

  const handleTypeSelection = (type) => {
    dispatch(setFormType(type));
    if (mode === "ADD") {
      dispatch(setPersonneChargeField('type', type));
    } else {
      dispatch(modifierPersonne('type', type));
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    dispatch(addToListe());
  };

  const navigate = (direction) => {
    if (direction === 'prev') {
      dispatch(prev());
    } else if (direction === 'next') {
      dispatch(next());
    }
  };

  const handleDelete = () => {
    dispatch(deletePersonneCharge());
  };

  return (
    <div className="modal-overlay_PC">
      <div className="modal-content pos pch" ref={modalContentRef}>
        <button className="close-button" onClick={handleCloseClick}>
          <img src={CloseButton} alt="Fermer" className="close-btn" />
        </button>

        <div className="containerFormPC">
          <div className="nav_container">
            {isLeftArrow && (<div className='btnnav' onClick={() => navigate('prev')}>
              <img src={Fleche} alt="Fleche" className="flecheDR" />
            </div>)}
          </div>
          <div className="containerForm">
            {/* --- MODIFICATION : Remplacement des deux formulaires par un seul --- */}
            <div className="containerHeader">
              {mode === 'EDIT' && (
                <div className="right-div" onClick={handleDelete}>
                  <img src={Suppr} alt="Suppr" className="supprPC" />
                </div>
              )}
            </div>
            <PersonneChargeForm
              handleSubmit={handleSubmit}
              handleTypeSelection={handleTypeSelection}
              currentForm={currentFormType}
            />
            {/* --- FIN DE LA MODIFICATION --- */}
          </div>
          <div className="nav_container">
            {isRightArrow && (<div className='btnnav' onClick={() => navigate('next')}>
              <img src={Fleche} alt="Fleche" className="flecheG" />
            </div>)}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreatePersonneChargeModal;