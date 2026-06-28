import React from 'react';
import DroppableZone   from './DroppableZone';
import DraggablePartie from './DraggablePartie';
import HoverToSpeak from '../../../../../common/HoverToSpeak';

const PartyColumn = ({
  side,                       /* 'Pour' | 'Contre' */
  parties,
  movePartie,                 // Pour DroppableZone et DraggablePartie (si drop sur même colonne)
  // Props spécifiques pour DraggablePartie
  handleDeletePartie,
  pourPartiesLength,
  contrePartiesLength,
  onOpenSinglePartieModal,
  handleModifyPartie,
  // setIsDraggingOutside est géré par DraggablePartie lui-même
  headerExtra = null,         /* ex : bouton « … » */
  footerExtra = null,         /* rc64 : bouton "+ Ajouter une personne liée" */
}) => (
  <DroppableZone typePartie={side} onDrop={movePartie}>
    <div className={`parties_${side.toLowerCase()}`}>
      <div className={side.toLowerCase()}>
        <HoverToSpeak textToSpeak={`Colonne ${side === 'Pour' ? 'Pour' : 'Contre'}, ${parties.length} partie${parties.length > 1 ? 's' : ''}`}>
          <span>{side}</span>
        </HoverToSpeak>
        <span className="k-party-col-count" aria-hidden="true">
          {parties.length} partie{parties.length > 1 ? 's' : ''}
        </span>
        {headerExtra}
      </div>

      <div className={`listeParties${side}`}>
        {parties.map((partie, index) => (
          <DraggablePartie
            key={partie.idPartie ?? partie._id ?? `${side}-${index}`}
            partie={partie}
            movePartie={movePartie}
            handleDeletePartie={handleDeletePartie}
            pourPartiesLength={pourPartiesLength}
            contrePartiesLength={contrePartiesLength}
            setIsDraggingOutside={() => {}}
            zoneType={side.toLowerCase()}
            onOpenSinglePartieModal={onOpenSinglePartieModal}
            handleModifyPartie={handleModifyPartie}
          />
        ))}
      </div>

      {footerExtra}
    </div>
  </DroppableZone>
);

export default PartyColumn;