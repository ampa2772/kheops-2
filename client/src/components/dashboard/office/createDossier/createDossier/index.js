// client/src/components/dashboard/office/createDossier/createDossier/index.js

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
// Nouveau code
import { toggleAddResponsibleMode, toggleSupprRespMode } from '../../../../../redux/slices/layoutSlice';
import {
  setNomDossier,
  setDateCreationDossier,
  setResponsables,
  setSelectedTribunalAffaire,
  setDescriptionDossier, // Assurez-vous que cet import est bien là
  initializeResponsablesForEdit,
  addResponsibleToEditSession,
  removeResponsibleFromEditSession,
  setNomDossierForEdit,
  addSelectedContact,
} from '../../../../../redux/slices/dossierInfoSlice';
import apiClient from '../../../../../services/apiClient';
import ajouterLogoPath from '../../../../../assets/ajouter_responsable.svg';

import supprimerLogoPath from '../../../../../assets/supprimer_responsable.svg';
import './styles.css';

import DescriptionModal from './DescriptionModal';
import TypeDossierModal from './TypeDossierModal';

// Accessibilite - voix synthetique
import HoverToSpeak from '../../../../common/HoverToSpeak';
import { speak, stopSpeaking } from '../../../../../services/speechService';

// Nouveau code

const CreateDossierform = ({
  mode = "create",
  presetDossier = null,
  onClose = () => { },
  onNomDossierManuallyEdited, // Pour le mode "create"
  onNomDossierManuallyEditedInEditMode, // NOUVELLE PROP pour le mode "edit"
  handleNav, // ACCEPTER LA NOUVELLE PROP
}) => {
  // Nouveau code
  const navigate = useNavigate(); // Peut toujours être utile pour d'autres navigations directes si nécessaire
  const dispatch = useDispatch();

  const dossierInfosFromStore = useSelector((state) => state.dossierInfos);
  // AJOUT: Sélectionner le dossier courant pour le mode édition
  const currentDossierFromStore = useSelector((state) => state.currentDossier.dossier);
  const isAddResponsibleModeFromStore = useSelector((state) => state.layout.isAddResponsibleMode);
  const isSpeechEnabled = useSelector((state) => state.login.user?.isSpeechEnabled || false);



  // Nouveau code
  // getInitialFormState n'est plus nécessaire si nous lisons directement depuis Redux.
  // Si vous avez besoin d'un état local pour des modifications temporaires non dispatchées,
  // vous pourriez le garder, mais pour l'affichage principal, Redux sera la source.
  // const getInitialFormState = useCallback(() => { ... }, []);

  // Supprimer l'état local `formState` ou le rendre moins central si Redux gère l'affichage.
  // const [formState, setFormState] = useState(() => getInitialFormState());
  // const prevPresetDossierIdRef = useRef(null);

  // Nouveau code
  // Nouveau code


  // Nouveau code
  // Nouveau code
  // L'état local `formState` n'est plus utilisé pour stocker les données principales du dossier (nom, description, etc.)
  // car celles-ci sont lues directement depuis Redux (`dossierInfosFromStore.dossierData`).
  // Il pourrait être réintroduit pour des besoins très spécifiques et locaux, mais pour l'instant, on s'en passe.

  // Nouveau code
  // Ce useEffect n'est plus nécessaire si `formState` n'est pas utilisé pour l'initialisation.
  // L'initialisation des responsables et autres données du dossier est gérée par `CreateDossier/index.js` (parent)
  // via l'action `initializeDossierInfosForEdit`.
  useEffect(() => {
    if (mode === "edit") {
      if (presetDossier) {
        // Les responsables sont initialisés dans `dossierInfosFromStore.dossierData.responsables`
        // par le `useEffect` dans `CreateDossier/index.js` qui dispatche `initializeDossierInfosForEdit`.
      }
    }
  }, [mode, presetDossier, dispatch]); // Garder les dépendances pour réagir si `mode` ou `presetDossier` changent.



  // Ce useEffect N'EST PLUS NÉCESSAIRE car getInitialFormState gère déjà la lecture depuis dossierInfosFromStore.dossierData
  // et le useEffect ci-dessus appelle setFormState(getInitialFormState()) lorsque dossierInfosFromStore.dossierData change (via la dépendance de getInitialFormState).
  /*
  useEffect(() => {
    if (mode === "create") {
      const {
        nom_dossier: nomDossierStore,
        description_dossier: descriptionDossierStore,
        selectedTribunalAffaire: selectedTribunalAffaireStore
      } = dossierInfosFromStore.dossierData || {};
  
      if (
        (nomDossierStore !== undefined && formState.nom_dossier !== nomDossierStore) ||
        (descriptionDossierStore !== undefined && formState.description_dossier !== descriptionDossierStore) ||
        (selectedTribunalAffaireStore !== undefined && formState.selectedTribunalAffaire !== selectedTribunalAffaireStore)
      ) {
        setFormState(prevState => ({
          ...prevState,
          nom_dossier: nomDossierStore !== undefined ? nomDossierStore : prevState.nom_dossier,
          description_dossier: descriptionDossierStore !== undefined ? descriptionDossierStore : prevState.description_dossier,
          selectedTribunalAffaire: selectedTribunalAffaireStore !== undefined ? selectedTribunalAffaireStore : prevState.selectedTribunalAffaire,
        }));
      }
    }
  }, [
    mode,
    dossierInfosFromStore.dossierData?.nom_dossier,
    dossierInfosFromStore.dossierData?.description_dossier,
    dossierInfosFromStore.dossierData?.selectedTribunalAffaire,
    formState.nom_dossier, 
    formState.description_dossier,
    formState.selectedTribunalAffaire
  ]);
  */



  // Nouveau code
  // Lire directement depuis le store Redux pour les responsables.
  const displayedResponsables = dossierInfosFromStore.dossierData?.responsables || [];

  // Nouveau code

  // Nouveau code
  // Nouveau code
  // Les données affichées proviennent directement de dossierInfosFromStore.dossierData.
  // L'action `initializeDossierInfosForEdit` dans le parent (`CreateDossier/index.js`)
  // est responsable de peupler correctement `dossierInfosFromStore.dossierData` à partir de `presetDossier`.
  const dossierDataForDisplay = {
    nom_dossier: dossierInfosFromStore.dossierData?.nom_dossier || '',
    description_dossier: dossierInfosFromStore.dossierData?.description_dossier || '',
    selectedTribunalAffaire: dossierInfosFromStore.dossierData?.selectedTribunalAffaire || null,
    responsables: dossierInfosFromStore.dossierData?.responsables || [], // Lecture directe ici pour les responsables
    _id: mode === "edit" && presetDossier ? presetDossier._id : null,
    reference: mode === "edit" && presetDossier ? presetDossier.reference : null,
  };

  const officeUsers = useSelector((state) => state.officeUser.officeUsers);

  const isToggleSupprRespMode = useSelector((state) => state.layout.isToggleSupprRespMode);
  const partiesPourCreate = useSelector((state) => state.partieData.parties);
  const partiesPourEdit = useSelector((state) => state.partieEditData.parties);
  const parties = mode === "edit" ? partiesPourEdit : partiesPourCreate;

  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [showTypeDossierModal, setShowTypeDossierModal] = useState(false);
  // const [userHasModified, setUserHasModified] = useState(false); // ÉTAT SUPPRIMÉ
  const listOfficeUserFormRef = useRef();


  const handleContainerClick = useCallback((responsableId) => {
    if (isToggleSupprRespMode === responsableId) {
      dispatch(toggleSupprRespMode(null));
    }
  }, [dispatch, isToggleSupprRespMode]);


  const handleClickOutside = useCallback((event) => {
    if (
      listOfficeUserFormRef.current &&
      !listOfficeUserFormRef.current.contains(event.target) &&
      isAddResponsibleModeFromStore
    ) {
      dispatch(toggleAddResponsibleMode());
    }
  }, [isAddResponsibleModeFromStore, dispatch]);

  useEffect(() => {
    if (isAddResponsibleModeFromStore) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isAddResponsibleModeFromStore, handleClickOutside]);

  useEffect(() => {
    if (mode === "create") {
      const isoDateString = new Date().toISOString();
      dispatch(setDateCreationDossier(isoDateString));
    }
  }, [dispatch, mode]);

  const handleAddResponsibleClick = () => {
    dispatch(toggleAddResponsibleMode());
  };

  // Nouveau code
  // Nouveau code
  const handleOfficeUserClick = (officeUser) => {
    if (mode === "edit") {
      dispatch(addResponsibleToEditSession(officeUser)); // Géré par dossierInfoReducer
    } else { // mode "create"
      // En mode création, on met à jour directement le store Redux
      // car `displayedResponsables` lit déjà depuis `dossierInfosFromStore.dossierData.responsables`
      const currentResponsablesFromStore = dossierInfosFromStore.dossierData?.responsables || [];
      if (!currentResponsablesFromStore.find(r => r._id === officeUser._id)) {
        dispatch(setResponsables([...currentResponsablesFromStore, officeUser]));
      }
    }
    if (isAddResponsibleModeFromStore) {
      dispatch(toggleAddResponsibleMode());
    }
  };

  const handleInitialsClick = (responsableId) => {
    if (mode === "edit") {
      dispatch(removeResponsibleFromEditSession(responsableId)); // Géré par dossierInfoReducer
    } else { // mode "create"
      const currentResponsablesFromStore = dossierInfosFromStore.dossierData?.responsables || [];
      const newResponsables = currentResponsablesFromStore.filter((r) => r._id !== responsableId);
      dispatch(setResponsables(newResponsables));
    }

    if (isToggleSupprRespMode === responsableId) {
      dispatch(toggleSupprRespMode(null));
    } else {
      dispatch(toggleSupprRespMode(responsableId));
    }
  };

  const handleAffaireSelect = async (objToLog) => {
    setShowTypeDossierModal(false);

    // Appeler le backend pour trouver ou créer le ContactPMPublique correspondant au tribunal
    try {
      const { data } = await apiClient.post('/api/folder/find-or-create-tribunal', {
        nom_etablissement: objToLog.nom_etablissement,
        numero_et_libelle_voie: objToLog.numero_et_libelle_voie,
        code_postal: objToLog.code_postal,
        ligne_d_acheminement: objToLog.ligne_d_acheminement,
        adresse_mail: objToLog.adresse_mail,
        nu_tel: objToLog.nu_tel,
      });
      if (data.contact) {
        // Stocker l'ID du ContactPMPublique dans l'objet tribunal
        objToLog.contactPMPubliqueId = data.contact._id;
        // Ajouter le tribunal comme contact direct du dossier
        dispatch(addSelectedContact({
          ...data.contact,
          isTribunal: true,
        }));
      }
    } catch (err) {
      console.error('[CreateDossierform] Erreur find-or-create-tribunal:', err);
    }

    // Met à jour Redux directement. L'affichage du tribunal lira depuis Redux.
    dispatch(setSelectedTribunalAffaire(objToLog));
  };

  // Nouveau code

  let displayTypeDossierText = 'Sélectionner le type de dossier';
  if (dossierDataForDisplay.selectedTribunalAffaire) { // Utilise dossierDataForDisplay
    const tribunal = dossierDataForDisplay.selectedTribunalAffaire; // Utilise dossierDataForDisplay
    const tribunalName = tribunal.nom_etablissement
      ? tribunal.nom_etablissement.charAt(0).toUpperCase() + tribunal.nom_etablissement.slice(1)
      : '';
    const affaireName = tribunal.affaire || '';
    const affaireAbreviation = tribunal.abreviation || '';
    const finalAffaireDisplay = affaireAbreviation ? affaireAbreviation : affaireName;
    displayTypeDossierText = `${tribunalName} - ${finalAffaireDisplay}`;
  }

  const pourParties = parties.filter((p) => p.typePartie === 'Pour');
  const contreParties = parties.filter((p) => p.typePartie === 'Contre');

  const cleanName = useCallback((fullName) => {
    if (!fullName) return '';
    const regex = /\sné(\(e\))?/i;
    const match = fullName.match(regex);
    if (match && match.index !== undefined) {
      return fullName.substring(0, match.index).trim();
    }
    return fullName.trim();
  }, []);

  // Nouveau code
  const buildNomDossier = useCallback(() => {
    if (pourParties.length === 0 || contreParties.length === 0) return '';
    const firstPourName = cleanName(pourParties[0]?.nomPartie);
    const firstContreName = cleanName(contreParties[0]?.nomPartie);
    if (!firstPourName || !firstContreName) return '';

    let pourSegment = firstPourName;
    let contreSegment = firstContreName;

    if (pourParties.length > 1) pourSegment += ' et autres…';
    if (contreParties.length > 1) contreSegment += ' et autres…';

    return `${pourSegment} c/ ${contreSegment}`;
  }, [pourParties, contreParties, cleanName]);

  // Nouveau code
  // Sélectionner nom_dossier directement depuis Redux pour la comparaison
  const nomDossierFromRedux = useSelector((state) => state.dossierInfos.dossierData?.nom_dossier);

  // Aperçu texte brut de la description (le contenu est du HTML riche) :
  // sert au libellé du bouton "Description du dossier" quand une description existe.
  const descPlain = (dossierDataForDisplay.description_dossier || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').trim();

  return (
    <>
      <div className="textarea_container">
        <HoverToSpeak textToSpeak={`Type de dossier: ${displayTypeDossierText}. Cliquez pour choisir.`}>
          <div
            className={`select_type_dossier ${dossierDataForDisplay.selectedTribunalAffaire ? 'affaire-selected' : ''}`}
            onClick={() => setShowTypeDossierModal(true)}
          >
            <div className="show_select_option">{displayTypeDossierText}</div>
          </div>
        </HoverToSpeak>

        <input
          type="text"
          id="nom_dossier"
          name="nom_dossier"
          value={dossierDataForDisplay.nom_dossier} // Lecture depuis Redux via dossierDataForDisplay
          onChange={(e) => {
            const newValue = e.target.value;
            if (mode === "edit") {
              dispatch(setNomDossierForEdit(newValue));
              if (onNomDossierManuallyEditedInEditMode) {
                onNomDossierManuallyEditedInEditMode();
              }
            } else { // mode === "create"
              dispatch(setNomDossier(newValue));
              if (onNomDossierManuallyEdited) {
                onNomDossierManuallyEdited();
              }
            }
            // La mise à jour du formState local n'est plus critique si Redux est la source de vérité pour la soumission
          }}
          required
          placeholder="Nom du dossier"
          className="input_dossier"
          onMouseEnter={() => {
            if (isSpeechEnabled) {
              const val = dossierDataForDisplay.nom_dossier;
              speak(val ? `Nom du dossier: ${val}` : 'Champ Nom du dossier');
            }
          }}
          onMouseLeave={() => { if (isSpeechEnabled) stopSpeaking(); }}
        />

        <HoverToSpeak
          textToSpeak={descPlain
            ? `Description du dossier : ${descPlain.slice(0, 60)}. Cliquez pour la modifier.`
            : "Bouton Description du dossier. Cliquez pour saisir une description."}
        >
          <div
            role="button"
            tabIndex={0}
            className={`open_description_modal_button${descPlain ? ' has-description' : ''}`}
            onClick={() => setShowDescriptionModal(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowDescriptionModal(true); }}
          >
            {descPlain
              ? `Description : ${descPlain.slice(0, 60)}${descPlain.length > 60 ? '…' : ''}`
              : 'Description du dossier'}
          </div>
        </HoverToSpeak>
      </div>




      <div className="responsable-dossier">
        {isAddResponsibleModeFromStore ? (
          <div className="list-officeUser-form" ref={listOfficeUserFormRef}>
            <div className="list-officeUser-scroll">
              {officeUsers && officeUsers
                .filter((ou) => !(displayedResponsables || []).find((r) => r._id === ou._id)) // Utiliser displayedResponsables
                .map((ou) => (
                  <div key={ou._id} className="officeUser-dossier-form" onClick={() => handleOfficeUserClick(ou)}>
                    <div className="affiche_officeUser-form">
                      {`${ou.prenomOfficeUser} ${ou.nomOfficeUser} - ${ou.roleOfficeUser}`}
                    </div>
                    <div className="initials_officeUser-form">
                      {`${ou.prenomOfficeUser?.[0]?.toUpperCase() || ''}${ou.nomOfficeUser?.[0]?.toUpperCase() || ''}`}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <>
            <HoverToSpeak textToSpeak="Section Responsables du dossier">
              <div className="responsables-dossier-title">Responsables du dossier</div>
            </HoverToSpeak>
            <div className="responsables-dossier-liste">
              {(displayedResponsables || []).map((responsable) => ( // Utiliser displayedResponsables
                <HoverToSpeak
                  key={responsable._id}
                  textToSpeak={`Responsable: ${responsable.prenomOfficeUser} ${responsable.nomOfficeUser}, role ${responsable.roleOfficeUser}`}
                >
                  <div onClick={() => handleContainerClick(responsable._id)}>
                    <div className="affiche_responsable">
                      {`${responsable.prenomOfficeUser} ${responsable.nomOfficeUser} - ${responsable.roleOfficeUser}`}
                    </div>
                    <div
                      className={`${isToggleSupprRespMode === responsable._id ? 'inSuppr' : 'initials'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInitialsClick(responsable._id);
                      }}
                    >
                      {isToggleSupprRespMode === responsable._id ? (
                        <img src={supprimerLogoPath} alt="Supprimer" className="k-icon-sm" />
                      ) : (
                        `${responsable.prenomOfficeUser?.[0]?.toUpperCase() || ''}${responsable.nomOfficeUser?.[0]?.toUpperCase() || ''}`
                      )}
                    </div>
                  </div>
                </HoverToSpeak>
              ))}
            </div>
          </>
        )}

        <div className="container_add_responsable_button">
          {officeUsers && officeUsers.length > 0 &&
            (officeUsers.length > (displayedResponsables || []).length) && // Utiliser displayedResponsables
            <HoverToSpeak textToSpeak={isAddResponsibleModeFromStore ? 'Bouton Annuler l\'ajout de responsable' : 'Bouton Ajouter un responsable'}>
              <button type="button" onClick={handleAddResponsibleClick}>
                {isAddResponsibleModeFromStore ? 'Annuler' : 'Ajouter un responsable'}
                {!isAddResponsibleModeFromStore && <img src={ajouterLogoPath} alt="Ajouter" className="k-icon-sm" />}
              </button>
            </HoverToSpeak>
          }
        </div>
      </div>

      <div className="form_partie_container">
        <HoverToSpeak textToSpeak="Bouton Creer une partie">
          <button
            type="button"
            className="bouton_form_partie"
            onClick={() => {
              if (handleNav) {
                handleNav('step2');
              } else {
                // Fallback de sécurité, ne devrait pas être atteint si la prop est bien passée.
                // Ce fallback tente de deviner l'URL correcte en mode édition.
                console.warn("handleNav prop not provided to CreateDossierform. Falling back to direct navigation.");
                const targetPath = mode === 'edit' && presetDossier?._id
                  ? `/dashboard/editDossier/${presetDossier._id}/step2`
                  : '/dashboard/createDossier/step2';
                navigate(targetPath);
              }
            }}
          >
            Créer une partie <img src={ajouterLogoPath} alt="Ajouter" className="k-icon-sm" />
          </button>
        </HoverToSpeak>
      </div>


      {showDescriptionModal && (
        <DescriptionModal
          description={dossierDataForDisplay.description_dossier} // Lecture depuis Redux via dossierDataForDisplay
          onSave={(newDescription) => { // 'onSave' n'est pas une prop standard de DescriptionModal, la logique est dans le composant lui-même.
            // setDescriptionDossier est déjà dispatché par DescriptionModal
            setShowDescriptionModal(false);
          }}
          onClose={() => setShowDescriptionModal(false)}
        />
      )}
      {showTypeDossierModal && (
        <TypeDossierModal onClose={() => setShowTypeDossierModal(false)} onSelect={handleAffaireSelect} />
      )}
    </>
  );
};

export default CreateDossierform;
