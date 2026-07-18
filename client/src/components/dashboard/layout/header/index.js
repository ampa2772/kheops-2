// Kheops_2/client/src/components/dashboard/layout/header/index.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import './styles.css';
import MainUser from './mainUser';
import NotificationsLogoComponent from './notifications';
import DossierModifCreateForm from './dossierModifCreateForm';
import CurrentUser from './currentUser';
import CurrentsUsers from './currentsUsers';
import LogoKheops from './logo';
import AllSearch from './allSearch';
import Title from './title';
import Tooltip from '../../../common/Tooltip';
import NotificationsModal from './notifications/NotificationsModal';
import CloudSyncStatus from './cloudSync';
import { fetchNotifications, openNotificationsModal, closeNotificationsModal } from '../../../../redux/slices/layoutSlice';
import { selectTotalUnread } from '../../../../redux/slices/chatSlice';

const Header = ({ isChatOpen = false, onToggleChat = () => {} }) => {
  const isAuthenticated = useSelector((state) => state.login.isAuthenticated);
  const dispatch = useDispatch();
  const totalUnread = useSelector(selectTotalUnread);

  const isNotificationsModalOpen = useSelector(state => state.layout.isNotificationsModalOpen);
  const { list: notificationsList, lastFetched } = useSelector(state => state.layout.notifications);
  const showReadNotifications = useSelector(state => state.layout.showReadNotifications);
  // Masquer le tooltip "Ajouter" des qu'une des modales de creation est ouverte,
  // sinon il reste visible par-dessus l'overlay de la modale (resiste au
  // onMouseLeave car l'overlay capture les events).
  const createModalIsOpen = useSelector(state => state.layout.createModalIsOpen);
  const emailComposeModalIsOpen = useSelector(state => state.layout.emailComposeModalIsOpen);
  const documentCreateModalIsOpen = useSelector(state => state.layout.documentCreateModalIsOpen);
  const addTooltipDisabled =
    createModalIsOpen || emailComposeModalIsOpen || documentCreateModalIsOpen;

  const [modalPosition, setModalPosition] = useState({ top: 0, right: 0 });
  const notificationIconRef = useRef(null);

  // === DÉBUT DE LA MODIFICATION MAJEURE ===
  // Calcul du nombre à afficher dans la pastille
  const badgeCount = useMemo(() => {
    if (showReadNotifications) {
      // Si on affiche les lus, le compteur est le total
      return notificationsList.length;
    }
    // Sinon, on compte seulement les non lus
    return notificationsList.filter(n => !n.isRead).length;
  }, [notificationsList, showReadNotifications]);
  // === FIN DE LA MODIFICATION MAJEURE ===

  const handleToggleNotifications = useCallback(() => {
    if (!isNotificationsModalOpen) {
      if (notificationIconRef.current) {
        const rect = notificationIconRef.current.getBoundingClientRect();
        setModalPosition({
          top: rect.bottom + 7,
          right: window.innerWidth - rect.right,
        });
      }
      
      const fiveMinutes = 5 * 60 * 1000;
      const shouldRefresh = !lastFetched || (new Date() - new Date(lastFetched) > fiveMinutes);

      if (shouldRefresh) {
        dispatch(fetchNotifications(null));
      }
      dispatch(openNotificationsModal());
    } else {
      dispatch(closeNotificationsModal());
    }
  }, [isNotificationsModalOpen, dispatch, lastFetched]);

  useEffect(() => {
    const handleResize = () => {
      if (isNotificationsModalOpen && notificationIconRef.current) {
        const rect = notificationIconRef.current.getBoundingClientRect();
        setModalPosition({
          top: rect.bottom + 7,
          right: window.innerWidth - rect.right,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isNotificationsModalOpen]);

  return (
    <div className="header" role="toolbar" aria-label="Actions principales">
      {isAuthenticated ? (
        <>
          <div className="title_logo">
            <LogoKheops />
            <Title />
          </div>

          <div className="icons">
            <Tooltip text="Recherche" position="bottom" speechText="Recherche globale">
              <AllSearch />
            </Tooltip>
            <Tooltip text="Utilisateurs connectes" position="bottom" speechText="Utilisateurs connectes">
              <CurrentsUsers />
            </Tooltip>
            <Tooltip text="Changer d'utilisateur" position="bottom" speechText="Changer d'utilisateur">
              <CurrentUser />
            </Tooltip>
            <Tooltip
              text="Ajouter"
              position="bottom"
              speechText="Ajouter un dossier ou un contact"
              disabled={addTooltipDisabled}
            >
              <DossierModifCreateForm />
            </Tooltip>

            <CloudSyncStatus />

            <Tooltip text="Messagerie" position="bottom" speechText="Messagerie">
              <button
                type="button"
                className={`chat-header-button${isChatOpen ? ' chat-header-button--open' : ''}`}
                onClick={onToggleChat}
                aria-label="Messagerie"
                aria-expanded={isChatOpen}
                aria-controls="kheops-chat-panel"
              >
                <svg
                  className="chat-header-button__icon"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
                {totalUnread > 0 && !isChatOpen && (
                  <span className="chat-header-button__badge" aria-label={`${totalUnread} message${totalUnread > 1 ? 's' : ''} non lu${totalUnread > 1 ? 's' : ''}`}>
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </button>
            </Tooltip>

            <div ref={notificationIconRef} className="notification-icon-wrapper">
              <Tooltip text="Notifications" position="bottom" speechText="Notifications">
                <NotificationsLogoComponent
                  onIconClick={handleToggleNotifications}
                  displayCount={badgeCount}
                />
              </Tooltip>
            </div>

            <Tooltip text="Mon compte" position="bottom" speechText="Mon compte">
              <MainUser />
            </Tooltip>
          </div>

          <NotificationsModal
            isOpen={isNotificationsModalOpen}
            position={modalPosition}
            onClose={() => dispatch(closeNotificationsModal())}
          />
        </>
      ) : (
        <p>Veuillez vous connecter</p>
      )}
    </div>
  );
};

export default Header;
