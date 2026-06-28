import React from 'react';
import { useSelector } from 'react-redux';
import NoticesLinkIcon from './noticesIcon';
import NoticesLinkTitle from './noticesTitle';

const NoticesLink = () => {
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);
  return (
    <div className="boutonConteneur">
      {isSidebarOpen ? (<><NoticesLinkIcon /><NoticesLinkTitle /></>) : (<NoticesLinkIcon />)}
    </div>
  );
};

export default NoticesLink;
