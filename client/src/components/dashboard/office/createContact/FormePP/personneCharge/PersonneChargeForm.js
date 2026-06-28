import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  setPersonneChargeField,
  modifierPersonne,
} from '../../../../../../redux/slices/pchSlice';

import "./styles.css";

import Ville from './PersonneChargeVille';
import VilleNaissance from './PersonneChargeVilleNaissance';
import Nationality from './Nationality';
import PaysdeNaissance from './PaysdeNaissance';
import Profession from './Profession';
import MaritalStatus from './MaritalStatus';
import Genre from './Genre';

/**
 * Normalise une valeur de date au format YYYY-MM-DD attendu par <input type="date">.
 *
 * Pourquoi : le backend renvoie les dates au format ISO complet
 *   "2010-05-15T00:00:00.000Z"
 * que l'input HTML type="date" rejette silencieusement → affichage vide.
 *
 * Le helper accepte :
 *  - Date JavaScript
 *  - Chaîne ISO complète ("2010-05-15T00:00:00.000Z")
 *  - Chaîne déjà au format court ("2010-05-15") → renvoyée telle quelle
 *  - null / undefined / "" / valeur invalide → "" (input vide propre)
 *
 * S27 hotfix bug P3 : sans cette normalisation, le rechargement d'une fiche
 * personne à charge en mode édition affichait la date comme effacée, ce qui
 * provoquait des sauvegardes accidentelles à vide.
 */
const formatDateForInput = (dateValue) => {
  if (!dateValue) return '';
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return dateValue;
  }
  const d = new Date(dateValue);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
};

const PersonneChargeForm = ({
  handleSubmit,
  handleTypeSelection,
  currentForm,
}) => {
  const dispatch = useDispatch();

  // Sélection de tous les états nécessaires depuis Redux
  const {
    mode,
    personne,
    errors,
    emailValid,
    errorCount,
    submitAttempted,
    currentPersonne,
    currentErrors,
    currentEmailValid,
    currentCountErrors,
  } = useSelector((state) => state.PchReducer);

  const isEditMode = mode === 'EDIT';

  const formatNumeroSecu = (num) => {
    const formattedNum = num.replace(/\D/g, '').split('').map((digit, index) => {
      if (index === 0 || index === 2 || index === 4 || index === 6 || index === 9 || index === 12) {
        return digit + ' ';
      }
      return digit;
    }).join('');
    return formattedNum.trim();
  };

  const formatTelephone = (num) => {
    const formattedNum = num.replace(/\D/g, '').split('').map((digit, index) => {
      if (index % 2 === 1) {
        return digit + ' ';
      }
      return digit;
    }).join('');
    return formattedNum.trim();
  };

  // Sélectionne les données à afficher (soit pour la création, soit pour l'édition)
  const data = isEditMode ? currentPersonne : personne;

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    let formattedValue = value;

    if (name === 'numeroSecu') {
      formattedValue = formatNumeroSecu(value);
    }
    if (name === 'telephone') {
      formattedValue = formatTelephone(value);
    }

    if (isEditMode) {
      dispatch(modifierPersonne({ propriete: name, valeur: formattedValue }));
    } else {
      dispatch(setPersonneChargeField({ field: name, value: formattedValue }));
    }
  };

  // Logique d'affichage du bouton — validation minimale nom/prénom
  let buttonClass = "";
  let buttonText = isEditMode ? "" : "Ajouter";

  if (!isEditMode && submitAttempted) {
    const hasNomOuPrenom = (data?.nom && data.nom.trim() !== '') || (data?.prenoms && data.prenoms.trim() !== '');
    if (!hasNomOuPrenom) {
      buttonClass = "redButton";
      buttonText = "Nom ou prénom requis";
    }
  }
  const formErrors = isEditMode ? currentErrors : errors;
  const formEmailValid = isEditMode ? currentEmailValid : emailValid;
  const formSubmitAttempted = isEditMode ? true : submitAttempted; // En mode édition, on considère toujours les erreurs comme visibles

  return (
    <>
      <div className="choixPersonneCharge">
        <div className={`enfant ${currentForm === 'enfant' ? 'typeSelected' : ''}`} onClick={() => handleTypeSelection('enfant')}>Enfant</div>
        <span className="pch-separator">/</span>
        <div className={`adulte ${currentForm === 'adulte' ? 'typeSelected' : ''}`} onClick={() => handleTypeSelection('adulte')}>Adulte</div>
      </div>
      <div className="centered-content formPC">
        <div className='contenair-formulaires'>
          {currentForm === 'enfant' && (
            <div className="formulaireEnfant">
              <form onSubmit={handleSubmit}>
                <fieldset className="pch-section">
                  <legend>Identit&eacute;</legend>
                  <div className="container-input-personneCharge">
                    <input name="nom" type="text" placeholder="Nom" value={data?.nom || ''} onChange={handleInputChange} />
                    <input name="prenoms" type="text" placeholder="Prénoms" value={data?.prenoms || ''} onChange={handleInputChange} />
                  </div>
                  <div className="container-input-personneCharge">
                    <div className="select-genre genre_PersonneCharge">
                      <div className="genre_PersonnCharge_Option_Container"><div className="label_genre_PersonneCharge">Genre:</div><Genre /></div>
                    </div>
                    <Nationality submitAttempted={false} />
                  </div>
                </fieldset>

                <fieldset className="pch-section">
                  <legend>Coordonn&eacute;es</legend>
                  <input name="adresse" className="inputAdressePC" type="text" placeholder="Adresse" value={data?.adresse || ''} onChange={handleInputChange} />
                  <Ville submitAttempted={false} />
                </fieldset>

                <fieldset className="pch-section">
                  <legend>Naissance</legend>
                  <div className="container-input-personneCharge">
                    <input name="dateNaissance" type="date" placeholder="Date de naissance" value={formatDateForInput(data?.dateNaissance)} onChange={handleInputChange} />
                    <PaysdeNaissance submitAttempted={false} />
                  </div>
                  <VilleNaissance submitAttempted={false} />
                </fieldset>

                {!isEditMode && (
                  <button type="submit" className={buttonClass}>{buttonText}</button>
                )}
              </form>
            </div>
          )}
          {currentForm === 'adulte' && (
            <div className="formulaireAdulte">
              <form onSubmit={handleSubmit}>
                <fieldset className="pch-section">
                  <legend>Identit&eacute;</legend>
                  <div className="container-input-personneCharge">
                    <input name="nom" type="text" placeholder="Nom" value={data?.nom || ''} onChange={handleInputChange} />
                    <input name="prenoms" type="text" placeholder="Prénoms" value={data?.prenoms || ''} onChange={handleInputChange} />
                  </div>
                  <div className="pch-row-triple">
                    <div className="select-genre genre_PersonneCharge"><div className="genre_PersonnCharge_Option_Container"><Genre /><MaritalStatus /></div></div>
                    <Nationality submitAttempted={false} />
                  </div>
                </fieldset>

                <fieldset className="pch-section">
                  <legend>Professionnel</legend>
                  <div className="container-input-personneCharge">
                    <Profession submitAttempted={false} />
                    <input name="numeroSecu" className="Code_postalPC" type="text" placeholder="N° Sécurité sociale" value={data?.numeroSecu || ''} onChange={handleInputChange} />
                  </div>
                </fieldset>

                <fieldset className="pch-section">
                  <legend>Coordonn&eacute;es</legend>
                  <input name="adresse" className="inputAdressePC" type="text" placeholder="Adresse" value={data?.adresse || ''} onChange={handleInputChange} />
                  <Ville submitAttempted={false} />
                  <div className="container-input-personneCharge">
                    <input name="email" type="email" placeholder="Email" value={data?.email || ''} onChange={handleInputChange} />
                    <input name="telephone" type="tel" placeholder="Téléphone" value={data?.telephone || ''} onChange={handleInputChange} />
                  </div>
                </fieldset>

                <fieldset className="pch-section">
                  <legend>Naissance</legend>
                  <div className="container-input-personneCharge">
                    <input name="dateNaissance" type="date" placeholder="Date de naissance" value={formatDateForInput(data?.dateNaissance)} onChange={handleInputChange} />
                    <PaysdeNaissance submitAttempted={false} />
                  </div>
                  <VilleNaissance submitAttempted={false} />
                </fieldset>

                {!isEditMode && (
                  <button type="submit" className={buttonClass}>{buttonText}</button>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default PersonneChargeForm;