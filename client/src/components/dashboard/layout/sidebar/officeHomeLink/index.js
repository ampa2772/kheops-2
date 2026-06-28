import React from 'react';
import OfficeHomeLinkIcon from "./officeHomeLinkIcon";
import OfficeHomeLinkTitle from './officeHomeLinkTitle';
import { useSelector } from 'react-redux';

const OfficeHomeLink = () => {
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);

  return (
    <div className="boutonConteneur">
      {isSidebarOpen ? (
        <>
          <OfficeHomeLinkIcon />
          <OfficeHomeLinkTitle />
        </>
      ) : (
        <OfficeHomeLinkIcon />
      )}
    </div>
  );
};

export default OfficeHomeLink;
