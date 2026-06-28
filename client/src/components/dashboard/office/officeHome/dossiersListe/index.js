// client/src/components/dashboard/office/officeHome/dossiersListe/index.js

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

// ======= Import du hook useDispatch, useNavigate et de l'action setCurrentDossier =======
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { setCurrentDossier, deleteDossier } from "../../../../../redux/slices/currentDossierSlice";
import { fetchAgendaEvents, fetchTop25Tasks } from "../../../../../redux/slices/agendaSlice";
import { fetchLast25Dossiers } from "../../../../../redux/slices/dossierInfoSlice";
import HoverToSpeak from '../../../../common/HoverToSpeak';
import ConfirmDeleteDossierModal from './ConfirmDeleteDossierModal';
import EditDossierModal from '../../dossier/EditDossierModal';
import EditDossierDivorceCMModal from '../../../../divorceCM/EditDossierDivorceCMModal';
import { stopSpeaking } from '../../../../../services/speechService';
import './styles.css';

/**
 * Codes des juridictions francaises affichees sur les cartes dossier.
 *
 * Cle interne (value du selectedTribunalAffaire.type) :
 *   tgi   -> TJ    : Tribunal Judiciaire (ex-TGI, inclut le JAF)
 *   tco   -> TCO   : Tribunal de Commerce
 *   cph   -> CPH   : Conseil de Prud'hommes
 *   ta    -> TA    : Tribunal Administratif
 *   cass  -> CASS  : Cour d'Assises
 *   ccd   -> CCD   : Cour Criminelle Departementale
 *   te    -> TE    : Tribunal pour Enfants
 *   tprx  -> TPRX  : Tribunal de Proximite
 *   ca    -> CA    : Cour d'Appel
 *   caa   -> CAA   : Cour Administrative d'Appel
 *   cdad  -> CDAD  : Conseil Departemental d'Acces au Droit
 *   tbrtj -> TBRTJ : Tribunal Paritaire des Baux Ruraux
 *
 * La couleur est appliquee au fond de carte ET lue par les lecteurs d'ecran
 * via l'aria-label du badge (voir TRIBUNAL_FULL_LABEL plus bas).
 */
const TRIBUNAL_COLOR_CLASS = {
  tgi:   'dossier-color-tgi',
  tco:   'dossier-color-tco',
  cph:   'dossier-color-cph',
  ta:    'dossier-color-ta',
  cass:  'dossier-color-cass',
  ccd:   'dossier-color-ccd',
  te:    'dossier-color-te',
  tprx:  'dossier-color-tprx',
  ca:    'dossier-color-ca',
  caa:   'dossier-color-caa',
  cdad:  'dossier-color-cdad',
  tbrtj: 'dossier-color-tbrtj',
};

// Abreviation courte affichee dans le badge (visible)
const TRIBUNAL_LABEL = {
  tgi:   'TJ',
  tco:   'TCO',
  cph:   'CPH',
  ta:    'TA',
  cass:  'CASS',
  ccd:   'CCD',
  te:    'TE',
  tprx:  'TPRX',
  ca:    'CA',
  caa:   'CAA',
  cdad:  'CDAD',
  tbrtj: 'TBRTJ',
};

// Libelle complet utilise pour l'aria-label du badge (accessibilite)
const TRIBUNAL_FULL_LABEL = {
  tgi:   'Tribunal Judiciaire',
  tco:   'Tribunal de Commerce',
  cph:   "Conseil de Prud'hommes",
  ta:    'Tribunal Administratif',
  cass:  "Cour d'Assises",
  ccd:   'Cour Criminelle D\u00e9partementale',
  te:    'Tribunal pour Enfants',
  tprx:  'Tribunal de Proximit\u00e9',
  ca:    "Cour d'Appel",
  caa:   "Cour Administrative d'Appel",
  cdad:  "Conseil D\u00e9partemental d'Acc\u00e8s au Droit",
  tbrtj: 'Tribunal Paritaire des Baux Ruraux',
};

// Badge dedie pour les dossiers de divorce par consentement mutuel.
// Discriminateur : item.dossier.dossier.type_dossier === 'divorce_cm'.
// Couleur fuchsia coherente avec la banniere violette du Bureau.
const DIVORCE_CM_BADGE = {
  label: 'DCM',
  fullLabel: 'Divorce par consentement mutuel',
  colorClass: 'dossier-color-divorce-cm',
};

const DossierListe = ({ dossiers }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // State pour le menu dropdown (trois points)
  const [dropdownDossierId, setDropdownDossierId] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  // State pour la modale de confirmation de suppression
  const [dossierToDelete, setDossierToDelete] = useState(null);
  // State pour la modale d'édition
  const [dossierToEdit, setDossierToEdit] = useState(null);
  // State pour indiquer qu'une suppression est en cours
  const [isDeleting, setIsDeleting] = useState(false);

  const dropdownRef = useRef(null);

  const formatDossierNameForDisplay = (fullName) => {
    if (!fullName || typeof fullName !== 'string') {
      return { pour: 'N/A', contre: 'N/A' };
    }

    const parts = fullName.split(/\s+c\/\s+/i);
    const pourPart = parts[0] || '';
    const contrePart = parts[1] || '';

    return {
      pour: pourPart.replace(/\s+et autres…/, '...'),
      contre: contrePart.replace(/\s+et autres…/, '...'),
    };
  };

  // ======= Clic sur le bloc dossier : naviguer =======
  const handleDossierClick = (item) => {
    if (dropdownDossierId) {
      setDropdownDossierId(null);
      return;
    }
    dispatch(setCurrentDossier(item));
    navigate('/dashboard/dossier');
  };

  // ======= Clic sur les trois points : ouvrir le dropdown =======
  const handleThreeDotsClick = (e, item) => {
    e.stopPropagation();
    stopSpeaking();

    if (dropdownDossierId === item._id) {
      setDropdownDossierId(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    setDropdownPosition({
      top: rect.bottom + 4,
      left: rect.right,
    });
    setDropdownDossierId(item._id);
  };

  // ======= Clic sur "Modifier" dans le dropdown =======
  const handleEditClick = (e, item) => {
    e.stopPropagation();
    setDropdownDossierId(null);
    dispatch(setCurrentDossier(item)); // Nécessaire pour que les sous-composants (LinkedContactItem, etc.) aient accès au dossierIdFromStore
    setDossierToEdit(item);
  };

  // ======= Clic sur "Supprimer" dans le dropdown =======
  const handleDeleteClick = (e, item) => {
    e.stopPropagation();
    setDropdownDossierId(null);
    setDossierToDelete(item);
  };

  // ======= Fermeture de la modale d'édition =======
  const handleCloseEditModal = () => {
    setDossierToEdit(null);
    // Rafraîchir la liste des dossiers après modification
    dispatch(fetchLast25Dossiers());
  };

  // ======= Confirmation de suppression =======
  const handleConfirmDelete = async (dossier) => {
    setIsDeleting(true);
    try {
      await dispatch(deleteDossier(dossier._id));
      dispatch(fetchAgendaEvents());
      dispatch(fetchTop25Tasks());
    } catch (err) {
      // L'erreur est déjà gérée dans le thunk (alert)
    } finally {
      setIsDeleting(false);
      setDossierToDelete(null);
    }
  };

  // ======= Fermer le dropdown au clic extérieur =======
  useEffect(() => {
    if (!dropdownDossierId) return;

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownDossierId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownDossierId]);

  return (
    <div className='DossierListe'>
      {(!dossiers || !Array.isArray(dossiers) || dossiers.length === 0) ? (
        <div className="dossierListe-empty">
          Aucun dossier n'a encore été créé pour ce compte.
        </div>
      ) : (
        dossiers.map((item) => {
          const nomComplet = item?.dossier?.dossier?.nom || '';
          const typeDossier = item?.dossier?.dossier?.type_dossier;
          const isDivorceCM = typeDossier === 'divorce_cm';
          const tribunalType = item?.dossier?.dossier?.selectedTribunalAffaire?.type;

          // Pour les divorces CM, le nom est "EPOUX1 - EPOUX2" (pas de "c/").
          // On split sur " - " pour afficher proprement les deux epoux.
          let topLabel = '';
          let bottomLabel = '';
          let connector = 'contre';
          if (isDivorceCM) {
            const parts = nomComplet.split(/\s+-\s+/);
            topLabel = parts[0] || nomComplet;
            bottomLabel = parts[1] || '';
            connector = 'et';
          } else {
            const formatted = formatDossierNameForDisplay(nomComplet);
            topLabel = formatted.pour;
            bottomLabel = formatted.contre;
          }
          const textToSpeak = bottomLabel
            ? `${topLabel} ${connector} ${bottomLabel}`
            : topLabel;

          // Choix du badge : divorce CM > tribunal > rien
          let badgeLabel = null;
          let badgeFullLabel = null;
          let colorClass = 'dossier-color-default';
          if (isDivorceCM) {
            badgeLabel = DIVORCE_CM_BADGE.label;
            badgeFullLabel = DIVORCE_CM_BADGE.fullLabel;
            colorClass = DIVORCE_CM_BADGE.colorClass;
          } else if (tribunalType && TRIBUNAL_LABEL[tribunalType]) {
            badgeLabel = TRIBUNAL_LABEL[tribunalType];
            badgeFullLabel = TRIBUNAL_FULL_LABEL[tribunalType] || TRIBUNAL_LABEL[tribunalType];
            colorClass = TRIBUNAL_COLOR_CLASS[tribunalType] || 'dossier-color-default';
          }

          return (
            <HoverToSpeak key={item._id} textToSpeak={textToSpeak}>
              <div
                className={`dossierItemContainer ${colorClass}`}
                onClick={() => handleDossierClick(item)}
              >
                {badgeLabel && (
                  <span
                    className="dossier-type-badge"
                    aria-label={isDivorceCM ? badgeFullLabel : `Juridiction : ${badgeFullLabel}`}
                    title={badgeFullLabel}
                  >
                    {badgeLabel}
                  </span>
                )}
                <div className="nomDossierItem">
                  <div className="partie-pour">{topLabel}</div>
                  {bottomLabel && (
                    <div className="partie-contre">{connector} {bottomLabel}</div>
                  )}
                </div>
                <button
                  className="dossier-three-dots-btn"
                  onClick={(e) => handleThreeDotsClick(e, item)}
                  title="Options"
                  aria-label={`Options du dossier ${topLabel}${bottomLabel ? ' ' + connector + ' ' + bottomLabel : ''} (modifier ou supprimer)`}
                  aria-haspopup="menu"
                  aria-expanded={dropdownDossierId === item._id}
                >
                  <span aria-hidden="true">⋮</span>
                </button>
              </div>
            </HoverToSpeak>
          );
        })
      )}

      {/* Menu dropdown via Portal */}
      {dropdownDossierId && ReactDOM.createPortal(
        <div
          ref={dropdownRef}
          className="dossier-dropdown-menu"
          role="menu"
          aria-label="Actions sur le dossier"
          style={{
            position: 'fixed',
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            transform: 'translateX(-100%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="dossier-dropdown-item"
            role="menuitem"
            onClick={(e) => {
              const item = dossiers.find(d => d._id === dropdownDossierId);
              if (item) handleEditClick(e, item);
            }}
          >
            Modifier
          </button>
          <button
            className="dossier-dropdown-item dossier-dropdown-item--delete"
            role="menuitem"
            onClick={(e) => {
              const item = dossiers.find(d => d._id === dropdownDossierId);
              if (item) handleDeleteClick(e, item);
            }}
          >
            Supprimer
          </button>
        </div>,
        document.body
      )}

      {/* Modale de confirmation de suppression */}
      {dossierToDelete && (
        <ConfirmDeleteDossierModal
          dossier={dossierToDelete}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDossierToDelete(null)}
        />
      )}

      {/* Modale d'edition de dossier — formulaire dedie pour les divorces CM */}
      {dossierToEdit && (
        (dossierToEdit?.dossier?.dossier?.type_dossier === 'divorce_cm'
          || dossierToEdit?.dossier?.type_dossier === 'divorce_cm')
          ? (
            <EditDossierDivorceCMModal
              dossier={dossierToEdit}
              onClose={handleCloseEditModal}
            />
          ) : (
            <EditDossierModal
              dossier={dossierToEdit}
              onClose={handleCloseEditModal}
            />
          )
      )}
    </div>
  );
};

export default DossierListe;
