import React from 'react';
import { useDrop } from 'react-dnd';

const ItemType = 'PARTIE';

const DroppableZone = ({ typePartie, children, onDrop }) => {
  const [{ isOver }, drop] = useDrop({
    accept : ItemType,
    drop   : item => onDrop(item.partie, typePartie),
    collect: monitor => ({ isOver: monitor.isOver() }),
  });

  return (
    <div ref={drop} className={`droppableZone ${isOver ? 'over' : ''}`}>
      {children}
    </div>
  );
};

export default DroppableZone;
