import React from 'react';
import FacturationLinkIcon from "./facturationLinkIcon";
import FacturationLinkTitle from './facturationLinkTitle';
import { useSelector } from 'react-redux';

const FacturationLink = () => {
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);

  return (
    <div className="boutonConteneur">
      {isSidebarOpen ? (
        <>
          <FacturationLinkIcon />
          <FacturationLinkTitle />
        </>
      ) : (
        <FacturationLinkIcon />
      )}
    </div>
  );
};

export default FacturationLink;
