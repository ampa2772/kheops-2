import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import CloseButton from '../../../../../../../assets/bouton-supprimer.svg';

import {
  setDetailsMariageField,
} from '../../../../../../../redux/slices/mariageDetailsSlice';

import { useDispatch, useSelector } from 'react-redux';
import NotaireInputField from './NotaireInputField';
import '../styles.css';

const MariageDetailsModalForm = ({ shouldHideSelectTypeContact }) => {
  const dispatch = useDispatch();
  const modalContentRef = useRef(null);

  const handleChange = (event) => {
    const { name, value } = event.target;
    dispatch(setDetailsMariageField(name, value));

  };

  // const formContratMariage = useSelector(state => state.mariageDetailsReducer.affichagesComposants.formContratMariage);
  const mariageDetailsReducer = useSelector(state => state.mariageDetailsReducer);

  const detailsMariage = mariageDetailsReducer.detailsMariage;


  const contratMariageForm = mariageDetailsReducer.affichagesComposants.contratMariageForm;










  const handleSubmit = (data) => {
    // Implementation for form submit
  };


  const handleCloseClick = () => {
    dispatch(setDetailsMariageField('modaleMariage', false));
  }

  const toggleFormAndList = () => {
    if (contratMariageForm) {
      dispatch(setDetailsMariageField('contratMariageForm', false));
    } else {
      dispatch(setDetailsMariageField('contratMariageForm', true));
    }
  }




  return (

    <div ref={modalContentRef} className="modal-content modal_mariage" onMouseDown={(e) => e.stopPropagation()}>

      <button className="close-button close_mariage"
        onClick={handleCloseClick}
      >
        <img src={CloseButton} alt="Fermer" className="close-btn" />
      </button>

      <div className="details">
        <div className="formDetailMariage">
          <div className="details_mariage_title">
            Détails mariage
          </div>
          <form onSubmit={handleSubmit} className='form_mariage'>
            <fieldset className='date_lieu_mariage'>
              <div>
                <input
                  type="text"
                  id="marriageLocation"
                  name="marriageLocation"
                  placeholder="Lieu du mariage"
                  onChange={handleChange}
                  className='marriageLocation'
                  value={detailsMariage.marriageLocation}
                />

              </div>
              <div>
                <input
                  type="date"
                  id="marriageDate"
                  name="marriageDate"
                  placeholder="Date du mariage"
                  className='marriageDate'
                  onChange={handleChange}
                  value={detailsMariage.marriageDate}
                />
              </div>
            </fieldset>
            <fieldset className='regime_matrimonial'>
              <input
                type="text"
                id="regime_matrimonial"
                name="regime_matrimonial"
                placeholder="Régime matrimonal"
                className='marriageLocation marg_bot_none'
                onChange={handleChange}
                value={detailsMariage.regime_matrimonial}
              />
            </fieldset>
            <div className="container_contrat_de_mariage">
              <span className={`title_contrat ${!contratMariageForm ? 'isNotformCM' : ''}`}>
                <span className="button_contrat_de_mariage" onClick={toggleFormAndList}>
                  Contrat de mariage
                </span>
              </span>
              {contratMariageForm && (
               <fieldset className={`details_contrat_mariage ${shouldHideSelectTypeContact ? 'details_contrat_mariage_alt' : ''}`}>
                  <div>
                    <input
                      type="date"
                      id="contractDate"
                      name="contractDate"
                      className='marriageDate_contrat'
                      onChange={handleChange}
                      value={detailsMariage.contractDate}
                    />
                  </div>
                  <NotaireInputField />
                </fieldset>
              )}
            </div>
          </form>

        </div>
      </div>

    </div>

  );

}

export default MariageDetailsModalForm;
