import React from 'react';
import CloseButton from '../../../../../../../assets/bouton-supprimer.svg';
import hommeIMG from '../../../../../../../assets/homme.svg';
import femmeIMG from '../../../../../../../assets/femme.svg';
import { useDispatch, useSelector } from 'react-redux';
import { setPersonneMoraleField } from '../../../../../../../redux/slices/personneMoraleSlice';

const ContactDirectModal = ({ onClose, fromCreatePartie }) => {
  const dispatch = useDispatch();
  const contactDirect = useSelector((state) => state.personneMoraleReducer.contactDirect);
  const { ErrorsMails } = useSelector((state) => state.personneMoraleReducer);

  const handleChange = (event) => {
    const { name, value } = event.target;
    dispatch(setPersonneMoraleField(name, value));
  };

  const { fromCreatePartiesForLink, modificationInfo } = fromCreatePartie;

  // Condition pour cacher le composant Select_type_contact
  const shouldHideSelectTypeContact =
    fromCreatePartiesForLink.isLinkedToSinglePartie && modificationInfo.isModification;

  const handleOverlayClick = () => {
    onClose();
  };

  const handleModalContentClick = (e) => {
    e.stopPropagation();
  };

  return (
    <div
      className={`${!shouldHideSelectTypeContact ? 'modal-overlay' : 'modal-overlay_link'
        }`}
      onClick={handleOverlayClick}
    >
      <div className="modal-content heigthAuto" onClick={handleModalContentClick}>
        <button className="close-button" onClick={handleOverlayClick}>
          <img src={CloseButton} alt="Fermer" className="close-btn" />
        </button>

        <div className="details">
          <div className="title_rep_leg">Contact Direct</div>
          <form className="form-modal">
            <fieldset className="identity fieldPM">
              <div className="inputContainer">
                <input
                  type="text"
                  name="nomCD"
                  placeholder="Nom"
                  value={contactDirect.nomCD}
                  onChange={handleChange}
                  className="inputAddContact"
                />
                <input
                  type="text"
                  name="prenomCD"
                  placeholder="Prénom"
                  value={contactDirect.prenomCD}
                  onChange={handleChange}
                  className="inputAddContact"
                />
                <div className="select-genre genre_rep_leg">
                  <div
                    className={`gender-option ${contactDirect.genreCD === 'Masculin' ? 'selected' : ''
                      }`}
                    onClick={() => dispatch(setPersonneMoraleField('genreCD', 'Masculin'))}
                  >
                    <img className="gender_manRL" src={hommeIMG} alt="Homme" />
                  </div>
                  <div
                    className={`gender-option ${contactDirect.genreCD === 'Feminin' ? 'selected' : ''
                      }`}
                    onClick={() => dispatch(setPersonneMoraleField('genreCD', 'Feminin'))}
                  >
                    <img className="gender_manRL" src={femmeIMG} alt="Femme" />
                  </div>
                </div>
              </div>
            </fieldset>
            <fieldset className="identity fieldPM">
              <div className="inputContainer">
                <input
                  type="email"
                  name="emailCD"
                  placeholder="Adresse E-mail"
                  value={contactDirect.emailCD}
                  onChange={handleChange}
                  className={`inputAddContact ${ErrorsMails.errorField === 'emailCD' ? 'error' : ''}`}
                />
                <input
                  type="tel"
                  name="telephoneCD"
                  placeholder="Téléphone"
                  value={contactDirect.telephoneCD}
                  onChange={handleChange}
                  className="inputAddContact"
                />
              </div>
            </fieldset>
            {/* <button type="submit" onClick={handleOverlayClick}>Enregistrer</button> */}
          </form>
        </div>
      </div>
    </div>
  );
};

export default ContactDirectModal;