import React from 'react';
import '../../_header-small.css';
import utilisateurLogoPath from '../../../../../../assets/utilisateur.svg';

const CurrentUserChangeIcon = () => {
  return (
    <div>
      <img src={utilisateurLogoPath} alt="Utilisateur Logo" className="current-user-change-icon" />
    </div>
  );
};

export default CurrentUserChangeIcon;
