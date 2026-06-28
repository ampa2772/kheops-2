import React from 'react';
import './styles.css';
import editIcon from '../../../../../../../assets/edit.svg';
import supprIcon from '../../../../../../../assets/suppr.svg';
import { selectOfficeUser, setUserToDelete } from '../../../../../../../redux/slices/officeUserSlice';
import { useDispatch } from 'react-redux';
import { toggleDeleteModal } from '../../../../../../../redux/slices/layoutSlice';

const UserDisplayName = ({ user, shownModSupprUserId, setShownModSupprUserId, handleUserEditClick, isMainUser, isSelected }) => {
  const dispatch = useDispatch();

  const initial1 = (user.nomOfficeUser || '').split('')[0] || '';
  const initial2 = (user.prenomOfficeUser || '').split('')[0] || '';
  const initials = (initial1 + initial2).toUpperCase();
  const fullName = `${user.prenomOfficeUser} ${user.nomOfficeUser}`.trim();

  const showActions = shownModSupprUserId === user._id;

  const handleCardClick = (e) => {
    e.stopPropagation();
    if (showActions) return;
    dispatch(selectOfficeUser(user._id));
    setShownModSupprUserId(null);
  };

  const handleToggleActions = (e) => {
    e.stopPropagation();
    if (isMainUser) return;
    setShownModSupprUserId(showActions ? null : user._id);
  };

  const handleModifClick = (e) => {
    e.stopPropagation();
    handleUserEditClick(user);
    setShownModSupprUserId(null);
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    dispatch(setUserToDelete(user));
    dispatch(toggleDeleteModal());
    setShownModSupprUserId(null);
  };

  const componentClasses = [
    'cu-user-card',
    'user-display-name',
    isMainUser ? 'main-office-user-item' : '',
    isSelected ? 'selected-office-user-item is-selected' : '',
    showActions ? 'is-actions-open' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={componentClasses} onClick={handleCardClick}>
      <div className="cu-user-card__avatar user-initials" aria-hidden="true">
        {initials}
      </div>

      <div className="cu-user-card__info user-name">
        <div className="cu-user-card__name">{fullName}</div>
        <div className="cu-user-card__meta">
          <span className="cu-role-pill">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            {user.roleOfficeUser}
          </span>
          {isSelected && (
            <span className="cu-user-card__connected">connecté</span>
          )}
        </div>
      </div>

      <div className="cu-user-card__right initial-container">
        {isSelected ? (
          <span className="cu-user-card__check" aria-label="Sélectionné">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        ) : !isMainUser && !showActions ? (
          <button
            type="button"
            className="cu-user-card__chevron"
            onClick={handleToggleActions}
            aria-label="Options"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        ) : null}

        {showActions && (
          <div className="modal-officeUser-modifSuppr-container cu-actions">
            <div className="modal-officeUser-modifSuppr cu-action cu-action-edit" onClick={handleModifClick}>
              <img src={editIcon} alt="Modifier" className="k-icon-sm" />
            </div>
            <div className="modal-officeUser-modifSuppr cu-action cu-action-delete" onClick={handleDeleteClick}>
              <img src={supprIcon} alt="Supprimer" className="k-icon-sm" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDisplayName;
