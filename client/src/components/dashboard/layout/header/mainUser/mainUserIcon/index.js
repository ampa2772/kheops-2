import React from 'react';
import { useSelector } from 'react-redux';
import './styles.css';

const MainUserIcon = () => {
  const user = useSelector((state) => state.login.user);

  const getInitials = (u) => {
    if (u?.firstName && u?.lastName) {
      return u.firstName.charAt(0).toUpperCase() + u.lastName.charAt(0).toUpperCase();
    }
    return '';
  };

  return (
    <div className="main-user-icon">
      {getInitials(user)}
    </div>
  );
};

export default MainUserIcon;
