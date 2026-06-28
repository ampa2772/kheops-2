import React from 'react';
import OfficeDossierLinkIcon from "./officeDossierLinkIcon";
import OfficeDossierLinkTitle from './officeDossierLinkTitle';
import { useSelector } from 'react-redux';

const OfficeDossierLink = () => {
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);

  return (
    <div className="boutonConteneur">
      {isSidebarOpen ? (
        <>
          <OfficeDossierLinkIcon />
          <OfficeDossierLinkTitle />
        </>
      ) : (
        <OfficeDossierLinkIcon />
      )}
    </div>
  );
};

export default OfficeDossierLink;
