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
  const destinationSide = partie.typePartie === 'Pour' ? 'Contre' : 'Pour';
  const keyboardShortcut = partie.typePartie === 'Pour' ? 'Alt+ArrowRight' : 'Alt+ArrowLeft';
  const optionsId = `partie-options-${String(partie.idPartie ?? partie._id ?? partie.nomPartie)
    .replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  const handleCardKeyDown = (event) => {
    const expectedArrow = partie.typePartie === 'Pour' ? 'ArrowRight' : 'ArrowLeft';
    if (event.altKey && event.key === expectedArrow && movePartie) {
      event.preventDefault();
      event.stopPropagation();
      movePartie(partie, destinationSide);
    }
  };

  return (
    <div
      ref={drag}
      style={{ opacity: isDragging ? 0.5 : 1, cursor: isDragging ? 'grabbing' : 'grab' }}
      className={itemClass}
      role="group"
      tabIndex={0}
      aria-keyshortcuts={keyboardShortcut}
      aria-label={`Partie ${partie.nomPartie}, camp ${partie.typePartie}. ${keyboardShortcut} pour la déplacer vers ${destinationSide}.`}
      onKeyDown={handleCardKeyDown}
    >
      {/* ── Ligne 1 : Nom de la partie (dominant) ── */}
      <div className="partie-card__header">
        <div className="partie-name">
          {partie.nomPartie}
        </div>
        {/* Initiales — toujours visibles, toggle pour fallback clic */}
        <button
          type="button"
          className="initials-icon"
          onClick={(e) => { e.stopPropagation(); setIsOptionsOpen(!isOptionsOpen); }}
          title={`Options de la partie ${partie.nomPartie}`}
          aria-label={`Options de la partie ${partie.nomPartie}`}
          aria-expanded={isOptionsOpen}
          aria-controls={optionsId}
          style={{ padding: 0, border: 0, font: 'inherit' }}
        >
          {getInitials(partie.nomPartie)}
        </button>
      </div>

      {/* ── Ligne 2 : Indicateurs + Actions ── */}
      <div className="partie-card__footer" ref={itemRef}>
        {/* Badges : avocats + contacts + bouton ajouter */}
        <button
          type="button"
          className={`ajoutContactContainer ${hasAnyLinks ? '' : 'padBordNone'}`}
          onClick={(e) => { e.stopPropagation(); handleOpenLinkModal(); }}
          aria-label={`Gérer les personnes liées à ${partie.nomPartie}`}
          title={`Gérer les personnes liées à ${partie.nomPartie}`}
          style={{ font: 'inherit', color: 'inherit' }}
        >
          {/* Avocats Count */}
          {hasLinkedAvocats && (
            <span className="nombreContactsLies">
              <span className="contactCount">
                {(partie.linkedAvocats || []).length}
                <img src={plaidantIcon} alt="Avocat(s)" className="k-icon-sm" />
              </span>
            </span>
          )}

          {/* Contacts Count */}
          {hasLinkedContacts && (
            <span className="nombreContactsLies">
              <span className="contactCount">
                {(partie.linkedContacts || []).length}
                <img src={contactLinkIcon} alt="Contact(s)" className="k-icon-sm" />
              </span>
            </span>
          )}

          {/* "Add Link" Icon */}
          <span className={`ajoutContactLie ${hasAnyLinks ? 'ajoutContactLie_alt' : ''}`}>
            <img src={ajoutPartie} alt="Lier" className="k-icon-sm" />
          </span>
        </button>

        {/* Boutons action — visibles au hover CSS ou au toggle clic */}
        <div
          id={optionsId}
          className={`optionsContainer ${isOptionsOpen ? 'optionsContainer--open' : ''}`}
          aria-hidden={!isOptionsOpen}
        >
          <button
            type="button"
            className="deletePartie"
            onClick={(e) => { e.stopPropagation(); handleDeletePartie(partie.idPartie); }}
            aria-label={`Supprimer la partie ${partie.nomPartie}`}
            title={`Supprimer la partie ${partie.nomPartie}`}
            tabIndex={isOptionsOpen ? 0 : -1}
          >
            <img src={supprimerLogoPath} alt="" aria-hidden="true" className="k-icon-sm" />
          </button>
          <button
            type="button"
            className="modifPartie"
            onClick={(e) => { e.stopPropagation(); handleModifyClick(); }}
            aria-label={`Modifier la partie ${partie.nomPartie}`}
            title={`Modifier la partie ${partie.nomPartie}`}
            tabIndex={isOptionsOpen ? 0 : -1}
          >
            <img src={modifier} alt="" aria-hidden="true" className="k-icon-sm" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DraggablePartie;
