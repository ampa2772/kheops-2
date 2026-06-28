import React from 'react';
import { useSelector } from 'react-redux';
import './styles.css';

const MainUserInfos = () => {
  const user = useSelector((state) => state.login.user);
  const isAuthenticated = useSelector((state) => state.login.isAuthenticated);

  return (
    <div className="main-user-infos">
      {isAuthenticated && user ? (
        <>
          <p>{user.firstName}</p>
          <p>{user.lastName}</p>
        </>
      ) : (
        <p>Veuillez vous connecter pour afficher les informations de l'utilisateur</p>
      )}
    </div>
  );
};

export default MainUserInfos;
