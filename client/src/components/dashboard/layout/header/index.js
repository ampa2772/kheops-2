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

const Header = () => {
  const isAuthenticated = useSelector((state) => state.login.isAuthenticated);
  const dispatch = useDispatch();

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