import React from 'react';

import ParametresLinkIcon from "./mailsLinkIcon";
import ParametresTitle from "./mailsLinkTitle";
import { useSelector } from 'react-redux';

const Mails = () => {
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);

  return (
    <div className="boutonConteneur btn_mails">
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

export default Mails;