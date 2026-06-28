import React from 'react';
import BaseModal from '../../../common/BaseModal';
import './MoreEventsModal.css';

const MoreEventsModal = ({ day, onClose, onEventClick }) => {

  if (!day || !day.events || day.events.length === 0) return null;

  const dayNumber = day.date.getDate();

  return (
    <BaseModal
      onClose={onClose}
      overlayClassName="more-events-modal-overlay-kheops"
      contentClassName="more-events-modal-kheops"
    >
      <button className="more-events-close-btn-kheops" onClick={onClose}>
        ×
      </button>
      <div className="more-events-header-kheops">
        <span className="more-events-day-number-kheops">{dayNumber}</span>
        <span className="more-events-day-text-kheops">{day.date.toLocaleDateString('fr-FR', { weekday: 'short' }).toUpperCase()}</span>
      </div>
      <ul className="more-events-list-kheops">
        {day.events.map(event => (
          <li
            key={event._id}
            className="more-events-item-kheops"
            onClick={() => onEventClick(event)}
          >
            <span className="more-events-item-time-kheops">
              {new Date(event.startDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span className="more-events-item-title-kheops">{event.title}</span>
          </li>
        ))}
      </ul>
    </BaseModal>
  );
};

export default MoreEventsModal;