import React from 'react';
import { useLocation } from 'react-router-dom';
import dossierOuvert from "../../../../../../assets/dossier.svg";
import dossierFerme from "../../../../../../assets/dossierF.svg";

const OfficeDossierLinkIcon = () => {
  const location = useLocation();
  const isActive = location.pathname.startsWith('/dashboard/dossier') ||
                   location.pathname.startsWith('/dashboard/createDossier');

  return (
    <div>
      <img
        src={isActive ? dossierOuvert : dossierFerme}
        alt="boutonHome"
        className="boutonSideBar"
      />
    </div>
  );
};

export default OfficeDossierLinkIcon;