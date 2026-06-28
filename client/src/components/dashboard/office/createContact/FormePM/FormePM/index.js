import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import {
  createContactPM,
  updateContactPM,
  setPersonneMoraleField,
  resetPersonneMorale as resetFormPMP,
} from '../../../../../../redux/slices/personneMoraleSlice';

import {
  setShowPMPublique,
  setCreatePartieModal,
} from '../../../../../../redux/slices/layoutSlice';

import NafSecteurAct from './NafSecteurAct';
import FormeJuridiqueSoc from './FormeJuridiqueSoc';
import SelectVillePM from './SelectVillePM';

import { setShouldPopulateNameFields } from '../../../../../../redux/slices/partieSlice';
import { setModifyingContactId } from '../../../../../../redux/slices/layoutSlice';
import { addSelectedContact, updateSelectedContact } from '../../../../../../redux/slices/dossierInfoSlice';

const CreatePM = ({ fromCreatePartie, onContactCreatedSuccessfully }) => {
  const dispatch = useDispatch();
  const token = useSelector((state) => state.login.token);
  const user = useSelector((state) => state.login.user);
  const contactPM = useSelector((state) => state.personneMoraleReducer.personData);
  const errorCPM = useSelector((state) => state.personneMoraleReducer.formErrors);
  const ErrorsMails = useSelector((state) => state.personneMoraleReducer.ErrorsMails);
  const errorsCount = useSelector((state) => state.personneMoraleReducer.errorsCount);
  const showPMPublique = useSelector((state) => state.layoutFormContact.showPMPublique);

  const [submitAttempted, setSubmitAttempted] = useState(false);

  const fromCreatePartiesForLink = fromCreatePartie?.fromCreatePartiesForLink;
  const modificationInfo = fromCreatePartie?.modificationInfo;
  const fromCreatePartieForPartie = fromCreatePartie?.fromCreatePartieForPartie;

  // === CORRECTIF Session #004 ===
  // Ces flags doivent être extraits depuis les SOUS-OBJETS de fromCreatePartie,
  // pas depuis la racine (où ils n'existent pas).
  // Alignement sur le pattern de PersonneMoralePub/index.js (lignes 60-62).
  const isLinkedToSinglePartie = fromCreatePartiesForLink?.isLinkedToSinglePartie;
  const isTransformedToPartie = fromCreatePartieForPartie?.isTransformedToPartie;
  const isLinkedToDossier = fromCreatePartiesForLink?.isLinkedToDossier;

  const findContact = useSelector((state) => state.findContactReducer.contact);

  // === CORRECTIF Session #004 ===
  // isModificationMode est calculé dynamiquement via useEffect (comme PersonneMoralePub).
  // Il vérifie que le contexte de modification est bien actif ET que les données
  // du contact sont disponibles (via findContact OU presetContactData).
  const [isModificationMode, setIsModificationMode] = useState(false);

  useEffect(() => {
    const isLinkedToPartiesGroup = fromCreatePartiesForLink?.isLinkedToPartiesGroup;
    const hasPresetData = modificationInfo?.presetContactData;

    if (
      (isLinkedToSinglePartie || isTransformedToPartie || isLinkedToDossier || isLinkedToPartiesGroup) &&
      modificationInfo?.isModification &&
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
    fromCreatePartiesForLink?.isLinkedToPartiesGroup,
    modificationInfo?.isModification,
    modificationInfo?.presetContactData,
    findContact,
  ]);

  const shouldPopulateNameFields = useSelector(
    (state) => state.partieData.shouldPopulateNameFields
  );

  const hasErrors = Object.values(errorCPM).some((value) => value === true) ||
    ErrorsMails.emailExistsError;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    let val = type === 'checkbox' ? checked : value;
    dispatch(setPersonneMoraleField(name, val));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Vérifications désactivées : pas de setSubmitAttempted, pas de if(!hasErrors)

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
      contact: contactPM,
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
      const action = updateContactPM(contactId, contactData, token, options);
      dispatch(action)
        .then((result) => {
          console.log('[CreatePM handleSubmit] updateContactPM résolu avec succès:', result?._id);
          dispatch(resetFormPMP());
          if (onContactCreatedSuccessfully) onContactCreatedSuccessfully();
          dispatch(setModifyingContactId(null));
        })
        .catch((error) => {
          console.error("[CreatePM handleSubmit] Erreur updateContactPM:", error);
        });
    } else {
      console.log('[CreatePM handleSubmit] Dispatch createContactPM...');
      const action = createContactPM(contactData, token);
      dispatch(action)
        .then((result) => {
          console.log('[CreatePM handleSubmit] createContactPM résolu avec succès:', result?._id);
          dispatch(resetFormPMP());
          if (onContactCreatedSuccessfully) onContactCreatedSuccessfully();
        })
        .catch((error) => {
          console.error("[CreatePM handleSubmit] Erreur createContactPM:", error);
        });
    }
  };

  const getButtonDisplay = () => {
    let buttonDisplay = {
      text: isModificationMode ? 'Modifier contact' : 'Créer un contact',
      className: '',
    };

    if (submitAttempted) {
      if (ErrorsMails.emailExistsError) {
        buttonDisplay.text = ErrorsMails.emailExistsError;
        buttonDisplay.className = 'redButton';
      } else if (errorsCount > 0) {
        buttonDisplay.text =
          errorsCount === 1
            ? "1 champ obligatoire n'est pas rempli"
            : `${errorsCount} champs obligatoires ne sont pas remplis`;
        buttonDisplay.className = 'redButton';
      } else if (ErrorsMails.emailEntrepriseError && contactPM.emailEntreprise) {
        buttonDisplay.text = 'E-mail entreprise invalide';
        buttonDisplay.className = 'redButton';
      }
    }
    return buttonDisplay;
  };

  const buttonDisplay = getButtonDisplay();

  const handlePrivateClick = () => {
    dispatch(setShowPMPublique(false));
  };

  const handlePublicClick = () => {
    dispatch(setShowPMPublique(true));
  };

  return (
    <>
      <div className="formPM-container">
        <>
          <form onSubmit={handleSubmit} className="formAddContact">
            <div className="containerFormPersonneMoral">
              <fieldset className="identity fieldPM">
                <legend className="legend-pm">Identification</legend>
                <div className="inputContainer">
                  <input
                    name="dateCreationEntreprise"
                    placeholder="Date de Création de l'Entreprise"
                    value={contactPM.dateCreationEntreprise}
                    onChange={handleChange}
                    type="date"
                    className={`inputAddContact`}
                  />
                  <input
                    name="raisonSociale"
                    placeholder="Raison Sociale"
                    value={contactPM.raisonSociale}
                    onChange={handleChange}
                    className={`inputAddContact ${errorCPM.raisonSociale && submitAttempted ? 'error' : ''
                      }`}
                  />
                  <input
                    name="siteWeb"
                    placeholder="Site Web Entreprise"
                    value={contactPM.siteWeb}
                    onChange={handleChange}
                    className="inputAddContact"
                  />
                </div>
              </fieldset>
              <fieldset className="identity fieldPM">
                <legend className="legend-pm">Coordonn&eacute;es</legend>
                <div className="inputContainer">
                  <input
                    name="adresseSiegeSocial"
                    placeholder="Adresse siège social de l'Entreprise"
                    value={contactPM.adresseSiegeSocial}
                    onChange={handleChange}
                    className={`inputAddContact ${errorCPM.adresseSiegeSocial && submitAttempted ? 'error' : ''
                      }`}
                  />
                </div>
                <SelectVillePM submitAttempted={submitAttempted} />
                <div className="inputContainer">
                  <input
                    name="telephoneEntreprise"
                    placeholder="Numéro de Téléphone de l'Entreprise"
                    value={contactPM.telephoneEntreprise}
                    onChange={handleChange}
                    className={`inputAddContact`}
                  />
                  <input
                    name="emailEntreprise"
                    placeholder="Adresse E-mail de l'Entreprise"
                    value={contactPM.emailEntreprise}
                    onChange={handleChange}
                    className={`inputAddContact ${(contactPM.emailEntreprise && ErrorsMails.emailEntrepriseError && submitAttempted) || (ErrorsMails.errorField === 'emailEntreprise') ? 'error' : ''
                      }`}
                  />
                </div>
              </fieldset>
              <fieldset className="identity fieldPM">
                <legend className="legend-pm">Informations l&eacute;gales</legend>
                <div className="inputContainer">
                  <input
                    name="siret"
                    placeholder="Numéro de SIRET ou SIREN"
                    value={contactPM.siret}
                    onChange={handleChange}
                    className={`inputAddContact ${errorCPM.siret && submitAttempted ? 'error' : ''
                      }`}
                  />
                  <FormeJuridiqueSoc submitAttempted={submitAttempted} />
                </div>
                <NafSecteurAct submitAttempted={submitAttempted} handleChange={handleChange} />
                <div className="inputContainer">
                  <input
                    name="tvaIntracommunautaire"
                    placeholder="N° de TVA Intracom"
                    value={contactPM.tvaIntracommunautaire}
                    onChange={handleChange}
                    className="inputAddContact"
                  />
                  <input
                    name="capitalSocial"
                    placeholder="Capital Social"
                    value={contactPM.capitalSocial}
                    onChange={handleChange}
                    className={`inputAddContact`}
                  />
                </div>
              </fieldset>

              {/* --- INTERLOCUTEUR PRINCIPAL --- */}
              <fieldset className="identity fieldPM">
                <legend className="legend-pm">Interlocuteur Principal</legend>
                <div className="inputContainer">
                  <input
                    name="interlocuteurNom"
                    placeholder="Nom"
                    value={contactPM.interlocuteurNom || ''}
                    onChange={handleChange}
                    className="inputAddContact"
                  />
                  <input
                    name="interlocuteurPrenom"
                    placeholder="Prénom"
                    value={contactPM.interlocuteurPrenom || ''}
                    onChange={handleChange}
                    className="inputAddContact"
                  />
                </div>
                <div className="inputContainer">
                  <input
                    name="interlocuteurFonction"
                    placeholder="Fonction (ex: Gérant, Président)"
                    value={contactPM.interlocuteurFonction || ''}
                    onChange={handleChange}
                    className="inputAddContact"
                  />
                  <input
                    name="interlocuteurEmail"
                    placeholder="Email Interlocuteur"
                    value={contactPM.interlocuteurEmail || ''}
                    onChange={handleChange}
                    className={`inputAddContact ${ErrorsMails.errorField === 'interlocuteurEmail' ? 'error' : ''}`}
                  />
                </div>
                <div className="inputContainer">
                  <input
                    name="interlocuteurTelephone"
                    placeholder="Téléphone Interlocuteur"
                    value={contactPM.interlocuteurTelephone || ''}
                    onChange={handleChange}
                    className="inputAddContact"
                  />
                </div>
              </fieldset>
              {/* ----------------------------------------------- */}

              <div className="containerBoutonPM">
                <button type="submit" className={`addcontact ${buttonDisplay.className}`}>
                  {buttonDisplay.text}
                </button>
              </div>
            </div>
          </form>
        </>
      </div>
    </>
  );
};

export default CreatePM;
