import React, { useState, useRef } from 'react';
import { useDrag } from 'react-dnd';

import {
  useOutsideClick,
  getInitials,
} from '../fonctions';

import supprimerLogoPath from '../../../../../../assets/supprimer_responsable.svg';
import modifier from '../../../../../../assets/modifier.svg';
import ajoutPartie from '../../../../../../assets/icone-plus.svg';
// NOUVELLES IMPORTATIONS POUR LES ICÔNES DE COMPTEUR
import contactLinkIcon from '../../../../../../assets/utilisateur_navy.svg';
import plaidantIcon from '../../../../../../assets/plaidant.svg';

const ItemType = 'PARTIE';

/* ▶ Partie draggable (Pour | Contre) */
const DraggablePartie = ({
  partie,
  movePartie,
  handleDeletePartie,
  pourPartiesLength,
  contrePartiesLength,
  setIsDraggingOutside,
  zoneType,
  onOpenSinglePartieModal,
  handleModifyPartie,
}) => {
  const [{ isDragging }, drag] = useDrag({
    type: ItemType,
    item: { partie },
    end: (item, monitor) => {
      if (!monitor.didDrop()) {
        setIsDraggingOutside(true);
        if (zoneType === 'pour' && contrePartiesLength === 0)
          movePartie(item.partie, 'Contre');
        if (zoneType === 'contre' && pourPartiesLength === 0)
          movePartie(item.partie, 'Pour');
      } else {
        setIsDraggingOutside(false);
      }
    },
    collect: monitor => ({ isDragging: monitor.isDragging() }),
  });

  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const itemRef = useRef();
  useOutsideClick(itemRef, () => setIsOptionsOpen(false), isOptionsOpen);

  const itemClass =
    partie.typePartie === 'Pour'
      ? `itemPartiePour   ${pourPartiesLength <= 3 ? 'itemPartieScroll' : ''}`
      : `itemPartieContre ${contrePartiesLength <= 3 ? 'itemPartieScroll' : ''}`;

  const handleOpenLinkModal = () => {
    const normalized = {
      ...partie,
      idPartie: partie.idPartie ?? partie._id,
      linkedAvocats: partie.linkedAvocats ?? partie.avocats ?? [],
      linkedContacts: partie.linkedContacts ?? partie.contacts ?? [],
    };
    if (onOpenSinglePartieModal) {
      onOpenSinglePartieModal(normalized);
    }
  };

  const handleModifyClick = () => {
    if (handleModifyPartie) {
      handleModifyPartie(partie);
    }
  };

  const hasLinkedContacts = (partie.linkedContacts || []).length > 0;
  const hasLinkedAvocats = (partie.linkedAvocats || []).length > 0;
  const hasAnyLinks = hasLinkedContacts || hasLinkedAvocats;

  return (
    <div
      ref={drag}
      style={{ opacity: isDragging ? 0.5 : 1, cursor: isDragging ? 'grabbing' : 'grab' }}
      className={itemClass}
    >
      {/* ── Ligne 1 : Nom de la partie (dominant) ── */}
      <div className="partie-card__header">
        <div className="partie-name">
          {partie.nomPartie}
        </div>
        {/* Initiales — toujours visibles, toggle pour fallback clic */}
        <div
          className="initials-icon"
          onClick={(e) => { e.stopPropagation(); setIsOptionsOpen(!isOptionsOpen); }}
          title="Options"
        >
          {getInitials(partie.nomPartie)}
        </div>
      </div>

      {/* ── Ligne 2 : Indicateurs + Actions ── */}
      <div className="partie-card__footer" ref={itemRef}>
        {/* Badges : avocats + contacts + bouton ajouter */}
        <div
          className={`ajoutContactContainer ${hasAnyLinks ? '' : 'padBordNone'}`}
          onClick={(e) => { e.stopPropagation(); handleOpenLinkModal(); }}
        >
          {/* Avocats Count */}
          {hasLinkedAvocats && (
            <div className="nombreContactsLies">
              <div className="contactCount">
                {(partie.linkedAvocats || []).length}
                <img src={plaidantIcon} alt="Avocat(s)" className="k-icon-sm" />
              </div>
            </div>
          )}

          {/* Contacts Count */}
          {hasLinkedContacts && (
            <div className="nombreContactsLies">
              <div className="contactCount">
                {(partie.linkedContacts || []).length}
                <img src={contactLinkIcon} alt="Contact(s)" className="k-icon-sm" />
              </div>
            </div>
          )}

          {/* "Add Link" Icon */}
          <div className={`ajoutContactLie ${hasAnyLinks ? 'ajoutContactLie_alt' : ''}`}>
            <img src={ajoutPartie} alt="Lier" className="k-icon-sm" />
          </div>
        </div>

        {/* Boutons action — visibles au hover CSS ou au toggle clic */}
        <div className={`optionsContainer ${isOptionsOpen ? 'optionsContainer--open' : ''}`}>
          <div className="deletePartie" onClick={(e) => { e.stopPropagation(); handleDeletePartie(partie.idPartie); }}>
            <img src={supprimerLogoPath} alt="Supprimer" className="k-icon-sm" />
          </div>
          <div className="modifPartie" onClick={(e) => { e.stopPropagation(); handleModifyClick(); }}>
            <img src={modifier} alt="Modifier" className="k-icon-sm" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DraggablePartie;