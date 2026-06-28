import React from 'react';
import AgendaLinkIcon from "./agendaLinkIcon";
import AgendaLinkTitle from './agendaLinkTitle';
import { useSelector } from 'react-redux';

const AgendaLink = () => {
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);

  return (
    <div className="boutonConteneur">
      {isSidebarOpen ? (
        <>
          <AgendaLinkIcon />
          <AgendaLinkTitle />
        </>
      ) : (
        <AgendaLinkIcon />
      )}
    </div>
  );
};

export default AgendaLink;
