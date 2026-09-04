// LinkedAvocatItem.js

import React, { useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';

/* ---------- actions "CREATE" (workflow création) ---------- */
import {
  toggleAvocatProperty as toggleAvocatPropertyCreate,
  syncPartieRelations as syncPartieRelationsCreate,
} from '../../../../../redux/slices/partieSlice';

/* ---------- actions "EDIT" (workflow modification) --------- */
import {
  toggleAvocatProperty as toggleAvocatPropertyEdit,
  syncPartieRelations as syncPartieRelationsEdit,
} from '../../../../../redux/slices/partieEditSlice';
import { extractPartyRelationsFromResponse } from './utils/partiesHelpers';

import supprimerLogoPath       from '../../../../../assets/supprimer_responsable.svg';
import supprimerLogoPathNavy   from '../../../../../assets/supprimer_responsable_navy.svg';
import modifier                from '../../../../../assets/modifier.svg';
import modifier_navy           from '../../../../../assets/modifier_navy.svg';
import postulant               from '../../../../../assets/postulant.svg';

import Modal         from './Modal';
import CreateContact from '../../createContact';

import useLinkedItemActions from './useLinkedItemActions';
import { getInitials } from './fonctions';
import { addLinkedContactToParty } from '../../../../../redux/slices/currentDossierSlice';
import { normalizeLawyerRoles } from '../../../../../utils/partyLinking';

/* ------------------------------------------------------------------ */
/* Composant                                                            */
/* ------------------------------------------------------------------ */
const LinkedAvocatItem = ({ avocat, modalData, handleSupprAvocatLinked, mode = 'create', groupContextType = null }) => {
  const dispatch = useDispatch();
  const [roleError, setRoleError] = useState('');
  const [roleStatus, setRoleStatus] = useState('');
  const [isSavingRole, setIsSavingRole] = useState(false);

  // rc73 : choix de l'action basé sur le mode du dossier (prop explicite).
  // Avant : heuristique "présence de la partie dans partieEditData" qui se
  // trompait quand le slice EDIT contenait des résidus localStorage d'une
  // édition précédente impliquant le même contact (idPartie identique).
  const toggleAvocatProperty = mode === 'edit'
    ? toggleAvocatPropertyEdit
    : toggleAvocatPropertyCreate;
  const syncPartieRelations = mode === 'edit'
    ? syncPartieRelationsEdit
    : syncPartieRelationsCreate;

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
  const updateRole = async (property) => {
    if (isSavingRole) return;
    if (!modalData?.idPartie) {
      setRoleError('Les rôles sont propres à chaque partie. Ouvrez une partie pour les modifier.');
      return;
    }
    const current = normalizeLawyerRoles(avocat);
    const next = { ...current, [property]: !current[property] };
    if (!next.isPlaidant && !next.isPostulant) {
      setRoleError('Un avocat lié doit conserver au moins un rôle.');
      return;
    }
    setRoleError('');
    setRoleStatus(mode === 'edit' ? 'Enregistrement du rôle en cours…' : 'Mise à jour du rôle…');
    // Instantané des rôles AVANT la bascule optimiste : en cas de refus
    // serveur, on restaure exactement cet état (un second toggle ne serait
    // pas l'inverse une fois la réconciliation des responsables appliquée).
    const previousAvocats = Array.isArray(modalData?.linkedAvocats)
      ? modalData.linkedAvocats.map((item) => ({ ...item }))
      : null;
    dispatch(toggleAvocatProperty(modalData.idPartie, avocat._id, property));
    if (mode === 'edit' && dossierIdFromStore) {
      setIsSavingRole(true);
      try {
        const data = await dispatch(addLinkedContactToParty(dossierIdFromStore, modalData.idPartie, {
          existingContactId: avocat._id,
          ...next,
          forceRoleUpdate: true,
        }));
        // Le serveur réconcilie les rôles (un seul responsable interne
        // postulant, retrait du postulant interne si un externe l'est…) :
        // l'affichage repart de ce qui est réellement persisté.
        const relations = extractPartyRelationsFromResponse(data, modalData.idPartie);
        if (relations) dispatch(syncPartieRelations(modalData.idPartie, relations));
        const saved = relations?.avocats.find((item) => String(item?._id) === String(avocat._id));
        const savedRoles = saved ? normalizeLawyerRoles(saved) : null;
        const adjusted = savedRoles
          && (savedRoles.isPlaidant !== next.isPlaidant || savedRoles.isPostulant !== next.isPostulant);
        setRoleStatus(adjusted
          ? 'Rôle enregistré puis ajusté : les responsables du cabinet restent plaidants et un seul est postulant (sauf postulant externe).'
          : 'Rôle enregistré.');
      } catch (error) {
        // Le reducer est optimiste : remettre l'état précédent si la sauvegarde
        // serveur échoue afin de ne jamais afficher un rôle non persisté.
        if (previousAvocats) dispatch(syncPartieRelations(modalData.idPartie, { avocats: previousAvocats }));
        else dispatch(toggleAvocatProperty(modalData.idPartie, avocat._id, property));
        setRoleStatus('');
        setRoleError(error?.response?.data?.message || 'Le rôle n’a pas pu être enregistré. Réessayez.');
      } finally {
        setIsSavingRole(false);
      }
    } else {
      setRoleStatus('Rôle mis à jour.');
    }
  };

  const togglePlaidant = () => updateRole('isPlaidant');
  const togglePostulant = () => updateRole('isPostulant');

  /* ----- détection avocat-utilisateur de l'app (responsable du dossier) ----- */
  const isFromResponsable = avocat.fromResponsable;

  /* ----- nom affiché + initiales (rc71) ----- */
  const prenom = avocat.prenoms || avocat.prenomOfficeUser || '';
  const nom    = avocat.nom     || avocat.nomOfficeUser    || '';
  const initialsSource = `${prenom} ${nom}`.trim();
  const initials = getInitials(initialsSource);
  const isGroupContext = !modalData?.idPartie;

  /* ----- fromCreatePartie (mémo) ----- */
  const fromCreatePartie = useMemo(
    () => ({
      mode,
      fromCreatePartieForPartie: {
        isTransformedToPartie: false,
        typePartie           : null,
      },
      fromCreatePartiesForLink: {
        isLinkedToPartiesGroup: !!groupContextType,
        isLinkedToSinglePartie: !groupContextType,
        isLinkedToDossier     : false,
        linkedPartieId        : groupContextType ? null : modalData.idPartie,
        linkedGroupType       : groupContextType,
      },
      modificationInfo: {
        isModification : true,
        contactId      : avocat._id,
        linkedPartieId : modalData.idPartie,
        dossierParentId: dossierIdFromStore,
      },
    }),
    [avocat._id, modalData.idPartie, dossierIdFromStore, mode, groupContextType]
  );

  /* ------------------------------------------------------------------ */
  /* RENDER                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <div className="linkedAvocat">
      <div className="identiteAvocat">
        Maître {prenom} {nom}
        <span className="k-linked-type-badge">Avocat</span>
      </div>

      <div className="role">
        {!isGroupContext && (
          <button
            type="button"
            className={`plaidant ${avocat.isPlaidant ? 'selection' : ''}`}
            onClick={togglePlaidant}
            title={avocat.isPlaidant ? 'Avocat plaidant (cliquer pour retirer)' : 'Cliquer pour désigner avocat plaidant'}
            aria-label={`${avocat.isPlaidant ? 'Retirer' : 'Ajouter'} le rôle plaidant à Maître ${prenom} ${nom}`}
            aria-pressed={avocat.isPlaidant === true}
            disabled={isSavingRole}
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
            <span className="k-lawyer-role-label">Plaidant</span>
          </button>
        )}

        {!isGroupContext && (
          <button
            type="button"
            className={`postulant ${avocat.isPostulant ? 'selection' : ''}`}
            onClick={togglePostulant}
            title={avocat.isPostulant ? 'Avocat postulant (cliquer pour retirer)' : 'Cliquer pour désigner avocat postulant'}
            aria-label={`${avocat.isPostulant ? 'Retirer' : 'Ajouter'} le rôle postulant à Maître ${prenom} ${nom}`}
            aria-pressed={avocat.isPostulant === true}
            disabled={isSavingRole}
          >
            <img src={postulant} alt="" className="k-icon-sm" aria-hidden="true" />
            <span className="k-lawyer-role-label">Postulant</span>
          </button>
        )}

        {!isGroupContext && !avocat.isPlaidant && !avocat.isPostulant && (
          <span className="k-lawyer-role-missing">Rôle à définir</span>
        )}
        {isGroupContext && (
          <span className="k-lawyer-role-context">Rôles propres à chaque partie</span>
        )}

        {/* rc71 : avocat-utilisateur (fromResponsable) → rien à droite.
            Sinon → initiales par défaut, toggle vers modif/suppr au clic. */}
        {!isFromResponsable && (
          <div
            className="OptionsLinkedAvocat"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {!isOptionsOpen ? (
              <button
                type="button"
                className="initials-icon_linkedContact initials-icon_linkedAvocat"
                title="Voir options"
                onClick={handleOptionsClick}
                aria-label={`Gérer Maître ${prenom} ${nom}`}
                aria-expanded={false}
              >
                {initials}
              </button>
            ) : (
              <div
                className="modif-suppr-options"
                ref={optionsRef}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="modifLinkContact linkedAv"
                  onClick={handleModifierClick}
                  onMouseEnter={() => setIsModifierHovered(true)}
                  onMouseLeave={() => setIsModifierHovered(false)}
                  title="Modifier l'avocat"
                  aria-label={`Modifier Maître ${prenom} ${nom}`}
                >
                  <img
                    src={!isModifierHovered ? modifier_navy : modifier}
                    alt="Modifier"
                    className="k-icon-sm"
                  />
                </button>

                <button
                  type="button"
                  className="deleteLinkContact linkedAv"
                  onClick={() => handleSupprAvocatLinked(avocat._id)}
                  onMouseEnter={() => setIsSupprimerHovered(true)}
                  onMouseLeave={() => setIsSupprimerHovered(false)}
                  title="Retirer l'avocat de la partie"
                  aria-label={`Retirer Maître ${prenom} ${nom}`}
                >
                  <img
                    src={!isSupprimerHovered ? supprimerLogoPathNavy : supprimerLogoPath}
                    alt="Supprimer"
                    className="k-icon-sm"
                  />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {roleError && <div className="k-lawyer-role-error" role="status">{roleError}</div>}
      {roleStatus && <div className="k-lawyer-role-status" role="status">{roleStatus}</div>}

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
