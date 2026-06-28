// LinkedAvocatItem.js

import React, { useMemo } from 'react';
import { useDispatch } from 'react-redux';

/* ---------- actions "CREATE" (workflow création) ---------- */
import {
  toggleAvocatProperty as toggleAvocatPropertyCreate,
} from '../../../../../redux/slices/partieSlice';

/* ---------- actions "EDIT" (workflow modification) --------- */
import {
  toggleAvocatProperty as toggleAvocatPropertyEdit,
} from '../../../../../redux/slices/partieEditSlice';

import supprimerLogoPath       from '../../../../../assets/supprimer_responsable.svg';
import supprimerLogoPathNavy   from '../../../../../assets/supprimer_responsable_navy.svg';
import modifier                from '../../../../../assets/modifier.svg';
import modifier_navy           from '../../../../../assets/modifier_navy.svg';
import postulant               from '../../../../../assets/postulant.svg';

import Modal         from './Modal';
import CreateContact from '../../createContact';

import useLinkedItemActions from './useLinkedItemActions';
import { getInitials } from './fonctions';

/* ------------------------------------------------------------------ */
/* Composant                                                            */
/* ------------------------------------------------------------------ */
const LinkedAvocatItem = ({ avocat, modalData, handleSupprAvocatLinked, mode = 'create' }) => {
  const dispatch = useDispatch();

  // rc73 : choix de l'action basé sur le mode du dossier (prop explicite).
  // Avant : heuristique "présence de la partie dans partieEditData" qui se
  // trompait quand le slice EDIT contenait des résidus localStorage d'une
  // édition précédente impliquant le même contact (idPartie identique).
  const toggleAvocatProperty = mode === 'edit'
    ? toggleAvocatPropertyEdit
    : toggleAvocatPropertyCreate;

  /* Hook partagé pour le toggle initiales / options + modal modif */
  const {
    optionsRef,
    isOptionsOpen,
    handleOptionsClick,
    isModifierHovered,
    setIsModifierHovered,
    isSupprimerHovered,
    setIsSupprimerHovered,
    isModalOpen,
    handleModifierClick,
    handleCloseModal,
    dossierIdFromStore,
  } = useLinkedItemActions(avocat._id);

  /* ----- toggle propriétés ----- */
  const togglePlaidant = () => {
    dispatch(toggleAvocatProperty(modalData.idPartie, avocat._id, 'isPlaidant'));
  };

  const togglePostulant = () => {
    dispatch(toggleAvocatProperty(modalData.idPartie, avocat._id, 'isPostulant'));
  };

  /* ----- détection avocat-utilisateur de l'app (responsable du dossier) ----- */
  const isFromResponsable = avocat.fromResponsable;

  /* ----- nom affiché + initiales (rc71) ----- */
  const prenom = avocat.prenoms || avocat.prenomOfficeUser || '';
  const nom    = avocat.nom     || avocat.nomOfficeUser    || '';
  const initialsSource = `${prenom} ${nom}`.trim();
  const initials = getInitials(initialsSource);

  /* ----- fromCreatePartie (mémo) ----- */
  const fromCreatePartie = useMemo(
    () => ({
      mode: 'edit',
      fromCreatePartieForPartie: {
        isTransformedToPartie: false,
        typePartie           : null,
      },
      fromCreatePartiesForLink: {
        isLinkedToPartiesGroup: false,
        isLinkedToSinglePartie: true,
        isLinkedToDossier     : false,
        linkedPartieId        : modalData.idPartie,
        linkedGroupType       : null,
      },
      modificationInfo: {
        isModification : true,
        contactId      : avocat._id,
        linkedPartieId : modalData.idPartie,
        dossierParentId: dossierIdFromStore,
      },
    }),
    [avocat._id, modalData.idPartie, dossierIdFromStore]
  );

  /* ------------------------------------------------------------------ */
  /* RENDER                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <div className="linkedAvocat">
      <div className="identiteAvocat">
        Maître {prenom} {nom}
      </div>

      <div className="role">
        <div
          className={`plaidant ${avocat.isPlaidant ? 'selection' : ''}`}
          onClick={togglePlaidant}
          title={avocat.isPlaidant ? 'Avocat plaidant (cliquer pour retirer)' : 'Cliquer pour désigner avocat plaidant'}
          aria-label="Avocat plaidant"
        >
          {/* rc71 : SVG inline tri-couleur adaptatif.
              Sélectionné (fond gradient teal) → corps NOIR pour contraste.
              Non-sélectionné (fond sombre)     → corps GRIS BLEUTÉ pour visibilité.
              Tête et cravate toujours blanches. */}
          <svg
            viewBox="0 0 313.8 326.3"
            width="16"
            height="16"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            className="k-icon-sm k-plaidant-svg"
          >
            <circle cx="156.9" cy="80.6" r="80.6" fill="#ffffff" />
            <path
              d="M168.4,184.5l27.4,86.3-38.9,44-38.9-44,27.4-86.3C72.5,189.7,13.1,244,.2,314.5c-1.1,6.2,3.6,11.8,9.8,11.8h293.7c6.3,0,11-5.6,9.8-11.8-12.9-70.5-72.3-124.8-145.2-130h0Z"
              fill={avocat.isPlaidant ? '#000000' : '#94a3b8'}
            />
            <polygon
              points="145.4 184.5 118 270.8 156.9 314.8 195.8 270.8 168.4 184.5 145.4 184.5"
              fill="#ffffff"
              stroke="#000000"
              strokeMiterlimit="10"
            />
          </svg>
        </div>

        <div
          className={`postulant ${avocat.isPostulant ? 'selection' : ''}`}
          onClick={togglePostulant}
          title={avocat.isPostulant ? 'Avocat postulant (cliquer pour retirer)' : 'Cliquer pour désigner avocat postulant'}
          aria-label="Avocat postulant"
        >
          <img src={postulant} alt="Postulant" className="k-icon-sm" />
        </div>

        {/* rc71 : avocat-utilisateur (fromResponsable) → rien à droite.
            Sinon → initiales par défaut, toggle vers modif/suppr au clic. */}
        {!isFromResponsable && (
          <div
            className="OptionsLinkedAvocat"
            onClick={handleOptionsClick}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {!isOptionsOpen ? (
              <div
                className="initials-icon_linkedContact initials-icon_linkedAvocat"
                title="Voir options"
              >
                {initials}
              </div>
            ) : (
              <div
                className="modif-suppr-options"
                ref={optionsRef}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="modifLinkContact linkedAv"
                  onClick={handleModifierClick}
                  onMouseEnter={() => setIsModifierHovered(true)}
                  onMouseLeave={() => setIsModifierHovered(false)}
                  title="Modifier l'avocat"
                >
                  <img
                    src={!isModifierHovered ? modifier_navy : modifier}
                    alt="Modifier"
                    className="k-icon-sm"
                  />
                </div>

                <div
                  className="deleteLinkContact linkedAv"
                  onClick={() => handleSupprAvocatLinked(avocat._id)}
                  onMouseEnter={() => setIsSupprimerHovered(true)}
                  onMouseLeave={() => setIsSupprimerHovered(false)}
                  title="Retirer l'avocat de la partie"
                >
                  <img
                    src={!isSupprimerHovered ? supprimerLogoPathNavy : supprimerLogoPath}
                    alt="Supprimer"
                    className="k-icon-sm"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* -------- Modal de modification -------- */}
      <Modal
        isOpen   ={isModalOpen}
        onClose  ={handleCloseModal}
        fromModif={true}
      >
        <CreateContact fromCreatePartie={fromCreatePartie} />
      </Modal>
    </div>
  );
};

export default LinkedAvocatItem;
