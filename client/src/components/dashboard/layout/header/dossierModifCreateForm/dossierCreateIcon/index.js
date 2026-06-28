import React from 'react';
import { useDispatch } from 'react-redux';
import { toggleCreateModal } from '../../../../../../redux/slices/layoutSlice';
import ajouterLogoPath from '../../../../../../assets/ajouter.svg';
import '../../_header-small.css';

const CreateIcon = () => {
  const dispatch = useDispatch();

  const handleClick = (event) => {
    event.stopPropagation();
    dispatch(toggleCreateModal());
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick(event);
    }
  };

  return (
    <div
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Cr\u00e9er un nouvel \u00e9l\u00e9ment (dossier, contact, document ou email)"
    >
      <img src={ajouterLogoPath} alt="" aria-hidden="true" className="create-icon" />
    </div>
  );
};

export default CreateIcon;

