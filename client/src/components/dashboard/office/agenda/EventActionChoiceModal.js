import React from 'react';
import ReactDOM from 'react-dom';
import BaseModal from '../../../common/BaseModal';
import HoverToSpeak from '../../../common/HoverToSpeak';
import './EventActionChoiceModal.css';

const EventActionChoiceModal = ({ isOpen, onClose, onViewEvent, onGoToDossier, eventTitle }) => {
    if (!isOpen) {
        return null;
    }

    return ReactDOM.createPortal(
        <BaseModal isOpen={isOpen} onClose={onClose} overlayClassName="choice-modal-overlay" contentClassName="choice-modal-content">
            <button className="choice-modal-close-btn" onClick={onClose}>×</button>
            <HoverToSpeak textToSpeak={"Action pour l'événement " + eventTitle}>
                <h3 className="choice-modal-title">Action pour l'événement</h3>
                <p className="choice-modal-event-name">{eventTitle}</p>
            </HoverToSpeak>
            <div className="choice-modal-actions">
                <HoverToSpeak textToSpeak="Afficher l'événement">
                    <button className="choice-modal-btn primary" onClick={onViewEvent}>
                        Afficher l'événement
                    </button>
                </HoverToSpeak>
                <HoverToSpeak textToSpeak="Aller vers le dossier">
                    <button className="choice-modal-btn secondary" onClick={onGoToDossier}>
                        Aller vers le dossier
                    </button>
                </HoverToSpeak>
            </div>
        </BaseModal>,
        document.body
    );
};

export default EventActionChoiceModal;