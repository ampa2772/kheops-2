import React, { useState, useCallback } from 'react';
import CurrentsUsersIcon from './currentsUsersIcon';
import CurrentsUsersModal from './currentsUsersModal';

const CurrentsUsers = () => {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = useCallback(() => setIsOpen((v) => !v), []);
  const handleClose = useCallback(() => setIsOpen(false), []);

  return (
    <>
      <div
        className="current-user-aff-icon"
        role="button"
        tabIndex={0}
        aria-label="Utilisateurs connectes"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <CurrentsUsersIcon />
      </div>
      <CurrentsUsersModal isOpen={isOpen} onClose={handleClose} />
    </>
  );
};

export default CurrentsUsers;
