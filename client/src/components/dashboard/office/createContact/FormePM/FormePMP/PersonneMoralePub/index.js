import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import hommeIMG from '../../../../../../../assets/homme.svg';
import femmeIMG from '../../../../../../../assets/femme.svg';

import {
  createContactPMPublique,
  updateContactPMPublique,
  setSubmitAttemptedPMP as setSubmitAttempted,
  setPersonneMoralePubliqueField,
} from '../../../../../../../redux/slices/contactPMPubliqueSlice';

import {
  setCreatePartieModal,
} from '../../../../../../../redux/slices/layoutSlice';

import SelectVillePMP from './SelectVillePMP';

import { setModifyingContactId } from '../../../../../../../redux/slices/layoutSlice';
import { addSelectedContact, updateSelectedContact } from '../../../../../../../redux/slices/dossierInfoSlice';

const PersonneMoralePub = ({ fromCreatePartie, onContactCreatedSuccessfully }) => {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.login.user);
  const token = useSelector((state) => state.login.token);
  const contactPMPubliqueReducer = useSelector(state => state.contactPMPubliqueReducer);

  const appellationCourrierAffichage = contactPMPubliqueReducer.validation.appellationCourrierAffichage;
  const personne = contactPMPubliqueReducer.personneMorale;
  const appellationCourrierGenre = contactPMPubliqueReducer.appellationCourrierGenre;

  const validateMail = contactPMPubliqueReducer.validation.validateMail;
  const validateContactMail = contactPMPubliqueReducer.validation.validateContactMail;

  const submitAttempted = contactPMPubliqueReducer.validation.submitAttempted;
  const errors = contactPMPubliqueReducer.validation.errors;
  const errorsCount = contactPMPubliqueReducer.validation.errorsCount;
  const { emailExistsError, errorField } = contactPMPubliqueReducer.validation; // NOUVEAU

  const fromCreatePartiesForLink = fromCreatePartie.fromCreatePartiesForLink;
  const modificationInfo = fromCreatePartie.modificationInfo;
  const fromCreatePartieForPartie = fromCreatePartie.fromCreatePartieForPartie;

  const findContact = useSelector(state => state.findContactReducer.contact);

  const searchTerm = useSelector((state) => state.searchTerm.searchTerm);
  const searchTermLinkPartie = useSelector((state) => state.searchTerm.searchTermLinkPartie);

  const termToUse = fromCreatePartiesForLink.isLinkedToSinglePartie
    ? searchTermLinkPartie
    : searchTerm;

  let denominationInitiale = personne.denomination;
  if ((fromCreatePartieForPartie.isTransformedToPartie || fromCreatePartiesForLink.isLinkedToSinglePartie) && termToUse) {
    denominationInitiale = termToUse || '';
  }

  // Synchroniser le search term avec le Redux store pour que la dénomination soit envoyée à l'API
  useEffect(() => {
    if ((fromCreatePartieForPartie.isTransformedToPartie || fromCreatePartiesForLink.isLinkedToSinglePartie) && termToUse && !personne.denomination) {
      dispatch(setPersonneMoralePubliqueField('denomination', termToUse));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [isModificationMode, setIsModificationMode] = useState(false);

  const isLinkedToSinglePartie = fromCreatePartiesForLink.isLinkedToSinglePartie;
  const isTransformedToPartie = fromCreatePartieForPartie.isTransformedToPartie;
  const isLinkedToDossier = fromCreatePartiesForLink.isLinkedToDossier;

  // Nouveau code
  useEffect(() => {
    // isLinkedToSinglePartie, isTransformedToPartie, isLinkedToDossier sont déjà définis plus haut.
    const isLinkedToPartiesGroup = fromCreatePartiesForLink.isLinkedToPartiesGroup;
    const hasPresetData = modificationInfo?.presetContactData;

    if (
      (isLinkedToSinglePartie || isTransformedToPartie || isLinkedToDossier || isLinkedToPartiesGroup) &&
      modificationInfo.isModification &&
      (findContact?.contact || findContact?.contactPM || findContact?.contactPMPublique || hasPresetData)
    ) {
      setIsModificationMode(true);
    } else {
      setIsModificationMode(false);
    }
  }, [
    isLinkedToSinglePartie,
    isTransformedToPartie,
    isLinkedToDossier,
    fromCreatePartiesForLink.isLinkedToPartiesGroup,
    modificationInfo.isModification,
    modificationInfo?.presetContactData,
    findContact
  ]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    dispatch(setPersonneMoralePubliqueField(name, value));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    // Vérifications désactivées : pas de submitAttempted, pas de return guards

    let modificationType = null;
    if (isModificationMode) {
      if (isLinkedToSinglePartie) {
        modificationType = 'contactLinkedToPartie';
      } else if (isTransformedToPartie) {
        modificationType = 'partieItself';
      } else if (isLinkedToDossier) {
        modificationType = 'contactLinkedToDossier';
      }
    }

    const contactData = {
      personneMorale: contactPMPubliqueReducer,
      user,
      fromCreatePartie,
    };

    const options = {
      userId: user._id,
      fromCreatePartie,
      modificationType,
    };

    if (isModificationMode) {
      const contactId = modificationInfo.contactId;
      const action = updateContactPMPublique(contactId, contactData, token, options);
      dispatch(action)
        .then(() => {
          if (onContactCreatedSuccessfully) onContactCreatedSuccessfully();
          dispatch(setModifyingContactId(null));
        })
        .catch((error) => {
          console.error('Échec de la mise à jour du contact PM Publique:', error);
        });
    } else {
      const action = createContactPMPublique(contactData, token);
      dispatch(action)
        .then(() => {
          if (onContactCreatedSuccessfully) onContactCreatedSuccessfully();
        })
        .catch((error) => {
          console.error('Échec de la création du contact PM Publique:', error);
        });
    }
  };

  function getButtonDisplay(validateMail, validateContactMail, errorsCount, submitAttempted, personne, emailExistsErrorMsg) {
    let buttonDisplay = { text: isModificationMode ? "Modifier contact" : "Créer un contact", className: "btnSubmitpAc" };

    if (submitAttempted) {
        if (emailExistsErrorMsg) {
            buttonDisplay.text = emailExistsErrorMsg;
            buttonDisplay.className = "btnSubmitpAc redButton";
        } else if (errorsCount > 0) {
            buttonDisplay.text = errorsCount === 1 ? "1 champ obligatoire n'est pas rempli" : `${errorsCount} champs obligatoires ne sont pas remplis`;
            buttonDisplay.className = "btnSubmitpAc redButton";
        } else if (!validateMail && !validateContactMail && personne.email && personne.contactEmail) {
            buttonDisplay.className = "btnSubmitpAc redButton";
            buttonDisplay.text = "Les 2 E-mails sont invalides";
        } else if (!validateContactMail && personne.contactEmail) {
            buttonDisplay.className = "btnSubmitpAc redButton";
            buttonDisplay.text = "L'E-mail de la personne à contacter est invalide";
        } else if (!validateMail && personne.email) {
            buttonDisplay.className = "btnSubmitpAc redButton";
            buttonDisplay.text = "L'E-mail de l'organisation est invalide";
        }
    }

    return buttonDisplay;
  }

  const buttonDisplay = getButtonDisplay(validateMail, validateContactMail, errorsCount, submitAttempted, personne, emailExistsError);

  return (
    <form className="formAddContact formPMP" onSubmit={handleSubmit}>
      <fieldset className="identity fieldPM">
        <legend className="legendePersPMP">D&eacute;nomination</legend>
        <input
          name="denomination"
          placeholder="Dénomination"
          value={denominationInitiale}
          onChange={handleChange}
          className={`inputAddContact ${(errors.denomination && submitAttempted) ? 'error' : ''}`}
        />
      </fieldset>
      <fieldset className="identity fieldPM gapPMP">
        <legend className="legendePersPMP">Adresse</legend>
        <input
          name="adresse"
          placeholder="Adresse"
          value={personne.adresse}
          onChange={handleChange}
          className={`inputAddContact ${(errors.adresse && submitAttempted) ? 'error' : ''}`}
        />
        <SelectVillePMP submitAttempted={submitAttempted} />
      </fieldset>
      <fieldset className="identity fieldPM">
        <legend className="legendePersPMP">Contact</legend>
        <div className="inputContainer">
          <input
            name="siteWeb"
            placeholder="Site Web"
            value={personne.siteWeb}
            onChange={handleChange}
            className="inputAddContact"
          />
          <input
            name="email"
            placeholder="Adresse E-mail"
            value={personne.email}
            onChange={handleChange}
            className={`inputAddContact ${((personne.email && !validateMail && submitAttempted) || (errorField === 'email')) ? 'error' : ''}`}
          />
        </div>
      </fieldset>
      <fieldset className="identity fieldPM pAcont gapPMP">
        <legend className='legendePersPMP'>Personne à contacter</legend>
        <div className="inputContainer">
          <input
            name="contactNom"
            placeholder="Nom"
            value={personne.contactNom}
            onChange={handleChange}
            className={`inputAddContact ${(errors.contactNom && submitAttempted) ? 'error' : ''}`}
          />
          <input
            name="contactPrenom"
            placeholder="Prénom"
            value={personne.contactPrenom}
            onChange={handleChange}
            className={`inputAddContact ${(errors.contactPrenom && submitAttempted) ? 'error' : ''}`}
          />
          <div className="select-genre genre_rep_leg">
            <div
              className={`gender-option ${personne.genre === 'Masculin' ? 'selected' : ''}`}
              onClick={() => dispatch(setPersonneMoralePubliqueField('genre', 'Masculin'))}
            >
              <img className='gender_manRL' src={hommeIMG} alt="Homme" />
            </div>
            <div
              className={`gender-option ${personne.genre === 'Feminin' ? 'selected' : ''}`}
              onClick={() => dispatch(setPersonneMoralePubliqueField('genre', 'Feminin'))}
            >
              <img className='gender_manRL' src={femmeIMG} alt="Femme" />
            </div>
          </div>
        </div>
        <div className="inputContainer">
          <input
            name="contactFonction"
            placeholder="Fonction"
            value={personne.contactFonction}
            onChange={handleChange}
            className="inputAddContact"
          />
          {appellationCourrierAffichage === 'Masculin' && (
            <input
              name="appellationCourrierMasculin"
              placeholder="Appellation courrier masculin"
              value={appellationCourrierGenre.appellationCourrierMasculin}
              onChange={handleChange}
              className={`inputAddContact ${(errors.appellationCourrier && submitAttempted) ? 'error' : ''}`}
            />
          )}
          {appellationCourrierAffichage === 'Feminin' && (
            <input
              name="appellationCourrierFeminin"
              placeholder="Appellation courrier féminin"
              value={appellationCourrierGenre.appellationCourrierFeminin}
              onChange={handleChange}
              className={`inputAddContact ${(errors.appellationCourrier && submitAttempted) ? 'error' : ''}`}
            />
          )}
        </div>
        <div className="inputContainer">
          <input
            name="contactTelephone"
            placeholder="Téléphone"
            value={personne.contactTelephone}
            onChange={handleChange}
            className={`inputAddContact ${(errors.contactTelephone && submitAttempted) ? 'error' : ''}`}
          />
          <input
            name="contactEmail"
            placeholder="E-mail"
            value={personne.contactEmail}
            onChange={handleChange}
            className={`inputAddContact ${((personne.contactEmail && !validateContactMail && submitAttempted) || (errorField === 'contactEmail')) ? 'error' : ''}`}
          />
        </div>
      </fieldset>
      <button type="submit" className={buttonDisplay.className}>
        {buttonDisplay.text}
      </button>
    </form>
  );
};

export default PersonneMoralePub;