// File: C:\Mes_Projets_2\Kheops_2\Version_Web\Kheops_2_Test_56\Kheops_2\client\src\components\dashboard\layout\header\currentUser\currentUserAffiche\index.js
import React from 'react';
import { useSelector } from 'react-redux';
import '../../_header-small.css';

const CurrentUserAffiche = () => {
  const isAuthenticated = useSelector((state) => state.login.isAuthenticated);
  const officeUserObj = useSelector((state) => state.officeUser.officeUser);
  
  // <<<=== CORRECTION : Ajout de l'optional chaining (?.) pour éviter les erreurs si officeUserObj est null ===>>>
  let firstInitial = officeUserObj?.prenomOfficeUser?.charAt(0).toUpperCase() || '';
  let secondInitial = officeUserObj?.nomOfficeUser?.charAt(0).toUpperCase() || '';

  return (
    <div className="current-user-affiche">
      {isAuthenticated ? (
        <>
          {firstInitial}{secondInitial}
        </>
      ) : (
        <p>Veuillez vous connecter pour afficher les informations de l'utilisateur</p>
      )}
    </div>
  );
};

export default CurrentUserAffiche;