import React from 'react';
import '../../_header-small.css';
import currentsUsersIcon from '../../../../../../assets/utilisateurs.svg';

const CurrentsUsersIcon = () => {
  return (
    <div>
      <img src={currentsUsersIcon} alt="Utilisateurs Logo" className="currents-users-change-icon" />
    </div>
  );
};

export default CurrentsUsersIcon;