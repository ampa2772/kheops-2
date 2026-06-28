import React from 'react';
import ParametresLinkIcon from "./parametresLinkIcon";
import ParametresTitle from "./parametresLinkTitle";
import { useSelector } from 'react-redux';

const Parametres = () => {
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);

  return (
    <div className="boutonConteneur">
      {isSidebarOpen ? (
        <>
          <ParametresLinkIcon />
          <ParametresTitle />
        </>
      ) : (
        <ParametresLinkIcon />
      )}
    </div>
  );
};

export default Parametres;
