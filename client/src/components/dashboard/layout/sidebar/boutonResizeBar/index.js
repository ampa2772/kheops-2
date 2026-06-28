import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toggleSidebar } from '../../../../../redux/slices/layoutSlice';
import "./styles.css";
import boutonResizeBar from "../../../../../assets/symbole-de-double-fleche-droite-en-avance-rapide.svg";

const BoutonResizeBar = () => {
  const dispatch = useDispatch();
  const isSidebarOpen = useSelector(state => state.layout.isSidebarOpen);

  const handleClick = useCallback(() => {
    dispatch(toggleSidebar());
  }, [dispatch]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }, [handleClick]);

  return (
    <div>
      <img
        src={boutonResizeBar}
        alt={isSidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        className={isSidebarOpen ? 'resizeBarIcon' : 'rotated'}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={isSidebarOpen ? 'Fermer le menu lateral' : 'Ouvrir le menu lateral'}
      />
    </div>
  );
};

export default BoutonResizeBar;
