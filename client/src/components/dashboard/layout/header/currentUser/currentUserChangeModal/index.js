import React, { useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import classNames from 'classnames';
import { toggleModal, toggleDeleteModal } from '../../../../../../redux/slices/layoutSlice';
import { deleteOfficeUser, resetEditMode, resetInitialData, setEditMode } from '../../../../../../redux/slices/officeUserSlice';

import OfficeUserForm from './formAddOfficeUser';
import UserDisplayName from './officeUserItem';

import './styles.css';

const Modal = () => {
  const dispatch = useDispatch();
  const modalContentRef = useRef();
  const supprConfirmRef = useRef();
  const formRef = useRef();

  const [shownModSupprUserId, setShownModSupprUserId] = useState(null);
  const [initialData, setInitialData] = useState(null);
  const [activeTab, setActiveTab] = useState('list');

  const isOpen = useSelector(state => state.layout.deleteModalIsOpen);
  const deleteModalIsOpen = useSelector(state => state.layout.deleteModalIsOpen);
  const editMode = useSelector(state => state.officeUser.editMode);
  const officeUserObj = useSelector(state => state.officeUser.officeUser);
  const officeUsers = useSelector(state => state.officeUser.officeUsers);
  const userToDelete = useSelector(state => state.officeUser.userToDelete);
  const isSetupRequired = useSelector(state => state.officeUser.isSetupRequired);

  const prenomOfficeUser = officeUserObj?.prenomOfficeUser || '';
  const nomOfficeUser = officeUserObj?.nomOfficeUser || '';
  const initials = ((prenomOfficeUser[0] || '') + (nomOfficeUser[0] || '')).toUpperCase();
  const fullName = `${prenomOfficeUser} ${nomOfficeUser}`.trim();

  const closeModal = () => {
    if (isSetupRequired) return;
    dispatch(toggleModal());
    dispatch(resetEditMode());
    dispatch(resetInitialData());
    setInitialData(null);
  };

  const handleCloseButtonClick = (event) => {
    if (event && event.stopPropagation) event.stopPropagation();
    closeModal();
  };

  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget && !isSetupRequired) {
      closeModal();
    }
  };

  const handleModalContentClick = (event) => {
    event.stopPropagation();
    if (deleteModalIsOpen && supprConfirmRef.current && !supprConfirmRef.current.contains(event.target)) {
      dispatch(toggleDeleteModal());
    }
  };

  // Esc → close
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSetupRequired) {
        closeModal();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSetupRequired]);

  useEffect(() => {
    if (isSetupRequired) setActiveTab('add');
  }, [isSetupRequired]);

  const handleUserEditClick = (user) => {
    dispatch(setEditMode(true));
    setInitialData(user);
    setActiveTab('add');
  };

  const handleAddClick = () => {
    setActiveTab('add');
    dispatch(resetEditMode());
    dispatch(resetInitialData());
    setInitialData(null);
  };

  const handleDeleteAnnuleClick = () => {
    dispatch(toggleDeleteModal());
  };

  const handleDeleteClick = () => {
    const token = localStorage.getItem('token');
    if (userToDelete && token) {
      dispatch(deleteOfficeUser(userToDelete._id));
      dispatch(toggleDeleteModal());
    }
  };

  const handleConfirm = () => {
    if (formRef.current && formRef.current.submit) {
      formRef.current.submit();
    } else {
      closeModal();
    }
  };

  const usersCount = officeUsers ? officeUsers.length : 0;

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div
        ref={modalContentRef}
        className="modal-content cu-modal"
        onClick={handleModalContentClick}
      >
        {/* HEADER */}
        <div className="cu-header">
          <div className="cu-header-info">
            <div className="cu-session-status">
              <span className="cu-status-dot" />
              <span>SESSION ACTIVE</span>
            </div>
            <h1 className="cu-title">
              {isSetupRequired ? 'Bienvenue !' : 'Comptes utilisateurs'}
            </h1>
            {!isSetupRequired && officeUserObj && (
              <div className="cu-current-user-pill">
                <span className="cu-avatar-mini">{initials}</span>
                <span className="cu-current-user-name">{fullName}</span>
              </div>
            )}
            {isSetupRequired && (
              <div className="cu-current-user-pill cu-current-user-pill--setup">
                <span>Veuillez créer votre profil principal</span>
              </div>
            )}
          </div>
          {!isSetupRequired && (
            <button className="cu-close" onClick={handleCloseButtonClick} aria-label="Fermer">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* TABS */}
        {!isSetupRequired && (
          <div className="cu-tabs" role="tablist">
            <button
              className={classNames('cu-tab', { 'is-active': activeTab === 'list' })}
              onClick={() => setActiveTab('list')}
              role="tab"
              aria-selected={activeTab === 'list'}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <polyline points="17 11 19 13 23 9" />
              </svg>
              <span>Changer d'utilisateur</span>
            </button>
            <button
              className={classNames('cu-tab', { 'is-active': activeTab === 'add' })}
              onClick={handleAddClick}
              role="tab"
              aria-selected={activeTab === 'add'}
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Ajouter</span>
            </button>
          </div>
        )}

        {/* SPLIT PANEL */}
        <div className={classNames('cu-split', {
          'cu-focus-add': activeTab === 'add',
          'cu-focus-list': activeTab === 'list',
          'cu-setup': isSetupRequired,
        })}>
          {/* LEFT — Liste */}
          {!isSetupRequired && officeUsers && officeUsers.length > 0 && (
            <div className="cu-panel cu-panel-list">
              <div className="cu-panel-header">
                <span className="cu-panel-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <div className="cu-panel-titles">
                  <div className="cu-panel-title">Comptes existants</div>
                  <div className="cu-panel-subtitle">
                    {usersCount} utilisateur{usersCount > 1 ? 's' : ''} disponible{usersCount > 1 ? 's' : ''}
                  </div>
                </div>
              </div>
              <ul className="cu-user-list office-user-list">
                {officeUsers.map((user) => (
                  <li key={user._id}>
                    <UserDisplayName
                      user={user}
                      shownModSupprUserId={shownModSupprUserId}
                      setShownModSupprUserId={setShownModSupprUserId}
                      handleUserEditClick={handleUserEditClick}
                      isMainUser={user.mainOfficeUser === true}
                      isSelected={user._id === officeUserObj?._id}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* RIGHT — Form */}
          <div className="cu-panel cu-panel-form">
            <div className="cu-panel-header">
              <span className="cu-panel-icon cu-panel-icon-add">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <div className="cu-panel-titles">
                <div className="cu-panel-title">
                  {editMode ? "Modifier l'utilisateur" : 'Nouvel utilisateur'}
                </div>
                <div className="cu-panel-subtitle">
                  {editMode ? 'Mettre à jour les informations' : 'Ajouter un membre au cabinet'}
                </div>
              </div>
            </div>
            <OfficeUserForm
              ref={formRef}
              initialData={initialData}
              setInitialData={setInitialData}
            />
          </div>
        </div>

        {/* FOOTER */}
        <div className="cu-footer">
          {!isSetupRequired && (
            <button type="button" className="cu-btn cu-btn-cancel" onClick={handleCloseButtonClick}>
              <span>Annuler</span>
              <kbd className="cu-kbd">Esc</kbd>
            </button>
          )}
          <button type="button" className="cu-btn cu-btn-confirm" onClick={handleConfirm}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>{isSetupRequired ? 'Créer mon profil' : (editMode ? 'Enregistrer' : 'Confirmer')}</span>
          </button>
        </div>

        {/* DELETE CONFIRMATION */}
        {isOpen && (
          <div className="suppr-conf-overlay">
            <div className="suppr-confirm" ref={supprConfirmRef}>
              <div className="title-suppr-modal">
                <div className="tittle">Confirmez-vous la suppression de :</div>
                <div className="ident">
                  {userToDelete && `${userToDelete.prenomOfficeUser} ${userToDelete.nomOfficeUser} - ${userToDelete.roleOfficeUser}`}
                </div>
              </div>
              <div className="container-buton-suppr-confirm">
                <button onClick={handleDeleteAnnuleClick}>Annuler</button>
                <button onClick={handleDeleteClick}>Supprimer</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Modal;
