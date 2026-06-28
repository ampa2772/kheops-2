import React from 'react';
import { useSelector } from 'react-redux';
import CarpaLinkIcon from './carpaLinkIcon';
import CarpaLinkTitle from './carpaLinkTitle';

const CarpaLink = () => {
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);

  return (
    <div className="boutonConteneur">
      {isSidebarOpen ? (
        <>
          <CarpaLinkIcon />
          <CarpaLinkTitle />
        </>
      ) : (
        <CarpaLinkIcon />
      )}
    </div>
  );
};

export default CarpaLink;
