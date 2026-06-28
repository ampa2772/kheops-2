import React from 'react';
import { useSelector } from 'react-redux';
import BilanLinkIcon from './bilanLinkIcon';
import BilanLinkTitle from './bilanLinkTitle';

const BilanLink = () => {
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);
  return (
    <div className="boutonConteneur">
      {isSidebarOpen ? (<><BilanLinkIcon /><BilanLinkTitle /></>) : (<BilanLinkIcon />)}
    </div>
  );
};

export default BilanLink;
