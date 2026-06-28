import React from 'react';
import notificationsLogoPath from '../../../../../assets/notificationsLogo.svg';
import './styles.css';

const NotificationsLogoComponent = ({ onIconClick, displayCount }) => {
  const handleClick = () => {
    if (onIconClick) {
      onIconClick();
    }
  };

  return (
    <div className="notification-container" onClick={handleClick}> 
      <img src={notificationsLogoPath} alt="Notifications Logo" className="notifications-logo" />
      {displayCount > 0 && (
        <span className="notification-badge">
          {displayCount > 99 ? '99+' : displayCount}
        </span>
      )}
    </div>
  );
};

export default NotificationsLogoComponent;