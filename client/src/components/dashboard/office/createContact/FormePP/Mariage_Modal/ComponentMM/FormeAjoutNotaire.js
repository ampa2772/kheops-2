import React, { useState, useEffect, useRef } from 'react';
import CloseButton from '../../../../../../../assets/bouton-supprimer.svg';



import {
  updateNotaryName,
  setConfirmation,
  setDetailsMariageField,
  setContactFieldNotaireMariage,
} from '../../../../../../../redux/slices/mariageDetailsSlice';

import {
  createContact,
} from '../../../../../../../redux/slices/createContactSlice';

import { useDispatch, useSelector } from 'react-redux';

import hommeIMG from '../../../../../../../assets/homme.svg';
import femmeIMG from '../../../../../../../assets/femme.svg';

import '../styles.css';


import Select_commune_notaire from './selectCommuneNotaire';

const FormeAjoutNotaire = () => {
  const dispatch = useDispatch();

  const modalContentRef = useRef(null);



  const token = useSelector(state => state.login.token);
  const user = useSelector((state) => state.login.user);





  const mariageDetailsReducer = useSelector(state => state.mariageDetailsReducer);

  const notary = mariageDetailsReducer.notary;
  const errors = mariageDetailsReducer.validity.errors;
  const validEmail = mariageDetailsReducer.validity.validEmail;
  const submitAttempted = mariageDetailsReducer.validity.submitAttempted;

  const nbErrors = mariageDetailsReducer.validity.nbErrors;











  const handleChange = (event) => {
    const { name, value } = event.target;
    dispatch(setDetailsMariageField(name, value));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    dispatch(setDetailsMariageField('submitAttempted', true))

    let options = {};





    if (!validEmail || nbErrors > 0) {
      return
    }

   



    try {
      dispatch(createContact(notary, token, { contactType: "notaireMariage", userId: user._id }));


    } catch (error) {

    }
  };

  const handleCloseClick = () => {
    dispatch(setDetailsMariageField('formAjoutNotaire', false));
    dispatch(setDetailsMariageField('formMariage', true));
    dispatch(setDetailsMariageField('notaryName', ''));
    dispatch(setDetailsMariageField('nom', ''));
  };

  let buttonText = "Ajouter";
  let buttonClass = "";

  if (submitAttempted) {

    if (nbErrors === 1) {
      buttonText = "1 champ n'est pas rempli";
      buttonClass = "redBNT";
    } else if (nbErrors > 1) {
      buttonText = `${nbErrors} champs ne sont pas remplis`;
      buttonClass = "redBNT";
    } else if (!validEmail) {
      buttonText = "Email invalide";
      buttonClass = "redBNT";
    }
  } else {
    buttonText = "Créer un contact";
    buttonClass = "";
  }


  return (
    <div ref={modalContentRef} className="modal-content modal_mariage" onMouseDown={(e) => e.stopPropagation()}>

      <button className="close-button close_mariage"
        onClick={handleCloseClick}
      >
        <img src={CloseButton} alt="Fermer" className="close-btn" />
      </button>
      <div className="formeAjoutNotaire">


        <div className="titleAjoutNotaire">
          Ajouter notaire
        </div>
        <form className='formContainerAjoutNotaires'>

          <fieldset className="inputNotaireMariage">
            <div className="containerNomPrenomsNotaireMariage">
              <input
                type="text"
                name="nom"
                className={`inputAddContact ${submitAttempted && errors.nom ? 'error' : ''}`}
                onChange={handleChange}
                placeholder="Nom"
                value={notary.nom}
              />
              <input
                type="text"
                name="prenoms"
                className={`inputAddContact ${submitAttempted && errors.prenoms ? 'error' : ''}`}
                onChange={handleChange}
                placeholder="Prénoms"
                value={notary.prenoms}
              />
              <div className="genre_statusMat lesswith">
                <div className="select-genre genre_contact">
                  <div
                    className={`gender-option ${notary.genre === 'Masculin' ? 'selected' : ''}`}
                    onClick={() => {
                      dispatch(setDetailsMariageField('genre', 'Masculin'));
                    }}
                  >
                    <img className='gender_man' src={hommeIMG} alt="homme" />
                  </div>
                  <div
                    className={`gender-option ${notary.genre === 'Feminin' ? 'selected' : ''}`}
                    onClick={() => {
                      dispatch(setDetailsMariageField('genre', 'Feminin'));
                    }}
                  >
                    <img className='gender_man' src={femmeIMG} alt="homme" />
                  </div>
                </div>
              </div>
            </div>
          </fieldset>

          <fieldset className="inputNotaireMariage gap">
            <input
              type="text"
              name="adresse"
              className={`inputAddContact ${submitAttempted && errors.adresse ? 'error' : ''}`}
              onChange={handleChange}
              placeholder="Adresse"
              value={notary.adresse}
            />
            <div className="containerVilleCodePNotaireMariage">
              <Select_commune_notaire handleChange={handleChange} />
            </div>
            <div className="containerEmailTelNotaireMariage">
              <input
                type="email"
                name="email"
                className={`inputAddContact ${submitAttempted && errors.email ? 'error' : ''}`}
                onChange={handleChange}
                placeholder="Email"
                value={notary.email}
              />
              <input
                type="text"
                name="telephone"
                className={`inputAddContact ${submitAttempted && errors.telephone ? 'error' : ''}`}
                onChange={handleChange}
                placeholder="Téléphone"
                value={notary.telephone}
              />
            </div>
          </fieldset>
        </form>
        <button
          className={buttonClass}
          onClick={handleSubmit}
        >
          {buttonText}
        </button>
      </div>
    </div>
  )

}

export default FormeAjoutNotaire;