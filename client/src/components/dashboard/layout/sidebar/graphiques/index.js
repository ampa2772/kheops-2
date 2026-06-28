import React from 'react';
import GraphiquesLinkIcon from "./graphiquesLinkIcon";
import GraphiquesTitle from './graphiquesLinkTitle';
import { useSelector } from 'react-redux';

const Graphiques = () => {
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);

  return (
    <div className="boutonConteneur">
      {isSidebarOpen ? (
        <>
          <GraphiquesLinkIcon />
          <GraphiquesTitle />
        </>
      ) : (
        <GraphiquesLinkIcon />
      )}
    </div>
  );
};

export default Graphiques;
