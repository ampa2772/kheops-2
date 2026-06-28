import React from 'react';
import CloseButton from '../../../../../../../assets/bouton-supprimer.svg';
import hommeIMG from '../../../../../../../assets/homme.svg';
import femmeIMG from '../../../../../../../assets/femme.svg';
import { useDispatch, useSelector } from 'react-redux';

import { setPersonneMoraleField } from '../../../../../../../redux/slices/personneMoraleSlice';

const RepresentantLegalModal = ({ onClose, fromCreatePartie }) => {
  const dispatch = useDispatch();
  const ReprLeg = useSelector(state => state.personneMoraleReducer.representantLegal);
  const { ErrorsMails } = useSelector(state => state.personneMoraleReducer);

  const { fromCreatePartiesForLink, modificationInfo } = fromCreatePartie;

  const handleOverlayClick = () => {
    onClose();
  };

  // Condition pour cacher le composant Select_type_contact
  const shouldHideSelectTypeContact =
    fromCreatePartiesForLink.isLinkedToSinglePartie && modificationInfo.isModification;

  const handleChange = (event) => {
    const { name, value } = event.target;
    dispatch(setPersonneMoraleField(name, value));
  };

  // Ajout de cette fonction pour empêcher la propagation de l'événement
  const handleModalContentClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div
      className={`${
        !shouldHideSelectTypeContact ? 'modal-overlay' : 'modal-overlay_link'
      }`}
      onClick={handleOverlayClick}
    >
      <div className="modal-content heigthAuto" onClick={handleModalContentClick}>
        <button className="close-button" onClick={onClose}>
          <img src={CloseButton} alt="Fermer" className="close-btn" />
        </button>

        <div className="details">
          <div className='title_rep_leg'>Représentant légal</div>
          <form className="form-modal">
            <fieldset className="identity fieldPM">
              <div className="inputContainer">
                <input
                  type="text"
                  name="nomRL"
                  placeholder="Nom"
                  value={ReprLeg.nomRL}
                  onChange={handleChange}
                  className="inputAddContact"
                />
                <input
                  type="text"
                  name="prenomRL"
                  placeholder="Prénom"
                  value={ReprLeg.prenomRL}
                  onChange={handleChange}
                  className="inputAddContact"
                />
                <div className="select-genre genre_rep_leg">
                  <div
                    className={`gender-option ${ReprLeg.genreRL === 'Masculin' ? 'selected' : ''}`}
                    onClick={() => dispatch(setPersonneMoraleField('genreRL', 'Masculin'))}
                  >
                    <img className='gender_manRL' src={hommeIMG} alt="Homme" />
                  </div>
                  <div
                    className={`gender-option ${ReprLeg.genreRL === 'Feminin' ? 'selected' : ''}`}
                    onClick={() => dispatch(setPersonneMoraleField('genreRL', 'Feminin'))}
                  >
                    <img className='gender_manRL' src={femmeIMG} alt="Femme" />
                  </div>
                </div>
              </div>
            </fieldset>
            <fieldset className="identity fieldPM">
              <div className="inputContainer">
                <input
                  type="email"
                  name="emailRL"
                  placeholder="Adresse E-mail"
                  value={ReprLeg.emailRL}
                  onChange={handleChange}
                  className={`inputAddContact ${ErrorsMails.errorField === 'emailRL' ? 'error' : ''}`}
                />
                <input
                  type="tel"
                  name="telephoneRL"
                  placeholder="Téléphone"
                  value={ReprLeg.telephoneRL}
                  onChange={handleChange}
                  className="inputAddContact"
                />
              </div>
            </fieldset>
            {/* Ajoutez d'autres champs si nécessaire */}
            {/* <button type="submit">Enregistrer</button> */}
          </form>
        </div>
      </div>
    </div>
  );
};

export default RepresentantLegalModal;